import {
    chromium,
    errors as playwrightErrors,
    type Browser,
} from 'playwright';

import type {
    BrowserRenderer,
    NetworkCaptureOptions,
    RenderOptions,
} from '../core/contracts/browser/browser-renderer.js';

import {
    BrowserRenderError,
} from '../core/contracts/browser/browser-render-error.js';

import type {
    RenderedPage,
} from '../core/contracts/browser/rendered-page.js';

import {
    NetworkEvidenceCollector,
} from './network-evidence-collector.js';


const DEFAULT_TIMEOUT_MS =
    30_000;


const DEFAULT_SETTLE_TIME_MS =
    250;


const DEFAULT_WAIT_UNTIL =
    'domcontentloaded' as const;


export class PlaywrightRenderer
implements BrowserRenderer {

    async render(
        url: string,
        options: RenderOptions = {},
    ): Promise<RenderedPage> {

        const timeoutMs =
            options.timeoutMs
            ?? DEFAULT_TIMEOUT_MS;


        const settleTimeMs =
            options.settleTimeMs
            ?? DEFAULT_SETTLE_TIME_MS;


        const waitUntil =
            options.waitUntil
            ?? DEFAULT_WAIT_UNTIL;


        const headless =
            options.headless
            ?? true;


        this.validateOptions(
            url,
            timeoutMs,
            settleTimeMs,
            options.network,
        );


        let browser:
            Browser
            | undefined;


        let networkCollector:
            NetworkEvidenceCollector
            | undefined;


        try {

            browser =
                await chromium.launch(
                    {
                        headless,
                    },
                );

        } catch (
            error
        ) {

            throw new BrowserRenderError(
                'BROWSER_LAUNCH_FAILED',
                url,
                `Unable to launch Chromium for ${url}.`,
                {
                    cause:
                        error,
                },
            );
        }


        let navigationCompleted =
            false;


        try {

            const context =
                await browser
                    .newContext();


            const page =
                await context
                    .newPage();


            /**
             * Attach BEFORE navigation.
             *
             * Otherwise early API responses
             * can be permanently missed.
             */
            networkCollector =
                new NetworkEvidenceCollector(
                    options.network,
                );


            networkCollector.attach(
                page,
            );


            await page.goto(
                url,
                {
                    timeout:
                        timeoutMs,

                    waitUntil,
                },
            );


            navigationCompleted =
                true;


            if (
                settleTimeMs > 0
            ) {

                await page.waitForTimeout(
                    settleTimeMs,
                );
            }


            /**
             * This snapshot defines the
             * evidence collection cutoff.
             *
             * We collect network activity up
             * to the same point at which the
             * DOM snapshot is taken.
             */
            const [
                html,
                title,
            ] =
                await Promise.all(
                    [
                        page.content(),
                        page.title(),
                    ],
                );


            const finalUrl =
                page.url();


            /**
             * Prevent new responses from
             * entering the evidence set after
             * the DOM snapshot.
             */
            networkCollector.stop();


            /**
             * Critical:
             * wait for response bodies already
             * being processed.
             */
            await networkCollector
                .drain();


            return {
                finalUrl,

                html,

                title:
                    title.length > 0
                        ? title
                        : undefined,

                networkResponses:
                    networkCollector
                        .getResponses(),

                networkCapture:
                    networkCollector
                        .getSummary(),
            };

        } catch (
            error
        ) {

            if (
                error
                instanceof
                BrowserRenderError
            ) {

                throw error;
            }


            if (
                error
                instanceof
                playwrightErrors.TimeoutError
            ) {

                throw new BrowserRenderError(
                    'TIMEOUT',
                    url,
                    `Browser rendering timed out for ${url} after ${timeoutMs} ms.`,
                    {
                        cause:
                            error,
                    },
                );
            }


            if (
                !navigationCompleted
            ) {

                throw new BrowserRenderError(
                    'NAVIGATION_FAILED',
                    url,
                    `Browser navigation failed for ${url}.`,
                    {
                        cause:
                            error,
                    },
                );
            }


            throw new BrowserRenderError(
                'RENDER_FAILED',
                url,
                `Browser rendering failed after navigation completed for ${url}.`,
                {
                    cause:
                        error,
                },
            );

        } finally {

            if (
                networkCollector
                !== undefined
            ) {

                networkCollector.stop();


                await networkCollector
                    .drain();
            }


            if (
                browser
                !== undefined
            ) {

                await browser
                    .close()
                    .catch(
                        () => {

                            /**
                             * Never mask the primary
                             * render error with cleanup
                             * failure.
                             */
                        },
                    );
            }
        }
    }


    private validateOptions(
        url:
            string,

        timeoutMs:
            number,

        settleTimeMs:
            number,

        network:
            NetworkCaptureOptions
            | undefined,
    ): void {

        if (
            !Number.isFinite(
                timeoutMs,
            )
            || timeoutMs <= 0
        ) {

            throw new BrowserRenderError(
                'INVALID_OPTIONS',
                url,
                'timeoutMs must be a finite number greater than zero.',
            );
        }


        if (
            !Number.isFinite(
                settleTimeMs,
            )
            || settleTimeMs < 0
        ) {

            throw new BrowserRenderError(
                'INVALID_OPTIONS',
                url,
                'settleTimeMs must be a finite number greater than or equal to zero.',
            );
        }


        if (
            network
            === undefined
        ) {

            return;
        }


        this.validateNonNegativeInteger(
            url,
            'network.maxResponses',
            network.maxResponses,
        );


        this.validateNonNegativeInteger(
            url,
            'network.maxBodyBytes',
            network.maxBodyBytes,
        );


        this.validateNonNegativeInteger(
            url,
            'network.maxTotalBodyBytes',
            network.maxTotalBodyBytes,
        );


        if (
            network.bodyReadTimeoutMs
            !== undefined
            && (
                !Number.isFinite(
                    network.bodyReadTimeoutMs,
                )
                || network.bodyReadTimeoutMs
                    <= 0
            )
        ) {

            throw new BrowserRenderError(
                'INVALID_OPTIONS',
                url,
                'network.bodyReadTimeoutMs must be greater than zero.',
            );
        }
    }


    private validateNonNegativeInteger(
        url:
            string,

        name:
            string,

        value:
            number
            | undefined,
    ): void {

        if (
            value
            === undefined
        ) {

            return;
        }


        if (
            !Number.isInteger(
                value,
            )
            || value < 0
        ) {

            throw new BrowserRenderError(
                'INVALID_OPTIONS',
                url,
                `${name} must be a non-negative integer.`,
            );
        }
    }
}
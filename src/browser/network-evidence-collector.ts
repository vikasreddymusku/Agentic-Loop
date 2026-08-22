import type {
    Page,
    Response,
} from 'playwright';

import type {
    NetworkCaptureOptions,
} from '../core/contracts/browser/browser-renderer.js';

import type {
    NetworkCaptureSummary,
} from '../core/contracts/browser/network-capture-summary.js';

import type {
    NetworkResourceType,
    NetworkResponse,
} from '../core/contracts/browser/network-response.js';

import {
    randomUUID,
} from 'node:crypto';


const DEFAULT_MAX_RESPONSES =
    200;


const DEFAULT_MAX_BODY_BYTES =
    1024 * 1024;


const DEFAULT_MAX_TOTAL_BODY_BYTES =
    4 * 1024 * 1024;


const DEFAULT_BODY_READ_TIMEOUT_MS =
    2_000;


const REDACTED_HEADER_VALUE =
    '[REDACTED]';


const BODY_READ_TIMEOUT =
    Symbol(
        'BODY_READ_TIMEOUT',
    );


type InternalEntry = {
    sequence: number;

    response:
        NetworkResponse;
};


export class NetworkEvidenceCollector {

    private readonly enabled:
        boolean;

    private readonly maxResponses:
        number;

    private readonly maxBodyBytes:
        number;

    private readonly maxTotalBodyBytes:
        number;

    private readonly bodyReadTimeoutMs:
        number;

    private readonly captureId =
        randomUUID();


    private page:
        Page
        | undefined;


    private sequence =
        0;


    /**
     * Reserved synchronously when the event
     * arrives so concurrent async body reads
     * cannot exceed maxResponses.
     */
    private reservedResponses =
        0;


    private observedResponses =
        0;


    private eligibleResponses =
        0;


    private capturedBodies =
        0;


    private capturedBodyBytes =
        0;


    private responseLimitReached =
        false;


    private readonly entries:
        InternalEntry[] =
        [];


    /**
     * Critical:
     *
     * Playwright does not await asynchronous
     * event listeners.
     *
     * We explicitly track every response task
     * and drain them before returning the
     * RenderedPage.
     */
    private readonly pending:
        Set<
            Promise<void>
        > =
        new Set();


    constructor(
        options:
            NetworkCaptureOptions
            = {},
    ) {

        this.enabled =
            options.enabled
            ?? true;


        this.maxResponses =
            options.maxResponses
            ?? DEFAULT_MAX_RESPONSES;


        this.maxBodyBytes =
            options.maxBodyBytes
            ?? DEFAULT_MAX_BODY_BYTES;


        this.maxTotalBodyBytes =
            options.maxTotalBodyBytes
            ?? DEFAULT_MAX_TOTAL_BODY_BYTES;


        this.bodyReadTimeoutMs =
            options.bodyReadTimeoutMs
            ?? DEFAULT_BODY_READ_TIMEOUT_MS;
    }


    attach(
        page:
            Page,
    ): void {

        if (
            !this.enabled
        ) {

            return;
        }


        if (
            this.page
            !== undefined
        ) {

            throw new Error(
                'NetworkEvidenceCollector is already attached.',
            );
        }


        this.page =
            page;


        page.on(
            'response',
            this.onResponse,
        );
    }


    stop(): void {

        if (
            this.page
            === undefined
        ) {

            return;
        }


        this.page.off(
            'response',
            this.onResponse,
        );


        this.page =
            undefined;
    }


    async drain(): Promise<void> {

        /**
         * Loop rather than taking only one
         * snapshot because one pending task
         * could cause another task to finish
         * while we are draining.
         */
        while (
            this.pending.size > 0
        ) {

            const current =
                [
                    ...this.pending,
                ];


            await Promise.allSettled(
                current,
            );
        }
    }


    getResponses():
        NetworkResponse[] {

        return this.entries
            .slice()
            .sort(
                (
                    left,
                    right,
                ) =>
                    left.sequence
                    - right.sequence,
            )
            .map(
                (
                    entry,
                ) =>
                    entry.response,
            );
    }


    getSummary():
        NetworkCaptureSummary {

        return {
            observedResponses:
                this.observedResponses,

            eligibleResponses:
                this.eligibleResponses,

            retainedResponses:
                this.entries.length,

            capturedBodies:
                this.capturedBodies,

            capturedBodyBytes:
                this.capturedBodyBytes,

            responseLimitReached:
                this.responseLimitReached,
        };
    }


    private readonly onResponse =
        (
            response:
                Response,
        ): void => {

            this.observedResponses +=
                1;


            const request =
                response.request();


            const resourceType =
                request.resourceType();


            if (
                resourceType !== 'xhr'
                && resourceType !== 'fetch'
            ) {

                return;
            }


            this.eligibleResponses +=
                1;


            if (
                this.reservedResponses
                >= this.maxResponses
            ) {

                this.responseLimitReached =
                    true;


                return;
            }


            this.reservedResponses +=
                1;


            const sequence =
                this.sequence;


            this.sequence +=
                1;


            /**
 * Identity is assigned immediately when the
 * response is observed, before asynchronous
 * body reading begins.
 */
const responseId =
    `${this.captureId}:${sequence}`;


let task:
    Promise<void>;


task =
    this.captureResponse(
        response,
        sequence,
        responseId,
        request.method(),
        resourceType,
    )
                    .catch(
                        () => {

                            /**
                             * Network evidence collection
                             * must never crash an otherwise
                             * successful browser render.
                             */
                        },
                    )
                    .finally(
                        () => {

                            this.pending.delete(
                                task,
                            );
                        },
                    );


            this.pending.add(
                task,
            );
        };


    private async captureResponse(
        response:
            Response,

        sequence:
            number,

        responseId:
            string,

        method:
            string,

        resourceType:
            NetworkResourceType,
    ): Promise<void> {

        const rawHeaders =
            await response
                .allHeaders()
                .catch(
                    () =>
                        (
                            {}
                        ),
                );


        const normalizedHeaders =
            this.normalizeHeaders(
                rawHeaders,
            );


        /**
         * Read classification information
         * BEFORE redacting stored headers.
         */
        const contentType =
            normalizedHeaders[
                'content-type'
            ];


        const contentLength =
            this.parseContentLength(
                normalizedHeaders[
                    'content-length'
                ],
            );


        const storedHeaders =
            this.redactSensitiveHeaders(
                normalizedHeaders,
            );


        const collected:
            NetworkResponse =
        {

            id:
                responseId,

            sequence,
            
            url:
                response.url(),

            status:
                response.status(),

            method,

            resourceType,

            headers:
                storedHeaders,
        };


        if (
            contentType
            !== undefined
        ) {

            collected.contentType =
                contentType;
        }


        if (
            contentLength
            !== undefined
        ) {

            collected.bodyBytes =
                contentLength;
        }


        if (
            contentType
            === undefined
        ) {

            collected.bodyOmittedReason =
                'UNKNOWN_CONTENT_TYPE';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        if (
            this.isStreamingContentType(
                contentType,
            )
        ) {

            collected.bodyOmittedReason =
                'STREAMING_RESPONSE';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        if (
            !this.isTextLikeContentType(
                contentType,
            )
        ) {

            collected.bodyOmittedReason =
                'NON_TEXT_CONTENT';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        /**
         * If Content-Length already proves
         * the body is oversized, do NOT ask
         * Playwright for the body at all.
         */
        if (
            contentLength
                !== undefined
            && contentLength
                > this.maxBodyBytes
        ) {

            collected.bodyOmittedReason =
                'BODY_TOO_LARGE';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        if (
            contentLength
                !== undefined
            && (
                this.capturedBodyBytes
                + contentLength
            )
                > this.maxTotalBodyBytes
        ) {

            collected.bodyOmittedReason =
                'TOTAL_BODY_BUDGET_EXCEEDED';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        const bodyResult =
            await this.readBodyWithTimeout(
                response,
            );


        if (
            bodyResult
            === BODY_READ_TIMEOUT
        ) {

            collected.bodyOmittedReason =
                'BODY_READ_TIMEOUT';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        if (
            bodyResult
            === undefined
        ) {

            collected.bodyOmittedReason =
                'BODY_UNAVAILABLE';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        const actualBodyBytes =
            bodyResult.byteLength;


        collected.bodyBytes =
            actualBodyBytes;


        /**
         * For responses without
         * Content-Length we only know the
         * real size after Playwright returns
         * the body.
         */
        if (
            actualBodyBytes
            > this.maxBodyBytes
        ) {

            collected.bodyOmittedReason =
                'BODY_TOO_LARGE';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        /**
         * Check the total budget again after
         * the asynchronous body read.
         *
         * This prevents concurrent response
         * tasks from collectively exceeding
         * the configured retained-body budget.
         */
        if (
            (
                this.capturedBodyBytes
                + actualBodyBytes
            )
            > this.maxTotalBodyBytes
        ) {

            collected.bodyOmittedReason =
                'TOTAL_BODY_BUDGET_EXCEEDED';


            this.pushEntry(
                sequence,
                collected,
            );


            return;
        }


        collected.body =
            bodyResult.toString(
                'utf8',
            );


        this.capturedBodies +=
            1;


        this.capturedBodyBytes +=
            actualBodyBytes;


        this.pushEntry(
            sequence,
            collected,
        );
    }


    private pushEntry(
        sequence:
            number,

        response:
            NetworkResponse,
    ): void {

        this.entries.push(
            {
                sequence,
                response,
            },
        );
    }


    private normalizeHeaders(
        headers:
            Record<
                string,
                string
            >,
    ):
        Record<
            string,
            string
        > {

        const normalized:
            Record<
                string,
                string
            > =
            {};


        for (
            const [
                key,
                value,
            ]
            of Object.entries(
                headers,
            )
        ) {

            normalized[
                key.toLowerCase()
            ] =
                value;
        }


        return normalized;
    }


    private redactSensitiveHeaders(
        headers:
            Record<
                string,
                string
            >,
    ):
        Record<
            string,
            string
        > {

        const result:
            Record<
                string,
                string
            > =
            {};


        for (
            const [
                key,
                value,
            ]
            of Object.entries(
                headers,
            )
        ) {

            result[
                key
            ] =
                this.isSensitiveHeaderName(
                    key,
                )
                    ? REDACTED_HEADER_VALUE
                    : value;
        }


        return result;
    }


    private isSensitiveHeaderName(
        name:
            string,
    ): boolean {

        return (
            /(?:^|[-_])(?:authorization|cookie|token|secret|api[-_]?key)(?:$|[-_])/iu
        )
            .test(
                name,
            );
    }


    private isStreamingContentType(
        contentType:
            string,
    ): boolean {

        return this
            .normalizeMediaType(
                contentType,
            )
            === 'text/event-stream';
    }


    private isTextLikeContentType(
        contentType:
            string,
    ): boolean {

        const mediaType =
            this.normalizeMediaType(
                contentType,
            );


        return (
            mediaType.startsWith(
                'text/',
            )
            || mediaType.includes(
                'json',
            )
            || mediaType.includes(
                'xml',
            )
            || mediaType.includes(
                'javascript',
            )
            || mediaType.includes(
                'graphql',
            )
        );
    }


    private normalizeMediaType(
        contentType:
            string,
    ): string {

        return (
            contentType
                .split(
                    ';',
                    1,
                )[0]
                ?.trim()
                .toLowerCase()
            ?? ''
        );
    }


    private parseContentLength(
        value:
            string
            | undefined,
    ):
        number
        | undefined {

        if (
            value
            === undefined
        ) {

            return undefined;
        }


        const parsed =
            Number.parseInt(
                value,
                10,
            );


        if (
            !Number.isFinite(
                parsed,
            )
            || parsed < 0
        ) {

            return undefined;
        }


        return parsed;
    }


    private async readBodyWithTimeout(
        response:
            Response,
    ):
        Promise<
            Buffer
            | typeof BODY_READ_TIMEOUT
            | undefined
        > {

        let timer:
            NodeJS.Timeout
            | undefined;


        try {

            const timeout =
                new Promise<
                    typeof BODY_READ_TIMEOUT
                >(
                    (
                        resolve,
                    ) => {

                        timer =
                            setTimeout(
                                () => {

                                    resolve(
                                        BODY_READ_TIMEOUT,
                                    );
                                },
                                this.bodyReadTimeoutMs,
                            );
                    },
                );


            const body =
                response
                    .body()
                    .catch(
                        () =>
                            undefined,
                    );


            return await Promise.race(
                [
                    body,
                    timeout,
                ],
            );

        } finally {

            if (
                timer
                !== undefined
            ) {

                clearTimeout(
                    timer,
                );
            }
        }
    }
}
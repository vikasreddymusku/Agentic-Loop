import type {
    RenderedPage,
} from './rendered-page.js';


export type BrowserWaitUntil =
    | 'load'
    | 'domcontentloaded'
    | 'networkidle'
    | 'commit';


export type NetworkCaptureOptions = {
    /**
     * Network collection is enabled by
     * default in Phase 13.
     */
    enabled?: boolean;

    /**
     * Maximum xhr/fetch response records
     * retained for one render.
     *
     * Default:
     * 200.
     */
    maxResponses?: number;

    /**
     * Maximum retained body size for one
     * response.
     *
     * Default:
     * 1 MiB.
     */
    maxBodyBytes?: number;

    /**
     * Maximum combined retained body size
     * across the entire page render.
     *
     * Default:
     * 4 MiB.
     */
    maxTotalBodyBytes?: number;

    /**
     * Maximum amount of time spent waiting
     * for an individual Playwright response
     * body.
     *
     * Important for streaming or problematic
     * responses.
     *
     * Default:
     * 2 seconds.
     */
    bodyReadTimeoutMs?: number;
};


export type RenderOptions = {
    timeoutMs?: number;

    waitUntil?:
        BrowserWaitUntil;

    settleTimeMs?: number;

    headless?: boolean;

    /**
     * Phase 13 browser-network evidence
     * policy.
     */
    network?:
        NetworkCaptureOptions;
};


export interface BrowserRenderer {

    render(
        url: string,
        options?: RenderOptions,
    ): Promise<RenderedPage>;
}
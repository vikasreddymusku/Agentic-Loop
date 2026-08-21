import type {
    NetworkCaptureSummary,
} from './network-capture-summary.js';

import type {
    NetworkResponse,
} from './network-response.js';


export type RenderedPage = {
    /**
     * Final browser URL after redirects
     * and browser-side navigation.
     */
    finalUrl: string;

    /**
     * Complete rendered DOM snapshot.
     */
    html: string;

    /**
     * Rendered document title.
     */
    title?: string;

    /**
     * Browser API/network evidence.
     *
     * Phase 13:
     * xhr + fetch responses only.
     */
    networkResponses:
        NetworkResponse[];

    /**
     * Diagnostics describing what the
     * network collector observed/retained.
     */
    networkCapture:
        NetworkCaptureSummary;
};
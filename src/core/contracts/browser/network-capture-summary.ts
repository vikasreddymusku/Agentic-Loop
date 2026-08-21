export type NetworkCaptureSummary = {
    /**
     * Every browser response observed,
     * including documents, images, fonts,
     * etc.
     */
    observedResponses: number;

    /**
     * Responses matching the Phase 13
     * resource policy: xhr/fetch.
     */
    eligibleResponses: number;

    /**
     * Eligible responses actually retained.
     */
    retainedResponses: number;

    /**
     * Bodies retained as text.
     */
    capturedBodies: number;

    /**
     * Total retained body bytes.
     */
    capturedBodyBytes: number;

    /**
     * True when eligible responses existed
     * beyond maxResponses.
     */
    responseLimitReached: boolean;
};
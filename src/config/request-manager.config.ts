export const REQUEST_MANAGER_CONFIG = {
    queueName: 'scrape-jobs',

    /**
     * Number of normal retries before we consider
     * the request permanently failed.
     *
     * Access-specific retries such as 429 will later
     * be handled by the Access Controller.
     */
    maxRetries: 3,

    /**
     * Requests for the same URL arriving during this
     * period are considered duplicates.
     *
     * After this window expires, the URL may be
     * scraped again.
     */
    deduplicationWindowMs: 30_000,
} as const;
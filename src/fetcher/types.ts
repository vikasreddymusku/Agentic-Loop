export type FastFetcherConfig = {
    /**
     * Maximum total HTTP request duration.
     */
    timeoutMs: number;

    /**
     * Maximum number of decompressed response bytes
     * retained in memory.
     */
    maxBodySizeBytes: number;

    /**
     * Maximum HTTP redirects.
     */
    maxRedirects: number;
};
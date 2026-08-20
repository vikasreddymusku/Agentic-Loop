export type FetchHeaders =
    Record<string, string | string[]>;

export type TransportErrorType =
    | 'TIMEOUT'
    | 'DNS_ERROR'
    | 'TLS_ERROR'
    | 'CONNECTION_ERROR'
    | 'OTHER';

export type TransportError = {
    type: TransportErrorType;
    code?: string;
    message: string;
};

export type FetchEnvelope = {
    requestedUrl: string;
    finalUrl: string;
    redirects: string[];

    /**
     * 0 means no HTTP response was obtained.
     */
    statusCode: number;

    headers: FetchHeaders;

    rawBody: Buffer | string | null;

    /**
     * Number of bytes we actually retained.
     */
    bodyBytes: number;

    /**
     * True only when WE intentionally stopped
     * because maxBodySizeBytes was exceeded.
     */
    bodyTruncated: boolean;

    /**
     * Informational value from Content-Length.
     */
    originalContentLength?: number;

    fetchDurationMs: number;

    /**
     * Failure before an HTTP response was obtained.
     *
     * Normally paired with statusCode === 0.
     */
    transportError?: TransportError;

    /**
     * Failure while consuming the response body
     * after status/headers were already received.
     */
    bodyError?: TransportError;
};
export type NetworkResourceType =
    | 'xhr'
    | 'fetch';


export type NetworkBodyOmissionReason =
    | 'NON_TEXT_CONTENT'
    | 'UNKNOWN_CONTENT_TYPE'
    | 'STREAMING_RESPONSE'
    | 'BODY_TOO_LARGE'
    | 'TOTAL_BODY_BUDGET_EXCEEDED'
    | 'BODY_UNAVAILABLE'
    | 'BODY_READ_TIMEOUT';


export type NetworkResponse = {
    /**
     * Response URL.
     */
    url: string;

    /**
     * HTTP response status.
     */
    status: number;

    /**
     * HTTP request method which produced
     * this response.
     */
    method: string;

    /**
     * Phase 13 only retains API-oriented
     * browser requests.
     */
    resourceType:
        NetworkResourceType;

    /**
     * Header names are normalized to
     * lowercase.
     *
     * Sensitive header values are redacted.
     */
    headers:
        Record<
            string,
            string
        >;

    /**
     * Original Content-Type header when
     * available.
     */
    contentType?: string;

    /**
     * Known body size.
     *
     * When Content-Length is available this
     * may be known without reading the body.
     */
    bodyBytes?: number;

    /**
     * Textual response body.
     *
     * Binary bodies are intentionally never
     * retained.
     */
    body?: string;

    /**
     * Explains why an otherwise eligible
     * response did not retain its body.
     */
    bodyOmittedReason?:
        NetworkBodyOmissionReason;
};
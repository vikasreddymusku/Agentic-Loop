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
     * Globally unique identity for this exact
     * captured network-response instance.
     *
     * This must not contain URL, headers,
     * body data, or other sensitive values.
     */
    id:
        string;

    /**
     * Zero-based observation order among the
     * eligible XHR/fetch responses captured by
     * this NetworkEvidenceCollector instance.
     *
     * This represents observation order, not
     * asynchronous body-read completion order.
     */
    sequence:
        number;

    url:
        string;

    status:
        number;

    method:
        string;

    resourceType:
        NetworkResourceType;

    headers:
        Record<string, string>;

    contentType?:
        string;

    bodyBytes?:
        number;

    body?:
        string;

    bodyOmittedReason?:
        NetworkBodyOmissionReason;
};
export type RequestedFieldType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'array';


export type RequestedField = {

    name:
        string;

    type:
        RequestedFieldType;

    description?:
        string;

    aliases?:
        string[];

    paths?:
        string[];

    required?:
        boolean;
};

export type ScrapeJobMetadata = 
    Record<string, unknown>;

/**
 * @deprecated
 *
 * Temporary Step 1B compatibility type.
 * Remove after the migration is verified and
 * no references remain.
 */
export type ScrapeField =
    | 'businessName'
    | 'address'
    | 'phone'
    | 'email'
    | 'website'
    | 'rating';


export type ScrapeJob = {

    id:
        string;

    url:
        string;

    /**
     * Universal dynamic output schema.
     *
     * Must contain at least one field.
     */
    requestedFields:
        RequestedField[];

    maxRetries?:
        number;

    priority?:
        number;

    metadata?:
        ScrapeJobMetadata;

    createdAt:
        string;
};
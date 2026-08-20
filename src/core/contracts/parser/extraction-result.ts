import type {
    FieldExtraction,
} from './field-extraction.js';


export type ParserStatus =
    | 'PARSED'
    | 'PARTIAL'
    | 'NO_DATA';


export type ExtractionWarning = {

    extractorId:
        string;

    code:
        string;

    message:
        string;
};


/**
 * Final output of the future ParserOrchestrator.
 *
 * Still extraction-only:
 *
 * - no normalization
 * - no validation
 * - no SUCCESS lifecycle
 */
export type ExtractionResult = {

    jobId:
        string;

    status:
        ParserStatus;

    /**
     * Dynamic requested field name → candidates.
     *
     * Examples:
     *
     * candidates.jobTitle
     * candidates.price
     * candidates.author
     */
    candidates:
        Record<
            string,
            FieldExtraction[]
        >;

    /**
     * Dynamic requested field names with no
     * matched candidates.
     */
    missingFields:
        string[];

    warnings:
        ExtractionWarning[];
};
import type {
    ExtractionValue,
} from './extraction-value.js';

import type {
    FieldEvidence,
} from './field-evidence.js';


/**
 * Runtime invariant:
 *
 * 0 <= confidence <= 1
 *
 * TypeScript cannot enforce that numeric range.
 */
export type ConfidenceScore =
    number;


/**
 * Candidate mapped to a user-requested dynamic
 * output field.
 */
export type FieldExtraction = {

    /**
     * Requested output field name.
     *
     * Examples:
     *
     * jobTitle
     * price
     * productName
     * author
     *
     *  This field name is dynamic.
     */
    field:
        string;

    value:
        ExtractionValue;

    confidence:
        ConfidenceScore;

    evidence:
        FieldEvidence;
};
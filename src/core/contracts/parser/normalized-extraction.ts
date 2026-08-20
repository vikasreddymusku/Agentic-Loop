import type {
    ExtractionWarning,
} from './extraction-result.js';

import type {
    ExtractionValue,
} from './extraction-value.js';

import type {
    FieldEvidence,
} from './field-evidence.js';

import type {
    RequestedFieldType,
} from '../scrape-job.js';


/**
 * A field after deterministic type normalization.
 *
 * Example:
 *
 * originalValue: '24999'
 * value: 24999
 * type: 'number'
 *
 * This is still PRE-validation.
 */
export type NormalizedField = {

    field:
        string;

    /**
     * Type requested by the user.
     */
    type:
        RequestedFieldType;

    /**
     * Value before normalization.
     *
     * Keeping this is useful for debugging,
     * validation and future self-healing.
     */
    originalValue:
        ExtractionValue;

    /**
     * Value after deterministic normalization.
     */
    value:
        ExtractionValue;

    confidence:
        number;

    evidence:
        FieldEvidence;
};


export type NormalizationIssueCode =
    | 'TYPE_CONVERSION_FAILED'
    | 'UNSUPPORTED_VALUE';


export type NormalizationIssue = {

    field:
        string;

    code:
        NormalizationIssueCode;

    message:
        string;

    originalValue:
        ExtractionValue;

    expectedType:
        RequestedFieldType;
};


/**
 * Output of the Normalizer.
 *
 * It does NOT determine final scrape validity.
 * Validator owns that responsibility.
 */
export type NormalizedExtraction = {

    jobId:
        string;

    normalized:
        Record<
            string,
            NormalizedField
        >;

    /**
     * Fields that were already missing before
     * normalization.
     */
    missingFields:
        string[];

    /**
     * Fields that had a resolved candidate but could
     * not be safely converted to the requested type.
     */
    issues:
        NormalizationIssue[];

    /**
     * Preserve extractor/parser warnings.
     */
    warnings:
        ExtractionWarning[];
};
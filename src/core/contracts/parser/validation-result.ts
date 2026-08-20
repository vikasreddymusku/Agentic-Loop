import type {
    ExtractionValue,
} from './extraction-value.js';

import type {
    ExtractionWarning,
} from './extraction-result.js';

import type {
    NormalizationIssueCode,
    NormalizedField,
} from './normalized-extraction.js';

import type {
    RequestedFieldType,
} from '../scrape-job.js';


export type ValidationStatus =
    | 'VALID'
    | 'PARTIAL'
    | 'INVALID';


export type ValidationIssueCode =
    | 'MISSING_REQUIRED_FIELD'
    | 'NORMALIZATION_FAILED'
    | 'TYPE_MISMATCH';


export type ValidationIssue = {

    field:
        string;

    code:
        ValidationIssueCode;

    message:
        string;

    /**
     * Included when validation concerns
     * the requested field type.
     */
    expectedType?:
        RequestedFieldType;

    /**
     * Preserves the problematic value when one
     * actually existed.
     */
    actualValue?:
        ExtractionValue;

    /**
     * When this validation failure originated
     * in Normalizer, preserve its precise reason.
     */
    normalizationIssueCode?:
        NormalizationIssueCode;
};


export type ValidationResult = {

    jobId:
        string;

    status:
        ValidationStatus;

    /**
     * Successfully validated normalized fields.
     *
     * Validator must not transform their values.
     */
    validated:
        Record<
            string,
            NormalizedField
        >;

    /**
     * Requested fields that passed validation.
     */
    validFields:
        string[];

    /**
     * Fields that existed upstream but failed
     * normalization or defensive type validation.
     */
    invalidFields:
        string[];

    /**
     * Fields for which extraction/matching produced
     * no candidate.
     */
    missingFields:
        string[];

    issues:
        ValidationIssue[];

    /**
     * Preserve parser/extractor warnings.
     */
    warnings:
        ExtractionWarning[];
};
import type {
    ExtractionWarning,
} from './extraction-result.js';

import type {
    ExtractionValue,
} from './extraction-value.js';

import type {
    FieldEvidence,
} from './field-evidence.js';


/**
 * One final candidate selected by FieldResolver
 * for a requested field.
 *
 * This is still PRE-normalization.
 *
 * Example:
 *
 * price:
 * {
 *   field: 'price',
 *   value: '24999',
 *   confidence: 0.98,
 *   evidence: {...}
 * }
 *
 * Normalizer may later convert '24999' -> 24999.
 */
export type ResolvedField = {

    field:
        string;

    value:
        ExtractionValue;

    /**
     * Confidence of the candidate selected by
     * FieldResolver.
     *
     * Runtime invariant:
     *
     * 0 <= confidence <= 1
     */
    confidence:
        number;

    /**
     * Preserve provenance of the winning candidate.
     */
    evidence:
        FieldEvidence;
};


/**
 * Output of FieldResolver.
 *
 * FieldResolver chooses one candidate per field.
 *
 * It does NOT:
 *
 * - normalize values
 * - validate requested types
 * - decide final scrape SUCCESS
 */
export type ResolvedExtraction = {

    jobId:
        string;

    /**
     * Requested field name -> selected candidate.
     *
     * Only successfully resolved fields appear here.
     */
    resolved:
        Record<
            string,
            ResolvedField
        >;

    /**
     * Requested fields that had no candidates.
     */
    missingFields:
        string[];

    /**
     * Parser/extractor warnings are preserved for
     * downstream diagnostics.
     */
    warnings:
        ExtractionWarning[];
};
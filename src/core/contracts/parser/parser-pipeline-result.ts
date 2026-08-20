import type {
    ExtractionResult,
} from './extraction-result.js';

import type {
    NormalizedExtraction,
} from './normalized-extraction.js';

import type {
    ResolvedExtraction,
} from './resolved-extraction.js';

import type {
    ValidationResult,
} from './validation-result.js';


/**
 * Complete deterministic parser pipeline output.
 *
 * Intermediate stages are intentionally preserved.
 *
 * This will later support:
 *
 * - monitoring
 * - diagnostics
 * - self-healing classification
 * - debugging
 */
export type ParserPipelineResult = {

    jobId:
        string;

    extraction:
        ExtractionResult;

    resolved:
        ResolvedExtraction;

    normalized:
        NormalizedExtraction;

    validation:
        ValidationResult;
};
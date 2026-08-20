import type {
    ExtractionResult,
} from './extraction-result.js';

import type {
    ResolvedExtraction,
} from './resolved-extraction.js';


/**
 * Selects one winning candidate for each field.
 *
 * Input:
 *
 * ExtractionResult.candidates
 *
 * Output:
 *
 * one ResolvedField per successfully matched field.
 */
export interface FieldResolver {

    resolve(
        result:
            ExtractionResult,
    ): ResolvedExtraction;
}
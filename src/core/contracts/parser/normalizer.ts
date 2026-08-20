import type {
    RequestedField,
} from '../scrape-job.js';

import type {
    NormalizedExtraction,
} from './normalized-extraction.js';

import type {
    ResolvedExtraction,
} from './resolved-extraction.js';


export type NormalizerInput = {

    /**
     * Requested schema determines the target type.
     *
     * Normalizer must never infer the desired type
     * solely from the extracted value.
     */
    requestedFields:
        readonly RequestedField[];

    extraction:
        ResolvedExtraction;
};


export interface Normalizer {

    normalize(
        input:
            NormalizerInput,
    ): NormalizedExtraction;
}
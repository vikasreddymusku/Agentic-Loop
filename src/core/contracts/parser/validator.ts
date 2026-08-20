import type {
    RequestedField,
} from '../scrape-job.js';

import type {
    NormalizedExtraction,
} from './normalized-extraction.js';

import type {
    ValidationResult,
} from './validation-result.js';


export type ValidatorInput = {

    /**
     * Requested schema remains authoritative.
     */
    requestedFields:
        readonly RequestedField[];

    extraction:
        NormalizedExtraction;
};


export interface Validator {

    validate(
        input:
            ValidatorInput,
    ): ValidationResult;
}
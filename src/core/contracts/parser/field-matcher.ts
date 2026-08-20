import type {
    RequestedField,
} from '../scrape-job.js';

import type {
    DiscoveredProperty,
} from './discovered-property.js';

import type {
    FieldExtraction,
} from './field-extraction.js';


/**
 * Maps raw discovered properties to the
 * dynamic fields requested by the user.
 *
 * Implementation comes later.
 */
export interface FieldMatcher {

    match(
        requestedFields:
            RequestedField[],

        discovered:
            DiscoveredProperty[],
    ): FieldExtraction[];
}
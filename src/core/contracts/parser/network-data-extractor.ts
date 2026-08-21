import type {
    NetworkResponse,
} from '../browser/network-response.js';

import type {
    NetworkExtractionResult,
} from './network-extraction-result.js';


/**
 * Converts already-captured browser network
 * evidence into field-agnostic discovered
 * properties.
 *
 * Important:
 *
 * This interface does NOT:
 *
 * - perform browser requests
 * - replay API requests
 * - know requested fields
 * - match fields
 * - validate fields
 * - contain website-specific logic
 */
export interface NetworkDataExtractor {

    /**
     * Stable identifier written into
     * DiscoveredProperty.extractorId.
     */
    readonly id:
        string;


    /**
     * Inspect already-captured network
     * responses and discover structured
     * properties from their retained bodies.
     *
     * Synchronous by design:
     * Phase 13 has already collected the
     * response bodies, so Phase 14 performs
     * only deterministic in-memory analysis.
     */
    extract(
        responses:
            readonly NetworkResponse[],
    ): NetworkExtractionResult;
}
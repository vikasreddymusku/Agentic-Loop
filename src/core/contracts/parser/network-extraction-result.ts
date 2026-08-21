import type {
    DiscoveredProperty,
} from './discovered-property.js';

import type {
    ExtractionWarning,
} from './extraction-result.js';


/**
 * Result produced by a network/API
 * evidence extractor.
 *
 * This contract intentionally mirrors the
 * normal deterministic extraction result:
 *
 * - discovered data
 * - non-fatal extraction warnings
 *
 * No matching, resolving, validation, or
 * requested-field logic belongs here.
 */
export type NetworkExtractionResult = {
    /**
     * Field-agnostic properties discovered
     * across captured browser network
     * responses.
     */
    discovered:
        DiscoveredProperty[];

    /**
     * Non-fatal issues encountered while
     * inspecting network payloads.
     *
     * Examples later:
     * - malformed structured payload
     * - traversal limit reached
     * - unsupported structured shape
     *
     * Phase 14A defines only the contract.
     */
    warnings:
        ExtractionWarning[];
};
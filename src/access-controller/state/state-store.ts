// src/access-controller/state/state-store.ts

import type {
    AccessReason,
} from '../../core/contracts/access-evaluation.js';


/**
 * Mutable domain-level access state.
 *
 * Initial implementation:
 * MemoryStateStore
 *
 * Future:
 * RedisStateStore / database-backed store
 */
export type DomainAccessState = {

    consecutiveRateLimits: number;

    consecutiveFailures: number;

    /**
     * ISO-8601 timestamp.
     *
     * If present and still in the future,
     * preflight() may return RETRY_LATER.
     */
    cooldownUntil?: string;

    lastReason?: AccessReason;

    updatedAt: string;
};


export interface AccessStateStore {

    getDomainState(
        domain: string,
    ): Promise<DomainAccessState | null>;


    setDomainState(
        domain: string,
        state: DomainAccessState,
    ): Promise<void>;


    clearDomainState(
        domain: string,
    ): Promise<void>;
}
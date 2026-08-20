// src/access-controller/state/memory-state.store.ts

import type {
    AccessStateStore,
    DomainAccessState,
} from './state-store.js';


/**
 * Development / single-process implementation
 * of AccessStateStore.
 *
 * Future implementations may use:
 *
 * Redis
 * PostgreSQL
 * another distributed state service
 *
 * without changing AccessController.
 */
export class MemoryStateStore
implements AccessStateStore {

    private readonly states =
        new Map<
            string,
            DomainAccessState
        >();


    async getDomainState(
        domain: string,
    ): Promise<DomainAccessState | null> {

        const key =
            this.normalizeDomain(
                domain,
            );


        const state =
            this.states.get(
                key,
            );


        if (
            state === undefined
        ) {

            return null;
        }


        /**
         * Return a copy rather than our stored
         * reference.
         *
         * Otherwise external code could accidentally
         * mutate state without calling setDomainState.
         */
        return {
            ...state,
        };
    }


    async setDomainState(
        domain: string,
        state: DomainAccessState,
    ): Promise<void> {

        const key =
            this.normalizeDomain(
                domain,
            );


        /**
         * Store a copy for the same reason we return
         * copies from getDomainState().
         */
        this.states.set(
            key,
            {
                ...state,
            },
        );
    }


    async clearDomainState(
        domain: string,
    ): Promise<void> {

        const key =
            this.normalizeDomain(
                domain,
            );


        this.states.delete(
            key,
        );
    }


    private normalizeDomain(
        domain: string,
    ): string {

        const normalized =
            domain
                .trim()
                .toLowerCase();


        if (
            normalized.length === 0
        ) {

            throw new Error(
                'Domain cannot be empty.',
            );
        }


        return normalized;
    }
}
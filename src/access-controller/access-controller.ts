import type {
    AccessEvaluation,
    AccessReason,
    RetryableAccessReason,
} from '../core/contracts/access-evaluation.js';

import type {
    FetchEnvelope,
} from '../core/contracts/fetch-envelope.js';

import type {
    ScrapeJob,
} from '../core/contracts/scrape-job.js';

import {
    getDomain,
} from '../core/utils/url.js';

import type {
    AccessConfig,
} from '../config/access.config.js';

import type {
    AccessStateStore,
} from './state/state-store.js';

import type {
    AccessDetector,
    AccessPolicy,
    IAccessController,
    SignalResolver,
} from './types.js';


export type AccessControllerDependencies = {

    /**
     * Injectable clock for deterministic tests.
     */
    now?: () => number;
};


export class AccessController
implements IAccessController {

    private readonly now:
        () => number;


    constructor(
        private readonly config: AccessConfig,

        private readonly detectors:
            readonly AccessDetector[],

        private readonly resolver:
            SignalResolver,

        private readonly policies:
            readonly AccessPolicy[],

        private readonly stateStore:
            AccessStateStore,

        dependencies:
            AccessControllerDependencies = {},
    ) {

        this.now =
            dependencies.now
            ?? Date.now;
    }


    /**
     * Checks known access state before another
     * network request is made.
     *
     * Current responsibility:
     *
     * - active domain cooldown
     *
     * Robots/permanent restrictions will require
     * richer stored policy state later.
     */
    async preflight(
        job: ScrapeJob,
    ): Promise<AccessEvaluation> {

        const domain =
            getDomain(
                job.url,
            );


        const state =
            await this.stateStore
                .getDomainState(
                    domain,
                );


        if (
            state === null
            || state.cooldownUntil
                === undefined
        ) {

            return {
                decision:
                    'ALLOW',
            };
        }


        const cooldownUntilMs =
            Date.parse(
                state.cooldownUntil,
            );


        if (
            !Number.isFinite(
                cooldownUntilMs,
            )
        ) {

            throw new Error(
                `Invalid cooldownUntil for domain ${domain}`,
            );
        }


        const nowMs =
            this.now();


        if (
            !Number.isFinite(
                nowMs,
            )
        ) {

            throw new Error(
                'AccessController clock returned a non-finite timestamp.',
            );
        }


        if (
            cooldownUntilMs
            <= nowMs
        ) {

            return {
                decision:
                    'ALLOW',
            };
        }


        if (
            !this.isRetryableReason(
                state.lastReason,
            )
        ) {

            /**
             * A cooldown should only have been
             * created by a retryable policy.
             *
             * Anything else indicates corrupted or
             * inconsistent state.
             */
            throw new Error(
                `Domain ${domain} has an active cooldown without a retryable reason.`,
            );
        }


        return {
            decision:
                'RETRY_LATER',

            reason:
                state.lastReason,

            retryAfterMs:
                Math.max(
                    0,
                    Math.ceil(
                        cooldownUntilMs
                        - nowMs,
                    ),
                ),

            message:
                `Domain cooldown is active until ${state.cooldownUntil}.`,
        };
    }


    /**
     * Evaluate a completed FastFetcher transaction.
     */
    async evaluate(
        job: ScrapeJob,
        envelope: FetchEnvelope,
    ): Promise<AccessEvaluation> {

        const signals =
            this.detectors
                .flatMap(
                    detector =>
                        detector.detect(
                            envelope,
                        ),
                );


        const resolvedSignal =
            this.resolver
                .resolve(
                    signals,
                );


        /**
         * No access problem detected.
         *
         * This means network/access succeeded.
         *
         * It does NOT mean parsing or extraction
         * succeeded.
         */
        if (
            resolvedSignal === null
        ) {

            await this.resetSuccessfulAccessState(
                job,
            );


            return {
                decision:
                    'ALLOW',
            };
        }


        const matchingPolicies =
            this.policies
                .filter(
                    policy =>
                        policy.supports(
                            resolvedSignal,
                        ),
                );


        /**
         * Never silently ALLOW an access failure
         * simply because configuration forgot to
         * register its policy.
         */
        if (
            matchingPolicies.length === 0
        ) {

            throw new Error(
                `No AccessPolicy supports resolved reason: ${resolvedSignal.reason}`,
            );
        }


        /**
         * Policy categories should remain mutually
         * exclusive.
         *
         * Multiple matches indicate configuration
         * or contract ambiguity.
         */
        if (
            matchingPolicies.length > 1
        ) {

            throw new Error(
                `Multiple AccessPolicies support resolved reason: ${resolvedSignal.reason}`,
            );
        }


        const policy =
            matchingPolicies[0];


        if (
            policy === undefined
        ) {

            throw new Error(
                'AccessPolicy resolution failed unexpectedly.',
            );
        }


        const evaluation =
            await policy.evaluate(
                resolvedSignal,
                {
                    job,
                    envelope,
                    config:
                        this.config,
                    stateStore:
                        this.stateStore,
                },
            );


        /**
         * Future policies may theoretically return
         * ALLOW after additional inspection.
         *
         * If so, successful access should clear
         * transient access history as well.
         */
        if (
            evaluation.decision
            === 'ALLOW'
        ) {

            await this.resetSuccessfulAccessState(
                job,
            );
        }


        return evaluation;
    }


    /**
     * At the current stage DomainAccessState holds
     * only retry/rate-limit history.
     *
     * Therefore complete removal is safe.
     *
     * If permanent access rules are later added to
     * DomainAccessState, replace this with a
     * narrower resetTransientState() operation.
     */
    private async resetSuccessfulAccessState(
        job: ScrapeJob,
    ): Promise<void> {

        const domain =
            getDomain(
                job.url,
            );


        await this.stateStore
            .clearDomainState(
                domain,
            );
    }


    private isRetryableReason(
        reason:
            AccessReason | undefined,
    ): reason is RetryableAccessReason {

        return (
            reason === 'RATE_LIMITED'
            || reason === 'SITE_UNAVAILABLE'
            || reason === 'TIMEOUT'
            || reason === 'DNS_ERROR'
            || reason === 'CONNECTION_ERROR'
        );
    }
}
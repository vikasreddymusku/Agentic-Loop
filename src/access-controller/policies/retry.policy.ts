// src/access-controller/policies/retry.policy.ts

import type {
    AccessEvaluation,
    RetryableAccessReason,
} from '../../core/contracts/access-evaluation.js';

import {
    getDomain,
} from '../../core/utils/url.js';

import {
    parseRetryAfter,
} from '../../core/utils/retry-after.js';

import type {
    DomainAccessState,
} from '../state/state-store.js';

import type {
    AccessPolicy,
    AccessPolicyContext,
    AccessSignal,
} from '../types.js';


type RetryPolicyReason =
    | 'TIMEOUT'
    | 'DNS_ERROR'
    | 'CONNECTION_ERROR'
    | 'SITE_UNAVAILABLE';


export type RetryPolicyDependencies = {

    /**
     * Injectable clock for deterministic tests.
     */
    now?: () => number;


    /**
     * Injectable random source for deterministic
     * jitter tests.
     */
    random?: () => number;
};


export class RetryPolicy
implements AccessPolicy {

    private readonly now:
        () => number;

    private readonly random:
        () => number;


    constructor(
        dependencies:
            RetryPolicyDependencies = {},
    ) {

        this.now =
            dependencies.now
            ?? Date.now;

        this.random =
            dependencies.random
            ?? Math.random;
    }


    supports(
        signal: AccessSignal,
    ): boolean {

        return (
            signal.reason === 'TIMEOUT'
            || signal.reason === 'DNS_ERROR'
            || signal.reason === 'CONNECTION_ERROR'
            || signal.reason === 'SITE_UNAVAILABLE'
        );
    }


    async evaluate(
        signal: AccessSignal,
        context: AccessPolicyContext,
    ): Promise<AccessEvaluation> {

        if (
            !this.supports(
                signal,
            )
        ) {

            throw new Error(
                `RetryPolicy does not support reason: ${signal.reason}`,
            );
        }


        const reason =
            signal.reason as RetryPolicyReason;


        const {
            job,
            envelope,
            config,
            stateStore,
        } = context;


        this.validateConfig(
            context,
        );


        const nowMs =
            this.now();


        if (
            !Number.isFinite(
                nowMs,
            )
        ) {

            throw new Error(
                'RetryPolicy clock returned a non-finite timestamp.',
            );
        }


        const domain =
            getDomain(
                job.url,
            );


        const previousState =
            await stateStore
                .getDomainState(
                    domain,
                );


        const state =
            this.createState(
                previousState,
                nowMs,
            );


        const previousFailures =
            this.normalizeCounter(
                state
                    .consecutiveFailures,
            );


        /**
         * Reason-specific starting delay.
         */
        const baseDelayMs =
            this.getBaseDelay(
                reason,
                context,
            );


        /**
         * Exponential transient-error backoff.
         *
         * First transient failure:
         *
         * base * multiplier^0
         *
         * Second:
         *
         * base * multiplier^1
         */
        const backoffDelayMs =
            this.calculateBackoff(
                baseDelayMs,
                config
                    .transientErrors
                    .backoffMultiplier,
                previousFailures,
                config
                    .transientErrors
                    .maxRetryAfterMs,
            );


        /**
         * Retry-After is primarily useful for an
         * HTTP response such as 503.
         *
         * Transport failures normally have no
         * HTTP headers, in which case this simply
         * returns undefined.
         */
        const serverRetryAfterMs =
            config
                .transientErrors
                .respectRetryAfterHeader

                ? parseRetryAfter(
                    envelope
                        .headers[
                            'retry-after'
                        ],
                    nowMs,
                )

                : undefined;


        /**
         * Never retry earlier than either:
         *
         * - our transient backoff
         * - server Retry-After
         */
        const baseRetryDelayMs =
            Math.max(
                backoffDelayMs,
                serverRetryAfterMs
                    ?? 0,
            );


        let retryAfterMs =
            this.applyJitter(
                baseRetryDelayMs,
                config
                    .transientErrors
                    .jitterRatio,
            );


        /**
         * Negative jitter must never cause a retry
         * earlier than a valid server Retry-After.
         */
        if (
            serverRetryAfterMs
            !== undefined
        ) {

            retryAfterMs =
                Math.max(
                    retryAfterMs,
                    serverRetryAfterMs,
                );
        }


        /**
         * Our locally generated transient backoff
         * is bounded by maxRetryAfterMs.
         *
         * But if the server explicitly asks us to
         * wait longer, we do not shorten that value.
         */
        if (
            serverRetryAfterMs
                === undefined
            || serverRetryAfterMs
                <= config
                    .transientErrors
                    .maxRetryAfterMs
        ) {

            retryAfterMs =
                Math.min(
                    retryAfterMs,
                    config
                        .transientErrors
                        .maxRetryAfterMs,
                );

        } else {

            retryAfterMs =
                Math.max(
                    retryAfterMs,
                    serverRetryAfterMs,
                );
        }


        retryAfterMs =
            Math.max(
                0,
                Math.round(
                    retryAfterMs,
                ),
            );


        /**
         * Only transient failure history changes.
         *
         * consecutiveRateLimits remains untouched.
         */
        state.consecutiveFailures =
            previousFailures + 1;


        state.lastReason =
            reason;


        state.cooldownUntil =
            new Date(
                nowMs
                + retryAfterMs,
            ).toISOString();


        state.updatedAt =
            new Date(
                nowMs,
            ).toISOString();


        await stateStore
            .setDomainState(
                domain,
                state,
            );


        return {
            decision:
                'RETRY_LATER',

            reason:
                reason as RetryableAccessReason,

            retryAfterMs,

            message:
                this.createMessage(
                    reason,
                    retryAfterMs,
                ),
        };
    }


    private getBaseDelay(
        reason: RetryPolicyReason,
        context: AccessPolicyContext,
    ): number {

        const config =
            context
                .config
                .transientErrors;


        switch (
            reason
        ) {

            case 'TIMEOUT':

                return config
                    .timeoutRetryMs;


            case 'DNS_ERROR':

                return config
                    .dnsRetryMs;


            case 'CONNECTION_ERROR':

                return config
                    .connectionRetryMs;


            case 'SITE_UNAVAILABLE':

                return config
                    .siteUnavailableRetryMs;


            default:

                return this.assertNever(
                    reason,
                );
        }
    }


    private calculateBackoff(
        baseDelayMs: number,
        multiplier: number,
        consecutiveFailures: number,
        maximumDelayMs: number,
    ): number {

        const calculated =
            baseDelayMs
            * Math.pow(
                multiplier,
                consecutiveFailures,
            );


        if (
            !Number.isFinite(
                calculated,
            )
        ) {

            return maximumDelayMs;
        }


        return Math.min(
            calculated,
            maximumDelayMs,
        );
    }


    /**
     * Symmetric jitter.
     *
     * Example:
     *
     * jitterRatio = 0.15
     *
     * range:
     *
     * -15% ... +15%
     */
    private applyJitter(
        delayMs: number,
        jitterRatio: number,
    ): number {

        if (
            delayMs <= 0
            || jitterRatio === 0
        ) {

            return delayMs;
        }


        const randomValue =
            Math.min(
                1,
                Math.max(
                    0,
                    this.random(),
                ),
            );


        const normalizedRandom =
            randomValue * 2 - 1;


        const jitter =
            delayMs
            * jitterRatio
            * normalizedRandom;


        return Math.max(
            0,
            delayMs + jitter,
        );
    }


    private createState(
        existing:
            DomainAccessState | null,

        nowMs: number,
    ): DomainAccessState {

        if (
            existing
        ) {

            return {
                ...existing,
            };
        }


        return {
            consecutiveRateLimits:
                0,

            consecutiveFailures:
                0,

            updatedAt:
                new Date(
                    nowMs,
                ).toISOString(),
        };
    }


    private normalizeCounter(
        value: number,
    ): number {

        if (
            !Number.isSafeInteger(
                value,
            )
            || value < 0
        ) {

            return 0;
        }


        return value;
    }


    private createMessage(
        reason: RetryPolicyReason,
        retryAfterMs: number,
    ): string {

        const seconds =
            Math.ceil(
                retryAfterMs
                / 1000,
            );


        switch (
            reason
        ) {

            case 'TIMEOUT':

                return (
                    `Request timed out. Retry after ${seconds}s.`
                );


            case 'DNS_ERROR':

                return (
                    `DNS resolution failed. Retry after ${seconds}s.`
                );


            case 'CONNECTION_ERROR':

                return (
                    `Connection failed. Retry after ${seconds}s.`
                );


            case 'SITE_UNAVAILABLE':

                return (
                    `Site is temporarily unavailable. Retry after ${seconds}s.`
                );


            default:

                return this.assertNever(
                    reason,
                );
        }
    }


    private validateConfig(
        context: AccessPolicyContext,
    ): void {

        const config =
            context
                .config
                .transientErrors;


        const delays = [
            config.timeoutRetryMs,
            config.dnsRetryMs,
            config.connectionRetryMs,
            config.siteUnavailableRetryMs,
        ];


        for (
            const delay
            of delays
        ) {

            if (
                !Number.isFinite(
                    delay,
                )
                || delay < 0
            ) {

                throw new Error(
                    'Transient retry delays must be non-negative finite numbers.',
                );
            }
        }


        if (
            !Number.isFinite(
                config.maxRetryAfterMs,
            )
            || config.maxRetryAfterMs < 0
        ) {

            throw new Error(
                'transientErrors.maxRetryAfterMs must be non-negative.',
            );
        }


        if (
            !Number.isFinite(
                config.backoffMultiplier,
            )
            || config.backoffMultiplier < 1
        ) {

            throw new Error(
                'transientErrors.backoffMultiplier must be >= 1.',
            );
        }


        if (
            !Number.isFinite(
                config.jitterRatio,
            )
            || config.jitterRatio < 0
            || config.jitterRatio > 1
        ) {

            throw new Error(
                'transientErrors.jitterRatio must be between 0 and 1.',
            );
        }


        for (
            const delay
            of delays
        ) {

            if (
                delay
                > config.maxRetryAfterMs
            ) {

                throw new Error(
                    'Transient base retry delays must not exceed maxRetryAfterMs.',
                );
            }
        }
    }


    private assertNever(
        value: never,
    ): never {

        throw new Error(
            `Unhandled RetryPolicy reason: ${String(value)}`,
        );
    }
}
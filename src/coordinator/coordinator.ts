import type {
    Request,
} from '@crawlee/core';

import {
    REQUEST_MANAGER_CONFIG,
} from '../config/request-manager.config.js';

import type {
    AccessEvaluation,
    AccessRetryLater,
    AccessUserActionRequired,
} from '../core/contracts/access-evaluation.js';

import type {
    FetchEnvelope,
} from '../core/contracts/fetch-envelope.js';

import type {
    FastFetcher,
} from '../fetcher/fast-fetcher.js';

import type {
    QueuedScrapeJob,
} from '../request-manager/types.js';

import type {
    RequestManager,
} from '../request-manager/request-manager.js';

import type {
    IAccessController,
} from '../access-controller/types.js';

import type {
    DeferredRetryScheduler,
} from './contracts/deferred-retry-scheduler.js';

import type {
    PendingActionStore,
} from './contracts/pending-action-store.js';


/**
 * Coordinator only needs a subset of
 * RequestManager functionality.
 *
 * Keeping the dependency narrow makes the
 * Coordinator easier to test.
 */
type RequestManagerPort =
    Pick<
        RequestManager,
        | 'markProcessing'
        | 'markRetryScheduled'
        | 'markUserActionRequired'
        | 'markReadyForParsing'
        | 'markFailed'
    >;


type FastFetcherPort =
    Pick<
        FastFetcher,
        'fetch'
    >;


export type CoordinatorOptions = {

    /**
     * Injectable clock for deterministic tests.
     */
    now?:
        () => number;
};


export class Coordinator {

    private readonly now:
        () => number;


    constructor(
        private readonly requestManager:
            RequestManagerPort,

        private readonly fastFetcher:
            FastFetcherPort,

        private readonly accessController:
            IAccessController,

        private readonly retryScheduler:
            DeferredRetryScheduler,

        private readonly pendingActions:
            PendingActionStore,

        options:
            CoordinatorOptions = {},
    ) {

        this.now =
            options.now
            ?? Date.now;
    }


    /**
     * Process ONE Crawlee request.
     *
     * BasicCrawler owns:
     *
     * - worker concurrency
     * - request execution lifecycle
     * - unexpected-error retries
     *
     * Coordinator owns:
     *
     * - access orchestration
     * - policy decision routing
     * - deferred retry scheduling
     * - user-action persistence
     * - final access-layer state
     */
    async handle(
        request:
            Request<QueuedScrapeJob>,
    ): Promise<void> {

        const queuedJob =
            request.userData;


        const job =
            queuedJob.job;


        /**
         * Every actual logical execution increments
         * state.attempt here.
         */
        this.requestManager
            .markProcessing(
                request,
            );


        /**
         * Check known cooldown/access state BEFORE
         * performing another HTTP request.
         */
        const preflight =
            await this.accessController
                .preflight(
                    job,
                );


        if (
            preflight.decision
            !== 'ALLOW'
        ) {

            await this.routeEvaluation(
                request,
                preflight,
            );


            return;
        }


        /**
         * FastFetcher should normally convert
         * HTTP/transport outcomes into FetchEnvelope
         * instead of throwing.
         *
         * If an unexpected exception DOES escape,
         * allow it to propagate to BasicCrawler.
         */
        const envelope =
            await this.fastFetcher
                .fetch(
                    job,
                );


        /**
         * Translate transport/HTTP/body evidence
         * into an access policy decision.
         */
        const evaluation =
            await this.accessController
                .evaluate(
                    job,
                    envelope,
                );


        await this.routeEvaluation(
            request,
            evaluation,
            envelope,
        );
    }


    private async routeEvaluation(
        request:
            Request<QueuedScrapeJob>,

        evaluation:
            AccessEvaluation,

        _envelope?:
            FetchEnvelope,
    ): Promise<void> {

        switch (
            evaluation.decision
        ) {

            case 'ALLOW':

                /**
                 * IMPORTANT:
                 *
                 * ALLOW means ACCESS succeeded.
                 *
                 * It does NOT mean extraction
                 * succeeded.
                 *
                 * The future parser will receive the
                 * FetchEnvelope before SUCCESS is set.
                 */
                this.requestManager
                    .markReadyForParsing(
                        request,
                    );


                return;


            case 'RETRY_LATER':

                await this.handleRetryLater(
                    request,
                    evaluation,
                );


                return;


            case 'USER_ACTION_REQUIRED':

                await this.handleUserActionRequired(
                    request,
                    evaluation,
                );


                return;


            case 'DENY':

                this.requestManager
                    .markFailed(
                        request,

                        new Error(
                            evaluation.message,
                        ),

                        evaluation.reason,
                    );


                return;


            default:

                return this.assertNever(
                    evaluation,
                );
        }
    }


    /**
     * Handle policy-driven delayed retries.
     *
     * These retries are deliberately outside
     * Crawlee's normal exception retry loop.
     */
    private async handleRetryLater(
        request:
            Request<QueuedScrapeJob>,

        evaluation:
            AccessRetryLater,
    ): Promise<void> {

        const queuedJob =
            request.userData;


        const job =
            queuedJob.job;


        const state =
            queuedJob.state;


        const configuredMaxRetries =
            job.maxRetries
            ?? REQUEST_MANAGER_CONFIG
                .maxRetries;


        /**
         * maxRetries means retries AFTER the first
         * attempt.
         *
         * Example:
         *
         * maxRetries = 3
         *
         * maximum logical attempts = 4
         */
        const maxAttempts =
            configuredMaxRetries
            + 1;


        /**
         * markProcessing() has already incremented
         * state.attempt for the current execution.
         *
         * If the maximum has already been reached,
         * do NOT create another deferred retry.
         */
        if (
            state.attempt
            >= maxAttempts
        ) {

            this.requestManager
                .markFailed(
                    request,

                    new Error(
                        `Retry budget exhausted after `
                        + `${state.attempt} attempts. `
                        + evaluation.message,
                    ),

                    evaluation.reason,
                );


            return;
        }


        this.validateRetryAfter(
            evaluation.retryAfterMs,
        );


        const nowMs =
            this.now();


        if (
            !Number.isFinite(
                nowMs,
            )
        ) {

            throw new Error(
                'Coordinator clock returned a non-finite timestamp.',
            );
        }


        const retryAtMs =
            nowMs
            + evaluation.retryAfterMs;


        const retryAtDate =
            new Date(
                retryAtMs,
            );


        if (
            Number.isNaN(
                retryAtDate.getTime(),
            )
        ) {

            throw new Error(
                `Invalid retry timestamp for job ${job.id}.`,
            );
        }


        const retryAt =
            retryAtDate
                .toISOString();


        /**
         * Scheduling is an infrastructure operation
         * that can fail.
         *
         * Save the previous state so we don't leave
         * the logical job falsely marked as
         * RETRY_SCHEDULED if the scheduler rejects
         * the task.
         */
        const previousState =
            structuredClone(
                state,
            );


        this.requestManager
            .markRetryScheduled(
                request,
                evaluation.reason,
                evaluation.message,
            );


        const task = {

            /**
             * Snapshot AFTER markRetryScheduled so
             * the future requeued request contains:
             *
             * - RETRY_SCHEDULED state history
             * - incremented deferredRetryCount
             * - lastAccessReason
             */
            queuedJob:
                structuredClone(
                    request.userData,
                ),

            reason:
                evaluation.reason,

            retryAt,
        };


        try {

            await this.retryScheduler
                .schedule(
                    task,
                );

        } catch (
            error
        ) {

            /**
             * Restore state because no deferred
             * retry was successfully scheduled.
             *
             * The exception then propagates to
             * BasicCrawler, whose errorHandler can
             * mark this request RETRYING.
             */
            request.userData.state =
                previousState;


            throw error;
        }
    }


    private async handleUserActionRequired(
        request:
            Request<QueuedScrapeJob>,

        evaluation:
            AccessUserActionRequired,
    ): Promise<void> {

        const previousState =
            structuredClone(
                request
                    .userData
                    .state,
            );


        this.requestManager
            .markUserActionRequired(
                request,
                evaluation.reason,
                evaluation.message,
            );


        const nowMs =
            this.now();


        if (
            !Number.isFinite(
                nowMs,
            )
        ) {

            request.userData.state =
                previousState;


            throw new Error(
                'Coordinator clock returned a non-finite timestamp.',
            );
        }


        const createdAt =
            new Date(
                nowMs,
            )
                .toISOString();


        try {

            await this.pendingActions
                .set({

                    /**
                     * Defensive snapshot.
                     *
                     * The store also clones internally,
                     * but the Coordinator should not
                     * expose the active Crawlee request
                     * object as persisted state.
                     */
                    queuedJob:
                        structuredClone(
                            request.userData,
                        ),

                    evaluation:
                        structuredClone(
                            evaluation,
                        ),

                    createdAt,

                    /**
                     * sessionRef is intentionally not
                     * populated by FastFetcher.
                     *
                     * Browser/session integration will
                     * provide this later.
                     */
                });

        } catch (
            error
        ) {

            /**
             * Don't claim USER_ACTION_REQUIRED was
             * persisted if storage actually failed.
             */
            request.userData.state =
                previousState;


            throw error;
        }
    }


    private validateRetryAfter(
        retryAfterMs:
            number,
    ): void {

        if (
            !Number.isFinite(
                retryAfterMs,
            )
            || retryAfterMs < 0
        ) {

            throw new Error(
                'retryAfterMs must be a non-negative finite number.',
            );
        }
    }


    private assertNever(
        value:
            never,
    ): never {

        throw new Error(
            `Unhandled access evaluation: ${String(value)}`,
        );
    }
}
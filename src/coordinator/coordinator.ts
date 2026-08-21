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
    ParserOutcomePolicy,
} from '../core/contracts/parser/parser-outcome-policy.js';

import type {
    ParserPipeline,
} from '../core/contracts/parser/parser-pipeline.js';

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
 */
type RequestManagerPort =
    Pick<
        RequestManager,
        | 'markProcessing'
        | 'markRetryScheduled'
        | 'markUserActionRequired'
        | 'markReadyForParsing'
        | 'markSuccess'
        | 'markParserFailed'
        | 'markFailed'
    >;


type FastFetcherPort =
    Pick<
        FastFetcher,
        'fetch'
    >;


type ParserPipelinePort =
    Pick<
        ParserPipeline,
        'run'
    >;


type ParserOutcomePolicyPort =
    Pick<
        ParserOutcomePolicy,
        'decide'
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

        private readonly parserPipeline:
            ParserPipelinePort,

        private readonly parserOutcomePolicy:
            ParserOutcomePolicyPort,

        options:
            CoordinatorOptions = {},
    ) {

        this.now =
            options.now
            ?? Date.now;
    }


    /**
     * Process one Crawlee request.
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
     * - access-policy routing
     * - deferred retry scheduling
     * - user-action persistence
     * - parser execution
     * - parser outcome routing
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
         * Every logical execution increments
         * attempt here.
         */
        this.requestManager
            .markProcessing(
                request,
            );


        /**
         * Check known access/cooldown state before
         * performing HTTP work.
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
         * FastFetcher normally represents transport
         * and HTTP outcomes as FetchEnvelope.
         *
         * Unexpected exceptions intentionally
         * propagate to BasicCrawler.
         */
        const envelope =
            await this.fastFetcher
                .fetch(
                    job,
                );


        /**
         * Convert transport/HTTP evidence into an
         * access policy decision.
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

        envelope?:
            FetchEnvelope,
    ): Promise<void> {

        switch (
            evaluation.decision
        ) {

            case 'ALLOW':

                /**
                 * Access ALLOW does not mean final
                 * scrape SUCCESS.
                 *
                 * The response must first complete the
                 * deterministic parser pipeline.
                 */
                if (
                    envelope === undefined
                ) {

                    throw new Error(
                        'FetchEnvelope is required for parser execution.',
                    );
                }


                /**
                 * Preserve the lifecycle boundary
                 * between successful access and
                 * parser execution.
                 */
                this.requestManager
                    .markReadyForParsing(
                        request,
                    );


                /**
                 * Do NOT catch unexpected parser
                 * exceptions here.
                 *
                 * A parser exception is different from
                 * a valid parser result whose
                 * validation status is INVALID.
                 *
                 * Unexpected exceptions should reach
                 * BasicCrawler's normal error/retry
                 * lifecycle.
                 */
                const parserResult =
                    await this.parserPipeline
                        .run({

                            job:
                                request
                                    .userData
                                    .job,

                            envelope,
                        });


                const parserOutcome =
                    this.parserOutcomePolicy
                        .decide(
                            parserResult,
                        );


                /**
                 * VALID and PARTIAL both map to
                 * COMPLETE through ParserOutcomePolicy.
                 */
                if (
                    parserOutcome.outcome
                    === 'COMPLETE'
                ) {

                    this.requestManager
                        .markSuccess(
                            request,
                        );


                    return;
                }


                /**
                 * PARSER_FAILURE represents a
                 * completed deterministic pipeline
                 * whose result did not satisfy
                 * validation requirements.
                 *
                 * No retry/self-healing happens here.
                 */
                this.requestManager
                    .markParserFailed(
                        request,

                        `Parser validation failed `
                        + `with status `
                        + `${parserResult.validation.status}.`,
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
         * markProcessing() already incremented
         * state.attempt for this execution.
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
         * Scheduler persistence can fail.
         *
         * Preserve the previous lifecycle state so
         * RETRY_SCHEDULED is not falsely retained.
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
                     * sessionRef will be supplied by
                     * future browser/session
                     * integration when required.
                     */
                });

        } catch (
            error
        ) {

            /**
             * USER_ACTION_REQUIRED must not remain
             * recorded if persistence failed.
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
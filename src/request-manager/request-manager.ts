// src/request-manager/request-manager.ts

import {
    Request,
    RequestQueue,
} from '@crawlee/core';

import {
    randomUUID,
} from 'node:crypto';

import {
    REQUEST_MANAGER_CONFIG,
} from '../config/request-manager.config.js';

import type {
    AccessReason,
    RetryableAccessReason,
    UserActionAccessReason,
} from '../core/contracts/access-evaluation.js';

import type {
    ScrapeJob,
} from '../core/contracts/scrape-job.js';

import type {
    CreateScrapeJobInput,
    EnqueueResult,
    QueuedScrapeJob,
    QueueStats,
    RequeueExistingJobInput,
} from './types.js';

import {
    createDeduplicationKey,
    getDomain,
    validateUrl,
} from './url-utils.js';


/**
 * RequestManager owns:
 *
 * - RequestQueue
 * - job creation
 * - queue identity
 * - queue lifecycle state
 * - manual retry lifecycle
 *
 * It does NOT own:
 *
 * - HTTP fetching
 * - access decisions
 * - parsing
 * - validation
 * - AI healing
 */
export class ScrapeRequestManager {

    private queue:
        RequestQueue | null = null;


    /**
     * Open/create the configured Crawlee queue.
     */
    async initialize():
        Promise<void> {

        this.queue =
            await RequestQueue.open(
                REQUEST_MANAGER_CONFIG
                    .queueName,
            );


        console.log(
            `[RequestManager] Queue ready: `
            + REQUEST_MANAGER_CONFIG
                .queueName,
        );
    }


    /**
     * Internal guard against using the manager
     * before initialize().
     */
    private getQueue():
        RequestQueue {

        if (
            this.queue === null
        ) {

            throw new Error(
                'RequestManager is not initialized. '
                + 'Call initialize() first.',
            );
        }


        return this.queue;
    }


    /**
     * Expose the initialized queue to BasicCrawler.
     */
    getRequestQueue():
        RequestQueue {

        return this.getQueue();
    }


    /**
     * Convert external creation input into the
     * immutable shared ScrapeJob contract.
     */
    private createJob(
        input:
            CreateScrapeJobInput,

        normalizedUrl:
            string,

        now:
            string,
    ): ScrapeJob {

        return {

            id:
                randomUUID(),

            url:
                normalizedUrl,

            /**
             * Preserve the user's complete dynamic
             * requested-field schema.
             *
             * Clone it so later caller mutations do
             * not change the stored job.
             */
            requestedFields:
                structuredClone(
                    input.requestedFields,
                ),

            maxRetries:
                input.maxRetries,

            priority:
                input.priority,

            metadata:
                input.metadata,

            createdAt:
                now,
        };
    }


    /**
     * Validate RequestManager-specific creation
     * parameters before adding anything to storage.
     *
     * TypeScript protects our own source code,
     * but runtime validation is still required
     * because input can eventually come from:
     *
     * - API requests
     * - UI
     * - external users
     * - persisted jobs
     */
    private validateCreateInput(
        input:
            CreateScrapeJobInput,
    ): void {

        /**
         * --------------------------------------------
         * requestedFields
         * --------------------------------------------
         *
         * A universal scraping job must explicitly
         * say what fields it wants.
         *
         * We no longer provide implicit defaults like
         * businessName, phone, address, etc.
         */
        if (
            !Array.isArray(
                input.requestedFields,
            )
            || input.requestedFields.length === 0
        ) {

            throw new Error(
                'requestedFields must contain '
                + 'at least one field.',
            );
        }


        /**
         * Used to prevent:
         *
         * price
         * Price
         * PRICE
         *
         * from becoming three output fields.
         */
        const seenFieldNames =
            new Set<string>();


        for (
            const field
            of input.requestedFields
        ) {

            /**
             * Runtime object guard.
             */
            if (
                typeof field !== 'object'
                || field === null
            ) {

                throw new Error(
                    'Each requested field must '
                    + 'be an object.',
                );
            }


            /**
             * ----------------------------------------
             * field.name
             * ----------------------------------------
             */
            if (
                typeof field.name !== 'string'
            ) {

                throw new Error(
                    'Requested field name '
                    + 'must be a string.',
                );
            }


            const fieldName =
                field.name
                    .trim();


            if (
                fieldName.length === 0
            ) {

                throw new Error(
                    'Requested field name '
                    + 'must not be empty.',
                );
            }


            const normalizedFieldName =
                fieldName
                    .toLowerCase();


            if (
                seenFieldNames.has(
                    normalizedFieldName,
                )
            ) {

                throw new Error(
                    `Duplicate requested field: `
                    + `${field.name}`,
                );
            }


            seenFieldNames.add(
                normalizedFieldName,
            );


            /**
             * ----------------------------------------
             * field.type
             * ----------------------------------------
             */
            const validFieldTypes =
                new Set([
                    'string',
                    'number',
                    'boolean',
                    'array',
                ]);


            if (
                typeof field.type !== 'string'
                || !validFieldTypes.has(
                    field.type,
                )
            ) {

                throw new Error(
                    `Unsupported requested field `
                    + `type for "${field.name}": `
                    + `${String(field.type)}`,
                );
            }


            /**
             * ----------------------------------------
             * field.description
             * ----------------------------------------
             */
            if (
                field.description !== undefined
                && typeof field.description
                    !== 'string'
            ) {

                throw new Error(
                    `description for requested field `
                    + `"${field.name}" must be a string.`,
                );
            }


            /**
             * ----------------------------------------
             * field.aliases
             * ----------------------------------------
             */
            if (
                field.aliases !== undefined
            ) {

                if (
                    !Array.isArray(
                        field.aliases,
                    )
                ) {

                    throw new Error(
                        `aliases for requested field `
                        + `"${field.name}" must be an array.`,
                    );
                }


                for (
                    const alias
                    of field.aliases
                ) {

                    if (
                        typeof alias !== 'string'
                        || alias.trim()
                            .length === 0
                    ) {

                        throw new Error(
                            `aliases for requested field `
                            + `"${field.name}" must contain `
                            + 'non-empty strings.',
                        );
                    }
                }
            }


            /**
             * ----------------------------------------
             * field.paths
             * ----------------------------------------
             */
            if (
                field.paths !== undefined
            ) {

                if (
                    !Array.isArray(
                        field.paths,
                    )
                ) {

                    throw new Error(
                        `paths for requested field `
                        + `"${field.name}" must be an array.`,
                    );
                }


                for (
                    const path
                    of field.paths
                ) {

                    if (
                        typeof path !== 'string'
                        || path.trim()
                            .length === 0
                    ) {

                        throw new Error(
                            `paths for requested field `
                            + `"${field.name}" must contain `
                            + 'non-empty strings.',
                        );
                    }
                }
            }


            /**
             * ----------------------------------------
             * field.required
             * ----------------------------------------
             */
            if (
                field.required !== undefined
                && typeof field.required
                    !== 'boolean'
            ) {

                throw new Error(
                    `required for requested field `
                    + `"${field.name}" must be boolean.`,
                );
            }
        }


        /**
         * --------------------------------------------
         * maxRetries
         * --------------------------------------------
         */
        if (
            input.maxRetries
            !== undefined
        ) {

            if (
                !Number.isSafeInteger(
                    input.maxRetries,
                )
                || input.maxRetries < 0
            ) {

                throw new Error(
                    'maxRetries must be a '
                    + 'non-negative safe integer.',
                );
            }
        }


        /**
         * --------------------------------------------
         * priority
         * --------------------------------------------
         */
        if (
            input.priority
            !== undefined
        ) {

            if (
                !Number.isSafeInteger(
                    input.priority,
                )
            ) {

                throw new Error(
                    'priority must be a safe integer.',
                );
            }
        }
    }



    /**
     * Add a new scrape job.
     *
     * This is the ONLY place where
     * CreateScrapeJobInput becomes ScrapeJob.
     */
    async enqueue(
        input: CreateScrapeJobInput,
    ): Promise<EnqueueResult> {

        this.validateCreateInput(
            input,
        );


        const queue =
            this.getQueue();


        const parsedUrl =
            validateUrl(
                input.url,
            );


        const normalizedUrl =
            parsedUrl.toString();


        const now =
            new Date()
                .toISOString();


        /**
         * Immutable job intent.
         */
        const job =
            this.createJob(
                input,
                normalizedUrl,
                now,
            );


        /**
         * Mutable RequestManager state.
         */
        const queuedJob:
            QueuedScrapeJob = {

                job,

                state: {

                    status:
                        'QUEUED',

                    attempt:
                        0,

                    deferredRetryCount:
                        0,

                    domain:
                        getDomain(
                            normalizedUrl,
                        ),

                    updatedAt:
                        now,
                },
            };


        /**
         * Current implementation:
         *
         * fixed time-bucket dedupe.
         *
         * Future:
         *
         * DeduplicationStore / TTL strategy.
         */
        const uniqueKey =
            createDeduplicationKey(

                normalizedUrl,

                REQUEST_MANAGER_CONFIG
                    .deduplicationWindowMs,

                input.forceRefresh,
            );


        /**
         * Resolve the retry limit now so that
         * Crawlee Request.maxRetries always has
         * an explicit value.
         */
        const effectiveMaxRetries =
            input.maxRetries
            ?? REQUEST_MANAGER_CONFIG
                .maxRetries;


        const operation =
            await queue.addRequest(

                {
                    url:
                        normalizedUrl,

                    uniqueKey,

                    userData:
                        queuedJob,

                    /**
                     * Crawlee per-request retry
                     * override.
                     */
                    maxRetries:
                        effectiveMaxRetries,
                },

                {
                    /**
                     * Numeric priority scheduling
                     * is intentionally NOT mapped
                     * to forefront.
                     *
                     * priority remains job intent
                     * until QueueStrategy exists.
                     */
                    forefront:
                        false,
                },
            );


        /**
         * Crawlee does not overwrite an existing
         * request with the same uniqueKey.
         *
         * Retrieve the stored request so duplicate
         * callers receive the ORIGINAL jobId.
         */
        const storedRequest =
            await queue
                .getRequest<
                    QueuedScrapeJob
                >(
                    operation.requestId,
                );


        const storedJobId =
            storedRequest
                ?.userData
                .job
                .id
            ?? job.id;


        return {

            jobId:
                storedJobId,

            requestId:
                operation.requestId,

            url:
                normalizedUrl,

            duplicate:
                operation
                    .wasAlreadyPresent,

            alreadyHandled:
                operation
                    .wasAlreadyHandled,
        };
    }


    /**
     * Requeue an EXISTING logical ScrapeJob.
     *
     * Used for:
     *
     * - deferred access retries
     * - user-action resumption
     *
     * This intentionally does NOT call enqueue(),
     * because enqueue() creates a new logical job
     * with a new job.id.
     *
     * Logical job identity and runtime state are
     * preserved while a fresh Crawlee Request is
     * created.
     */
    async requeueExistingJob(
        input:
            RequeueExistingJobInput,
    ): Promise<EnqueueResult> {

        const queue =
            this.getQueue();


        const now =
            new Date()
                .toISOString();


        const job =
            structuredClone(
                input
                    .queuedJob
                    .job,
            );


        const state =
            structuredClone(
                input
                    .queuedJob
                    .state,
            );


        /**
         * This is a lifecycle transition for the
         * same logical job, not new job creation.
         */
        state.status =
            'QUEUED';


        state.updatedAt =
            now;


        const queuedJob:
            QueuedScrapeJob = {

                job,

                state,
            };


        /**
         * Each requeue intentionally gets a fresh
         * Crawlee request identity.
         *
         * Normal URL deduplication is not used here
         * because the same logical job may need
         * multiple legitimate executions.
         */
        const uniqueKey =
            [
                'job',
                job.id,
                input.cause,
                randomUUID(),
            ].join(
                ':',
            );


        const effectiveMaxRetries =
            job.maxRetries
            ?? REQUEST_MANAGER_CONFIG
                .maxRetries;


        /**
         * maxRetries means retries AFTER the first
         * attempt, so the total logical execution
         * budget is maxRetries + 1.
         */
        const maxAttempts =
            effectiveMaxRetries
            + 1;


        if (
            state.attempt
            >= maxAttempts
        ) {

            throw new Error(
                `Retry budget exhausted for job ${job.id}.`,
            );
        }


        /**
         * state.attempt is the total number of
         * logical executions already started.
         *
         * A fresh Crawlee Request consumes one of
         * the remaining attempts itself. Its own
         * maxRetries therefore receives only the
         * additional attempts still available.
         */
        const remainingCrawlerRetries =
            Math.max(
                0,
                maxAttempts
                - state.attempt
                - 1,
            );


        const operation =
            await queue.addRequest(

                {
                    url:
                        job.url,

                    uniqueKey,

                    userData:
                        queuedJob,

                    maxRetries:
                        remainingCrawlerRetries,
                },

                {
                    forefront:
                        false,
                },
            );


        return {

            jobId:
                job.id,

            requestId:
                operation.requestId,

            url:
                job.url,

            duplicate:
                operation
                    .wasAlreadyPresent,

            alreadyHandled:
                operation
                    .wasAlreadyHandled,
        };
    }


    /**
     * Fetch the next queued job.
     *
     * Temporary manual queue-consumption helper.
     *
     * Final BasicCrawler integration does not use
     * this method. BasicCrawler will consume the
     * RequestQueue directly.
     */
    async getNextRequest():
        Promise<
            Request<QueuedScrapeJob>
            | null
        > {

        return this
            .getQueue()
            .fetchNextRequest<
                QueuedScrapeJob
            >();
    }


    /**
     * Called when BasicCrawler begins processing
     * this request.
     *
     * state.attempt is the lifetime execution count
     * for the logical ScrapeJob.
     *
     * It is intentionally independent from
     * request.retryCount, which belongs only to the
     * current Crawlee Request.
     */
    markProcessing(
        request:
            Request<QueuedScrapeJob>,
    ): void {

        const state =
            request
                .userData
                .state;


        state.status =
            'PROCESSING';


        state.attempt +=
            1;


        state.updatedAt =
            new Date()
                .toISOString();
    }


    /**
     * Record a policy-driven deferred retry.
     *
     * The counter increments when the retry is
     * scheduled, not when its timer eventually
     * fires.
     */
    markRetryScheduled(
        request:
            Request<QueuedScrapeJob>,

        reason:
            RetryableAccessReason,

        message?:
            string,
    ): void {

        const state =
            request
                .userData
                .state;


        state.status =
            'RETRY_SCHEDULED';


        state.deferredRetryCount +=
            1;


        state.lastAccessReason =
            reason;


        if (
            message !== undefined
        ) {

            state.lastError =
                message;
        }


        state.updatedAt =
            new Date()
                .toISOString();
    }


    /**
     * Record that processing is paused until
     * external human action is completed.
     */
    markUserActionRequired(
        request:
            Request<QueuedScrapeJob>,

        reason:
            UserActionAccessReason,

        message:
            string,
    ): void {

        const state =
            request
                .userData
                .state;


        state.status =
            'USER_ACTION_REQUIRED';


        state.lastAccessReason =
            reason;


        state.lastError =
            message;


        state.updatedAt =
            new Date()
                .toISOString();
    }


    /**
     * Access succeeded and the response can move
     * to the future parser/extraction layer.
     *
     * This is deliberately NOT final SUCCESS.
     */
    markReadyForParsing(
        request:
            Request<QueuedScrapeJob>,
    ): void {

        const state =
            request
                .userData
                .state;


        state.status =
            'READY_FOR_PARSING';


        state.lastAccessReason =
            undefined;


        state.lastError =
            undefined;


        state.updatedAt =
            new Date()
                .toISOString();
    }


    /**
     * Update application-level state after a
     * successful requestHandler execution.
     *
     * IMPORTANT:
     *
     * When BasicCrawler owns the request, this
     * method does NOT call markRequestHandled().
     *
     * BasicCrawler owns queue completion.
     */
    markSuccess(
        request:
            Request<QueuedScrapeJob>,
    ): void {

        const state =
            request
                .userData
                .state;


        state.status =
            'SUCCESS';


        state.lastError =
            undefined;


        state.lastAccessReason =
            undefined;


        state.updatedAt =
            new Date()
                .toISOString();


        console.log(
            `[RequestManager] SUCCESS `
            + request
                .userData
                .job
                .id,
        );
    }


    /**
     * Called from BasicCrawler.errorHandler().
     *
     * Crawlee itself owns reclaiming/retrying the
     * request, so this only updates runtime state.
     */
    markRetrying(
        request:
            Request<QueuedScrapeJob>,

        error:
            Error,
    ): void {

        const state =
            request
                .userData
                .state;


        state.status =
            'RETRYING';


        state.lastError =
            error.message;


        /**
         * This path represents an unexpected
         * crawler/execution error, not a structured
         * AccessController decision.
         */
        state.lastAccessReason =
            undefined;


        state.updatedAt =
            new Date()
                .toISOString();


        console.warn(
            `[RequestManager] RETRY `
            + request
                .userData
                .job
                .id
            + ` attempt=${state.attempt}`,
        );
    }


    /**
     * Called from BasicCrawler.failedRequestHandler()
     * when normal Crawlee retries are exhausted.
     */
    markFailed(
        request:
            Request<QueuedScrapeJob>,

        error:
            Error,

        accessReason?:
            AccessReason,
    ): void {

        const state =
            request
                .userData
                .state;


        state.status =
            'FAILED_FINAL';


        state.lastError =
            error.message;


        /**
         * Assign directly so an unrelated final
         * failure cannot retain a stale reason from
         * an earlier access decision.
         */
        state.lastAccessReason =
            accessReason;


        state.updatedAt =
            new Date()
                .toISOString();


        console.error(
            `[RequestManager] FAILED_FINAL `
            + request
                .userData
                .job
                .id
            + `: ${error.message}`,
        );
    }


    /**
     * Temporary/manual consumer helper.
     *
     * Use this only when getNextRequest() is used
     * directly outside BasicCrawler.
     */
    async completeManualSuccess(
        request:
            Request<QueuedScrapeJob>,
    ): Promise<void> {

        this.markSuccess(
            request,
        );


        await this
            .getQueue()
            .markRequestHandled(
                request,
            );
    }


    /**
     * Retry helper for temporary/manual queue
     * consumption.
     *
     * Do NOT call this from BasicCrawler.errorHandler().
     * BasicCrawler owns its own retry/reclaim flow.
     */
    async retry(
        request:
            Request<QueuedScrapeJob>,

        error:
            Error,
    ): Promise<boolean> {

        const queue =
            this.getQueue();


        request.pushErrorMessage(
            error,
        );


        const maxRetries =
            request.maxRetries
            ?? REQUEST_MANAGER_CONFIG
                .maxRetries;


        const retriesAlreadyUsed =
            Math.max(
                0,
                request.userData
                    .state
                    .attempt - 1,
            );


        if (
            retriesAlreadyUsed
            >= maxRetries
        ) {

            this.markFailed(
                request,
                error,
            );


            await queue
                .markRequestHandled(
                    request,
                );


            return false;
        }


        this.markRetrying(
            request,
            error,
        );


        await queue
            .reclaimRequest(
                request,
                {},
            );


        return true;
    }


    /**
     * Permanently fail a manually consumed request.
     *
     * Do NOT call this from
     * BasicCrawler.failedRequestHandler(); use
     * markFailed() there instead.
     */
    async failPermanently(
        request:
            Request<QueuedScrapeJob>,

        error:
            Error,
    ): Promise<void> {

        this.markFailed(
            request,
            error,
        );


        request.pushErrorMessage(
            error,
        );


        await this
            .getQueue()
            .markRequestHandled(
                request,
            );
    }


    /**
     * Current queue statistics.
     */
    async getStats():
        Promise<QueueStats> {

        const queue =
            this.getQueue();


        const info =
            await queue
                .getInfo();


        if (
            info === undefined
        ) {

            return {
                total:
                    0,

                handled:
                    0,

                pending:
                    0,
            };
        }


        return {

            total:
                info.totalRequestCount,

            handled:
                info.handledRequestCount,

            pending:
                info.pendingRequestCount,
        };
    }
}
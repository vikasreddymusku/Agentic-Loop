import type {
    AccessReason,
} from '../core/contracts/access-evaluation.js';

import type {
    RequestedField,
    ScrapeJob,
    ScrapeJobMetadata,
} from '../core/contracts/scrape-job.js';


export type ScrapeJobStatus =
    | 'QUEUED'
    | 'PROCESSING'
    | 'RETRYING'
    | 'RETRY_SCHEDULED'
    | 'USER_ACTION_REQUIRED'
    | 'READY_FOR_PARSING'
    | 'PARSER_FAILED'
    | 'SUCCESS'
    | 'FAILED_FINAL';


export type CreateScrapeJobInput = {

    url:
        string;

    requestedFields:
        RequestedField[];

    maxRetries?:
        number;

    /**
     * Intent only.
     *
     * Numeric queue priority scheduling is not
     * implemented yet.
     */
    priority?:
        number;

    metadata?:
        ScrapeJobMetadata;

    /**
     * Bypass normal URL deduplication when
     * intentionally creating a fresh logical job.
     *
     * This is NOT used for retries/resumes.
     */
    forceRefresh?:
        boolean;
};


export type RequestRuntimeState = {

    status:
        ScrapeJobStatus;

    /**
     * Total number of times this logical job has
     * actually started processing.
     *
     * Independent from Crawlee request.retryCount.
     */
    attempt:
        number;

    /**
     * Number of policy-driven deferred retries
     * that have been scheduled.
     */
    deferredRetryCount:
        number;

    domain:
        string;

    /**
     * Most recent structured access reason.
     */
    lastAccessReason?:
        AccessReason;

    lastError?:
        string;

    updatedAt:
        string;
};


export type QueuedScrapeJob = {

    /**
     * Immutable logical job intent.
     */
    job:
        ScrapeJob;

    /**
     * Mutable lifecycle/runtime state.
     */
    state:
        RequestRuntimeState;
};


export type RequeueCause =
    | 'DEFERRED_RETRY'
    | 'USER_ACTION_RESUME';


export type RequeueExistingJobInput = {

    queuedJob:
        QueuedScrapeJob;

    cause:
        RequeueCause;
};


export type EnqueueResult = {

    jobId:
        string;

    requestId:
        string;

    url:
        string;

    duplicate:
        boolean;

    alreadyHandled:
        boolean;
};


export type QueueStats = {

    total:
        number;

    handled:
        number;

    pending:
        number;
};
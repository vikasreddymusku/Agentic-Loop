import type {
    RetryableAccessReason,
} from '../../core/contracts/access-evaluation.js';

import type {
    QueuedScrapeJob,
} from '../../request-manager/types.js';


export type DeferredRetryTask = {

    queuedJob:
        QueuedScrapeJob;

    reason:
        RetryableAccessReason;

    retryAt:
        string;
};


export interface DeferredRetryScheduler {

    schedule(
        task:
            DeferredRetryTask,
    ): Promise<void>;


    cancel(
        jobId:
            string,
    ): Promise<void>;


    shutdown():
        Promise<void>;
}
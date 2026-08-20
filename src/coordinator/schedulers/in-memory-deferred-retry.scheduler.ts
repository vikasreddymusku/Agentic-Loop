import type {
    EnqueueResult,
    RequeueExistingJobInput,
} from '../../request-manager/types.js';

import type {
    DeferredRetryScheduler,
    DeferredRetryTask,
} from '../contracts/deferred-retry-scheduler.js';


type RequeueExistingJobPort = {

    requeueExistingJob(
        input:
            RequeueExistingJobInput,
    ): Promise<EnqueueResult>;
};


export type DeferredRetryErrorHandler = (
    error: Error,
    task: DeferredRetryTask,
) => void | Promise<void>;


export type InMemoryDeferredRetrySchedulerOptions = {

    /**
     * Injectable clock for deterministic tests.
     */
    now?:
        () => number;

    /**
     * Called if a delayed requeue fails.
     *
     * Timer callbacks cannot return their failure
     * to schedule(), so failures are surfaced here
     * instead of becoming unhandled rejections.
     */
    onError?:
        DeferredRetryErrorHandler;
};


const MAX_TIMEOUT_MS =
    2_147_483_647;


export class InMemoryDeferredRetryScheduler
implements DeferredRetryScheduler {

    private readonly timers =
        new Map<
            string,
            ReturnType<typeof setTimeout>
        >();


    private readonly now:
        () => number;


    private readonly onError:
        DeferredRetryErrorHandler;


    private isShutdown =
        false;


    constructor(
        private readonly requeuer:
            RequeueExistingJobPort,

        options:
            InMemoryDeferredRetrySchedulerOptions = {},
    ) {

        this.now =
            options.now
            ?? Date.now;


        this.onError =
            options.onError
            ?? (
                (
                    error,
                    task,
                ) => {

                    console.error(
                        `[DeferredRetryScheduler] `
                        + `Failed to requeue job `
                        + `${task.queuedJob.job.id}: `
                        + error.message,
                    );
                }
            );
    }


    async schedule(
        task:
            DeferredRetryTask,
    ): Promise<void> {

        if (
            this.isShutdown
        ) {

            throw new Error(
                'Deferred retry scheduler is shut down.',
            );
        }


        const jobId =
            task
                .queuedJob
                .job
                .id;


        if (
            jobId.trim()
                .length === 0
        ) {

            throw new Error(
                'Deferred retry task requires a job id.',
            );
        }


        const retryAtMs =
            Date.parse(
                task.retryAt,
            );


        if (
            !Number.isFinite(
                retryAtMs,
            )
        ) {

            throw new Error(
                `Invalid retryAt for job ${jobId}.`,
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
                'Deferred retry scheduler clock returned a non-finite timestamp.',
            );
        }


        const delayMs =
            Math.max(
                0,
                retryAtMs
                - nowMs,
            );


        if (
            delayMs
            > MAX_TIMEOUT_MS
        ) {

            throw new Error(
                `Deferred retry delay for job ${jobId} exceeds the in-memory timer limit.`,
            );
        }


        /**
         * Only one pending timer is allowed for a
         * logical job.
         *
         * A newer scheduling decision replaces the
         * previous one.
         */
        await this.cancel(
            jobId,
        );


        /**
         * Snapshot the task so later mutations to
         * RequestRuntimeState do not change what
         * the timer eventually requeues.
         */
        const snapshot =
            structuredClone(
                task,
            );


        const timer =
            setTimeout(
                () => {

                    /**
                     * Remove before executing so a
                     * new retry for the same job can
                     * be scheduled while requeueing.
                     */
                    this.timers
                        .delete(
                            jobId,
                        );


                    void this.execute(
                        snapshot,
                    );
                },

                delayMs,
            );


        this.timers.set(
            jobId,
            timer,
        );
    }


    async cancel(
        jobId:
            string,
    ): Promise<void> {

        const timer =
            this.timers.get(
                jobId,
            );


        if (
            timer === undefined
        ) {

            return;
        }


        clearTimeout(
            timer,
        );


        this.timers.delete(
            jobId,
        );
    }


    async shutdown():
        Promise<void> {

        this.isShutdown =
            true;


        for (
            const timer
            of this.timers.values()
        ) {

            clearTimeout(
                timer,
            );
        }


        this.timers.clear();
    }


    private async execute(
        task:
            DeferredRetryTask,
    ): Promise<void> {

        try {

            await this.requeuer
                .requeueExistingJob({
                    queuedJob:
                        task.queuedJob,

                    cause:
                        'DEFERRED_RETRY',
                });

        } catch (
            error
        ) {

            const normalizedError =
                error instanceof Error
                    ? error
                    : new Error(
                        String(
                            error,
                        ),
                    );


            try {

                await this.onError(
                    normalizedError,
                    task,
                );

            } catch (
                handlerError
            ) {

                const normalizedHandlerError =
                    handlerError instanceof Error
                        ? handlerError
                        : new Error(
                            String(
                                handlerError,
                            ),
                        );


                console.error(
                    '[DeferredRetryScheduler] '
                    + 'Error handler failed: '
                    + normalizedHandlerError.message,
                );
            }
        }
    }
}
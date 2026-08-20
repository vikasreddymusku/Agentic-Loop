import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import type {
    DeferredRetryTask,
} from '../contracts/deferred-retry-scheduler.js';

import {
    InMemoryDeferredRetryScheduler,
} from './in-memory-deferred-retry.scheduler.js';


function createTask(
    retryAt:
        string,
): DeferredRetryTask {

    return {
        queuedJob: {

            job: {
                id:
                    'job-1',

                url:
                    'https://example.com/',

                requestedFields: [
                    {
                        name:
                            'businessName',
                        type:
                            'string',
                    }
                ],

                maxRetries:
                    3,

                createdAt:
                    '2026-08-19T10:00:00.000Z',
            },

            state: {
                status:
                    'RETRY_SCHEDULED',

                attempt:
                    1,

                deferredRetryCount:
                    1,

                domain:
                    'example.com',

                lastAccessReason:
                    'RATE_LIMITED',

                updatedAt:
                    '2026-08-19T10:00:00.000Z',
            },
        },

        reason:
            'RATE_LIMITED',

        retryAt,
    };
}


describe(
    'InMemoryDeferredRetryScheduler',
    () => {

        beforeEach(
            () => {

                vi.useFakeTimers();

                vi.setSystemTime(
                    new Date(
                        '2026-08-19T10:00:00.000Z',
                    ),
                );
            },
        );


        afterEach(
            () => {

                vi.useRealTimers();

                vi.restoreAllMocks();
            },
        );


        it(
            'requeues the existing logical job only after retryAt',
            async () => {

                const requeueExistingJob =
                    vi.fn()
                        .mockResolvedValue({
                            jobId:
                                'job-1',

                            requestId:
                                'request-2',

                            url:
                                'https://example.com/',

                            duplicate:
                                false,

                            alreadyHandled:
                                false,
                        });


                const scheduler =
                    new InMemoryDeferredRetryScheduler(
                        {
                            requeueExistingJob,
                        },
                    );


                await scheduler.schedule(
                    createTask(
                        '2026-08-19T10:00:01.000Z',
                    ),
                );


                await vi.advanceTimersByTimeAsync(
                    999,
                );


                expect(
                    requeueExistingJob,
                ).not.toHaveBeenCalled();


                await vi.advanceTimersByTimeAsync(
                    1,
                );


                expect(
                    requeueExistingJob,
                ).toHaveBeenCalledTimes(
                    1,
                );


                expect(
                    requeueExistingJob,
                ).toHaveBeenCalledWith({
                    queuedJob:
                        expect.objectContaining({
                            job:
                                expect.objectContaining({
                                    id:
                                        'job-1',
                                }),
                        }),

                    cause:
                        'DEFERRED_RETRY',
                });
            },
        );


        it(
            'replaces an existing timer for the same logical job',
            async () => {

                const requeueExistingJob =
                    vi.fn()
                        .mockResolvedValue({
                            jobId:
                                'job-1',

                            requestId:
                                'request-2',

                            url:
                                'https://example.com/',

                            duplicate:
                                false,

                            alreadyHandled:
                                false,
                        });


                const scheduler =
                    new InMemoryDeferredRetryScheduler(
                        {
                            requeueExistingJob,
                        },
                    );


                await scheduler.schedule(
                    createTask(
                        '2026-08-19T10:00:01.000Z',
                    ),
                );


                await scheduler.schedule(
                    createTask(
                        '2026-08-19T10:00:02.000Z',
                    ),
                );


                await vi.advanceTimersByTimeAsync(
                    1_000,
                );


                expect(
                    requeueExistingJob,
                ).not.toHaveBeenCalled();


                await vi.advanceTimersByTimeAsync(
                    1_000,
                );


                expect(
                    requeueExistingJob,
                ).toHaveBeenCalledTimes(
                    1,
                );
            },
        );


        it(
            'cancels a pending retry',
            async () => {

                const requeueExistingJob =
                    vi.fn();


                const scheduler =
                    new InMemoryDeferredRetryScheduler(
                        {
                            requeueExistingJob,
                        },
                    );


                await scheduler.schedule(
                    createTask(
                        '2026-08-19T10:00:01.000Z',
                    ),
                );


                await scheduler.cancel(
                    'job-1',
                );


                await vi.advanceTimersByTimeAsync(
                    1_000,
                );


                expect(
                    requeueExistingJob,
                ).not.toHaveBeenCalled();
            },
        );


        it(
            'shutdown clears timers and rejects future schedules',
            async () => {

                const requeueExistingJob =
                    vi.fn();


                const scheduler =
                    new InMemoryDeferredRetryScheduler(
                        {
                            requeueExistingJob,
                        },
                    );


                await scheduler.schedule(
                    createTask(
                        '2026-08-19T10:00:01.000Z',
                    ),
                );


                await scheduler.shutdown();


                await vi.advanceTimersByTimeAsync(
                    1_000,
                );


                expect(
                    requeueExistingJob,
                ).not.toHaveBeenCalled();


                await expect(
                    scheduler.schedule(
                        createTask(
                            '2026-08-19T10:00:02.000Z',
                        ),
                    ),
                ).rejects.toThrow(
                    'Deferred retry scheduler is shut down.',
                );
            },
        );


        it(
            'reports requeue failures through the error handler',
            async () => {

                const failure =
                    new Error(
                        'queue unavailable',
                    );


                const requeueExistingJob =
                    vi.fn()
                        .mockRejectedValue(
                            failure,
                        );


                const onError =
                    vi.fn();


                const scheduler =
                    new InMemoryDeferredRetryScheduler(
                        {
                            requeueExistingJob,
                        },
                        {
                            onError,
                        },
                    );


                const task =
                    createTask(
                        '2026-08-19T10:00:01.000Z',
                    );


                await scheduler.schedule(
                    task,
                );


                await vi.advanceTimersByTimeAsync(
                    1_000,
                );


                expect(
                    onError,
                ).toHaveBeenCalledTimes(
                    1,
                );


                expect(
                    onError,
                ).toHaveBeenCalledWith(
                    failure,
                    expect.objectContaining({
                        reason:
                            'RATE_LIMITED',
                    }),
                );
            },
        );


        it(
            'rejects an invalid retryAt timestamp',
            async () => {

                const scheduler =
                    new InMemoryDeferredRetryScheduler(
                        {
                            requeueExistingJob:
                                vi.fn(),
                        },
                    );


                await expect(
                    scheduler.schedule(
                        createTask(
                            'not-a-date',
                        ),
                    ),
                ).rejects.toThrow(
                    'Invalid retryAt for job job-1.',
                );
            },
        );
    },
);
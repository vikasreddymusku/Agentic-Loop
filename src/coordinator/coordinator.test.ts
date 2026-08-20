import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import type {
    Request,
} from '@crawlee/core';

import type {
    FetchEnvelope,
} from '../core/contracts/fetch-envelope.js';

import type {
    QueuedScrapeJob,
} from '../request-manager/types.js';

import {
    Coordinator,
} from './coordinator.js';


function createRequest(
    maxRetries =
        3,
): Request<QueuedScrapeJob> {

    return {

        userData: {

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

                maxRetries,

                createdAt:
                    '2026-08-19T10:00:00.000Z',
            },

            state: {

                status:
                    'QUEUED',

                attempt:
                    0,

                deferredRetryCount:
                    0,

                domain:
                    'example.com',

                updatedAt:
                    '2026-08-19T10:00:00.000Z',
            },
        },
    } as unknown as Request<QueuedScrapeJob>;
}


const ENVELOPE:
    FetchEnvelope = {

        requestedUrl:
            'https://example.com/',

        finalUrl:
            'https://example.com/',

        redirects:
            [],

        statusCode:
            200,

        headers:
            {},

        rawBody:
            Buffer.from(
                'hello',
            ),

        bodyBytes:
            5,

        bodyTruncated:
            false,

        fetchDurationMs:
            10,
    };


function createDependencies() {

    const requestManager = {

        markProcessing:
            vi.fn(
                (
                    request:
                        Request<QueuedScrapeJob>,
                ) => {

                    request.userData.state.status =
                        'PROCESSING';

                    request.userData.state.attempt +=
                        1;
                },
            ),

        markRetryScheduled:
            vi.fn(
                (
                    request:
                        Request<QueuedScrapeJob>,

                    reason:
                        'RATE_LIMITED',

                    message?:
                        string,
                ) => {

                    request.userData.state.status =
                        'RETRY_SCHEDULED';

                    request.userData.state
                        .deferredRetryCount +=
                        1;

                    request.userData.state
                        .lastAccessReason =
                        reason;

                    request.userData.state
                        .lastError =
                        message;
                },
            ),

        markUserActionRequired:
            vi.fn(
                (
                    request:
                        Request<QueuedScrapeJob>,

                    reason:
                        'CAPTCHA',

                    message:
                        string,
                ) => {

                    request.userData.state.status =
                        'USER_ACTION_REQUIRED';

                    request.userData.state
                        .lastAccessReason =
                        reason;

                    request.userData.state
                        .lastError =
                        message;
                },
            ),

        markReadyForParsing:
            vi.fn(
                (
                    request:
                        Request<QueuedScrapeJob>,
                ) => {

                    request.userData.state.status =
                        'READY_FOR_PARSING';
                },
            ),

        markFailed:
            vi.fn(
                (
                    request:
                        Request<QueuedScrapeJob>,

                    error:
                        Error,

                    reason?:
                        QueuedScrapeJob[
                            'state'
                        ][
                            'lastAccessReason'
                        ],
                ) => {

                    request.userData.state.status =
                        'FAILED_FINAL';

                    request.userData.state.lastError =
                        error.message;

                    request.userData.state
                        .lastAccessReason =
                        reason;
                },
            ),
    };


    const fastFetcher = {

        fetch:
            vi.fn()
                .mockResolvedValue(
                    ENVELOPE,
                ),
    };


    const accessController = {

        preflight:
            vi.fn()
                .mockResolvedValue({
                    decision:
                        'ALLOW',
                }),

        evaluate:
            vi.fn()
                .mockResolvedValue({
                    decision:
                        'ALLOW',
                }),
    };


    const retryScheduler = {

        schedule:
            vi.fn()
                .mockResolvedValue(
                    undefined,
                ),

        cancel:
            vi.fn()
                .mockResolvedValue(
                    undefined,
                ),

        shutdown:
            vi.fn()
                .mockResolvedValue(
                    undefined,
                ),
    };


    const pendingActions = {

        set:
            vi.fn()
                .mockResolvedValue(
                    undefined,
                ),

        get:
            vi.fn(),

        delete:
            vi.fn(),

        list:
            vi.fn(),
    };


    return {
        requestManager,
        fastFetcher,
        accessController,
        retryScheduler,
        pendingActions,
    };
}


describe(
    'Coordinator',
    () => {

        it(
            'moves successful access to READY_FOR_PARSING',
            async () => {

                const deps =
                    createDependencies();


                const coordinator =
                    new Coordinator(
                        deps.requestManager,
                        deps.fastFetcher,
                        deps.accessController,
                        deps.retryScheduler,
                        deps.pendingActions,
                    );


                const request =
                    createRequest();


                await coordinator.handle(
                    request,
                );


                expect(
                    deps.requestManager
                        .markProcessing,
                ).toHaveBeenCalledOnce();


                expect(
                    deps.fastFetcher.fetch,
                ).toHaveBeenCalledOnce();


                expect(
                    deps.accessController.evaluate,
                ).toHaveBeenCalledOnce();


                expect(
                    deps.requestManager
                        .markReadyForParsing,
                ).toHaveBeenCalledOnce();


                expect(
                    request.userData.state.status,
                ).toBe(
                    'READY_FOR_PARSING',
                );
            },
        );


        it(
            'does not fetch when preflight returns RETRY_LATER',
            async () => {

                const deps =
                    createDependencies();


                deps.accessController
                    .preflight
                    .mockResolvedValue({
                        decision:
                            'RETRY_LATER',

                        reason:
                            'RATE_LIMITED',

                        retryAfterMs:
                            30_000,

                        message:
                            'Cooldown active.',
                    });


                const coordinator =
                    new Coordinator(
                        deps.requestManager,
                        deps.fastFetcher,
                        deps.accessController,
                        deps.retryScheduler,
                        deps.pendingActions,
                        {
                            now:
                                () =>
                                    Date.parse(
                                        '2026-08-19T10:00:00.000Z',
                                    ),
                        },
                    );


                await coordinator.handle(
                    createRequest(),
                );


                expect(
                    deps.fastFetcher.fetch,
                ).not.toHaveBeenCalled();


                expect(
                    deps.retryScheduler.schedule,
                ).toHaveBeenCalledOnce();


                expect(
                    deps.retryScheduler.schedule,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({

                        reason:
                            'RATE_LIMITED',

                        retryAt:
                            '2026-08-19T10:00:30.000Z',
                    }),
                );
            },
        );


        it(
            'stores USER_ACTION_REQUIRED without fetching when detected during preflight',
            async () => {

                const deps =
                    createDependencies();


                deps.accessController
                    .preflight
                    .mockResolvedValue({
                        decision:
                            'USER_ACTION_REQUIRED',

                        reason:
                            'CAPTCHA',

                        action:
                            'CAPTCHA',

                        message:
                            'Human verification required.',

                        actionUrl:
                            'https://example.com/challenge',
                    });


                const coordinator =
                    new Coordinator(
                        deps.requestManager,
                        deps.fastFetcher,
                        deps.accessController,
                        deps.retryScheduler,
                        deps.pendingActions,
                    );


                await coordinator.handle(
                    createRequest(),
                );


                expect(
                    deps.fastFetcher.fetch,
                ).not.toHaveBeenCalled();


                expect(
                    deps.pendingActions.set,
                ).toHaveBeenCalledOnce();


                expect(
                    deps.requestManager
                        .markUserActionRequired,
                ).toHaveBeenCalledOnce();
            },
        );


        it(
            'marks a DENY evaluation as FAILED_FINAL',
            async () => {

                const deps =
                    createDependencies();


                deps.accessController
                    .evaluate
                    .mockResolvedValue({
                        decision:
                            'DENY',

                        reason:
                            'FORBIDDEN',

                        message:
                            'Access forbidden.',
                    });


                const coordinator =
                    new Coordinator(
                        deps.requestManager,
                        deps.fastFetcher,
                        deps.accessController,
                        deps.retryScheduler,
                        deps.pendingActions,
                    );


                const request =
                    createRequest();


                await coordinator.handle(
                    request,
                );


                expect(
                    deps.requestManager.markFailed,
                ).toHaveBeenCalledOnce();


                expect(
                    request.userData.state.status,
                ).toBe(
                    'FAILED_FINAL',
                );


                expect(
                    request.userData.state
                        .lastAccessReason,
                ).toBe(
                    'FORBIDDEN',
                );
            },
        );


        it(
            'stops policy retries when the overall attempt budget is exhausted',
            async () => {

                const deps =
                    createDependencies();


                deps.accessController
                    .evaluate
                    .mockResolvedValue({
                        decision:
                            'RETRY_LATER',

                        reason:
                            'RATE_LIMITED',

                        retryAfterMs:
                            1_000,

                        message:
                            'Rate limited.',
                    });


                /**
                 * maxRetries = 0 means:
                 *
                 * first attempt only.
                 */
                const request =
                    createRequest(
                        0,
                    );


                const coordinator =
                    new Coordinator(
                        deps.requestManager,
                        deps.fastFetcher,
                        deps.accessController,
                        deps.retryScheduler,
                        deps.pendingActions,
                    );


                await coordinator.handle(
                    request,
                );


                expect(
                    request.userData.state.attempt,
                ).toBe(
                    1,
                );


                expect(
                    deps.retryScheduler.schedule,
                ).not.toHaveBeenCalled();


                expect(
                    deps.requestManager.markFailed,
                ).toHaveBeenCalledOnce();


                expect(
                    request.userData.state.status,
                ).toBe(
                    'FAILED_FINAL',
                );
            },
        );


        it(
            'rolls back RETRY_SCHEDULED state when scheduler persistence fails',
            async () => {

                const deps =
                    createDependencies();


                deps.accessController
                    .evaluate
                    .mockResolvedValue({
                        decision:
                            'RETRY_LATER',

                        reason:
                            'RATE_LIMITED',

                        retryAfterMs:
                            1_000,

                        message:
                            'Rate limited.',
                    });


                deps.retryScheduler
                    .schedule
                    .mockRejectedValue(
                        new Error(
                            'scheduler unavailable',
                        ),
                    );


                const request =
                    createRequest();


                const coordinator =
                    new Coordinator(
                        deps.requestManager,
                        deps.fastFetcher,
                        deps.accessController,
                        deps.retryScheduler,
                        deps.pendingActions,
                    );


                await expect(
                    coordinator.handle(
                        request,
                    ),
                ).rejects.toThrow(
                    'scheduler unavailable',
                );


                /**
                 * markProcessing already happened.
                 *
                 * The RETRY_SCHEDULED mutation should
                 * have been rolled back.
                 */
                expect(
                    request.userData.state.status,
                ).toBe(
                    'PROCESSING',
                );


                expect(
                    request.userData.state
                        .deferredRetryCount,
                ).toBe(
                    0,
                );
            },
        );
    },
);
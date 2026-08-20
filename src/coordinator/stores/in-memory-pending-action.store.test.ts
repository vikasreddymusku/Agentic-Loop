import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    PendingAction,
} from '../contracts/pending-action-store.js';

import {
    InMemoryPendingActionStore,
} from './in-memory-pending-action.store.js';


function createAction(
    jobId:
        string,
): PendingAction {

    return {
        queuedJob: {

            job: {
                id:
                    jobId,

                url:
                    'https://example.com/private',

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
                    'USER_ACTION_REQUIRED',

                attempt:
                    1,

                deferredRetryCount:
                    0,

                domain:
                    'example.com',

                lastAccessReason:
                    'CAPTCHA',

                lastError:
                    'Human verification is required.',

                updatedAt:
                    '2026-08-19T10:00:01.000Z',
            },
        },

        evaluation: {
            decision:
                'USER_ACTION_REQUIRED',

            reason:
                'CAPTCHA',

            action:
                'CAPTCHA',

            message:
                'Human verification is required.',

            actionUrl:
                'https://example.com/challenge',
        },

        createdAt:
            '2026-08-19T10:00:01.000Z',

        sessionRef:
            'session-1',
    };
}


describe(
    'InMemoryPendingActionStore',
    () => {

        it(
            'stores and retrieves a pending action by logical job id',
            async () => {

                const store =
                    new InMemoryPendingActionStore();


                const action =
                    createAction(
                        'job-1',
                    );


                await store.set(
                    action,
                );


                const result =
                    await store.get(
                        'job-1',
                    );


                expect(
                    result,
                ).toEqual(
                    action,
                );
            },
        );


        it(
            'returns null when the job has no pending action',
            async () => {

                const store =
                    new InMemoryPendingActionStore();


                await expect(
                    store.get(
                        'missing-job',
                    ),
                ).resolves.toBeNull();
            },
        );


        it(
            'replaces the pending action for the same logical job',
            async () => {

                const store =
                    new InMemoryPendingActionStore();


                const first =
                    createAction(
                        'job-1',
                    );


                const second =
                    createAction(
                        'job-1',
                    );


                second.sessionRef =
                    'session-2';


                second.evaluation.message =
                    'Updated verification required.';


                await store.set(
                    first,
                );


                await store.set(
                    second,
                );


                const result =
                    await store.get(
                        'job-1',
                    );


                expect(
                    result?.sessionRef,
                ).toBe(
                    'session-2',
                );


                expect(
                    result?.evaluation.message,
                ).toBe(
                    'Updated verification required.',
                );


                expect(
                    await store.list(),
                ).toHaveLength(
                    1,
                );
            },
        );


        it(
            'deletes a pending action',
            async () => {

                const store =
                    new InMemoryPendingActionStore();


                await store.set(
                    createAction(
                        'job-1',
                    ),
                );


                await store.delete(
                    'job-1',
                );


                await expect(
                    store.get(
                        'job-1',
                    ),
                ).resolves.toBeNull();
            },
        );


        it(
            'lists all pending actions',
            async () => {

                const store =
                    new InMemoryPendingActionStore();


                await store.set(
                    createAction(
                        'job-1',
                    ),
                );


                await store.set(
                    createAction(
                        'job-2',
                    ),
                );


                const result =
                    await store.list();


                expect(
                    result,
                ).toHaveLength(
                    2,
                );


                expect(
                    result.map(
                        action =>
                            action.queuedJob.job.id,
                    ),
                ).toEqual([
                    'job-1',
                    'job-2',
                ]);
            },
        );


        it(
            'uses defensive copies on set and get',
            async () => {

                const store =
                    new InMemoryPendingActionStore();


                const original =
                    createAction(
                        'job-1',
                    );


                await store.set(
                    original,
                );


                original.sessionRef =
                    'mutated-after-set';


                const firstRead =
                    await store.get(
                        'job-1',
                    );


                expect(
                    firstRead?.sessionRef,
                ).toBe(
                    'session-1',
                );


                if (
                    firstRead !== null
                ) {

                    firstRead.sessionRef =
                        'mutated-after-get';
                }


                const secondRead =
                    await store.get(
                        'job-1',
                    );


                expect(
                    secondRead?.sessionRef,
                ).toBe(
                    'session-1',
                );
            },
        );
    },
);
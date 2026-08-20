import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import {
    Request,
} from '@crawlee/core';

import type {
    QueuedScrapeJob,
} from './types.js';

import {
    RequestManager,
} from './request-manager.js';


function createRequest():
    Request<QueuedScrapeJob> {

    const queuedJob:
        QueuedScrapeJob = {

        job: {

            id:
                'parser-job-1',

            url:
                'https://example.com/product',

            requestedFields: [
                {
                    name:
                        'title',

                    type:
                        'string',

                    required:
                        true,
                },
            ],

            maxRetries:
                3,

            createdAt:
                '2026-08-20T10:00:00.000Z',
        },

        state: {

            status:
                'PROCESSING',

            attempt:
                3,

            deferredRetryCount:
                2,

            domain:
                'example.com',

            lastAccessReason:
                'RATE_LIMITED',

            lastError:
                'Previous error',

            updatedAt:
                '2026-08-20T10:00:00.000Z',
        },
    };


    return new Request<QueuedScrapeJob>({

        url:
            queuedJob.job.url,

        uniqueKey:
            'parser-failure-test-request',

        userData:
            queuedJob,
    });
}


describe(
    'ScrapeRequestManager.markParserFailed',
    () => {

        afterEach(
            () => {

                vi.useRealTimers();
            },
        );


        it(
            'sets PARSER_FAILED and records the parser failure message',
            () => {

                vi.useFakeTimers();


                vi.setSystemTime(
                    new Date(
                        '2026-08-20T12:30:00.000Z',
                    ),
                );


                const requestManager =
                    new RequestManager();


                const request =
                    createRequest();


                requestManager
                    .markParserFailed(
                        request,
                        'Required field "price" could not be validated.',
                    );


                expect(
                    request
                        .userData
                        .state
                        .status,
                ).toBe(
                    'PARSER_FAILED',
                );


                expect(
                    request
                        .userData
                        .state
                        .lastError,
                ).toBe(
                    'Required field "price" could not be validated.',
                );


                expect(
                    request
                        .userData
                        .state
                        .updatedAt,
                ).toBe(
                    '2026-08-20T12:30:00.000Z',
                );
            },
        );


        it(
            'does not modify attempt deferredRetryCount or lastAccessReason',
            () => {

                const requestManager =
                    new RequestManager();


                const request =
                    createRequest();


                const attemptBefore =
                    request
                        .userData
                        .state
                        .attempt;


                const deferredRetryCountBefore =
                    request
                        .userData
                        .state
                        .deferredRetryCount;


                const accessReasonBefore =
                    request
                        .userData
                        .state
                        .lastAccessReason;


                requestManager
                    .markParserFailed(
                        request,
                        'Parser validation failed.',
                    );


                expect(
                    request
                        .userData
                        .state
                        .attempt,
                ).toBe(
                    attemptBefore,
                );


                expect(
                    request
                        .userData
                        .state
                        .deferredRetryCount,
                ).toBe(
                    deferredRetryCountBefore,
                );


                expect(
                    request
                        .userData
                        .state
                        .lastAccessReason,
                ).toBe(
                    accessReasonBefore,
                );
            },
        );


        it(
            'does not convert parser failure into retry or FAILED_FINAL',
            () => {

                const requestManager =
                    new RequestManager();


                const request =
                    createRequest();


                /**
                 * Notice that RequestManager has NOT
                 * been initialize()'d.
                 *
                 * markParserFailed() must still work,
                 * proving that it performs no
                 * RequestQueue operation.
                 */
                requestManager
                    .markParserFailed(
                        request,
                        'Requested schema was not satisfied.',
                    );


                expect(
                    request
                        .userData
                        .state
                        .status,
                ).toBe(
                    'PARSER_FAILED',
                );


                expect(
                    request
                        .userData
                        .state
                        .status,
                ).not.toBe(
                    'FAILED_FINAL',
                );


                expect(
                    request
                        .userData
                        .state
                        .status,
                ).not.toBe(
                    'RETRYING',
                );


                expect(
                    request
                        .userData
                        .state
                        .status,
                ).not.toBe(
                    'RETRY_SCHEDULED',
                );
            },
        );
    },
);
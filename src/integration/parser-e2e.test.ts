import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import {
    createServer,
} from 'node:http';

import type {
    Server,
} from 'node:http';

import {
    BasicCrawler,
} from '@crawlee/basic';

import {
    GotScrapingHttpClient,
} from '@crawlee/core';

import type {
    Request,
} from '@crawlee/core';

import {
    RequestManager,
} from '../request-manager/request-manager.js';

import type {
    QueuedScrapeJob,
} from '../request-manager/types.js';

import {
    FastFetcher,
} from '../fetcher/fast-fetcher.js';

import {
    FETCHER_CONFIG,
} from '../config/fetcher.config.js';

import {
    AccessController,
} from '../access-controller/access-controller.js';

import {
    ACCESS_CONFIG,
} from '../config/access.config.js';

import {
    ConfidenceSignalResolver,
} from '../access-controller/resolvers/confidence-signal.resolver.js';

import {
    MemoryStateStore,
} from '../access-controller/state/memory-state.store.js';

import {
    TransportErrorDetector,
} from '../access-controller/detectors/transport-error.detector.js';

import {
    HttpStatusDetector,
} from '../access-controller/detectors/http-status.detector.js';

import {
    RedirectDetector,
} from '../access-controller/detectors/redirect.detector.js';

import {
    ChallengeDetector,
} from '../access-controller/detectors/challenge.detector.js';

import {
    RateLimitPolicy,
} from '../access-controller/policies/rate-limit.policy.js';

import {
    RetryPolicy,
} from '../access-controller/policies/retry.policy.js';

import {
    UserActionPolicy,
} from '../access-controller/policies/user-action.policy.js';

import {
    DenyPolicy,
} from '../access-controller/policies/deny.policy.js';

import {
    InMemoryDeferredRetryScheduler,
} from '../coordinator/schedulers/in-memory-deferred-retry.scheduler.js';

import {
    InMemoryPendingActionStore,
} from '../coordinator/stores/in-memory-pending-action.store.js';

import {
    Coordinator,
} from '../coordinator/coordinator.js';

import {
    JsonLdExtractor,
} from '../parser/extractors/json-ld.extractor.js';

import {
    MetaExtractor,
} from '../parser/extractors/meta.extractor.js';

import {
    MicrodataExtractor,
} from '../parser/extractors/microdata.extractor.js';

import {
    DomExtractor,
} from '../parser/extractors/dom.extractor.js';

import {
    DefaultFieldMatcher,
} from '../parser/matchers/default-field-matcher.js';

import {
    ParserOrchestrator,
} from '../parser/orchestrator/parser-orchestrator.js';

import {
    DefaultFieldResolver,
} from '../parser/resolvers/default-field-resolver.js';

import {
    DefaultNormalizer,
} from '../parser/normalizers/default-normalizer.js';

import {
    DefaultValidator,
} from '../parser/validators/default-validator.js';

import {
    DefaultParserPipeline,
} from '../parser/pipeline/default-parser-pipeline.js';

import {
    DefaultParserOutcomePolicy,
} from '../parser/policies/default-parser-outcome-policy.js';


type RequestedFields =
    QueuedScrapeJob[
        'job'
    ][
        'requestedFields'
    ];


type RunResult = {

    state:
        QueuedScrapeJob[
            'state'
        ];

    httpRequestCount:
        number;
};


/**
 * Page containing every required field.
 *
 * Expected:
 *
 * VALID
 * → COMPLETE / FULL
 * → SUCCESS
 */
const VALID_HTML = `
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">

        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Acme Corp",
            "telephone": "+1-555-1234"
        }
        </script>
    </head>

    <body>
        <h1>Acme Corp</h1>
    </body>
</html>
`;


/**
 * Required fields exist.
 *
 * Optional email is deliberately absent.
 *
 * Expected:
 *
 * PARTIAL
 * → COMPLETE / PARTIAL
 * → SUCCESS
 */
const PARTIAL_HTML = `
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">

        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Acme Corp",
            "telephone": "+1-555-1234"
        }
        </script>
    </head>

    <body>
        <h1>Acme Corp</h1>
    </body>
</html>
`;


/**
 * telephone is deliberately absent.
 *
 * The JSON-LD itself is completely valid.
 *
 * Expected:
 *
 * INVALID
 * → PARSER_FAILURE
 * → PARSER_FAILED
 */
const MISSING_REQUIRED_HTML = `
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">

        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Acme Corp"
        }
        </script>
    </head>

    <body>
        <h1>Acme Corp</h1>
    </body>
</html>
`;


describe(
    'End-to-end parser runtime',
    () => {

        let server:
            Server;


        let baseUrl:
            string;

        let suiteRequestManager:
            RequestManager;


        const requestCounts =
            new Map<
                string,
                number
            >();


        /**
         * Real local HTTP server.
         *
         * There are no network mocks in this test.
         */
        beforeAll(
            async () => {
                suiteRequestManager =
                    new RequestManager();


                await suiteRequestManager
                    .initialize();


/**
 * Start the E2E suite with a clean
 * Crawlee request queue.
 */
                await suiteRequestManager
                    .getRequestQueue()
                    .drop();


/**
 * drop() removes the queue, so reopen it.
 */
                await suiteRequestManager
                    .initialize();

                server =
                    createServer(
                        (
                            request,
                            response,
                        ) => {

                            const pathname =
                                new URL(
                                    request.url
                                    ?? '/',

                                    'http://127.0.0.1',
                                )
                                    .pathname;


                            requestCounts.set(
                                pathname,

                                (
                                    requestCounts.get(
                                        pathname,
                                    )
                                    ?? 0
                                )
                                + 1,
                            );


                            response.setHeader(
                                'Content-Type',
                                'text/html; charset=utf-8',
                            );


                            response.setHeader(
                                'Cache-Control',
                                'no-store',
                            );


                            switch (
                                pathname
                            ) {

                                case '/valid':

                                    response.writeHead(
                                        200,
                                    );

                                    response.end(
                                        VALID_HTML,
                                    );

                                    return;


                                case '/partial':

                                    response.writeHead(
                                        200,
                                    );

                                    response.end(
                                        PARTIAL_HTML,
                                    );

                                    return;


                                case '/missing-required':

                                    response.writeHead(
                                        200,
                                    );

                                    response.end(
                                        MISSING_REQUIRED_HTML,
                                    );

                                    return;


                                default:

                                    response.writeHead(
                                        404,
                                    );

                                    response.end(
                                        'Not Found',
                                    );
                            }
                        },
                    );


                await new Promise<void>(
                    (
                        resolve,
                        reject,
                    ) => {

                        const onError =
                            (
                                error:
                                    Error,
                            ) => {

                                reject(
                                    error,
                                );
                            };


                        server.once(
                            'error',
                            onError,
                        );


                        server.listen(
                            0,
                            '127.0.0.1',
                            () => {

                                server.off(
                                    'error',
                                    onError,
                                );


                                resolve();
                            },
                        );
                    },
                );


                const address =
                    server.address();


                if (
                    address === null
                    || typeof address
                        === 'string'
                ) {

                    throw new Error(
                        'E2E HTTP server did not expose a TCP address.',
                    );
                }


                baseUrl =
                    `http://127.0.0.1:${address.port}`;
            },
        );


        afterAll(
            async () => {

        /**
         * Remove all E2E queue data so
         * future test runs start clean.
         */
                await suiteRequestManager
                    .getRequestQueue()
                    .drop();


                await new Promise<void>(
                    (
                        resolve,
                        reject,
                    ) => {

                        server.close(
                            (
                                error,
                            ) => {

                                if (
                                    error
                                ) {

                            reject(
                                error,
                            );

                            return;
                                }


                                resolve();
                            },
                        );


                        server.closeAllConnections();
                    },
                );
            },
        );


        async function runJob(
            path:
                string,

            requestedFields:
                RequestedFields,
        ): Promise<RunResult> {

            const url =
                `${baseUrl}${path}`;


            const beforeHttpCount =
                requestCounts.get(
                    path,
                )
                ?? 0;


            /**
             * Use the same real HTTP implementation as the
             * application runtime.
             */
            const httpClient =
                new GotScrapingHttpClient();


            const requestManager =
                suiteRequestManager;


            /**
             * Real fetch layer.
             */
            const fastFetcher =
                new FastFetcher(
                    FETCHER_CONFIG,
                    httpClient,
                );


            /**
             * Real access-control stack.
             */
            const accessStateStore =
                new MemoryStateStore();


            const signalResolver =
                new ConfidenceSignalResolver(
                    ACCESS_CONFIG,
                );


            const detectors = [
                new TransportErrorDetector(),
                new HttpStatusDetector(),
                new RedirectDetector(),
                new ChallengeDetector(
                    ACCESS_CONFIG,
                ),
            ];


            const policies = [
                new RateLimitPolicy(),
                new RetryPolicy(),
                new UserActionPolicy(),
                new DenyPolicy(),
            ];


            const accessController =
                new AccessController(
                    ACCESS_CONFIG,
                    detectors,
                    signalResolver,
                    policies,
                    accessStateStore,
                );


            /**
             * Real retry/user-action infrastructure.
             */
            const retryScheduler =
                new InMemoryDeferredRetryScheduler(
                    {
                        requeueExistingJob:
                            (
                                input,
                            ) =>
                                requestManager
                                    .requeueExistingJob(
                                        input,
                                    ),
                    },
                );


            const pendingActionStore =
                new InMemoryPendingActionStore();


            /**
             * Real deterministic parser stack.
             */
            const parserOrchestrator =
                new ParserOrchestrator(
                    [
                        new JsonLdExtractor(),
                        new MetaExtractor(),
                        new MicrodataExtractor(),
                        new DomExtractor(),
                    ],

                    new DefaultFieldMatcher(),
                );


            const parserPipeline =
                new DefaultParserPipeline(
                    parserOrchestrator,
                    new DefaultFieldResolver(),
                    new DefaultNormalizer(),
                    new DefaultValidator(),
                );


            const parserOutcomePolicy =
                new DefaultParserOutcomePolicy();


            /**
             * Real Coordinator.
             */
            const coordinator =
                new Coordinator(
                    requestManager,
                    fastFetcher,
                    accessController,
                    retryScheduler,
                    pendingActionStore,
                    parserPipeline,
                    parserOutcomePolicy,
                );


            /**
             * forceRefresh ensures previous test runs cannot
             * cause URL deduplication to skip this execution.
             *
             * maxRetries = 0 makes unexpected failures fail
             * this E2E test immediately instead of hiding behind
             * crawler retries.
             */
            const enqueueResult =
                await requestManager
                    .enqueue({
                        url,

                        requestedFields,

                        maxRetries:
                            0,

                        forceRefresh:
                            true,
                    });


            let finalState:
                QueuedScrapeJob[
                    'state'
                ]
                | undefined;


            let handledTargetCount =
                0;


            let unexpectedCrawlerError:
                Error
                | undefined;


            const crawler =
                new BasicCrawler({

                    requestQueue:
                        requestManager
                            .getRequestQueue(),

                    /**
                     * Same HTTP client is shared between
                     * BasicCrawler and FastFetcher.
                     */
                    httpClient,

                    /**
                     * This test is a finite queue run.
                     *
                     * Production uses keepAlive=true because
                     * deferred retries use in-memory timers.
                     */
                    keepAlive:
                        false,

                    /**
                     * Access/block retry policy belongs to
                     * AccessController, not Crawlee.
                     */
                    retryOnBlocked:
                        false,

                    /**
                     * Deterministic execution for the E2E test.
                     */
                    maxConcurrency:
                        1,


                    requestHandler:
                        async (
                            {
                                request,
                            },
                        ) => {

                            const typedRequest =
                                request as Request<QueuedScrapeJob>;
                                ;


                            await coordinator
                                .handle(
                                    typedRequest,
                                );


                            /**
                             * Capture only the job created by
                             * this particular runJob() call.
                             *
                             * This prevents stale queue entries
                             * from influencing the assertion.
                             */
                            if (
                                typedRequest
                                    .userData
                                    .job
                                    .id
                                === enqueueResult
                                    .jobId
                            ) {

                                handledTargetCount +=
                                    1;


                                finalState =
                                    structuredClone(
                                        typedRequest
                                            .userData
                                            .state,
                                    );
                            }
                        },


                    errorHandler:
                        async (
                            {
                                request,
                            },
                            error,
                        ) => {

                            const typedRequest =
                                request as Request<QueuedScrapeJob>;
                                ;


                            requestManager
                                .markRetrying(
                                    typedRequest,
                                    error,
                                );


                            if (
                                typedRequest
                                    .userData
                                    .job
                                    .id
                                === enqueueResult
                                    .jobId
                            ) {

                                unexpectedCrawlerError =
                                    error;
                            }
                        },


                    failedRequestHandler:
                        async (
                            {
                                request,
                            },
                            error,
                        ) => {

                            const typedRequest =
                                request as Request<QueuedScrapeJob>;
                                ;


                            requestManager
                                .markFailed(
                                    typedRequest,
                                    error,
                                );


                            if (
                                typedRequest
                                    .userData
                                    .job
                                    .id
                                === enqueueResult
                                    .jobId
                            ) {

                                unexpectedCrawlerError =
                                    error;
                            }
                        },
                });


            try {

                await crawler.run();

            } finally {

                /**
                 * No retry timers should exist in these cases,
                 * but explicitly shut the scheduler down so the
                 * integration test cannot leak timers.
                 */
                await retryScheduler
                    .shutdown();
            }


            /**
             * An unexpected exception is NOT a legitimate
             * PARSER_FAILED result.
             *
             * It must fail the E2E test.
             */
            if (
                unexpectedCrawlerError
                !== undefined
            ) {

                throw unexpectedCrawlerError;
            }


            if (
                handledTargetCount
                !== 1
            ) {

                throw new Error(
                    `Expected target job `
                    + `${enqueueResult.jobId} `
                    + `to be handled exactly once, `
                    + `but it was handled `
                    + `${handledTargetCount} times.`,
                );
            }


            if (
                finalState
                === undefined
            ) {

                throw new Error(
                    `Target job `
                    + `${enqueueResult.jobId} `
                    + `completed without a captured final state.`,
                );
            }


            const afterHttpCount =
                requestCounts.get(
                    path,
                )
                ?? 0;


            return {

                state:
                    finalState,

                httpRequestCount:
                    afterHttpCount
                    - beforeHttpCount,
            };
        }


        it(
            'reaches SUCCESS for real HTML containing every required field',
            async () => {

                const result =
                    await runJob(
                        '/valid',
                        [
                            {
                                name:
                                    'businessName',

                                type:
                                    'string',

                                aliases: [
                                    'name',
                                ],

                                required:
                                    true,
                            },

                            {
                                name:
                                    'phone',

                                type:
                                    'string',

                                aliases: [
                                    'telephone',
                                ],

                                required:
                                    true,
                            },
                        ],
                    );


                /**
                 * Proves an actual HTTP request reached
                 * our real local server.
                 */
                expect(
                    result.httpRequestCount,
                ).toBe(
                    1,
                );


                expect(
                    result.state.status,
                ).toBe(
                    'SUCCESS',
                );


                expect(
                    result.state.attempt,
                ).toBe(
                    1,
                );


                expect(
                    result.state.lastError,
                ).toBeUndefined();


                expect(
                    result.state.lastAccessReason,
                ).toBeUndefined();
            },

            15_000,
        );


        it(
            'reaches SUCCESS when required fields pass but an optional field is missing',
            async () => {

                const result =
                    await runJob(
                        '/partial',
                        [
                            {
                                name:
                                    'businessName',

                                type:
                                    'string',

                                aliases: [
                                    'name',
                                ],

                                required:
                                    true,
                            },

                            {
                                name:
                                    'phone',

                                type:
                                    'string',

                                aliases: [
                                    'telephone',
                                ],

                                required:
                                    true,
                            },

                            {
                                name:
                                    'email',

                                type:
                                    'string',

                                required:
                                    false,
                            },
                        ],
                    );


                expect(
                    result.httpRequestCount,
                ).toBe(
                    1,
                );


                /**
                 * PARTIAL validation is intentionally
                 * a successful lifecycle outcome when
                 * all required fields succeeded.
                 */
                expect(
                    result.state.status,
                ).toBe(
                    'SUCCESS',
                );


                expect(
                    result.state.attempt,
                ).toBe(
                    1,
                );


                expect(
                    result.state.lastError,
                ).toBeUndefined();
            },

            15_000,
        );


        it(
            'reaches PARSER_FAILED when real HTML is missing a required field',
            async () => {

                const result =
                    await runJob(
                        '/missing-required',
                        [
                            {
                                name:
                                    'businessName',

                                type:
                                    'string',

                                aliases: [
                                    'name',
                                ],

                                required:
                                    true,
                            },

                            {
                                name:
                                    'phone',

                                type:
                                    'string',

                                aliases: [
                                    'telephone',
                                ],

                                required:
                                    true,
                            },
                        ],
                    );


                expect(
                    result.httpRequestCount,
                ).toBe(
                    1,
                );


                expect(
                    result.state.status,
                ).toBe(
                    'PARSER_FAILED',
                );


                expect(
                    result.state.attempt,
                ).toBe(
                    1,
                );


                /**
                 * Parser failure must not be confused
                 * with an access failure.
                 */
                expect(
                    result.state.lastAccessReason,
                ).toBeUndefined();


                expect(
                    result.state.lastError,
                ).toContain(
                    'INVALID',
                );
            },

            15_000,
        );
    },
);
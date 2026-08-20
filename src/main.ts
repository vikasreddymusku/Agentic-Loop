import {
    GotScrapingHttpClient,
} from '@crawlee/core';

import type {
    Request,
} from '@crawlee/core';

import {
    BasicCrawler,
} from '@crawlee/basic';


import {
    ACCESS_CONFIG,
} from './config/access.config.js';

import {
    FETCHER_CONFIG,
} from './config/fetcher.config.js';


import {
    RequestManager,
} from './request-manager/request-manager.js';

import type {
    QueuedScrapeJob,
} from './request-manager/types.js';


import {
    FastFetcher,
} from './fetcher/fast-fetcher.js';


import {
    AccessController,
} from './access-controller/access-controller.js';

import {
    MemoryStateStore,
} from './access-controller/state/memory-state.store.js';


import {
    TransportErrorDetector,
} from './access-controller/detectors/transport-error.detector.js';

import {
    HttpStatusDetector,
} from './access-controller/detectors/http-status.detector.js';

import {
    RedirectDetector,
} from './access-controller/detectors/redirect.detector.js';

import {
    ChallengeDetector,
} from './access-controller/detectors/challenge.detector.js';


import {
    ConfidenceSignalResolver,
} from './access-controller/resolvers/confidence-signal.resolver.js';


import {
    RateLimitPolicy,
} from './access-controller/policies/rate-limit.policy.js';

import {
    RetryPolicy,
} from './access-controller/policies/retry.policy.js';

import {
    UserActionPolicy,
} from './access-controller/policies/user-action.policy.js';

import {
    DenyPolicy,
} from './access-controller/policies/deny.policy.js';


import {
    InMemoryDeferredRetryScheduler,
} from './coordinator/schedulers/in-memory-deferred-retry.scheduler.js';

import {
    InMemoryPendingActionStore,
} from './coordinator/stores/in-memory-pending-action.store.js';

import {
    Coordinator,
} from './coordinator/coordinator.js';


async function main():
    Promise<void> {

    /**
     * ------------------------------------------------
     * 1. Shared HTTP client
     * ------------------------------------------------
     *
     * The SAME client instance is supplied to:
     *
     * - BasicCrawler
     * - FastFetcher
     */
    const httpClient =
        new GotScrapingHttpClient();


    /**
     * ------------------------------------------------
     * 2. RequestManager
     * ------------------------------------------------
     */
    const requestManager =
        new RequestManager();


    await requestManager
        .initialize();


    /**
     * ------------------------------------------------
     * 3. FastFetcher
     * ------------------------------------------------
     */
    const fastFetcher =
        new FastFetcher(
            FETCHER_CONFIG,
            httpClient,
        );


    /**
     * ------------------------------------------------
     * 4. Access state
     * ------------------------------------------------
     */
    const accessStateStore =
        new MemoryStateStore();


    /**
     * ------------------------------------------------
     * 5. Access detectors
     * ------------------------------------------------
     */
    const detectors = [

        new TransportErrorDetector(),

        new HttpStatusDetector(),

        new RedirectDetector(),

        new ChallengeDetector(
            ACCESS_CONFIG,
        ),
    ];


    /**
     * ------------------------------------------------
     * 6. Signal resolver
     * ------------------------------------------------
     */
    const resolver =
        new ConfidenceSignalResolver(
            ACCESS_CONFIG,
        );


    /**
     * ------------------------------------------------
     * 7. Access policies
     * ------------------------------------------------
     */
    const policies = [

        new RateLimitPolicy(),

        new RetryPolicy(),

        new UserActionPolicy(),

        new DenyPolicy(),
    ];


    /**
     * ------------------------------------------------
     * 8. AccessController
     * ------------------------------------------------
     */
    const accessController =
        new AccessController(

            ACCESS_CONFIG,

            detectors,

            resolver,

            policies,

            accessStateStore,
        );


    /**
     * ------------------------------------------------
     * 9. Deferred retry scheduler
     * ------------------------------------------------
     *
     * Scheduler receives only the port it needs.
     *
     * It does NOT own RequestManager.
     */
    const retryScheduler =
        new InMemoryDeferredRetryScheduler({

            requeueExistingJob:
                input =>
                    requestManager
                        .requeueExistingJob(
                            input,
                        ),
        });


    /**
     * ------------------------------------------------
     * 10. Pending human-action storage
     * ------------------------------------------------
     */
    const pendingActionStore =
        new InMemoryPendingActionStore();


    /**
     * ------------------------------------------------
     * 11. Coordinator
     * ------------------------------------------------
     *
     * Processes exactly ONE Crawlee request.
     */
    const coordinator =
        new Coordinator(

            requestManager,

            fastFetcher,

            accessController,

            retryScheduler,

            pendingActionStore,
        );


    /**
     * Convert Crawlee's generic request type into
     * our known queue userData contract.
     *
     * RequestManager is the only code that creates
     * these queue entries, so this boundary cast is
     * kept here in the composition root.
     */
    const asQueuedRequest =
        (
            request:
                Request,
        ):
            Request<QueuedScrapeJob> => {

            return request as Request<QueuedScrapeJob>;
        };


    /**
     * ------------------------------------------------
     * 12. BasicCrawler
     * ------------------------------------------------
     *
     * BasicCrawler owns:
     *
     * - queue consumption
     * - concurrency
     * - unexpected exception retries
     *
     * Coordinator owns business orchestration.
     */
    const crawler =
        new BasicCrawler({

            requestQueue:
                requestManager
                    .getRequestQueue(),

            httpClient,

            /**
             * Required by our in-memory deferred
             * retry design.
             *
             * When the queue becomes temporarily
             * empty, the crawler remains alive and
             * waits for future requeued jobs.
             */
            keepAlive:
                true,

            /**
             * AccessController owns blocked/access
             * policy decisions.
             *
             * Do not let Crawlee independently
             * perform blocked-response recovery.
             */
            retryOnBlocked:
                false,


            requestHandler:
                async ({
                    request,
                }) => {

                    const queuedRequest =
                        asQueuedRequest(
                            request,
                        );


                    await coordinator
                        .handle(
                            queuedRequest,
                        );


                    /**
                     * Temporary observability while
                     * the parser layer does not yet
                     * exist.
                     */
                    console.log(
                        `[Crawler] `
                        + `job=${queuedRequest.userData.job.id} `
                        + `status=${queuedRequest.userData.state.status} `
                        + `attempt=${queuedRequest.userData.state.attempt}`,
                    );
                },


            /**
             * Called by Crawlee before retrying an
             * unexpected requestHandler failure.
             */
            errorHandler:
                async (
                    {
                        request,
                    },
                    error,
                ) => {

                    requestManager
                        .markRetrying(
                            asQueuedRequest(
                                request,
                            ),
                            error,
                        );
                },


            /**
             * Called after Crawlee's exception retry
             * budget has been exhausted.
             */
            failedRequestHandler:
                async (
                    {
                        request,
                    },
                    error,
                ) => {

                    requestManager
                        .markFailed(
                            asQueuedRequest(
                                request,
                            ),
                            error,
                        );
                },
        });


    /**
     * ------------------------------------------------
     * 13. Graceful shutdown
     * ------------------------------------------------
     *
     * IMPORTANT:
     *
     * Register BEFORE crawler.run(), because with
     * keepAlive=true crawler.run() intentionally
     * remains active while waiting for work.
     */
    



    /**
     * ------------------------------------------------
     * 14. Optional first test job
     * ------------------------------------------------
     *
     * Usage:
     *
     * npm run dev -- https://example.com
     *
     * No URL means the crawler simply stays alive
     * waiting for jobs.
     */
    const initialUrl =
        process.argv[2]
        ?? process.env.TEST_URL;


    if (
        initialUrl !== undefined
        && initialUrl.trim()
            .length > 0
    ) {

        const enqueueResult =
            await requestManager
                .enqueue({

                    url:
                        initialUrl,

                    requestedFields: [
                        {
                            name:
                                'title',

                            type:
                                'string',

                            aliases:[
                                'name',
                                'headline',
                            ]
                        },
                    ],
                });


        console.log(
            `[Bootstrap] Enqueued `
            + `job=${enqueueResult.jobId} `
            + `request=${enqueueResult.requestId} `
            + `url=${enqueueResult.url}`,
        );
    }


    /**
     * ------------------------------------------------
     * 15. Run
     * ------------------------------------------------
     */
    console.log(
        '[Bootstrap] Crawler started.',
    );


    try {

        await crawler
            .run();

    } finally {

        /**
         * Covers non-signal shutdown as well:
         *
         * - crawler failure
         * - explicit crawler.stop()
         * - future controlled termination
         */
        await retryScheduler
            .shutdown();
    }
}


void main()
    .catch(
        error => {

            const normalizedError =
                error instanceof Error
                    ? error
                    : new Error(
                        String(
                            error,
                        ),
                    );


            console.error(
                '[Bootstrap] Fatal error:',
                normalizedError,
            );


            process.exitCode =
                1;
        },
    );
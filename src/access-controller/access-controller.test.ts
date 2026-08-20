import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    AccessEvaluation,
} from '../core/contracts/access-evaluation.js';

import type {
    FetchEnvelope,
} from '../core/contracts/fetch-envelope.js';

import type {
    ScrapeJob,
} from '../core/contracts/scrape-job.js';

import {
    ACCESS_CONFIG,
} from '../config/access.config.js';

import type {
    AccessStateStore,
    DomainAccessState,
} from './state/state-store.js';

import type {
    AccessDetector,
    AccessPolicy,
    AccessSignal,
    SignalResolver,
} from './types.js';

import {
    AccessController,
} from './access-controller.js';


const JOB: ScrapeJob = {
    id:
        'job-1',

    url:
        'https://example.com/test',

    requestedFields: [
        {
            name:
                'businessName',

            type:
                'string',
        },
    ],

    createdAt:
        '2026-08-19T00:00:00.000Z',
};


const ENVELOPE: FetchEnvelope = {
    requestedUrl:
        JOB.url,

    finalUrl:
        JOB.url,

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


class TestStateStore
implements AccessStateStore {

    state:
        DomainAccessState | null = null;

    clearCount =
        0;


    async getDomainState():
        Promise<DomainAccessState | null> {

        return this.state
            ? {
                ...this.state,
            }
            : null;
    }


    async setDomainState(
        _domain: string,
        state: DomainAccessState,
    ): Promise<void> {

        this.state = {
            ...state,
        };
    }


    async clearDomainState():
        Promise<void> {

        this.state =
            null;

        this.clearCount +=
            1;
    }
}


class FirstSignalResolver
implements SignalResolver {

    resolve(
        signals:
            readonly AccessSignal[],
    ): AccessSignal | null {

        return signals[0]
            ?? null;
    }
}


describe(
    'AccessController',
    () => {

        it(
            'returns ALLOW and resets state when no signal is detected',
            async () => {

                const store =
                    new TestStateStore();


                store.state = {
                    consecutiveRateLimits:
                        2,

                    consecutiveFailures:
                        3,

                    updatedAt:
                        '2026-08-19T00:00:00.000Z',
                };


                const detector:
                    AccessDetector = {

                        detect:
                            () => [],
                    };


                const controller =
                    new AccessController(
                        ACCESS_CONFIG,
                        [detector],
                        new FirstSignalResolver(),
                        [],
                        store,
                    );


                const result =
                    await controller.evaluate(
                        JOB,
                        ENVELOPE,
                    );


                expect(
                    result,
                ).toEqual({
                    decision:
                        'ALLOW',
                });


                expect(
                    store.clearCount,
                ).toBe(
                    1,
                );
            },
        );


        it(
            'routes a resolved signal to exactly one supporting policy',
            async () => {

                const signal:
                    AccessSignal = {

                        reason:
                            'FORBIDDEN',

                        source:
                            'HTTP_STATUS',

                        confidence:
                            0.7,
                    };


                const detector:
                    AccessDetector = {

                        detect:
                            () => [
                                signal,
                            ],
                    };


                const policy:
                    AccessPolicy = {

                        supports:
                            value =>
                                value.reason
                                === 'FORBIDDEN',

                        evaluate:
                            async (): Promise<AccessEvaluation> => ({
                                decision:
                                    'DENY',

                                reason:
                                    'FORBIDDEN',

                                message:
                                    'Forbidden',
                            }),
                    };


                const controller =
                    new AccessController(
                        ACCESS_CONFIG,
                        [detector],
                        new FirstSignalResolver(),
                        [policy],
                        new TestStateStore(),
                    );


                const result =
                    await controller.evaluate(
                        JOB,
                        ENVELOPE,
                    );


                expect(
                    result.decision,
                ).toBe(
                    'DENY',
                );
            },
        );


        it(
            'throws when a resolved signal has no policy',
            async () => {

                const detector:
                    AccessDetector = {

                        detect:
                            () => [
                                {
                                    reason:
                                        'CAPTCHA',

                                    source:
                                        'BODY',

                                    confidence:
                                        1,
                                },
                            ],
                    };


                const controller =
                    new AccessController(
                        ACCESS_CONFIG,
                        [detector],
                        new FirstSignalResolver(),
                        [],
                        new TestStateStore(),
                    );


                await expect(
                    controller.evaluate(
                        JOB,
                        ENVELOPE,
                    ),
                ).rejects.toThrow(
                    'No AccessPolicy supports resolved reason: CAPTCHA',
                );
            },
        );


        it(
            'blocks preflight while domain cooldown is active',
            async () => {

                const store =
                    new TestStateStore();


                store.state = {
                    consecutiveRateLimits:
                        1,

                    consecutiveFailures:
                        0,

                    lastReason:
                        'RATE_LIMITED',

                    cooldownUntil:
                        '2026-08-19T12:01:00.000Z',

                    updatedAt:
                        '2026-08-19T12:00:00.000Z',
                };


                const controller =
                    new AccessController(
                        ACCESS_CONFIG,
                        [],
                        new FirstSignalResolver(),
                        [],
                        store,
                        {
                            now:
                                () =>
                                    Date.parse(
                                        '2026-08-19T12:00:00.000Z',
                                    ),
                        },
                    );


                const result =
                    await controller.preflight(
                        JOB,
                    );


                expect(
                    result,
                ).toMatchObject({
                    decision:
                        'RETRY_LATER',

                    reason:
                        'RATE_LIMITED',

                    retryAfterMs:
                        60_000,
                });
            },
        );
    },
);
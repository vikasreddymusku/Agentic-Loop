import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    FetchEnvelope,
} from '../../core/contracts/fetch-envelope.js';

import {
    RedirectDetector,
} from './redirect.detector.js';


function createEnvelope(
    overrides:
        Partial<FetchEnvelope> = {},
): FetchEnvelope {

    return {
        requestedUrl:
            'https://example.com/private',

        finalUrl:
            'https://example.com/private',

        redirects:
            [],

        statusCode:
            200,

        headers: {
            'content-type':
                'text/html',
        },

        rawBody:
            Buffer.from(
                '<html></html>',
            ),

        bodyBytes:
            13,

        bodyTruncated:
            false,

        fetchDurationMs:
            10,

        ...overrides,
    };
}


describe(
    'RedirectDetector',
    () => {

        const detector =
            new RedirectDetector();


        it(
            'detects redirect to login page',
            () => {

                const result =
                    detector.detect(
                        createEnvelope({
                            finalUrl:
                                'https://example.com/login?next=%2Fprivate',

                            redirects: [
                                'https://example.com/login?next=%2Fprivate',
                            ],
                        }),
                    );


                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                expect(
                    result[0],
                ).toMatchObject({
                    reason:
                        'LOGIN_REQUIRED',

                    source:
                        'REDIRECT',

                    confidence:
                        0.95,
                });
            },
        );


        it(
            'detects explicit security challenge redirect',
            () => {

                const result =
                    detector.detect(
                        createEnvelope({
                            finalUrl:
                                'https://example.com/challenge',

                            redirects: [
                                'https://example.com/challenge',
                            ],
                        }),
                    );


                expect(
                    result[0],
                ).toMatchObject({
                    reason:
                        'SECURITY_CHALLENGE',

                    source:
                        'REDIRECT',

                    confidence:
                        0.96,
                });
            },
        );


        it(
            'detects explicit captcha redirect',
            () => {

                const result =
                    detector.detect(
                        createEnvelope({
                            finalUrl:
                                'https://example.com/captcha',

                            redirects: [
                                'https://example.com/captcha',
                            ],
                        }),
                    );


                expect(
                    result[0],
                ).toMatchObject({
                    reason:
                        'CAPTCHA',

                    source:
                        'REDIRECT',

                    confidence:
                        0.98,
                });
            },
        );


        it(
            'ignores normal http to https redirect',
            () => {

                const result =
                    detector.detect(
                        createEnvelope({
                            requestedUrl:
                                'http://example.com/private',

                            finalUrl:
                                'https://example.com/private',

                            redirects: [
                                'https://example.com/private',
                            ],
                        }),
                    );


                expect(
                    result,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'ignores ordinary path redirects',
            () => {

                const result =
                    detector.detect(
                        createEnvelope({
                            finalUrl:
                                'https://example.com/account',

                            redirects: [
                                'https://example.com/account',
                            ],
                        }),
                    );


                expect(
                    result,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'does not expose redirect query parameters in evidence',
            () => {

                const result =
                    detector.detect(
                        createEnvelope({
                            finalUrl:
                                'https://example.com/login?token=secret123',

                            redirects: [
                                'https://example.com/login?token=secret123',
                            ],
                        }),
                    );


                expect(
                    result[0]?.evidence,
                ).not.toContain(
                    'secret123',
                );
            },
        );
    },
);
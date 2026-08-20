import {
    describe,
    expect,
    it,
} from 'vitest';

import {
    ACCESS_CONFIG,
    type AccessConfig,
} from '../../config/access.config.js';

import type {
    FetchEnvelope,
} from '../../core/contracts/fetch-envelope.js';

import {
    ChallengeDetector,
} from './challenge.detector.js';


function createEnvelope(
    body:
        Buffer | string | null,

    contentType:
        string | undefined = 'text/html',
): FetchEnvelope {

    const headers:
        FetchEnvelope['headers'] = {};


    if (
        contentType !== undefined
    ) {

        headers[
            'content-type'
        ] = contentType;
    }


    const bodyBytes =
        body === null
            ? 0
            : Buffer.byteLength(
                body,
            );


    return {
        requestedUrl:
            'https://example.com/private',

        finalUrl:
            'https://example.com/private',

        redirects:
            [],

        statusCode:
            200,

        headers,

        rawBody:
            body,

        bodyBytes,

        bodyTruncated:
            false,

        fetchDurationMs:
            10,
    };
}


describe(
    'ChallengeDetector',
    () => {

        const detector =
            new ChallengeDetector(
                ACCESS_CONFIG,
            );


        it(
            'detects human verification as CAPTCHA',
            () => {

                const result =
                    detector.detect(
                        createEnvelope(
                            '<html>Verify you are human</html>',
                        ),
                    );


                expect(
                    result,
                ).toContainEqual(
                    expect.objectContaining({
                        reason:
                            'CAPTCHA',

                        source:
                            'BODY',

                        confidence:
                            0.98,
                    }),
                );
            },
        );


        it(
            'detects explicit login wall',
            () => {

                const result =
                    detector.detect(
                        createEnvelope(
                            '<html>Sign in to continue</html>',
                        ),
                    );


                expect(
                    result,
                ).toContainEqual(
                    expect.objectContaining({
                        reason:
                            'LOGIN_REQUIRED',

                        source:
                            'BODY',

                        confidence:
                            0.97,
                    }),
                );
            },
        );


        it(
            'returns multiple signals when multiple challenges exist',
            () => {

                const result =
                    detector.detect(
                        createEnvelope(
                            `
                            <html>
                                Verify you are human.
                                Sign in to continue.
                            </html>
                            `,
                        ),
                    );


                expect(
                    result.some(
                        signal =>
                            signal.reason
                            === 'CAPTCHA',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    result.some(
                        signal =>
                            signal.reason
                            === 'LOGIN_REQUIRED',
                    ),
                ).toBe(
                    true,
                );
            },
        );


        it(
            'detects known security challenge marker',
            () => {

                const result =
                    detector.detect(
                        createEnvelope(
                            '<script src="/cdn-cgi/challenge-platform/test.js"></script>',
                        ),
                    );


                expect(
                    result,
                ).toContainEqual(
                    expect.objectContaining({
                        reason:
                            'SECURITY_CHALLENGE',

                        confidence:
                            0.99,
                    }),
                );
            },
        );


        it(
            'does not inspect binary responses',
            () => {

                const result =
                    detector.detect(
                        createEnvelope(
                            Buffer.from(
                                'verify you are human',
                            ),
                            'image/png',
                        ),
                    );


                expect(
                    result,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'inspects body when Content-Type is missing',
            () => {

                const result =
                    detector.detect(
                        createEnvelope(
                            Buffer.from(
                                'Sign in to continue',
                            ),
                            undefined,
                        ),
                    );


                expect(
                    result.some(
                        signal =>
                            signal.reason
                            === 'LOGIN_REQUIRED',
                    ),
                ).toBe(
                    true,
                );
            },
        );


        it(
            'respects maxBodyInspectionBytes',
            () => {

                const smallConfig:
                    AccessConfig = {

                        ...ACCESS_CONFIG,

                        detection: {
                            ...ACCESS_CONFIG
                                .detection,

                            maxBodyInspectionBytes:
                                32,
                        },
                    };


                const smallDetector =
                    new ChallengeDetector(
                        smallConfig,
                    );


                const body =
                    'x'.repeat(
                        64,
                    )
                    + 'verify you are human';


                const result =
                    smallDetector.detect(
                        createEnvelope(
                            body,
                        ),
                    );


                expect(
                    result,
                ).toEqual(
                    [],
                );
            },
        );
    },
);
import {
    Readable,
} from 'node:stream';

import type {
    BaseHttpClient,
    StreamingHttpResponse,
} from '@crawlee/core';

import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import {
    FastFetcher,
} from './fast-fetcher.js';

import type {
    FastFetcherConfig,
} from './types.js';

import type {
    ScrapeJob,
} from '../core/contracts/scrape-job.js';


const config:
    FastFetcherConfig = {

        timeoutMs:
            5_000,

        /*
         * Deliberately tiny so body-limit tests
         * are easy to understand.
         */
        maxBodySizeBytes:
            10,

        maxRedirects:
            5,
    };


function createJob(
    url =
        'https://example.com/',
): ScrapeJob {

    return {
        id:
            'job-1',

        requestedFields: [
            {
                name:
                    'businessName',

                type:
                    'string',
    },
        ],

        url,

        createdAt:
            new Date()
                .toISOString(),
    };
}


function createResponse(
    overrides:
        Partial<StreamingHttpResponse>
        = {},
): StreamingHttpResponse {

    return {
        complete:
            false,

        url:
            'https://example.com/',

        statusCode:
            200,

        headers:
            {
                'content-type':
                    'text/html',
            },

        trailers:
            {},

        redirectUrls:
            [],

        /*
         * FastFetcher does not use this
         * property in our tests.
         */
        request:
            {
                url:
                    'https://example.com/',
            } as never,

        /*
         * FastFetcher does not currently use
         * progress fields.
         */
        downloadProgress:
            {} as never,

        uploadProgress:
            {} as never,

        stream:
            Readable.from([
                Buffer.from(
                    'hello',
                ),
            ]),

        ...overrides,
    };
}


function createHttpClient(
    response:
        StreamingHttpResponse,
): {
    client: BaseHttpClient;
    streamMock:
        ReturnType<typeof vi.fn>;
} {

    const streamMock =
        vi.fn()
            .mockResolvedValue(
                response,
            );


    const client = {
        stream:
            streamMock,
    } as unknown as BaseHttpClient;


    return {
        client,
        streamMock,
    };
}


function errorWithCode(
    message: string,
    code: string,
): Error & {
    code: string;
} {

    const error =
        new Error(
            message,
        ) as Error & {
            code: string;
        };


    error.code =
        code;


    return error;
}


describe(
    'FastFetcher',
    () => {

        beforeEach(
            () => {
                vi.restoreAllMocks();
            },
        );


        it(
            'returns a normal 200 FetchEnvelope',
            async () => {

                const response =
                    createResponse({
                        headers: {
                            'Content-Type':
                                'text/html',

                            'Content-Length':
                                '5',

                            'Set-Cookie': [
                                'a=1',
                                'b=2',
                            ],
                        },

                        stream:
                            Readable.from([
                                Buffer.from(
                                    'hello',
                                ),
                            ]),
                    });


                const {
                    client,
                    streamMock,
                } =
                    createHttpClient(
                        response,
                    );


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(),
                    );


                expect(
                    result.statusCode,
                ).toBe(
                    200,
                );


                expect(
                    result.rawBody,
                ).toEqual(
                    Buffer.from(
                        'hello',
                    ),
                );


                expect(
                    result.bodyBytes,
                ).toBe(
                    5,
                );


                expect(
                    result.bodyTruncated,
                ).toBe(
                    false,
                );


                expect(
                    result.originalContentLength,
                ).toBe(
                    5,
                );


                expect(
                    result.transportError,
                ).toBeUndefined();


                expect(
                    result.bodyError,
                ).toBeUndefined();


                /*
                 * Header names normalized.
                 */
                expect(
                    result.headers[
                        'content-type'
                    ],
                ).toBe(
                    'text/html',
                );


                /*
                 * Multi-value header preserved.
                 */
                expect(
                    result.headers[
                        'set-cookie'
                    ],
                ).toEqual([
                    'a=1',
                    'b=2',
                ]);


                expect(
                    streamMock,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({
                        url:
                            'https://example.com/',

                        method:
                            'GET',

                        maxRedirects:
                            5,

                        throwHttpErrors:
                            false,

                        timeout: {
                            request:
                                5_000,
                        },
                    }),
                );
            },
        );


        it(
            'preserves a 429 response instead of treating it as transport failure',
            async () => {

                const response =
                    createResponse({
                        statusCode:
                            429,

                        headers: {
                            'retry-after':
                                '30',
                        },

                        stream:
                            Readable.from([
                                Buffer.from(
                                    'rate limit',
                                ),
                            ]),
                    });


                const {
                    client,
                } =
                    createHttpClient(
                        response,
                    );


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(),
                    );


                expect(
                    result.statusCode,
                ).toBe(
                    429,
                );


                expect(
                    result.transportError,
                ).toBeUndefined();


                expect(
                    result.bodyError,
                ).toBeUndefined();


                expect(
                    result.headers[
                        'retry-after'
                    ],
                ).toBe(
                    '30',
                );
            },
        );


        it(
            'returns statusCode 0 and TIMEOUT when no HTTP response is obtained',
            async () => {

                const timeoutError =
                    errorWithCode(
                        'Request timed out',
                        'ETIMEDOUT',
                    );


                const streamMock =
                    vi.fn()
                        .mockRejectedValue(
                            timeoutError,
                        );


                const client = {
                    stream:
                        streamMock,
                } as unknown as BaseHttpClient;


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(),
                    );


                expect(
                    result.statusCode,
                ).toBe(
                    0,
                );


                expect(
                    result.transportError,
                ).toEqual(
                    expect.objectContaining({
                        type:
                            'TIMEOUT',

                        code:
                            'ETIMEDOUT',
                    }),
                );


                expect(
                    result.bodyError,
                ).toBeUndefined();
            },
        );


        it(
            'classifies DNS errors',
            async () => {

                const dnsError =
                    errorWithCode(
                        'getaddrinfo ENOTFOUND example.invalid',
                        'ENOTFOUND',
                    );


                const client = {
                    stream:
                        vi.fn()
                            .mockRejectedValue(
                                dnsError,
                            ),
                } as unknown as BaseHttpClient;


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(
                            'https://example.invalid/',
                        ),
                    );


                expect(
                    result.statusCode,
                ).toBe(
                    0,
                );


                expect(
                    result.transportError?.type,
                ).toBe(
                    'DNS_ERROR',
                );
            },
        );


        it(
            'captures the redirect chain and final URL',
            async () => {

                const response =
                    createResponse({
                        url:
                            'https://example.com/login',

                        redirectUrls: [
                            new URL(
                                'https://example.com/step-1',
                            ),

                            new URL(
                                'https://example.com/login',
                            ),
                        ],
                    });


                const {
                    client,
                } =
                    createHttpClient(
                        response,
                    );


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(
                            'https://example.com/private',
                        ),
                    );


                expect(
                    result.finalUrl,
                ).toBe(
                    'https://example.com/login',
                );


                expect(
                    result.redirects,
                ).toEqual([
                    'https://example.com/step-1',
                    'https://example.com/login',
                ]);
            },
        );


        it(
            'does not mark a body exactly equal to maxBodySizeBytes as truncated',
            async () => {

                const exactBody =
                    Buffer.from(
                        '1234567890',
                    );


                expect(
                    exactBody.length,
                ).toBe(
                    config.maxBodySizeBytes,
                );


                const response =
                    createResponse({
                        stream:
                            Readable.from([
                                exactBody,
                            ]),
                    });


                const {
                    client,
                } =
                    createHttpClient(
                        response,
                    );


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(),
                    );


                expect(
                    result.bodyBytes,
                ).toBe(
                    10,
                );


                expect(
                    result.bodyTruncated,
                ).toBe(
                    false,
                );


                expect(
                    result.rawBody,
                ).toEqual(
                    exactBody,
                );
            },
        );


        it(
            'truncates a body larger than maxBodySizeBytes',
            async () => {

                const oversizedBody =
                    Buffer.from(
                        '1234567890EXTRA',
                    );


                const stream =
                    Readable.from([
                        oversizedBody,
                    ]);


                const response =
                    createResponse({
                        stream,
                    });


                const {
                    client,
                } =
                    createHttpClient(
                        response,
                    );


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(),
                    );


                expect(
                    result.bodyBytes,
                ).toBe(
                    10,
                );


                expect(
                    result.bodyTruncated,
                ).toBe(
                    true,
                );


                expect(
                    result.rawBody,
                ).toEqual(
                    Buffer.from(
                        '1234567890',
                    ),
                );


                expect(
                    stream.destroyed,
                ).toBe(
                    true,
                );
            },
        );


        it(
            'preserves HTTP metadata and partial bytes when body stream fails',
            async () => {

                const bodyFailure =
                    errorWithCode(
                        'socket reset',
                        'ECONNRESET',
                    );


                /*
                 * Yield some body data first,
                 * then fail.
                 */
                async function* brokenBody() {

                    yield Buffer.from(
                        'partial',
                    );

                    throw bodyFailure;
                }


                const response =
                    createResponse({
                        statusCode:
                            200,

                        headers: {
                            'content-type':
                                'text/html',
                        },

                        stream:
                            Readable.from(
                                brokenBody(),
                            ),
                    });


                const {
                    client,
                } =
                    createHttpClient(
                        response,
                    );


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(),
                    );


                /*
                 * Most important assertion:
                 *
                 * We received HTTP 200, therefore
                 * it must NOT become status 0.
                 */
                expect(
                    result.statusCode,
                ).toBe(
                    200,
                );


                expect(
                    result.transportError,
                ).toBeUndefined();


                expect(
                    result.bodyError,
                ).toEqual(
                    expect.objectContaining({
                        type:
                            'CONNECTION_ERROR',

                        code:
                            'ECONNRESET',
                    }),
                );


                expect(
                    result.rawBody,
                ).toEqual(
                    Buffer.from(
                        'partial',
                    ),
                );


                expect(
                    result.bodyBytes,
                ).toBe(
                    7,
                );


                expect(
                    result.bodyTruncated,
                ).toBe(
                    false,
                );
            },
        );


        it(
            'returns null for a genuinely empty body',
            async () => {

                const response =
                    createResponse({
                        statusCode:
                            204,

                        headers:
                            {},

                        stream:
                            Readable.from(
                                [],
                            ),
                    });


                const {
                    client,
                } =
                    createHttpClient(
                        response,
                    );


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(),
                    );


                expect(
                    result.statusCode,
                ).toBe(
                    204,
                );


                expect(
                    result.rawBody,
                ).toBeNull();


                expect(
                    result.bodyBytes,
                ).toBe(
                    0,
                );


                expect(
                    result.bodyTruncated,
                ).toBe(
                    false,
                );
            },
        );


        it(
            'ignores malformed Content-Length',
            async () => {

                const response =
                    createResponse({
                        headers: {
                            'content-length':
                                '100abc',
                        },
                    });


                const {
                    client,
                } =
                    createHttpClient(
                        response,
                    );


                const fetcher =
                    new FastFetcher(
                        config,
                        client,
                    );


                const result =
                    await fetcher.fetch(
                        createJob(),
                    );


                expect(
                    result.originalContentLength,
                ).toBeUndefined();
            },
        );
    },
);
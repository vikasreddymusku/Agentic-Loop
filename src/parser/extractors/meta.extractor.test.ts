import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';

import {
    MetaExtractor,
} from './meta.extractor.js';


function createInput(
    html:
        string,

    contentType:
        string | undefined =
            'text/html; charset=utf-8',
): ParserInput {

    return {

        job: {

            id:
                'meta-test-job',

            url:
                'https://example.com/',

            /**
             * MetaExtractor must completely ignore
             * requestedFields during discovery.
             */
            requestedFields: [
                {
                    name:
                        'anything',

                    type:
                        'string',
                },
            ],

            maxRetries:
                3,

            createdAt:
                '2026-08-20T00:00:00.000Z',
        },

        envelope: {

            requestedUrl:
                'https://example.com/',

            finalUrl:
                'https://example.com/',

            redirects:
                [],

            statusCode:
                200,

            headers:
                contentType === undefined
                    ? {}
                    : {
                        'content-type':
                            contentType,
                    },

            rawBody:
                html,

            bodyBytes:
                Buffer.byteLength(
                    html,
                ),

            bodyTruncated:
                false,

            fetchDurationMs:
                10,
        },
    };
}


describe(
    'MetaExtractor',
    () => {

        it(
            'discovers the HTML title as raw metadata',
            async () => {

                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <html>
                                <head>
                                    <title>
                                        Acme Example
                                    </title>
                                </head>
                            </html>
                        `),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'title',

                            path:
                                'title',

                            value:
                                'Acme Example',

                            source:
                                'META',

                            vocabulary:
                                'HTML_META',

                            extractorId:
                                'meta',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers Open Graph metadata without mapping it to fields',
            async () => {

                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <meta
                                property="og:title"
                                content="Galaxy Phone"
                            >

                            <meta
                                property="og:url"
                                content="https://example.com/product"
                            >
                        `),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'og:title',

                            value:
                                'Galaxy Phone',

                            vocabulary:
                                'OPEN_GRAPH',
                        }),

                        expect.objectContaining({

                            key:
                                'og:url',

                            value:
                                'https://example.com/product',

                            vocabulary:
                                'OPEN_GRAPH',
                        }),
                    ]),
                );


                expect(
                    result.discovered.some(
                        item =>
                            item.key
                            === 'businessName',
                    ),
                ).toBe(
                    false,
                );
            },
        );


        it(
            'discovers Twitter Card metadata',
            async () => {

                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <meta
                                name="twitter:title"
                                content="Data Engineer Role"
                            >

                            <meta
                                name="twitter:description"
                                content="Join our engineering team"
                            >
                        `),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'twitter:title',

                            value:
                                'Data Engineer Role',

                            vocabulary:
                                'TWITTER_CARD',
                        }),

                        expect.objectContaining({

                            key:
                                'twitter:description',

                            value:
                                'Join our engineering team',

                            vocabulary:
                                'TWITTER_CARD',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers generic HTML metadata',
            async () => {

                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <meta
                                name="description"
                                content="Universal scraper article"
                            >

                            <meta
                                name="author"
                                content="Jane Doe"
                            >

                            <meta
                                name="robots"
                                content="index, follow"
                            >
                        `),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'description',

                            value:
                                'Universal scraper article',

                            vocabulary:
                                'HTML_META',
                        }),

                        expect.objectContaining({

                            key:
                                'author',

                            value:
                                'Jane Doe',

                            vocabulary:
                                'HTML_META',
                        }),

                        expect.objectContaining({

                            key:
                                'robots',

                            value:
                                'index, follow',

                            vocabulary:
                                'HTML_META',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers metadata that was previously ignored',
            async () => {

                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <meta
                                property="og:description"
                                content="Product description"
                            >

                            <meta
                                property="og:image"
                                content="https://example.com/image.jpg"
                            >

                            <meta
                                property="article:author"
                                content="Reporter"
                            >
                        `),
                    );


                const keys =
                    result.discovered
                        .map(
                            property =>
                                property.key,
                        );


                expect(
                    keys,
                ).toContain(
                    'og:description',
                );


                expect(
                    keys,
                ).toContain(
                    'og:image',
                );


                expect(
                    keys,
                ).toContain(
                    'article:author',
                );
            },
        );


        it(
            'preserves multiple values for the same metadata key',
            async () => {

                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <meta
                                property="og:image"
                                content="https://example.com/one.jpg"
                            >

                            <meta
                                property="og:image"
                                content="https://example.com/two.jpg"
                            >
                        `),
                    );


                const images =
                    result.discovered
                        .filter(
                            property =>
                                property.key
                                === 'og:image',
                        );


                expect(
                    images,
                ).toHaveLength(
                    2,
                );


                expect(
                    images[0]?.path,
                ).toBe(
                    'meta[property="og:image"]:eq(0)',
                );


                expect(
                    images[1]?.path,
                ).toBe(
                    'meta[property="og:image"]:eq(1)',
                );
            },
        );


        it(
            'ignores meta tags without a usable key or content',
            async () => {

                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <meta content="No key">

                            <meta
                                name=""
                                content="Blank key"
                            >

                            <meta name="description">

                            <meta
                                name="keywords"
                                content=""
                            >

                            <meta
                                name="author"
                                content="Valid Author"
                            >
                        `),
                    );


                expect(
                    result.discovered,
                ).toHaveLength(
                    1,
                );


                expect(
                    result.discovered[0],
                ).toEqual(
                    expect.objectContaining({

                        key:
                            'author',

                        value:
                            'Valid Author',
                    }),
                );


                expect(
                    result.warnings,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'handles malformed HTML and metadata keys case-insensitively',
            async () => {

                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <html>
                                <head>
                                    <META
                                        PROPERTY="OG:TITLE"
                                        CONTENT="Case Test"
                                    >

                                    <meta
                                        NAME="TWITTER:TITLE"
                                        CONTENT="Twitter Test"
                                    >
                                <body>
                        `),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'og:title',

                            value:
                                'Case Test',

                            vocabulary:
                                'OPEN_GRAPH',
                        }),

                        expect.objectContaining({

                            key:
                                'twitter:title',

                            value:
                                'Twitter Test',

                            vocabulary:
                                'TWITTER_CARD',
                        }),
                    ]),
                );
            },
        );


        it(
            'supports Buffer HTML when Content-Type is missing',
            async () => {

                const html = `
                    <meta
                        name="description"
                        content="Buffer metadata"
                    >
                `;


                const input =
                    createInput(
                        html,
                        undefined,
                    );


                input.envelope.rawBody =
                    Buffer.from(
                        html,
                        'utf8',
                    );


                const extractor =
                    new MetaExtractor();


                expect(
                    extractor.supports(
                        input,
                    ),
                ).toBe(
                    true,
                );


                const result =
                    await extractor.extract(
                        input,
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'description',

                            value:
                                'Buffer metadata',
                        }),
                    ]),
                );
            },
        );


        it(
            'rejects explicit non-HTML content types',
            async () => {

                const extractor =
                    new MetaExtractor();


                const input =
                    createInput(
                        '{"title":"Not HTML"}',
                        'application/json',
                    );


                expect(
                    extractor.supports(
                        input,
                    ),
                ).toBe(
                    false,
                );


                await expect(
                    extractor.extract(
                        input,
                    ),
                ).resolves.toEqual({

                    discovered:
                        [],

                    warnings:
                        [],
                });
            },
        );


        it(
            'limits snippets to 50 characters',
            async () => {

                const longValue =
                    'A'.repeat(
                        200,
                    );


                const extractor =
                    new MetaExtractor();


                const result =
                    await extractor.extract(
                        createInput(`
                            <meta
                                name="description"
                                content="${longValue}"
                            >
                        `),
                    );


                const description =
                    result.discovered
                        .find(
                            property =>
                                property.key
                                === 'description',
                        );


                expect(
                    description,
                ).toBeDefined();


                expect(
                    description
                        ?.snippet
                        ?.length,
                ).toBeLessThanOrEqual(
                    50,
                );
            },
        );
    },
);
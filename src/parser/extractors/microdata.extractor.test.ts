import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';

import {
    MicrodataExtractor,
} from './microdata.extractor.js';


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
                'microdata-test-job',

            url:
                'https://example.com/',

            /**
             * Microdata discovery must not depend
             * on requestedFields.
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
    'MicrodataExtractor',
    () => {

        it(
            'discovers itemtype and direct Organization properties',
            async () => {

                const html = `
                    <div
                        itemscope
                        itemtype="https://schema.org/Organization"
                    >
                        <span itemprop="name">
                            Acme Corporation
                        </span>

                        <span itemprop="telephone">
                            +91 9876543210
                        </span>

                        <a
                            itemprop="email"
                            href="mailto:hello@acme.example"
                        >
                            Email
                        </a>

                        <a
                            itemprop="url"
                            href="https://acme.example"
                        >
                            Website
                        </a>
                    </div>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'itemtype',

                            value:
                                'https://schema.org/Organization',

                            source:
                                'MICRODATA',

                            vocabulary:
                                'SCHEMA_ORG',

                            extractorId:
                                'microdata',
                        }),

                        expect.objectContaining({

                            key:
                                'name',

                            value:
                                'Acme Corporation',
                        }),

                        expect.objectContaining({

                            key:
                                'telephone',

                            value:
                                '+91 9876543210',
                        }),

                        expect.objectContaining({

                            key:
                                'email',

                            value:
                                'mailto:hello@acme.example',
                        }),

                        expect.objectContaining({

                            key:
                                'url',

                            value:
                                'https://acme.example',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers Product microdata without filtering by itemtype',
            async () => {

                const html = `
                    <div
                        itemscope
                        itemtype="https://schema.org/Product"
                    >
                        <span itemprop="name">
                            Galaxy Phone
                        </span>

                        <meta
                            itemprop="price"
                            content="24999"
                        >
                    </div>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'itemtype',

                            value:
                                'https://schema.org/Product',
                        }),

                        expect.objectContaining({

                            key:
                                'name',

                            value:
                                'Galaxy Phone',
                        }),

                        expect.objectContaining({

                            key:
                                'price',

                            value:
                                '24999',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers JobPosting microdata',
            async () => {

                const html = `
                    <article
                        itemscope
                        itemtype="https://schema.org/JobPosting"
                    >
                        <h1 itemprop="title">
                            Backend Developer
                        </h1>

                        <span itemprop="employmentType">
                            FULL_TIME
                        </span>
                    </article>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'title',

                            value:
                                'Backend Developer',
                        }),

                        expect.objectContaining({

                            key:
                                'employmentType',

                            value:
                                'FULL_TIME',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers Article microdata',
            async () => {

                const html = `
                    <article
                        itemscope
                        itemtype="https://schema.org/Article"
                    >
                        <h1 itemprop="headline">
                            Breaking News
                        </h1>

                        <span itemprop="author">
                            Jane Doe
                        </span>
                    </article>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'headline',

                            value:
                                'Breaking News',
                        }),

                        expect.objectContaining({

                            key:
                                'author',

                            value:
                                'Jane Doe',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers nested PostalAddress properties with granular paths',
            async () => {

                const html = `
                    <div
                        itemscope
                        itemtype="https://schema.org/LocalBusiness"
                    >
                        <span itemprop="name">
                            City Store
                        </span>

                        <div
                            itemprop="address"
                            itemscope
                            itemtype="https://schema.org/PostalAddress"
                        >
                            <span itemprop="streetAddress">
                                12 MG Road
                            </span>

                            <span itemprop="addressLocality">
                                Hyderabad
                            </span>

                            <span itemprop="postalCode">
                                500001
                            </span>
                        </div>
                    </div>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'address',

                            path:
                                '[itemscope]:eq(0) '
                                + '[itemprop="address"]:eq(0)',
                        }),

                        expect.objectContaining({

                            key:
                                'streetAddress',

                            path:
                                '[itemscope]:eq(0) '
                                + '[itemprop="address"]:eq(0) '
                                + '[itemprop="streetAddress"]:eq(0)',

                            value:
                                '12 MG Road',
                        }),

                        expect.objectContaining({

                            key:
                                'addressLocality',

                            value:
                                'Hyderabad',
                        }),

                        expect.objectContaining({

                            key:
                                'postalCode',

                            value:
                                '500001',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers nested AggregateRating properties separately',
            async () => {

                const html = `
                    <div
                        itemscope
                        itemtype="https://schema.org/Product"
                    >
                        <div
                            itemprop="aggregateRating"
                            itemscope
                            itemtype="https://schema.org/AggregateRating"
                        >
                            <meta
                                itemprop="ratingValue"
                                content="4.8"
                            >

                            <meta
                                itemprop="reviewCount"
                                content="1250"
                            >
                        </div>
                    </div>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                const ratingValues =
                    result.discovered.filter(
                        property =>
                            property.key
                            === 'ratingValue',
                    );


                expect(
                    ratingValues,
                ).toHaveLength(
                    1,
                );


                expect(
                    ratingValues[0],
                ).toEqual(
                    expect.objectContaining({

                        path:
                            '[itemscope]:eq(0) '
                            + '[itemprop="aggregateRating"]:eq(0) '
                            + '[itemprop="ratingValue"]:eq(0)',

                        value:
                            '4.8',
                    }),
                );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'reviewCount',

                            value:
                                '1250',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers properties from multiple independent scopes',
            async () => {

                const html = `
                    <div
                        itemscope
                        itemtype="https://schema.org/Product"
                    >
                        <span itemprop="name">
                            Product One
                        </span>
                    </div>

                    <article
                        itemscope
                        itemtype="https://schema.org/Article"
                    >
                        <span itemprop="headline">
                            Article One
                        </span>
                    </article>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'name',

                            value:
                                'Product One',
                        }),

                        expect.objectContaining({

                            key:
                                'headline',

                            value:
                                'Article One',
                        }),
                    ]),
                );
            },
        );


        it(
            'supports multiple property names in one itemprop attribute',
            async () => {

                const html = `
                    <article
                        itemscope
                        itemtype="https://schema.org/Article"
                    >
                        <h1 itemprop="name headline">
                            Shared Heading
                        </h1>
                    </article>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'name',

                            value:
                                'Shared Heading',
                        }),

                        expect.objectContaining({

                            key:
                                'headline',

                            value:
                                'Shared Heading',
                        }),
                    ]),
                );
            },
        );


        it(
            'returns no discovered properties when microdata is absent',
            async () => {

                const html = `
                    <html>
                        <body>
                            <h1>
                                Normal Website
                            </h1>
                        </body>
                    </html>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result,
                ).toEqual({

                    discovered:
                        [],

                    warnings:
                        [],
                });
            },
        );


        it(
            'tolerates malformed HTML and warns about empty itemprop',
            async () => {

                const html = `
                    <div
                        itemscope
                        itemtype="https://schema.org/Thing"
                    >
                        <span itemprop="">
                            Invalid property
                        </span>

                        <span itemprop="name">
                            Valid Value
                    </div>
                `;


                const extractor =
                    new MicrodataExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'name',

                            value:
                                'Valid Value',
                        }),
                    ]),
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            extractorId:
                                'microdata',

                            code:
                                'MICRODATA_EMPTY_ITEMPROP',
                        }),
                    ]),
                );
            },
        );


        it(
            'supports Buffer HTML without Content-Type and limits snippets',
            async () => {

                const longName =
                    'A'.repeat(
                        200,
                    );


                const html = `
                    <div
                        itemscope
                        itemtype="https://schema.org/Product"
                    >
                        <span itemprop="name">
                            ${longName}
                        </span>
                    </div>
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
                    new MicrodataExtractor();


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


                const name =
                    result.discovered.find(
                        property =>
                            property.key
                            === 'name',
                    );


                expect(
                    name,
                ).toBeDefined();


                expect(
                    name
                        ?.snippet
                        ?.length,
                ).toBeLessThanOrEqual(
                    50,
                );
            },
        );


        it(
            'rejects explicit non-HTML content types',
            async () => {

                const extractor =
                    new MicrodataExtractor();


                const input =
                    createInput(
                        '{"name":"Not HTML"}',
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
    },
);
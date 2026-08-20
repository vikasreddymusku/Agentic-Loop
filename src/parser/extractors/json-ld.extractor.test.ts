import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';

import {
    JsonLdExtractor,
} from './json-ld.extractor.js';


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
                'json-ld-test-job',

            url:
                'https://example.com/',

            /**
             * JsonLdExtractor must no longer care
             * what fields were requested.
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
    'JsonLdExtractor',
    () => {

        it(
            'discovers all primitive properties without filtering by @type',
            async () => {

                const html = `
                    <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "JobPosting",
                        "title": "Backend Developer",
                        "description": "Build APIs",
                        "employmentType": "FULL_TIME"
                    }
                    </script>
                `;


                const extractor =
                    new JsonLdExtractor();


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

                            path:
                                '$.title',

                            value:
                                'Backend Developer',

                            source:
                                'JSON_LD',

                            vocabulary:
                                'SCHEMA_ORG',

                            extractorId:
                                'json-ld',
                        }),

                        expect.objectContaining({

                            key:
                                'description',

                            path:
                                '$.description',

                            value:
                                'Build APIs',
                        }),

                        expect.objectContaining({

                            key:
                                'employmentType',

                            path:
                                '$.employmentType',

                            value:
                                'FULL_TIME',
                        }),
                    ]),
                );


                /**
                 * @type itself is also a discovered
                 * source property. It is not being used
                 * as an entity filter anymore.
                 */
                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                '@type',

                            path:
                                '$["@type"]',

                            value:
                                'JobPosting',
                        }),
                    ]),
                );
            },
        );


        it(
            'flattens nested JSON-LD objects with full paths',
            async () => {

                const html = `
                    <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Product",
                        "name": "Galaxy Phone",
                        "offers": {
                            "@type": "Offer",
                            "price": 24999,
                            "priceCurrency": "INR"
                        }
                    }
                    </script>
                `;


                const extractor =
                    new JsonLdExtractor();


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

                            path:
                                '$.name',

                            value:
                                'Galaxy Phone',
                        }),

                        expect.objectContaining({

                            key:
                                'price',

                            path:
                                '$.offers.price',

                            value:
                                24999,
                        }),

                        expect.objectContaining({

                            key:
                                'priceCurrency',

                            path:
                                '$.offers.priceCurrency',

                            value:
                                'INR',
                        }),
                    ]),
                );
            },
        );


        it(
            'discovers Product JobPosting and Article without entity filtering',
            async () => {

                const html = `
                    <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@graph": [
                            {
                                "@type": "Product",
                                "name": "Laptop",
                                "sku": "LAP-1"
                            },
                            {
                                "@type": "JobPosting",
                                "title": "Data Engineer"
                            },
                            {
                                "@type": "Article",
                                "headline": "Breaking News"
                            }
                        ]
                    }
                    </script>
                `;


                const extractor =
                    new JsonLdExtractor();


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
                                'Laptop',
                        }),

                        expect.objectContaining({

                            key:
                                'title',

                            value:
                                'Data Engineer',
                        }),

                        expect.objectContaining({

                            key:
                                'headline',

                            value:
                                'Breaking News',
                        }),
                    ]),
                );
            },
        );


        it(
            'preserves arrays of strings as a discovered value',
            async () => {

                const html = `
                    <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "JobPosting",
                        "skills": [
                            "Node.js",
                            "TypeScript",
                            "PostgreSQL"
                        ]
                    }
                    </script>
                `;


                const extractor =
                    new JsonLdExtractor();


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
                                'skills',

                            path:
                                '$.skills',

                            value: [
                                'Node.js',
                                'TypeScript',
                                'PostgreSQL',
                            ],
                        }),
                    ]),
                );
            },
        );


        it(
            'supports top-level JSON-LD arrays',
            async () => {

                const html = `
                    <script type="application/ld+json">
                    [
                        {
                            "@context": "https://schema.org",
                            "@type": "Product",
                            "name": "Product One"
                        },
                        {
                            "@context": "https://schema.org",
                            "@type": "Product",
                            "name": "Product Two"
                        }
                    ]
                    </script>
                `;


                const extractor =
                    new JsonLdExtractor();


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

                            path:
                                '$[0].name',

                            value:
                                'Product One',
                        }),

                        expect.objectContaining({

                            key:
                                'name',

                            path:
                                '$[1].name',

                            value:
                                'Product Two',
                        }),
                    ]),
                );
            },
        );


        it(
            'warns on malformed JSON-LD while continuing with valid blocks',
            async () => {

                const html = `
                    <script type="application/ld+json">
                        { invalid json }
                    </script>

                    <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Article",
                        "headline": "Valid Article"
                    }
                    </script>
                `;


                const extractor =
                    new JsonLdExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.warnings,
                ).toHaveLength(
                    1,
                );


                expect(
                    result.warnings[0],
                ).toEqual(
                    expect.objectContaining({

                        extractorId:
                            'json-ld',

                        code:
                            'JSON_LD_PARSE_ERROR',
                    }),
                );


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([

                        expect.objectContaining({

                            key:
                                'headline',

                            value:
                                'Valid Article',
                        }),
                    ]),
                );
            },
        );


        it(
            'uses OTHER vocabulary when schema.org context is absent',
            async () => {

                const html = `
                    <script type="application/ld+json">
                    {
                        "@context": "https://example.com/vocabulary",
                        "@type": "CustomThing",
                        "customValue": "ABC"
                    }
                    </script>
                `;


                const extractor =
                    new JsonLdExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                const property =
                    result.discovered.find(
                        item =>
                            item.key
                            === 'customValue',
                    );


                expect(
                    property,
                ).toEqual(
                    expect.objectContaining({

                        value:
                            'ABC',

                        vocabulary:
                            'OTHER',
                    }),
                );
            },
        );


        it(
            'limits evidence snippets to 50 characters',
            async () => {

                const value =
                    'A'.repeat(
                        200,
                    );


                const html = `
                    <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Article",
                        "headline": "${value}"
                    }
                    </script>
                `;


                const extractor =
                    new JsonLdExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                const headline =
                    result.discovered.find(
                        property =>
                            property.key
                            === 'headline',
                    );


                expect(
                    headline,
                ).toBeDefined();


                expect(
                    headline
                        ?.snippet
                        ?.length,
                ).toBeLessThanOrEqual(
                    50,
                );
            },
        );
    },
);
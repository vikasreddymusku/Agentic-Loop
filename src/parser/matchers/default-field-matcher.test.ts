import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    DiscoveredProperty,
} from '../../core/contracts/parser/discovered-property.js';

import type {
    RequestedField,
} from '../../core/contracts/scrape-job.js';

import {
    DefaultFieldMatcher,
} from './default-field-matcher.js';


function discovered(
    overrides:
        Partial<DiscoveredProperty>
        & Pick<
            DiscoveredProperty,
            'key'
            | 'path'
            | 'value'
        >,
): DiscoveredProperty {

    return {

        source:
            'JSON_LD',

        vocabulary:
            'SCHEMA_ORG',

        extractorId:
            'json-ld',

        ...overrides,
    };
}


function requested(
    overrides:
        Partial<RequestedField>
        & Pick<
            RequestedField,
            'name'
        >,
): RequestedField {

    return {

        type:
            'string',

        ...overrides,
    };
}


describe(
    'DefaultFieldMatcher',
    () => {

        it(
            'gives explicit path matches highest confidence',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({

                                name:
                                    'productPrice',

                                type:
                                    'number',

                                paths: [
                                    '$.offers.price',
                                ],
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'price',

                                path:
                                    '$.offers.price',

                                value:
                                    24999,
                            }),
                        ],
                    );


                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                expect(
                    result[0],
                ).toEqual(
                    expect.objectContaining({

                        field:
                            'productPrice',

                        value:
                            24999,

                        confidence:
                            1,
                    }),
                );
            },
        );


        it(
            'treats paths with and without the JSON root prefix as equivalent',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({

                                name:
                                    'price',

                                paths: [
                                    'offers.price',
                                ],
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'unrelatedKey',

                                path:
                                    '$.offers.price',

                                value:
                                    '24999',
                            }),
                        ],
                    );


                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                expect(
                    result[0]
                        ?.confidence,
                ).toBe(
                    1,
                );
            },
        );


        it(
            'matches an exact requested field name',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({
                                name:
                                    'price',
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'price',

                                path:
                                    '$.price',

                                value:
                                    500,
                            }),
                        ],
                    );


                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                expect(
                    result[0]
                        ?.confidence,
                ).toBe(
                    0.98,
                );
            },
        );


        it(
            'matches an explicit alias case-insensitively',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({

                                name:
                                    'businessName',

                                aliases: [
                                    'name',
                                ],
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'NAME',

                                path:
                                    '$.name',

                                value:
                                    'Acme',
                            }),
                        ],
                    );


                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                expect(
                    result[0],
                ).toEqual(
                    expect.objectContaining({

                        field:
                            'businessName',

                        value:
                            'Acme',

                        confidence:
                            0.95,
                    }),
                );
            },
        );


        it(
            'matches normalized field names',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({
                                name:
                                    'jobTitle',
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'job_title',

                                path:
                                    '$.job_title',

                                value:
                                    'Backend Developer',
                            }),
                        ],
                    );


                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                expect(
                    result[0]
                        ?.confidence,
                ).toBe(
                    0.90,
                );
            },
        );


        it(
            'matches a conservative synonym',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({
                                name:
                                    'headline',
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'title',

                                path:
                                    '$.title',

                                value:
                                    'Breaking News',
                            }),
                        ],
                    );


                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                expect(
                    result[0]
                        ?.confidence,
                ).toBe(
                    0.85,
                );
            },
        );


        it(
            'returns all matching properties as candidates',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({
                                name:
                                    'price',
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'price',

                                path:
                                    '$.offers.price',

                                value:
                                    999,
                            }),

                            discovered({

                                key:
                                    'price',

                                path:
                                    '[itemscope]:eq(0) '
                                    + '[itemprop="price"]:eq(0)',

                                value:
                                    '999',

                                source:
                                    'MICRODATA',

                                extractorId:
                                    'microdata',
                            }),
                        ],
                    );


                expect(
                    result,
                ).toHaveLength(
                    2,
                );


                expect(
                    result.every(
                        candidate =>
                            candidate.field
                            === 'price',
                    ),
                ).toBe(
                    true,
                );
            },
        );


        it(
            'uses only the highest priority rule for one property',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({

                                name:
                                    'price',

                                aliases: [
                                    'price',
                                ],

                                paths: [
                                    '$.offers.price',
                                ],
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'price',

                                path:
                                    '$.offers.price',

                                value:
                                    499,
                            }),
                        ],
                    );


                /**
                 * This property technically matches:
                 *
                 * path
                 * exact name
                 * alias
                 * normalized name
                 *
                 * It must still produce only ONE
                 * candidate using the strongest rule.
                 */
                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                expect(
                    result[0]
                        ?.confidence,
                ).toBe(
                    1,
                );
            },
        );


        it(
            'preserves discovered provenance in FieldEvidence',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                const result =
                    matcher.match(

                        [
                            requested({
                                name:
                                    'title',
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'title',

                                path:
                                    'meta[property="og:title"]:eq(0)',

                                value:
                                    'Example Product',

                                source:
                                    'META',

                                vocabulary:
                                    'OPEN_GRAPH',

                                extractorId:
                                    'meta',

                                snippet:
                                    'Example Product',
                            }),
                        ],
                    );


                expect(
                    result[0]
                        ?.evidence,
                ).toEqual({

                    extractorId:
                        'meta',

                    source:
                        'META',

                    vocabulary:
                        'OPEN_GRAPH',

                    location:
                        'meta[property="og:title"]:eq(0)',

                    snippet:
                        'Example Product',
                });
            },
        );


        it(
            'returns an empty array when there are no matches or inputs are empty',
            () => {

                const matcher =
                    new DefaultFieldMatcher();


                expect(
                    matcher.match(
                        [],
                        [],
                    ),
                ).toEqual(
                    [],
                );


                expect(
                    matcher.match(

                        [
                            requested({
                                name:
                                    'salary',
                            }),
                        ],

                        [
                            discovered({

                                key:
                                    'author',

                                path:
                                    '$.author',

                                value:
                                    'Jane Doe',
                            }),
                        ],
                    ),
                ).toEqual(
                    [],
                );
            },
        );
    },
);
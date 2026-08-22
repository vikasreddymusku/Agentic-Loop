import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    NetworkResponse,
} from '../../core/contracts/browser/network-response.js';

import {
    DefaultNetworkDataExtractor,
} from './network-data.extractor.js';


function createResponse(
    body?:
        string,

    overrides:
        Partial<NetworkResponse> = {},
): NetworkResponse {

    const bodyBytes =
        typeof body === 'string'
            ? Buffer.byteLength(
                body,
                'utf8',
            )
            : 0;


    return {

        id:
            'test-capture:0',

        sequence:
            0,

        url:
            'https://example.test/api/data',

        method:
            'GET',

        status:
            200,

        resourceType:
            'fetch',

        headers:
            {},

        contentType:
            'application/json',

        body,

        bodyBytes,

        ...overrides,

    } as NetworkResponse;
}


function valuesByPath(
    responses:
        readonly NetworkResponse[],
) {

    const extractor =
        new DefaultNetworkDataExtractor();


    const result =
        extractor.extract(
            responses,
        );


    return {
        result,
        map:
            new Map(
                result.discovered.map(
                    (property) => [
                        property.path,
                        property.value,
                    ],
                ),
            ),
    };
}


describe(
    'DefaultNetworkDataExtractor',
    () => {

        it(
            'extracts arbitrary primitive properties from JSON',
            () => {

                const {
                    result,
                    map,
                } =
                    valuesByPath([
                        createResponse(
                            JSON.stringify({
                                name:
                                    'Universal Item',
                                count:
                                    42,
                                active:
                                    true,
                            }),
                        ),
                    ]);


                expect(
                    map.get(
                        '$.name',
                    ),
                ).toBe(
                    'Universal Item',
                );


                expect(
                    map.get(
                        '$.count',
                    ),
                ).toBe(
                    42,
                );


                expect(
                    map.get(
                        '$.active',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    result.discovered.every(
                        (property) =>
                            property.source
                            === 'NETWORK',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    result.discovered.every(
                        (property) =>
                            property.extractorId
                            === 'network',
                    ),
                ).toBe(
                    true,
                );
            },
        );


        it(
    'links discovered properties to their originating network response',
    () => {

        const extractor =
            new DefaultNetworkDataExtractor();


        const response =
            createResponse(
                JSON.stringify({
                    data: {
                        name:
                            'Alpha',
                        count:
                            10,
                    },
                }),
                {
                    id:
                        'capture-a:7',

                    sequence:
                        7,
                },
            );


        const result =
            extractor.extract([
                response,
            ]);


        expect(
            result.discovered,
        ).not.toHaveLength(
            0,
        );


        expect(
            result.discovered.every(
                (property) =>
                    property.sourceRef
                    === 'capture-a:7',
            ),
        ).toBe(
            true,
        );
    },
);


        it(
    'preserves distinct provenance when separate responses expose the same path',
    () => {

        const extractor =
            new DefaultNetworkDataExtractor();


        const result =
            extractor.extract([

                createResponse(
                    JSON.stringify({
                        data: {
                            name:
                                'First',
                        },
                    }),
                    {
                        id:
                            'capture-a:0',

                        sequence:
                            0,
                    },
                ),

                createResponse(
                    JSON.stringify({
                        data: {
                            name:
                                'Second',
                        },
                    }),
                    {
                        id:
                            'capture-a:1',

                        sequence:
                            1,
                    },
                ),
            ]);


        const names =
            result.discovered.filter(
                (property) =>
                    property.path
                    === '$.data.name',
            );


        expect(
            names,
        ).toHaveLength(
            2,
        );


        expect(
            names.map(
                (property) =>
                    property.sourceRef,
            ),
        ).toEqual([
            'capture-a:0',
            'capture-a:1',
        ]);


        expect(
            names.map(
                (property) =>
                    property.value,
            ),
        ).toEqual([
            'First',
            'Second',
        ]);
    },
);

        it(
            'extracts deeply nested arbitrary objects',
            () => {

                const {
                    map,
                } =
                    valuesByPath([
                        createResponse(
                            JSON.stringify({
                                account: {
                                    statistics: {
                                        total:
                                            9876,
                                    },
                                },
                            }),
                        ),
                    ]);


                expect(
                    map.get(
                        '$.account.statistics.total',
                    ),
                ).toBe(
                    9876,
                );
            },
        );


        it(
            'traverses arrays of objects using indexed paths',
            () => {

                const {
                    map,
                } =
                    valuesByPath([
                        createResponse(
                            JSON.stringify({
                                records: [
                                    {
                                        name:
                                            'Alpha',
                                    },
                                    {
                                        name:
                                            'Beta',
                                    },
                                ],
                            }),
                        ),
                    ]);


                expect(
                    map.get(
                        '$.records[0].name',
                    ),
                ).toBe(
                    'Alpha',
                );


                expect(
                    map.get(
                        '$.records[1].name',
                    ),
                ).toBe(
                    'Beta',
                );
            },
        );


        it(
            'preserves bounded string arrays as one property',
            () => {

                const {
                    map,
                } =
                    valuesByPath([
                        createResponse(
                            JSON.stringify({
                                tags: [
                                    'one',
                                    'two',
                                    'three',
                                ],
                            }),
                        ),
                    ]);


                expect(
                    map.get(
                        '$.tags',
                    ),
                ).toEqual([
                    'one',
                    'two',
                    'three',
                ]);
            },
        );


        it(
            'traverses non-string primitive arrays with indexed paths',
            () => {

                const {
                    result,
                } =
                    valuesByPath([
                        createResponse(
                            JSON.stringify({
                                values: [
                                    10,
                                    20,
                                    true,
                                ],
                            }),
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            key:
                                'values',
                            path:
                                '$.values[0]',
                            value:
                                10,
                        }),

                        expect.objectContaining({
                            key:
                                'values',
                            path:
                                '$.values[1]',
                            value:
                                20,
                        }),

                        expect.objectContaining({
                            key:
                                'values',
                            path:
                                '$.values[2]',
                            value:
                                true,
                        }),
                    ]),
                );
            },
        );


        it(
            'supports top-level arrays of structured objects',
            () => {

                const {
                    map,
                } =
                    valuesByPath([
                        createResponse(
                            JSON.stringify([
                                {
                                    id:
                                        'A',
                                },
                                {
                                    id:
                                        'B',
                                },
                            ]),
                        ),
                    ]);


                expect(
                    map.get(
                        '$[0].id',
                    ),
                ).toBe(
                    'A',
                );


                expect(
                    map.get(
                        '$[1].id',
                    ),
                ).toBe(
                    'B',
                );
            },
        );


        it(
            'handles GraphQL-shaped JSON without GraphQL-specific logic',
            () => {

                const {
                    result,
                    map,
                } =
                    valuesByPath([
                        createResponse(
                            JSON.stringify({
                                data: {
                                    user: {
                                        __typename:
                                            'User',
                                        id:
                                            '123',
                                        followers:
                                            450,
                                    },
                                },
                            }),
                            {
                                url:
                                    'https://example.test/anything',
                                contentType:
                                    'text/javascript',
                            },
                        ),
                    ]);


                expect(
                    map.get(
                        '$.data.user.id',
                    ),
                ).toBe(
                    '123',
                );


                expect(
                    map.get(
                        '$.data.user.followers',
                    ),
                ).toBe(
                    450,
                );


                expect(
                    result.discovered.some(
                        (property) =>
                            property.key
                            === '__typename',
                    ),
                ).toBe(
                    false,
                );
            },
        );


        it.each([
            [
                'while(1)',
                'while(1);{"data":{"value":1}}',
            ],

            [
                'while(true)',
                'while ( true ) ; {"data":{"value":2}}',
            ],

            [
                'for(;;)',
                'for(;;);{"data":{"value":3}}',
            ],

            [
                'XSSI prefix',
                `)]}'
{"data":{"value":4}}`,
            ],

            [
                'BOM plus guard',
                '\uFEFFwhile(1);{"data":{"value":5}}',
            ],
        ])(
            'safely strips %s transport guards',
            (
                _name,
                body,
            ) => {

                const extractor =
                    new DefaultNetworkDataExtractor();


                const result =
                    extractor.extract([
                        createResponse(
                            body,
                        ),
                    ]);


                expect(
                    result.discovered.some(
                        (property) =>
                            property.key
                            === 'value',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    result.warnings,
                ).toHaveLength(
                    0,
                );
            },
        );


        


        it.each([
            'text/javascript',
            'text/html',
            'application/octet-stream',
            undefined,
        ])(
            'does not trust Content-Type: %s',
            (
                contentType,
            ) => {

                const extractor =
                    new DefaultNetworkDataExtractor();


                const result =
                    extractor.extract([
                        createResponse(
                            '{"universal":true}',
                            {
                                contentType,
                            },
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            key:
                                'universal',
                            value:
                                true,
                        }),
                    ]),
                );
            },
        );


        it(
            'quietly ignores ordinary JavaScript instead of creating warning noise',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor();


                const result =
                    extractor.extract([
                        createResponse(
                            `
                            function hello() {
                                console.log('hello');
                            }
                            `,
                            {
                                contentType:
                                    'text/javascript',
                            },
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual(
                    [],
                );


                expect(
                    result.warnings,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'warns when a body looks like JSON but is malformed',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor();


                const result =
                    extractor.extract([
                        createResponse(
                            '{"user":{"name":"Alice"',
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual(
                    [],
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            extractorId:
                                'network',
                            code:
                                'NETWORK_MALFORMED_JSON',
                        }),
                    ]),
                );
            },
        );


        it(
            'ignores missing and empty bodies',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor();


                const result =
                    extractor.extract([
                        createResponse(
                            undefined,
                        ),

                        createResponse(
                            '',
                        ),

                        createResponse(
                            '   ',
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual(
                    [],
                );


                expect(
                    result.warnings,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'ignores null and blank-string values',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor();


                const result =
                    extractor.extract([
                        createResponse(
                            JSON.stringify({
                                nullable:
                                    null,
                                blank:
                                    '   ',
                                useful:
                                    'value',
                            }),
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual([
                    expect.objectContaining({
                        key:
                            'useful',
                        value:
                            'value',
                    }),
                ]);
            },
        );


        it(
            'creates valid paths for unusual JSON property names',
            () => {

                const {
                    map,
                } =
                    valuesByPath([
                        createResponse(
                            JSON.stringify({
                                'product.name':
                                    'Phone',
                                'sale-price':
                                    100,
                                normal:
                                    true,
                            }),
                        ),
                    ]);


                expect(
                    map.get(
                        '$["product.name"]',
                    ),
                ).toBe(
                    'Phone',
                );


                expect(
                    map.get(
                        '$["sale-price"]',
                    ),
                ).toBe(
                    100,
                );


                expect(
                    map.get(
                        '$.normal',
                    ),
                ).toBe(
                    true,
                );
            },
        );


        it(
            'bounds the number of network responses inspected',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxResponses:
                            1,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            '{"first":1}',
                        ),

                        createResponse(
                            '{"second":2}',
                        ),
                    ]);


                expect(
                    result.discovered.some(
                        (property) =>
                            property.key
                            === 'first',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    result.discovered.some(
                        (property) =>
                            property.key
                            === 'second',
                    ),
                ).toBe(
                    false,
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_RESPONSE_LIMIT_REACHED',
                        }),
                    ]),
                );
            },
        );


        it(
            'bounds discovered properties per response',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxPropertiesPerResponse:
                            2,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            JSON.stringify({
                                a:
                                    1,
                                b:
                                    2,
                                c:
                                    3,
                            }),
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toHaveLength(
                    2,
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_RESPONSE_PROPERTY_LIMIT_REACHED',
                        }),
                    ]),
                );
            },
        );


        it(
            'enforces the total discovered-property budget',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxTotalProperties:
                            3,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            JSON.stringify({
                                a:
                                    1,
                                b:
                                    2,
                            }),
                        ),

                        createResponse(
                            JSON.stringify({
                                c:
                                    3,
                                d:
                                    4,
                            }),
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toHaveLength(
                    3,
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_TOTAL_PROPERTY_LIMIT_REACHED',
                        }),
                    ]),
                );
            },
        );


        it(
            'bounds recursive traversal depth',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxDepth:
                            2,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            JSON.stringify({
                                a: {
                                    b: {
                                        c:
                                            1,
                                    },
                                },
                                shallow:
                                    2,
                            }),
                        ),
                    ]);


                expect(
                    result.discovered.some(
                        (property) =>
                            property.key
                            === 'c',
                    ),
                ).toBe(
                    false,
                );


                expect(
                    result.discovered.some(
                        (property) =>
                            property.key
                            === 'shallow',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_DEPTH_LIMIT_REACHED',
                        }),
                    ]),
                );
            },
        );


        it(
            'bounds total traversal nodes per response',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxNodesPerResponse:
                            2,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            JSON.stringify({
                                a:
                                    1,
                                b:
                                    2,
                                c:
                                    3,
                            }),
                        ),
                    ]);


                expect(
                    result.discovered.length,
                ).toBeLessThan(
                    3,
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_NODE_LIMIT_REACHED',
                        }),
                    ]),
                );
            },
        );


        it(
            'rejects a retained body above the extractor body limit',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxBodyBytes:
                            5,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            '{"a":1}',
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual(
                    [],
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_BODY_TOO_LARGE',
                        }),
                    ]),
                );
            },
        );


        it(
            'enforces the combined body inspection budget',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxTotalBodyBytes:
                            10,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            '{"a":1}',
                        ),

                        createResponse(
                            '{"b":2}',
                        ),
                    ]);


                expect(
                    result.discovered.some(
                        (property) =>
                            property.key
                            === 'a',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    result.discovered.some(
                        (property) =>
                            property.key
                            === 'b',
                    ),
                ).toBe(
                    false,
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_TOTAL_BODY_BUDGET_REACHED',
                        }),
                    ]),
                );
            },
        );


        it(
            'bounds large arrays without losing the bounded prefix',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxArrayItems:
                            2,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            JSON.stringify({
                                values: [
                                    10,
                                    20,
                                    30,
                                    40,
                                ],
                            }),
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            path:
                                '$.values[0]',
                            value:
                                10,
                        }),

                        expect.objectContaining({
                            path:
                                '$.values[1]',
                            value:
                                20,
                        }),
                    ]),
                );


                expect(
                    result.discovered.some(
                        (property) =>
                            property.path
                            === '$.values[2]',
                    ),
                ).toBe(
                    false,
                );


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_ARRAY_LIMIT_REACHED',
                        }),
                    ]),
                );
            },
        );


        it(
            'skips exceptionally large string leaves safely',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor({
                        maxStringLength:
                            4,
                    });


                const result =
                    extractor.extract([
                        createResponse(
                            JSON.stringify({
                                short:
                                    'abcd',
                                oversized:
                                    'abcde',
                            }),
                        ),
                    ]);


                expect(
                    result.discovered,
                ).toEqual([
                    expect.objectContaining({
                        key:
                            'short',
                        value:
                            'abcd',
                    }),
                ]);


                expect(
                    result.warnings,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code:
                                'NETWORK_STRING_TOO_LARGE',
                        }),
                    ]),
                );
            },
        );


        it(
            'does not mutate the supplied network evidence',
            () => {

                const responses = [
                    createResponse(
                        JSON.stringify({
                            data: {
                                value:
                                    123,
                            },
                        }),
                    ),
                ];


                const before =
                    JSON.stringify(
                        responses,
                    );


                const extractor =
                    new DefaultNetworkDataExtractor();


                extractor.extract(
                    responses,
                );


                expect(
                    JSON.stringify(
                        responses,
                    ),
                ).toBe(
                    before,
                );
            },
        );


        it(
            'keeps snippets bounded to fifty characters',
            () => {

                const extractor =
                    new DefaultNetworkDataExtractor();


                const result =
                    extractor.extract([
                        createResponse(
                            JSON.stringify({
                                description:
                                    'x'.repeat(
                                        200,
                                    ),
                            }),
                        ),
                    ]);


                expect(
                    result.discovered[0]
                        ?.snippet
                        ?.length,
                ).toBeLessThanOrEqual(
                    50,
                );
            },
        );
    },
);
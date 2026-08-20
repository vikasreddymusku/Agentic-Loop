import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    ExtractionResult,
} from '../../core/contracts/parser/extraction-result.js';

import type {
    ExtractionSource,
} from '../../core/contracts/parser/extraction-source.js';

import type {
    FieldExtraction,
} from '../../core/contracts/parser/field-extraction.js';

import {
    DefaultFieldResolver,
} from './default-field-resolver.js';


function candidate(
    options: {

        field:
            string;

        value:
            FieldExtraction['value'];

        confidence:
            number;

        source?:
            ExtractionSource;

        extractorId?:
            string;

        location?:
            string;
    },
): FieldExtraction {

    const source =
        options.source
        ?? 'JSON_LD';


    return {

        field:
            options.field,

        value:
            options.value,

        confidence:
            options.confidence,

        evidence: {

            extractorId:
                options.extractorId
                ?? source
                    .toLowerCase()
                    .replace(
                        '_',
                        '-',
                    ),

            source,

            vocabulary:
                source === 'JSON_LD'
                || source === 'MICRODATA'
                    ? 'SCHEMA_ORG'
                    : source === 'META'
                        ? 'OPEN_GRAPH'
                        : 'OTHER',

            location:
                options.location
                ?? `$.${options.field}`,

            snippet:
                String(
                    options.value,
                ).slice(
                    0,
                    50,
                ),
        },
    };
}


function extractionResult(
    options?: {

        candidates?:
            Record<
                string,
                FieldExtraction[]
            >;

        missingFields?:
            string[];
    },
): ExtractionResult {

    const candidates =
        options?.candidates
        ?? {};


    const missingFields =
        options?.missingFields
        ?? [];


    return {

        jobId:
            'resolver-job-1',

        status:
            Object.keys(
                candidates,
            ).length === 0
                ? 'NO_DATA'
                : missingFields.length > 0
                    ? 'PARTIAL'
                    : 'PARSED',

        candidates,

        missingFields,

        warnings:
            [],
    };
}


describe(
    'DefaultFieldResolver',
    () => {

        it(
            'selects a single candidate',
            () => {

                const resolver =
                    new DefaultFieldResolver();


                const price =
                    candidate({

                        field:
                            'price',

                        value:
                            24999,

                        confidence:
                            0.98,
                    });


                const result =
                    resolver.resolve(
                        extractionResult({

                            candidates: {
                                price: [
                                    price,
                                ],
                            },
                        }),
                    );


                expect(
                    result.resolved.price,
                ).toEqual({

                    field:
                        'price',

                    value:
                        24999,

                    confidence:
                        0.98,

                    evidence:
                        price.evidence,
                });
            },
        );


        it(
            'selects the candidate with the highest confidence',
            () => {

                const resolver =
                    new DefaultFieldResolver();


                const result =
                    resolver.resolve(
                        extractionResult({

                            candidates: {

                                price: [

                                    candidate({

                                        field:
                                            'price',

                                        value:
                                            '24999',

                                        confidence:
                                            0.90,

                                        source:
                                            'JSON_LD',
                                    }),

                                    candidate({

                                        field:
                                            'price',

                                        value:
                                            '25999',

                                        confidence:
                                            0.98,

                                        source:
                                            'META',
                                    }),
                                ],
                            },
                        }),
                    );


                expect(
                    result.resolved.price
                        ?.value,
                ).toBe(
                    '25999',
                );


                expect(
                    result.resolved.price
                        ?.confidence,
                ).toBe(
                    0.98,
                );
            },
        );


        it(
            'never allows source priority to override higher confidence',
            () => {

                const resolver =
                    new DefaultFieldResolver();


                const result =
                    resolver.resolve(
                        extractionResult({

                            candidates: {

                                title: [

                                    candidate({

                                        field:
                                            'title',

                                        value:
                                            'JSON-LD title',

                                        confidence:
                                            0.97,

                                        source:
                                            'JSON_LD',
                                    }),

                                    candidate({

                                        field:
                                            'title',

                                        value:
                                            'Meta title',

                                        confidence:
                                            0.98,

                                        source:
                                            'META',
                                    }),
                                ],
                            },
                        }),
                    );


                expect(
                    result.resolved.title
                        ?.value,
                ).toBe(
                    'Meta title',
                );
            },
        );


        it(
            'uses source priority when confidence values are equal',
            () => {

                const resolver =
                    new DefaultFieldResolver();


                const result =
                    resolver.resolve(
                        extractionResult({

                            candidates: {

                                title: [

                                    candidate({

                                        field:
                                            'title',

                                        value:
                                            'Meta title',

                                        confidence:
                                            0.95,

                                        source:
                                            'META',
                                    }),

                                    candidate({

                                        field:
                                            'title',

                                        value:
                                            'Microdata title',

                                        confidence:
                                            0.95,

                                        source:
                                            'MICRODATA',
                                    }),

                                    candidate({

                                        field:
                                            'title',

                                        value:
                                            'JSON-LD title',

                                        confidence:
                                            0.95,

                                        source:
                                            'JSON_LD',
                                    }),
                                ],
                            },
                        }),
                    );


                expect(
                    result.resolved.title
                        ?.value,
                ).toBe(
                    'JSON-LD title',
                );


                expect(
                    result.resolved.title
                        ?.evidence.source,
                ).toBe(
                    'JSON_LD',
                );
            },
        );


        it(
            'preserves the first candidate when confidence and source are tied',
            () => {

                const resolver =
                    new DefaultFieldResolver();


                const result =
                    resolver.resolve(
                        extractionResult({

                            candidates: {

                                headline: [

                                    candidate({

                                        field:
                                            'headline',

                                        value:
                                            'First headline',

                                        confidence:
                                            0.95,

                                        source:
                                            'META',
                                    }),

                                    candidate({

                                        field:
                                            'headline',

                                        value:
                                            'Second headline',

                                        confidence:
                                            0.95,

                                        source:
                                            'META',
                                    }),
                                ],
                            },
                        }),
                    );


                expect(
                    result.resolved.headline
                        ?.value,
                ).toBe(
                    'First headline',
                );
            },
        );


        it(
            'resolves multiple requested fields independently',
            () => {

                const resolver =
                    new DefaultFieldResolver();


                const result =
                    resolver.resolve(
                        extractionResult({

                            candidates: {

                                title: [

                                    candidate({

                                        field:
                                            'title',

                                        value:
                                            'Backend Developer',

                                        confidence:
                                            0.98,
                                    }),
                                ],

                                company: [

                                    candidate({

                                        field:
                                            'company',

                                        value:
                                            'Acme',

                                        confidence:
                                            0.95,

                                        source:
                                            'MICRODATA',
                                    }),
                                ],

                                salary: [

                                    candidate({

                                        field:
                                            'salary',

                                        value:
                                            '1200000',

                                        confidence:
                                            1,
                                    }),
                                ],
                            },
                        }),
                    );


                expect(
                    Object.keys(
                        result.resolved,
                    ),
                ).toEqual([
                    'title',
                    'company',
                    'salary',
                ]);


                expect(
                    result.resolved.company
                        ?.value,
                ).toBe(
                    'Acme',
                );
            },
        );


        it(
            'preserves missing fields and warnings',
            () => {

                const resolver =
                    new DefaultFieldResolver();


                const input =
                    extractionResult({

                        candidates: {

                            title: [

                                candidate({

                                    field:
                                        'title',

                                    value:
                                        'Article title',

                                    confidence:
                                        0.98,
                                }),
                            ],
                        },

                        missingFields: [
                            'author',
                            'datePublished',
                        ],
                    });


                input.warnings.push({

                    extractorId:
                        'json-ld',

                    code:
                        'JSON_LD_PARSE_ERROR',

                    message:
                        'One JSON-LD block was malformed.',
                });


                const result =
                    resolver.resolve(
                        input,
                    );


                expect(
                    result.missingFields,
                ).toEqual([
                    'author',
                    'datePublished',
                ]);


                expect(
                    result.warnings,
                ).toEqual(
                    input.warnings,
                );


                /**
                 * Arrays should be copied rather than
                 * shared with ExtractionResult.
                 */
                expect(
                    result.missingFields,
                ).not.toBe(
                    input.missingFields,
                );


                expect(
                    result.warnings,
                ).not.toBe(
                    input.warnings,
                );
            },
        );


        it(
            'returns an empty resolved map when there are no candidates',
            () => {

                const resolver =
                    new DefaultFieldResolver();


                const result =
                    resolver.resolve(
                        extractionResult({

                            candidates:
                                {},

                            missingFields: [
                                'price',
                                'rating',
                            ],
                        }),
                    );


                expect(
                    result,
                ).toEqual({

                    jobId:
                        'resolver-job-1',

                    resolved:
                        {},

                    missingFields: [
                        'price',
                        'rating',
                    ],

                    warnings:
                        [],
                });
            },
        );
    },
);
import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    ExtractionValue,
} from '../../core/contracts/parser/extraction-value.js';

import type {
    FieldEvidence,
} from '../../core/contracts/parser/field-evidence.js';

import type {
    NormalizerInput,
} from '../../core/contracts/parser/normalizer.js';

import type {
    ResolvedExtraction,
    ResolvedField,
} from '../../core/contracts/parser/resolved-extraction.js';

import type {
    RequestedField,
    RequestedFieldType,
} from '../../core/contracts/scrape-job.js';

import {
    DefaultNormalizer,
} from './default-normalizer.js';


function requestedField(
    name:
        string,

    type:
        RequestedFieldType,
): RequestedField {

    return {

        name,

        type,
    };
}


function evidence(
    location:
        string = '$.value',
): FieldEvidence {

    return {

        extractorId:
            'json-ld',

        source:
            'JSON_LD',

        vocabulary:
            'SCHEMA_ORG',

        location,

        snippet:
            'test',
    };
}


function resolvedField(
    field:
        string,

    value:
        ExtractionValue,

    confidence:
        number = 0.98,
): ResolvedField {

    return {

        field,

        value,

        confidence,

        evidence:
            evidence(
                `$.${field}`,
            ),
    };
}


function createExtraction(
    resolved:
        Record<
            string,
            ResolvedField
        >,

    missingFields:
        string[] = [],
): ResolvedExtraction {

    return {

        jobId:
            'normalizer-job-1',

        resolved,

        missingFields,

        warnings:
            [],
    };
}


function createInput(
    requestedFields:
        RequestedField[],

    extraction:
        ResolvedExtraction,
): NormalizerInput {

    return {

        requestedFields,

        extraction,
    };
}


describe(
    'DefaultNormalizer',
    () => {

        it(
            'preserves strings exactly and converts numbers and booleans to strings',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const result =
                    normalizer.normalize(
                        createInput(

                            [
                                requestedField(
                                    'title',
                                    'string',
                                ),

                                requestedField(
                                    'priceText',
                                    'string',
                                ),

                                requestedField(
                                    'activeText',
                                    'string',
                                ),
                            ],

                            createExtraction({

                                title:
                                    resolvedField(
                                        'title',
                                        '  Original title  ',
                                    ),

                                priceText:
                                    resolvedField(
                                        'priceText',
                                        24999,
                                    ),

                                activeText:
                                    resolvedField(
                                        'activeText',
                                        true,
                                    ),
                            }),
                        ),
                    );


                expect(
                    result.normalized.title
                        ?.value,
                ).toBe(
                    '  Original title  ',
                );


                expect(
                    result.normalized.title
                        ?.originalValue,
                ).toBe(
                    '  Original title  ',
                );


                expect(
                    result.normalized.priceText
                        ?.value,
                ).toBe(
                    '24999',
                );


                expect(
                    result.normalized.activeText
                        ?.value,
                ).toBe(
                    'true',
                );


                expect(
                    result.issues,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'rejects arrays and null for string fields as unsupported values',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const result =
                    normalizer.normalize(
                        createInput(

                            [
                                requestedField(
                                    'skills',
                                    'string',
                                ),

                                requestedField(
                                    'description',
                                    'string',
                                ),
                            ],

                            createExtraction({

                                skills:
                                    resolvedField(
                                        'skills',
                                        [
                                            'TypeScript',
                                            'Node.js',
                                        ],
                                    ),

                                description:
                                    resolvedField(
                                        'description',
                                        null,
                                    ),
                            }),
                        ),
                    );


                expect(
                    result.normalized,
                ).toEqual(
                    {},
                );


                expect(
                    result.issues,
                ).toEqual([
                    expect.objectContaining({

                        field:
                            'skills',

                        code:
                            'UNSUPPORTED_VALUE',

                        expectedType:
                            'string',
                    }),

                    expect.objectContaining({

                        field:
                            'description',

                        code:
                            'UNSUPPORTED_VALUE',

                        expectedType:
                            'string',
                    }),
                ]);
            },
        );


        it(
            'normalizes finite numbers and strict numeric strings',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const result =
                    normalizer.normalize(
                        createInput(

                            [
                                requestedField(
                                    'existing',
                                    'number',
                                ),

                                requestedField(
                                    'integer',
                                    'number',
                                ),

                                requestedField(
                                    'decimal',
                                    'number',
                                ),

                                requestedField(
                                    'fraction',
                                    'number',
                                ),

                                requestedField(
                                    'scientific',
                                    'number',
                                ),
                            ],

                            createExtraction({

                                existing:
                                    resolvedField(
                                        'existing',
                                        42,
                                    ),

                                integer:
                                    resolvedField(
                                        'integer',
                                        ' 24999 ',
                                    ),

                                decimal:
                                    resolvedField(
                                        'decimal',
                                        '-42.5',
                                    ),

                                fraction:
                                    resolvedField(
                                        'fraction',
                                        '.75',
                                    ),

                                scientific:
                                    resolvedField(
                                        'scientific',
                                        '1e3',
                                    ),
                            }),
                        ),
                    );


                expect(
                    result.normalized.existing
                        ?.value,
                ).toBe(
                    42,
                );


                expect(
                    result.normalized.integer
                        ?.value,
                ).toBe(
                    24999,
                );


                expect(
                    result.normalized.decimal
                        ?.value,
                ).toBe(
                    -42.5,
                );


                expect(
                    result.normalized.fraction
                        ?.value,
                ).toBe(
                    0.75,
                );


                expect(
                    result.normalized.scientific
                        ?.value,
                ).toBe(
                    1000,
                );


                expect(
                    result.issues,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'rejects malformed numeric strings with TYPE_CONVERSION_FAILED',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const values = {
                    currency:
                        '₹24,999',

                    comma:
                        '1,234',

                    empty:
                        '   ',

                    hexadecimal:
                        '0x10',

                    nan:
                        'NaN',

                    infinity:
                        'Infinity',

                    text:
                        'Salary not disclosed',
                };


                const requestedFields =
                    Object.keys(
                        values,
                    ).map(
                        name =>
                            requestedField(
                                name,
                                'number',
                            ),
                    );


                const resolved =
                    Object.fromEntries(
                        Object.entries(
                            values,
                        ).map(
                            (
                                [
                                    name,
                                    value,
                                ],
                            ) => [

                                name,

                                resolvedField(
                                    name,
                                    value,
                                ),
                            ],
                        ),
                    );


                const result =
                    normalizer.normalize(
                        createInput(

                            requestedFields,

                            createExtraction(
                                resolved,
                            ),
                        ),
                    );


                expect(
                    result.normalized,
                ).toEqual(
                    {},
                );


                expect(
                    result.issues,
                ).toHaveLength(
                    7,
                );


                expect(
                    result.issues.every(
                        issue =>
                            issue.code
                            === 'TYPE_CONVERSION_FAILED',
                    ),
                ).toBe(
                    true,
                );
            },
        );


        it(
            'rejects incompatible and non-finite number values as unsupported',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const result =
                    normalizer.normalize(
                        createInput(

                            [
                                requestedField(
                                    'booleanValue',
                                    'number',
                                ),

                                requestedField(
                                    'arrayValue',
                                    'number',
                                ),

                                requestedField(
                                    'nullValue',
                                    'number',
                                ),

                                requestedField(
                                    'infinityValue',
                                    'number',
                                ),

                                requestedField(
                                    'nanValue',
                                    'number',
                                ),
                            ],

                            createExtraction({

                                booleanValue:
                                    resolvedField(
                                        'booleanValue',
                                        true,
                                    ),

                                arrayValue:
                                    resolvedField(
                                        'arrayValue',
                                        [
                                            '10',
                                            '20',
                                        ],
                                    ),

                                nullValue:
                                    resolvedField(
                                        'nullValue',
                                        null,
                                    ),

                                infinityValue:
                                    resolvedField(
                                        'infinityValue',
                                        Number.POSITIVE_INFINITY,
                                    ),

                                nanValue:
                                    resolvedField(
                                        'nanValue',
                                        Number.NaN,
                                    ),
                            }),
                        ),
                    );


                expect(
                    result.issues,
                ).toHaveLength(
                    5,
                );


                expect(
                    result.issues.every(
                        issue =>
                            issue.code
                            === 'UNSUPPORTED_VALUE',
                    ),
                ).toBe(
                    true,
                );
            },
        );


        it(
            'normalizes booleans and true or false strings conservatively',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const result =
                    normalizer.normalize(
                        createInput(

                            [
                                requestedField(
                                    'existingTrue',
                                    'boolean',
                                ),

                                requestedField(
                                    'existingFalse',
                                    'boolean',
                                ),

                                requestedField(
                                    'stringTrue',
                                    'boolean',
                                ),

                                requestedField(
                                    'stringFalse',
                                    'boolean',
                                ),
                            ],

                            createExtraction({

                                existingTrue:
                                    resolvedField(
                                        'existingTrue',
                                        true,
                                    ),

                                existingFalse:
                                    resolvedField(
                                        'existingFalse',
                                        false,
                                    ),

                                stringTrue:
                                    resolvedField(
                                        'stringTrue',
                                        ' TRUE ',
                                    ),

                                stringFalse:
                                    resolvedField(
                                        'stringFalse',
                                        ' False ',
                                    ),
                            }),
                        ),
                    );


                expect(
                    result.normalized.existingTrue
                        ?.value,
                ).toBe(
                    true,
                );


                expect(
                    result.normalized.existingFalse
                        ?.value,
                ).toBe(
                    false,
                );


                expect(
                    result.normalized.stringTrue
                        ?.value,
                ).toBe(
                    true,
                );


                expect(
                    result.normalized.stringFalse
                        ?.value,
                ).toBe(
                    false,
                );


                expect(
                    result.issues,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'distinguishes invalid boolean strings from unsupported boolean source types',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const result =
                    normalizer.normalize(
                        createInput(

                            [
                                requestedField(
                                    'yesValue',
                                    'boolean',
                                ),

                                requestedField(
                                    'numericValue',
                                    'boolean',
                                ),

                                requestedField(
                                    'arrayValue',
                                    'boolean',
                                ),

                                requestedField(
                                    'nullValue',
                                    'boolean',
                                ),
                            ],

                            createExtraction({

                                yesValue:
                                    resolvedField(
                                        'yesValue',
                                        'yes',
                                    ),

                                numericValue:
                                    resolvedField(
                                        'numericValue',
                                        1,
                                    ),

                                arrayValue:
                                    resolvedField(
                                        'arrayValue',
                                        [
                                            'true',
                                        ],
                                    ),

                                nullValue:
                                    resolvedField(
                                        'nullValue',
                                        null,
                                    ),
                            }),
                        ),
                    );


                expect(
                    result.issues,
                ).toEqual([
                    expect.objectContaining({

                        field:
                            'yesValue',

                        code:
                            'TYPE_CONVERSION_FAILED',
                    }),

                    expect.objectContaining({

                        field:
                            'numericValue',

                        code:
                            'UNSUPPORTED_VALUE',
                    }),

                    expect.objectContaining({

                        field:
                            'arrayValue',

                        code:
                            'UNSUPPORTED_VALUE',
                    }),

                    expect.objectContaining({

                        field:
                            'nullValue',

                        code:
                            'UNSUPPORTED_VALUE',
                    }),
                ]);
            },
        );


        it(
            'preserves string arrays with defensive copies and rejects non-arrays',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const skills = [
                    'TypeScript',
                    'Node.js',
                ];


                const input =
                    createInput(

                        [
                            requestedField(
                                'skills',
                                'array',
                            ),

                            requestedField(
                                'singleSkill',
                                'array',
                            ),
                        ],

                        createExtraction({

                            skills:
                                resolvedField(
                                    'skills',
                                    skills,
                                ),

                            singleSkill:
                                resolvedField(
                                    'singleSkill',
                                    'TypeScript',
                                ),
                        }),
                    );


                const result =
                    normalizer.normalize(
                        input,
                    );


                expect(
                    result.normalized.skills
                        ?.value,
                ).toEqual([
                    'TypeScript',
                    'Node.js',
                ]);


                expect(
                    result.normalized.skills
                        ?.originalValue,
                ).toEqual([
                    'TypeScript',
                    'Node.js',
                ]);


                expect(
                    result.normalized.skills
                        ?.value,
                ).not.toBe(
                    skills,
                );


                expect(
                    result.normalized.skills
                        ?.originalValue,
                ).not.toBe(
                    skills,
                );


                expect(
                    result.issues,
                ).toEqual([
                    expect.objectContaining({

                        field:
                            'singleSkill',

                        code:
                            'UNSUPPORTED_VALUE',

                        expectedType:
                            'array',
                    }),
                ]);
            },
        );


        it(
            'uses the requested schema as authority and ignores stray resolved fields',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const source =
                    resolvedField(
                        'price',
                        '24999',
                        0.95,
                    );


                const result =
                    normalizer.normalize(
                        createInput(

                            [
                                requestedField(
                                    'price',
                                    'number',
                                ),
                            ],

                            createExtraction({

                                price:
                                    source,

                                unexpected:
                                    resolvedField(
                                        'unexpected',
                                        'should not appear',
                                    ),
                            }),
                        ),
                    );


                expect(
                    Object.keys(
                        result.normalized,
                    ),
                ).toEqual([
                    'price',
                ]);


                expect(
                    result.normalized.price,
                ).toEqual({

                    field:
                        'price',

                    type:
                        'number',

                    originalValue:
                        '24999',

                    value:
                        24999,

                    confidence:
                        0.95,

                    evidence:
                        source.evidence,
                });


                expect(
                    result.normalized.price
                        ?.evidence,
                ).not.toBe(
                    source.evidence,
                );
            },
        );


        it(
            'preserves upstream missing fields and warnings without mutating their arrays',
            () => {

                const normalizer =
                    new DefaultNormalizer();


                const extraction =
                    createExtraction(

                        {
                            title:
                                resolvedField(
                                    'title',
                                    'Article title',
                                ),
                        },

                        [
                            'author',
                        ],
                    );


                extraction.warnings.push({

                    extractorId:
                        'json-ld',

                    code:
                        'JSON_LD_PARSE_ERROR',

                    message:
                        'Malformed JSON-LD block.',
                });


                const result =
                    normalizer.normalize(
                        createInput(

                            [
                                requestedField(
                                    'title',
                                    'string',
                                ),

                                requestedField(
                                    'author',
                                    'string',
                                ),
                            ],

                            extraction,
                        ),
                    );


                expect(
                    result.jobId,
                ).toBe(
                    'normalizer-job-1',
                );


                expect(
                    result.missingFields,
                ).toEqual([
                    'author',
                ]);


                expect(
                    result.warnings,
                ).toEqual(
                    extraction.warnings,
                );


                expect(
                    result.missingFields,
                ).not.toBe(
                    extraction.missingFields,
                );


                expect(
                    result.warnings,
                ).not.toBe(
                    extraction.warnings,
                );


                /**
                 * Missing fields must NOT generate a
                 * normalization issue.
                 */
                expect(
                    result.issues,
                ).toEqual(
                    [],
                );
            },
        );
    },
);
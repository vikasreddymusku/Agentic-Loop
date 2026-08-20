import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    ExtractionValue,
} from '../../core/contracts/parser/extraction-value.js';

import type {
    NormalizationIssue,
    NormalizedExtraction,
    NormalizedField,
} from '../../core/contracts/parser/normalized-extraction.js';

import type {
    RequestedField,
    RequestedFieldType,
} from '../../core/contracts/scrape-job.js';

import type {
    ValidatorInput,
} from '../../core/contracts/parser/validator.js';

import {
    DefaultValidator,
} from './default-validator.js';


function requestedField(
    name:
        string,

    type:
        RequestedFieldType,

    required?:
        boolean,
): RequestedField {

    return {

        name,

        type,

        ...(required === undefined
            ? {}
            : {
                required,
            }),
    };
}


function normalizedField(
    field:
        string,

    type:
        RequestedFieldType,

    value:
        ExtractionValue,
): NormalizedField {

    return {

        field,

        type,

        originalValue:
            Array.isArray(
                value,
            )
                ? [
                    ...value,
                ]
                : value,

        value,

        confidence:
            0.98,

        evidence: {

            extractorId:
                'json-ld',

            source:
                'JSON_LD',

            vocabulary:
                'SCHEMA_ORG',

            location:
                `$.${field}`,

            snippet:
                String(
                    value,
                ).slice(
                    0,
                    50,
                ),
        },
    };
}


function normalizationIssue(
    field:
        string,

    expectedType:
        RequestedFieldType,

    originalValue:
        ExtractionValue,
): NormalizationIssue {

    return {

        field,

        code:
            'TYPE_CONVERSION_FAILED',

        message:
            `Could not normalize "${field}".`,

        originalValue,

        expectedType,
    };
}


function extraction(
    options?: {

        normalized?:
            Record<
                string,
                NormalizedField
            >;

        missingFields?:
            string[];

        issues?:
            NormalizationIssue[];
    },
): NormalizedExtraction {

    return {

        jobId:
            'validator-job-1',

        normalized:
            options?.normalized
            ?? {},

        missingFields:
            options?.missingFields
            ?? [],

        issues:
            options?.issues
            ?? [],

        warnings:
            [],
    };
}


function input(
    requestedFields:
        RequestedField[],

    normalizedExtraction:
        NormalizedExtraction,
): ValidatorInput {

    return {

        requestedFields,

        extraction:
            normalizedExtraction,
    };
}


describe(
    'DefaultValidator',
    () => {

        it(
            'returns VALID when every requested field is valid',
            () => {

                const validator =
                    new DefaultValidator();


                const result =
                    validator.validate(
                        input(

                            [
                                requestedField(
                                    'title',
                                    'string',
                                    true,
                                ),

                                requestedField(
                                    'price',
                                    'number',
                                ),
                            ],

                            extraction({

                                normalized: {

                                    title:
                                        normalizedField(
                                            'title',
                                            'string',
                                            'Phone',
                                        ),

                                    price:
                                        normalizedField(
                                            'price',
                                            'number',
                                            24999,
                                        ),
                                },
                            }),
                        ),
                    );


                expect(
                    result.status,
                ).toBe(
                    'VALID',
                );


                expect(
                    result.validFields,
                ).toEqual([
                    'title',
                    'price',
                ]);


                expect(
                    result.invalidFields,
                ).toEqual(
                    [],
                );


                expect(
                    result.issues,
                ).toEqual(
                    [],
                );
            },
        );


        it(
            'returns INVALID when a required field is missing',
            () => {

                const validator =
                    new DefaultValidator();


                const result =
                    validator.validate(
                        input(

                            [
                                requestedField(
                                    'title',
                                    'string',
                                    true,
                                ),

                                requestedField(
                                    'company',
                                    'string',
                                    true,
                                ),
                            ],

                            extraction({

                                normalized: {

                                    title:
                                        normalizedField(
                                            'title',
                                            'string',
                                            'Developer',
                                        ),
                                },

                                missingFields: [
                                    'company',
                                ],
                            }),
                        ),
                    );


                expect(
                    result.status,
                ).toBe(
                    'INVALID',
                );


                expect(
                    result.issues,
                ).toEqual([
                    expect.objectContaining({

                        field:
                            'company',

                        code:
                            'MISSING_REQUIRED_FIELD',

                        expectedType:
                            'string',
                    }),
                ]);


                expect(
                    result.invalidFields,
                ).toContain(
                    'company',
                );
            },
        );


        it(
            'returns PARTIAL when only an optional field is missing',
            () => {

                const validator =
                    new DefaultValidator();


                const result =
                    validator.validate(
                        input(

                            [
                                requestedField(
                                    'title',
                                    'string',
                                    true,
                                ),

                                requestedField(
                                    'salary',
                                    'number',
                                ),
                            ],

                            extraction({

                                normalized: {

                                    title:
                                        normalizedField(
                                            'title',
                                            'string',
                                            'Developer',
                                        ),
                                },

                                missingFields: [
                                    'salary',
                                ],
                            }),
                        ),
                    );


                expect(
                    result.status,
                ).toBe(
                    'PARTIAL',
                );


                /**
                 * Optional missing fields do not
                 * create validation issues.
                 */
                expect(
                    result.issues,
                ).toEqual(
                    [],
                );


                expect(
                    result.missingFields,
                ).toEqual([
                    'salary',
                ]);
            },
        );


        it(
            'returns INVALID when a required field failed normalization',
            () => {

                const validator =
                    new DefaultValidator();


                const result =
                    validator.validate(
                        input(

                            [
                                requestedField(
                                    'price',
                                    'number',
                                    true,
                                ),
                            ],

                            extraction({

                                issues: [

                                    normalizationIssue(
                                        'price',
                                        'number',
                                        '₹24,999',
                                    ),
                                ],
                            }),
                        ),
                    );


                expect(
                    result.status,
                ).toBe(
                    'INVALID',
                );


                expect(
                    result.issues,
                ).toEqual([
                    expect.objectContaining({

                        field:
                            'price',

                        code:
                            'NORMALIZATION_FAILED',

                        expectedType:
                            'number',

                        actualValue:
                            '₹24,999',

                        normalizationIssueCode:
                            'TYPE_CONVERSION_FAILED',
                    }),
                ]);
            },
        );


        it(
            'returns PARTIAL when an optional field failed normalization but required fields are valid',
            () => {

                const validator =
                    new DefaultValidator();


                const result =
                    validator.validate(
                        input(

                            [
                                requestedField(
                                    'title',
                                    'string',
                                    true,
                                ),

                                requestedField(
                                    'price',
                                    'number',
                                ),
                            ],

                            extraction({

                                normalized: {

                                    title:
                                        normalizedField(
                                            'title',
                                            'string',
                                            'Product',
                                        ),
                                },

                                issues: [

                                    normalizationIssue(
                                        'price',
                                        'number',
                                        '$19.99',
                                    ),
                                ],
                            }),
                        ),
                    );


                expect(
                    result.status,
                ).toBe(
                    'PARTIAL',
                );


                expect(
                    result.invalidFields,
                ).toEqual([
                    'price',
                ]);


                expect(
                    result.validFields,
                ).toEqual([
                    'title',
                ]);
            },
        );


        it(
            'detects a runtime value type mismatch defensively',
            () => {

                const validator =
                    new DefaultValidator();


                /**
                 * Deliberately malformed normalized
                 * state to test the validation
                 * boundary.
                 */
                const malformed =
                    normalizedField(
                        'price',
                        'number',
                        24999,
                    );


                malformed.value =
                    '24999';


                const result =
                    validator.validate(
                        input(

                            [
                                requestedField(
                                    'price',
                                    'number',
                                    true,
                                ),
                            ],

                            extraction({

                                normalized: {
                                    price:
                                        malformed,
                                },
                            }),
                        ),
                    );


                expect(
                    result.status,
                ).toBe(
                    'INVALID',
                );


                expect(
                    result.issues,
                ).toEqual([
                    expect.objectContaining({

                        field:
                            'price',

                        code:
                            'TYPE_MISMATCH',

                        expectedType:
                            'number',

                        actualValue:
                            '24999',
                    }),
                ]);
            },
        );


        it(
            'detects a NormalizedField type metadata mismatch',
            () => {

                const validator =
                    new DefaultValidator();


                const malformed =
                    normalizedField(
                        'active',
                        'string',
                        'true',
                    );


                const result =
                    validator.validate(
                        input(

                            [
                                requestedField(
                                    'active',
                                    'boolean',
                                    true,
                                ),
                            ],

                            extraction({

                                normalized: {
                                    active:
                                        malformed,
                                },
                            }),
                        ),
                    );


                expect(
                    result.status,
                ).toBe(
                    'INVALID',
                );


                expect(
                    result.invalidFields,
                ).toEqual([
                    'active',
                ]);


                expect(
                    result.issues[0]
                        ?.code,
                ).toBe(
                    'TYPE_MISMATCH',
                );
            },
        );


        it(
            'uses deterministic status rules when there are no required fields',
            () => {

                const validator =
                    new DefaultValidator();


                const allValid =
                    validator.validate(
                        input(

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

                            extraction({

                                normalized: {

                                    title:
                                        normalizedField(
                                            'title',
                                            'string',
                                            'Article',
                                        ),

                                    author:
                                        normalizedField(
                                            'author',
                                            'string',
                                            'Jane',
                                        ),
                                },
                            }),
                        ),
                    );


                expect(
                    allValid.status,
                ).toBe(
                    'VALID',
                );


                const someValid =
                    validator.validate(
                        input(

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

                            extraction({

                                normalized: {

                                    title:
                                        normalizedField(
                                            'title',
                                            'string',
                                            'Article',
                                        ),
                                },

                                missingFields: [
                                    'author',
                                ],
                            }),
                        ),
                    );


                expect(
                    someValid.status,
                ).toBe(
                    'PARTIAL',
                );


                const noneValid =
                    validator.validate(
                        input(

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

                            extraction({

                                missingFields: [
                                    'title',
                                    'author',
                                ],
                            }),
                        ),
                    );


                expect(
                    noneValid.status,
                ).toBe(
                    'INVALID',
                );
            },
        );


        it(
            'uses the requested schema as authority and ignores stray normalized fields',
            () => {

                const validator =
                    new DefaultValidator();


                const result =
                    validator.validate(
                        input(

                            [
                                requestedField(
                                    'title',
                                    'string',
                                ),
                            ],

                            extraction({

                                normalized: {

                                    title:
                                        normalizedField(
                                            'title',
                                            'string',
                                            'Expected title',
                                        ),

                                    unexpected:
                                        normalizedField(
                                            'unexpected',
                                            'string',
                                            'Do not expose me',
                                        ),
                                },
                            }),
                        ),
                    );


                expect(
                    result.status,
                ).toBe(
                    'VALID',
                );


                expect(
                    Object.keys(
                        result.validated,
                    ),
                ).toEqual([
                    'title',
                ]);
            },
        );


        it(
            'preserves warnings and missing fields with defensive copies',
            () => {

                const validator =
                    new DefaultValidator();


                const source =
                    extraction({

                        normalized: {

                            title:
                                normalizedField(
                                    'title',
                                    'string',
                                    'Article',
                                ),
                        },

                        missingFields: [
                            'author',
                        ],
                    });


                source.warnings.push({

                    extractorId:
                        'json-ld',

                    code:
                        'JSON_LD_PARSE_ERROR',

                    message:
                        'Malformed block.',
                });


                const result =
                    validator.validate(
                        input(

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

                            source,
                        ),
                    );


                expect(
                    result.warnings,
                ).toEqual(
                    source.warnings,
                );


                expect(
                    result.missingFields,
                ).toEqual(
                    source.missingFields,
                );


                expect(
                    result.warnings,
                ).not.toBe(
                    source.warnings,
                );


                expect(
                    result.missingFields,
                ).not.toBe(
                    source.missingFields,
                );


                expect(
                    result.validated.title,
                ).not.toBe(
                    source.normalized.title,
                );


                expect(
                    result.validated.title
                        ?.evidence,
                ).not.toBe(
                    source.normalized.title
                        ?.evidence,
                );
            },
        );
    },
);
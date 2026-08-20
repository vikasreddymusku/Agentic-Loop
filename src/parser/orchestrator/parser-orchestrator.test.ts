import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import type {
    DiscoveredProperty,
} from '../../core/contracts/parser/discovered-property.js';

import type {
    ExtractionWarning,
} from '../../core/contracts/parser/extraction-result.js';

import type {
    DeterministicExtractor,
} from '../../core/contracts/parser/extractor.js';

import type {
    FieldExtraction,
} from '../../core/contracts/parser/field-extraction.js';

import type {
    FieldMatcher,
} from '../../core/contracts/parser/field-matcher.js';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';

import type {
    RequestedField,
} from '../../core/contracts/scrape-job.js';

import {
    ParserOrchestrator,
} from './parser-orchestrator.js';


function createRequestedField(
    name:
        string,
): RequestedField {

    return {

        name,

        type:
            'string',
    };
}


function createInput(
    requestedFields:
        RequestedField[] = [
            createRequestedField(
                'title',
            ),
        ],
): ParserInput {

    const html =
        '<html></html>';


    return {

        job: {

            id:
                'parser-job-1',

            url:
                'https://example.com/',

            requestedFields,

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

            headers: {
                'content-type':
                    'text/html',
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


function createDiscovered(
    key:
        string,

    value:
        string,

    path:
        string = `$.${key}`,
): DiscoveredProperty {

    return {

        key,

        path,

        value,

        source:
            'JSON_LD',

        vocabulary:
            'SCHEMA_ORG',

        extractorId:
            'json-ld',

        snippet:
            value.slice(
                0,
                50,
            ),
    };
}


function createExtraction(
    field:
        string,

    value:
        string,
): FieldExtraction {

    return {

        field,

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
                value.slice(
                    0,
                    50,
                ),
        },
    };
}


function createExtractor(
    options: {

        id:
            string;

        supported?:
            boolean;

        discovered?:
            DiscoveredProperty[];

        warnings?:
            ExtractionWarning[];
    },
): {
    extractor:
        DeterministicExtractor;

    supports:
        ReturnType<typeof vi.fn>;

    extract:
        ReturnType<typeof vi.fn>;
} {

    const supports =
        vi.fn(
            () =>
                options.supported
                ?? true,
        );


    const extract =
        vi.fn(
            async () => ({

                discovered:
                    options.discovered
                    ?? [],

                warnings:
                    options.warnings
                    ?? [],
            }),
        );


    const extractor:
        DeterministicExtractor = {

        id:
            options.id,

        supports,

        extract,
    };


    return {
        extractor,
        supports,
        extract,
    };
}


describe(
    'ParserOrchestrator',
    () => {

        it(
            'runs every extractor that supports the input',
            async () => {

                const first =
                    createExtractor({
                        id:
                            'first',
                    });


                const second =
                    createExtractor({
                        id:
                            'second',
                    });


                const matcher:
                    FieldMatcher = {

                    match:
                        vi.fn(
                            () =>
                                [],
                        ),
                };


                const orchestrator =
                    new ParserOrchestrator(

                        [
                            first.extractor,
                            second.extractor,
                        ],

                        matcher,
                    );


                const input =
                    createInput();


                await orchestrator.parse(
                    input,
                );


                expect(
                    first.supports,
                ).toHaveBeenCalledOnce();


                expect(
                    first.extract,
                ).toHaveBeenCalledOnce();


                expect(
                    second.supports,
                ).toHaveBeenCalledOnce();


                expect(
                    second.extract,
                ).toHaveBeenCalledOnce();
            },
        );


        it(
            'skips unsupported extractors and aggregates discovered properties for FieldMatcher',
            async () => {

                const input =
                    createInput();


                const before =
                    structuredClone(
                        input,
                    );


                const title =
                    createDiscovered(
                        'title',
                        'Backend Developer',
                    );


                const company =
                    createDiscovered(
                        'name',
                        'Acme',
                        '$.hiringOrganization.name',
                    );


                const supported =
                    createExtractor({

                        id:
                            'supported',

                        discovered: [
                            title,
                            company,
                        ],
                    });


                const unsupported =
                    createExtractor({

                        id:
                            'unsupported',

                        supported:
                            false,

                        discovered: [
                            createDiscovered(
                                'ignored',
                                'Should not appear',
                            ),
                        ],
                    });


                const match =
                    vi.fn(
                        () =>
                            [],
                    );


                const matcher:
                    FieldMatcher = {
                    match,
                };


                const orchestrator =
                    new ParserOrchestrator(

                        [
                            supported.extractor,
                            unsupported.extractor,
                        ],

                        matcher,
                    );


                await orchestrator.parse(
                    input,
                );


                expect(
                    unsupported.extract,
                ).not.toHaveBeenCalled();


                expect(
                    match,
                ).toHaveBeenCalledWith(

                    input.job
                        .requestedFields,

                    [
                        title,
                        company,
                    ],
                );


                /**
                 * ParserOrchestrator itself must not
                 * mutate ParserInput.
                 */
                expect(
                    input,
                ).toEqual(
                    before,
                );
            },
        );


        it(
            'returns PARSED when every requested field has candidates',
            async () => {

                const extractor =
                    createExtractor({

                        id:
                            'json-ld',

                        discovered: [
                            createDiscovered(
                                'title',
                                'Backend Developer',
                            ),

                            createDiscovered(
                                'company',
                                'Acme',
                            ),
                        ],
                    });


                const matcher:
                    FieldMatcher = {

                    match:
                        vi.fn(
                            () => [

                                createExtraction(
                                    'jobTitle',
                                    'Backend Developer',
                                ),

                                createExtraction(
                                    'company',
                                    'Acme',
                                ),
                            ],
                        ),
                };


                const orchestrator =
                    new ParserOrchestrator(
                        [
                            extractor.extractor,
                        ],
                        matcher,
                    );


                const result =
                    await orchestrator.parse(
                        createInput([
                            createRequestedField(
                                'jobTitle',
                            ),
                            createRequestedField(
                                'company',
                            ),
                        ]),
                    );


                expect(
                    result.status,
                ).toBe(
                    'PARSED',
                );


                expect(
                    result.missingFields,
                ).toEqual(
                    [],
                );


                expect(
                    result.candidates
                        .jobTitle,
                ).toHaveLength(
                    1,
                );


                expect(
                    result.candidates
                        .company,
                ).toHaveLength(
                    1,
                );
            },
        );


        it(
            'returns PARTIAL and identifies missing requested fields',
            async () => {

                const extractor =
                    createExtractor({
                        id:
                            'json-ld',
                    });


                const matcher:
                    FieldMatcher = {

                    match:
                        vi.fn(
                            () => [

                                createExtraction(
                                    'jobTitle',
                                    'Backend Developer',
                                ),
                            ],
                        ),
                };


                const orchestrator =
                    new ParserOrchestrator(
                        [
                            extractor.extractor,
                        ],
                        matcher,
                    );


                const result =
                    await orchestrator.parse(
                        createInput([
                            createRequestedField(
                                'jobTitle',
                            ),
                            createRequestedField(
                                'company',
                            ),
                            createRequestedField(
                                'salary',
                            ),
                        ]),
                    );


                expect(
                    result.status,
                ).toBe(
                    'PARTIAL',
                );


                expect(
                    result.missingFields,
                ).toEqual([
                    'company',
                    'salary',
                ]);
            },
        );


        it(
            'returns NO_DATA when no requested fields receive candidates',
            async () => {

                const extractor =
                    createExtractor({
                        id:
                            'meta',
                    });


                const matcher:
                    FieldMatcher = {

                    match:
                        vi.fn(
                            () =>
                                [],
                        ),
                };


                const orchestrator =
                    new ParserOrchestrator(
                        [
                            extractor.extractor,
                        ],
                        matcher,
                    );


                const result =
                    await orchestrator.parse(
                        createInput([
                            createRequestedField(
                                'price',
                            ),
                            createRequestedField(
                                'rating',
                            ),
                        ]),
                    );


                expect(
                    result.status,
                ).toBe(
                    'NO_DATA',
                );


                expect(
                    result.candidates,
                ).toEqual(
                    {},
                );


                expect(
                    result.missingFields,
                ).toEqual([
                    'price',
                    'rating',
                ]);
            },
        );


        it(
            'aggregates warnings from multiple extractors',
            async () => {

                const first =
                    createExtractor({

                        id:
                            'json-ld',

                        warnings: [
                            {
                                extractorId:
                                    'json-ld',

                                code:
                                    'JSON_LD_PARSE_ERROR',

                                message:
                                    'Malformed JSON-LD',
                            },
                        ],
                    });


                const second =
                    createExtractor({

                        id:
                            'microdata',

                        warnings: [
                            {
                                extractorId:
                                    'microdata',

                                code:
                                    'MICRODATA_EMPTY_ITEMPROP',

                                message:
                                    'Empty itemprop',
                            },
                        ],
                    });


                const matcher:
                    FieldMatcher = {

                    match:
                        vi.fn(
                            () =>
                                [],
                        ),
                };


                const orchestrator =
                    new ParserOrchestrator(

                        [
                            first.extractor,
                            second.extractor,
                        ],

                        matcher,
                    );


                const result =
                    await orchestrator.parse(
                        createInput(),
                    );


                expect(
                    result.warnings,
                ).toEqual([
                    {
                        extractorId:
                            'json-ld',

                        code:
                            'JSON_LD_PARSE_ERROR',

                        message:
                            'Malformed JSON-LD',
                    },
                    {
                        extractorId:
                            'microdata',

                        code:
                            'MICRODATA_EMPTY_ITEMPROP',

                        message:
                            'Empty itemprop',
                    },
                ]);
            },
        );


        it(
            'defensively returns NO_DATA for an empty requested-field schema',
            async () => {

                const extractor =
                    createExtractor({

                        id:
                            'json-ld',

                        discovered: [
                            createDiscovered(
                                'title',
                                'Unrequested title',
                            ),
                        ],
                    });


                const match =
                    vi.fn(
                        () =>
                            [],
                    );


                const matcher:
                    FieldMatcher = {
                    match,
                };


                const orchestrator =
                    new ParserOrchestrator(
                        [
                            extractor.extractor,
                        ],
                        matcher,
                    );


                const result =
                    await orchestrator.parse(
                        createInput(
                            [],
                        ),
                    );


                expect(
                    match,
                ).toHaveBeenCalledWith(
                    [],
                    [
                        expect.objectContaining({
                            key:
                                'title',
                        }),
                    ],
                );


                expect(
                    result,
                ).toEqual({

                    jobId:
                        'parser-job-1',

                    status:
                        'NO_DATA',

                    candidates:
                        {},

                    missingFields:
                        [],

                    warnings:
                        [],
                });
            },
        );


        it(
            'returns NO_DATA when no extractor supports the input',
            async () => {

                const unsupported =
                    createExtractor({

                        id:
                            'unsupported',

                        supported:
                            false,
                    });


                const match =
                    vi.fn(
                        () =>
                            [],
                    );


                const matcher:
                    FieldMatcher = {
                    match,
                };


                const orchestrator =
                    new ParserOrchestrator(
                        [
                            unsupported.extractor,
                        ],
                        matcher,
                    );


                const input =
                    createInput([
                        createRequestedField(
                            'headline',
                        ),
                    ]);


                const result =
                    await orchestrator.parse(
                        input,
                    );


                expect(
                    unsupported.extract,
                ).not.toHaveBeenCalled();


                expect(
                    match,
                ).toHaveBeenCalledWith(
                    input.job
                        .requestedFields,
                    [],
                );


                expect(
                    result.status,
                ).toBe(
                    'NO_DATA',
                );


                expect(
                    result.missingFields,
                ).toEqual([
                    'headline',
                ]);
            },
        );
    },
);
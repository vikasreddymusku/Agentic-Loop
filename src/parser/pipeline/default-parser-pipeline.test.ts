import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import type {
    ExtractionResult,
} from '../../core/contracts/parser/extraction-result.js';

import type {
    FieldResolver,
} from '../../core/contracts/parser/field-resolver.js';

import type {
    NormalizedExtraction,
} from '../../core/contracts/parser/normalized-extraction.js';

import type {
    Normalizer,
} from '../../core/contracts/parser/normalizer.js';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';

import type {
    ResolvedExtraction,
} from '../../core/contracts/parser/resolved-extraction.js';

import type {
    ValidationResult,
} from '../../core/contracts/parser/validation-result.js';

import type {
    Validator,
} from '../../core/contracts/parser/validator.js';

import type {
    ParserOrchestrator,
} from '../orchestrator/parser-orchestrator.js';

import {
    DefaultParserPipeline,
} from './default-parser-pipeline.js';


type ParserOrchestratorPort =
    Pick<
        ParserOrchestrator,
        'parse'
    >;


function createInput(): ParserInput {

    const html =
        '<html></html>';


    return {

        job: {

            id:
                'pipeline-job-1',

            url:
                'https://example.com/product',

            requestedFields: [

                {
                    name:
                        'title',

                    type:
                        'string',

                    required:
                        true,
                },

                {
                    name:
                        'price',

                    type:
                        'number',
                },
            ],

            maxRetries:
                3,

            createdAt:
                '2026-08-20T00:00:00.000Z',
        },

        envelope: {

            requestedUrl:
                'https://example.com/product',

            finalUrl:
                'https://example.com/product',

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


function createExtractionResult():
    ExtractionResult {

    return {

        jobId:
            'pipeline-job-1',

        status:
            'PARSED',

        candidates:
            {},

        missingFields:
            [],

        warnings:
            [],
    };
}


function createResolvedExtraction():
    ResolvedExtraction {

    return {

        jobId:
            'pipeline-job-1',

        resolved:
            {},

        missingFields:
            [],

        warnings:
            [],
    };
}


function createNormalizedExtraction():
    NormalizedExtraction {

    return {

        jobId:
            'pipeline-job-1',

        normalized:
            {},

        missingFields:
            [],

        issues:
            [],

        warnings:
            [],
    };
}


function createValidationResult():
    ValidationResult {

    return {

        jobId:
            'pipeline-job-1',

        status:
            'VALID',

        validated:
            {},

        validFields:
            [],

        invalidFields:
            [],

        missingFields:
            [],

        issues:
            [],

        warnings:
            [],
    };
}


function createMocks() {

    const extraction =
        createExtractionResult();


    const resolved =
        createResolvedExtraction();


    const normalized =
        createNormalizedExtraction();


    const validation =
        createValidationResult();


    const parse =
        vi.fn(
            async () =>
                extraction,
        );


    const resolve =
        vi.fn(
            () =>
                resolved,
        );


    const normalize =
        vi.fn(
            () =>
                normalized,
        );


    const validate =
        vi.fn(
            () =>
                validation,
        );


    const parserOrchestrator:
        ParserOrchestratorPort = {
        parse,
    };


    const fieldResolver:
        FieldResolver = {
        resolve,
    };


    const normalizer:
        Normalizer = {
        normalize,
    };


    const validator:
        Validator = {
        validate,
    };


    return {

        extraction,
        resolved,
        normalized,
        validation,

        parse,
        resolve,
        normalize,
        validate,

        parserOrchestrator,
        fieldResolver,
        normalizer,
        validator,
    };
}


describe(
    'DefaultParserPipeline',
    () => {

        it(
            'runs all parser stages in the correct order',
            async () => {

                const order:
                    string[] = [];


                const mocks =
                    createMocks();


                mocks.parse.mockImplementation(
                    async () => {

                        order.push(
                            'parse',
                        );


                        return mocks.extraction;
                    },
                );


                mocks.resolve.mockImplementation(
                    () => {

                        order.push(
                            'resolve',
                        );


                        return mocks.resolved;
                    },
                );


                mocks.normalize.mockImplementation(
                    () => {

                        order.push(
                            'normalize',
                        );


                        return mocks.normalized;
                    },
                );


                mocks.validate.mockImplementation(
                    () => {

                        order.push(
                            'validate',
                        );


                        return mocks.validation;
                    },
                );


                const pipeline =
                    new DefaultParserPipeline(

                        mocks.parserOrchestrator,
                        mocks.fieldResolver,
                        mocks.normalizer,
                        mocks.validator,
                    );


                await pipeline.run(
                    createInput(),
                );


                expect(
                    order,
                ).toEqual([
                    'parse',
                    'resolve',
                    'normalize',
                    'validate',
                ]);
            },
        );


        it(
            'passes the original ParserInput to ParserOrchestrator',
            async () => {

                const mocks =
                    createMocks();


                const pipeline =
                    new DefaultParserPipeline(

                        mocks.parserOrchestrator,
                        mocks.fieldResolver,
                        mocks.normalizer,
                        mocks.validator,
                    );


                const input =
                    createInput();


                await pipeline.run(
                    input,
                );


                expect(
                    mocks.parse,
                ).toHaveBeenCalledOnce();


                expect(
                    mocks.parse,
                ).toHaveBeenCalledWith(
                    input,
                );
            },
        );


        it(
            'passes ExtractionResult directly to FieldResolver',
            async () => {

                const mocks =
                    createMocks();


                const pipeline =
                    new DefaultParserPipeline(

                        mocks.parserOrchestrator,
                        mocks.fieldResolver,
                        mocks.normalizer,
                        mocks.validator,
                    );


                await pipeline.run(
                    createInput(),
                );


                expect(
                    mocks.resolve,
                ).toHaveBeenCalledOnce();


                expect(
                    mocks.resolve,
                ).toHaveBeenCalledWith(
                    mocks.extraction,
                );
            },
        );


        it(
            'passes requested schema and resolved output to Normalizer and Validator',
            async () => {

                const mocks =
                    createMocks();


                const pipeline =
                    new DefaultParserPipeline(

                        mocks.parserOrchestrator,
                        mocks.fieldResolver,
                        mocks.normalizer,
                        mocks.validator,
                    );


                const input =
                    createInput();


                await pipeline.run(
                    input,
                );


                expect(
                    mocks.normalize,
                ).toHaveBeenCalledWith({

                    requestedFields:
                        input.job.requestedFields,

                    extraction:
                        mocks.resolved,
                });


                expect(
                    mocks.validate,
                ).toHaveBeenCalledWith({

                    requestedFields:
                        input.job.requestedFields,

                    extraction:
                        mocks.normalized,
                });
            },
        );


        it(
            'returns every deterministic parser stage in ParserPipelineResult',
            async () => {

                const mocks =
                    createMocks();


                const pipeline =
                    new DefaultParserPipeline(

                        mocks.parserOrchestrator,
                        mocks.fieldResolver,
                        mocks.normalizer,
                        mocks.validator,
                    );


                const result =
                    await pipeline.run(
                        createInput(),
                    );


                expect(
                    result,
                ).toEqual({

                    jobId:
                        'pipeline-job-1',

                    extraction:
                        mocks.extraction,

                    resolved:
                        mocks.resolved,

                    normalized:
                        mocks.normalized,

                    validation:
                        mocks.validation,
                });


                /**
                 * Pipeline composes stages.
                 *
                 * It does not rewrite their outputs.
                 */
                expect(
                    result.extraction,
                ).toBe(
                    mocks.extraction,
                );


                expect(
                    result.resolved,
                ).toBe(
                    mocks.resolved,
                );


                expect(
                    result.normalized,
                ).toBe(
                    mocks.normalized,
                );


                expect(
                    result.validation,
                ).toBe(
                    mocks.validation,
                );
            },
        );


        it(
            'propagates stage errors and does not run downstream components',
            async () => {

                const mocks =
                    createMocks();


                const failure =
                    new Error(
                        'Resolver failure',
                    );


                mocks.resolve.mockImplementation(
                    () => {

                        throw failure;
                    },
                );


                const pipeline =
                    new DefaultParserPipeline(

                        mocks.parserOrchestrator,
                        mocks.fieldResolver,
                        mocks.normalizer,
                        mocks.validator,
                    );


                await expect(
                    pipeline.run(
                        createInput(),
                    ),
                ).rejects.toBe(
                    failure,
                );


                expect(
                    mocks.parse,
                ).toHaveBeenCalledOnce();


                expect(
                    mocks.resolve,
                ).toHaveBeenCalledOnce();


                expect(
                    mocks.normalize,
                ).not.toHaveBeenCalled();


                expect(
                    mocks.validate,
                ).not.toHaveBeenCalled();
            },
        );
    },
);
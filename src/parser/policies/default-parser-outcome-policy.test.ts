import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    ParserPipelineResult,
} from '../../core/contracts/parser/parser-pipeline-result.js';

import type {
    ValidationStatus,
} from '../../core/contracts/parser/validation-result.js';

import {
    DefaultParserOutcomePolicy,
} from './default-parser-outcome-policy.js';


function createResult(
    status:
        ValidationStatus,
): ParserPipelineResult {

    return {

        jobId:
            'policy-job-1',

        extraction: {
            jobId:
                'policy-job-1',

            status:
                status === 'INVALID'
                    ? 'NO_DATA'
                    : 'PARSED',

            candidates:
                {},

            missingFields:
                [],

            warnings:
                [],
        },

        resolved: {
            jobId:
                'policy-job-1',

            resolved:
                {},

            missingFields:
                [],

            warnings:
                [],
        },

        normalized: {
            jobId:
                'policy-job-1',

            normalized:
                {},

            missingFields:
                [],

            issues:
                [],

            warnings:
                [],
        },

        validation: {
            jobId:
                'policy-job-1',

            status,

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
        },
    };
}


describe(
    'DefaultParserOutcomePolicy',
    () => {

        it(
            'maps VALID to COMPLETE with FULL quality',
            () => {

                const policy =
                    new DefaultParserOutcomePolicy();


                expect(
                    policy.decide(
                        createResult(
                            'VALID',
                        ),
                    ),
                ).toEqual({

                    outcome:
                        'COMPLETE',

                    quality:
                        'FULL',
                });
            },
        );


        it(
            'maps PARTIAL to COMPLETE with PARTIAL quality',
            () => {

                const policy =
                    new DefaultParserOutcomePolicy();


                expect(
                    policy.decide(
                        createResult(
                            'PARTIAL',
                        ),
                    ),
                ).toEqual({

                    outcome:
                        'COMPLETE',

                    quality:
                        'PARTIAL',
                });
            },
        );


        it(
            'maps INVALID to PARSER_FAILURE',
            () => {

                const policy =
                    new DefaultParserOutcomePolicy();


                expect(
                    policy.decide(
                        createResult(
                            'INVALID',
                        ),
                    ),
                ).toEqual({

                    outcome:
                        'PARSER_FAILURE',
                });
            },
        );
    },
);
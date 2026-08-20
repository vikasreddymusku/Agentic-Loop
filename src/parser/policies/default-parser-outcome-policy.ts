import type {
    ParserOutcomeDecision,
    ParserOutcomePolicy,
} from '../../core/contracts/parser/parser-outcome-policy.js';

import type {
    ParserPipelineResult,
} from '../../core/contracts/parser/parser-pipeline-result.js';


export class DefaultParserOutcomePolicy
implements ParserOutcomePolicy {

    decide(
        result:
            ParserPipelineResult,
    ): ParserOutcomeDecision {

        switch (
            result.validation.status
        ) {

            case 'VALID':

                return {
                    outcome:
                        'COMPLETE',

                    quality:
                        'FULL',
                };


            case 'PARTIAL':

                return {
                    outcome:
                        'COMPLETE',

                    quality:
                        'PARTIAL',
                };


            case 'INVALID':

                return {
                    outcome:
                        'PARSER_FAILURE',
                };
        }
    }
}
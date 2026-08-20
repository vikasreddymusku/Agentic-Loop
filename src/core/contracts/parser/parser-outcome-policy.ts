import type {
    ParserPipelineResult,
} from './parser-pipeline-result.js';


export type ParserResultQuality =
    | 'FULL'
    | 'PARTIAL';


export type ParserOutcomeDecision =
    | {
        outcome:
            'COMPLETE';

        quality:
            ParserResultQuality;
    }
    | {
        outcome:
            'PARSER_FAILURE';
    };


export interface ParserOutcomePolicy {

    decide(
        result:
            ParserPipelineResult,
    ): ParserOutcomeDecision;
}
import type {
    ParserInput,
} from './parser-input.js';

import type {
    ParserPipelineResult,
} from './parser-pipeline-result.js';


export interface ParserPipeline {

    run(
        input:
            ParserInput,
    ): Promise<ParserPipelineResult>;
}
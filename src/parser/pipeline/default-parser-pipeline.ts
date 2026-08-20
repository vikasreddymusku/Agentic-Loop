import type {
    FieldResolver,
} from '../../core/contracts/parser/field-resolver.js';

import type {
    Normalizer,
} from '../../core/contracts/parser/normalizer.js';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';

import type {
    ParserPipeline,
} from '../../core/contracts/parser/parser-pipeline.js';

import type {
    ParserPipelineResult,
} from '../../core/contracts/parser/parser-pipeline-result.js';

import type {
    Validator,
} from '../../core/contracts/parser/validator.js';

import type {
    ParserOrchestrator,
} from '../orchestrator/parser-orchestrator.js';


/**
 * Depend only on ParserOrchestrator's parse contract.
 *
 * This keeps DefaultParserPipeline easy to test
 * without requiring a concrete orchestrator instance.
 */
type ParserOrchestratorPort =
    Pick<
        ParserOrchestrator,
        'parse'
    >;


/**
 * Composes the deterministic parser stages.
 *
 * This class contains no extraction, resolution,
 * normalization, or validation rules of its own.
 */
export class DefaultParserPipeline
implements ParserPipeline {

    constructor(
        private readonly parserOrchestrator:
            ParserOrchestratorPort,

        private readonly fieldResolver:
            FieldResolver,

        private readonly normalizer:
            Normalizer,

        private readonly validator:
            Validator,
    ) {}


    async run(
        input:
            ParserInput,
    ): Promise<ParserPipelineResult> {

        /**
         * Stage 1:
         *
         * Extract raw structured properties,
         * match them to requested fields,
         * and build ExtractionResult.
         */
        const extraction =
            await this.parserOrchestrator.parse(
                input,
            );


        /**
         * Stage 2:
         *
         * Select one deterministic winning
         * candidate per matched field.
         */
        const resolved =
            this.fieldResolver.resolve(
                extraction,
            );


        /**
         * Stage 3:
         *
         * Normalize resolved values according
         * to the user's requested schema.
         */
        const normalized =
            this.normalizer.normalize({

                requestedFields:
                    input.job.requestedFields,

                extraction:
                    resolved,
            });


        /**
         * Stage 4:
         *
         * Validate required fields,
         * normalization failures and runtime
         * type correctness.
         */
        const validation =
            this.validator.validate({

                requestedFields:
                    input.job.requestedFields,

                extraction:
                    normalized,
            });


        /**
         * Preserve every deterministic stage.
         *
         * This diagnostic trail will later be
         * important for:
         *
         * - monitoring
         * - failure classification
         * - self-healing
         * - debugging
         */
        return {

            jobId:
                input.job.id,

            extraction,

            resolved,

            normalized,

            validation,
        };
    }
}
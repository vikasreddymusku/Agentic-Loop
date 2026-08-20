import type {
    ExtractionSource,
} from '../../core/contracts/parser/extraction-source.js';

import type {
    FieldExtraction,
} from '../../core/contracts/parser/field-extraction.js';

import type {
    FieldResolver,
} from '../../core/contracts/parser/field-resolver.js';

import type {
    ExtractionResult,
} from '../../core/contracts/parser/extraction-result.js';

import type {
    ResolvedExtraction,
    ResolvedField,
} from '../../core/contracts/parser/resolved-extraction.js';


/**
 * Source priority is ONLY used when candidate
 * confidence values are equal.
 *
 * Confidence always remains the primary signal.
 */
const SOURCE_PRIORITY:
    Readonly<Record<ExtractionSource, number>> = {

        JSON_LD:
            3,

        MICRODATA:
            2,

        META:
            1,

        DOM:
            0,
    };


export class DefaultFieldResolver
implements FieldResolver {

    resolve(
        result:
            ExtractionResult,
    ): ResolvedExtraction {

        const resolved:
            Record<
                string,
                ResolvedField
            > = {};


        for (
            const [
                fieldName,
                candidates,
            ]
            of Object.entries(
                result.candidates,
            )
        ) {

            const winner =
                this.selectBestCandidate(
                    candidates,
                );


            if (
                winner === null
            ) {

                continue;
            }


            resolved[
                fieldName
            ] = {

                field:
                    winner.field,

                value:
                    winner.value,

                confidence:
                    winner.confidence,

                /**
                 * Copy the evidence object so the
                 * resolved representation does not
                 * accidentally share mutable state
                 * with ExtractionResult.
                 */
                evidence: {
                    ...winner.evidence,
                },
            };
        }


        return {

            jobId:
                result.jobId,

            resolved,

            /**
             * FieldResolver does not recalculate
             * missing fields.
             *
             * ParserOrchestrator already determined
             * this from the requested schema.
             */
            missingFields: [
                ...result.missingFields,
            ],

            /**
             * Preserve parser/extractor diagnostics
             * for downstream normalization and
             * validation.
             */
            warnings: [
                ...result.warnings,
            ],
        };
    }


    private selectBestCandidate(
        candidates:
            FieldExtraction[],
    ): FieldExtraction | null {

        if (
            candidates.length === 0
        ) {

            return null;
        }


        let winner =
            candidates[0]!;


        for (
            let index = 1;
            index < candidates.length;
            index += 1
        ) {

            const candidate =
                candidates[index]!;


            if (
                this.isBetterCandidate(
                    candidate,
                    winner,
                )
            ) {

                winner =
                    candidate;
            }
        }


        return winner;
    }


    private isBetterCandidate(
        candidate:
            FieldExtraction,

        currentWinner:
            FieldExtraction,
    ): boolean {

        /**
         * Rule 1:
         *
         * Confidence is always authoritative.
         */
        if (
            candidate.confidence
            > currentWinner.confidence
        ) {

            return true;
        }


        if (
            candidate.confidence
            < currentWinner.confidence
        ) {

            return false;
        }


        /**
         * Rule 2:
         *
         * Confidence tie → structured-data source
         * priority.
         */
        const candidatePriority =
            SOURCE_PRIORITY[
                candidate.evidence.source
            ];


        const winnerPriority =
            SOURCE_PRIORITY[
                currentWinner.evidence.source
            ];


        if (
            candidatePriority
            > winnerPriority
        ) {

            return true;
        }


        /**
         * Rule 3:
         *
         * Same confidence + same priority:
         *
         * preserve the first candidate.
         *
         * This makes resolution stable and
         * deterministic.
         */
        return false;
    }
}
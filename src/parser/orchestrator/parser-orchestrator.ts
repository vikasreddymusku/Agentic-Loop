import type {
    DiscoveredProperty,
} from '../../core/contracts/parser/discovered-property.js';

import type {
    ExtractionResult,
    ExtractionWarning,
    ParserStatus,
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


export class ParserOrchestrator {

    private readonly extractors:
        readonly DeterministicExtractor[];


    private readonly fieldMatcher:
        FieldMatcher;


    constructor(
        extractors:
            readonly DeterministicExtractor[],

        fieldMatcher:
            FieldMatcher,
    ) {

        /**
         * Copy the registry so external mutation of the
         * supplied array cannot change the orchestrator
         * after construction.
         */
        this.extractors = [
            ...extractors,
        ];


        this.fieldMatcher =
            fieldMatcher;
    }


    async parse(
        input:
            ParserInput,
    ): Promise<ExtractionResult> {

        const discovered:
            DiscoveredProperty[] = [];


        const warnings:
            ExtractionWarning[] = [];


        /**
         * Run deterministic extractors sequentially.
         *
         * Sequential execution keeps result/warning
         * ordering deterministic.
         *
         * Parallel execution can be considered later
         * only if profiling shows a real benefit.
         */
        for (
            const extractor
            of this.extractors
        ) {

            if (
                !extractor.supports(
                    input,
                )
            ) {

                continue;
            }


            const output =
                await extractor.extract(
                    input,
                );


            discovered.push(
                ...output.discovered,
            );


            warnings.push(
                ...output.warnings,
            );
        }


        /**
         * Extractors only discover raw properties.
         *
         * FieldMatcher is the single component
         * responsible for mapping those properties to
         * user-requested fields.
         */
        const fieldExtractions =
            this.fieldMatcher.match(
                input.job.requestedFields,
                discovered,
            );


        const candidates =
            this.groupCandidates(
                fieldExtractions,
            );


        const requestedFieldNames =
            input.job.requestedFields
                .map(
                    field =>
                        field.name,
                );


        const missingFields =
            requestedFieldNames
                .filter(
                    fieldName => {

                        const fieldCandidates =
                            candidates[
                                fieldName
                            ];


                        return (
                            fieldCandidates
                            === undefined
                            || fieldCandidates.length
                            === 0
                        );
                    },
                );


        const status =
            this.determineStatus(
                requestedFieldNames,
                missingFields,
            );


        return {

            jobId:
                input.job.id,

            status,

            candidates,

            missingFields,

            warnings,
        };
    }


    private groupCandidates(
        fieldExtractions:
            FieldExtraction[],
    ): Record<
        string,
        FieldExtraction[]
    > {

        const candidates:
            Record<
                string,
                FieldExtraction[]
            > = {};


        for (
            const extraction
            of fieldExtractions
        ) {

            const existing =
                candidates[
                    extraction.field
                ];


            if (
                existing === undefined
            ) {

                candidates[
                    extraction.field
                ] = [
                    extraction,
                ];


                continue;
            }


            existing.push(
                extraction,
            );
        }


        return candidates;
    }


    private determineStatus(
        requestedFieldNames:
            string[],

        missingFields:
            string[],
    ): ParserStatus {

        /**
         * This should normally be prevented by
         * RequestManager runtime validation.
         *
         * Keep defensive behavior here so Parser
         * Orchestrator remains safe when used directly.
         */
        if (
            requestedFieldNames.length === 0
        ) {

            return 'NO_DATA';
        }


        if (
            missingFields.length === 0
        ) {

            return 'PARSED';
        }


        if (
            missingFields.length
            === requestedFieldNames.length
        ) {

            return 'NO_DATA';
        }


        return 'PARTIAL';
    }
}
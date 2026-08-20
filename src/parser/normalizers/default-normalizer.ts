import type {
    ExtractionValue,
} from '../../core/contracts/parser/extraction-value.js';

import type {
    NormalizedExtraction,
    NormalizationIssueCode,
} from '../../core/contracts/parser/normalized-extraction.js';

import type {
    Normalizer,
    NormalizerInput,
} from '../../core/contracts/parser/normalizer.js';

import type {
    RequestedFieldType,
} from '../../core/contracts/scrape-job.js';


const STRICT_NUMBER_PATTERN =
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;


type NormalizationSuccess = {

    success:
        true;

    value:
        ExtractionValue;
};


type NormalizationFailure = {

    success:
        false;

    code:
        NormalizationIssueCode;
};


type NormalizationAttempt =
    | NormalizationSuccess
    | NormalizationFailure;


export class DefaultNormalizer
implements Normalizer {

    normalize(
        input:
            NormalizerInput,
    ): NormalizedExtraction {

        const normalized:
            NormalizedExtraction['normalized'] = {};


        const issues:
            NormalizedExtraction['issues'] = [];


        /**
         * RequestedField[] is authoritative.
         *
         * Do not iterate arbitrary keys in
         * extraction.resolved because an unexpected
         * upstream field must not enter normalized
         * output.
         */
        for (
            const requestedField
            of input.requestedFields
        ) {

            const resolvedField =
                input.extraction.resolved[
                    requestedField.name
                ];


            if (
                resolvedField === undefined
            ) {

                /**
                 * Missing fields were already
                 * determined upstream.
                 *
                 * Normalizer does not recalculate them.
                 */
                continue;
            }


            const attempt =
                this.normalizeValue(
                    resolvedField.value,
                    requestedField.type,
                );


            if (
                !attempt.success
            ) {

                issues.push({

                    field:
                        requestedField.name,

                    code:
                        attempt.code,

                    message:
                        this.createIssueMessage(
                            requestedField.name,
                            requestedField.type,
                            attempt.code,
                        ),

                    originalValue:
                        this.copyValue(
                            resolvedField.value,
                        ),

                    expectedType:
                        requestedField.type,
                });


                continue;
            }


            normalized[
                requestedField.name
            ] = {

                field:
                    requestedField.name,

                type:
                    requestedField.type,

                originalValue:
                    this.copyValue(
                        resolvedField.value,
                    ),

                value:
                    this.copyValue(
                        attempt.value,
                    ),

                confidence:
                    resolvedField.confidence,

                evidence: {
                    ...resolvedField.evidence,
                },
            };
        }


        return {

            jobId:
                input.extraction.jobId,

            normalized,

            /**
             * Preserve upstream missing-field
             * classification.
             */
            missingFields: [
                ...input.extraction.missingFields,
            ],

            issues,

            /**
             * Preserve extractor/parser diagnostics.
             */
            warnings: [
                ...input.extraction.warnings,
            ],
        };
    }


    private normalizeValue(
        value:
            ExtractionValue,

        targetType:
            RequestedFieldType,
    ): NormalizationAttempt {

        switch (
            targetType
        ) {

            case 'string':

                return this.normalizeString(
                    value,
                );


            case 'number':

                return this.normalizeNumber(
                    value,
                );


            case 'boolean':

                return this.normalizeBoolean(
                    value,
                );


            case 'array':

                return this.normalizeArray(
                    value,
                );
        }
    }


    private normalizeString(
        value:
            ExtractionValue,
    ): NormalizationAttempt {

        /**
         * Existing strings are preserved exactly.
         *
         * No trim.
         * No whitespace normalization.
         */
        if (
            typeof value === 'string'
        ) {

            return {

                success:
                    true,

                value,
            };
        }


        if (
            typeof value === 'number'
            || typeof value === 'boolean'
        ) {

            return {

                success:
                    true,

                value:
                    String(
                        value,
                    ),
            };
        }


        /**
         * Arrays and null are not safely convertible
         * to the semantic string requested by the
         * user.
         */
        return {

            success:
                false,

            code:
                'UNSUPPORTED_VALUE',
        };
    }


    private normalizeNumber(
        value:
            ExtractionValue,
    ): NormalizationAttempt {

        /**
         * Existing numbers are valid only when finite.
         */
        if (
            typeof value === 'number'
        ) {

            if (
                Number.isFinite(
                    value,
                )
            ) {

                return {

                    success:
                        true,

                    value,
                };
            }


            return {

                success:
                    false,

                code:
                    'UNSUPPORTED_VALUE',
            };
        }


        /**
         * Strings are a supported conversion source,
         * but they must match our intentionally strict
         * numeric grammar.
         */
        if (
            typeof value === 'string'
        ) {

            const candidate =
                value.trim();


            if (
                !STRICT_NUMBER_PATTERN.test(
                    candidate,
                )
            ) {

                return {

                    success:
                        false,

                    code:
                        'TYPE_CONVERSION_FAILED',
                };
            }


            const parsed =
                Number(
                    candidate,
                );


            /**
             * Protect against inputs such as 1e9999,
             * which match the grammar but overflow to
             * Infinity.
             */
            if (
                !Number.isFinite(
                    parsed,
                )
            ) {

                return {

                    success:
                        false,

                    code:
                        'TYPE_CONVERSION_FAILED',
                };
            }


            return {

                success:
                    true,

                value:
                    parsed,
            };
        }


        /**
         * boolean / string[] / null
         */
        return {

            success:
                false,

            code:
                'UNSUPPORTED_VALUE',
        };
    }


    private normalizeBoolean(
        value:
            ExtractionValue,
    ): NormalizationAttempt {

        if (
            typeof value === 'boolean'
        ) {

            return {

                success:
                    true,

                value,
            };
        }


        if (
            typeof value === 'string'
        ) {

            const candidate =
                value
                    .trim()
                    .toLowerCase();


            if (
                candidate === 'true'
            ) {

                return {

                    success:
                        true,

                    value:
                        true,
                };
            }


            if (
                candidate === 'false'
            ) {

                return {

                    success:
                        true,

                    value:
                        false,
                };
            }


            return {

                success:
                    false,

                code:
                    'TYPE_CONVERSION_FAILED',
            };
        }


        /**
         * number / string[] / null
         */
        return {

            success:
                false,

            code:
                'UNSUPPORTED_VALUE',
        };
    }


    private normalizeArray(
        value:
            ExtractionValue,
    ): NormalizationAttempt {

        if (
            !Array.isArray(
                value,
            )
        ) {

            return {

                success:
                    false,

                code:
                    'UNSUPPORTED_VALUE',
            };
        }


        /**
         * ExtractionValue currently defines arrays as
         * string[].
         *
         * Keep a runtime guard anyway so malformed
         * external data cannot silently pass.
         */
        if (
            !value.every(
                item =>
                    typeof item
                    === 'string',
            )
        ) {

            return {

                success:
                    false,

                code:
                    'UNSUPPORTED_VALUE',
            };
        }


        return {

            success:
                true,

            /**
             * Defensive copy.
             */
            value: [
                ...value,
            ],
        };
    }


    private copyValue(
        value:
            ExtractionValue,
    ): ExtractionValue {

        return Array.isArray(
            value,
        )
            ? [
                ...value,
            ]
            : value;
    }


    private createIssueMessage(
        field:
            string,

        expectedType:
            RequestedFieldType,

        code:
            NormalizationIssueCode,
    ): string {

        if (
            code
            === 'TYPE_CONVERSION_FAILED'
        ) {

            return (
                `Could not normalize field `
                + `"${field}" to ${expectedType}.`
            );
        }


        return (
            `Value for field "${field}" `
            + `is unsupported for ${expectedType}.`
        );
    }
}
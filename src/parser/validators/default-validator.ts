import type {
    ExtractionValue,
} from '../../core/contracts/parser/extraction-value.js';

import type {
    NormalizationIssue,
    NormalizedField,
} from '../../core/contracts/parser/normalized-extraction.js';

import type {
    RequestedField,
    RequestedFieldType,
} from '../../core/contracts/scrape-job.js';

import type {
    ValidationIssue,
    ValidationResult,
    ValidationStatus,
} from '../../core/contracts/parser/validation-result.js';

import type {
    Validator,
    ValidatorInput,
} from '../../core/contracts/parser/validator.js';


export class DefaultValidator
implements Validator {

    validate(
        input:
            ValidatorInput,
    ): ValidationResult {

        const validated:
            ValidationResult['validated'] = {};


        const validFields:
            string[] = [];


        const invalidFields =
            new Set<string>();


        const issues:
            ValidationIssue[] = [];


        /**
         * Index normalization issues once.
         *
         * Normalizer v1 normally emits at most one
         * issue per field, but the contract allows
         * multiple diagnostic issues.
         */
        const normalizationIssuesByField =
            this.groupNormalizationIssues(
                input.extraction.issues,
            );


        const missingFieldSet =
            new Set(
                input.extraction.missingFields,
            );


        for (
            const requestedField
            of input.requestedFields
        ) {

            const fieldName =
                requestedField.name;


            const normalizationIssues =
                normalizationIssuesByField.get(
                    fieldName,
                );


            /**
             * Rule 1:
             *
             * A normalization failure means the field
             * is invalid even if malformed upstream
             * state also contains a normalized value.
             */
            if (
                normalizationIssues !== undefined
                && normalizationIssues.length > 0
            ) {

                invalidFields.add(
                    fieldName,
                );


                for (
                    const normalizationIssue
                    of normalizationIssues
                ) {

                    issues.push(
                        this.createNormalizationValidationIssue(
                            requestedField,
                            normalizationIssue,
                        ),
                    );
                }


                continue;
            }


            const normalizedField =
                input.extraction.normalized[
                    fieldName
                ];


            /**
             * Rule 2:
             *
             * No normalized value.
             *
             * Required fields generate a validation
             * issue.
             *
             * Optional missing fields simply make the
             * overall result PARTIAL when other fields
             * are valid.
             */
            if (
                normalizedField === undefined
            ) {

                if (
                    requestedField.required
                    === true
                ) {

                    invalidFields.add(
                        fieldName,
                    );


                    issues.push({

                        field:
                            fieldName,

                        code:
                            'MISSING_REQUIRED_FIELD',

                        message:
                            `Required field "${fieldName}" is missing.`,

                        expectedType:
                            requestedField.type,
                    });
                }


                continue;
            }


            /**
             * Rule 3:
             *
             * Validate both:
             *
             * - NormalizedField.type metadata
             * - actual runtime value type
             *
             * Normalizer should guarantee both, but
             * Validator protects the boundary.
             */
            if (
                !this.matchesRequestedType(
                    normalizedField,
                    requestedField.type,
                )
            ) {

                invalidFields.add(
                    fieldName,
                );


                issues.push({

                    field:
                        fieldName,

                    code:
                        'TYPE_MISMATCH',

                    message:
                        `Field "${fieldName}" does not match `
                        + `requested type ${requestedField.type}.`,

                    expectedType:
                        requestedField.type,

                    actualValue:
                        this.copyValue(
                            normalizedField.value,
                        ),
                });


                continue;
            }


            validated[
                fieldName
            ] =
                this.copyNormalizedField(
                    normalizedField,
                );


            validFields.push(
                fieldName,
            );
        }


        const status =
            this.determineStatus(
                input.requestedFields,
                validFields,
                invalidFields,
                missingFieldSet,
            );


        return {

            jobId:
                input.extraction.jobId,

            status,

            validated,

            validFields: [
                ...validFields,
            ],

            invalidFields: [
                ...invalidFields,
            ],

            /**
             * Preserve the upstream meaning of
             * missingFields:
             *
             * extraction/matching found no candidate.
             *
             * Validator does not reinterpret
             * normalization failures as missing.
             */
            missingFields: [
                ...input.extraction.missingFields,
            ],

            issues,

            warnings: [
                ...input.extraction.warnings,
            ],
        };
    }


    private groupNormalizationIssues(
        issues:
            readonly NormalizationIssue[],
    ): Map<
        string,
        NormalizationIssue[]
    > {

        const result =
            new Map<
                string,
                NormalizationIssue[]
            >();


        for (
            const issue
            of issues
        ) {

            const existing =
                result.get(
                    issue.field,
                );


            if (
                existing === undefined
            ) {

                result.set(
                    issue.field,
                    [
                        issue,
                    ],
                );


                continue;
            }


            existing.push(
                issue,
            );
        }


        return result;
    }


    private createNormalizationValidationIssue(
        requestedField:
            RequestedField,

        issue:
            NormalizationIssue,
    ): ValidationIssue {

        return {

            field:
                requestedField.name,

            code:
                'NORMALIZATION_FAILED',

            message:
                `Normalization failed for field `
                + `"${requestedField.name}".`,

            expectedType:
                requestedField.type,

            actualValue:
                this.copyValue(
                    issue.originalValue,
                ),

            normalizationIssueCode:
                issue.code,
        };
    }


    private matchesRequestedType(
        field:
            NormalizedField,

        requestedType:
            RequestedFieldType,
    ): boolean {

        /**
         * The declared normalized type itself must
         * agree with the requested schema.
         */
        if (
            field.type
            !== requestedType
        ) {

            return false;
        }


        return this.valueMatchesType(
            field.value,
            requestedType,
        );
    }


    private valueMatchesType(
        value:
            ExtractionValue,

        requestedType:
            RequestedFieldType,
    ): boolean {

        switch (
            requestedType
        ) {

            case 'string':

                return (
                    typeof value
                    === 'string'
                );


            case 'number':

                return (
                    typeof value
                    === 'number'
                    && Number.isFinite(
                        value,
                    )
                );


            case 'boolean':

                return (
                    typeof value
                    === 'boolean'
                );


            case 'array':

                return (
                    Array.isArray(
                        value,
                    )
                    && value.every(
                        item =>
                            typeof item
                            === 'string',
                    )
                );
        }
    }


    private determineStatus(
        requestedFields:
            readonly RequestedField[],

        validFields:
            readonly string[],

        invalidFields:
            ReadonlySet<string>,

        missingFields:
            ReadonlySet<string>,
    ): ValidationStatus {

        /**
         * Empty requested schemas should already be
         * rejected by RequestManager.
         *
         * Defensive behavior:
         * an empty schema cannot constitute a valid
         * scrape.
         */
        if (
            requestedFields.length === 0
        ) {

            return 'INVALID';
        }


        const validFieldSet =
            new Set(
                validFields,
            );


        /**
         * Any required field that did not validate
         * makes the entire extraction INVALID.
         */
        const requiredFieldFailed =
            requestedFields.some(
                field =>
                    field.required === true
                    && !validFieldSet.has(
                        field.name,
                    ),
            );


        if (
            requiredFieldFailed
        ) {

            return 'INVALID';
        }


        /**
         * No requested field successfully validated.
         */
        if (
            validFields.length === 0
        ) {

            return 'INVALID';
        }


        /**
         * Every requested field validated.
         */
        if (
            validFields.length
            === requestedFields.length
        ) {

            return 'VALID';
        }


        /**
         * Required fields are valid, but one or more
         * optional fields are:
         *
         * - missing
         * - invalid
         * - normalization failures
         */
        return 'PARTIAL';
    }


    private copyNormalizedField(
        field:
            NormalizedField,
    ): NormalizedField {

        return {

            field:
                field.field,

            type:
                field.type,

            originalValue:
                this.copyValue(
                    field.originalValue,
                ),

            value:
                this.copyValue(
                    field.value,
                ),

            confidence:
                field.confidence,

            evidence: {
                ...field.evidence,
            },
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
}
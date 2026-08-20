import type {
    RequestedField,
} from '../../core/contracts/scrape-job.js';

import type {
    DiscoveredProperty,
} from '../../core/contracts/parser/discovered-property.js';

import type {
    FieldExtraction,
} from '../../core/contracts/parser/field-extraction.js';

import type {
    FieldMatcher,
} from '../../core/contracts/parser/field-matcher.js';


const MATCH_CONFIDENCE = {

    PATH:
        1.00,

    EXACT_NAME:
        0.98,

    EXACT_ALIAS:
        0.95,

    NORMALIZED:
        0.90,

    SYNONYM:
        0.85,

} as const;


/**
 * Intentionally small and conservative.
 *
 * This is NOT intended to understand arbitrary
 * semantic relationships.
 *
 * User-provided aliases and paths should remain the
 * preferred mechanism for domain-specific meaning.
 */
const CONSERVATIVE_SYNONYMS:
    Readonly<Record<string, readonly string[]>> = {

        title: [
            'headline',
        ],

        headline: [
            'title',
        ],

        url: [
            'link',
        ],

        link: [
            'url',
        ],

        description: [
            'summary',
        ],

        summary: [
            'description',
        ],
    };


export class DefaultFieldMatcher
implements FieldMatcher {

    match(
        requestedFields:
            RequestedField[],

        discovered:
            DiscoveredProperty[],
    ): FieldExtraction[] {

        if (
            requestedFields.length === 0
            || discovered.length === 0
        ) {

            return [];
        }


        const result:
            FieldExtraction[] = [];


        /**
         * One requested field may legitimately match
         * multiple discovered properties.
         *
         * We preserve all candidates here.
         *
         * FieldResolver will decide which candidate is
         * best later.
         */
        for (
            const requestedField
            of requestedFields
        ) {

            for (
                const property
                of discovered
            ) {

                const confidence =
                    this.getMatchConfidence(
                        requestedField,
                        property,
                    );


                if (
                    confidence === null
                ) {

                    continue;
                }


                result.push(
                    this.createFieldExtraction(
                        requestedField,
                        property,
                        confidence,
                    ),
                );
            }
        }


        return result;
    }


    /**
     * Determine the BEST matching rule between one
     * requested field and one discovered property.
     *
     * This prevents the same pair being emitted more
     * than once when it matches multiple rules.
     *
     * Example:
     *
     * field.name = "price"
     * field.paths = ["$.offers.price"]
     *
     * discovered.key = "price"
     * discovered.path = "$.offers.price"
     *
     * Both PATH and EXACT_NAME match.
     *
     * We emit ONE candidate at confidence 1.0.
     */
    private getMatchConfidence(
        requestedField:
            RequestedField,

        property:
            DiscoveredProperty,
    ): number | null {

        /**
         * 1. Explicit path
         */
        if (
            this.matchesExplicitPath(
                requestedField,
                property,
            )
        ) {

            return MATCH_CONFIDENCE
                .PATH;
        }


        /**
         * 2. Exact requested field name.
         *
         * Exact means the original strings are equal.
         */
        if (
            property.key
            === requestedField.name
        ) {

            return MATCH_CONFIDENCE
                .EXACT_NAME;
        }


        /**
         * 3. Exact alias.
         *
         * Alias comparison is intentionally
         * case-insensitive and whitespace-insensitive.
         */
        if (
            this.matchesAlias(
                requestedField,
                property.key,
            )
        ) {

            return MATCH_CONFIDENCE
                .EXACT_ALIAS;
        }


        /**
         * 4. Normalized identifier comparison.
         *
         * Examples:
         *
         * jobTitle
         * jobtitle
         * job_title
         * job-title
         *
         * all normalize to:
         *
         * jobtitle
         */
        if (
            this.matchesNormalized(
                requestedField,
                property.key,
            )
        ) {

            return MATCH_CONFIDENCE
                .NORMALIZED;
        }


        /**
         * 5. Small deterministic synonym table.
         *
         * No fuzzy similarity and no AI.
         */
        if (
            this.matchesConservativeSynonym(
                requestedField,
                property.key,
            )
        ) {

            return MATCH_CONFIDENCE
                .SYNONYM;
        }


        return null;
    }


    private matchesExplicitPath(
        requestedField:
            RequestedField,

        property:
            DiscoveredProperty,
    ): boolean {

        if (
            requestedField.paths === undefined
            || requestedField.paths.length === 0
        ) {

            return false;
        }


        const discoveredPath =
            this.normalizePath(
                property.path,
            );


        return requestedField.paths
            .some(
                requestedPath =>
                    this.normalizePath(
                        requestedPath,
                    )
                    === discoveredPath,
            );
    }


    private matchesAlias(
        requestedField:
            RequestedField,

        propertyKey:
            string,
    ): boolean {

        if (
            requestedField.aliases === undefined
            || requestedField.aliases.length === 0
        ) {

            return false;
        }


        const key =
            this.normalizeSimple(
                propertyKey,
            );


        return requestedField.aliases
            .some(
                alias =>
                    this.normalizeSimple(
                        alias,
                    )
                    === key,
            );
    }


    private matchesNormalized(
        requestedField:
            RequestedField,

        propertyKey:
            string,
    ): boolean {

        const normalizedKey =
            this.normalizeIdentifier(
                propertyKey,
            );


        if (
            normalizedKey.length === 0
        ) {

            return false;
        }


        if (
            this.normalizeIdentifier(
                requestedField.name,
            )
            === normalizedKey
        ) {

            return true;
        }


        return requestedField.aliases
            ?.some(
                alias =>
                    this.normalizeIdentifier(
                        alias,
                    )
                    === normalizedKey,
            )
            ?? false;
    }


    private matchesConservativeSynonym(
        requestedField:
            RequestedField,

        propertyKey:
            string,
    ): boolean {

        const requested =
            this.normalizeIdentifier(
                requestedField.name,
            );


        const discovered =
            this.normalizeIdentifier(
                propertyKey,
            );


        const synonyms =
            CONSERVATIVE_SYNONYMS[
                requested
            ];


        if (
            synonyms === undefined
        ) {

            return false;
        }


        return synonyms.some(
            synonym =>
                this.normalizeIdentifier(
                    synonym,
                )
                === discovered,
        );
    }


    /**
     * Preserve extraction evidence exactly as it was
     * discovered.
     *
     * Matching changes only:
     *
     * - requested output field
     * - confidence
     *
     * It does not rewrite source provenance.
     */
    private createFieldExtraction(
        requestedField:
            RequestedField,

        property:
            DiscoveredProperty,

        confidence:
            number,
    ): FieldExtraction {

        return {

            field:
                requestedField.name,

            value:
                property.value,

            confidence,

            evidence: {

                extractorId:
                    property.extractorId,

                source:
                    property.source,

                vocabulary:
                    property.vocabulary,

                location:
                    property.path,

                snippet:
                    property.snippet,
            },
        };
    }


    /**
     * Used by alias matching.
     *
     * Only:
     *
     * - trim
     * - lowercase
     */
    private normalizeSimple(
        value:
            string,
    ): string {

        return value
            .trim()
            .toLowerCase();
    }


    /**
     * Identifier normalization.
     *
     * This intentionally removes separators so common
     * formatting differences do not block matching.
     *
     * Examples:
     *
     * jobTitle
     * job_title
     * job-title
     * Job Title
     *
     * become:
     *
     * jobtitle
     */
    private normalizeIdentifier(
        value:
            string,
    ): string {

        return value
            .trim()
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                '',
            );
    }


    /**
     * Explicit paths are high-confidence hints.
     *
     * Support both:
     *
     * $.offers.price
     *
     * and
     *
     * offers.price
     *
     * because RequestedField paths were designed to
     * allow either representation.
     *
     * CSS/Microdata paths remain otherwise unchanged.
     */
    private normalizePath(
        value:
            string,
    ): string {

        const normalized =
            value.trim();


        if (
            normalized.startsWith(
                '$.',
            )
        ) {

            return normalized.slice(
                2,
            );
        }


        return normalized;
    }
}
import {
    load,
} from 'cheerio';

import type {
    AnyNode,
} from 'domhandler';

import type {
    DiscoveredProperty,
} from '../../core/contracts/parser/discovered-property.js';

import type {
    DeterministicExtractor,
    ExtractorOutput,
} from '../../core/contracts/parser/extractor.js';

import type {
    ExtractionVocabulary,
} from '../../core/contracts/parser/extraction-source.js';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';


const MAX_SNIPPET_LENGTH =
    50;


type CheerioApi =
    ReturnType<typeof load>;


export class MicrodataExtractor
implements DeterministicExtractor {

    readonly id =
        'microdata';


    supports(
        input:
            ParserInput,
    ): boolean {

        const body =
            input.envelope.rawBody;


        if (
            body === null
        ) {

            return false;
        }


        const bodyBytes =
            Buffer.isBuffer(
                body,
            )
                ? body.length
                : Buffer.byteLength(
                    body,
                    'utf8',
                );


        if (
            bodyBytes === 0
        ) {

            return false;
        }


        const contentType =
            this.getHeader(
                input,
                'content-type',
            );


        /**
         * Missing Content-Type is tolerated because
         * many real websites return incomplete headers.
         */
        if (
            contentType === undefined
        ) {

            return true;
        }


        const normalized =
            contentType
                .toLowerCase();


        return (
            normalized.includes(
                'text/html',
            )
            || normalized.includes(
                'application/xhtml+xml',
            )
        );
    }


    async extract(
        input:
            ParserInput,
    ): Promise<ExtractorOutput> {

        const discovered:
            DiscoveredProperty[] = [];


        const warnings:
            ExtractorOutput['warnings'] = [];


        if (
            !this.supports(
                input,
            )
        ) {

            return {
                discovered,
                warnings,
            };
        }


        const html =
            this.bodyToString(
                input,
            );


        let $:
            CheerioApi;


        try {

            $ =
                load(
                    html,
                );

        } catch (
            error
        ) {

            warnings.push({

                extractorId:
                    this.id,

                code:
                    'MICRODATA_HTML_PARSE_ERROR',

                message:
                    `Could not parse HTML: `
                    + this.errorMessage(
                        error,
                    ),
            });


            return {
                discovered,
                warnings,
            };
        }


        const scopes =
            $('[itemscope]')
                .toArray();


        /**
         * Global indexes provide a stable fallback
         * path for every itemscope.
         */
        const scopeIndexes =
            new Map<AnyNode, number>();


        scopes.forEach(
            (
                scope,
                index,
            ) => {

                scopeIndexes.set(
                    scope,
                    index,
                );
            },
        );


        for (
            const scope
            of scopes
        ) {

            const scopePath =
                this.createScopePath(
                    $,
                    scope,
                    scopeIndexes,
                );


            const vocabulary =
                this.detectScopeVocabulary(
                    $,
                    scope,
                );


            /**
             * ----------------------------------------
             * itemtype
             * ----------------------------------------
             *
             * itemtype itself is useful raw structured
             * information, even though it is not an
             * itemprop.
             */
            const rawItemType =
                $(scope)
                    .attr(
                        'itemtype',
                    )
                    ?.trim();


            if (
                rawItemType !== undefined
                && rawItemType.length > 0
            ) {

                const itemTypes =
                    rawItemType
                        .split(
                            /\s+/,
                        )
                        .filter(
                            Boolean,
                        );


                const itemTypeValue:
                    string | string[] =
                    itemTypes.length === 1
                        ? itemTypes[0]!
                        : itemTypes;


                discovered.push(
                    this.createDiscoveredProperty({

                        key:
                            'itemtype',

                        path:
                            `${scopePath}[itemtype]`,

                        value:
                            itemTypeValue,

                        vocabulary:
                            this.detectVocabulary(
                                rawItemType,
                            ),
                    }),
                );
            }


            /**
             * Only properties owned by THIS scope are
             * processed here.
             *
             * Descendants inside a nested itemscope are
             * processed when that nested scope itself is
             * visited.
             */
            const propertyElements =
                this.findDirectPropertyElements(
                    $,
                    scope,
                );


            /**
             * Used to distinguish repeated properties:
             *
             * [itemprop="image"]:eq(0)
             * [itemprop="image"]:eq(1)
             */
            const occurrenceByProperty =
                new Map<string, number>();


            for (
                const element
                of propertyElements
            ) {

                const rawItemProp =
                    $(element)
                        .attr(
                            'itemprop',
                        );


                if (
                    rawItemProp === undefined
                ) {

                    continue;
                }


                const propertyNames =
                    rawItemProp
                        .split(
                            /\s+/,
                        )
                        .map(
                            property =>
                                property.trim(),
                        )
                        .filter(
                            Boolean,
                        );


                if (
                    propertyNames.length === 0
                ) {

                    warnings.push({

                        extractorId:
                            this.id,

                        code:
                            'MICRODATA_EMPTY_ITEMPROP',

                        message:
                            `Empty itemprop found inside `
                            + `${scopePath}.`,
                    });


                    continue;
                }


                const value =
                    this.readPropertyValue(
                        $,
                        element,
                    );


                /**
                 * Empty values are common in incomplete
                 * markup. Ignore them rather than
                 * generating noisy warnings.
                 */
                if (
                    value === null
                ) {

                    continue;
                }


                /**
                 * itemprop can legally contain multiple
                 * property names.
                 *
                 * Example:
                 *
                 * itemprop="name headline"
                 */
                for (
                    const propertyName
                    of propertyNames
                ) {

                    const occurrence =
                        occurrenceByProperty
                            .get(
                                propertyName,
                            )
                        ?? 0;


                    occurrenceByProperty.set(
                        propertyName,
                        occurrence + 1,
                    );


                    const escapedProperty =
                        this.escapeAttributeValue(
                            propertyName,
                        );


                    discovered.push(
                        this.createDiscoveredProperty({

                            key:
                                propertyName,

                            path:
                                `${scopePath} `
                                + `[itemprop="${escapedProperty}"]`
                                + `:eq(${occurrence})`,

                            value,

                            vocabulary,
                        }),
                    );
                }
            }
        }


        return {

            discovered:
                this.deduplicate(
                    discovered,
                ),

            warnings,
        };
    }


    /**
     * Find itemprop elements whose nearest itemscope
     * ancestor is the supplied scope.
     *
     * This prevents:
     *
     * LocalBusiness
     *   └─ PostalAddress
     *       └─ streetAddress
     *
     * from causing streetAddress to be extracted once
     * for PostalAddress AND again for LocalBusiness.
     */
    private findDirectPropertyElements(
        $:
            CheerioApi,

        scope:
            AnyNode,
    ): AnyNode[] {

        const result:
            AnyNode[] = [];


        $(scope)
            .find(
                '[itemprop]',
            )
            .each(
                (
                    _,
                    element,
                ) => {

                    const ownerScope =
                        this.findOwningScope(
                            $,
                            element,
                        );


                    if (
                        ownerScope
                        !== scope
                    ) {

                        return;
                    }


                    result.push(
                        element,
                    );
                },
            );


        return result;
    }


    /**
     * Nearest itemscope ancestor owns an itemprop.
     */
    private findOwningScope(
        $:
            CheerioApi,

        element:
            AnyNode,
    ): AnyNode | null {

        const owner =
            $(element)
                .parents(
                    '[itemscope]',
                )
                .first()
                .get(
                    0,
                );


        return owner
            ?? null;
    }


    /**
     * Produce useful nested paths.
     *
     * Example:
     *
     * [itemscope]:eq(0)
     *   [itemprop="address"]:eq(0)
     *   [itemprop="streetAddress"]:eq(0)
     */
    private createScopePath(
        $:
            CheerioApi,

        scope:
            AnyNode,

        scopeIndexes:
            Map<AnyNode, number>,
    ): string {

        const parentScope =
            $(scope)
                .parents(
                    '[itemscope]',
                )
                .first()
                .get(
                    0,
                );


        const globalIndex =
            scopeIndexes.get(
                scope,
            )
            ?? 0;


        if (
            parentScope === undefined
        ) {

            return `[itemscope]:eq(${globalIndex})`;
        }


        const rawItemProp =
            $(scope)
                .attr(
                    'itemprop',
                );


        const firstPropertyName =
            rawItemProp
                ?.split(
                    /\s+/,
                )
                .map(
                    value =>
                        value.trim(),
                )
                .find(
                    Boolean,
                );


        /**
         * A nested itemscope without itemprop cannot be
         * expressed as a semantic property path, so use
         * its global scope index as a safe fallback.
         */
        if (
            firstPropertyName === undefined
        ) {

            return `[itemscope]:eq(${globalIndex})`;
        }


        const parentPath =
            this.createScopePath(
                $,
                parentScope,
                scopeIndexes,
            );


        const siblingProperties =
            this.findDirectPropertyElements(
                $,
                parentScope,
            )
                .filter(
                    element =>
                        this.hasItemProp(
                            $,
                            element,
                            firstPropertyName,
                        ),
                );


        const occurrence =
            Math.max(
                0,
                siblingProperties
                    .findIndex(
                        element =>
                            element === scope,
                    ),
            );


        return (
            `${parentPath} `
            + `[itemprop="`
            + `${this.escapeAttributeValue(firstPropertyName)}`
            + `"]:eq(${occurrence})`
        );
    }


    private hasItemProp(
        $:
            CheerioApi,

        element:
            AnyNode,

        expected:
            string,
    ): boolean {

        const raw =
            $(element)
                .attr(
                    'itemprop',
                );


        if (
            raw === undefined
        ) {

            return false;
        }


        return raw
            .split(
                /\s+/,
            )
            .some(
                property =>
                    property.trim()
                    === expected,
            );
    }


    /**
     * Read a Microdata property according to the HTML
     * element carrying itemprop.
     *
     * Raw values are preserved. Normalization happens
     * later.
     */
    private readPropertyValue(
        $:
            CheerioApi,

        element:
            AnyNode,
    ): string | null {

        const tagName =
            (
                'name' in element
                && typeof element.name
                === 'string'
            )
                ? element.name
                    .toLowerCase()
                : '';


        let raw:
            string | undefined;


        switch (
            tagName
        ) {

            case 'meta':

                raw =
                    $(element)
                        .attr(
                            'content',
                        );

                break;


            case 'audio':
            case 'embed':
            case 'iframe':
            case 'img':
            case 'source':
            case 'track':
            case 'video':

                raw =
                    $(element)
                        .attr(
                            'src',
                        );

                break;


            case 'a':
            case 'area':
            case 'link':

                raw =
                    $(element)
                        .attr(
                            'href',
                        );

                break;


            case 'object':

                raw =
                    $(element)
                        .attr(
                            'data',
                        );

                break;


            case 'data':
            case 'meter':

                raw =
                    $(element)
                        .attr(
                            'value',
                        );

                break;


            case 'time':

                raw =
                    $(element)
                        .attr(
                            'datetime',
                        )
                    ?? $(element)
                        .text();

                break;


            default:

                raw =
                    $(element)
                        .text();

                break;
        }


        if (
            raw === undefined
        ) {

            return null;
        }


        const cleaned =
            this.cleanText(
                raw,
            );


        return cleaned.length > 0
            ? cleaned
            : null;
    }


    /**
     * Use the current scope's itemtype when available.
     *
     * If a nested scope does not declare itemtype,
     * inherit vocabulary information from its nearest
     * typed parent scope.
     */
    private detectScopeVocabulary(
        $:
            CheerioApi,

        scope:
            AnyNode,
    ): ExtractionVocabulary {

        let current:
            AnyNode | undefined =
            scope;


        while (
            current !== undefined
        ) {

            const itemType =
                $(current)
                    .attr(
                        'itemtype',
                    )
                    ?.trim();


            if (
                itemType !== undefined
                && itemType.length > 0
            ) {

                return this.detectVocabulary(
                    itemType,
                );
            }


            current =
                $(current)
                    .parents(
                        '[itemscope]',
                    )
                    .first()
                    .get(
                        0,
                    );
        }


        return 'OTHER';
    }


    private detectVocabulary(
        itemType:
            string,
    ): ExtractionVocabulary {

        return itemType
            .toLowerCase()
            .includes(
                'schema.org',
            )
                ? 'SCHEMA_ORG'
                : 'OTHER';
    }


    private createDiscoveredProperty(
        input: {

            key:
                string;

            path:
                string;

            value:
                DiscoveredProperty['value'];

            vocabulary:
                ExtractionVocabulary;
        },
    ): DiscoveredProperty {

        return {

            key:
                input.key,

            path:
                input.path,

            value:
                input.value,

            source:
                'MICRODATA',

            vocabulary:
                input.vocabulary,

            extractorId:
                this.id,

            snippet:
                this.createSnippet(
                    input.value,
                ),
        };
    }


    private createSnippet(
        value:
            DiscoveredProperty['value'],
    ): string {

        if (
            value === null
        ) {

            return '';
        }


        const text =
            Array.isArray(
                value,
            )
                ? value.join(
                    ', ',
                )
                : String(
                    value,
                );


        return this.cleanText(
            text,
        ).slice(
            0,
            MAX_SNIPPET_LENGTH,
        );
    }


    private cleanText(
        value:
            string,
    ): string {

        return value
            .replace(
                /\s+/g,
                ' ',
            )
            .trim();
    }


    private escapeAttributeValue(
        value:
            string,
    ): string {

        return value
            .replace(
                /\\/g,
                '\\\\',
            )
            .replace(
                /"/g,
                '\\"',
            );
    }


    private deduplicate(
        properties:
            DiscoveredProperty[],
    ): DiscoveredProperty[] {

        const seen =
            new Set<string>();


        const result:
            DiscoveredProperty[] = [];


        for (
            const property
            of properties
        ) {

            const key =
                JSON.stringify([
                    property.key,
                    property.path,
                    property.value,
                    property.source,
                    property.vocabulary,
                ]);


            if (
                seen.has(
                    key,
                )
            ) {

                continue;
            }


            seen.add(
                key,
            );


            result.push(
                property,
            );
        }


        return result;
    }


    private bodyToString(
        input:
            ParserInput,
    ): string {

        const body =
            input.envelope.rawBody;


        if (
            body === null
        ) {

            return '';
        }


        return Buffer.isBuffer(
            body,
        )
            ? body.toString(
                'utf8',
            )
            : body;
    }


    private getHeader(
        input:
            ParserInput,

        headerName:
            string,
    ): string | undefined {

        for (
            const [
                key,
                value,
            ]
            of Object.entries(
                input.envelope.headers,
            )
        ) {

            if (
                key.toLowerCase()
                !== headerName.toLowerCase()
            ) {

                continue;
            }


            if (
                typeof value === 'string'
            ) {

                return value;
            }


            if (
                Array.isArray(
                    value,
                )
            ) {

                const strings =
                    value.filter(
                        (
                            item,
                        ): item is string =>
                            typeof item
                            === 'string',
                    );


                return strings.length > 0
                    ? strings.join(
                        ', ',
                    )
                    : undefined;
            }


            return undefined;
        }


        return undefined;
    }


    private errorMessage(
        error:
            unknown,
    ): string {

        return error instanceof Error
            ? error.message
            : String(
                error,
            );
    }
}
import {
    load,
} from 'cheerio';

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


export class MetaExtractor
implements DeterministicExtractor {

    readonly id =
        'meta';


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
         * real websites sometimes return incomplete
         * response headers.
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
            ReturnType<typeof load>;


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
                    'META_HTML_PARSE_ERROR',

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


        /**
         * --------------------------------------------
         * <title>
         * --------------------------------------------
         *
         * This is raw discovery only.
         *
         * We do NOT decide whether this means:
         *
         * - businessName
         * - productName
         * - jobTitle
         * - headline
         *
         * FieldMatcher handles that later.
         */
        const title =
            this.cleanText(
                $('title')
                    .first()
                    .text(),
            );


        if (
            title.length > 0
        ) {

            discovered.push({

                key:
                    'title',

                path:
                    'title',

                value:
                    title,

                source:
                    'META',

                vocabulary:
                    'HTML_META',

                extractorId:
                    this.id,

                snippet:
                    this.createSnippet(
                        title,
                    ),
            });
        }


        /**
         * Track occurrence per key so evidence paths
         * remain useful when a page has duplicates:
         *
         * meta[property="og:image"]:eq(0)
         * meta[property="og:image"]:eq(1)
         */
        const occurrenceBySelector =
            new Map<string, number>();


        $('meta')
            .each(
                (
                    _globalIndex,
                    element,
                ) => {

                    const property =
                        $(element)
                            .attr(
                                'property',
                            );


                    const name =
                        $(element)
                            .attr(
                                'name',
                            );


                    /**
                     * Prefer property when both exist.
                     *
                     * That matches common Open Graph
                     * markup and avoids producing two
                     * properties from one meta element.
                     */
                    const attributeName =
                        property !== undefined
                            ? 'property'
                            : name !== undefined
                                ? 'name'
                                : null;


                    const rawKey =
                        property
                        ?? name;


                    if (
                        attributeName === null
                        || rawKey === undefined
                    ) {

                        return;
                    }


                    const key =
                        rawKey
                            .trim()
                            .toLowerCase();


                    if (
                        key.length === 0
                    ) {

                        return;
                    }


                    const rawContent =
                        $(element)
                            .attr(
                                'content',
                            );


                    if (
                        rawContent === undefined
                    ) {

                        return;
                    }


                    const value =
                        this.cleanText(
                            rawContent,
                        );


                    /**
                     * Empty optional metadata is common.
                     * Ignore it rather than creating noisy
                     * warnings.
                     */
                    if (
                        value.length === 0
                    ) {

                        return;
                    }


                    const selector =
                        `meta[${attributeName}="${key}"]`;


                    const occurrence =
                        occurrenceBySelector
                            .get(
                                selector,
                            )
                        ?? 0;


                    occurrenceBySelector.set(
                        selector,
                        occurrence + 1,
                    );


                    discovered.push({

                        key,

                        path:
                            `${selector}:eq(${occurrence})`,

                        value,

                        source:
                            'META',

                        vocabulary:
                            this.detectVocabulary(
                                key,
                            ),

                        extractorId:
                            this.id,

                        snippet:
                            this.createSnippet(
                                value,
                            ),
                    });
                },
            );


        return {

            discovered:
                this.deduplicate(
                    discovered,
                ),

            warnings,
        };
    }


    private detectVocabulary(
        key:
            string,
    ): ExtractionVocabulary {

        const normalized =
            key
                .trim()
                .toLowerCase();


        if (
            normalized.startsWith(
                'og:',
            )
        ) {

            return 'OPEN_GRAPH';
        }


        if (
            normalized.startsWith(
                'twitter:',
            )
        ) {

            return 'TWITTER_CARD';
        }


        return 'HTML_META';
    }


    private createSnippet(
        value:
            string,
    ): string {

        return this.cleanText(
            value,
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
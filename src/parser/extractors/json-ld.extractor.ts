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


const MAX_SCRIPT_BYTES =
    1_000_000;


const MAX_SNIPPET_LENGTH =
    50;


type JsonPrimitive =
    string
    | number
    | boolean
    | null;


type JsonValue =
    JsonPrimitive
    | JsonValue[]
    | {
        [key: string]:
            JsonValue;
    };


export class JsonLdExtractor
implements DeterministicExtractor {

    readonly id =
        'json-ld';


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
         * Missing content type is allowed because
         * many real sites return incomplete headers.
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
                    'JSON_LD_HTML_PARSE_ERROR',

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
         * Do not use an exact CSS type selector here.
         *
         * Normalize the type manually so casing and
         * harmless whitespace do not prevent discovery.
         */
        $('script')
            .each(
                (
                    scriptIndex,
                    element,
                ) => {

                    const type =
                        $(element)
                            .attr(
                                'type',
                            )
                            ?.trim()
                            .toLowerCase();


                    if (
                        type === undefined
                        || !type.startsWith(
                            'application/ld+json',
                        )
                    ) {

                        return;
                    }


                    const raw =
                        $(element)
                            .html()
                        ?? '';


                    if (
                        raw.trim()
                            .length === 0
                    ) {

                        return;
                    }


                    const bytes =
                        Buffer.byteLength(
                            raw,
                            'utf8',
                        );


                    if (
                        bytes > MAX_SCRIPT_BYTES
                    ) {

                        warnings.push({

                            extractorId:
                                this.id,

                            code:
                                'JSON_LD_SCRIPT_TOO_LARGE',

                            message:
                                `JSON-LD script ${scriptIndex} `
                                + `exceeds ${MAX_SCRIPT_BYTES} bytes.`,
                        });


                        return;
                    }


                    let parsed:
                        unknown;


                    try {

                        parsed =
                            JSON.parse(
                                raw,
                            );

                    } catch (
                        error
                    ) {

                        warnings.push({

                            extractorId:
                                this.id,

                            code:
                                'JSON_LD_PARSE_ERROR',

                            message:
                                `Could not parse JSON-LD script `
                                + `${scriptIndex}: `
                                + this.errorMessage(
                                    error,
                                ),
                        });


                        return;
                    }


                    if (
                        !this.isJsonValue(
                            parsed,
                        )
                    ) {

                        warnings.push({

                            extractorId:
                                this.id,

                            code:
                                'JSON_LD_UNSUPPORTED_VALUE',

                            message:
                                `JSON-LD script ${scriptIndex} `
                                + 'contains an unsupported value.',
                        });


                        return;
                    }


                    const initialVocabulary =
                        this.detectVocabulary(
                            parsed,
                        );


                    this.flattenValue(
                        parsed,
                        '$',
                        undefined,
                        initialVocabulary,
                        discovered,
                    );
                },
            );


        return {
            discovered,
            warnings,
        };
    }


    /**
     * Recursively flatten JSON-LD.
     *
     * IMPORTANT:
     *
     * There is deliberately NO @type filtering.
     *
     * Product, JobPosting, Article, Organization,
     * Person, Event, or any future schema can flow
     * through this same extractor.
     */
    private flattenValue(
        value:
            JsonValue,

        path:
            string,

        key:
            string | undefined,

        inheritedVocabulary:
            ExtractionVocabulary,

        output:
            DiscoveredProperty[],
    ): void {

        /**
         * Primitive leaf.
         */
        if (
            value === null
            || typeof value === 'string'
            || typeof value === 'number'
            || typeof value === 'boolean'
        ) {

            if (
                key === undefined
            ) {

                return;
            }


            output.push(
                this.createDiscoveredProperty(
                    key,
                    path,
                    value,
                    inheritedVocabulary,
                ),
            );


            return;
        }


        /**
         * Array.
         *
         * string[] is directly supported by
         * ExtractionValue / DiscoveredProperty.
         */
        if (
            Array.isArray(
                value,
            )
        ) {

            if (
                key !== undefined
                && value.length > 0
                && value.every(
                    item =>
                        typeof item === 'string',
                )
            ) {

                output.push(
                    this.createDiscoveredProperty(
                        key,
                        path,
                        value as string[],
                        inheritedVocabulary,
                    ),
                );


                return;
            }


            value.forEach(
                (
                    item,
                    index,
                ) => {

                    this.flattenValue(
                        item,
                        `${path}[${index}]`,
                        key,
                        inheritedVocabulary,
                        output,
                    );
                },
            );


            return;
        }


        /**
         * Object.
         *
         * A nested @context may override/inform the
         * vocabulary for properties below it.
         */
        const localVocabulary =
            this.detectVocabularyFromObject(
                value,
                inheritedVocabulary,
            );


        for (
            const [
                propertyKey,
                propertyValue,
            ]
            of Object.entries(
                value,
            )
        ) {

            const propertyPath =
                this.appendPath(
                    path,
                    propertyKey,
                );


            this.flattenValue(
                propertyValue,
                propertyPath,
                propertyKey,
                localVocabulary,
                output,
            );
        }
    }


    private createDiscoveredProperty(
        key:
            string,

        path:
            string,

        value:
            JsonPrimitive | string[],

        vocabulary:
            ExtractionVocabulary,
    ): DiscoveredProperty {

        return {

            key,

            path,

            value,

            source:
                'JSON_LD',

            vocabulary,

            extractorId:
                this.id,

            snippet:
                this.createSnippet(
                    value,
                ),
        };
    }


    /**
     * Standard identifiers use normal dot notation:
     *
     * $.offers.price
     *
     * Special JSON-LD keys use bracket notation:
     *
     * $["@type"]
     * $["@context"]
     */
    private appendPath(
        base:
            string,

        key:
            string,
    ): string {

        if (
            /^[A-Za-z_$][A-Za-z0-9_$]*$/
                .test(
                    key,
                )
        ) {

            return `${base}.${key}`;
        }


        return (
            `${base}[`
            + `${JSON.stringify(key)}`
            + `]`
        );
    }


    private detectVocabulary(
        value:
            JsonValue,
    ): ExtractionVocabulary {

        if (
            this.containsSchemaOrgContext(
                value,
            )
        ) {

            return 'SCHEMA_ORG';
        }


        return 'OTHER';
    }


    private detectVocabularyFromObject(
        value:
            {
                [key: string]:
                    JsonValue;
            },

        inherited:
            ExtractionVocabulary,
    ): ExtractionVocabulary {

        if (
            !Object.prototype
                .hasOwnProperty
                .call(
                    value,
                    '@context',
                )
        ) {

            return inherited;
        }


        return this.containsSchemaOrgContext(
            value['@context'],
        )
            ? 'SCHEMA_ORG'
            : 'OTHER';
    }


    private containsSchemaOrgContext(
        value:
            JsonValue | undefined,
    ): boolean {

        if (
            value === undefined
            || value === null
        ) {

            return false;
        }


        if (
            typeof value === 'string'
        ) {

            return value
                .toLowerCase()
                .includes(
                    'schema.org',
                );
        }


        if (
            typeof value === 'number'
            || typeof value === 'boolean'
        ) {

            return false;
        }


        if (
            Array.isArray(
                value,
            )
        ) {

            return value.some(
                item =>
                    this.containsSchemaOrgContext(
                        item,
                    ),
            );
        }


        return Object
            .values(
                value,
            )
            .some(
                item =>
                    this.containsSchemaOrgContext(
                        item,
                    ),
            );
    }


    private createSnippet(
        value:
            JsonPrimitive | string[],
    ): string {

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


        return text
            .replace(
                /\s+/g,
                ' ',
            )
            .trim()
            .slice(
                0,
                MAX_SNIPPET_LENGTH,
            );
    }


    private isJsonValue(
        value:
            unknown,
    ): value is JsonValue {

        if (
            value === null
            || typeof value === 'string'
            || typeof value === 'number'
            || typeof value === 'boolean'
        ) {

            return true;
        }


        if (
            Array.isArray(
                value,
            )
        ) {

            return value.every(
                item =>
                    this.isJsonValue(
                        item,
                    ),
            );
        }


        if (
            typeof value === 'object'
        ) {

            return Object
                .values(
                    value,
                )
                .every(
                    item =>
                        this.isJsonValue(
                            item,
                        ),
                );
        }


        return false;
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
                            typeof item === 'string',
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
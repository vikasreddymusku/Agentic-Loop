import type {
    NetworkResponse,
} from '../../core/contracts/browser/network-response.js';

import type {
    DiscoveredProperty,
} from '../../core/contracts/parser/discovered-property.js';

import type {
    ExtractionWarning,
} from '../../core/contracts/parser/extraction-result.js';

import type {
    NetworkDataExtractor,
} from '../../core/contracts/parser/network-data-extractor.js';

import type {
    NetworkExtractionResult,
} from '../../core/contracts/parser/network-extraction-result.js';


const EXTRACTOR_ID =
    'network';

const SNIPPET_LIMIT =
    50;


/**
 * These are safety limits, NOT scraping rules.
 *
 * They are configurable so the extractor remains
 * universal and can later be tuned by runtime policy.
 */
export type NetworkDataExtractorOptions = {

    maxResponses?:
        number;

    maxBodyBytes?:
        number;

    maxTotalBodyBytes?:
        number;

    maxPropertiesPerResponse?:
        number;

    maxTotalProperties?:
        number;

    maxDepth?:
        number;

    maxNodesPerResponse?:
        number;

    maxArrayItems?:
        number;

    maxStringLength?:
        number;
};


type ResolvedOptions =
    Required<NetworkDataExtractorOptions>;


const DEFAULT_OPTIONS:
    ResolvedOptions = {

        maxResponses:
            200,

        maxBodyBytes:
            1024 * 1024,

        maxTotalBodyBytes:
            4 * 1024 * 1024,

        maxPropertiesPerResponse:
            1_500,

        maxTotalProperties:
            5_000,

        maxDepth:
            40,

        maxNodesPerResponse:
            20_000,

        maxArrayItems:
            1_000,

        maxStringLength:
            20_000,
    };


type BodyText = {

    text:
        string;

    bytes:
        number;
};


type GlobalExtractionState = {

    discovered:
        DiscoveredProperty[];

    warnings:
        ExtractionWarning[];

    totalPropertyLimitWarned:
        boolean;

    totalBodyBudgetWarned:
        boolean;

    stopAll:
        boolean;
};


type TraversalState = {

    responseIndex:
        number;

    responseLabel:
        string;

    sourceRef:
        string;

    properties:
        number;

    nodesVisited:
        number;

    stopResponse:
        boolean;

    warningCodes:
        Set<string>;

    global:
        GlobalExtractionState;

    
};


/**
 * Phase 14B.
 *
 * Converts retained browser-network response bodies
 * into field-agnostic DiscoveredProperty[].
 *
 * Important:
 *
 * - does not trust Content-Type
 * - does not know endpoint names
 * - does not know website names
 * - does not know requested fields
 * - does not execute JavaScript
 * - does not use eval()
 * - does not perform semantic field mapping
 */
export class DefaultNetworkDataExtractor
implements NetworkDataExtractor {

    readonly id =
        EXTRACTOR_ID;

    private readonly options:
        ResolvedOptions;


    constructor(
        options:
            NetworkDataExtractorOptions = {},
    ) {

        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
        };


        const entries =
            Object.entries(
                this.options,
            ) as Array<
                [
                    keyof ResolvedOptions,
                    number,
                ]
            >;


        for (
            const [
                name,
                value,
            ]
            of entries
        ) {

            if (
                !Number.isSafeInteger(
                    value,
                )
                || value <= 0
            ) {

                throw new Error(
                    `NetworkDataExtractor option `
                    + `"${String(name)}" must be `
                    + 'a positive safe integer.',
                );
            }
        }
    }


    extract(
        responses:
            readonly NetworkResponse[],
    ): NetworkExtractionResult {

        const global:
            GlobalExtractionState = {

                discovered:
                    [],

                warnings:
                    [],

                totalPropertyLimitWarned:
                    false,

                totalBodyBudgetWarned:
                    false,

                stopAll:
                    false,
            };


        let inspectedBodyBytes =
            0;


        const responseCount =
            Math.min(
                responses.length,
                this.options.maxResponses,
            );


        if (
            responses.length
            > this.options.maxResponses
        ) {

            this.pushWarning(
                global.warnings,
                'NETWORK_RESPONSE_LIMIT_REACHED',
                `Network extraction received `
                + `${responses.length} responses but `
                + `will inspect only the first `
                + `${this.options.maxResponses}.`,
            );
        }


        for (
            let index = 0;
            index < responseCount;
            index += 1
        ) {

            if (
                global.stopAll
            ) {
                break;
            }


            const response =
                responses[index];


            if (
                response === undefined
            ) {
                continue;
            }


            const body =
                this.toBodyText(
                    response,
                );


            /**
             * No retained body is not an extraction
             * failure.
             *
             * Phase 13 may intentionally omit bodies
             * for binary, oversized, streaming, etc.
             */
            if (
                body === null
                || body.text.trim()
                    .length === 0
            ) {
                continue;
            }


            const responseLabel =
                this.createResponseLabel(
                    response,
                    index,
                );


            if (
                body.bytes
                > this.options.maxBodyBytes
            ) {

                this.pushWarning(
                    global.warnings,
                    'NETWORK_BODY_TOO_LARGE',
                    `${responseLabel} was skipped because `
                    + `its retained body is ${body.bytes} `
                    + `bytes, above the extraction limit `
                    + `of ${this.options.maxBodyBytes} bytes.`,
                );

                continue;
            }


            if (
                inspectedBodyBytes
                + body.bytes
                > this.options.maxTotalBodyBytes
            ) {

                if (
                    !global.totalBodyBudgetWarned
                ) {

                    global.totalBodyBudgetWarned =
                        true;

                    this.pushWarning(
                        global.warnings,
                        'NETWORK_TOTAL_BODY_BUDGET_REACHED',
                        'One or more network response '
                        + 'bodies were skipped because '
                        + 'the total network extraction '
                        + 'body budget would be exceeded.',
                    );
                }

                /**
                 * Do not stop completely.
                 *
                 * A later smaller response may still
                 * fit inside the remaining budget.
                 */
                continue;
            }


            inspectedBodyBytes +=
                body.bytes;


            const candidateText =
                stripTransportGuards(
                    body.text,
                );


            /**
             * Ordinary JavaScript, HTML, text,
             * analytics payloads, etc. are ignored
             * quietly.
             *
             * We only attempt JSON.parse when the
             * resulting body structurally begins like
             * JSON.
             */
            if (
                !looksLikeStructuredJson(
                    candidateText,
                )
            ) {
                continue;
            }


            let parsed:
                unknown;


            try {

                parsed =
                    JSON.parse(
                        candidateText,
                    );

            } catch {

                this.pushWarning(
                    global.warnings,
                    'NETWORK_MALFORMED_JSON',
                    `${responseLabel} looked like `
                    + 'structured JSON but could not '
                    + 'be parsed safely.',
                );

                continue;
            }


            /**
             * A top-level JSON primitive has no useful
             * semantic property key.
             *
             * Objects and arrays are the useful
             * structured-data roots.
             */
            if (
                parsed === null
                || typeof parsed
                    !== 'object'
            ) {
                continue;
            }


            const state:
                TraversalState = {

                    responseIndex:
                        index,

                    responseLabel,

                    sourceRef:
                        response.id,

                    properties:
                        0,

                    nodesVisited:
                        0,

                    stopResponse:
                        false,

                    warningCodes:
                        new Set<string>(),

                    global,
                };


            this.walk(
                parsed,
                '$',
                undefined,
                0,
                state,
            );
        }


        return {

            discovered:
                global.discovered,

            warnings:
                global.warnings,
        };
    }


    private walk(
        value:
            unknown,

        path:
            string,

        semanticKey:
            string | undefined,

        depth:
            number,

        state:
            TraversalState,
    ): void {

        if (
            state.stopResponse
            || state.global.stopAll
        ) {
            return;
        }


        state.nodesVisited +=
            1;


        if (
            state.nodesVisited
            > this.options.maxNodesPerResponse
        ) {

            this.warnOnceForResponse(
                state,
                'NETWORK_NODE_LIMIT_REACHED',
                `${state.responseLabel} exceeded the `
                + `maximum traversal-node count of `
                + `${this.options.maxNodesPerResponse}.`,
            );

            state.stopResponse =
                true;

            return;
        }


        if (
            depth
            > this.options.maxDepth
        ) {

            this.warnOnceForResponse(
                state,
                'NETWORK_DEPTH_LIMIT_REACHED',
                `${state.responseLabel} contained data `
                + `deeper than the configured maximum `
                + `depth of ${this.options.maxDepth}.`,
            );

            return;
        }


        /**
         * Nulls are intentionally ignored.
         *
         * Large API responses often contain thousands
         * of null placeholders. Turning them into
         * candidates creates noise and can interfere
         * with useful evidence.
         */
        if (
            value === null
        ) {
            return;
        }


        if (
            Array.isArray(
                value,
            )
        ) {

            this.walkArray(
                value,
                path,
                semanticKey,
                depth,
                state,
            );

            return;
        }


        if (
            typeof value
            === 'object'
        ) {

            const record =
                value as Record<
                    string,
                    unknown
                >;


            for (
                const [
                    childKey,
                    childValue,
                ]
                of Object.entries(
                    record,
                )
            ) {

                if (
                    state.stopResponse
                    || state.global.stopAll
                ) {
                    break;
                }


                /**
                 * Empty property names provide no
                 * useful matching signal.
                 */
                if (
                    childKey.trim()
                        .length === 0
                ) {
                    continue;
                }


                /**
                 * GraphQL and other structured systems
                 * commonly use double-underscore keys
                 * for schema/internal metadata.
                 *
                 * This rule is structural rather than
                 * endpoint-specific.
                 */
                if (
                    childKey.startsWith(
                        '__',
                    )
                ) {
                    continue;
                }


                this.walk(
                    childValue,
                    appendJsonPath(
                        path,
                        childKey,
                    ),
                    childKey,
                    depth + 1,
                    state,
                );
            }


            return;
        }


        if (
            semanticKey === undefined
        ) {

            /**
             * Primitive with no property name.
             *
             * Example:
             *
             * [1, 2, 3]
             *
             * There is no semantic key to match
             * against a RequestedField.
             */
            return;
        }


        if (
            typeof value
            === 'string'
        ) {

            if (
                value.trim()
                    .length === 0
            ) {
                return;
            }


            if (
                value.length
                > this.options.maxStringLength
            ) {

                this.warnOnceForResponse(
                    state,
                    'NETWORK_STRING_TOO_LARGE',
                    `${state.responseLabel} contained `
                    + 'one or more string values above '
                    + `the configured ${this.options.maxStringLength}`
                    + '-character limit.',
                );

                return;
            }


            this.addProperty(
                semanticKey,
                path,
                value,
                state,
            );

            return;
        }


        if (
            typeof value
            === 'number'
        ) {

            /**
             * JSON.parse cannot normally produce
             * Infinity or NaN, but keep this defensive
             * check at the extractor boundary.
             */
            if (
                !Number.isFinite(
                    value,
                )
            ) {
                return;
            }


            this.addProperty(
                semanticKey,
                path,
                value,
                state,
            );

            return;
        }


        if (
            typeof value
            === 'boolean'
        ) {

            this.addProperty(
                semanticKey,
                path,
                value,
                state,
            );
        }
    }


    private walkArray(
        values:
            unknown[],

        path:
            string,

        semanticKey:
            string | undefined,

        depth:
            number,

        state:
            TraversalState,
    ): void {

        if (
            values.length === 0
        ) {
            return;
        }


        const itemCount =
            Math.min(
                values.length,
                this.options.maxArrayItems,
            );


        if (
            values.length
            > this.options.maxArrayItems
        ) {

            this.warnOnceForResponse(
                state,
                'NETWORK_ARRAY_LIMIT_REACHED',
                `${state.responseLabel} contained one `
                + `or more arrays larger than `
                + `${this.options.maxArrayItems} items. `
                + 'Only the bounded prefix was traversed.',
            );
        }


        /**
         * Preserve string[] as one native extraction
         * value when it is safely bounded.
         *
         * This matches the existing ExtractionValue
         * contract.
         */
        if (
            semanticKey !== undefined
            && values.length
                <= this.options.maxArrayItems
            && values.every(
                (item) =>
                    typeof item === 'string'
                    && item.trim()
                        .length > 0
                    && item.length
                        <= this.options.maxStringLength,
            )
        ) {

            this.addProperty(
                semanticKey,
                path,
                [
                    ...values,
                ] as string[],
                state,
            );

            return;
        }


        /**
         * Arrays of objects, numbers, booleans,
         * mixed values, or oversized string arrays
         * are traversed using indexed JSON paths.
         *
         * Example:
         *
         * $.users[0].name
         * $.users[1].name
         */
        for (
            let index = 0;
            index < itemCount;
            index += 1
        ) {

            if (
                state.stopResponse
                || state.global.stopAll
            ) {
                break;
            }


            this.walk(
                values[index],
                `${path}[${index}]`,
                semanticKey,
                depth + 1,
                state,
            );
        }
    }


    private addProperty(
        key:
            string,

        path:
            string,

        value:
            DiscoveredProperty['value'],

        state:
            TraversalState,
    ): void {

        if (
            state.stopResponse
            || state.global.stopAll
        ) {
            return;
        }


        if (
            state.properties
            >= this.options
                .maxPropertiesPerResponse
        ) {

            this.warnOnceForResponse(
                state,
                'NETWORK_RESPONSE_PROPERTY_LIMIT_REACHED',
                `${state.responseLabel} exceeded the `
                + 'maximum discovered-property count '
                + `of ${this.options.maxPropertiesPerResponse} `
                + 'for one response.',
            );

            state.stopResponse =
                true;

            return;
        }


        if (
            state.global.discovered.length
            >= this.options.maxTotalProperties
        ) {

            if (
                !state.global
                    .totalPropertyLimitWarned
            ) {

                state.global
                    .totalPropertyLimitWarned =
                    true;


                this.pushWarning(
                    state.global.warnings,
                    'NETWORK_TOTAL_PROPERTY_LIMIT_REACHED',
                    'Network extraction reached the '
                    + 'configured global discovered-'
                    + `property limit of `
                    + `${this.options.maxTotalProperties}.`,
                );
            }


            state.global.stopAll =
                true;

            return;
        }


        state.global.discovered.push({

            key,

            path,

            value,

            source:
                'NETWORK',

            vocabulary:
                'OTHER',

            extractorId:
                EXTRACTOR_ID,

            sourceRef:
                state.sourceRef,

            snippet:
                createSnippet(
                    value,
                ),
        });


        state.properties +=
            1;
    }


    private warnOnceForResponse(
        state:
            TraversalState,

        code:
            string,

        message:
            string,
    ): void {

        if (
            state.warningCodes.has(
                code,
            )
        ) {
            return;
        }


        state.warningCodes.add(
            code,
        );


        this.pushWarning(
            state.global.warnings,
            code,
            message,
        );
    }


    private pushWarning(
        warnings:
            ExtractionWarning[],

        code:
            string,

        message:
            string,
    ): void {

        warnings.push({

            extractorId:
                EXTRACTOR_ID,

            code,

            message,
        });
    }


    private toBodyText(
        response:
            NetworkResponse,
    ): BodyText | null {

        const body =
            response.body;


        if (
            typeof body
            !== 'string'
        ) {
        return null;
    }


    return {

        text:
            body,

        bytes:
            Buffer.byteLength(
                body,
                'utf8',
            ),
    };
}

    private createResponseLabel(
        response:
            NetworkResponse,

        index:
            number,
    ): string {

        const url =
            typeof response.url === 'string'
            && response.url.trim()
                .length > 0
                ? response.url
                : 'unknown URL';


        return (
            `Network response #${index + 1} `
            + `(${url})`
        );
    }
}


/**
 * Remove only well-known transport guards.
 *
 * We do NOT try to interpret arbitrary JavaScript.
 */
function stripTransportGuards(
    input:
        string,
): string {

    let value =
        input
            .replace(
                /^\uFEFF/u,
                '',
            )
            .trimStart();


    /**
     * Multiple guards are unusual but legal from the
     * extractor's point of view, so bounded repetition
     * keeps this deterministic.
     */
    for (
        let iteration = 0;
        iteration < 8;
        iteration += 1
    ) {

        const previous =
            value;


        /**
         * Angular-style / generic XSSI prefix:
         *
         * )]}'
         * )]}',
         */
        value =
            value.replace(
                /^\)\]\}',?\s*/u,
                '',
            );


        /**
         * Common anti-JSON-hijacking guards.
         */
        value =
            value.replace(
                /^while\s*\(\s*(?:1|true)\s*\)\s*;\s*/iu,
                '',
            );


        value =
            value.replace(
                /^for\s*\(\s*;\s*;\s*\)\s*;\s*/iu,
                '',
            );


        value =
            value.trimStart();


        if (
            value === previous
        ) {
            break;
        }
    }


    return value.trim();
}


/**
 * Content-Type is deliberately not consulted.
 */
function looksLikeStructuredJson(
    value:
        string,
): boolean {

    if (
        value.length === 0
    ) {
        return false;
    }


    return (
        value.startsWith(
            '{',
        )
        || value.startsWith(
            '[',
        )
    );
}


/**
 * Produce valid JSONPath-style property locations.
 *
 * Simple:
 *
 * $.user.name
 *
 * Complex key:
 *
 * $["product.name"]
 */
function appendJsonPath(
    parent:
        string,

    key:
        string,
): string {

    if (
        /^[A-Za-z_$][A-Za-z0-9_$]*$/u
            .test(
                key,
            )
    ) {

        return `${parent}.${key}`;
    }


    return (
        `${parent}[`
        + `${JSON.stringify(key)}]`
    );
}


function createSnippet(
    value:
        DiscoveredProperty['value'],
): string {

    const raw =
        Array.isArray(
            value,
        )
            ? JSON.stringify(
                value,
            )
            : String(
                value,
            );


    return raw.slice(
        0,
        SNIPPET_LIMIT,
    );
}
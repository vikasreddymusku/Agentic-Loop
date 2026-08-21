import * as cheerio from 'cheerio';

import type {
    DeterministicExtractor,
    ExtractorOutput,
} from '../../core/contracts/parser/extractor.js';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';


type CheerioRoot =
    ReturnType<
        typeof cheerio.load
    >;


type DomSelection =
    ReturnType<
        CheerioRoot
    >;


type InternalCandidate = {
    key: string;
    value: string;
    path: string;

    /**
     * Internal structural evidence ordering only.
     *
     * This is NOT field confidence.
     * Field confidence remains entirely owned
     * by FieldMatcher.
     */
    rank: number;

    order: number;
};


type DiscoveryContext = {
    $: CheerioRoot;

    candidates:
        Map<
            string,
            InternalCandidate
        >;

    warnings:
        ExtractorOutput['warnings'];

    warningCodes:
        Set<string>;

    scannedNodes:
        Set<object>;

    nextOrder:
        number;
};


const LIMITS = {
    maxElements: 10_000,
    maxProperties: 500,
    maxValueLength: 2_000,
    maxSelectorDepth: 6,
    maxSnippetLength: 50,
    maxLabelLength: 80,
    maxLabelWords: 10,
} as const;

const CONTAINER_LIMITS = {
    maxDescendantElements:
        10,

    maxAggregateTextLength:
        500,

    maxChildBranchesWithoutDirectText:
        1,
} as const;


/**
 * These numbers are NOT confidence scores.
 *
 * They only establish deterministic precedence
 * when the same DOM element/value is discovered
 * through multiple structural mechanisms.
 */
const EVIDENCE_RANK = {
    DATA_FIELD_VALUE: 100,

    DEFINITION_PAIR: 95,
    TABLE_PAIR: 95,
    LABEL_PAIR: 95,

    DATA_ATTRIBUTE: 90,
    DATA_VALUE_WITH_IDENTIFIER: 88,

    SIBLING_PAIR: 85,

    ID: 80,
    ARIA_LABEL: 75,
    NAME: 70,
    CLASS: 65,

    SEMANTIC_ATTRIBUTE_FALLBACK: 50,
    HEADING_FALLBACK: 40,
} as const;


const EXCLUDED_TAGS =
    new Set<string>(
        [
            'script',
            'style',
            'noscript',
            'template',
            'svg',
            'path',
            'canvas',
            'iframe',

            /**
             * Already owned by MetaExtractor
             * or not useful as normal DOM data.
             */
            'meta',
            'link',

            /**
             * Buttons are interaction evidence,
             * not Phase-11 data evidence.
             *
             * They will become important later
             * for browser action discovery.
             */
            'button',
        ],
    );


const NON_SEMANTIC_IDENTIFIERS =
    new Set<string>(
        [
            'root',
            'app',

            'container',
            'wrapper',

            'row',
            'col',
            'column',

            'grid',
            'flex',

            'item',
            'card',

            'clearfix',

            'active',
            'disabled',
            'selected',

            'open',
            'closed',
        ],
    );


const UTILITY_IDENTIFIERS =
    new Set<string>(
        [
            'flex',
            'grid',

            'block',
            'inline',
            'inline-block',

            'hidden',
            'visible',

            'relative',
            'absolute',
            'fixed',
            'sticky',

            'container',
            'wrapper',

            'clearfix',
        ],
    );


const SIBLING_PAIR_EXCLUDED_PARENTS =
    new Set<string>(
        [
            'dl',

            'table',
            'thead',
            'tbody',
            'tfoot',
            'tr',

            'ul',
            'ol',

            'nav',
            'form',
        ],
    );


const SIBLING_LABEL_EXCLUDED_TAGS =
    new Set<string>(
        [
            'button',
            'a',

            'input',
            'textarea',
            'select',

            'label',

            'dt',
            'th',

            /**
             * Headings identify sections/content.
             * They should remain available through
             * heading discovery, but must not be
             * interpreted as label→value pairs.
             */
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
        ],
    );


export class DomExtractor
implements DeterministicExtractor {

    readonly id =
        'dom';


    supports(
        input:
            ParserInput,
    ): boolean {

        const rawBody =
            input
                .envelope
                .rawBody;


        if (
            rawBody === undefined
            || rawBody === null
            || (
                typeof rawBody === 'string'
                    ? rawBody.length === 0
                    : rawBody.byteLength === 0
            )
        ) {

            return false;
        }


        const contentType =
            this.getHeader(
                input,
                'content-type',
            );


        /**
         * Same general policy as our
         * structured HTML extractors:
         *
         * Missing Content-Type does not
         * automatically mean "not HTML".
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
            normalized
                .includes(
                    'text/html',
                )
            || normalized
                .includes(
                    'application/xhtml+xml',
                )
        );
    }


    async extract(
        input:
            ParserInput,
    ): Promise<
        ExtractorOutput
    > {

        const warnings:
            ExtractorOutput['warnings'] =
            [];


        const warningCodes =
            new Set<string>();


        const html =
            this.bodyToString(
                input,
            );


        if (
            html.trim().length === 0
        ) {

            return {
                discovered: [],
                warnings,
            };
        }


        if (
            input
                .envelope
                .bodyTruncated
            === true
        ) {

            this.pushWarning(
                warnings,
                warningCodes,
                'DOM_SOURCE_TRUNCATED',
                'DOM extraction is running against a truncated response body.',
            );
        }


        let $:
            CheerioRoot;


        try {

            $ =
                cheerio.load(
                    html,
                );

        } catch (
            error
        ) {

            this.pushWarning(
                warnings,
                warningCodes,
                'DOM_PARSE_FAILED',
                error instanceof Error
                    ? `Cheerio could not parse the HTML: ${error.message}`
                    : 'Cheerio could not parse the HTML.',
            );


            return {
                discovered: [],
                warnings,
            };
        }


        const context:
            DiscoveryContext = {

                $,

                candidates:
                    new Map(),

                warnings,

                warningCodes,

                scannedNodes:
                    new Set(),

                nextOrder:
                    0,
            };


        const allElements =
            $(
                'body *',
            );


        if (
            allElements.length
            > LIMITS.maxElements
        ) {

            this.pushWarning(
                warnings,
                warningCodes,
                'DOM_ELEMENT_LIMIT_REACHED',
                `DOM discovery inspected only the first ${LIMITS.maxElements} elements.`,
            );
        }


        const boundedElements =
            allElements.slice(
                0,
                LIMITS.maxElements,
            );


        /**
         * Record the bounded scan set first.
         *
         * Structural rules such as label→input
         * or dt→dd are only allowed to use
         * nodes inside this same bounded set.
         */
        boundedElements.each(
            (
                _index,
                node,
            ) => {

                context
                    .scannedNodes
                    .add(
                        node as object,
                    );
            },
        );


        boundedElements.each(
            (
                _index,
                node,
            ) => {

                const element =
                    $(
                        node,
                    );


                if (
                    this.isExcludedElement(
                        $,
                        element,
                    )
                ) {

                    return;
                }


                /**
                 * The extractor does NOT look at:
                 *
                 * input.job.requestedFields
                 *
                 * Discovery is completely
                 * field-agnostic.
                 */

                this.discoverDataAttributes(
                    context,
                    element,
                );


                this.discoverDefinitionPair(
                    context,
                    element,
                );


                this.discoverTablePair(
                    context,
                    element,
                );


                this.discoverLabelPair(
                    context,
                    element,
                );


                this.discoverSiblingPair(
                    context,
                    element,
                );


                this.discoverDirectSemanticValue(
                    context,
                    element,
                );


                this.discoverSemanticFallback(
                    context,
                    element,
                );
            },
        );


        const orderedCandidates =
            [
                ...context
                    .candidates
                    .values(),
            ]
                .sort(
                    (
                        left,
                        right,
                    ) => {

                        if (
                            left.rank
                            !== right.rank
                        ) {

                            return (
                                right.rank
                                - left.rank
                            );
                        }


                        return (
                            left.order
                            - right.order
                        );
                    },
                );


        if (
            orderedCandidates.length
            > LIMITS.maxProperties
        ) {

            this.pushWarning(
                warnings,
                warningCodes,
                'DOM_PROPERTY_LIMIT_REACHED',
                `DOM discovery returned only the strongest ${LIMITS.maxProperties} properties.`,
            );
        }


        const limitedCandidates =
            orderedCandidates.slice(
                0,
                LIMITS.maxProperties,
            );


        const discovered:
            ExtractorOutput['discovered'] =
            limitedCandidates.map(
                (
                    candidate,
                ) => ({

                    key:
                        candidate.key,

                    path:
                        candidate.path,

                    value:
                        candidate.value,

                    source:
                        'DOM',

                    vocabulary:
                        'OTHER',

                    extractorId:
                        this.id,

                    snippet:
                        candidate
                            .value
                            .slice(
                                0,
                                LIMITS
                                    .maxSnippetLength,
                            ),
                }),
            );


        return {
            discovered,
            warnings,
        };
    }


    private discoverDataAttributes(
        context:
            DiscoveryContext,

        element:
            DomSelection,
    ): void {

        const dataField =
            element.attr(
                'data-field',
            );


        const dataValue =
            element.attr(
                'data-value',
            );


        /**
         * Generic explicit pair:
         *
         * data-field="anything"
         * data-value="anything"
         *
         * No field names are known here.
         */
        if (
            dataField !== undefined
            && this.isSemanticIdentifier(
                dataField,
            )
        ) {

            let explicitValue =
    '';


if (
    dataValue !== undefined
) {

    explicitValue =
        this.normalizeText(
            dataValue,
        );

} else if (
    !this.shouldSuppressPrimaryValue(
        element,
    )
) {

    explicitValue =
        this.extractPrimaryValue(
            element,
        );
}


            if (
                explicitValue.length > 0
            ) {

                this.addCandidate(
                    context,
                    element,
                    dataField,
                    explicitValue,
                    EVIDENCE_RANK
                        .DATA_FIELD_VALUE,
                );
            }
        }


        /**
         * Generic pattern:
         *
         * <div
         *   class="temperature"
         *   data-value="27">
         */
        if (
            dataField === undefined
            && dataValue !== undefined
        ) {

            const semanticIdentifier =
                this.getBestSemanticIdentifier(
                    element,
                );


            if (
                semanticIdentifier
                !== undefined
            ) {

                this.addCandidate(
                    context,
                    element,
                    semanticIdentifier.key,
                    dataValue,
                    EVIDENCE_RANK
                        .DATA_VALUE_WITH_IDENTIFIER,
                );
            }
        }


        const attributes =
            element.attr();


        if (
            attributes === undefined
        ) {

            return;
        }


        for (
            const [
                attributeName,
                attributeValue,
            ]
            of Object.entries(
                attributes,
            )
        ) {

            if (
                !attributeName
                    .toLowerCase()
                    .startsWith(
                        'data-',
                    )
            ) {

                continue;
            }


            const rawDataKey =
                attributeName.slice(
                    5,
                );


            if (
                this.isControlDataKey(
                    rawDataKey,
                )
            ) {

                continue;
            }


            if (
                !this.isSemanticIdentifier(
                    rawDataKey,
                )
            ) {

                continue;
            }


            const normalizedValue =
                this.normalizeText(
                    attributeValue,
                );


            if (
                normalizedValue.length === 0
            ) {

                continue;
            }


            this.addCandidate(
                context,
                element,
                rawDataKey,
                normalizedValue,
                EVIDENCE_RANK
                    .DATA_ATTRIBUTE,
            );
        }
    }


    private discoverDefinitionPair(
        context:
            DiscoveryContext,

        element:
            DomSelection,
    ): void {

        if (
            this.getTagName(
                element,
            )
            !== 'dt'
        ) {

            return;
        }


        const key =
            this.normalizeText(
                element.text(),
            );


        if (
            !this.isLabelLike(
                key,
            )
        ) {

            return;
        }


        let next =
            element.next();


        /**
         * HTML permits one dt followed
         * by multiple dd values.
         */
        while (
            next.length > 0
            && this.getTagName(
                next,
            ) === 'dd'
        ) {

            if (
                this.isWithinScan(
                    context,
                    next,
                )
                && !this.isExcludedElement(
                    context.$,
                    next,
                )
            ) {

                if (
    this.shouldSuppressPrimaryValue(
        next,
    )
) {

    next =
        next.next();

    continue;
}

                const value =
                    this.extractPrimaryValue(
                        next,
                    );


                if (
                    value.length > 0
                ) {

                    this.addCandidate(
                        context,
                        next,
                        key,
                        value,
                        EVIDENCE_RANK
                            .DEFINITION_PAIR,
                    );
                }
            }


            next =
                next.next();
        }
    }


    private discoverTablePair(
        context:
            DiscoveryContext,

        element:
            DomSelection,
    ): void {

        if (
            this.getTagName(
                element,
            )
            !== 'tr'
        ) {

            return;
        }


        const cells =
            element
                .children(
                    'th, td',
                )
                .toArray()
                .map(
                    (
                        node,
                    ) =>
                        context.$(
                            node,
                        ),
                )
                .filter(
                    (
                        cell,
                    ) =>
                        this.isWithinScan(
                            context,
                            cell,
                        )
                        && !this.isExcludedElement(
                            context.$,
                            cell,
                        ),
                );


        if (
            cells.length < 2
        ) {

            return;
        }


        const headerCell =
            cells.find(
                (
                    cell,
                ) =>
                    this.getTagName(
                        cell,
                    ) === 'th',
            );


        /**
         * Common:
         *
         * <tr>
         *   <th>Location</th>
         *   <td>Hyderabad</td>
         * </tr>
         */
        if (
            headerCell !== undefined
        ) {

            const key =
                this.normalizeText(
                    headerCell.text(),
                );


            if (
                !this.isLabelLike(
                    key,
                )
            ) {

                return;
            }


            for (
                const cell
                of cells
            ) {

                if (
                    this.getTagName(
                        cell,
                    )
                    !== 'td'
                ) {

                    continue;
                }

                if (
    this.shouldSuppressPrimaryValue(
        cell,
    )
) {

    continue;
}


                const value =
                    this.extractPrimaryValue(
                        cell,
                    );


                if (
                    value.length === 0
                ) {

                    continue;
                }


                this.addCandidate(
                    context,
                    cell,
                    key,
                    value,
                    EVIDENCE_RANK
                        .TABLE_PAIR,
                );
            }


            return;
        }


        /**
         * Also support generic two-column
         * tables that use td/td instead
         * of th/td.
         */
        if (
            cells.length === 2
        ) {

            const key =
                this.normalizeText(
                    cells[0]
                        .text(),
                );

                if (
    this.shouldSuppressPrimaryValue(
        cells[1],
    )
) {

    return;
}


            const value =
                this.extractPrimaryValue(
                    cells[1],
                );


            if (
                this.isLabelLike(
                    key,
                )
                && value.length > 0
            ) {

                this.addCandidate(
                    context,
                    cells[1],
                    key,
                    value,
                    EVIDENCE_RANK
                        .TABLE_PAIR,
                );
            }
        }
    }


    private discoverLabelPair(
        context:
            DiscoveryContext,

        element:
            DomSelection,
    ): void {

        if (
            this.getTagName(
                element,
            )
            !== 'label'
        ) {

            return;
        }


        const labelClone =
            element.clone();


        labelClone
            .find(
                'input, textarea, select, output',
            )
            .remove();


        const key =
            this.normalizeText(
                labelClone.text(),
            );


        if (
            !this.isLabelLike(
                key,
            )
        ) {

            return;
        }


        let target:
            DomSelection
            | undefined;


        const forId =
            element.attr(
                'for',
            );


        if (
            forId !== undefined
            && forId.trim().length > 0
        ) {

            const found =
                context.$(
                    `[id="${this.escapeAttributeValue(
                        forId,
                    )}"]`,
                )
                    .first();


            if (
                found.length > 0
            ) {

                target =
                    found;
            }
        }


        if (
            target === undefined
        ) {

            const nested =
                element
                    .find(
                        'input, textarea, select, output',
                    )
                    .first();


            if (
                nested.length > 0
            ) {

                target =
                    nested;
            }
        }


        if (
            target === undefined
            || !this.isWithinScan(
                context,
                target,
            )
            || this.isExcludedElement(
                context.$,
                target,
            )
        ) {

            return;
        }

        if (
    this.shouldSuppressPrimaryValue(
        target,
    )
) {

    return;
}

        const value =
            this.extractPrimaryValue(
                target,
            );


        if (
            value.length === 0
        ) {

            return;
        }


        this.addCandidate(
            context,
            target,
            key,
            value,
            EVIDENCE_RANK
                .LABEL_PAIR,
        );
    }


    private discoverSiblingPair(
        context:
            DiscoveryContext,

        parent:
            DomSelection,
    ): void {

        const parentTag =
            this.getTagName(
                parent,
            );


        if (
            SIBLING_PAIR_EXCLUDED_PARENTS
                .has(
                    parentTag,
                )
        ) {

            return;
        }


        const children =
            parent
                .children()
                .toArray()
                .map(
                    (
                        node,
                    ) =>
                        context.$(
                            node,
                        ),
                )
                .filter(
                    (
                        child,
                    ) =>
                        this.isWithinScan(
                            context,
                            child,
                        )
                        && !this.isExcludedElement(
                            context.$,
                            child,
                        ),
                );


        if (
            children.length !== 2
        ) {

            return;
        }


        const labelElement =
            children[0];


        const valueElement =
            children[1];


        const labelTag =
            this.getTagName(
                labelElement,
            );


        if (
            SIBLING_LABEL_EXCLUDED_TAGS
                .has(
                    labelTag,
                )
        ) {

            return;
        }


        const key =
            this.normalizeText(
                labelElement.text(),
            );


        if (
            !this.isLabelLike(
                key,
            )
        ) {

            return;
        }

        
        if (
    this.shouldSuppressPrimaryValue(
        valueElement,
    )
) {

    return;
}

        const value =
            this.extractPrimaryValue(
                valueElement,
            );


        if (
            value.length === 0
            || value === key
        ) {

            return;
        }


        this.addCandidate(
            context,
            valueElement,
            key,
            value,
            EVIDENCE_RANK
                .SIBLING_PAIR,
        );
    }


    private discoverDirectSemanticValue(
        context:
            DiscoveryContext,

        element:
            DomSelection,
    ): void {

        const tag =
            this.getTagName(
                element,
            );


        /**
         * These elements normally provide
         * labels rather than values.
         */
        if (
            tag === 'label'
            || tag === 'dt'
            || tag === 'th'
        ) {

            return;
        }


        const semanticIdentifier =
            this.getBestSemanticIdentifier(
                element,
            );


        if (
            semanticIdentifier
            === undefined
        ) {

            return;
        }


        if (
    this.shouldSuppressPrimaryValue(
        element,
    )
) {

    return;
}


const value =
    this.extractPrimaryValue(
        element,
    );


if (
    value.length === 0
) {

    return;
}


        this.addCandidate(
            context,
            element,
            semanticIdentifier.key,
            value,
            semanticIdentifier.rank,
        );
    }


    private discoverSemanticFallback(
        context:
            DiscoveryContext,

        element:
            DomSelection,
    ): void {

        /**
         * If the element already has a
         * semantic identifier, the normal
         * direct rule owns it.
         */
        if (
            this.getBestSemanticIdentifier(
                element,
            )
            !== undefined
        ) {

            return;
        }


        const tag =
            this.getTagName(
                element,
            );


        /**
         * Generic semantic HTML:
         *
         * <time datetime="...">
         */
        if (
            tag === 'time'
        ) {

            const datetime =
                this.normalizeText(
                    element.attr(
                        'datetime',
                    )
                    ?? '',
                );


            if (
                datetime.length > 0
            ) {

                this.addCandidate(
                    context,
                    element,
                    'datetime',
                    datetime,
                    EVIDENCE_RANK
                        .SEMANTIC_ATTRIBUTE_FALLBACK,
                );
            }


            return;
        }


        /**
         * Weak generic heading evidence.
         *
         * We deliberately emit h1/h2/h3,
         * not productName/articleTitle/etc.
         */
        if (
            tag === 'h1'
            || tag === 'h2'
            || tag === 'h3'
        ) {


            if (
    this.isLikelyContainer(
        element,
    )
) {

    return;
}


            const value =
                this.normalizeText(
                    element.text(),
                );


            if (
                value.length > 0
            ) {

                this.addCandidate(
                    context,
                    element,
                    tag,
                    value,
                    EVIDENCE_RANK
                        .HEADING_FALLBACK,
                );
            }
        }
    }


    private getBestSemanticIdentifier(
        element:
            DomSelection,
    ):
        | {
            key: string;
            rank: number;
        }
        | undefined {

        const id =
            element.attr(
                'id',
            );


        if (
            id !== undefined
            && this.isSemanticIdentifier(
                id,
            )
        ) {

            return {
                key:
                    this.normalizeKey(
                        id,
                    ),

                rank:
                    EVIDENCE_RANK.ID,
            };
        }


        const ariaLabel =
            element.attr(
                'aria-label',
            );


        if (
            ariaLabel !== undefined
            && this.isSemanticIdentifier(
                ariaLabel,
            )
        ) {

            return {
                key:
                    this.normalizeKey(
                        ariaLabel,
                    ),

                rank:
                    EVIDENCE_RANK
                        .ARIA_LABEL,
            };
        }


        const name =
            element.attr(
                'name',
            );


        if (
            name !== undefined
            && this.isSemanticIdentifier(
                name,
            )
        ) {

            return {
                key:
                    this.normalizeKey(
                        name,
                    ),

                rank:
                    EVIDENCE_RANK.NAME,
            };
        }


        const semanticClass =
            this.getBestSemanticClass(
                element,
            );


        if (
            semanticClass !== undefined
        ) {

            return {
                key:
                    semanticClass.normalized,

                rank:
                    EVIDENCE_RANK.CLASS,
            };
        }


        return undefined;
    }


    private getBestSemanticClass(
        element:
            DomSelection,
    ):
        | {
            raw: string;
            normalized: string;
        }
        | undefined {

        const classAttribute =
            element.attr(
                'class',
            );


        if (
            classAttribute === undefined
        ) {

            return undefined;
        }


        const semanticClasses =
            classAttribute
                .split(
                    /\s+/u,
                )
                .map(
                    (
                        raw,
                    ) => ({
                        raw:
                            raw.trim(),

                        normalized:
                            this.normalizeKey(
                                raw,
                            ),
                    }),
                )
                .filter(
                    (
                        item,
                    ) =>
                        item.raw.length > 0
                        && this.isSemanticIdentifier(
                            item.raw,
                        ),
                );


        if (
            semanticClasses.length === 0
        ) {

            return undefined;
        }


        /**
         * Prefer descriptive multi-part
         * identifiers over short generic
         * single-word classes.
         *
         * This is structural ordering only.
         */
        semanticClasses.sort(
            (
                left,
                right,
            ) => {

                const leftHasSeparator =
                    /[-_]/u
                        .test(
                            left.raw,
                        )
                        ? 1
                        : 0;


                const rightHasSeparator =
                    /[-_]/u
                        .test(
                            right.raw,
                        )
                        ? 1
                        : 0;


                if (
                    leftHasSeparator
                    !== rightHasSeparator
                ) {

                    return (
                        rightHasSeparator
                        - leftHasSeparator
                    );
                }


                const leftParts =
                    left
                        .normalized
                        .split(
                            '-',
                        )
                        .length;


                const rightParts =
                    right
                        .normalized
                        .split(
                            '-',
                        )
                        .length;


                if (
                    leftParts
                    !== rightParts
                ) {

                    return (
                        rightParts
                        - leftParts
                    );
                }


                return (
                    right
                        .normalized
                        .length
                    - left
                        .normalized
                        .length
                );
            },
        );


        return semanticClasses[0];
    }


    private addCandidate(
        context:
            DiscoveryContext,

        element:
            DomSelection,

        rawKey:
            string,

        rawValue:
            string,

        rank:
            number,
    ): void {

        if (
            !this.isSemanticIdentifier(
                rawKey,
            )
        ) {

            return;
        }


        const key =
            this.normalizeKey(
                rawKey,
            );


        const value =
            this.normalizeText(
                rawValue,
            );


        if (
            key.length === 0
            || value.length === 0
        ) {

            return;
        }


        if (
            value.length
            > LIMITS.maxValueLength
        ) {

            this.pushWarning(
                context.warnings,
                context.warningCodes,
                'DOM_VALUE_LIMIT_SKIPPED',
                `DOM values longer than ${LIMITS.maxValueLength} characters are skipped.`,
            );


            return;
        }


        const path =
            this.generatePath(
                context.$,
                element,
            );


        if (
            path.length === 0
        ) {

            return;
        }


        /**
         * Deduplicate by:
         *
         * same DOM element/path
         * +
         * same normalized value
         *
         * If several semantic mechanisms
         * describe the same value, keep
         * the strongest structural evidence.
         */
        const dedupeKey =
            `${path}\u0000${value}`;


        const existing =
            context
                .candidates
                .get(
                    dedupeKey,
                );


        if (
            existing !== undefined
            && existing.rank >= rank
        ) {

            return;
        }


        const order =
            existing?.order
            ?? context.nextOrder++;


        context
            .candidates
            .set(
                dedupeKey,
                {
                    key,
                    value,
                    path,
                    rank,
                    order,
                },
            );
    }


    private extractPrimaryValue(
        element:
            DomSelection,
    ): string {

        const tag =
            this.getTagName(
                element,
            );


        if (
            tag === 'a'
        ) {

            const href =
                this.normalizeText(
                    element.attr(
                        'href',
                    )
                    ?? '',
                );


            if (
                this.isUsefulHref(
                    href,
                )
            ) {

                return href;
            }
        }


        if (
            tag === 'time'
        ) {

            const datetime =
                this.normalizeText(
                    element.attr(
                        'datetime',
                    )
                    ?? '',
                );


            if (
                datetime.length > 0
            ) {

                return datetime;
            }
        }


        if (
            tag === 'input'
        ) {

            const type =
                (
                    element.attr(
                        'type',
                    )
                    ?? 'text'
                )
                    .toLowerCase();


            if (
                type === 'checkbox'
                || type === 'radio'
            ) {

                return element.is(
                    '[checked]',
                )
                    ? 'true'
                    : 'false';
            }


            return this.normalizeText(
                element.attr(
                    'value',
                )
                ?? '',
            );
        }


        if (
            tag === 'textarea'
            || tag === 'output'
        ) {

            return this.normalizeText(
                element.text(),
            );
        }


        if (
            tag === 'select'
        ) {

            let option =
                element
                    .find(
                        'option[selected]',
                    )
                    .first();


            if (
                option.length === 0
            ) {

                option =
                    element
                        .find(
                            'option',
                        )
                        .first();
            }


            if (
                option.length === 0
            ) {

                return '';
            }


            const optionValue =
                this.normalizeText(
                    option.attr(
                        'value',
                    )
                    ?? '',
                );


            if (
                optionValue.length > 0
            ) {

                return optionValue;
            }


            return this.normalizeText(
                option.text(),
            );
        }


        return this.normalizeText(
            element.text(),
        );
    }


    private isLikelyContainer(
    element:
        DomSelection,
): boolean {

    const descendantCount =
        element
            .find(
                '*',
            )
            .length;


    const childElementCount =
        element
            .children()
            .length;


    const hasDirectText =
        element
            .contents()
            .toArray()
            .some(
                (
                    node,
                ) => {

                    if (
                        node.type
                        !== 'text'
                    ) {

                        return false;
                    }


                    const data =
                        'data' in node
                            ? node.data
                            : '';


                    if (
                        typeof data
                        !== 'string'
                    ) {

                        return false;
                    }


                    return (
                        this
                            .normalizeText(
                                data,
                            )
                            .length
                        > 0
                    );
                },
            );


    const normalizedText =
        this.normalizeText(
            element.text(),
        );


    /**
     * Large nested DOM trees are usually
     * structural containers rather than
     * individual values.
     */
    if (
        descendantCount
        > CONTAINER_LIMITS
            .maxDescendantElements
    ) {

        return true;
    }


    /**
     * Preserve long legitimate leaf text
     * such as descriptions/articles.
     *
     * Only reject long aggregate text when
     * it is composed from nested structure.
     */
    if (
        normalizedText.length
            > CONTAINER_LIMITS
                .maxAggregateTextLength
        && descendantCount > 1
    ) {

        return true;
    }


    /**
     * One nested value is valid:
     *
     * <div id="employee-count">
     *   <span>1250</span>
     * </div>
     *
     * Multiple child branches with no direct
     * text are much more likely to represent
     * a structural wrapper.
     */
    if (
        !hasDirectText
        && childElementCount
            > CONTAINER_LIMITS
                .maxChildBranchesWithoutDirectText
    ) {

        return true;
    }


    return false;
}


    private isPrimaryValueTextDerived(
    element:
        DomSelection,
): boolean {

    const tag =
        this.getTagName(
            element,
        );


    if (
        tag === 'a'
    ) {

        const href =
            this.normalizeText(
                element.attr(
                    'href',
                )
                ?? '',
            );


        if (
            this.isUsefulHref(
                href,
            )
        ) {

            return false;
        }
    }


    if (
        tag === 'time'
    ) {

        const datetime =
            this.normalizeText(
                element.attr(
                    'datetime',
                )
                ?? '',
            );


        if (
            datetime.length > 0
        ) {

            return false;
        }
    }


    if (
        tag === 'input'
        || tag === 'select'
    ) {

        return false;
    }


    return true;
}

    private shouldSuppressPrimaryValue(
    element:
        DomSelection,
): boolean {

    return (
        this.isPrimaryValueTextDerived(
            element,
        )
        && this.isLikelyContainer(
            element,
        )
    );
}

    private isExcludedElement(
        $:
            CheerioRoot,

        element:
            DomSelection,
    ): boolean {

        const tag =
            this.getTagName(
                element,
            );


        if (
            EXCLUDED_TAGS.has(
                tag,
            )
        ) {

            return true;
        }


        if (
            tag === 'input'
        ) {

            const type =
                (
                    element.attr(
                        'type',
                    )
                    ?? ''
                )
                    .toLowerCase();


            if (
                type === 'hidden'
                || type === 'password'
                || type === 'file'
            ) {

                return true;
            }
        }


        if (
            element.is(
                '[hidden]',
            )
        ) {

            return true;
        }


        if (
            (
                element.attr(
                    'aria-hidden',
                )
                ?? ''
            )
                .toLowerCase()
            === 'true'
        ) {

            return true;
        }


        if (
            this.isHiddenStyle(
                element.attr(
                    'style',
                )
                ?? '',
            )
        ) {

            return true;
        }


        const ancestors =
            element
                .parents()
                .toArray();


        for (
            const ancestorNode
            of ancestors
        ) {

            const ancestor =
                $(
                    ancestorNode,
                );


            const ancestorTag =
                this.getTagName(
                    ancestor,
                );


            if (
                EXCLUDED_TAGS.has(
                    ancestorTag,
                )
            ) {

                return true;
            }


            if (
                ancestor.is(
                    '[hidden]',
                )
            ) {

                return true;
            }


            if (
                (
                    ancestor.attr(
                        'aria-hidden',
                    )
                    ?? ''
                )
                    .toLowerCase()
                === 'true'
            ) {

                return true;
            }


            if (
                this.isHiddenStyle(
                    ancestor.attr(
                        'style',
                    )
                    ?? '',
                )
            ) {

                return true;
            }
        }


        return false;
    }


    private isWithinScan(
        context:
            DiscoveryContext,

        element:
            DomSelection,
    ): boolean {

        const node =
            element.get(
                0,
            );


        if (
            node === undefined
        ) {

            return false;
        }


        return context
            .scannedNodes
            .has(
                node as object,
            );
    }


    private isSemanticIdentifier(
        rawIdentifier:
            string,
    ): boolean {

        const trimmed =
            rawIdentifier.trim();


        if (
            trimmed.length === 0
            || trimmed.length > 120
        ) {

            return false;
        }


        /**
         * Allow natural labels ending in ":"
         * but reject framework/responsive forms
         * such as md:text-lg.
         */
        const withoutTrailingColon =
            trimmed.replace(
                /:+$/u,
                '',
            );


        if (
            withoutTrailingColon
                .includes(
                    ':',
                )
        ) {

            return false;
        }


        if (
            this.isGeneratedIdentifier(
                withoutTrailingColon,
            )
        ) {

            return false;
        }


        const normalized =
            this.normalizeKey(
                withoutTrailingColon,
            );


        if (
            normalized.length === 0
            || normalized.length > 100
        ) {

            return false;
        }


        /**
         * Pure numbers do not provide
         * useful semantic field identity.
         */
        if (
            !/\p{L}/u
                .test(
                    normalized,
                )
        ) {

            return false;
        }


        if (
            NON_SEMANTIC_IDENTIFIERS
                .has(
                    normalized,
                )
        ) {

            return false;
        }


        if (
            this.isUtilityIdentifier(
                normalized,
            )
        ) {

            return false;
        }


        return true;
    }


    private isUtilityIdentifier(
        normalized:
            string,
    ): boolean {

        if (
            UTILITY_IDENTIFIERS.has(
                normalized,
            )
        ) {

            return true;
        }


        const utilityPatterns =
            [
                /^(?:m[trblxy]?|p[trblxy]?)-\d/u,

                /^(?:w|h|min-w|max-w|min-h|max-h)-/u,

                /^(?:bg|text|font|border|rounded|shadow|ring|opacity|z)-/u,

                /^(?:items|justify|self|place|gap|space|overflow|object|cursor)-/u,

                /^(?:transition|duration|ease|transform|scale|rotate|translate)-/u,

                /^(?:top|right|bottom|left)-/u,

                /^(?:row|col)-\d/u,

                /^(?:sm|md|lg|xl|2xl)-/u,
            ];


        return utilityPatterns.some(
            (
                pattern,
            ) =>
                pattern.test(
                    normalized,
                ),
        );
    }


    private isGeneratedIdentifier(
        raw:
            string,
    ): boolean {

        const trimmed =
            raw.trim();


        /**
         * Examples:
         *
         * _123abc
         * _8df92
         */
        if (
            /^_[a-z0-9]*\d[a-z0-9]*$/iu
                .test(
                    trimmed,
                )
        ) {

            return true;
        }


        /**
         * Common generated CSS families.
         */
        if (
            /^(?:css|jsx|sc)-[a-z0-9_-]+$/iu
                .test(
                    trimmed,
                )
        ) {

            return true;
        }


        /**
         * Reject short one-letter hash-like
         * classes such as:
         *
         * g-xyz
         *
         * while avoiding rejection of more
         * descriptive values such as x-coordinate.
         */
        if (
            /^[a-z]-[bcdfghjklmnpqrstvwxyz0-9]{3,}$/iu
                .test(
                    trimmed,
                )
        ) {

            return true;
        }


        return false;
    }


    private isControlDataKey(
        rawKey:
            string,
    ): boolean {

        const normalized =
            this.normalizeKey(
                rawKey,
            );


        if (
            normalized === 'field'
            || normalized === 'value'
        ) {

            return true;
        }


        const exactControls =
            new Set<string>(
                [
                    'test',
                    'testid',
                    'test-id',

                    'qa',
                    'cy',

                    'reactid',
                    'reactroot',

                    'state',
                    'slot',

                    'component',
                    'controller',

                    'action',
                    'target',

                    'turbo',
                ],
            );


        if (
            exactControls.has(
                normalized,
            )
        ) {

            return true;
        }


        return (
            normalized
                .startsWith(
                    'radix-',
                )
            || normalized
                .startsWith(
                    'headlessui-',
                )
        );
    }


    private isLabelLike(
        text:
            string,
    ): boolean {

        const normalized =
            this.normalizeText(
                text,
            );


        if (
            normalized.length === 0
            || normalized.length
                > LIMITS.maxLabelLength
        ) {

            return false;
        }


        const words =
            normalized
                .split(
                    /\s+/u,
                );


        if (
            words.length
            > LIMITS.maxLabelWords
        ) {

            return false;
        }


        return this.isSemanticIdentifier(
            normalized,
        );
    }


    private generatePath(
        $:
            CheerioRoot,

        element:
            DomSelection,
    ): string {

        const id =
            element.attr(
                'id',
            );


        if (
            id !== undefined
            && id.trim().length > 0
            && !this.isGeneratedIdentifier(
                id,
            )
        ) {

            const selector =
                this.createIdSelector(
                    id,
                );


            if (
                $(
                    selector,
                )
                    .length
                === 1
            ) {

                return selector;
            }
        }


        const bestClass =
            this.getBestSemanticClass(
                element,
            );


        if (
            bestClass !== undefined
            && this.isSimpleCssIdentifier(
                bestClass.raw,
            )
        ) {

            const classSelector =
                `.${bestClass.raw}`;


            if (
                $(
                    classSelector,
                )
                    .length
                === 1
            ) {

                return classSelector;
            }
        }


        const segments:
            string[] =
            [];


        let current =
            element;


        for (
            let depth = 0;
            depth < LIMITS.maxSelectorDepth;
            depth += 1
        ) {

            if (
                current.length === 0
            ) {

                break;
            }


            const tag =
                this.getTagName(
                    current,
                );


            if (
                tag.length === 0
                || tag === 'html'
            ) {

                break;
            }


            if (
                tag === 'body'
            ) {

                segments.unshift(
                    'body',
                );


                break;
            }


            const currentId =
                current.attr(
                    'id',
                );


            if (
                currentId !== undefined
                && currentId.trim().length > 0
                && !this.isGeneratedIdentifier(
                    currentId,
                )
            ) {

                const idSelector =
                    this.createIdSelector(
                        currentId,
                    );


                if (
                    $(
                        idSelector,
                    )
                        .length
                    === 1
                ) {

                    segments.unshift(
                        idSelector,
                    );


                    break;
                }
            }


            let segment =
                tag;


            const semanticClass =
                this.getBestSemanticClass(
                    current,
                );


            if (
                semanticClass !== undefined
                && this.isSimpleCssIdentifier(
                    semanticClass.raw,
                )
            ) {

                segment +=
                    `.${semanticClass.raw}`;
            }


            const parent =
                current.parent();


            if (
                parent.length > 0
            ) {

                const sameTagSiblings =
                    parent.children(
                        tag,
                    );


                if (
                    sameTagSiblings.length
                    > 1
                ) {

                    const currentNode =
                        current.get(
                            0,
                        );


                    const position =
                        sameTagSiblings
                            .toArray()
                            .findIndex(
                                (
                                    node,
                                ) =>
                                    node
                                    === currentNode,
                            )
                        + 1;


                    if (
                        position > 0
                    ) {

                        segment +=
                            `:nth-of-type(${position})`;
                    }
                }
            }


            segments.unshift(
                segment,
            );


            current =
                parent;
        }


        return segments.join(
            ' > ',
        );
    }


    private createIdSelector(
        id:
            string,
    ): string {

        if (
            this.isSimpleCssIdentifier(
                id,
            )
        ) {

            return `#${id}`;
        }


        return (
            `[id="${this.escapeAttributeValue(
                id,
            )}"]`
        );
    }


    private isSimpleCssIdentifier(
        value:
            string,
    ): boolean {

        return /^[A-Za-z_][A-Za-z0-9_-]*$/u
            .test(
                value,
            );
    }


    private escapeAttributeValue(
        value:
            string,
    ): string {

        return value
            .replace(
                /\\/gu,
                '\\\\',
            )
            .replace(
                /"/gu,
                '\\"',
            );
    }


    private normalizeKey(
        value:
            string,
    ): string {

        return value
            .trim()

            /**
             * Remove normal label punctuation:
             * "Launch Date:" → "Launch Date"
             */
            .replace(
                /:+$/u,
                '',
            )

            /**
             * camelCase → camel-Case
             */
            .replace(
                /([a-z0-9])([A-Z])/gu,
                '$1-$2',
            )

            /**
             * Spaces / underscores → hyphen
             */
            .replace(
                /[_\s]+/gu,
                '-',
            )

            /**
             * Preserve Unicode letters/numbers.
             */
            .replace(
                /[^\p{L}\p{N}-]+/gu,
                '-',
            )

            .replace(
                /-+/gu,
                '-',
            )

            .replace(
                /^-|-$|/gu,
                '',
            )

            .toLowerCase();
    }


    private normalizeText(
        value:
            string,
    ): string {

        return value
            .replace(
                /[\s\u00A0]+/gu,
                ' ',
            )
            .trim();
    }


    private getTagName(
        element:
            DomSelection,
    ): string {

        const tagName =
            element.prop(
                'tagName',
            );


        return typeof tagName === 'string'
            ? tagName.toLowerCase()
            : '';
    }


    private isUsefulHref(
        href:
            string,
    ): boolean {

        const normalized =
            href.trim();


        if (
            normalized.length === 0
            || normalized === '#'
        ) {

            return false;
        }


        if (
            normalized
                .toLowerCase()
                .startsWith(
                    'javascript:',
                )
        ) {

            return false;
        }


        return true;
    }


    private isHiddenStyle(
        style:
            string,
    ): boolean {

        const normalized =
            style.toLowerCase();


        return (
            /display\s*:\s*none/u
                .test(
                    normalized,
                )
            || /visibility\s*:\s*hidden/u
                .test(
                    normalized,
                )
        );
    }


    private getHeader(
        input:
            ParserInput,

        headerName:
            string,
    ): string | undefined {

        const headers =
            input.envelope.headers as Record<
                string,
                string | string[] | undefined
            >;

        const wanted =
            headerName
                .toLowerCase();


        for (
            const [
                key,
                value,
            ]
            of Object.entries(
                headers,
            )
        ) {

            if (
                key.toLowerCase()
                !== wanted
            ) {

                continue;
            }


            if (
                Array.isArray(
                    value,
                )
            ) {

                return value.join(
                    ', ',
                );
            }


            return value;
        }


        return undefined;
    }


    private bodyToString(
        input:
            ParserInput,
    ): string {

        const rawBody =
            input
                .envelope
                .rawBody;


        if (
            rawBody === undefined
            || rawBody === null
        ) {

            return '';
        }


        if (
            typeof rawBody === 'string'
        ) {

            return rawBody;
        }


    return rawBody
        .toString(
            'utf8',
        );
}


    private pushWarning(
        warnings:
            ExtractorOutput['warnings'],

        warningCodes:
            Set<string>,

        code:
            string,

        message:
            string,
    ): void {

        if (
            warningCodes.has(
                code,
            )
        ) {

            return;
        }


        warningCodes.add(
            code,
        );


        warnings.push(
            {
                extractorId:
                    this.id,

                code,

                message,
            },
        );
    }
}
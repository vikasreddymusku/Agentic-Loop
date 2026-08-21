import {
    describe,
    expect,
    it,
} from 'vitest';

import type {
    ParserInput,
} from '../../core/contracts/parser/parser-input.js';

import {
    DomExtractor,
} from './dom.extractor.js';


type RequestedFields =
    ParserInput[
        'job'
    ][
        'requestedFields'
    ];


const createInput =
    (
        html:
            string,

        options:
            {
                contentType?: string;

                requestedFields?:
                    RequestedFields;

                bodyTruncated?: boolean;
            } = {},
    ):
        ParserInput => {

        const headers:
            Record<
                string,
                string
            > =
            {};


        if (
            options.contentType
            !== undefined
        ) {

            headers[
                'content-type'
            ] =
                options.contentType;
        }


        return {
            job: {
                requestedFields:
                    options.requestedFields
                    ?? [],
            } as ParserInput['job'],

            envelope: {
                requestedUrl:
                    'https://example.test/page',

                finalUrl:
                    'https://example.test/page',

                redirects:
                    [],

                statusCode:
                    200,

                headers,

                rawBody:
                    Buffer.from(
                        html,
                        'utf8',
                    ),

                bodyBytes:
                    Buffer.byteLength(
                        html,
                        'utf8',
                    ),

                bodyTruncated:
                    options.bodyTruncated
                    ?? false,

                fetchDurationMs:
                    1,
            },
        } as ParserInput;
    };


describe(
    'DomExtractor',
    () => {

        it(
    'suppresses large multi-child semantic containers',
    async () => {

        const extractor =
            new DomExtractor();


        const children =
            Array.from(
                {
                    length:
                        12,
                },
                (
                    _,
                    index,
                ) =>
                    `<span>Value ${index}</span>`,
            )
                .join(
                    '',
                );


        const result =
            await extractor.extract(
                createInput(
                    `
                    <div class="catalog-section">
                        ${children}
                    </div>
                    `,
                ),
            );


        expect(
            result.discovered
                .some(
                    (
                        property,
                    ) =>
                        property.key
                        === 'catalog-section',
                ),
        )
            .toBe(
                false,
            );
    },
);


        it(
    'suppresses long aggregate text from nested containers',
    async () => {

        const extractor =
            new DomExtractor();


        const longText =
            'A'.repeat(
                600,
            );


        const result =
            await extractor.extract(
                createInput(
                    `
                    <div id="information-section">
                        ${longText}

                        <span>Nested value</span>
                        <span>Another value</span>
                    </div>
                    `,
                ),
            );


        expect(
            result.discovered
                .some(
                    (
                        property,
                    ) =>
                        property.key
                        === 'information-section',
                ),
        )
            .toBe(
                false,
            );
    },
);


        it(
    'suppresses no-direct-text multi-branch semantic wrappers',
    async () => {

        const extractor =
            new DomExtractor();


        const result =
            await extractor.extract(
                createInput(
                    `
                    <div class="profile-summary">
                        <span>Alpha</span>
                        <span>Beta</span>
                    </div>
                    `,
                ),
            );


        expect(
            result.discovered
                .some(
                    (
                        property,
                    ) =>
                        property.key
                        === 'profile-summary',
                ),
        )
            .toBe(
                false,
            );
    },
);


        it(
    'preserves one-child semantic wrappers',
    async () => {

        const extractor =
            new DomExtractor();


        const result =
            await extractor.extract(
                createInput(
                    `
                    <div id="employee-count">
                        <span>1250</span>
                    </div>
                    `,
                ),
            );


        expect(
            result.discovered,
        )
            .toContainEqual(
                expect.objectContaining(
                    {
                        key:
                            'employee-count',

                        value:
                            '1250',

                        source:
                            'DOM',
                    },
                ),
            );
    },
);

        it(
    'preserves semantic leaf values',
    async () => {

        const extractor =
            new DomExtractor();


        const result =
            await extractor.extract(
                createInput(
                    `
                    <span id="warranty-duration">
                        2 years
                    </span>
                    `,
                ),
            );


        expect(
            result.discovered,
        )
            .toContainEqual(
                expect.objectContaining(
                    {
                        key:
                            'warranty-duration',

                        value:
                            '2 years',
                    },
                ),
            );
    },
);


        it(
    'preserves definition-list and table relationships',
    async () => {

        const extractor =
            new DomExtractor();


        const result =
            await extractor.extract(
                createInput(
                    `
                    <dl>
                        <dt>Location</dt>
                        <dd>Hyderabad</dd>
                    </dl>

                    <table>
                        <tr>
                            <th>RAM</th>
                            <td>
                                <span>12 GB</span>
                            </td>
                        </tr>
                    </table>
                    `,
                ),
            );


        expect(
            result.discovered,
        )
            .toContainEqual(
                expect.objectContaining(
                    {
                        key:
                            'location',

                        value:
                            'Hyderabad',
                    },
                ),
            );


        expect(
            result.discovered,
        )
            .toContainEqual(
                expect.objectContaining(
                    {
                        key:
                            'ram',

                        value:
                            '12 GB',
                    },
                ),
            );
    },
);


        it(
    'preserves explicit data attributes even on container-like elements',
    async () => {

        const extractor =
            new DomExtractor();


        const children =
            Array.from(
                {
                    length:
                        12,
                },
                (
                    _,
                    index,
                ) =>
                    `<span>Child ${index}</span>`,
            )
                .join(
                    '',
                );


        const result =
            await extractor.extract(
                createInput(
                    `
                    <div data-temperature="27">
                        ${children}
                    </div>
                    `,
                ),
            );


        expect(
            result.discovered,
        )
            .toContainEqual(
                expect.objectContaining(
                    {
                        key:
                            'temperature',

                        value:
                            '27',

                        source:
                            'DOM',
                    },
                ),
            );
    },
);


        it(
            'supports HTML or missing content type and rejects explicit non-HTML content',
            () => {

                const extractor =
                    new DomExtractor();


                expect(
                    extractor.supports(
                        createInput(
                            '<div>value</div>',
                        ),
                    ),
                )
                    .toBe(
                        true,
                    );


                expect(
                    extractor.supports(
                        createInput(
                            '<div>value</div>',
                            {
                                contentType:
                                    'text/html; charset=utf-8',
                            },
                        ),
                    ),
                )
                    .toBe(
                        true,
                    );


                expect(
                    extractor.supports(
                        createInput(
                            '{"value":1}',
                            {
                                contentType:
                                    'application/json',
                            },
                        ),
                    ),
                )
                    .toBe(
                        false,
                    );
            },
        );


        it(
    'does not treat headings as sibling labels',
    async () => {

        const extractor =
            new DomExtractor();


        const result =
            await extractor.extract(
                createInput(
                    `
                    <div>
                        <h2>Orbital Research Mission</h2>
                        <div>Astro Labs</div>
                    </div>
                    `,
                ),
            );


        expect(
            result.discovered,
        )
            .not
            .toContainEqual(
                expect.objectContaining(
                    {
                        key:
                            'orbital-research-mission',

                        value:
                            'Astro Labs',
                    },
                ),
            );


        expect(
            result.discovered,
        )
            .toContainEqual(
                expect.objectContaining(
                    {
                        key:
                            'h2',

                        value:
                            'Orbital Research Mission',
                    },
                ),
            );
    },
);


        it(
            'discovers values from semantic ids',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div id="employee-count">
                                1250
                            </div>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'employee-count',

                                value:
                                    '1250',

                                source:
                                    'DOM',

                                vocabulary:
                                    'OTHER',

                                extractorId:
                                    'dom',

                                path:
                                    '#employee-count',
                            },
                        ),
                    );
            },
        );


        it(
            'discovers values from semantic classes',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <span class="orbital-period">
                                88 days
                            </span>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'orbital-period',

                                value:
                                    '88 days',

                                path:
                                    '.orbital-period',

                                source:
                                    'DOM',
                            },
                        ),
                    );
            },
        );


        it(
            'discovers arbitrary data attributes without knowing field names',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div data-temperature="27"></div>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'temperature',

                                value:
                                    '27',

                                source:
                                    'DOM',
                            },
                        ),
                    );
            },
        );


        it(
            'discovers generic data-field and data-value pairs',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div
                                data-field="salary"
                                data-value="₹80,000">
                            </div>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'salary',

                                value:
                                    '₹80,000',
                            },
                        ),
                    );
            },
        );


        it(
            'discovers dt and dd relationships',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <dl>
                                <dt>Location</dt>
                                <dd>Hyderabad</dd>

                                <dt>Experience</dt>
                                <dd>3 Years</dd>
                            </dl>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'location',

                                value:
                                    'Hyderabad',
                            },
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'experience',

                                value:
                                    '3 Years',
                            },
                        ),
                    );
            },
        );


        it(
            'discovers table key value relationships',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <table>
                                <tr>
                                    <th>Atomic Number</th>
                                    <td>79</td>
                                </tr>

                                <tr>
                                    <th>Melting Point</th>
                                    <td>1064 °C</td>
                                </tr>
                            </table>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'atomic-number',

                                value:
                                    '79',
                            },
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'melting-point',

                                value:
                                    '1064 °C',
                            },
                        ),
                    );
            },
        );


        it(
            'discovers generic sibling label and value relationships',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div>
                                <span>
                                    Battery Capacity
                                </span>

                                <span>
                                    5000 mAh
                                </span>
                            </div>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'battery-capacity',

                                value:
                                    '5000 mAh',
                            },
                        ),
                    );
            },
        );


        it(
            'discovers label and form value relationships',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <label for="country">
                                Country
                            </label>

                            <input
                                id="country"
                                value="India">
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'country',

                                value:
                                    'India',

                                path:
                                    '#country',
                            },
                        ),
                    );
            },
        );


        it(
            'uses datetime as the canonical value for semantic time elements',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <time
                                class="publication-date"
                                datetime="2026-08-21">
                                August 21, 2026
                            </time>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'publication-date',

                                value:
                                    '2026-08-21',
                            },
                        ),
                    );
            },
        );


        it(
            'uses href as the canonical value for semantic anchor elements',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <a
                                class="company-website"
                                href="https://example.com">
                                Visit website
                            </a>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'company-website',

                                value:
                                    'https://example.com',
                            },
                        ),
                    );
            },
        );


        it(
            'discovers heading values using semantic identifiers',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <h1 id="article-title">
                                New spacecraft launched
                            </h1>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'article-title',

                                value:
                                    'New spacecraft launched',

                                path:
                                    '#article-title',
                            },
                        ),
                    );
            },
        );


        it(
            'is independent of requested fields',
            async () => {

                const extractor =
                    new DomExtractor();


                const html =
                    `
                    <div id="orbital-period">
                        88 days
                    </div>
                    `;


                const firstResult =
                    await extractor.extract(
                        createInput(
                            html,
                            {
                                requestedFields:
                                    [
                                        {
                                            name:
                                                'somethingCompletelyDifferent',

                                            type:
                                                'string',
                                        },
                                    ] as RequestedFields,
                            },
                        ),
                    );


                const secondResult =
                    await extractor.extract(
                        createInput(
                            html,
                            {
                                requestedFields:
                                    [
                                        {
                                            name:
                                                'anotherUnknownField',

                                            type:
                                                'number',
                                        },
                                    ] as RequestedFields,
                            },
                        ),
                    );


                expect(
                    firstResult,
                )
                    .toEqual(
                        secondResult,
                    );
            },
        );


        it(
            'preserves distinct values while suppressing duplicate evidence from the same element',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div
                                id="employee-count"
                                class="employee-count">
                                1250
                            </div>

                            <div class="employee-count">
                                1300
                            </div>
                            `,
                        ),
                    );


                const values =
                    result.discovered
                        .filter(
                            (
                                property,
                            ) =>
                                property.key
                                === 'employee-count',
                        )
                        .map(
                            (
                                property,
                            ) =>
                                property.value,
                        );


                expect(
                    values,
                )
                    .toContain(
                        '1250',
                    );


                expect(
                    values,
                )
                    .toContain(
                        '1300',
                    );


                expect(
                    values.filter(
                        (
                            value,
                        ) =>
                            value === '1250',
                    ),
                )
                    .toHaveLength(
                        1,
                    );
            },
        );


        it(
            'rejects utility and generated class identifiers',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div
                                class="
                                    flex
                                    mt-4
                                    bg-white
                                ">
                                1250
                            </div>

                            <div
                                class="
                                    _123abc
                                    g-xyz
                                ">
                                999
                            </div>
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toEqual(
                        [],
                    );
            },
        );


        it(
            'excludes script style template and svg content',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <script id="script-secret">
                                123
                            </script>

                            <style id="style-secret">
                                body {}
                            </style>

                            <template>
                                <div id="template-secret">
                                    456
                                </div>
                            </template>

                            <svg>
                                <text id="svg-secret">
                                    789
                                </text>
                            </svg>
                            `,
                        ),
                    );


                const keys =
                    result.discovered
                        .map(
                            (
                                property,
                            ) =>
                                property.key,
                        );


                expect(
                    keys,
                )
                    .not
                    .toContain(
                        'script-secret',
                    );


                expect(
                    keys,
                )
                    .not
                    .toContain(
                        'style-secret',
                    );


                expect(
                    keys,
                )
                    .not
                    .toContain(
                        'template-secret',
                    );


                expect(
                    keys,
                )
                    .not
                    .toContain(
                        'svg-secret',
                    );
            },
        );


        it(
            'excludes hidden and aria-hidden DOM content',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div
                                id="hidden-value"
                                hidden>
                                secret
                            </div>

                            <div
                                aria-hidden="true">

                                <span id="aria-secret">
                                    hidden
                                </span>
                            </div>

                            <div
                                id="visible-value">
                                visible
                            </div>
                            `,
                        ),
                    );


                const keys =
                    result.discovered
                        .map(
                            (
                                property,
                            ) =>
                                property.key,
                        );


                expect(
                    keys,
                )
                    .not
                    .toContain(
                        'hidden-value',
                    );


                expect(
                    keys,
                )
                    .not
                    .toContain(
                        'aria-secret',
                    );


                expect(
                    keys,
                )
                    .toContain(
                        'visible-value',
                    );
            },
        );


        it(
            'normalizes whitespace and limits snippets to 50 characters',
            async () => {

                const extractor =
                    new DomExtractor();


                const expectedValue =
                    (
                        'Universal DOM extraction '
                        + 'preserves the complete value '
                        + 'while keeping evidence snippets short.'
                    );


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div id="description-value">
                                Universal     DOM extraction

                                preserves the complete value
                                while keeping evidence snippets short.
                            </div>
                            `,
                        ),
                    );


                const property =
                    result.discovered
                        .find(
                            (
                                candidate,
                            ) =>
                                candidate.key
                                === 'description-value',
                        );


                expect(
                    property,
                )
                    .toBeDefined();


                expect(
                    property?.value,
                )
                    .toBe(
                        expectedValue,
                    );


                expect(
                    property?.snippet,
                )
                    .toBe(
                        expectedValue.slice(
                            0,
                            50,
                        ),
                    );


                expect(
                    property?.snippet
                        ?.length,
                )
                    .toBeLessThanOrEqual(
                        50,
                    );
            },
        );


        it(
            'handles malformed HTML without crashing',
            async () => {

                const extractor =
                    new DomExtractor();


                const result =
                    await extractor.extract(
                        createInput(
                            `
                            <div id="employee-count">
                                <span>
                                    1250
                            `,
                        ),
                    );


                expect(
                    result.discovered,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                key:
                                    'employee-count',

                                value:
                                    '1250',
                            },
                        ),
                    );
            },
        );


        it(
            'bounds the number of discovered properties and emits a warning',
            async () => {

                const extractor =
                    new DomExtractor();


                const html =
                    Array.from(
                        {
                            length:
                                600,
                        },
                        (
                            _,
                            index,
                        ) =>
                            (
                                `<div id="field-${index}">`
                                + `${index}`
                                + '</div>'
                            ),
                    )
                        .join(
                            '',
                        );


                const result =
                    await extractor.extract(
                        createInput(
                            html,
                        ),
                    );


                expect(
                    result.discovered.length,
                )
                    .toBeLessThanOrEqual(
                        500,
                    );


                expect(
                    result.warnings,
                )
                    .toContainEqual(
                        expect.objectContaining(
                            {
                                extractorId:
                                    'dom',

                                code:
                                    'DOM_PROPERTY_LIMIT_REACHED',
                            },
                        ),
                    );
            },
        );
    },
);
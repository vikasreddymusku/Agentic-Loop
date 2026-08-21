import {
    load,
} from 'cheerio';

import {
    PlaywrightRenderer,
} from '../browser/playwright-renderer.js';


const url =
    'https://www.amazon.in/';


const renderer =
    new PlaywrightRenderer();


console.log(
    '\n========================================',
);

console.log(
    'PLAYWRIGHT PUBLIC WEBSITE SMOKE TEST',
);

console.log(
    '========================================',
);

console.log(
    '\nTarget:',
    url,
);


/**
 * Render the real website in Chromium.
 *
 * No clicking.
 * No login.
 * No navigation beyond opening
 * the public homepage.
 */
const rendered =
    await renderer.render(
        url,
        {
            waitUntil:
                'domcontentloaded',

            settleTimeMs:
                2_000,

            timeoutMs:
                30_000,

            headless:
                true,
        },
    );


console.log(
    '\nFinal URL:',
    rendered.finalUrl,
);

console.log(
    'Page title:',
    rendered.title,
);

console.log(
    'Rendered HTML bytes:',
    Buffer.byteLength(
        rendered.html,
        'utf8',
    ),
);


const $ =
    load(
        rendered.html,
    );


/**
 * Remove content that is not useful
 * as human-readable page content.
 */
$(
    [
        'script',
        'style',
        'noscript',
        'template',
        'svg',
        'canvas',
    ].join(
        ', ',
    ),
)
    .remove();


function cleanText(
    value:
        string,
): string {

    return value
        .replace(
            /\s+/gu,
            ' ',
        )
        .trim();
}


function unique(
    values:
        string[],
): string[] {

    return [
        ...new Set(
            values,
        ),
    ];
}


/**
 * ------------------------------------------------
 * HEADINGS
 * ------------------------------------------------
 */
const headings:
    Array<{
        level: string;
        text: string;
    }> =
    [];


$(
    'h1, h2, h3, h4, h5, h6',
)
    .each(
        (
            _,
            element,
        ) => {

            const text =
                cleanText(
                    $(
                        element,
                    )
                        .text(),
                );


            if (
                text.length === 0
            ) {

                return;
            }


            headings.push(
                {
                    level:
                        element.tagName,

                    text,
                },
            );
        },
    );


/**
 * ------------------------------------------------
 * PARAGRAPHS
 * ------------------------------------------------
 */
const paragraphs:
    string[] =
    [];


$(
    'p',
)
    .each(
        (
            _,
            element,
        ) => {

            const text =
                cleanText(
                    $(
                        element,
                    )
                        .text(),
                );


            if (
                text.length > 0
            ) {

                paragraphs.push(
                    text,
                );
            }
        },
    );


/**
 * ------------------------------------------------
 * LINKS
 * ------------------------------------------------
 */
const links:
    Array<{
        text: string;
        href: string;
    }> =
    [];


$(
    'a',
)
    .each(
        (
            _,
            element,
        ) => {

            const text =
                cleanText(
                    $(
                        element,
                    )
                        .text(),
                );


            const href =
                cleanText(
                    $(
                        element,
                    )
                        .attr(
                            'href',
                        )
                    ?? '',
                );


            if (
                text.length === 0
                && href.length === 0
            ) {

                return;
            }


            links.push(
                {
                    text,
                    href,
                },
            );
        },
    );


/**
 * ------------------------------------------------
 * BUTTONS
 * ------------------------------------------------
 *
 * We ONLY read them.
 * Nothing is clicked.
 */
const buttons:
    string[] =
    [];


$(
    'button',
)
    .each(
        (
            _,
            element,
        ) => {

            const text =
                cleanText(
                    $(
                        element,
                    )
                        .text(),
                );


            if (
                text.length > 0
            ) {

                buttons.push(
                    text,
                );
            }
        },
    );


/**
 * ------------------------------------------------
 * LIST ITEMS
 * ------------------------------------------------
 */
const listItems:
    string[] =
    [];


$(
    'li',
)
    .each(
        (
            _,
            element,
        ) => {

            const text =
                cleanText(
                    $(
                        element,
                    )
                        .text(),
                );


            if (
                text.length > 0
            ) {

                listItems.push(
                    text,
                );
            }
        },
    );


/**
 * ------------------------------------------------
 * IMAGES
 * ------------------------------------------------
 */
const images:
    Array<{
        alt: string;
        src: string;
    }> =
    [];


$(
    'img',
)
    .each(
        (
            _,
            element,
        ) => {

            const src =
                cleanText(
                    $(
                        element,
                    )
                        .attr(
                            'src',
                        )
                    ?? '',
                );


            const alt =
                cleanText(
                    $(
                        element,
                    )
                        .attr(
                            'alt',
                        )
                    ?? '',
                );


            if (
                src.length === 0
                && alt.length === 0
            ) {

                return;
            }


            images.push(
                {
                    alt,
                    src,
                },
            );
        },
    );


/**
 * ------------------------------------------------
 * GENERIC LABELED / SEMANTIC TEXT
 * ------------------------------------------------
 *
 * Reads useful leaf-level content from
 * div/span/strong/label elements without
 * knowing anything about the website.
 */
const semanticText:
    string[] =
    [];


$(
    [
        'span',
        'strong',
        'label',
        'small',
    ].join(
        ', ',
    ),
)
    .each(
        (
            _,
            element,
        ) => {

            const text =
                cleanText(
                    $(
                        element,
                    )
                        .text(),
                );


            if (
                text.length === 0
                || text.length > 300
            ) {

                return;
            }


            semanticText.push(
                text,
            );
        },
    );


/**
 * ------------------------------------------------
 * COMPLETE PAGE TEXT
 * ------------------------------------------------
 *
 * This gives us the complete rendered,
 * human-readable body text as one value.
 */
const fullPageText =
    cleanText(
        $(
            'body',
        )
            .text(),
    );


const result =
    {
        url:
            rendered.finalUrl,

        title:
            rendered.title,

        headings,

        paragraphs:
            unique(
                paragraphs,
            ),

        buttons:
            unique(
                buttons,
            ),

        links,

        listItems:
            unique(
                listItems,
            ),

        semanticText:
            unique(
                semanticText,
            ),

        images,

        fullPageText,
    };


console.log(
    '\n========================================',
);

console.log(
    'HEADINGS',
);

console.log(
    '========================================\n',
);

console.dir(
    result.headings,
    {
        depth:
            null,
    },
);


console.log(
    '\n========================================',
);

console.log(
    'PARAGRAPHS',
);

console.log(
    '========================================\n',
);

console.dir(
    result.paragraphs,
    {
        depth:
            null,
    },
);


console.log(
    '\n========================================',
);

console.log(
    'BUTTONS',
);

console.log(
    '========================================\n',
);

console.dir(
    result.buttons,
    {
        depth:
            null,
    },
);


console.log(
    '\n========================================',
);

console.log(
    'LINKS',
);

console.log(
    '========================================\n',
);

console.dir(
    result.links,
    {
        depth:
            null,
    },
);


console.log(
    '\n========================================',
);

console.log(
    'LIST ITEMS',
);

console.log(
    '========================================\n',
);

console.dir(
    result.listItems,
    {
        depth:
            null,
    },
);


console.log(
    '\n========================================',
);

console.log(
    'SEMANTIC TEXT',
);

console.log(
    '========================================\n',
);

console.dir(
    result.semanticText,
    {
        depth:
            null,
    },
);


console.log(
    '\n========================================',
);

console.log(
    'IMAGES',
);

console.log(
    '========================================\n',
);

console.dir(
    result.images,
    {
        depth:
            null,
    },
);


console.log(
    '\n========================================',
);

console.log(
    'FULL RENDERED PAGE TEXT',
);

console.log(
    '========================================\n',
);

console.log(
    result.fullPageText,
);


console.log(
    '\n========================================',
);

console.log(
    'SUMMARY',
);

console.log(
    '========================================',
);

console.log(
    'Headings:',
    result.headings.length,
);

console.log(
    'Paragraphs:',
    result.paragraphs.length,
);

console.log(
    'Buttons:',
    result.buttons.length,
);

console.log(
    'Links:',
    result.links.length,
);

console.log(
    'List items:',
    result.listItems.length,
);

console.log(
    'Semantic text:',
    result.semanticText.length,
);

console.log(
    'Images:',
    result.images.length,
);

console.log(
    '\nPublic Playwright smoke completed ✅',
);
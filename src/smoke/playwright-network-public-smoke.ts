import {
    PlaywrightRenderer,
} from '../browser/playwright-renderer.js';

import type {
    NetworkResponse,
} from '../core/contracts/browser/network-response.js';


const url =
    'https://www.instagram.com/lalitchoudharyy/?hl=en';


/**
 * Avoid printing query parameters because
 * real API URLs can contain identifiers,
 * signatures, tracking parameters, etc.
 */
function sanitizeUrl(
    value:
        string,
): string {

    try {

        const parsed =
            new URL(
                value,
            );


        return (
            parsed.origin
            + parsed.pathname
        );

    } catch {

        return '[invalid-url]';
    }
}


/**
 * We do NOT print response bodies.
 *
 * For valid JSON responses we only inspect
 * their structural top-level keys.
 */
function getJsonTopLevelKeys(
    response:
        NetworkResponse,
): string[] {

    if (
        response.body
        === undefined
    ) {

        return [];
    }


    const contentType =
        response.contentType
            ?.toLowerCase()
        ?? '';


    if (
        !contentType.includes(
            'json',
        )
    ) {

        return [];
    }


    try {

        const parsed:
            unknown =
            JSON.parse(
                response.body,
            );


        if (
            parsed === null
            || Array.isArray(
                parsed,
            )
            || typeof parsed
                !== 'object'
        ) {

            return [];
        }


        return Object
            .keys(
                parsed,
            )
            .slice(
                0,
                20,
            );

    } catch {

        return [];
    }
}


console.log(
    '\n========================================',
);

console.log(
    'PHASE 13 PUBLIC NETWORK SMOKE',
);

console.log(
    '========================================',
);

console.log(
    '\nTarget:',
    url,
);


const renderer =
    new PlaywrightRenderer();


const rendered =
    await renderer.render(
        url,
        {
            /**
             * Do not use networkidle here.
             *
             * Large sites such as Instagram
             * may maintain continuous network
             * activity.
             */
            waitUntil:
                'domcontentloaded',

            /**
             * Allow normal client-side API
             * traffic to occur after initial
             * DOM loading.
             */
            settleTimeMs:
                5_000,

            timeoutMs:
                30_000,

            headless:
                false,

            network:
                {
                    enabled:
                        true,

                    maxResponses:
                        200,

                    maxBodyBytes:
                        1024
                        * 1024,

                    maxTotalBodyBytes:
                        4
                        * 1024
                        * 1024,

                    bodyReadTimeoutMs:
                        2_000,
                },
        },
    );


console.log(
    '\n========================================',
);

console.log(
    'PAGE RESULT',
);

console.log(
    '========================================',
);


console.log(
    'Final URL:',
    rendered.finalUrl,
);


console.log(
    'Title:',
    rendered.title,
);


console.log(
    'Rendered HTML bytes:',
    Buffer.byteLength(
        rendered.html,
        'utf8',
    ),
);


/**
 * ----------------------------------------
 * NETWORK SUMMARY
 * ----------------------------------------
 */
console.log(
    '\n========================================',
);

console.log(
    'NETWORK CAPTURE SUMMARY',
);

console.log(
    '========================================',
);


console.log(
    'Observed responses:',
    rendered.networkCapture
        .observedResponses,
);


console.log(
    'Eligible XHR/fetch:',
    rendered.networkCapture
        .eligibleResponses,
);


console.log(
    'Retained responses:',
    rendered.networkCapture
        .retainedResponses,
);


console.log(
    'Bodies captured:',
    rendered.networkCapture
        .capturedBodies,
);


console.log(
    'Body bytes retained:',
    rendered.networkCapture
        .capturedBodyBytes,
);


console.log(
    'Response limit reached:',
    rendered.networkCapture
        .responseLimitReached,
);


/**
 * ----------------------------------------
 * SIMPLE CLASSIFICATION
 * ----------------------------------------
 */
const jsonResponses =
    rendered.networkResponses
        .filter(
            (
                response,
            ) =>
                response.contentType
                    ?.toLowerCase()
                    .includes(
                        'json',
                    )
                ?? false,
        );


const successfulResponses =
    rendered.networkResponses
        .filter(
            (
                response,
            ) =>
                response.status >= 200
                && response.status < 300,
        );


const failedResponses =
    rendered.networkResponses
        .filter(
            (
                response,
            ) =>
                response.status >= 400,
        );


const bodiesOmitted =
    rendered.networkResponses
        .filter(
            (
                response,
            ) =>
                response.bodyOmittedReason
                !== undefined,
        );


console.log(
    '\nJSON responses:',
    jsonResponses.length,
);


console.log(
    'Successful API responses:',
    successfulResponses.length,
);


console.log(
    '4xx/5xx API responses:',
    failedResponses.length,
);


console.log(
    'Bodies omitted:',
    bodiesOmitted.length,
);


/**
 * ----------------------------------------
 * SAFE API EVIDENCE OUTPUT
 * ----------------------------------------
 *
 * No headers.
 * No bodies.
 * No query strings.
 */
console.log(
    '\n========================================',
);

console.log(
    'CAPTURED API EVIDENCE',
);

console.log(
    '========================================',
);


for (
    const [
        index,
        response,
    ]
    of rendered.networkResponses
        .entries()
) {

    console.log(
        `\n#${index + 1}`,
    );


    console.log(
        'Type:',
        response.resourceType,
    );


    console.log(
        'Method:',
        response.method,
    );


    console.log(
        'Status:',
        response.status,
    );


    console.log(
        'Content-Type:',
        response.contentType
        ?? 'unknown',
    );


    console.log(
        'URL:',
        sanitizeUrl(
            response.url,
        ),
    );


    if (
        response.bodyBytes
        !== undefined
    ) {

        console.log(
            'Body bytes:',
            response.bodyBytes,
        );
    }


    if (
        response.bodyOmittedReason
        !== undefined
    ) {

        console.log(
            'Body omitted:',
            response.bodyOmittedReason,
        );
    }


    const keys =
        getJsonTopLevelKeys(
            response,
        );


    if (
        keys.length > 0
    ) {

        console.log(
            'JSON top-level keys:',
            keys.join(
                ', ',
            ),
        );
    }
}


/**
 * ----------------------------------------
 * CONTENT-TYPE DISTRIBUTION
 * ----------------------------------------
 */
const contentTypes =
    new Map<
        string,
        number
    >();


for (
    const response
    of rendered.networkResponses
) {

    const contentType =
        response.contentType
        ?.split(
            ';',
            1,
        )[0]
        ?.trim()
        .toLowerCase()
        ?? 'unknown';


    contentTypes.set(
        contentType,
        (
            contentTypes.get(
                contentType,
            )
            ?? 0
        )
        + 1,
    );
}


console.log(
    '\n========================================',
);

console.log(
    'CONTENT TYPE DISTRIBUTION',
);

console.log(
    '========================================',
);


for (
    const [
        contentType,
        count,
    ]
    of contentTypes
) {

    console.log(
        `${contentType}: ${count}`,
    );
}


/**
 * ----------------------------------------
 * FINAL CHECK
 * ----------------------------------------
 */
console.log(
    '\n========================================',
);

console.log(
    'SMOKE RESULT',
);

console.log(
    '========================================',
);


if (
    rendered.networkCapture
        .eligibleResponses
    === 0
) {

    console.log(
        '⚠️ Browser rendered successfully, but no XHR/fetch responses were observed.',
    );

} else {

    console.log(
        '✅ Real browser XHR/fetch evidence captured.',
    );
}


if (
    rendered.networkCapture
        .retainedResponses
    > 0
) {

    console.log(
        '✅ Network evidence records retained.',
    );
}


if (
    jsonResponses.length > 0
) {

    console.log(
        '✅ Structured JSON network evidence discovered.',
    );

} else {

    console.log(
        'ℹ️ No JSON Content-Type responses were observed during this render window.',
    );
}


console.log(
    '\nPhase 13 public smoke completed.',
);
import {
    GotScrapingHttpClient,
} from '@crawlee/core';

import {
    FastFetcher,
} from '../fetcher/fast-fetcher.js';

import {
    FETCHER_CONFIG,
} from '../config/fetcher.config.js';

import {
    DomExtractor,
} from '../parser/extractors/dom.extractor.js';


const url =
    'https://mellow-rugelach-4fa1b4.netlify.app/';


const httpClient =
    new GotScrapingHttpClient();


const fastFetcher =
    new FastFetcher(
        FETCHER_CONFIG,
        httpClient,
    );


const envelope =
    await fastFetcher.fetch(
        {
            id:
                'public-dom-smoke',

            url,

            requestedFields:
                [],

            createdAt:
                new Date()
                    .toISOString(),
        },
    );

console.log(
    '\nHTTP status:',
    envelope.statusCode,
);


console.log(
    '\nFinal URL:',
    envelope.finalUrl,
);


console.log(
    '\nContent-Type:',
    envelope.headers[
        'content-type'
    ],
);


console.log(
    '\nBody bytes:',
    envelope.bodyBytes,
);




const extractor =
    new DomExtractor();


const input =
    {
        job: {
            id:
                'public-dom-smoke',

            url,

            requestedFields:
                [],
            createdAt:
                new Date()
                    .toISOString(),
        },

        envelope,
    };


console.log(
    '\nDOM supported:',
    extractor.supports(
        input,
    ),
);


const result =
    await extractor.extract(
        input,
    );


console.log(
    '\nWarnings:',
    result.warnings,
);


console.log(
    '\nDiscovered DOM properties:',
);


for (
    const property
    of result.discovered
) {

    console.log(
        {
            key:
                property.key,

            value:
                property.value,

            path:
                property.path,

            source:
                property.source,
        },
    );
}


console.log(
    '\nTotal discovered:',
    result.discovered.length,
);
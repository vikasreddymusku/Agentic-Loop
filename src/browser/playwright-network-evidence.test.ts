import {
    createServer,
    type Server,
    type ServerResponse,
} from 'node:http';

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import {
    PlaywrightRenderer,
} from './playwright-renderer.js';


describe(
    'PlaywrightRenderer network evidence',
    () => {

        let server:
            Server;

        let baseUrl:
            string;


        const sendHtml =
            (
                response:
                    ServerResponse,  
                html:
                    string,
            ) => {

                response.writeHead(
                    200,
                    {
                        'content-type':
                            'text/html; charset=utf-8',
                    },
                );


                response.end(
                    html,
                );
            };


        const sendJson =
            (
                response:
                    ServerResponse,

                payload:
                    unknown,

                headers:
                    Record<
                        string,
                        string
                    > =
                    {},
            ) => {

                const body =
                    JSON.stringify(
                        payload,
                    );


                response.writeHead(
                    200,
                    {
                        'content-type':
                            'application/json; charset=utf-8',

                        ...headers,
                    },
                );


                response.end(
                    body,
                );
            };


        beforeAll(
            async () => {

                server =
                    createServer(
                        (
                            request,
                            response,
                        ) => {

                            const path =
                                request.url
                                ?? '/';


                            if (
                                path
                                === '/json-page'
                            ) {

                                sendHtml(
                                    response,
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <div id="result">
                                                Loading...
                                            </div>

                                            <script>
                                                fetch('/api/data')
                                                    .then(
                                                        response =>
                                                            response.json()
                                                    )
                                                    .then(
                                                        payload => {
                                                            document
                                                                .getElementById(
                                                                    'result'
                                                                )
                                                                .textContent =
                                                                payload.value;
                                                        }
                                                    );
                                            </script>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                path
                                === '/api/data'
                            ) {

                                sendJson(
                                    response,
                                    {
                                        value:
                                            'Dynamic Data',
                                    },
                                );


                                return;
                            }


                            if (
                                path
                                === '/binary-page'
                            ) {

                                sendHtml(
                                    response,
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <script>
                                                fetch('/api/binary')
                                                    .then(
                                                        response =>
                                                            response.arrayBuffer()
                                                    );
                                            </script>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                path
                                === '/api/binary'
                            ) {

                                const binary =
                                    Buffer.from(
                                        [
                                            0,
                                            1,
                                            2,
                                            3,
                                            4,
                                            5,
                                        ],
                                    );


                                response.writeHead(
                                    200,
                                    {
                                        'content-type':
                                            'image/png',

                                        'content-length':
                                            String(
                                                binary.byteLength,
                                            ),
                                    },
                                );


                                response.end(
                                    binary,
                                );


                                return;
                            }


                            if (
                                path
                                === '/large-page'
                            ) {

                                sendHtml(
                                    response,
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <script>
                                                fetch('/api/large')
                                                    .then(
                                                        response =>
                                                            response.json()
                                                    );
                                            </script>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                path
                                === '/api/large'
                            ) {

                                const body =
                                    JSON.stringify(
                                        {
                                            payload:
                                                'x'.repeat(
                                                    500,
                                                ),
                                        },
                                    );


                                response.writeHead(
                                    200,
                                    {
                                        'content-type':
                                            'application/json',

                                        'content-length':
                                            String(
                                                Buffer.byteLength(
                                                    body,
                                                    'utf8',
                                                ),
                                            ),
                                    },
                                );


                                response.end(
                                    body,
                                );


                                return;
                            }


                            if (
                                path
                                === '/budget-page'
                            ) {

                                sendHtml(
                                    response,
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <script>
                                                async function run() {
                                                    await fetch(
                                                        '/api/one'
                                                    );

                                                    await fetch(
                                                        '/api/two'
                                                    );
                                                }

                                                run();
                                            </script>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                path
                                === '/api/one'
                            ) {

                                sendJson(
                                    response,
                                    {
                                        value:
                                            'first-response',
                                    },
                                );


                                return;
                            }


                            if (
                                path
                                === '/api/two'
                            ) {

                                sendJson(
                                    response,
                                    {
                                        value:
                                            'second-response',
                                    },
                                );


                                return;
                            }


                            if (
                                path
                                === '/header-page'
                            ) {

                                sendHtml(
                                    response,
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <script>
                                                fetch('/api/headers')
                                                    .then(
                                                        response =>
                                                            response.json()
                                                    );
                                            </script>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                path
                                === '/api/headers'
                            ) {

                                sendJson(
                                    response,
                                    {
                                        ok:
                                            true,
                                    },
                                    {
                                        'X-Custom-Header':
                                            'Visible',

                                        'X-API-Key':
                                            'super-secret',

                                        'Set-Cookie':
                                            'session=private-value',
                                    },
                                );


                                return;
                            }


                            if (
                                path
                                === '/redirect-page'
                            ) {

                                sendHtml(
                                    response,
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <script>
                                                fetch('/api/redirect')
                                                    .then(
                                                        response =>
                                                            response.json()
                                                    );
                                            </script>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                path
                                === '/api/redirect'
                            ) {

                                response.writeHead(
                                    302,
                                    {
                                        location:
                                            '/api/final',
                                    },
                                );


                                response.end();


                                return;
                            }


                            if (
                                path
                                === '/api/final'
                            ) {

                                sendJson(
                                    response,
                                    {
                                        value:
                                            'redirected-data',
                                    },
                                );


                                return;
                            }


                            if (
                                path
                                === '/limit-page'
                            ) {

                                sendHtml(
                                    response,
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <script>
                                                async function run() {
                                                    await fetch('/api/a');
                                                    await fetch('/api/b');
                                                    await fetch('/api/c');
                                                }

                                                run();
                                            </script>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                path
                                === '/api/a'
                                || path
                                    === '/api/b'
                                || path
                                    === '/api/c'
                            ) {

                                sendJson(
                                    response,
                                    {
                                        endpoint:
                                            path,
                                    },
                                );


                                return;
                            }


                            response.writeHead(
                                404,
                            );


                            response.end(
                                'Not Found',
                            );
                        },
                    );


                await new Promise<void>(
                    (
                        resolve,
                        reject,
                    ) => {

                        const onError =
                            (
                                error:
                                    Error,
                            ) => {

                                reject(
                                    error,
                                );
                            };


                        server.once(
                            'error',
                            onError,
                        );


                        server.listen(
                            0,
                            '127.0.0.1',
                            () => {

                                server.off(
                                    'error',
                                    onError,
                                );


                                resolve();
                            },
                        );
                    },
                );


                const address =
                    server.address();


                if (
                    address
                    === null
                    || typeof address
                        === 'string'
                ) {

                    throw new Error(
                        'Network evidence test server did not expose a TCP address.',
                    );
                }


                baseUrl =
                    (
                        'http://127.0.0.1:'
                        + address.port
                    );
            },
        );


        afterAll(
            async () => {

                server
                    .closeAllConnections();


                await new Promise<void>(
                    (
                        resolve,
                        reject,
                    ) => {

                        server.close(
                            (
                                error,
                            ) => {

                                if (
                                    error
                                ) {

                                    reject(
                                        error,
                                    );


                                    return;
                                }


                                resolve();
                            },
                        );
                    },
                );
            },
        );


        it(
            'captures JSON fetch responses with structured metadata and body',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/json-page`,
                        {
                            waitUntil:
                                'networkidle',

                            settleTimeMs:
                                0,
                        },
                    );


                const api =
                    result.networkResponses
                        .find(
                            (
                                response,
                            ) =>
                                response.url
                                    .endsWith(
                                        '/api/data',
                                    ),
                        );


                expect(
                    api,
                )
                    .toMatchObject(
                        {
                            status:
                                200,

                            method:
                                'GET',

                            resourceType:
                                'fetch',
                        },
                    );

                    /**
 * Every retained network response must have
 * a non-empty provenance ID.
 */
expect(
    api?.id
        .trim()
        .length,
)
    .toBeGreaterThan(
        0,
    );


/**
 * Sequence records the original browser
 * response observation order.
 */
expect(
    api?.sequence,
)
    .toBeGreaterThanOrEqual(
        0,
    );


                expect(
                    api?.body,
                )
                    .toContain(
                        'Dynamic Data',
                    );


                expect(
                    result.html,
                )
                    .toContain(
                        'Dynamic Data',
                    );


                expect(
                    result.networkCapture
                        .capturedBodies,
                )
                    .toBeGreaterThan(
                        0,
                    );
            },

            20_000,
        );


        it(
            'retains binary fetch metadata without retaining the binary body',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/binary-page`,
                        {
                            waitUntil:
                                'networkidle',

                            settleTimeMs:
                                0,
                        },
                    );


                const binary =
                    result.networkResponses
                        .find(
                            (
                                response,
                            ) =>
                                response.url
                                    .endsWith(
                                        '/api/binary',
                                    ),
                        );


                expect(
                    binary,
                )
                    .toMatchObject(
                        {
                            status:
                                200,

                            contentType:
                                'image/png',

                            bodyOmittedReason:
                                'NON_TEXT_CONTENT',
                        },
                    );


                expect(
                    binary?.body,
                )
                    .toBeUndefined();
            },

            20_000,
        );


        it(
            'does not retain a response body larger than the configured per-response limit',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/large-page`,
                        {
                            waitUntil:
                                'networkidle',

                            settleTimeMs:
                                0,

                            network:
                                {
                                    maxBodyBytes:
                                        64,
                                },
                        },
                    );


                const large =
                    result.networkResponses
                        .find(
                            (
                                response,
                            ) =>
                                response.url
                                    .endsWith(
                                        '/api/large',
                                    ),
                        );


                expect(
                    large?.body,
                )
                    .toBeUndefined();


                expect(
                    large
                        ?.bodyOmittedReason,
                )
                    .toBe(
                        'BODY_TOO_LARGE',
                    );


                expect(
                    large?.bodyBytes,
                )
                    .toBeGreaterThan(
                        64,
                    );
            },

            20_000,
        );


        it(
            'enforces the combined retained body budget',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/budget-page`,
                        {
                            waitUntil:
                                'networkidle',

                            settleTimeMs:
                                0,

                            network:
                                {
                                    maxBodyBytes:
                                        100,

                                    maxTotalBodyBytes:
                                        40,
                                },
                        },
                    );


                const first =
                    result.networkResponses
                        .find(
                            (
                                response,
                            ) =>
                                response.url
                                    .endsWith(
                                        '/api/one',
                                    ),
                        );


                const second =
                    result.networkResponses
                        .find(
                            (
                                response,
                            ) =>
                                response.url
                                    .endsWith(
                                        '/api/two',
                                    ),
                        );


                expect(
                    first?.body,
                )
                    .toContain(
                        'first-response',
                    );


                expect(
                    second?.body,
                )
                    .toBeUndefined();


                expect(
                    second
                        ?.bodyOmittedReason,
                )
                    .toBe(
                        'TOTAL_BODY_BUDGET_EXCEEDED',
                    );
            },

            20_000,
        );


        it(
            'normalizes header names and redacts sensitive header values',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/header-page`,
                        {
                            waitUntil:
                                'networkidle',

                            settleTimeMs:
                                0,
                        },
                    );


                const api =
                    result.networkResponses
                        .find(
                            (
                                response,
                            ) =>
                                response.url
                                    .endsWith(
                                        '/api/headers',
                                    ),
                        );


                expect(
                    api,
                )
                    .toBeDefined();


                expect(
                    Object.keys(
                        api?.headers
                        ?? {},
                    )
                        .every(
                            (
                                key,
                            ) =>
                                key
                                === key
                                    .toLowerCase(),
                        ),
                )
                    .toBe(
                        true,
                    );


                expect(
                    api?.headers[
                        'x-custom-header'
                    ],
                )
                    .toBe(
                        'Visible',
                    );


                expect(
                    api?.headers[
                        'x-api-key'
                    ],
                )
                    .toBe(
                        '[REDACTED]',
                    );


                expect(
                    api?.headers[
                        'set-cookie'
                    ],
                )
                    .toBe(
                        '[REDACTED]',
                    );
            },

            20_000,
        );


        it(
            'captures fetch redirect responses and the final API response',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/redirect-page`,
                        {
                            waitUntil:
                                'networkidle',

                            settleTimeMs:
                                0,
                        },
                    );


                const redirect =
                    result.networkResponses
                        .find(
                            (
                                response,
                            ) =>
                                response.url
                                    .endsWith(
                                        '/api/redirect',
                                    ),
                        );


                const final =
                    result.networkResponses
                        .find(
                            (
                                response,
                            ) =>
                                response.url
                                    .endsWith(
                                        '/api/final',
                                    ),
                        );


                expect(
                    redirect?.status,
                )
                    .toBe(
                        302,
                    );


                expect(
                    final?.status,
                )
                    .toBe(
                        200,
                    );


                expect(
                    final?.body,
                )
                    .toContain(
                        'redirected-data',
                    );

                    const ids =
    result.networkResponses.map(
        (
            response,
        ) =>
            response.id,
    );


expect(
    new Set(
        ids,
    ).size,
)
    .toBe(
        ids.length,
    );


const sequences =
    result.networkResponses.map(
        (
            response,
        ) =>
            response.sequence,
    );


expect(
    sequences,
)
    .toEqual(
        [
            ...sequences,
        ].sort(
            (
                left,
                right,
            ) =>
                left
                - right,
        ),
    );
            },

            20_000,
        );


        it(
            'bounds the number of retained API responses and reports truncation',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/limit-page`,
                        {
                            waitUntil:
                                'networkidle',

                            settleTimeMs:
                                0,

                            network:
                                {
                                    maxResponses:
                                        2,
                                },
                        },
                    );


                expect(
                    result.networkResponses,
                )
                    .toHaveLength(
                        2,
                    );


                expect(
                    result.networkCapture
                        .eligibleResponses,
                )
                    .toBe(
                        3,
                    );


                expect(
                    result.networkCapture
                        .retainedResponses,
                )
                    .toBe(
                        2,
                    );


                expect(
                    result.networkCapture
                        .responseLimitReached,
                )
                    .toBe(
                        true,
                    );
            },

            20_000,
        );
    },
);
import {
    createServer,
    type Server,
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
    'PlaywrightRenderer',
    () => {

        let server:
            Server;

        let baseUrl:
            string;


        beforeAll(
            async () => {

                server =
                    createServer(
                        (
                            request,
                            response,
                        ) => {

                            const url =
                                request.url
                                ?? '/';


                            if (
                                url === '/static'
                            ) {

                                response.writeHead(
                                    200,
                                    {
                                        'content-type':
                                            'text/html; charset=utf-8',
                                    },
                                );


                                response.end(
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <head>
                                            <title>
                                                Static Browser Test
                                            </title>
                                        </head>

                                        <body>
                                            <div id="value">
                                                Static Content
                                            </div>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                url === '/dynamic'
                            ) {

                                response.writeHead(
                                    200,
                                    {
                                        'content-type':
                                            'text/html; charset=utf-8',
                                    },
                                );


                                response.end(
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <div id="app">
                                                Loading...
                                            </div>

                                            <script>
                                                setTimeout(
                                                    () => {
                                                        document
                                                            .getElementById(
                                                                'app'
                                                            )
                                                            .textContent =
                                                            'Dynamic Content';
                                                    },
                                                    100
                                                );
                                            </script>
                                        </body>
                                    </html>
                                    `,
                                );


                                return;
                            }


                            if (
                                url === '/fetch-dynamic'
                            ) {

                                response.writeHead(
                                    200,
                                    {
                                        'content-type':
                                            'text/html; charset=utf-8',
                                    },
                                );


                                response.end(
                                    `
                                    <!DOCTYPE html>

                                    <html>
                                        <body>
                                            <div id="remote-value">
                                                Loading API...
                                            </div>

                                            <script>
                                                fetch(
                                                    '/api/value'
                                                )
                                                    .then(
                                                        response =>
                                                            response.json()
                                                    )
                                                    .then(
                                                        payload => {
                                                            document
                                                                .getElementById(
                                                                    'remote-value'
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
                                url === '/api/value'
                            ) {

                                setTimeout(
                                    () => {

                                        response.writeHead(
                                            200,
                                            {
                                                'content-type':
                                                    'application/json',
                                            },
                                        );


                                        response.end(
                                            JSON.stringify(
                                                {
                                                    value:
                                                        'API Loaded Content',
                                                },
                                            ),
                                        );

                                    },
                                    100,
                                );


                                return;
                            }


                            if (
                                url === '/redirect'
                            ) {

                                response.writeHead(
                                    302,
                                    {
                                        location:
                                            '/static',
                                    },
                                );


                                response.end();


                                return;
                            }


                            if (
                                url === '/never'
                            ) {

                                response.writeHead(
                                    200,
                                    {
                                        'content-type':
                                            'text/html; charset=utf-8',
                                    },
                                );


                                /**
                                 * Intentionally never finish
                                 * the document.
                                 *
                                 * page.goto(... waitUntil: load)
                                 * must eventually time out.
                                 */
                                response.write(
                                    `
                                    <!DOCTYPE html>
                                    <html>
                                    <body>
                                    `,
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
                    address === null
                    || typeof address
                        === 'string'
                ) {

                    throw new Error(
                        'Playwright test HTTP server did not expose a TCP address.',
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
            'renders a normal static HTML page',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/static`,
                        {
                            settleTimeMs:
                                0,
                        },
                    );


                expect(
                    result.finalUrl,
                )
                    .toBe(
                        `${baseUrl}/static`,
                    );


                expect(
                    result.title,
                )
                    .toBe(
                        'Static Browser Test',
                    );


                expect(
                    result.html,
                )
                    .toContain(
                        'Static Content',
                    );
            },

            20_000,
        );


        it(
            'captures JavaScript DOM mutations after page load',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/dynamic`,
                        {
                            waitUntil:
                                'domcontentloaded',

                            settleTimeMs:
                                250,
                        },
                    );


                expect(
                    result.html,
                )
                    .toContain(
                        'Dynamic Content',
                    );


                expect(
                    result.html,
                )
                    .not
                    .toContain(
                        '>Loading...</div>',
                    );
            },

            20_000,
        );


        it(
            'captures content loaded through browser fetch requests',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/fetch-dynamic`,
                        {
                            waitUntil:
                                'networkidle',

                            settleTimeMs:
                                0,
                        },
                    );


                expect(
                    result.html,
                )
                    .toContain(
                        'API Loaded Content',
                    );
            },

            20_000,
        );


        it(
            'returns the final URL after redirects',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                const result =
                    await renderer.render(
                        `${baseUrl}/redirect`,
                        {
                            settleTimeMs:
                                0,
                        },
                    );


                expect(
                    result.finalUrl,
                )
                    .toBe(
                        `${baseUrl}/static`,
                    );


                expect(
                    result.html,
                )
                    .toContain(
                        'Static Content',
                    );
            },

            20_000,
        );


        it(
            'returns a typed timeout error when navigation exceeds the limit',
            async () => {

                const renderer =
                    new PlaywrightRenderer();


                await expect(
                    renderer.render(
                        `${baseUrl}/never`,
                        {
                            timeoutMs:
                                200,

                            waitUntil:
                                'load',

                            settleTimeMs:
                                0,
                        },
                    ),
                )
                    .rejects
                    .toMatchObject(
                        {
                            name:
                                'BrowserRenderError',

                            code:
                                'TIMEOUT',

                            url:
                                `${baseUrl}/never`,
                        },
                    );
            },

            20_000,
        );
    },
);
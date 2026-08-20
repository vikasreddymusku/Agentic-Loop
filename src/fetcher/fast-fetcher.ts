import {
    performance,
} from 'node:perf_hooks';

import type {
    Readable,
} from 'node:stream';

import type {
    BaseHttpClient,
} from '@crawlee/core';

import type {
    ScrapeJob,
} from '../core/contracts/scrape-job.js';

import type {
    FetchEnvelope,
    FetchHeaders,
    TransportError,
    TransportErrorType,
} from '../core/contracts/fetch-envelope.js';

import type {
    FastFetcherConfig,
} from './types.js';


type RawHeaders =
    Record<
        string,
        string | string[] | undefined
    >;


type BodyReadResult = {
    rawBody: Buffer | null;
    bodyBytes: number;
    bodyTruncated: boolean;
};


/**
 * Internal error used only to preserve bytes
 * downloaded before the response stream failed.
 */
class BodyReadFailure extends Error {

    public readonly partialBody:
        Buffer | null;

    public readonly bodyBytes:
        number;

    public readonly causeError:
        unknown;


    constructor(
        causeError: unknown,
        partialBody: Buffer | null,
        bodyBytes: number,
    ) {

        super(
            causeError instanceof Error
                ? causeError.message
                : 'Response body stream failed.',
        );

        this.name =
            'BodyReadFailure';

        this.causeError =
            causeError;

        this.partialBody =
            partialBody;

        this.bodyBytes =
            bodyBytes;
    }
}


export class FastFetcher {

    constructor(
        private readonly config:
            FastFetcherConfig,

        private readonly httpClient:
            BaseHttpClient,
    ) {

        this.validateConfig();
    }


    /**
     * Perform a lightweight HTTP fetch.
     *
     * Normal HTTP responses NEVER throw simply
     * because they contain 401/403/429/5xx.
     *
     * Network failures are converted to
     * transportError.
     *
     * Body-stream failures are converted to
     * bodyError while preserving HTTP metadata
     * and partial body bytes.
     */
    async fetch(
        job: ScrapeJob,
    ): Promise<FetchEnvelope> {

        const startedAt =
            performance.now();


        /*
         * LEVEL 1:
         *
         * Obtain HTTP response headers.
         *
         * Errors here mean no HTTP response
         * was successfully obtained.
         */
        let response;

        try {

            response =
                await this.httpClient.stream({

                    url:
                        job.url,

                    method:
                        'GET',

                    timeout: {
                        request:
                            this.config
                                .timeoutMs,
                    },

                    maxRedirects:
                        this.config
                            .maxRedirects,

                    /**
                     * Critical.
                     *
                     * We want responses like:
                     *
                     * 401
                     * 403
                     * 404
                     * 429
                     * 500
                     *
                     * to reach AccessController.
                     */
                    throwHttpErrors:
                        false,
                });

        } catch (error) {

            return {
                requestedUrl:
                    job.url,

                finalUrl:
                    job.url,

                redirects:
                    [],

                statusCode:
                    0,

                headers:
                    {},

                rawBody:
                    null,

                bodyBytes:
                    0,

                bodyTruncated:
                    false,

                fetchDurationMs:
                    performance.now()
                    - startedAt,

                transportError:
                    this.classifyTransportError(
                        error,
                    ),
            };
        }


        /*
         * From here onward:
         *
         * HTTP status + headers have already
         * been successfully received.
         */

        const headers =
            this.normalizeHeaders(
                response.headers,
            );


        const redirects =
            this.normalizeRedirects(
                response.redirectUrls,
                response.url,
            );


        const originalContentLength =
            this.parseContentLength(
                this.getFirstHeader(
                    headers,
                    'content-length',
                ),
            );


        /*
         * LEVEL 2:
         *
         * Consume response body.
         *
         * Failure here MUST NOT erase
         * HTTP status/headers/redirects.
         */
        try {

            const body =
                await this.readBody(
                    response.stream,
                    this.config
                        .maxBodySizeBytes,
                );


            return {
                requestedUrl:
                    job.url,

                finalUrl:
                    response.url,

                redirects,

                statusCode:
                    response.statusCode,

                headers,

                rawBody:
                    body.rawBody,

                bodyBytes:
                    body.bodyBytes,

                bodyTruncated:
                    body.bodyTruncated,

                originalContentLength,

                fetchDurationMs:
                    performance.now()
                    - startedAt,
            };

        } catch (error) {

            /*
             * We should normally receive our
             * BodyReadFailure wrapper here.
             */
            if (
                error
                instanceof BodyReadFailure
            ) {

                return {
                    requestedUrl:
                        job.url,

                    finalUrl:
                        response.url,

                    redirects,

                    statusCode:
                        response.statusCode,

                    headers,

                    rawBody:
                        error.partialBody,

                    bodyBytes:
                        error.bodyBytes,

                    bodyTruncated:
                        false,

                    originalContentLength,

                    fetchDurationMs:
                        performance.now()
                        - startedAt,

                    bodyError:
                        this.classifyTransportError(
                            error.causeError,
                        ),
                };
            }


            /*
             * Defensive fallback.
             *
             * HTTP metadata is still preserved.
             */
            return {
                requestedUrl:
                    job.url,

                finalUrl:
                    response.url,

                redirects,

                statusCode:
                    response.statusCode,

                headers,

                rawBody:
                    null,

                bodyBytes:
                    0,

                bodyTruncated:
                    false,

                originalContentLength,

                fetchDurationMs:
                    performance.now()
                    - startedAt,

                bodyError:
                    this.classifyTransportError(
                        error,
                    ),
            };
        }
    }


    /**
     * Read the response body while enforcing
     * maxBodySizeBytes.
     *
     * If the stream itself fails, accumulated
     * bytes are preserved in BodyReadFailure.
     */
    private async readBody(
        stream: Readable,
        maxBytes: number,
    ): Promise<BodyReadResult> {

        const chunks:
            Buffer[] = [];

        let bodyBytes =
            0;

        let bodyTruncated =
            false;


        try {

            for await (
                const chunk
                of stream
            ) {

                const buffer =
                    Buffer.isBuffer(
                        chunk,
                    )
                        ? chunk
                        : Buffer.from(
                            chunk,
                        );


                const remaining =
                    maxBytes
                    - bodyBytes;


                /*
                 * We already filled our limit
                 * and more data exists.
                 *
                 * Therefore this is genuinely
                 * truncated.
                 */
                if (
                    remaining <= 0
                ) {

                    bodyTruncated =
                        true;

                    break;
                }


                /*
                 * Part of this chunk fits.
                 */
                if (
                    buffer.length >
                    remaining
                ) {

                    chunks.push(
                        buffer.subarray(
                            0,
                            remaining,
                        ),
                    );


                    bodyBytes +=
                        remaining;


                    bodyTruncated =
                        true;


                    break;
                }


                /*
                 * Whole chunk fits.
                 */
                chunks.push(
                    buffer,
                );


                bodyBytes +=
                    buffer.length;
            }


            return {
                rawBody:
                    bodyBytes === 0
                        ? null
                        : Buffer.concat(
                            chunks,
                            bodyBytes,
                        ),

                bodyBytes,

                bodyTruncated,
            };

        } catch (error) {

            /*
             * Stop any remaining socket activity.
             */
            if (
                !stream.destroyed
            ) {

                stream.destroy();
            }


            throw new BodyReadFailure(
                error,

                bodyBytes === 0
                    ? null
                    : Buffer.concat(
                        chunks,
                        bodyBytes,
                    ),

                bodyBytes,
            );

        } finally {

            /*
             * We intentionally stopped reading
             * because our memory boundary was hit.
             */
            if (
                bodyTruncated
                && !stream.destroyed
            ) {

                stream.destroy();
            }
        }
    }


    /**
     * Lowercase all header names while preserving
     * multi-value headers such as set-cookie.
     */
    private normalizeHeaders(
        rawHeaders: RawHeaders,
    ): FetchHeaders {

        const normalized:
            FetchHeaders = {};


        for (
            const [
                rawName,
                rawValue,
            ]
            of Object.entries(
                rawHeaders,
            )
        ) {

            if (
                rawValue
                === undefined
            ) {
                continue;
            }


            const name =
                rawName
                    .toLowerCase();


            normalized[name] =
                Array.isArray(
                    rawValue,
                )
                    ? [...rawValue]
                    : rawValue;
        }


        return normalized;
    }


    private getFirstHeader(
        headers: FetchHeaders,
        name: string,
    ): string | undefined {

        const value =
            headers[
                name.toLowerCase()
            ];


        if (
            value === undefined
        ) {

            return undefined;
        }


        return Array.isArray(
            value,
        )
            ? value[0]
            : value;
    }


    /**
     * Content-Length is only informational.
     */
    private parseContentLength(
        value:
            string | undefined,
    ): number | undefined {

        if (!value) {

            return undefined;
        }


        /*
         * Reject malformed values such as:
         *
         * "123abc"
         * "-1"
         * "1.5"
         */
        if (
            !/^\d+$/.test(
                value.trim(),
            )
        ) {

            return undefined;
        }


        const parsed =
            Number(
                value,
            );


        if (
            !Number.isSafeInteger(
                parsed,
            )
            || parsed < 0
        ) {

            return undefined;
        }


        return parsed;
    }


    /**
     * Crawlee provides redirectUrls.
     *
     * Our contract says:
     *
     * - [] if there was no redirect
     * - otherwise the final item equals finalUrl
     */
    private normalizeRedirects(
        redirectUrls: URL[],
        finalUrl: string,
    ): string[] {

        if (
            redirectUrls.length
            === 0
        ) {

            return [];
        }


        const redirects =
            redirectUrls.map(
                (url) =>
                    url.toString(),
            );


        if (
            redirects[
                redirects.length - 1
            ]
            !== finalUrl
        ) {

            redirects.push(
                finalUrl,
            );
        }


        return redirects;
    }


    /**
     * Turn arbitrary HTTP-client errors into
     * our stable transport contract.
     */
    private classifyTransportError(
        error: unknown,
    ): TransportError {

        const normalized =
            this.normalizeError(
                error,
            );


        return {
            type:
                this.detectTransportErrorType(
                    normalized,
                ),

            code:
                normalized.code,

            message:
                normalized.message,
        };
    }


    private normalizeError(
        error: unknown,
    ): {
        name: string;
        message: string;
        code?: string;
    } {

        if (
            error instanceof Error
        ) {

            const coded =
                error as Error & {
                    code?: unknown;
                };


            return {
                name:
                    error.name,

                message:
                    error.message,

                code:
                    typeof coded.code
                    === 'string'
                        ? coded.code
                        : undefined,
            };
        }


        if (
            typeof error
                === 'object'
            && error !== null
        ) {

            const value =
                error as Record<
                    string,
                    unknown
                >;


            return {
                name:
                    typeof value.name
                        === 'string'
                        ? value.name
                        : 'Error',

                message:
                    typeof value.message
                        === 'string'
                        ? value.message
                        : 'Unknown transport error',

                code:
                    typeof value.code
                        === 'string'
                        ? value.code
                        : undefined,
            };
        }


        return {
            name:
                'Error',

            message:
                String(
                    error,
                ),
        };
    }


    private detectTransportErrorType(
        error: {
            name: string;
            message: string;
            code?: string;
        },
    ): TransportErrorType {

        const name =
            error.name
                .toLowerCase();

        const message =
            error.message
                .toLowerCase();

        const code =
            error.code
                ?.toUpperCase();


        /*
         * TIMEOUT
         */
        const timeoutCodes =
            new Set([
                'ETIMEDOUT',
                'ESOCKETTIMEDOUT',

                /*
                 * Useful if our injected
                 * BaseHttpClient changes later.
                 */
                'UND_ERR_CONNECT_TIMEOUT',
                'UND_ERR_HEADERS_TIMEOUT',
                'UND_ERR_BODY_TIMEOUT',
            ]);


        if (
            (
                code
                && timeoutCodes.has(
                    code,
                )
            )
            || name.includes(
                'timeout',
            )
        ) {

            return 'TIMEOUT';
        }


        /*
         * DNS
         */
        const dnsCodes =
            new Set([
                'ENOTFOUND',
                'EAI_AGAIN',
            ]);


        if (
            (
                code
                && dnsCodes.has(
                    code,
                )
            )
            || message.includes(
                'getaddrinfo',
            )
        ) {

            return 'DNS_ERROR';
        }


        /*
         * TLS / SSL / certificate.
         */
        const tlsCodes =
            new Set([
                'EPROTO',
                'CERT_HAS_EXPIRED',
                'DEPTH_ZERO_SELF_SIGNED_CERT',
                'SELF_SIGNED_CERT_IN_CHAIN',
                'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
                'ERR_TLS_CERT_ALTNAME_INVALID',
                'ERR_SSL_PROTOCOL_ERROR',
            ]);


        if (
            (
                code
                && tlsCodes.has(
                    code,
                )
            )
            || name.includes(
                'tls',
            )
            || message.includes(
                'certificate',
            )
            || message.includes(
                'ssl handshake',
            )
        ) {

            return 'TLS_ERROR';
        }


        /*
         * General network connection problems.
         */
        const connectionCodes =
            new Set([
                'ECONNREFUSED',
                'ECONNRESET',
                'ECONNABORTED',
                'EHOSTUNREACH',
                'ENETUNREACH',
                'EPIPE',
                'UND_ERR_SOCKET',
            ]);


        if (
            code
            && connectionCodes.has(
                code,
            )
        ) {

            return 'CONNECTION_ERROR';
        }


        return 'OTHER';
    }


    /**
     * "Never throw" applies to remote/network
     * outcomes.
     *
     * Invalid programmer configuration should
     * fail immediately.
     */
    private validateConfig():
        void {

        if (
            !Number.isFinite(
                this.config
                    .timeoutMs,
            )
            || this.config
                .timeoutMs <= 0
        ) {

            throw new Error(
                'FastFetcher timeoutMs must be greater than 0.',
            );
        }


        if (
            !Number.isSafeInteger(
                this.config
                    .maxBodySizeBytes,
            )
            || this.config
                .maxBodySizeBytes <= 0
        ) {

            throw new Error(
                'FastFetcher maxBodySizeBytes must be a positive safe integer.',
            );
        }


        if (
            !Number.isSafeInteger(
                this.config
                    .maxRedirects,
            )
            || this.config
                .maxRedirects < 0 
        ) {

            throw new Error(
                'FastFetcher maxRedirects must be a non-negative safe integer.',
            );
        }
    }
}
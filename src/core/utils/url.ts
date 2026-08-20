// src/core/utils/url.ts


/**
 * Validate that an input is a usable HTTP/HTTPS URL.
 *
 * Shared by modules such as:
 *
 * - RequestManager
 * - AccessController
 * - future Coordinator
 */
export function validateHttpUrl(
    input: string,
): URL {

    const value =
        input.trim();


    if (
        value.length === 0
    ) {

        throw new Error(
            'URL cannot be empty.',
        );
    }


    let url: URL;


    try {

        url =
            new URL(
                value,
            );

    } catch {

        throw new Error(
            `Invalid URL: ${input}`,
        );
    }


    if (
        url.protocol !== 'http:'
        && url.protocol !== 'https:'
    ) {

        throw new Error(
            `Unsupported URL protocol: ${url.protocol}`,
        );
    }


    if (
        url.hostname.length === 0
    ) {

        throw new Error(
            `URL does not contain a hostname: ${input}`,
        );
    }


    return url;
}


/**
 * Return a normalized hostname for domain-level
 * state and policy decisions.
 *
 * Example:
 *
 * https://Example.COM/path
 *
 * becomes:
 *
 * example.com
 */
export function getDomain(
    input: string,
): string {

    const hostname =
        validateHttpUrl(
            input,
        )
            .hostname
            .toLowerCase();


    /**
     * example.com. and example.com refer to the
     * same DNS name, so avoid treating them as
     * separate domain-state keys.
     */
    return hostname.endsWith(
        '.',
    )
        ? hostname.slice(
            0,
            -1,
        )
        : hostname;
}
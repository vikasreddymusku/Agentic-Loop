// src/request-manager/url-utils.ts

import {
    Request,
} from '@crawlee/core';

import {
    randomUUID,
} from 'node:crypto';


/**
 * Validate that a URL is syntactically valid
 * and uses an HTTP protocol that our scraper
 * currently supports.
 */
export function validateUrl(
    input: string,
): URL {

    let url: URL;


    try {

        url =
            new URL(
                input,
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


    return url;
}


/**
 * Extract normalized hostname.
 */
export function getDomain(
    input: string,
): string {

    return validateUrl(
        input,
    )
        .hostname
        .toLowerCase();
}


/**
 * Let Crawlee generate the normalized base
 * unique key for the URL.
 *
 * This keeps URL identity rules aligned with
 * Crawlee rather than creating another
 * independent URL-normalization algorithm.
 */
export function getBaseUniqueKey(
    url: string,
): string {

    const request =
        new Request({
            url,
        });


    return request.uniqueKey;
}


/**
 * Create our current time-bucketed queue key.
 *
 * IMPORTANT:
 *
 * This is NOT a true sliding deduplication window.
 *
 * Example with a 30 second bucket:
 *
 * Request A:
 * 12:00:29.999
 *
 * Request B:
 * 12:00:30.001
 *
 * They can fall into different buckets even though
 * they are only milliseconds apart.
 *
 * A future DeduplicationStore will replace this
 * with true TTL/sliding-window behaviour.
 */
export function createDeduplicationKey(
    url: string,
    windowMs: number,
    forceRefresh = false,
    nowMs = Date.now(),
): string {

    if (
        !Number.isSafeInteger(
            windowMs,
        )
        || windowMs <= 0
    ) {

        throw new Error(
            'deduplicationWindowMs must be a positive safe integer.',
        );
    }


    const baseKey =
        getBaseUniqueKey(
            url,
        );


    /**
     * forceRefresh intentionally creates a
     * completely unique queue identity.
     */
    if (
        forceRefresh
    ) {

        return (
            `${baseKey}`
            + `:force:`
            + randomUUID()
        );
    }


    const timeBucket =
        Math.floor(
            nowMs
            / windowMs,
        );


    return (
        `${baseKey}`
        + `:window:`
        + `${timeBucket}`
    );
}
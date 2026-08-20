// src/core/utils/retry-after.ts


export type RetryAfterHeaderValue =
    | string
    | readonly string[]
    | undefined;


/**
 * Parse Retry-After into milliseconds.
 *
 * Supported forms:
 *
 * Retry-After: 120
 *
 * or:
 *
 * Retry-After: Wed, 21 Oct 2015 07:28:00 GMT
 *
 * Returns undefined when the value cannot be
 * interpreted safely.
 *
 * This function does NOT apply:
 *
 * - maximum retry limits
 * - backoff
 * - jitter
 *
 * Those are policy responsibilities.
 */
export function parseRetryAfter(
    header:
        RetryAfterHeaderValue,

    nowMs =
        Date.now(),
): number | undefined {

    if (
        header === undefined
    ) {

        return undefined;
    }


    if (
        !Number.isFinite(
            nowMs,
        )
    ) {

        throw new Error(
            'nowMs must be a finite number.',
        );
    }


    const values =
        Array.isArray(
            header,
        )
            ? header
            : [header];


    /**
     * Multiple Retry-After values are unusual.
     *
     * If encountered, use the first valid one.
     */
    for (
        const value
        of values
    ) {

        const parsed =
            parseRetryAfterValue(
                value,
                nowMs,
            );


        if (
            parsed !== undefined
        ) {

            return parsed;
        }
    }


    return undefined;
}


function parseRetryAfterValue(
    rawValue: string,
    nowMs: number,
): number | undefined {

    const value =
        rawValue.trim();


    if (
        value.length === 0
    ) {

        return undefined;
    }


    /**
     * Delta-seconds.
     *
     * Only non-negative decimal integers are
     * accepted.
     *
     * "0" is valid.
     */
    if (
        /^\d+$/.test(
            value,
        )
    ) {

        const seconds =
            Number(
                value,
            );


        if (
            !Number.isSafeInteger(
                seconds,
            )
            || seconds < 0
        ) {

            return undefined;
        }


        const milliseconds =
            seconds * 1000;


        if (
            !Number.isSafeInteger(
                milliseconds,
            )
        ) {

            return undefined;
        }


        return milliseconds;
    }


    /**
     * HTTP-date.
     */
    const timestamp =
        Date.parse(
            value,
        );


    if (
        !Number.isFinite(
            timestamp,
        )
    ) {

        return undefined;
    }


    /**
     * A Retry-After date already in the past means
     * there is no additional server-requested wait.
     */
    return Math.max(
        0,
        timestamp - nowMs,
    );
}

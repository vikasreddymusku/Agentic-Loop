// src/access-controller/resolvers/confidence-signal.resolver.ts

import type {
    AccessConfig,
} from '../../config/access.config.js';

import type {
    AccessReason,
} from '../../core/contracts/access-evaluation.js';

import type {
    AccessSignal,
    DetectionSource,
    SignalResolver,
} from '../types.js';


/**
 * Resolves multiple detector signals into one
 * strongest semantic interpretation.
 *
 * Resolution order:
 *
 * 1. Minimum confidence threshold
 * 2. Higher confidence
 * 3. More authoritative source
 * 4. More specific semantic reason
 * 5. Original detector order
 *
 * The original array is never mutated.
 */
export class ConfidenceSignalResolver
implements SignalResolver {

    /**
     * Lower number = preferred when confidence ties.
     *
     * Important:
     *
     * Source priority is ONLY a tie-breaker.
     * A lower-confidence BODY signal does not
     * automatically beat a higher-confidence
     * HTTP_STATUS signal.
     */
    private static readonly SOURCE_PRIORITY:
        Readonly<Record<DetectionSource, number>> = {

            BODY:
                0,

            HEADER:
                1,

            REDIRECT:
                2,

            HTTP_STATUS:
                3,

            TRANSPORT:
                4,

            STATE:
                5,

            ROBOTS:
                6,
        };


    /**
     * Semantic tie-breaker.
     *
     * Lower number = more specific/preferred.
     *
     * This matters only when:
     *
     * confidence is equal
     * AND
     * source priority is equal.
     *
     * Example:
     *
     * CAPTCHA
     * is more specific than
     * SECURITY_CHALLENGE.
     */
    private static readonly REASON_PRIORITY:
        Readonly<Partial<Record<AccessReason, number>>> = {

            CAPTCHA:
                0,

            LOGIN_REQUIRED:
                1,

            AUTH_REQUIRED:
                2,

            ACCOUNT_RESTRICTED:
                3,

            SUBSCRIPTION_REQUIRED:
                4,

            GEO_RESTRICTED:
                5,

            RATE_LIMITED:
                6,

            ROBOTS_RESTRICTED:
                7,

            SECURITY_CHALLENGE:
                8,

            FORBIDDEN:
                9,

            NETWORK_BLOCKED:
                10,

            TLS_ERROR:
                11,

            DNS_ERROR:
                12,

            CONNECTION_ERROR:
                13,

            TIMEOUT:
                14,

            SITE_UNAVAILABLE:
                15,

            OTHER:
                100,
        };


    constructor(
        private readonly config: AccessConfig,
    ) {

        this.validateConfig();
    }


    resolve(
        signals:
            readonly AccessSignal[],
    ): AccessSignal | null {

        if (
            signals.length === 0
        ) {

            return null;
        }


        const minimumConfidence =
            this.config
                .detection
                .minimumSignalConfidence;


        /**
         * Include the original index so that if
         * everything else ties, resolution remains
         * deterministic and preserves detector order.
         */
        const candidates =
            signals
                .map(
                    (
                        signal,
                        index,
                    ) => ({
                        signal,
                        index,
                    }),
                )
                .filter(
                    ({ signal }) =>
                        this.isValidConfidence(
                            signal.confidence,
                        )
                        && signal.confidence
                            >= minimumConfidence,
                );


        if (
            candidates.length === 0
        ) {

            return null;
        }


        candidates.sort(
            (left, right) => {

                const a =
                    left.signal;

                const b =
                    right.signal;


                /**
                 * 1. Highest confidence wins.
                 */
                const confidenceDifference =
                    b.confidence
                    - a.confidence;


                if (
                    confidenceDifference
                    !== 0
                ) {

                    return confidenceDifference;
                }


                /**
                 * 2. Source tie-break.
                 */
                const sourceDifference =
                    this.getSourcePriority(
                        a.source,
                    )
                    - this.getSourcePriority(
                        b.source,
                    );


                if (
                    sourceDifference
                    !== 0
                ) {

                    return sourceDifference;
                }


                /**
                 * 3. Semantic specificity tie-break.
                 */
                const reasonDifference =
                    this.getReasonPriority(
                        a.reason,
                    )
                    - this.getReasonPriority(
                        b.reason,
                    );


                if (
                    reasonDifference
                    !== 0
                ) {

                    return reasonDifference;
                }


                /**
                 * 4. Preserve original detector
                 * ordering for a completely equal tie.
                 */
                return (
                    left.index
                    - right.index
                );
            },
        );


        return (
            candidates[0]
                ?.signal
            ?? null
        );
    }


    private getSourcePriority(
        source: DetectionSource,
    ): number {

        return (
            ConfidenceSignalResolver
                .SOURCE_PRIORITY[
                    source
                ]
        );
    }


    private getReasonPriority(
        reason: AccessReason,
    ): number {

        return (
            ConfidenceSignalResolver
                .REASON_PRIORITY[
                    reason
                ]
            ?? 50
        );
    }


    /**
     * Detectors are expected to produce confidence
     * between 0 and 1.
     *
     * Invalid detector output is ignored rather
     * than allowed to corrupt resolution.
     */
    private isValidConfidence(
        confidence: number,
    ): boolean {

        return (
            Number.isFinite(
                confidence,
            )
            && confidence >= 0
            && confidence <= 1
        );
    }


    private validateConfig():
        void {

        const minimumConfidence =
            this.config
                .detection
                .minimumSignalConfidence;


        if (
            !Number.isFinite(
                minimumConfidence,
            )
            || minimumConfidence < 0
            || minimumConfidence > 1
        ) {

            throw new Error(
                'minimumSignalConfidence must be between 0 and 1.',
            );
        }
    }
}
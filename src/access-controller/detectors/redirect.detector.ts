// src/access-controller/detectors/redirect.detector.ts

import type {
    FetchEnvelope,
} from '../../core/contracts/fetch-envelope.js';

import type {
    AccessReason,
} from '../../core/contracts/access-evaluation.js';

import type {
    AccessDetector,
    AccessSignal,
} from '../types.js';


type RedirectClassification = {
    reason: AccessReason;
    confidence: number;
    evidence: string;
};


export class RedirectDetector
implements AccessDetector {

    detect(
        envelope: FetchEnvelope,
    ): AccessSignal[] {

        /**
         * This detector only cares about an actual
         * redirect/change of destination.
         */
        const redirected =
            envelope.redirects.length > 0
            || envelope.finalUrl !== envelope.requestedUrl;


        if (
            !redirected
        ) {

            return [];
        }


        const target =
            this.parseUrl(
                envelope.finalUrl,
            );


        if (
            target === null
        ) {

            return [];
        }


        const classification =
            this.classify(
                target,
            );


        if (
            classification === null
        ) {

            /**
             * Normal redirects such as:
             *
             * http → https
             * www normalization
             * trailing slash
             * canonical page
             *
             * are not access failures.
             */
            return [];
        }


        return [
            {
                reason:
                    classification.reason,

                source:
                    'REDIRECT',

                confidence:
                    classification.confidence,

                evidence:
                    classification.evidence,
            },
        ];
    }


    private classify(
        target: URL,
    ): RedirectClassification | null {

        const path =
            target.pathname
                .toLowerCase();


        const search =
            target.search
                .toLowerCase();


        /**
         * Explicit CAPTCHA destination.
         */
        if (
            this.matchesAny(
                path,
                [
                    /\/captcha(?:\/|$)/,
                    /\/recaptcha(?:\/|$)/,
                    /\/hcaptcha(?:\/|$)/,
                    /\/human[-_]?verification(?:\/|$)/,
                ],
            )
        ) {

            return {
                reason:
                    'CAPTCHA',

                confidence:
                    0.98,

                evidence:
                    this.createEvidence(
                        target,
                        'CAPTCHA redirect',
                    ),
            };
        }


        /**
         * Security/WAF verification destinations.
         */
        if (
            this.matchesAny(
                path,
                [
                    /\/challenge(?:\/|$)/,
                    /\/security[-_]?check(?:\/|$)/,
                    /\/verify[-_]?human(?:\/|$)/,
                    /\/cdn-cgi\/challenge-platform(?:\/|$)/,
                ],
            )
        ) {

            return {
                reason:
                    'SECURITY_CHALLENGE',

                confidence:
                    0.96,

                evidence:
                    this.createEvidence(
                        target,
                        'Security challenge redirect',
                    ),
            };
        }


        /**
         * Clear login wall.
         */
        if (
            this.matchesAny(
                path,
                [
                    /\/login(?:\/|$)/,
                    /\/signin(?:\/|$)/,
                    /\/sign-in(?:\/|$)/,
                    /\/log-in(?:\/|$)/,
                    /\/accounts\/login(?:\/|$)/,
                    /\/account\/login(?:\/|$)/,
                    /\/session\/new(?:\/|$)/,
                ],
            )
        ) {

            return {
                reason:
                    'LOGIN_REQUIRED',

                confidence:
                    0.95,

                evidence:
                    this.createEvidence(
                        target,
                        'Login redirect',
                    ),
            };
        }


        /**
         * OAuth / SSO authorization flow.
         *
         * Slightly lower confidence because an
         * authorization URL is not always a normal
         * username/password login page.
         */
        if (
            this.matchesAny(
                path,
                [
                    /\/oauth(?:2)?\/authorize(?:\/|$)/,
                    /\/authorize(?:\/|$)/,
                    /\/authentication(?:\/|$)/,
                    /\/sso(?:\/|$)/,
                ],
            )
            || (
                search.includes(
                    'client_id=',
                )
                && search.includes(
                    'redirect_uri=',
                )
            )
        ) {

            return {
                reason:
                    'AUTH_REQUIRED',

                confidence:
                    0.90,

                evidence:
                    this.createEvidence(
                        target,
                        'Authentication redirect',
                    ),
            };
        }


        return null;
    }


    private matchesAny(
        value: string,
        patterns: readonly RegExp[],
    ): boolean {

        return patterns.some(
            pattern =>
                pattern.test(
                    value,
                ),
        );
    }


    private parseUrl(
        value: string,
    ): URL | null {

        try {

            return new URL(
                value,
            );

        } catch {

            /**
             * FastFetcher should normally provide
             * a valid final URL.
             *
             * A malformed value should not make
             * this detector crash the whole access
             * evaluation pipeline.
             */
            return null;
        }
    }


    /**
     * Do not include query parameters in evidence.
     *
     * Authentication redirects can contain tokens,
     * state values or other sensitive parameters.
     */
    private createEvidence(
        target: URL,
        description: string,
    ): string {

        return (
            `${description}: `
            + `${target.origin}${target.pathname}`
        );
    }
}
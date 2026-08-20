// src/access-controller/detectors/http-status.detector.ts

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


type StatusClassification = {
    reason: AccessReason;
    confidence: number;
};


/**
 * Detects access-related conditions directly from
 * the final HTTP status code.
 *
 * IMPORTANT:
 *
 * This detector intentionally does not make the
 * final decision.
 *
 * Example:
 *
 * HTTP 403
 *     ↓
 * FORBIDDEN confidence 0.70
 *
 * Later ChallengeDetector might detect:
 *
 * CAPTCHA confidence 0.98
 *
 * SignalResolver can therefore prefer CAPTCHA.
 */
export class HttpStatusDetector
implements AccessDetector {

    detect(
        envelope: FetchEnvelope,
    ): AccessSignal[] {

        const statusCode =
            envelope.statusCode;


        /**
         * statusCode 0 means no HTTP response.
         *
         * TransportErrorDetector owns that case.
         */
        if (
            statusCode === 0
        ) {

            return [];
        }


        const classification =
            this.classify(
                statusCode,
            );


        if (
            classification === null
        ) {

            return [];
        }


        return [
            {
                reason:
                    classification.reason,

                source:
                    'HTTP_STATUS',

                confidence:
                    classification.confidence,

                evidence:
                    `HTTP status ${statusCode}`,
            },
        ];
    }


    private classify(
        statusCode: number,
    ): StatusClassification | null {

        switch (
            statusCode
        ) {

            /**
             * Authentication required.
             */
            case 401:

                return {
                    reason:
                        'AUTH_REQUIRED',

                    confidence:
                        1.00,
                };


            /**
             * Forbidden is intentionally assigned
             * lower confidence.
             *
             * 403 can actually represent:
             *
             * CAPTCHA
             * WAF/security challenge
             * geo restriction
             * login/session problem
             * genuine permission denial
             *
             * Other detectors may provide a more
             * precise classification.
             */
            case 403:

                return {
                    reason:
                        'FORBIDDEN',

                    confidence:
                        0.70,
                };


            /**
             * Server-side request timeout.
             */
            case 408:

                return {
                    reason:
                        'TIMEOUT',

                    confidence:
                        0.95,
                };


            /**
             * Rate limiting.
             */
            case 429:

                return {
                    reason:
                        'RATE_LIMITED',

                    confidence:
                        1.00,
                };


            /**
             * Explicit legal restriction.
             *
             * We currently do not have a dedicated
             * LEGAL_RESTRICTION semantic reason.
             *
             * FORBIDDEN is the closest controlled
             * classification for now.
             */
            case 451:

                return {
                    reason:
                        'FORBIDDEN',

                    confidence:
                        0.90,
                };


            /**
             * Generic server failure.
             */
            case 500:

                return {
                    reason:
                        'SITE_UNAVAILABLE',

                    confidence:
                        0.85,
                };


            /**
             * Bad Gateway.
             */
            case 502:

                return {
                    reason:
                        'SITE_UNAVAILABLE',

                    confidence:
                        0.95,
                };


            /**
             * Service Unavailable.
             */
            case 503:

                return {
                    reason:
                        'SITE_UNAVAILABLE',

                    confidence:
                        1.00,
                };


            /**
             * Gateway Timeout.
             */
            case 504:

                return {
                    reason:
                        'SITE_UNAVAILABLE',

                    confidence:
                        0.95,
                };


            /**
             * Network Authentication Required.
             *
             * This generally represents an
             * intermediary/network barrier rather
             * than application login.
             */
            case 511:

                return {
                    reason:
                        'NETWORK_BLOCKED',

                    confidence:
                        0.90,
                };


            default:

                return null;
        }
    }
}
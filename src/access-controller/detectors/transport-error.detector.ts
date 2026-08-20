// src/access-controller/detectors/transport-error.detector.ts

import type {
    FetchEnvelope,
    TransportError,
    TransportErrorType,
} from '../../core/contracts/fetch-envelope.js';

import type {
    AccessReason,
} from '../../core/contracts/access-evaluation.js';

import type {
    AccessDetector,
    AccessSignal,
    FailurePhase,
} from '../types.js';


/**
 * Converts transport-level failures produced by
 * FastFetcher into semantic access signals.
 *
 * This detector does NOT decide whether to retry,
 * deny, or ask for user action.
 *
 * That belongs to AccessPolicy.
 */
export class TransportErrorDetector
implements AccessDetector {

    detect(
        envelope: FetchEnvelope,
    ): AccessSignal[] {

        const signals:
            AccessSignal[] = [];


        /**
         * Failure before a valid HTTP response
         * was obtained.
         *
         * Typical envelope:
         *
         * statusCode: 0
         * transportError: {...}
         */
        if (
            envelope.transportError
        ) {

            signals.push(
                this.createSignal(
                    envelope.transportError,
                    'PRE_RESPONSE',
                ),
            );
        }


        /**
         * Failure while consuming the body after
         * HTTP status/headers were received.
         *
         * Example:
         *
         * statusCode: 200
         * bodyError: ECONNRESET
         */
        if (
            envelope.bodyError
        ) {

            signals.push(
                this.createSignal(
                    envelope.bodyError,
                    'BODY',
                ),
            );
        }


        return signals;
    }


    private createSignal(
        error: TransportError,
        failurePhase: FailurePhase,
    ): AccessSignal {

        return {
            reason:
                this.mapReason(
                    error.type,
                ),

            source:
                'TRANSPORT',

            /**
             * FastFetcher has already explicitly
             * classified this low-level error.
             *
             * Therefore confidence is high.
             */
            confidence:
                error.type === 'OTHER'
                    ? 0.60
                    : 1.00,

            failurePhase,

            evidence:
                this.createEvidence(
                    error,
                    failurePhase,
                ),
        };
    }


    private mapReason(
        type: TransportErrorType,
    ): AccessReason {

        switch (type) {

            case 'TIMEOUT':
                return 'TIMEOUT';

            case 'DNS_ERROR':
                return 'DNS_ERROR';

            case 'TLS_ERROR':
                return 'TLS_ERROR';

            case 'CONNECTION_ERROR':
                return 'CONNECTION_ERROR';

            case 'OTHER':
                return 'OTHER';

            default:
                return this.assertNever(
                    type,
                );
        }
    }


    private createEvidence(
        error: TransportError,
        phase: FailurePhase,
    ): string {

        const parts = [
            phase === 'PRE_RESPONSE'
                ? 'Transport failed before HTTP response'
                : 'Response body transport failed',

            `type=${error.type}`,
        ];


        if (
            error.code
        ) {

            parts.push(
                `code=${error.code}`,
            );
        }


        return parts.join(
            '; ',
        );
    }


    private assertNever(
        value: never,
    ): never {

        throw new Error(
            `Unhandled TransportErrorType: ${String(value)}`,
        );
    }
}
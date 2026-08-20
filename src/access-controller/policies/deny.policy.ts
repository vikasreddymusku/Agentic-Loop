import type {
    AccessEvaluation,
    DeniedAccessReason,
} from '../../core/contracts/access-evaluation.js';

import type {
    AccessPolicy,
    AccessPolicyContext,
    AccessSignal,
} from '../types.js';


export class DenyPolicy
implements AccessPolicy {

    supports(
        signal: AccessSignal,
    ): boolean {

        return this.isSupportedReason(
            signal.reason,
        );
    }


    async evaluate(
        signal: AccessSignal,
        _context: AccessPolicyContext,
    ): Promise<AccessEvaluation> {

        if (
            !this.isSupportedReason(
                signal.reason,
            )
        ) {

            throw new Error(
                `DenyPolicy does not support reason: ${signal.reason}`,
            );
        }


        return {
            decision:
                'DENY',

            reason:
                signal.reason,

            message:
                this.getMessage(
                    signal.reason,
                ),
        };
    }


    private isSupportedReason(
        reason: AccessSignal['reason'],
    ): reason is DeniedAccessReason {

        return (
            reason === 'FORBIDDEN'
            || reason === 'ROBOTS_RESTRICTED'
            || reason === 'ACCOUNT_RESTRICTED'
            || reason === 'GEO_RESTRICTED'
            || reason === 'SUBSCRIPTION_REQUIRED'
            || reason === 'TLS_ERROR'
            || reason === 'OTHER'
        );
    }


    private getMessage(
        reason: DeniedAccessReason,
    ): string {

        switch (
            reason
        ) {

            case 'FORBIDDEN':

                return (
                    'Access to the requested resource is forbidden.'
                );


            case 'ROBOTS_RESTRICTED':

                return (
                    'Crawling this resource is not permitted by the configured robots policy.'
                );


            case 'ACCOUNT_RESTRICTED':

                return (
                    'The account associated with this resource is restricted.'
                );


            case 'GEO_RESTRICTED':

                return (
                    'The requested resource is unavailable from the current region.'
                );


            case 'SUBSCRIPTION_REQUIRED':

                return (
                    'Authorized subscription access is required for this resource.'
                );


            case 'TLS_ERROR':

                return (
                    'A TLS security failure prevented a trusted connection.'
                );


            case 'OTHER':

                return (
                    'Access could not be safely classified or continued.'
                );


            default:

                return this.assertNever(
                    reason,
                );
        }
    }


    private assertNever(
        value: never,
    ): never {

        throw new Error(
            `Unhandled DeniedAccessReason: ${String(value)}`,
        );
    }
}
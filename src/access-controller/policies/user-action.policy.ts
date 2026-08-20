import type {
    AccessEvaluation,
    UserActionAccessReason,
    UserActionType,
} from '../../core/contracts/access-evaluation.js';

import type {
    AccessPolicy,
    AccessPolicyContext,
    AccessSignal,
} from '../types.js';


export class UserActionPolicy
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
        context: AccessPolicyContext,
    ): Promise<AccessEvaluation> {

        if (
            !this.isSupportedReason(
                signal.reason,
            )
        ) {

            throw new Error(
                `UserActionPolicy does not support reason: ${signal.reason}`,
            );
        }


        const reason =
            signal.reason;


        return {
            decision:
                'USER_ACTION_REQUIRED',

            reason,

            action:
                this.getAction(
                    reason,
                ),

            message:
                this.getMessage(
                    reason,
                ),

            actionUrl:
                this.getActionUrl(
                    context,
                ),
        };
    }


    private isSupportedReason(
        reason: AccessSignal['reason'],
    ): reason is UserActionAccessReason {

        return (
            reason === 'CAPTCHA'
            || reason === 'LOGIN_REQUIRED'
            || reason === 'AUTH_REQUIRED'
            || reason === 'SECURITY_CHALLENGE'
            || reason === 'NETWORK_BLOCKED'
        );
    }


    private getAction(
        reason: UserActionAccessReason,
    ): UserActionType {

        switch (
            reason
        ) {

            case 'CAPTCHA':

                return 'CAPTCHA';


            case 'LOGIN_REQUIRED':
            case 'AUTH_REQUIRED':

                return 'LOGIN';


            case 'SECURITY_CHALLENGE':
            case 'NETWORK_BLOCKED':

                return 'MANUAL_INTERVENTION';


            default:

                return this.assertNever(
                    reason,
                );
        }
    }


    private getMessage(
        reason: UserActionAccessReason,
    ): string {

        switch (
            reason
        ) {

            case 'CAPTCHA':

                return (
                    'Human verification is required before scraping can continue.'
                );


            case 'LOGIN_REQUIRED':

                return (
                    'Login is required before scraping can continue.'
                );


            case 'AUTH_REQUIRED':

                return (
                    'Authentication is required before scraping can continue.'
                );


            case 'SECURITY_CHALLENGE':

                return (
                    'A security verification challenge requires manual intervention.'
                );


            case 'NETWORK_BLOCKED':

                return (
                    'Network access requires manual intervention before scraping can continue.'
                );


            default:

                return this.assertNever(
                    reason,
                );
        }
    }


    private getActionUrl(
        context: AccessPolicyContext,
    ): string {

        const finalUrl =
            context
                .envelope
                .finalUrl
                .trim();


        if (
            finalUrl.length > 0
        ) {

            return finalUrl;
        }


        return context
            .job
            .url;
    }


    private assertNever(
        value: never,
    ): never {

        throw new Error(
            `Unhandled UserActionAccessReason: ${String(value)}`,
        );
    }
}
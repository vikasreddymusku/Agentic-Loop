// src/core/contracts/access-evaluation.ts

/**
 * Final routing decision produced by AccessController.
 */
export type AccessDecision =
    | 'ALLOW'
    | 'RETRY_LATER'
    | 'USER_ACTION_REQUIRED'
    | 'DENY';


/**
 * Complete semantic vocabulary understood by
 * the access layer.
 *
 * These are intentionally independent of
 * raw HTTP status codes.
 */
export type AccessReason =
    | 'RATE_LIMITED'
    | 'AUTH_REQUIRED'
    | 'FORBIDDEN'
    | 'CAPTCHA'
    | 'LOGIN_REQUIRED'
    | 'ROBOTS_RESTRICTED'
    | 'ACCOUNT_RESTRICTED'
    | 'GEO_RESTRICTED'
    | 'NETWORK_BLOCKED'
    | 'CONNECTION_ERROR'
    | 'SUBSCRIPTION_REQUIRED'
    | 'SECURITY_CHALLENGE'
    | 'SITE_UNAVAILABLE'
    | 'TIMEOUT'
    | 'DNS_ERROR'
    | 'TLS_ERROR'
    | 'OTHER';


/**
 * Reasons for which retrying later may make sense.
 */
export type RetryableAccessReason =
    | 'RATE_LIMITED'
    | 'SITE_UNAVAILABLE'
    | 'TIMEOUT'
    | 'DNS_ERROR'
    | 'CONNECTION_ERROR';


/**
 * Reasons requiring external/user intervention.
 */
export type UserActionAccessReason =
    | 'CAPTCHA'
    | 'AUTH_REQUIRED'
    | 'LOGIN_REQUIRED'
    | 'SECURITY_CHALLENGE'
    | 'NETWORK_BLOCKED';

/**
 * Reasons where automated processing should stop.
 */
export type DeniedAccessReason =
    | 'FORBIDDEN'
    | 'ROBOTS_RESTRICTED'
    | 'ACCOUNT_RESTRICTED'
    | 'GEO_RESTRICTED'
    | 'SUBSCRIPTION_REQUIRED'
    | 'TLS_ERROR'
    | 'OTHER';


export type UserActionType =
    | 'CAPTCHA'
    | 'LOGIN'
    | 'SESSION_EXPIRED'
    | 'MFA_CHALLENGE'
    | 'MANUAL_INTERVENTION';


export type AccessAllowed = {
    decision: 'ALLOW';

    message?: string;
};


export type AccessRetryLater = {
    decision: 'RETRY_LATER';

    reason: RetryableAccessReason;

    /**
     * Minimum time before another access attempt.
     */
    retryAfterMs: number;

    message: string;
};


export type AccessUserActionRequired = {
    decision: 'USER_ACTION_REQUIRED';

    reason: UserActionAccessReason;

    action: UserActionType;

    message: string;

    /**
     * Optional URL / interactive-session reference
     * that can be surfaced to the UI.
     */
    actionUrl?: string;
};


export type AccessDenied = {
    decision: 'DENY';

    reason: DeniedAccessReason;

    message: string;
};


export type AccessEvaluation =
    | AccessAllowed
    | AccessRetryLater
    | AccessUserActionRequired
    | AccessDenied;
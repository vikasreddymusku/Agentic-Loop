// src/access-controller/types.ts

import type {
    ScrapeJob,
} from '../core/contracts/scrape-job.js';

import type {
    FetchEnvelope,
} from '../core/contracts/fetch-envelope.js';

import type {
    AccessEvaluation,
    AccessReason,
} from '../core/contracts/access-evaluation.js';

import type {
    AccessConfig,
} from '../config/access.config.js';

import type {
    AccessStateStore,
} from './state/state-store.js';


export type DetectionSource =
    | 'TRANSPORT'
    | 'HTTP_STATUS'
    | 'HEADER'
    | 'REDIRECT'
    | 'BODY'
    | 'ROBOTS'
    | 'STATE';


/**
 * Used only when a signal originates from
 * network/body transport failure.
 */
export type FailurePhase =
    | 'PRE_RESPONSE'
    | 'BODY';


/**
 * Evidence produced by detectors.
 *
 * Detectors do NOT decide what action to take.
 */
export type AccessSignal = {

    reason: AccessReason;

    source: DetectionSource;

    /**
     * Confidence in this classification.
     *
     * Expected range:
     * 0.0 → 1.0
     */
    confidence: number;

    /**
     * Relevant only to transport-related signals.
     */
    failurePhase?: FailurePhase;

    /**
     * Short diagnostic information.
     *
     * Examples:
     *
     * "HTTP status 429"
     * "Redirected to /login"
     * "body contains human verification message"
     */
    evidence?: string;
};


/**
 * Pure detection contract.
 *
 * Example implementations:
 *
 * TransportErrorDetector
 * HttpStatusDetector
 * RedirectDetector
 * ChallengeDetector
 */
export interface AccessDetector {

    detect(
        envelope: FetchEnvelope,
    ): AccessSignal[];
}


/**
 * Resolves multiple signals into the strongest
 * semantic interpretation.
 */
export interface SignalResolver {

    resolve(
        signals: readonly AccessSignal[],
    ): AccessSignal | null;
}


/**
 * Information available when policy decisions
 * are being made.
 */
export type AccessPolicyContext = {

    /**
     * Needed for user/session/workspace metadata.
     */
    job: ScrapeJob;

    envelope: FetchEnvelope;

    config: AccessConfig;

    stateStore: AccessStateStore;
};


/**
 * Policy converts a detected semantic reason
 * into an application action.
 */
export interface AccessPolicy {

    supports(
        signal: AccessSignal,
    ): boolean;


    evaluate(
        signal: AccessSignal,
        context: AccessPolicyContext,
    ): Promise<AccessEvaluation>;
}


/**
 * Public AccessController contract.
 */
export interface IAccessController {

    /**
     * Checks known state before performing another
     * network request.
     *
     * Examples:
     *
     * active rate-limit cooldown
     * known robots restriction
     */
    preflight(
        job: ScrapeJob,
    ): Promise<AccessEvaluation>;


    /**
     * Analyze the actual FetchEnvelope after
     * FastFetcher finishes.
     */
    evaluate(
        job: ScrapeJob,
        envelope: FetchEnvelope,
    ): Promise<AccessEvaluation>;
}
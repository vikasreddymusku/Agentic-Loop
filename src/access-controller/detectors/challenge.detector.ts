// src/access-controller/detectors/challenge.detector.ts

import type {
    AccessConfig,
} from '../../config/access.config.js';

import type {
    FetchEnvelope,
    FetchHeaders,
} from '../../core/contracts/fetch-envelope.js';

import type {
    AccessDetector,
    AccessSignal,
} from '../types.js';


export class ChallengeDetector
implements AccessDetector {

    private readonly maxInspectionBytes:
        number;


    constructor(
        config: AccessConfig,
    ) {

        const maxInspectionBytes =
            config
                .detection
                .maxBodyInspectionBytes;


        if (
            !Number.isSafeInteger(
                maxInspectionBytes,
            )
            || maxInspectionBytes <= 0
        ) {

            throw new Error(
                'maxBodyInspectionBytes must be a positive safe integer.',
            );
        }


        this.maxInspectionBytes =
            maxInspectionBytes;
    }


    detect(
        envelope: FetchEnvelope,
    ): AccessSignal[] {

        if (
            envelope.rawBody === null
        ) {

            return [];
        }


        /**
         * Avoid interpreting obvious binary data as
         * HTML/text.
         */
        if (
            !this.isInspectableContentType(
                envelope.headers,
            )
        ) {

            return [];
        }


        const body =
            this.readInspectionBody(
                envelope.rawBody,
            );


        if (
            body.length === 0
        ) {

            return [];
        }


        const normalized =
            body
                .toLowerCase();


        const signals:
            AccessSignal[] = [];


        const captcha =
            this.detectCaptcha(
                normalized,
            );


        if (
            captcha
        ) {

            signals.push(
                captcha,
            );
        }


        const login =
            this.detectLoginWall(
                normalized,
            );


        if (
            login
        ) {

            signals.push(
                login,
            );
        }


        const security =
            this.detectSecurityChallenge(
                normalized,
            );


        if (
            security
        ) {

            signals.push(
                security,
            );
        }


        return signals;
    }


    private detectCaptcha(
        body: string,
    ): AccessSignal | null {

        /**
         * Strong machine-readable CAPTCHA markers.
         */
        const technicalMarkers = [
            'g-recaptcha',
            'grecaptcha.',
            'h-captcha',
            'hcaptcha',
            'cf-turnstile',
            'challenges.cloudflare.com/turnstile',
        ];


        if (
            this.containsAny(
                body,
                technicalMarkers,
            )
        ) {

            return {
                reason:
                    'CAPTCHA',

                source:
                    'BODY',

                confidence:
                    0.99,

                evidence:
                    'Body contains an explicit CAPTCHA integration marker.',
            };
        }


        /**
         * Strong human-verification phrases.
         */
        const verificationMarkers = [
            'verify you are human',
            'verify that you are human',
            'confirm you are human',
            'prove you are human',
            'i am not a robot',
            "i'm not a robot",
        ];


        if (
            this.containsAny(
                body,
                verificationMarkers,
            )
        ) {

            return {
                reason:
                    'CAPTCHA',

                source:
                    'BODY',

                confidence:
                    0.98,

                evidence:
                    'Body contains a human-verification challenge.',
            };
        }


        /**
         * The word "captcha" by itself is weaker:
         *
         * a documentation/blog page could discuss
         * CAPTCHAs without actually presenting one.
         */
        if (
            body.includes(
                'captcha',
            )
        ) {

            return {
                reason:
                    'CAPTCHA',

                source:
                    'BODY',

                confidence:
                    0.72,

                evidence:
                    'Body contains a CAPTCHA reference.',
            };
        }


        return null;
    }


    private detectLoginWall(
        body: string,
    ): AccessSignal | null {

        const strongMarkers = [
            'sign in to continue',
            'signin to continue',
            'log in to continue',
            'login to continue',
            'please sign in to continue',
            'please log in to continue',
            'you must be logged in',
            'you must be signed in',
        ];


        if (
            this.containsAny(
                body,
                strongMarkers,
            )
        ) {

            return {
                reason:
                    'LOGIN_REQUIRED',

                source:
                    'BODY',

                confidence:
                    0.97,

                evidence:
                    'Body contains an explicit login-required message.',
            };
        }


        /**
         * A password form plus login-related text is
         * substantially stronger evidence than the
         * word "login" alone.
         */
        const hasPasswordInput =
            /<input[^>]+type\s*=\s*["']?password["']?/i
                .test(
                    body,
                );


        const hasLoginText =
            body.includes(
                'sign in',
            )
            || body.includes(
                'log in',
            )
            || body.includes(
                'login',
            );


        if (
            hasPasswordInput
            && hasLoginText
        ) {

            return {
                reason:
                    'LOGIN_REQUIRED',

                source:
                    'BODY',

                confidence:
                    0.94,

                evidence:
                    'Body contains a password form and login controls.',
            };
        }


        return null;
    }


    private detectSecurityChallenge(
        body: string,
    ): AccessSignal | null {

        /**
         * Strong challenge implementation markers.
         */
        const technicalMarkers = [
            'cf-chl-',
            '/cdn-cgi/challenge-platform/',
            'challenge-platform',
        ];


        if (
            this.containsAny(
                body,
                technicalMarkers,
            )
        ) {

            return {
                reason:
                    'SECURITY_CHALLENGE',

                source:
                    'BODY',

                confidence:
                    0.99,

                evidence:
                    'Body contains an explicit security-challenge implementation marker.',
            };
        }


        const strongPhrases = [
            'checking your browser before accessing',
            'checking if the site connection is secure',
            'performing security verification',
            'security verification required',
            'browser verification',
        ];


        if (
            this.containsAny(
                body,
                strongPhrases,
            )
        ) {

            return {
                reason:
                    'SECURITY_CHALLENGE',

                source:
                    'BODY',

                confidence:
                    0.96,

                evidence:
                    'Body contains a browser/security verification challenge.',
            };
        }


        /**
         * These phrases alone are less precise.
         * Require two pieces of evidence.
         */
        const hasSecurityLanguage =
            body.includes(
                'security check',
            )
            || body.includes(
                'security challenge',
            );


        const hasVerificationLanguage =
            body.includes(
                'verify',
            )
            || body.includes(
                'verification',
            )
            || body.includes(
                'continue',
            );


        if (
            hasSecurityLanguage
            && hasVerificationLanguage
        ) {

            return {
                reason:
                    'SECURITY_CHALLENGE',

                source:
                    'BODY',

                confidence:
                    0.90,

                evidence:
                    'Body contains correlated security and verification markers.',
            };
        }


        return null;
    }


    private readInspectionBody(
        body: Buffer | string,
    ): string {

        /**
         * Convert through Buffer even when the
         * FetchEnvelope contains a string so that
         * the configured limit is measured in
         * BYTES, not JavaScript characters.
         */
        const buffer =
            Buffer.isBuffer(
                body,
            )
                ? body
                : Buffer.from(
                    body,
                    'utf8',
                );


        return buffer
            .subarray(
                0,
                this.maxInspectionBytes,
            )
            .toString(
                'utf8',
            );
    }


    private isInspectableContentType(
        headers: FetchHeaders,
    ): boolean {

        const raw =
            headers[
                'content-type'
            ];


        /**
         * Missing Content-Type is common enough that
         * we should still inspect the body.
         */
        if (
            raw === undefined
        ) {

            return true;
        }


        const value =
            (
                Array.isArray(
                    raw,
                )
                    ? raw[0]
                    : raw
            )
                ?.toLowerCase();


        if (
            !value
        ) {

            return true;
        }


        return (
            value.startsWith(
                'text/',
            )
            || value.includes(
                'application/xhtml+xml',
            )
            || value.includes(
                'application/xml',
            )
            || value.includes(
                'application/json',
            )
            || value.includes(
                'application/javascript',
            )
        );
    }


    private containsAny(
        body: string,
        markers: readonly string[],
    ): boolean {

        return markers.some(
            marker =>
                body.includes(
                    marker,
                ),
        );
    }
}
import type {
    AccessUserActionRequired,
} from '../../core/contracts/access-evaluation.js';

import type {
    QueuedScrapeJob,
} from '../../request-manager/types.js';


export type PendingAction = {

    queuedJob:
        QueuedScrapeJob;

    evaluation:
        AccessUserActionRequired;

    createdAt:
        string;

    /**
     * Future browser/session reference.
     *
     * Credentials, cookies, auth tokens and CAPTCHA
     * tokens themselves must NOT be stored here.
     */
    sessionRef?:
        string;
};


export interface PendingActionStore {

    set(
        action:
            PendingAction,
    ): Promise<void>;


    get(
        jobId:
            string,
    ): Promise<PendingAction | null>;


    delete(
        jobId:
            string,
    ): Promise<void>;


    list():
        Promise<PendingAction[]>;
}
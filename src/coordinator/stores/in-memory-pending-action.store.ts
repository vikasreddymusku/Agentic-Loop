import type {
    PendingAction,
    PendingActionStore,
} from '../contracts/pending-action-store.js';


export class InMemoryPendingActionStore
implements PendingActionStore {

    private readonly actions =
        new Map<
            string,
            PendingAction
        >();


    async set(
        action:
            PendingAction,
    ): Promise<void> {

        const jobId =
            action
                .queuedJob
                .job
                .id;


        if (
            jobId.trim()
                .length === 0
        ) {

            throw new Error(
                'Pending action requires a job id.',
            );
        }


        /**
         * Store a defensive snapshot so callers
         * cannot mutate pending state after set().
         */
        this.actions.set(
            jobId,
            structuredClone(
                action,
            ),
        );
    }


    async get(
        jobId:
            string,
    ): Promise<PendingAction | null> {

        const action =
            this.actions.get(
                jobId,
            );


        if (
            action === undefined
        ) {

            return null;
        }


        /**
         * Return a clone so callers cannot mutate
         * the internal store by reference.
         */
        return structuredClone(
            action,
        );
    }


    async delete(
        jobId:
            string,
    ): Promise<void> {

        this.actions.delete(
            jobId,
        );
    }


    async list():
        Promise<PendingAction[]> {

        return [
            ...this.actions.values(),
        ].map(
            action =>
                structuredClone(
                    action,
                ),
        );
    }
}
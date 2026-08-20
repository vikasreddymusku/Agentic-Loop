import {
    defineConfig,
} from 'vitest/config';


export default defineConfig({

    test: {

        /**
         * Run tests only from source.
         *
         * Prevent compiled dist/*.test.js files
         * from being executed a second time.
         */
        include: [
            'src/**/*.test.ts',
        ],
    },
});
import type {
    FastFetcherConfig,
} from '../fetcher/types.js';

export const FETCHER_CONFIG: FastFetcherConfig = {
    timeoutMs: 15_000,

    maxBodySizeBytes:
        10 * 1024 * 1024,

    maxRedirects: 10,
};
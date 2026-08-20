import type {
    FetchEnvelope,
} from '../fetch-envelope.js';

import type {
    ScrapeJob,
} from '../scrape-job.js';


export type ParserInput = {

    job:
        ScrapeJob;

    envelope:
        FetchEnvelope;
};
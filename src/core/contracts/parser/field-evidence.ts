import type {
    ExtractionSource,
    ExtractionVocabulary,
} from './extraction-source.js';


export type FieldEvidence = {

    /**
     * Stable extractor identifier.
     *
     * Examples:
     *
     * json-ld
     * meta
     * microdata
     * dom-pattern
     */
    extractorId:
        string;

    source:
        ExtractionSource;

    vocabulary?:
        ExtractionVocabulary;

    /**
     * Where the value came from.
     *
     * Examples:
     *
     * $[0].name
     * meta[property="og:title"]
     * [itemprop="telephone"]
     * .business-phone
     */
    location:
        string;

    /**
     * Small diagnostic sample only.
     *
     * Do not store large HTML blocks here.
     */
    snippet?:
        string;
};
import type {
    ExtractionSource,
    ExtractionVocabulary,
} from './extraction-source.js';


/**
 * Raw structured property discovered by an
 * extractor BEFORE matching it to a requested
 * output field.
 *
 * Examples:
 *
 * JSON-LD:
 * {
 *   key: 'price',
 *   path: '$.offers.price',
 *   value: 24999
 * }
 *
 * Microdata:
 * {
 *   key: 'title',
 *   path: 'itemscope[0] [itemprop="title"]',
 *   value: 'Data Analyst'
 * }
 */
export type DiscoveredProperty = {

    /**
     * Raw source property name.
     *
     * Examples:
     *
     * name
     * title
     * price
     * ratingValue
     */
    key:
        string;

    /**
     * Exact source location/path.
     *
     * Examples:
     *
     * $.name
     * $.offers.price
     * meta[property="og:title"]
     */
    path:
        string;

    value:
        string
        | number
        | boolean
        | string[]
        | null;

    source:
        ExtractionSource;

    vocabulary?:
        ExtractionVocabulary;

    extractorId:
        string;

    /**
     * Opaque reference to the exact source evidence
     * item that produced this property.
     *
     * Interpretation depends on `source`.
     *
     * For NETWORK properties this contains the
     * originating NetworkResponse.id.
     */
    sourceRef?:
        string;

    /**
     * Diagnostic preview only.
     *
     * Extractors must keep this at or below
     * 50 characters.
     */
    snippet?:
        string;
};
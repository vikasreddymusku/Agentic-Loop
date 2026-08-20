import type {
    DiscoveredProperty,
} from './discovered-property.js';

import type {
    ExtractionWarning,
} from './extraction-result.js';

import type {
    ParserInput,
} from './parser-input.js';


export type ExtractorOutput = {

    discovered:
        DiscoveredProperty[];

    warnings:
        ExtractionWarning[];
};


export interface DeterministicExtractor {

    readonly id:
        string;

    supports(
        input:
            ParserInput,
    ): boolean;

    extract(
        input:
            ParserInput,
    ): Promise<ExtractorOutput>;
}
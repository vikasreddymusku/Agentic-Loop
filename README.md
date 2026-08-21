Agentic Loop – Universal Adaptive Web Scraping Engine

Agentic Loop is a universal, adaptive web scraping engine designed to scrape different websites and dynamically extract whatever fields the user requests.

The long-term goal is to build a scraper that can detect extraction failures, classify them correctly, adapt to website changes, validate generated fixes, and eventually self-heal automatically.

Core principle: Deterministic first. AI last. Validate before promotion.

What I Am Building

Agent Request
    ↓
ScrapeJob + RequestedField[]
    ↓
RequestManager
    ↓
Crawlee RequestQueue
    ↓
BasicCrawler
    ↓
Coordinator
    ↓
AccessController
    ↓
FastFetcher
    ↓
FetchEnvelope
    ↓
Deterministic Parser Pipeline
    ├─ JSON-LD
    ├─ Meta
    ├─ Microdata
    └─ DOM
    ↓
Field Matching
    ↓
Field Resolution
    ↓
Normalization
    ↓
Validation
    ↓
Parser Outcome Policy
    ↓
SUCCESS / PARSER_FAILED

Dynamic evidence path:

PlaywrightRenderer
    ↓
Rendered DOM + Browser Network Evidence
    ├─ HTML / DOM
    └─ XHR / Fetch responses
    ↓
Future Network/API Extractor
    ↓
Future Failure Classification
    ↓
Future Self-Healing

The system is designed to support:

Job websites

E-commerce websites

News websites

Product/catalog websites

Public/social pages

Structured-data-heavy websites

JavaScript-heavy websites

Other websites with arbitrary requested fields

It is not limited to one website type or fixed business fields.

Current Progress

✅ Crawling & Request Foundation

Implemented:

RequestManager

Crawlee RequestQueue

BasicCrawler

Coordinator

Logical ScrapeJob lifecycle

Retry lifecycle

Deferred retry scheduler

Pending user-action store

Runtime job state

Shared HTTP client architecture

Parser lifecycle integration

Coordinator → ParserPipeline integration

✅ Access Layer

AccessController supports:

ALLOW
RETRY_LATER
USER_ACTION_REQUIRED
DENY

Current handling includes:

Rate limits / 429

Authentication requirements

Forbidden responses

CAPTCHA/security challenges

Login requirements

Redirect analysis

Network/transport failures

Retry scheduling

Human-action pausing and resuming

Access failure is intentionally kept separate from parser failure.

✅ Fetch Layer

FastFetcher produces a structured FetchEnvelope preserving:

Requested URL

Final URL

HTTP method

Status code

Headers

Redirect chain

Timing

Raw response body

Body byte count

Body truncation state

Content length

Transport errors

Body-read errors

Universal Requested Schema

Each scraping job defines its requested fields dynamically through:

RequestedField[]

Example:

{
    name: 'price',
    type: 'number',
    aliases: ['salePrice', 'currentPrice'],
    paths: ['offers.price'],
    required: true,
}

Supported types:

string
number
boolean
array

There are no fixed business-specific output fields.

Universal Deterministic Data Discovery

Current deterministic extractors output:

DiscoveredProperty[]

Extraction is intentionally separated from requested-field matching.

✅ JSON-LD Extractor

Supports arbitrary JSON-LD structures including nested objects, arrays, @graph, Schema.org types, and custom structures.

Example paths:

$.offers.price
$.hiringOrganization.name
$.address.addressLocality

✅ Meta Extractor

Discovers generic metadata such as:

title
description
author
robots
og:title
og:url
og:image
og:description
twitter:title
twitter:description
article:author

✅ Microdata Extractor

Supports generic itemscope, itemtype, and itemprop structures, including nested objects.

✅ DOM Extractor — Phase 11 Complete

The universal DOM extractor discovers field-agnostic values from rendered/static HTML using:

Semantic IDs/classes

data-* attributes

Generic data-field / data-value

dt / dd

Tables

Labels and form values

Sibling label/value pairs

time[datetime]

Semantic anchors

Headings

Stable CSS paths

Duplicate suppression

Hidden-element filtering

Utility/generated identifier filtering

Generic container-noise suppression

Bounded scans and warnings

Phase 11 refinements also prevent false positives from large container text and heading-to-sibling misclassification.

Verified: 28 DOM extractor tests passing.

✅ FieldMatcher

FieldMatcher connects:

RequestedField[]
        +
DiscoveredProperty[]
        ↓
DefaultFieldMatcher
        ↓
FieldExtraction[]

Matching priority:

1. Explicit path
2. Exact field name
3. Explicit alias
4. Normalized identifier
5. Conservative synonym mapping

Multiple candidates are preserved for FieldResolver.

✅ ParserOrchestrator

ParserOrchestrator:

Runs supported deterministic extractors

Aggregates discovered properties

Aggregates warnings

Calls FieldMatcher

Groups candidates by requested field

Calculates missing fields

Current deterministic parser flow:

FetchEnvelope
    ↓
JSON-LD / Meta / Microdata / DOM
    ↓
DiscoveredProperty[]
    ↓
FieldMatcher
    ↓
FieldExtraction[]
    ↓
ExtractionResult

✅ FieldResolver

Resolution rules:

1. Highest confidence wins
2. If confidence ties → source priority
3. If still tied → first candidate wins

Current source tie-break priority:

NETWORK
    ↓
JSON_LD
    ↓
MICRODATA
    ↓
META
    ↓
DOM

NETWORK is reserved for Phase 14 extraction and is not yet connected to ParserOrchestrator.

✅ Normalizer

Normalizer converts resolved values according to requested type using conservative deterministic rules.

Supported requested types:

string

number

boolean

array (string[] currently)

✅ Validator

Validation statuses:

VALID
PARTIAL
INVALID

VALID — every requested field is valid.

PARTIAL — every required field is valid, but optional fields may be missing/invalid.

INVALID — a required field is missing/invalid, or no requested field is valid.

✅ DefaultParserPipeline

ParserInput
    ↓
ParserOrchestrator
    ↓
ExtractionResult
    ↓
FieldResolver
    ↓
ResolvedExtraction
    ↓
Normalizer
    ↓
NormalizedExtraction
    ↓
Validator
    ↓
ValidationResult

The pipeline preserves each stage for future diagnostics, failure classification, self-healing analysis, and parser-version comparison.

✅ ParserOutcomePolicy

Validation

Outcome

Quality

VALID

COMPLETE

FULL

PARTIAL

COMPLETE

PARTIAL

INVALID

PARSER_FAILURE

—

PARTIAL is not treated as job failure if all required fields are valid.

INVALID does not automatically trigger retry, AI, or self-healing.

✅ Phase 10 — Parser Lifecycle / Coordinator Integration

The parser pipeline is now connected to the request lifecycle.

PROCESSING
    ↓
Access allowed
    ↓
READY_FOR_PARSING
    ↓
ParserPipeline
    ↓
ParserOutcomePolicy
    ├─ COMPLETE → SUCCESS
    └─ PARSER_FAILURE → PARSER_FAILED

PARSER_FAILED means:

The page was accessed successfully, but the deterministic parser pipeline could not satisfactorily validate the requested schema.

PARSER_FAILED does not automatically:

Retry

Trigger AI

Trigger self-healing

Modify access retry counters

Become FAILED_FINAL

Local real-HTTP end-to-end tests verify:

VALID → SUCCESS

PARTIAL → SUCCESS

INVALID → PARSER_FAILED

✅ Phase 11 — Universal DOM Extraction

Completed and verified with:

DOM extractor tests: 28 / 28

A real public static-site smoke test also confirmed useful generic DOM discovery without requested-field-specific logic.

✅ Phase 12 — Playwright Dynamic Renderer

Implemented a browser-rendering layer using real Chromium.

Capabilities:

domcontentloaded default wait strategy

Configurable settle time

Configurable timeout

Headless/headed execution

Final URL capture

Rendered HTML capture

Page title capture

Redirect handling

Typed browser errors

Browser cleanup without masking primary failures

Verified browser behaviors:

✓ Static HTML rendering
✓ JavaScript DOM mutations
✓ API-driven dynamic content
✓ Redirect final URL
✓ Typed navigation timeout

A real public Instagram smoke test confirmed that Chromium could render and read real public profile content without clicking login or performing authentication.

✅ Phase 13 — Browser Evidence Collector

The Playwright renderer now also passively captures browser network evidence generated during page load.

Captured evidence is limited to browser xhr and fetch responses.

Network evidence contract

Each retained network response can include:

URL

HTTP status

Request method

Resource type (xhr / fetch)

Normalized response headers

Content-Type

Body byte count

Textual response body when safely retained

Reason when a body is omitted

Safety and memory controls

Implemented:

Max responses per render        200
Max body per response           1 MiB
Max total retained body data    4 MiB
Body-read timeout               2 seconds

Additional protections:

Binary bodies are not retained

Streaming responses are not retained

Sensitive response headers are redacted

Async response-body tasks are explicitly drained before returning

Evidence collection never intentionally crashes an otherwise successful render

Response-limit truncation is reported

Phase 13 test coverage

Verified:

✓ Captures JSON fetch responses
✓ Keeps binary metadata without binary body
✓ Enforces per-response body limit
✓ Enforces total body budget
✓ Normalizes headers
✓ Redacts sensitive headers
✓ Captures redirect response + final API response
✓ Bounds retained API response count

Real public smoke result

Against a real public Instagram profile:

Observed browser responses:   70
Eligible XHR/fetch:            18
Retained responses:            18
Bodies captured:               18
Retained body bytes:       106877
Response limit reached:     false
4xx/5xx API responses:          0

The smoke test discovered real browser traffic including GraphQL/XHR calls.

Important Phase 13 discovery

Some structured API responses were returned with:

Content-Type: text/javascript
Content-Type: application/x-javascript

instead of application/json.

Therefore Phase 14 must not trust Content-Type alone when detecting structured data. It must inspect retained bodies and attempt safe deterministic parsing.

🚧 Phase 14 — Universal Network/API Data Extractor

✅ Step 14A — Contracts Complete

Completed contracts:

NetworkExtractionResult

NetworkDataExtractor

New extraction source: NETWORK

Resolver source priority updated to include NETWORK

Design rules locked in:

Field-agnostic extraction

No site-specific endpoint logic

No GraphQL endpoint assumptions

No requested-field logic inside the extractor

Content-Type is only a hint

Structured-data detection will be based on safe body inspection/parsing

Already-captured Phase 13 evidence is read-only input

Current status:

Step 14A contracts      ✅ Complete
Step 14B implementation 📌 Next
Step 14C integration    📌 Later

Planned Step 14B responsibilities:

Safe structured-payload detection

Anti-XSSI prefix handling

JSON object/array parsing

Generic recursive traversal

Indexed paths for object arrays

Primitive leaf-array support

GraphQL __* metadata suppression

Depth/property/node safety limits

Duplicate suppression

Meaningful warnings only

Ordinary non-structured text silently skipped

Support structured bodies even when Content-Type is text/javascript or similar

📌 Still To Build

Major remaining components:

Phase 14B — DefaultNetworkDataExtractor

Phase 14C — Network extraction integration into parser flow

Browser/Coordinator dynamic fallback decision logic

Collection/list record grouping

Browser action discovery

Browser action execution

Goal/action planner

Observe → Extract → Validate → Plan → Act loop

Browser safety / loop bounds

Failure classification

AI self-healing engine

AI-generated parser/action configurations

Healing validation

Learned strategy persistence/reuse

Parser/action version management

Promotion / rollback

Monitoring dashboard

Persistent/distributed retry scheduler

Production persistence

Browser pooling/reuse optimization

Development Progress

✅ Phase 1   — Crawling & Access Foundation
✅ Phase 2   — Universal Structured Data Discovery
✅ Phase 3   — FieldMatcher
✅ Phase 4   — ParserOrchestrator
✅ Phase 5   — FieldResolver
✅ Phase 6   — Normalizer
✅ Phase 7   — Validator
✅ Phase 8   — Parser Pipeline
✅ Phase 9   — Parser Outcome Policy
✅ Phase 10  — Parser Lifecycle / Coordinator Integration
✅ Phase 11  — Universal DOM Extraction
✅ Phase 12  — Playwright Dynamic Renderer
✅ Phase 13  — Browser Evidence Collector
🚧 Phase 14  — Universal Network/API Data Extraction
   ✅ 14A   — Contracts
   📌 14B   — DefaultNetworkDataExtractor
   📌 14C   — Parser integration later
📌 Phase 15  — Browser Action Discovery
📌 Phase 16  — Browser Action Executor
📌 Phase 17  — Goal / Action Planner
📌 Phase 18  — Observe → Extract → Validate → Plan → Act Loop
📌 Phase 19  — Generic Navigation Strategies
📌 Phase 20  — Browser Safety / Loop Bounds
📌 Phase 21  — Failure Classification
📌 Phase 22  — AI Self-Healing Browser Agent
📌 Phase 23  — Learned Strategy Persistence / Reuse / Versioning

Current Verified Baseline

Test Files:              22 passed
Tests:                  179 passed
Failures:                 0
TypeScript Typecheck:  PASS
Build:                 PASS

Current verified browser/network tests include:

Playwright renderer tests:          5 / 5
Browser network-evidence tests:     7 / 7
DOM extractor tests:               28 / 28
Local parser runtime E2E tests:      3 / 3

Current Architecture

flowchart TD
    A["Agent Scrape Request"]
    B["ScrapeJob<br/>RequestedField[]"]
    C["RequestManager"]
    D["Crawlee RequestQueue"]
    E["BasicCrawler"]
    F["Coordinator"]
    G["AccessController"]
    H{"Access Decision"}
    I["FastFetcher"]
    J["FetchEnvelope"]

    K["JSON-LD ✅"]
    L["Meta ✅"]
    M["Microdata ✅"]
    N["DOM ✅"]
    O["DiscoveredProperty[]"]
    P["FieldMatcher ✅"]
    Q["FieldResolver ✅"]
    R["Normalizer ✅"]
    S["Validator ✅"]
    T["ParserOutcomePolicy ✅"]
    U{"Parser Outcome"}
    V["SUCCESS"]
    W["PARSER_FAILED"]

    X["PlaywrightRenderer ✅"]
    Y["Rendered HTML ✅"]
    Z["NetworkEvidenceCollector ✅"]
    AA["XHR / Fetch Evidence ✅"]
    AB["NetworkDataExtractor 🚧"]
    AC["NETWORK DiscoveredProperty[] 📌"]

    AD["Failure Classification 📌"]
    AE["Self-Healing 📌"]

    A --> B --> C --> D --> E --> F --> G --> H
    H -->|ALLOW| I
    H -->|RETRY_LATER| C
    H -->|USER_ACTION_REQUIRED| C
    H -->|DENY| W

    I --> J
    J --> K
    J --> L
    J --> M
    J --> N
    K --> O
    L --> O
    M --> O
    N --> O
    O --> P --> Q --> R --> S --> T --> U
    U -->|VALID / PARTIAL| V
    U -->|INVALID| W

    X --> Y
    X --> Z
    Z --> AA
    AA --> AB
    AB --> AC
    AC -. future parser integration .-> P

    W -. future .-> AD
    AD -. healable .-> AE

Important Engineering Principles

Agentic Loop intentionally separates:

ACCESS FAILURE
        ≠
PARSER FAILURE
        ≠
NORMALIZATION FAILURE
        ≠
VALIDATION FAILURE
        ≠
BROWSER / NETWORK EVIDENCE COLLECTION

Examples of access problems:

429
CAPTCHA
403
network timeout

Examples of parser/extraction problems:

required field missing
incorrect extraction candidate
website structure changed

Example normalization/data problem:

"Salary not disclosed" → requested number

These failures should not all trigger the same retry or healing strategy.

Self-Healing Vision

Self-healing is not implemented yet.

Future flow:

flowchart TD
    A["Parser Failure"]
    B["Failure Classification"]
    C{"Healable?"}
    D["Collect Evidence"]
    E["DOM Evidence"]
    F["Network/API Evidence"]
    G["Browser Evidence"]
    H["Existing Extraction Evidence"]
    I["AI Healing Engine"]
    J["Generate Parser / Action Configuration"]
    K["Deterministic Test"]
    L["Validator"]
    M{"Valid?"}
    N["Promote Version"]
    O["Reject Candidate"]

    A --> B --> C
    C -->|No| O
    C -->|Yes| D
    D --> E
    D --> F
    D --> G
    D --> H
    E --> I
    F --> I
    G --> I
    H --> I
    I --> J --> K --> L --> M
    M -->|Yes| N
    M -->|No| O

Deterministic first. AI last. Validate before promotion.

AI should generate parser/action configurations and selectors rather than blindly rewriting production source code.

Monitoring Foundation

Current runtime state includes:

status
attempt
deferredRetryCount
domain
lastAccessReason
lastError
updatedAt

Future monitoring will include:

Active jobs

Success rate

Parser failure rate

Retry rate

429 rate

CAPTCHA rate

Average scrape duration

Missing-field rate

Normalization failure rate

Validation failure rate

Browser-render fallback rate

Network-evidence capture rate

Healing attempts

Healing success rate

Domain health

Parser/action version health

Tech Stack

Node.js

TypeScript

Crawlee

Crawlee BasicCrawler

Crawlee RequestQueue

GotScraping HTTP client

Playwright / Chromium

Cheerio

Vitest

Playwright and Browser Evidence Collector are implemented and tested, but dynamic-browser fallback is not yet connected to Coordinator/parser fallback logic.

Run Project

Install dependencies:

npm install

Install Playwright Chromium:

npm run browser:install

Development mode:

npm run dev

Verification:

npm run typecheck
npm test
npm run build

Current Status

Core crawling infrastructure             ✅ Complete
Access-control foundation                ✅ Complete
Fast fetching                            ✅ Complete
Universal structured discovery           ✅ Complete
FieldMatcher                             ✅ Complete
ParserOrchestrator                       ✅ Complete
FieldResolver                            ✅ Complete
Normalizer                               ✅ Complete
Validator                                ✅ Complete
DefaultParserPipeline                    ✅ Complete
ParserOutcomePolicy                      ✅ Complete
Parser lifecycle integration             ✅ Complete
Coordinator parser integration           ✅ Complete
Universal DOM extraction                 ✅ Complete
Playwright dynamic renderer              ✅ Complete
Browser network evidence collector       ✅ Complete
Network extractor contracts (14A)        ✅ Complete
DefaultNetworkDataExtractor (14B)        📌 Next
Network parser integration (14C)         📌 Later
Browser dynamic fallback integration     📌 Planned
Failure classification                   📌 Planned
Self-healing                             📌 Planned
Monitoring dashboard                     📌 Planned

Current Verified Baseline

22 test files
179 tests
179 / 179 passing
TypeScript Typecheck: PASS
Build: PASS

The project now has a complete deterministic static/DOM parsing foundation, a verified real Chromium renderer, and a bounded browser-network evidence collector.

The immediate next work is Phase 14B — DefaultNetworkDataExtractor, which will convert captured API/network bodies into universal field-agnostic DiscoveredProperty[] before any parser integration is attempted.
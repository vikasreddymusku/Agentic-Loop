# Agentic Loop – Universal Self-Healing Web Scraper

Agentic Loop is a **universal, adaptive web scraping engine** designed to scrape different websites and dynamically extract whatever fields the user requests.

The long-term goal is to build a scraper that can detect extraction failures, adapt to website changes, validate fixes, and eventually **self-heal automatically**.

## What I Am Building

The intended flow is:

```text
Agent Request
    ↓
Scrape Job
    ↓
Crawler
    ↓
Access Control
    ↓
Fetcher
    ↓
Structured Data Extraction
    ↓
Field Matching
    ↓
Validation
    ↓
Self-Healing if extraction fails
```

The scraper is designed to support different use cases such as:

* Job websites
* E-commerce websites
* News websites
* Public/social pages
* Other websites with dynamically requested fields

It is **not limited to fixed fields or one website type**.

---

## Current Progress

### ✅ Completed

The core scraping foundation is implemented:

* RequestManager
* Crawlee RequestQueue
* BasicCrawler
* Coordinator
* AccessController
* FastFetcher
* FetchEnvelope
* Retry handling
* Pending user-action handling
* Runtime job states
* Dynamic `RequestedField[]`
* Universal `DiscoveredProperty[]`
* JSON-LD extraction
* Meta tag extraction
* Microdata extraction

The parser was also refactored from fixed business-specific fields to a **universal field-agnostic architecture**.

Current verification:

```text
10 test files
76 tests
76/76 passing

TypeScript Typecheck: PASS
Build: PASS
```

---

## 🚧 Currently Working On

The next major component is:

### FieldMatcher

It will connect:

```text
RequestedField[]
        +
DiscoveredProperty[]
        ↓
FieldMatcher
        ↓
FieldExtraction[]
```

Its job is to determine which discovered website property matches the field requested by the Agent.

Example:

```text
Requested:
price

Discovered:
$.offers.price = 24999

Result:
price → 24999
```

---

## 📌 Still To Build

Major remaining components are:

* ParserOrchestrator
* DOM Extractor
* FieldResolver
* Normalizer
* Validator
* Parser integration with Coordinator
* Playwright dynamic rendering fallback
* Self-healing engine
* AI-generated parser configurations/selectors
* Parser version management
* Healing validation
* Monitoring dashboard
* Persistent/distributed retry system

---

## Development Progress

```text
✅ Phase 1 — Crawling & Access Foundation
✅ Phase 2 — Universal Structured Data Extraction
🚧 Phase 3 — FieldMatcher
📌 Phase 4 — ParserOrchestrator
📌 Phase 5 — DOM Extraction
📌 Phase 6 — Resolver + Normalizer + Validator
📌 Phase 7 — Playwright Fallback
📌 Phase 8 — Self-Healing
📌 Phase 9 — Monitoring & Production Persistence
```

So far, the **core foundation and universal structured-data discovery system are complete**.

The project currently reaches:

```text
Website
   ↓
Fetch
   ↓
JSON-LD / Meta / Microdata
   ↓
DiscoveredProperty[]
```

The next work is turning those discovered properties into the **actual fields requested by the Agent**.

---

## Tech Stack

* Node.js
* TypeScript
* Crawlee
* Playwright
* Cheerio
* Vitest

---

## Run Project

```bash
npm install
npm run dev
```

Run verification:

```bash
npm run typecheck
npm test
npm run build
```

---

## Current Status

**Core scraping infrastructure: ✅ Complete**

**Universal structured-data extraction: ✅ Complete**

**Requested-field matching: 🚧 In Progress**

**DOM/browser fallback: 📌 Planned**

**Self-healing: 📌 Planned**


Full system achitecture

```mermaid

flowchart TD
    A["Agent Scrape Request"]
    B["ScrapeJob<br/>RequestedField[]"]
    C["RequestManager"]
    D["Crawlee RequestQueue"]
    E["BasicCrawler"]
    F["Coordinator"]
    G["AccessController"]
    H{"Access Decision"}

    R1["RETRY_LATER"]
    R2["USER_ACTION_REQUIRED"]
    R3["DENY"]

    I["FastFetcher"]
    J["FetchEnvelope"]

    K["JSON-LD Extractor"]
    L["Meta Extractor"]
    M["Microdata Extractor"]

    N["DiscoveredProperty[]"]

    O["FieldMatcher<br/>🚧 In Progress"]
    P["FieldExtraction[]"]
    Q["FieldResolver<br/>📌 Planned"]
    R["Normalizer<br/>📌 Planned"]
    S["Validator<br/>📌 Planned"]

    T{"Validation Result"}
    U["SUCCESS"]

    V["Playwright / DOM Evidence<br/>📌 Planned"]
    W["Self-Healing Engine<br/>📌 Planned"]
    X["Generated Parser Configuration<br/>📌 Planned"]
    Y["Deterministic Validation<br/>📌 Planned"]
    Z["Version / Promotion<br/>📌 Planned"]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H

    H -->|ALLOW| I
    H -->|RETRY_LATER| R1
    H -->|USER_ACTION_REQUIRED| R2
    H -->|DENY| R3

    I --> J

    J --> K
    J --> L
    J --> M

    K --> N
    L --> N
    M --> N

    N --> O
    O --> P
    P --> Q
    Q --> R
    R --> S
    S --> T

    T -->|PASS| U
    T -->|Extraction failure| V

    V --> W
    W --> X
    X --> Y
    Y -->|PASS| Z
    Y -->|FAIL| W

```

AccessController decision flow

```mermaid

flowchart TD
    A["Coordinator receives request"]
    B["Preflight access evaluation"]
    C{"Preflight Decision"}

    D["FastFetcher"]
    E["FetchEnvelope"]
    F["Post-fetch access evaluation"]
    G{"Access Decision"}

    H["ALLOW<br/>Continue toward parsing"]
    I["RETRY_LATER<br/>Schedule delayed retry"]
    J["USER_ACTION_REQUIRED<br/>Pause for external action"]
    K["DENY<br/>Stop this execution"]

    A --> B
    B --> C

    C -->|Continue| D
    C -->|RETRY_LATER| I
    C -->|USER_ACTION_REQUIRED| J
    C -->|DENY| K

    D --> E
    E --> F
    F --> G

    G -->|ALLOW| H
    G -->|RETRY_LATER| I
    G -->|USER_ACTION_REQUIRED| J
    G -->|DENY| K

```

Universal parser flow

```mermaid

flowchart TD
    A["FetchEnvelope"]

    B["JSON-LD Extractor<br/>✅"]
    C["Meta Extractor<br/>✅"]
    D["Microdata Extractor<br/>✅"]
    E["DOM Extractor<br/>📌"]

    F["DiscoveredProperty[]<br/>✅"]

    G["FieldMatcher<br/>🚧"]
    H["FieldExtraction[]"]

    I["FieldResolver<br/>📌"]
    J["ResolvedExtraction"]

    K["Normalizer<br/>📌"]
    L["Validator<br/>📌"]

    M{"Result"}
    N["PASS"]
    O["FAIL / Recovery<br/>📌"]

    A --> B
    A --> C
    A --> D
    A -. future .-> E

    B --> F
    C --> F
    D --> F
    E -. future .-> F

    F --> G
    G --> H
    H --> I
    I --> J
    J --> K
    K --> L
    L --> M

    M -->|Valid| N
    M -->|Invalid / Missing| O

```


Retry + human-action lifecycle

```mermaid

flowchart TD
    A["PROCESSING"]

    B{"Access condition"}

    C["RATE_LIMITED"]
    D["RETRY_SCHEDULED"]
    E["DeferredRetryScheduler"]
    F["Requeue"]
    G["Same logical ScrapeJob.id<br/>New Crawlee request identity"]

    H["CAPTCHA"]
    I["USER_ACTION_REQUIRED"]
    J["PendingActionStore"]
    K["Human verification"]
    L["Resume"]
    M["Same logical ScrapeJob.id<br/>New execution"]

    A --> B

    B -->|Rate limited| C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> A

    B -->|CAPTCHA| H
    H --> I
    I --> J
    J --> K
    K --> L
    L --> M
    M --> A

```





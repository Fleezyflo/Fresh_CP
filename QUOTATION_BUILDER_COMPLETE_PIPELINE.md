# AI Quote Builder - Complete Pipeline Documentation

**Purpose**: End-to-end documentation of how a client brief becomes a commercial quote
**Audience**: Developers, system administrators, business analysts
**Status**: ✅ Current as of 2026-01-13

---

## Table of Contents

1. [Overview](#overview)
2. [The Complete Journey](#the-complete-journey)
3. [Configuration Sheets](#configuration-sheets)
4. [LLM Calls Deep Dive](#llm-calls-deep-dive)
5. [Data Flow](#data-flow)
6. [Issues & Improvements](#issues--improvements)

---

## Overview

### What This System Does

Takes a **client brief** (text + PDFs) and produces a **commercial quote** with:
- Structured scope of work organized by phases
- SKU mappings from catalog
- Quantities and rates
- Line items ready for Xero export

### The Pipeline (High Level)

```
Brief Text + Attachments
    ↓
[1] SCOPE EXTRACTION (LLM Call #1)
    ↓
Structured Scope Entries (sections + deliverables)
    ↓
[2] VECTOR SEARCH (No LLM - embedding similarity)
    ↓
Scope Entries + SKU Candidates
    ↓
[3] COMMERCIAL FIT (LLM Call #2)
    ↓
Scope Entries + Chosen SKUs
    ↓
[4] COMMERCIAL PLAN (LLM Call #3)
    ↓
Quote Sections + Line Items
    ↓
[5] SECTION SUMMARIES (LLM Call #4 - Optional)
    ↓
Final Quote Ready for Export
```

### Key Numbers

- **4 LLM calls** (1 required for scope, 1 for catalog mapping, 1 for quote, 1 optional for summaries)
- **8 configuration sheets** drive the entire process
- **22 fields** per scope entry after normalization
- **9 phases** for smm-retainer brief type (configurable per brief type)

---

## The Complete Journey

### Step 1: User Opens Sidebar

**User Action**: Opens AI Quote Builder sidebar in Google Sheets

**System Actions**:
1. Loads `ui/ai_quote_sidebar.html` (client-side UI)
2. Calls `getScopeCategoryUiData()` (server-side)
3. Fetches configuration from sheets

**Config Sheets Accessed**:
- **Config: Scope Phases** → Loads all phases for all brief types
- **Config: Brief Profiles** → Loads brief type definitions

**What's Sent to UI**:
```javascript
{
  enabled: true,
  config: {
    'smm-retainer': {
      phases: [
        {
          briefType: 'smm-retainer',
          phaseId: 'strategy-account',
          label: 'Strategy & Account Management',
          canonical: 'strategy-account',
          deliverableHint: 'Annual/semi-annual strategy docs...',
          signalHint: 'define overarching social media strategy...',
          synonymsCSV: 'strategy,account,planning',
          // ... more fields
        },
        // ... 8 more phases
      ]
    },
    'pr-retainer': { phases: [...] },
    // ... other brief types
  },
  hashes: {
    'smm-retainer': 'a3f2d1c9...',  // MD5 hash for cache busting
  }
}
```

**UI State**: User sees brief type dropdown populated, phase scaffolding ready

---

### Step 2: User Enters Brief & Selects Type

**User Actions**:
1. Pastes brief text into textarea
2. Optionally attaches PDF files
3. Selects brief type (e.g., "SMM Retainer")
4. Clicks "Extract Scope"

**Client-Side Processing**:
- Validates brief text is not empty
- Collects file IDs from Drive Picker (if PDFs attached)
- Packages request payload

**Request Sent to Server**:
```javascript
{
  briefText: "We need a 6-month social media retainer...",
  briefType: "smm-retainer",
  fileIds: ["1a2b3c4d5e6f..."],  // Google Drive file IDs (optional)
  reviewerNotes: "",              // Optional analyst notes
  clientContext: {                 // Auto-detected or manual
    automated: {
      industries: [{label: 'Hospitality', confidence: 0.9}],
      regions: [{label: 'UAE', confidence: 0.95}]
    }
  }
}
```

---

### Step 3: Scope Extraction (LLM Call #1)

**Server Function**: `extractScopeDraft()` in `05_AISidebar_UI.js:5543`

#### 3A. PDF Processing (If Attached)

**Function**: `fetchAttachmentSummaries()` in `05_AISidebar_Data.js`

**What Happens**:
1. For each Google Drive file ID:
   - Downloads PDF via DriveApp
   - Extracts text using Google's PDF parsing
   - Truncates to manageable size
   - Returns: `{fileName: "brief.pdf", text: "extracted text...", length: 5000}`

**Config Sheets Used**: None (direct Drive API access)

#### 3B. Context Building

**Function**: `buildLLMContext()` in `05_AISidebar_Processing.js:31`

**Config Sheets Accessed**:
- **Config: Brief Profiles** → Gets brief profile for selected type
  - `label`: "SMM Retainer"
  - `nudge`: "Focus on monthly retainer deliverables..."
  - `sectionOrderCSV`: "Strategy,Planning,Asset Development,..."
  - `catalogPrefixesCSV`: "SMM-,SOCIAL-" (prioritizes these SKUs)

**What It Builds**:
```javascript
{
  briefText: "...",
  briefType: "smm-retainer",
  pdfSummaries: [{fileName: "...", text: "..."}],
  answers: [],  // From required questions (if any)
  clientContext: {...},
  briefProfile: {
    label: "SMM Retainer",
    nudge: "Focus on monthly retainer...",
    sectionOrder: ["Strategy", "Planning", ...],
    catalogPrefixes: ["SMM-", "SOCIAL-"]
  },
  sectionPriority: ["Strategy", "Planning", ...]
}
```

#### 3C. Prompt Building

**Function**: `buildScopeDraftPrompt()` in `05_AISidebar_UI.js:2232`

**Config Sheets Accessed**:
- **Config: Scope Phases** → Gets canonical phase IDs, deliverable hints, signal hints
- **Config: Phase Taxonomy Overrides** → Gets detailed phase definitions (optional)

**Functions Called**:
1. `getScopePhaseCanonicals(briefType)` → Returns: `['strategy-account', 'planning-architecture', ...]`
2. `buildPhaseGuidanceForPrompt(briefType)` → Returns multi-line phase hints
3. `buildPhaseDefinitionsBlock(context)` → Returns detailed phase definitions with boundaries
4. `buildMandatoryEvidenceSection(context)` → Pre-scans brief for phase evidence

**System Prompt Built** (simplified):
```
You are hrmny's scope analyst persona.

Brief Type: SMM Retainer. Focus on monthly retainer deliverables...

Canonical Phase IDs: strategy-account, planning-architecture, asset-development,
pre-production, production, post-production, distribution-community,
measurement-reporting, deliverable-management

Phase Guidance:
Phase: Strategy & Account Management | Deliverables: Annual strategy docs... | Signals: define social media strategy...
Phase: Planning & Architecture | Deliverables: Monthly content calendars... | Signals: build monthly calendars...
[... 7 more phases]

Phase Definitions:
- Phase: Strategy & Account Management (strategy-account)
  Strict definition: Owns ongoing social media direction...
  Key deliverables: Annual strategy document; Channel role definition; Tone of voice guidelines
  Signals: define social media strategy; set channel roles; own tone of voice
  Keywords: social media strategy; always-on social strategy
  Boundary: Strategy is for planning, not doing; keep execution verbs inside production phases
[... 8 more phase definitions]

Structure Rules:
- Return FLAT array in scopeEntries (NOT nested)
- Each entry needs 8 fields: label, canonical, isSection, deliverables, notes, signals, resources, sourceExcerpt
- Ordering: Section first, then its line items, then next section
[... more rules]

Example:
{
  "projectName": "...",
  "briefType": "smm-retainer",
  "scopeEntries": [
    {
      "label": "Strategy & Account Management",
      "canonical": "strategy-account",
      "isSection": true,
      "deliverables": ["Strategy doc", "Channel definitions"],
      "notes": ["Monthly review"],
      "signals": ["strategy", "account"],
      "resources": "Account Director",
      "sourceExcerpt": "6-month social media retainer"
    },
    {
      "label": "Monthly social media strategy",
      "canonical": "strategy-account",
      "isSection": false,
      "deliverables": ["Monthly strategy update"],
      "notes": [],
      "signals": ["planning"],
      "resources": "Social Media Manager",
      "sourceExcerpt": "monthly content creation"
    }
  ],
  "warnings": [],
  "assumptions": []
}
```

**User Prompt Built**:
```
### Brief
We need a 6-month social media retainer for our luxury hotel brand in Dubai...

### Attached PDF Summaries
- marketing_brief.pdf (4500 chars)
  Executive summary: Our luxury hotel brand requires comprehensive social media management...

### Human Answers
(none)

### Client Signals
Industry: Hospitality & Tourism (confidence: 0.9)
  Evidence: hotel, luxury hospitality, Dubai
Region: UAE (confidence: 0.95)
  Evidence: Dubai

### Mandatory Phase Evidence
- Distribution & Activation (distribution-community): Evidence: ...community management...
  You MUST create a Distribution & Activation section.
```

#### 3D. LLM Call

**Function**: `invokeLLMChat()` in `05_AISidebar_UI.js:3305`

**Request Sent to OpenAI**:
```javascript
POST https://api.openai.com/v1/chat/completions
{
  "model": "gpt-4o-2024-08-06",  // From LLM_SCOPE_MODEL property
  "temperature": 0,
  "max_tokens": 2600,
  "messages": [
    {
      "role": "system",
      "content": "You are hrmny's scope analyst persona..."  // ~15,000 chars
    },
    {
      "role": "user",
      "content": "### Brief\nWe need a 6-month..."  // ~2,000 chars
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "ScopeDraftLLM",
      "strict": true,
      "schema": {
        "type": "object",
        "required": ["projectName", "briefType", "scopeEntries", "warnings", "assumptions"],
        "properties": {
          "projectName": {"type": "string"},
          "briefType": {"type": "string"},
          "scopeEntries": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["label", "canonical", "isSection", "deliverables", "notes", "signals", "resources", "sourceExcerpt"],
              "properties": {
                "label": {"type": "string"},
                "canonical": {"type": "string"},
                "isSection": {"type": "boolean"},
                "deliverables": {"type": "array", "items": {"type": "string"}},
                "notes": {"type": "array", "items": {"type": "string"}},
                "signals": {"type": "array", "items": {"type": "string"}},
                "resources": {"anyOf": [{"type": "string"}, {"type": "array"}]},
                "sourceExcerpt": {"type": "string"}
              }
            }
          },
          "warnings": {"type": "array"},
          "assumptions": {"type": "array"}
        }
      }
    }
  }
}
```

**Response From OpenAI** (simplified):
```json
{
  "id": "chatcmpl-...",
  "model": "gpt-4o-2024-08-06",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "{\"projectName\":\"Luxury Hotel Social Media Retainer\",\"briefType\":\"smm-retainer\",\"scopeEntries\":[{\"label\":\"Strategy & Account Management\",\"canonical\":\"strategy-account\",\"isSection\":true,\"deliverables\":[\"Account strategy\",\"Brand alignment\"],\"notes\":[\"Monthly review\"],\"signals\":[\"strategy\",\"account\"],\"resources\":\"Account Director\",\"sourceExcerpt\":\"luxury hotel brand in Dubai\"},{\"label\":\"Planning & Architecture\",\"canonical\":\"planning-architecture\",\"isSection\":true,\"deliverables\":[\"Content calendar\",\"Editorial planning\"],\"notes\":[\"Monthly cycle\"],\"signals\":[\"planning\",\"calendar\"],\"resources\":\"Content Strategist\",\"sourceExcerpt\":\"Content calendar planning\"},...],\"warnings\":[\"Approval process not defined\"],\"assumptions\":[\"Client provides brand assets\"]}"
    }
  }],
  "usage": {
    "prompt_tokens": 4200,
    "completion_tokens": 850,
    "total_tokens": 5050
  }
}
```

#### 3E. Normalization (8 fields → 22 fields)

**Function**: `normalizeScopeDraftToFinalStructure()` in `05_AISidebar_Processing.js:3817`

**What It Does**:
Takes the simple 8-field LLM response and enriches it to 22 fields:

**Before (from LLM)**:
```json
{
  "label": "Monthly social media strategy",
  "canonical": "strategy-account",
  "isSection": false,
  "deliverables": ["Strategy update", "Calendar"],
  "notes": ["Monthly review"],
  "signals": ["planning"],
  "resources": "Social Media Manager",
  "sourceExcerpt": "monthly content creation"
}
```

**After (normalized)**:
```json
{
  "id": "strategy-account-line-1",                    // ← ADDED: Unique ID
  "sectionId": "strategy-account",                    // ← ADDED: Parent section ID
  "scopeLabel": "Monthly social media strategy",      // ← RENAMED from label
  "visibility": "Client",                             // ← ADDED: Default visibility
  "approvalStatus": "pending",                        // ← ADDED: Approval state
  "sourceExcerpt": "monthly content creation",        // ← KEPT
  "interpretation": "",                               // ← ADDED: Empty string
  "deliverables": ["Strategy update", "Calendar"],    // ← KEPT
  "resources": [],                                    // ← TRANSFORMED: Parsed into array
  "contingency": null,                                // ← ADDED: Null
  "notes": ["Monthly review"],                        // ← KEPT
  "signals": ["planning"],                            // ← KEPT
  "canonical": "strategy-account",                    // ← KEPT
  "isSection": false,                                 // ← KEPT
  "parentId": "strategy-account",                     // ← ADDED: Links to section
  "childIds": [],                                     // ← ADDED: Empty for line items
  "metadata": {                                       // ← ADDED: Tracking metadata
    "bundleKey": "",
    "parentScopeId": "strategy-account",
    "sectionParentId": "strategy-account",
    "vectorDetailParent": "",
    "isSectionChild": true,
    "detailSource": "llm",
    "phaseRecovered": ""
  },
  "quantitySignals": [],                              // ← ADDED: Empty array
  "scenarioHighlights": [],                           // ← ADDED: Empty array
  "usageSummary": {                                   // ← ADDED: Empty object
    "durationMonths": null,
    "region": null,
    "notes": []
  },
  "catalogRefs": [],                                  // ← ADDED: Empty array
  "resourcePackages": []                              // ← ADDED: Empty array
}
```

**Key Transformation**:
- Generates unique IDs for every entry
- Sections get canonical-based IDs: `"strategy-account"`
- Line items get sequential IDs: `"strategy-account-line-1"`, `"strategy-account-line-2"`
- Establishes parent-child relationships
- Adds empty arrays/objects for later enrichment

**Why This Matters**:
- **IDs enable structured UI rendering** (draggable items vs freeform textareas)
- UI checks: `if (entry.id)` → structured, else → freeform
- Parent-child links enable hierarchy visualization

#### 3F. Response to Client

**What UI Receives**:
```javascript
{
  projectName: "Luxury Hotel Social Media Retainer",
  briefType: "smm-retainer",
  scopeEntries: [
    // 22-field entries with IDs
  ],
  warnings: ["Approval process not defined"],
  assumptions: ["Client provides brand assets"],
  fallbackPhaseUsed: false  // True if config was missing
}
```

**UI Rendering** (`ui/ai_quote_sidebar.html:7000+`):

```javascript
// Group entries by phase
const entriesByPhase = {};
scopeEntries.forEach(entry => {
  const canonical = resolvePhaseCanonicalForEntry(entry);  // Match to configured phases
  if (!canonical) return;  // Skip if no match

  if (!entriesByPhase[canonical]) {
    entriesByPhase[canonical] = [];
  }
  entriesByPhase[canonical].push(entry);
});

// For each phase, render either structured or freeform
Object.keys(entriesByPhase).forEach(phaseCanonical => {
  const entriesForPhase = entriesByPhase[phaseCanonical];

  // CHECK: Do entries have IDs?
  const structuredEntries = entriesForPhase.filter(e => e && e.id);

  if (structuredEntries.length > 0) {
    // RENDER: Draggable deliverable items (structured mode)
    renderStructuredDeliverables(phaseCanonical, structuredEntries);
  } else {
    // RENDER: Freeform textarea (legacy mode)
    renderFreeformTextarea(phaseCanonical);
  }
});
```

**User Sees**:
- ✅ Phase sections as expandable panels
- ✅ Deliverables as draggable items (can move between phases)
- ✅ Each item shows: label, deliverables, notes
- ✅ Can edit, approve, or reject each item

---

### Step 4: Vector Search (No LLM)

**User Action**: Clicks "Map to Catalog" or system auto-triggers

**Server Function**: `processCommercialFit()` in `05_AISidebar_Processing.js`

#### 4A. Prepare Scope Entries

**What Happens**:
1. Takes all approved scope entries (22 fields each)
2. For each entry, builds search text:
   ```javascript
   const searchText = [
     entry.scopeLabel,
     entry.deliverables.join(' '),
     entry.notes.join(' '),
     entry.signals.join(' ')
   ].join(' ');
   // Example: "Monthly social media strategy Strategy update Calendar Monthly review planning"
   ```

#### 4B. Generate Embedding

**Function**: `generateEmbedding()` in `VectorSearch.js`

**Request to OpenAI**:
```javascript
POST https://api.openai.com/v1/embeddings
{
  "model": "text-embedding-3-large",
  "input": "Monthly social media strategy Strategy update Calendar Monthly review planning",
  "dimensions": 3072
}
```

**Response**:
```javascript
{
  "data": [{
    "embedding": [0.0234, -0.0567, 0.0891, ...],  // 3072 numbers
    "index": 0
  }],
  "usage": {
    "prompt_tokens": 12,
    "total_tokens": 12
  }
}
```

#### 4C. Search Vector Store

**Function**: `searchVectorStore()` in `VectorSearch.js`

**Config Sheets Accessed**: None (uses OpenAI Vector Store API)

**Request to OpenAI**:
```javascript
POST https://api.openai.com/v1/vector_stores/{VECTOR_STORE_ID}/search
{
  "query_vector": [0.0234, -0.0567, 0.0891, ...],  // 3072 numbers
  "top_k": 10,  // Return top 10 matches
  "score_threshold": 0.42  // Minimum similarity score
}
```

**Response**:
```javascript
{
  "results": [
    {
      "id": "file-abc123",
      "score": 0.89,
      "metadata": {
        "sku": "SMM-STRATEGY-001",
        "name": "Social Media Strategy & Planning",
        "description": "Monthly social media strategy, content calendar, and planning",
        "sellPrice": 5000,
        "unit": "month"
      }
    },
    {
      "id": "file-def456",
      "score": 0.76,
      "metadata": {
        "sku": "SMM-PLANNING-002",
        "name": "Content Calendar Management",
        "description": "Monthly content calendar planning and scheduling",
        "sellPrice": 3000,
        "unit": "month"
      }
    },
    // ... up to 10 results
  ]
}
```

**What System Does**:
- Stores top 10 candidates per entry
- Sorts by vector score (highest first)
- Attaches to entry as `vectorCandidates` array

---

### Step 5: Commercial Fit (LLM Call #2)

**Purpose**: LLM picks best SKU from vector search candidates

**Function**: `processCommercialFit()` continued

#### 5A. Build Prompt

**For Each Scope Entry**:
```
Entry ID: strategy-account-line-1
Label: Monthly social media strategy
Canonical: strategy-account
Deliverables: Strategy update, Calendar
Notes: Monthly review
Signals: planning

Vector Candidates:
1. SMM-STRATEGY-001 (score: 0.89) - Social Media Strategy & Planning - AED 5000/month
2. SMM-PLANNING-002 (score: 0.76) - Content Calendar Management - AED 3000/month
3. SMM-CONTENT-001 (score: 0.65) - Content Creation Services - AED 2500/month
...

Select the best SKU for this entry.
```

#### 5B. LLM Call

**Request to OpenAI**:
```javascript
POST https://api.openai.com/v1/chat/completions
{
  "model": "gpt-4o-2024-08-06",
  "temperature": 0,
  "max_tokens": 3200,
  "messages": [
    {
      "role": "system",
      "content": "You are hrmny's catalog analyst. Select the best matching SKU from candidates..."
    },
    {
      "role": "user",
      "content": "Entry ID: strategy-account-line-1\nLabel: Monthly social media strategy..."
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "catalog_mapper_payload",
      "schema": {
        "type": "object",
        "properties": {
          "responseType": {"enum": ["commercialFit"]},
          "entries": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "scopeEntryId": {"type": "string"},
                "chosenSku": {"type": "string"},
                "alternates": {"type": "array", "maxItems": 5},
                "notes": {"type": "array", "maxItems": 5},
                "warnings": {"type": "array", "maxItems": 5},
                "score": {"type": "number"},
                "confidence": {"type": "number"},
                "justification": {"type": "string"}
              }
            }
          }
        }
      }
    }
  }
}
```

**Response From LLM**:
```json
{
  "responseType": "commercialFit",
  "entries": [
    {
      "scopeEntryId": "strategy-account-line-1",
      "chosenSku": "SMM-STRATEGY-001",
      "alternates": ["SMM-PLANNING-002", "SMM-CONTENT-001"],
      "notes": ["Monthly recurring deliverable", "Aligns with retainer structure"],
      "warnings": [],
      "score": 92,
      "confidence": 0.95,
      "justification": "SMM-STRATEGY-001 is the best match as it explicitly covers monthly social media strategy and planning, which directly aligns with the scope entry requirements."
    },
    // ... more entries
  ]
}
```

#### 5C. Merge Results

**What System Does**:
- Takes LLM's chosen SKU
- Attaches to scope entry as `chosenSku`
- Stores alternates, notes, warnings, score
- Calculates quantity from scope entry signals

**Quantity Resolution**:
```javascript
// Check quantitySignals array
const durationSignal = entry.quantitySignals.find(s => s.type === 'duration');
if (durationSignal && durationSignal.value) {
  qty = durationSignal.value;  // e.g., 6 months
  unit = durationSignal.unit;  // e.g., "months"
} else {
  qty = null;  // LLM will be warned to fill this in later
}
```

**Result**:
```javascript
{
  scopeEntryId: "strategy-account-line-1",
  canonical: "strategy-account",
  chosenSku: "SMM-STRATEGY-001",
  quantityContext: {
    qty: 6,
    unit: "months"
  },
  visibility: "Client",
  scoreBreakdown: {
    vectorScore: 0.89,
    llmScore: 92,
    total: 90.5
  },
  vectorCandidates: [...],  // Kept for reference
  warnings: []
}
```

**User Sees**:
- Each deliverable now shows: "SMM-STRATEGY-001: Social Media Strategy & Planning"
- Quantity: 6 months
- Can review and change SKU if needed

---

### Step 6: Commercial Plan (LLM Call #3)

**User Action**: Clicks "Generate Quote"

**Server Function**: `runQuotePlan()` in `05_AISidebar_UI.js:4829+`

#### 6A. Build Context

**Config Sheets Accessed**:
- **Config: Brief Profiles** → Gets expected sections, optional sections
- **Config: Scope Phases** → Gets phase guidance (again, for quote generation)

**Context Built**:
```javascript
{
  briefText: "...",
  briefType: "smm-retainer",
  briefProfile: {...},
  persona: "proposal-author",  // or "managing-director" or "analyst"
  contractEntries: [
    // All 22-field scope entries with chosen SKUs
  ],
  catalogContext: [
    // Top catalog hints from brief profile's catalogPrefixes
  ],
  signalLayers: {
    derived: [
      {canonical: "strategy-account", score: 0.85, evidence: ["Account strategy", "Brand alignment"]},
      // ... more derived signals
    ],
    automated: {
      industries: [{label: "Hospitality", confidence: 0.9}],
      regions: [{label: "UAE", confidence: 0.95}]
    },
    overrides: {}
  },
  commercialFit: {
    entries: [
      {scopeEntryId: "...", chosenSku: "...", quantityContext: {...}},
      // ... all commercial fit results
    ]
  },
  commercialConstraints: {
    targetMarginPct: 30,
    approvalsPending: []
  },
  defaults: {
    currency: "AED",
    taxType: "GST",
    sections: ["Strategy", "Planning", ...]
  },
  optionalSections: []
}
```

#### 6B. Build Prompt

**Function**: `buildPlanPrompt()` in `05_AISidebar_UI.js:2365`

**System Prompt** (simplified):
```
You are hrmny's proposal author persona. Translate approved scope into commercially resilient quote.

Brief Type: SMM Retainer. Focus on monthly retainer deliverables...

Phase Guidance:
Phase: Strategy & Account Management | Deliverables: Annual strategy docs... | Signals: define social media strategy...
[... more phase guidance]

Rules:
- Respect locked SKUs (don't change them)
- Produce exactly one line item per scope entry
- Use scopeEntryId to link items to source entries
- Compute clientAmount = qty × unitRate
- Group sections by canonical phase
- Reference target margin (30%) in marginSummary
- If data missing, leave null and add warning

Output Blueprint:
{
  "status": "ok",
  "projectName": "",
  "clientName": "",
  "currency": "AED",
  "taxType": "GST",
  "sections": [
    {
      "sectionName": "Strategy & Account Management",
      "scopeEntryId": "strategy-account",
      "canonical": "strategy-account",
      "justification": "Account strategy and brand alignment",
      "items": [
        {
          "scopeEntryId": "strategy-account-line-1",
          "description": "Monthly social media strategy",
          "qty": 6,
          "unit": "months",
          "unitRate": 5000,
          "clientAmount": 30000,
          "internalCost": null,
          "sku": "SMM-STRATEGY-001",
          "visibility": "Client",
          "warnings": []
        }
      ],
      "sectionWarnings": [],
      "marginSummary": "Target margin: 30%, Actual: 32%"
    }
  ],
  "fees": [],
  "warnings": [],
  "assumptions": []
}
```

**User Prompt**:
```
### Defaults
Currency: AED
TaxType: GST
Expected Sections: Strategy & Account Management, Planning & Architecture, ...

### Approved Entries (contract summary)
[Full JSON of all 22-field scope entries - truncated to 4500 chars]

### Scope Quantity Signals (* marks primary)
strategy-account-line-1: *6 months (duration); 12 deliveries (frequency)
planning-architecture-line-1: *12 calendars (monthly count)
...

### Scenario Highlights
strategy-account-line-1: Monthly recurring deliverable; Multi-market scope
...

### Commercial Fit Snapshot
strategy-account-line-1: SMM-STRATEGY-001 — qty 6 months (score 90.50)
planning-architecture-line-1: SMM-PLANNING-002 — qty 12 calendars (score 88.20)
...

### Locked SKUs
Entry ID: strategy-account-line-1 | Locked SKU: SMM-STRATEGY-001 | Qty: 6 months | Visibility: Client
Entry ID: planning-architecture-line-1 | Locked SKU: SMM-PLANNING-002 | Qty: 12 calendars | Visibility: Client
...

### Commercial Constraints
{
  "targetMarginPct": 30,
  "approvalsPending": []
}

### Catalog Hints
SMM-STRATEGY-001: Social Media Strategy & Planning (AED 5000) - Monthly strategy...
SMM-PLANNING-002: Content Calendar Management (AED 3000) - Monthly calendars...
...

### Client Signals
Industry: Hospitality (0.9)
Region: UAE (0.95)

### Brief
We need a 6-month social media retainer...
```

#### 6C. LLM Call

**Request to OpenAI**:
```javascript
POST https://api.openai.com/v1/chat/completions
{
  "model": "gpt-4o-2024-08-06",
  "temperature": 0,
  "max_tokens": 2600,
  "messages": [
    {
      "role": "system",
      "content": "You are hrmny's proposal author persona..."
    },
    {
      "role": "user",
      "content": "### Defaults\nCurrency: AED..."
    }
  ],
  "response_format": {
    "type": "json_object"  // NOT strict schema for plan (allows flexibility)
  }
}
```

**Response From LLM**:
```json
{
  "status": "ok",
  "projectName": "Luxury Hotel Social Media Retainer",
  "clientName": "Luxury Hotel Dubai",
  "currency": "AED",
  "taxType": "GST",
  "sections": [
    {
      "sectionName": "Strategy & Account Management",
      "scopeEntryId": "strategy-account",
      "canonical": "strategy-account",
      "justification": "Monthly social media strategy and account stewardship for 6-month retainer period",
      "items": [
        {
          "scopeEntryId": "strategy-account-line-1",
          "description": "Monthly Social Media Strategy & Planning",
          "qty": 6,
          "unit": "months",
          "unitRate": 5000,
          "clientAmount": 30000,
          "internalCost": 3500,
          "sku": "SMM-STRATEGY-001",
          "visibility": "Client",
          "warnings": []
        }
      ],
      "sectionWarnings": [],
      "marginSummary": "Target margin: 30% (AED 9,000), Actual: 30% (AED 9,000)"
    },
    {
      "sectionName": "Planning & Architecture",
      "scopeEntryId": "planning-architecture",
      "canonical": "planning-architecture",
      "justification": "Monthly content calendar and editorial planning across all channels",
      "items": [
        {
          "scopeEntryId": "planning-architecture-line-1",
          "description": "Monthly Content Calendar (12 calendars)",
          "qty": 12,
          "unit": "calendars",
          "unitRate": 3000,
          "clientAmount": 36000,
          "internalCost": 2100,
          "sku": "SMM-PLANNING-002",
          "visibility": "Client",
          "warnings": []
        }
      ],
      "sectionWarnings": [],
      "marginSummary": "Target margin: 30% (AED 10,800), Actual: 30% (AED 10,800)"
    }
    // ... more sections
  ],
  "fees": [],
  "warnings": [],
  "assumptions": ["Client provides brand assets and guidelines"]
}
```

#### 6D. Post-Processing

**System Actions**:
1. Parses JSON response
2. Validates structure
3. Stores quote in memory
4. Returns to UI

**User Sees**:
- Quote organized by sections (Strategy, Planning, Asset Development, ...)
- Each section shows:
  - Section name
  - Justification
  - Line items with descriptions, quantities, rates, amounts
  - Margin summary
- Total at bottom
- Can export to Xero or Google Sheets

---

### Step 7: Section Summaries (LLM Call #4 - Optional)

**Trigger**: User clicks "Generate Summaries" or system auto-generates for client-facing quote

**Function**: `requestSectionSummariesViaLLM()` in `05_AISidebar_UI.js:4800`

**Purpose**: Creates concise, client-friendly summary for each section

#### 7A. Build Prompt

**System Prompt**:
```
You turn structured quote line items into concise section blurbs.
Use professional, confident tone.
Keep each summary to 1-2 sentences.
Do not mention totals, taxes, or currency.
```

**User Prompt**:
```json
{
  "sections": [
    {
      "sectionKey": "strategy-account",
      "sectionName": "Strategy & Account Management",
      "visibility": "Client",
      "lineItems": [
        {
          "itemCode": "SMM-STRATEGY-001",
          "label": "Monthly Social Media Strategy & Planning",
          "description": "Monthly Social Media Strategy & Planning",
          "visibility": "Client",
          "qty": 6,
          "unit": "months",
          "unitRate": 5000,
          "amount": 30000
        }
      ]
    }
  ]
}
```

#### 7B. LLM Call

**Response**:
```json
{
  "summaries": [
    {
      "sectionKey": "strategy-account",
      "summary": "We'll provide ongoing strategic direction for your social media presence across all channels, including monthly strategy reviews and brand alignment to ensure consistent messaging and optimal platform performance."
    },
    {
      "sectionKey": "planning-architecture",
      "summary": "Our team will develop comprehensive monthly content calendars aligned with your brand objectives, seasonal moments, and audience engagement patterns."
    }
  ]
}
```

**User Sees**:
- Each section now has professional summary text
- Can be exported to client-facing quote
- Improves readability and professionalism

---

## Configuration Sheets

### 1. Config: Brief Profiles

**Purpose**: Defines brief types and their characteristics

**Columns**:
- `briefType`: Unique identifier (e.g., "smm-retainer", "pr-retainer", "campaign")
- `label`: Display name (e.g., "SMM Retainer")
- `nudge`: Guidance text sent to LLM (e.g., "Focus on monthly retainer deliverables...")
- `sectionOrderCSV`: Expected sections in order (e.g., "Strategy,Planning,Asset Development,...")
- `optionalSectionsCSV`: Sections that can be omitted (e.g., "Pre-Production,Production")
- `catalogPrefixesCSV`: SKU prefixes to prioritize (e.g., "SMM-,SOCIAL-")
- `signatureCuesCSV`: Keywords that identify this brief type (e.g., "retainer,social media,monthly")
- `fallback`: Fallback brief type if detection fails
- `active`: Is this brief type active? (TRUE/FALSE)
- `priority`: Sort order in dropdown

**Used By**:
- `getBriefProfile()` → Returns profile for selected brief type
- `buildScopeDraftPrompt()` → Gets nudge, section order, catalog prefixes
- `buildPlanPrompt()` → Gets expected sections

**Impact on LLM**:
- `nudge` → Appears in system prompt: "Brief Type: {label}. {nudge}"
- `catalogPrefixesCSV` → Prioritizes these SKUs in vector search results
- `sectionOrderCSV` → Guides section organization in quote

---

### 2. Config: Scope Phases

**Purpose**: Defines phases for each brief type

**Columns**:
- `briefType`: Which brief this phase belongs to (e.g., "smm-retainer")
- `phaseId`: Internal identifier (e.g., "strategy-account-1")
- `label`: Display name (e.g., "Strategy & Account Management")
- `canonical`: Canonical phase ID (e.g., "strategy-account") - **CRITICAL FOR MATCHING**
- `required`: Is this phase required? (TRUE/FALSE)
- `order`: Display order (1, 2, 3, ...)
- `ancillaryFeeFlagsCSV`: Fee flags (e.g., "travel,accommodation")
- `cadence`: How often (e.g., "monthly", "quarterly", "one-time")
- `deliverableHint`: **Sent to LLM** - Examples of deliverables (e.g., "Annual strategy docs, Channel definitions, Tone of voice guidelines")
- `signalHint`: **Sent to LLM** - Keywords that indicate this phase (e.g., "define social media strategy, set channel roles, own tone of voice")
- `synonymsCSV`: Alternative names (e.g., "strategy,account,planning")
- `taxonomyHintJSON`: Additional taxonomy data (JSON)
- `active`: Is this phase active? (TRUE/FALSE)

**Used By**:
- `getScopeCategoryConfigMap()` → Groups phases by briefType
- `getScopePhaseCanonicals()` → Returns list of canonical IDs → **Sent to LLM**
- `buildPhaseGuidanceForPrompt()` → Builds phase guidance → **Sent to LLM**
- `getPhaseLabelMap()` → Maps canonical to label for UI
- UI matching → `resolvePhaseCanonicalForEntry()` matches LLM's canonical to configured canonical

**Impact on LLM**:
- `canonical` → Appears in prompt: "Set canonical field to one of: strategy-account, planning-architecture, ..."
- `deliverableHint` → Appears in prompt: "Phase: Strategy | Deliverables: {deliverableHint} | Signals: {signalHint}"
- `signalHint` → Same as above

**THE BUG WE FIXED**:
- Functions were calling `ConfigurationManager.get('scope.phases')` (returns ARRAY)
- Then trying `array[briefType]` → undefined
- Result: Empty canonical list sent to LLM
- LLM made up its own canonicals
- UI couldn't match → freeform text instead of structured

**THE FIX**:
- Changed to use `getScopeCategoryConfigMap()` (returns MAP grouped by briefType)
- Now `map[briefType]` → {phases: [...]}
- Correct canonical list sent to LLM
- LLM uses configured canonicals
- UI matches successfully → structured display

---

### 3. Config: Phase Taxonomy Overrides

**Purpose**: Provides detailed phase definitions (optional, enhances LLM guidance)

**Columns**:
- `briefType`: Which brief this applies to
- `phaseCanonical`: Which phase this defines (e.g., "strategy-account")
- `purpose`: Strict definition of phase purpose
- `keyDeliverablesCSV`: Key deliverable examples (e.g., "Strategy doc,Channel definitions,Tone guidelines")
- `signalsCSV`: Signal keywords (e.g., "define strategy,set channel roles,own tone")
- `keywordsCSV`: Additional keywords (e.g., "social media strategy,always-on social strategy")
- `boundaryHint`: Boundary rules (e.g., "Strategy is for planning, not doing; keep execution verbs inside production phases")

**Used By**:
- `buildPhaseDefinitionsBlock()` → Builds detailed phase definitions → **Sent to LLM**
- `getBriefTypePhaseTaxonomy()` → Returns taxonomy lookup for brief type

**Impact on LLM**:
Appears in prompt as:
```
### Phase Definitions
- Phase: Strategy & Account Management (strategy-account)
  Strict definition: {purpose}
  Key deliverables: {keyDeliverablesCSV[0-3]}
  Signals: {signalsCSV[0-3]}
  Keywords: {keywordsCSV[0-3]}
  Boundary: {boundaryHint}
```

**When to Use**:
- If you want MORE detailed phase guidance than just deliverableHint/signalHint
- If you want explicit boundary rules to prevent phase bleeding
- If you want to override default taxonomy

---

### 4. Config: Catalog Prefixes

**Purpose**: Defines SKU prefixes to prioritize for each brief type

**Columns**:
- `briefType`: Which brief type (e.g., "smm-retainer")
- `prefix`: SKU prefix to prioritize (e.g., "SMM-", "SOCIAL-")
- `priority`: Sort order (1 = highest priority)
- `active`: Is this prefix active? (TRUE/FALSE)

**Used By**:
- `getBriefProfile()` → Includes in `catalogPrefixes` array
- `buildLLMContext()` → Prioritizes catalog hints with these prefixes

**Impact on Process**:
- Vector search returns all matches
- System sorts them: prefixes matching catalogPrefixes come first
- LLM sees prioritized SKUs first in candidate list
- Increases chance LLM picks the "right" SKU for this brief type

**Example**:
```
Brief Type: smm-retainer
Prefixes: SMM-, SOCIAL-, CONTENT-

Vector search returns:
1. SMM-STRATEGY-001 (score 0.89) ← Has SMM- prefix, moved to top
2. PROD-VIDEO-001 (score 0.91)   ← Higher score but wrong prefix, moved down
3. SOCIAL-POST-001 (score 0.85)  ← Has SOCIAL- prefix, moved up
```

---

### 5. Config: Resource Catalog

**Purpose**: Defines resource items (crew, equipment, services)

**Columns**:
- `code`: SKU/code (e.g., "RES-DIRECTOR-001")
- `name`: Display name (e.g., "Creative Director")
- `unit`: Unit of measure (e.g., "hour", "day", "month")
- `rate`: Default rate (e.g., 500)
- `category`: Resource category (e.g., "crew", "equipment", "services")
- `source`: Where this comes from (e.g., "internal", "external", "vendor")
- `description`: Description text
- `pricingMode`: How to price (e.g., "RATE", "DAY_RATE", "FIXED")
- `status`: Active status
- `metadataJSON`: Additional metadata (JSON)

**Used By**:
- `lookupItem()` → Looks up resource by code
- Catalog mapping → Can map to resources instead of scope items

**Impact on Process**:
- Resources can be embedded in vector store
- Can be matched to scope entry resources
- Not heavily used in current flow (mostly SKU-based)

---

### 6. Config: Scope Catalog

**Purpose**: Defines scope item catalog (alternative to resources)

**Columns**:
- `scopeId`: Unique identifier
- `label`: Display name
- `canonical`: Phase canonical this belongs to
- `briefType`: Which brief type
- `phaseId`: Which phase
- `ancillaryFeeFlagsCSV`: Fee flags
- `order`: Display order
- `notes`: Notes
- `aliasesCSV`: Alternative names

**Used By**:
- Scope catalog system (not heavily used in current LLM flow)
- Can be used for pre-defined scope templates

**Impact on Process**:
- Alternative to LLM-generated scope
- Can provide pre-built scope items for common brief types
- Not part of main LLM pipeline

---

### 7. Config: Column Map

**Purpose**: Maps internal field names to display labels

**Columns**:
- `key`: Internal field name (e.g., "scopeLabel", "deliverables")
- `value`: Display label (e.g., "Scope Label", "Deliverables")

**Used By**:
- UI rendering → Shows friendly column headers
- Export formatters → Labels columns in exports

**Impact on Process**:
- Cosmetic only (doesn't affect LLM or logic)
- Makes UI more user-friendly

---

### 8. Catalog: Resources & Catalog: Scopes

**Purpose**: Actual catalog data (SKUs, prices, descriptions)

**Format**: Standard catalog sheets

**Used By**:
- Vector store ingestion → Embedded and indexed
- Vector search → Searched against
- Commercial fit → Provides SKU candidates

**Impact on Process**:
- **This is where SKU data comes from**
- Embeddings generated from: `sku + name + description`
- Vector search matches scope text against these embeddings
- LLM receives top 10 matches per scope entry

---

## LLM Calls Deep Dive

### Call #1: Scope Extraction

**Purpose**: Brief → Structured Scope

**Input**: Brief text + PDFs + phase guidance
**Output**: Flat array of 8-field entries
**Schema**: SCOPE_DRAFT_LLM_SCHEMA (strict)
**Model**: gpt-4o-2024-08-06 (or LLM_SCOPE_MODEL property)
**Tokens**: ~4,200 prompt + ~850 completion = ~5,050 total
**Cost**: ~$0.021 per extraction (at $0.005/1K input, $0.015/1K output)

**Critical Dependencies**:
- ✅ `getScopePhaseCanonicals()` must return correct canonicals
- ✅ `buildPhaseGuidanceForPrompt()` must return phase hints
- ✅ Config: Scope Phases must be populated
- ✅ Config: Brief Profiles must exist for selected brief type

**Success Criteria**:
- LLM returns JSON matching SCOPE_DRAFT_LLM_SCHEMA
- `canonical` fields match configured phase canonicals
- Each entry has 8 required fields
- No schema validation errors

**Failure Modes**:
- ❌ Empty canonical list → LLM makes up canonicals → UI can't match → freeform display
- ❌ Missing phase guidance → LLM doesn't understand phase boundaries → phase bleeding
- ❌ Schema mismatch → JSON parse error → extraction fails
- ❌ LLM hallucinates → Invalid data → validation fails

---

### Call #2: Commercial Fit

**Purpose**: Scope Entries + Vector Candidates → Chosen SKUs

**Input**: Scope entries + top 10 vector candidates per entry
**Output**: Chosen SKU + alternates + justification per entry
**Schema**: CATALOG_MAPPER_RESPONSE_SCHEMA (strict)
**Model**: gpt-4o-2024-08-06 (or LLM_CATALOG_MODEL property)
**Tokens**: Variable (~3,000-5,000 depending on entry count)
**Cost**: ~$0.025-$0.040 per call

**Critical Dependencies**:
- ✅ Vector search must return relevant candidates
- ✅ Vector store must be synced with latest catalog
- ✅ Catalog items must have good descriptions (for embedding quality)

**Success Criteria**:
- LLM picks best SKU from candidates (not invented SKUs)
- Justification makes sense
- Score reflects match quality
- Warnings flag poor matches

**Failure Modes**:
- ❌ Stale vector store → Old SKUs returned → LLM picks discontinued items
- ❌ Poor candidate quality → LLM forced to pick bad match → Low scores
- ❌ Missing descriptions → Weak embeddings → Bad search results

---

### Call #3: Commercial Plan

**Purpose**: Scope + SKUs → Client Quote

**Input**: Approved scope + chosen SKUs + constraints
**Output**: Sections + line items + pricing
**Schema**: json_object (NOT strict - allows flexibility)
**Model**: gpt-4o-2024-08-06 (or LLM_QUOTE_MODEL property)
**Tokens**: ~5,000-8,000 (depends on scope size)
**Cost**: ~$0.040-$0.060 per call

**Critical Dependencies**:
- ✅ Commercial fit must be complete (all SKUs chosen)
- ✅ Quantity signals must be extracted
- ✅ Locked SKUs must be respected
- ✅ Phase guidance helps section organization

**Success Criteria**:
- One line item per scope entry
- All `scopeEntryId` fields linked correctly
- Quantities and rates make sense
- Margin calculations accurate
- No invented SKUs (uses locked SKUs)

**Failure Modes**:
- ❌ Missing quantities → LLM guesses → Inaccurate pricing
- ❌ LLM ignores locked SKUs → Wrong products quoted
- ❌ Missing rate data → LLM can't calculate → Null amounts
- ❌ Section grouping wrong → Phases mixed together

---

### Call #4: Section Summaries (Optional)

**Purpose**: Line Items → Client-Friendly Text

**Input**: Sections with line items
**Output**: Summary text per section
**Schema**: SECTION_SUMMARY_RESPONSE_SCHEMA (strict)
**Model**: gpt-4o-2024-08-06 (or LLM_SCOPE_MODEL property)
**Tokens**: ~2,000-3,000
**Cost**: ~$0.015-$0.025 per call

**Critical Dependencies**:
- ✅ Quote must be generated first
- ✅ Sections must have meaningful content

**Success Criteria**:
- Professional, concise summaries
- No price/total mentions
- Client-appropriate language

**Failure Modes**:
- ❌ LLM too verbose → Summaries too long
- ❌ LLM mentions pricing → Not client-appropriate
- ❌ Generic summaries → Not specific to project

---

## Data Flow

### Flow Diagram

```
USER INPUT
  ├─ Brief Text (textarea)
  ├─ PDF Attachments (Google Drive Picker)
  ├─ Brief Type Selection (dropdown from Config: Brief Profiles)
  └─ Client Context (auto-detected or manual)
      ↓
STEP 1: SCOPE EXTRACTION
  ├─ Load Config: Brief Profiles → Get nudge, section order, catalog prefixes
  ├─ Load Config: Scope Phases → Get phase canonicals, deliverable hints, signal hints
  ├─ Load Config: Phase Taxonomy Overrides → Get detailed definitions (optional)
  ├─ Build System Prompt (15,000 chars)
  │   ├─ Persona + Brief Type Nudge
  │   ├─ Canonical Phase IDs (from Scope Phases)
  │   ├─ Phase Guidance (from Scope Phases deliverableHint + signalHint)
  │   ├─ Phase Definitions (from Taxonomy Overrides)
  │   ├─ Evidence Rules + Structure Rules
  │   └─ Example JSON Blueprint
  ├─ Build User Prompt (2,000 chars)
  │   ├─ Brief Text
  │   ├─ PDF Summaries (extracted)
  │   ├─ Client Signals (auto-detected)
  │   └─ Mandatory Phase Evidence (pre-scanned)
  ├─ LLM Call #1: OpenAI ChatCompletion
  │   ├─ Model: gpt-4o-2024-08-06
  │   ├─ Schema: SCOPE_DRAFT_LLM_SCHEMA (strict, 8 fields)
  │   └─ Returns: {projectName, briefType, scopeEntries[], warnings[], assumptions[]}
  ├─ Normalization (8 fields → 22 fields)
  │   ├─ Generate unique IDs (e.g., "strategy-account-line-1")
  │   ├─ Establish parent-child relationships
  │   ├─ Add empty arrays for later enrichment
  │   └─ Returns: Complete 22-field entries
  └─ UI Rendering
      ├─ Group entries by canonical
      ├─ Match canonical to configured phases
      ├─ IF entry.id exists AND canonical matches → Structured (draggable)
      └─ ELSE → Freeform (textarea)
      ↓
STEP 2: VECTOR SEARCH (Per Entry)
  ├─ Build search text (label + deliverables + notes + signals)
  ├─ Generate embedding (OpenAI text-embedding-3-large, 3072 dims)
  ├─ Search vector store (top 10 candidates, score > 0.42)
  ├─ Attach candidates to entry.vectorCandidates
  └─ Prioritize by catalog prefixes (from Brief Profiles)
      ↓
STEP 3: COMMERCIAL FIT
  ├─ For each entry with vector candidates:
  │   ├─ Build prompt with entry details + candidates
  │   └─ LLM Call #2: Pick best SKU
  ├─ Schema: CATALOG_MAPPER_RESPONSE_SCHEMA (strict)
  ├─ Returns: {scopeEntryId, chosenSku, alternates[], score, confidence, justification}
  ├─ Merge into entry.chosenSku
  ├─ Extract quantity from quantitySignals
  └─ Store commercial fit snapshot
      ↓
STEP 4: COMMERCIAL PLAN
  ├─ Load Config: Brief Profiles → Get expected sections
  ├─ Load Config: Scope Phases → Get phase guidance (again)
  ├─ Build Context
  │   ├─ All scope entries (22 fields + chosen SKUs)
  │   ├─ Commercial fit snapshot
  │   ├─ Quantity signals
  │   ├─ Locked SKUs
  │   ├─ Constraints (target margin, approvals pending)
  │   └─ Catalog hints
  ├─ Build System Prompt
  │   ├─ Persona (proposal-author / managing-director / analyst)
  │   ├─ Brief Type Nudge
  │   ├─ Phase Guidance (from Scope Phases)
  │   ├─ Commercial Rules (respect locked SKUs, map 1:1, compute amounts)
  │   └─ Output Blueprint
  ├─ Build User Prompt
  │   ├─ Defaults (currency, tax, expected sections)
  │   ├─ Approved Entries (full JSON, truncated to 4500 chars)
  │   ├─ Quantity Signals (* marks primary)
  │   ├─ Scenario Highlights
  │   ├─ Commercial Fit Snapshot
  │   ├─ Locked SKUs
  │   ├─ Constraints
  │   ├─ Catalog Hints
  │   └─ Brief Text
  ├─ LLM Call #3: Generate Quote
  │   ├─ Schema: json_object (NOT strict)
  │   └─ Returns: {status, sections[], fees[], warnings[], assumptions[]}
  └─ UI Display
      ├─ Sections organized by canonical
      ├─ Line items with SKUs, quantities, rates, amounts
      ├─ Margin summaries per section
      └─ Total at bottom
      ↓
STEP 5: SECTION SUMMARIES (Optional)
  ├─ Build payload with sections + line items
  ├─ LLM Call #4: Generate summaries
  ├─ Schema: SECTION_SUMMARY_RESPONSE_SCHEMA (strict)
  ├─ Returns: {summaries: [{sectionKey, summary}]}
  └─ Merge into sections
      ↓
EXPORT
  ├─ To Google Sheets (formatted quote)
  ├─ To Xero (invoice line items)
  └─ To PDF (client-facing quote)
```

---

## Issues & Improvements

### 🔴 Critical Issues (Fixed)

#### Issue #1: Empty Canonical List Sent to LLM
**Symptom**: Structured entries became freeform text
**Root Cause**: `getScopePhaseCanonicals()` and 3 other functions were calling `ConfigurationManager.get('scope.phases')` which returns an ARRAY, then trying to access it as a MAP via `array[briefType]` → undefined
**Impact**: LLM received no canonical guidance, made up its own canonicals, UI couldn't match entries to phases, rendered as freeform instead of structured
**Fix**: Changed all 4 functions to use `getScopeCategoryConfigMap()` which returns phases grouped by briefType as a proper MAP
**Status**: ✅ FIXED (commits: daa18c5, 626ce86, 36d3953)

#### Issue #2: Missing Phase Guidance in Commercial Plan
**Symptom**: `ReferenceError: phaseGuidanceText is not defined`
**Root Cause**: `buildPlanPrompt()` referenced `phaseGuidanceText` variable at line 2550 but never defined it
**Impact**: Commercial plan LLM call would crash or skip phase guidance entirely
**Fix**: Added missing variable definition (lines 2376-2377)
**Status**: ✅ FIXED

#### Issue #3: Questions Field in Schema
**Symptom**: Questions appearing in diagnostics (legacy behavior)
**Root Cause**: `questions` field still in SCOPE_DRAFT_LLM_SCHEMA
**Impact**: LLM generated questions that weren't needed
**Fix**: Removed `questions` from schema required array and properties
**Status**: ✅ FIXED

---

### 🟡 Medium Priority Issues

#### Issue #4: Prompt Length (15,000+ chars)
**Symptom**: System prompt for scope extraction is very long
**Root Cause**: Includes all phase guidance + definitions + rules + example for all 9 phases
**Impact**: Higher token costs, slower LLM response times
**Improvement Options**:
1. **Lazy load phase definitions**: Only include definitions for phases detected in brief (scan first)
2. **Compress guidance**: Use shorter hints, remove redundant text
3. **Two-pass extraction**: First pass identifies relevant phases, second pass extracts only those
4. **Embedding-based phase selection**: Use vector search to find relevant phases before prompt building

**Estimated Savings**: 30-40% token reduction (4,200 → 2,500-3,000 tokens)

---

#### Issue #5: Multiple Config Loads
**Symptom**: Config sheets loaded multiple times during single extraction
**Root Cause**: Each function calls `getScopeCategoryConfigMap()` or `ConfigurationManager.get()` independently
**Impact**: Redundant sheet reads, slower performance
**Improvement Options**:
1. **Cache config in context**: Load once, pass through context object
2. **Memoization**: Cache config in memory for session duration
3. **Batch loading**: Load all configs at sidebar open, store in client state

**Estimated Savings**: 50-70% faster extraction (fewer sheet reads)

---

#### Issue #6: Vector Search Not Scope-Aware
**Symptom**: Vector search returns generic matches, doesn't consider brief type or phase
**Root Cause**: Search is pure embedding similarity, no metadata filtering
**Impact**: SKU candidates may include wrong categories (e.g., production SKUs for strategy scope)
**Improvement Options**:
1. **Metadata filtering**: Filter vector results by `briefType` and `canonical` before sending to LLM
2. **Phase-specific vector stores**: Separate vector stores per phase (strategy, production, etc.)
3. **Hybrid search**: Combine embedding similarity + metadata exact match
4. **Boost brief-specific SKUs**: Apply score boost to SKUs matching `catalogPrefixes`

**Estimated Impact**: 20-30% better SKU matching accuracy

---

#### Issue #7: No Quantity Extraction Validation
**Symptom**: Quantities sometimes missing or wrong
**Root Cause**: Quantity extraction relies on heuristics (regex, keywords), no validation
**Impact**: LLM must guess quantities, leading to inaccurate pricing
**Improvement Options**:
1. **Quantity-focused LLM call**: Separate call to extract quantities with strict schema
2. **Required questions**: Force user to answer quantity questions if not detected
3. **Validation layer**: Check extracted quantities against business rules (e.g., min/max ranges)
4. **Confidence scoring**: Flag low-confidence quantities for manual review

**Estimated Impact**: 40-50% fewer quantity errors

---

### 🟢 Enhancement Opportunities

#### Enhancement #1: Batch LLM Calls
**Current**: Commercial fit calls LLM once (processes all entries together)
**Opportunity**: Same for scope extraction - could batch multiple briefs
**Benefit**: Process multiple briefs in parallel, reduce total processing time
**Complexity**: Medium (need request queuing + result routing)

---

#### Enhancement #2: Incremental Extraction
**Current**: Extract entire scope in one shot
**Opportunity**: Extract section-by-section, allow user to approve/reject per section
**Benefit**: Better control, faster iteration, less wasted LLM calls
**Complexity**: High (requires state management, partial results handling)

---

#### Enhancement #3: Learning from Corrections
**Current**: User corrections are lost after session
**Opportunity**: Store corrections (wrong SKU choices, missing quantities) and use as training data
**Benefit**: Improve future extractions, reduce manual corrections
**Complexity**: High (requires correction tracking, feedback loop, model fine-tuning)

---

#### Enhancement #4: Template Library
**Current**: Every brief starts from scratch
**Opportunity**: Build library of common scope templates per brief type
**Benefit**: Faster extractions for standard briefs, more consistent output
**Complexity**: Low (add template selection UI, pre-fill scope entries)

---

#### Enhancement #5: Multi-Model Orchestration
**Current**: Single model (gpt-4o) for all tasks
**Opportunity**: Use different models for different tasks (smaller/faster for summaries, larger for complex extractions)
**Benefit**: Cost optimization, faster processing for simple tasks
**Complexity**: Medium (model routing logic, fallback handling)

---

## Configuration Best Practices

### 1. Brief Profiles Setup

**Do**:
- ✅ Create one profile per distinct brief type
- ✅ Use clear, descriptive labels ("SMM Retainer" not "smm")
- ✅ Write detailed nudges (LLM reads these)
- ✅ List sections in expected order
- ✅ Set catalog prefixes to prioritize right SKUs
- ✅ Mark inactive profiles as active=FALSE (don't delete)

**Don't**:
- ❌ Use generic nudges ("Handle this brief") - be specific
- ❌ Leave sectionOrderCSV empty - LLM needs guidance
- ❌ Forget catalogPrefixesCSV - affects SKU matching quality
- ❌ Delete old profiles - mark inactive instead (preserves history)

---

### 2. Scope Phases Setup

**Do**:
- ✅ Use consistent canonical IDs across all brief types (e.g., "strategy-account", not "strategy" for one and "strategy-account" for another)
- ✅ Write clear deliverableHint (specific examples, not generic)
- ✅ Write keyword-rich signalHint (LLM uses for detection)
- ✅ Order phases logically (workflow order)
- ✅ Set required=TRUE for mandatory phases
- ✅ Populate synonymsCSV (helps matching)

**Don't**:
- ❌ Use vague deliverableHint ("Various deliverables") - be specific
- ❌ Use empty signalHint - LLM needs keywords
- ❌ Change canonical IDs after go-live (breaks historical data)
- ❌ Skip order field (affects UI display)
- ❌ Leave active=FALSE for phases in use (breaks extraction)

**Example Good Row**:
```
briefType: smm-retainer
phaseId: strategy-account-1
label: Strategy & Account Management
canonical: strategy-account
required: TRUE
order: 1
deliverableHint: Annual social media strategy document; Channel role definitions; Tone of voice guidelines; Monthly strategic reviews
signalHint: define social media strategy, set channel roles, own tone of voice, strategic direction, account stewardship
synonymsCSV: strategy,account,planning,direction
active: TRUE
```

**Example Bad Row**:
```
briefType: smm-retainer
phaseId: strat
label: Strategy
canonical: strat
required: TRUE
order: 1
deliverableHint: Strategy stuff
signalHint: strategy
synonymsCSV:
active: TRUE
```

---

### 3. Phase Taxonomy Overrides Setup

**When to Use**:
- Complex brief types with strict phase boundaries
- Phases that frequently bleed into each other (e.g., planning vs execution)
- Client-facing quotes requiring precise phase definitions

**Do**:
- ✅ Write clear purpose statements (1-2 sentences)
- ✅ List 3-5 key deliverables (most important ones)
- ✅ Use boundary hints to prevent phase bleeding
- ✅ Keep language consistent with main Scope Phases

**Don't**:
- ❌ Duplicate deliverableHint from Scope Phases (this should be MORE detailed)
- ❌ Write vague boundaries ("Keep things organized")
- ❌ Contradict Scope Phases data

---

### 4. Catalog Prefixes Setup

**Do**:
- ✅ Set priority correctly (1 = highest, scan catalog first)
- ✅ Use consistent prefix patterns (SMM-, SOCIAL-, not smm-, Social-)
- ✅ Cover all major SKU families for brief type

**Don't**:
- ❌ Set too many prefixes (dilutes prioritization)
- ❌ Use prefixes that don't exist in catalog (no matches)
- ❌ Forget to update when adding new SKU families

---

### 5. Catalog Maintenance

**Do**:
- ✅ Write detailed descriptions (used for embeddings)
- ✅ Include keywords in descriptions (improves search)
- ✅ Keep SKU naming consistent (prefix + category + number)
- ✅ Re-sync vector store after catalog updates
- ✅ Test search quality after big changes

**Don't**:
- ❌ Use vague descriptions ("Social media service")
- ❌ Forget to sync vector store (stale results)
- ❌ Change SKU codes for existing items (breaks historical quotes)
- ❌ Leave description field empty (weak embeddings)

---

## Monitoring & Debugging

### Key Metrics to Track

1. **Extraction Success Rate**: % of extractions that complete without errors
2. **Canonical Match Rate**: % of entries that successfully match to configured phases
3. **Freeform Fallback Rate**: % of entries rendered as freeform (indicates matching failures)
4. **SKU Match Quality**: Average score of chosen SKUs
5. **LLM Token Usage**: Total tokens per extraction (monitor costs)
6. **Quantity Detection Rate**: % of entries with successfully extracted quantities
7. **Manual Correction Rate**: % of entries user manually corrects

### Diagnostic Functions

**Created**:
- `admin/_DiagnoseExactPrompts.js` → Shows exact prompts sent to LLM
- `admin/_DiagnoseCategoryConfigMap.js` → Validates config loading
- `admin/_CheckScopeCategoryEnabled.js` → Checks feature flags
- `admin/_DiagnosePrompt.js` → Tests prompt building functions
- `admin/_DiagnoseClientSide.html` → Client-side config validation

**How to Use**:
1. Open Google Apps Script editor
2. Select diagnostic function
3. Run and check logs
4. Or use `diagnoseExactPromptsToSheet()` to output to sheet (avoids truncation)

---

## Summary

### What Works Well ✅

1. **End-to-end automation**: Brief → Quote with minimal manual work
2. **Structured output**: 22-field normalized entries enable rich UI
3. **Phase-based organization**: Clear workflow phases guide extraction
4. **SKU mapping**: Vector search + LLM produces good matches
5. **Configurable**: All behavior driven by Google Sheets (no code changes)
6. **Schema validation**: Strict schemas ensure LLM output quality

### What Needs Improvement 🔧

1. **Prompt length**: 15,000+ chars is expensive and slow
2. **Config loading**: Multiple redundant reads during extraction
3. **Vector search**: No metadata filtering, generic matches
4. **Quantity extraction**: Unreliable, needs validation layer
5. **Error handling**: Silent failures, hard to debug
6. **Monitoring**: No metrics tracking, can't measure improvement

### Quick Wins (Low Effort, High Impact) 🎯

1. **Cache config in context**: Eliminate redundant sheet reads (30% faster)
2. **Metadata filtering on vector search**: Better SKU matches (20% accuracy boost)
3. **Required quantity questions**: Force user to answer if not detected (40% fewer errors)
4. **Diagnostic dashboard**: Sheet with key metrics (enables monitoring)
5. **Template library**: Pre-built scopes for common brief types (50% faster for standard briefs)

---

## Next Steps

### Recommended Action Plan

**Phase 1: Fix Critical Issues** (Week 1)
- [x] Fix getScopePhaseCanonicals() bug
- [x] Fix buildPlanPrompt() missing variable
- [x] Remove questions field from schema
- [ ] Add diagnostic logging to production
- [ ] Create monitoring dashboard

**Phase 2: Quick Wins** (Week 2-3)
- [ ] Implement config caching
- [ ] Add metadata filtering to vector search
- [ ] Add required quantity questions
- [ ] Build template library for common briefs

**Phase 3: Major Improvements** (Month 2)
- [ ] Compress prompts (lazy load phase definitions)
- [ ] Add quantity extraction validation layer
- [ ] Implement learning from corrections
- [ ] Multi-model orchestration

**Phase 4: Advanced Features** (Month 3+)
- [ ] Incremental extraction
- [ ] Batch processing
- [ ] Fine-tuning on historical data
- [ ] Advanced analytics & insights

---

**Document Version**: 1.0
**Last Updated**: 2026-01-13
**Author**: System Analysis
**Status**: Ready for Review

# Complete LLM Prompt Pipeline Map
## All Prompts, Schemas, and Instructions Sent to LLMs

This document maps EVERYTHING sent to the LLM during quote generation.

---

## 1. SCOPE EXTRACTION (extractScopeDraft)

**Entry Point:** `05_AISidebar_UI.js:5543` (extractScopeDraft function)

**Flow:**
1. User provides brief text + attachments
2. System calls `buildScopeDraftPrompt(context)` (line 5609)
3. Sends to LLM via `invokeLLMChatWithRunRecovery()` (line 5610)

### 1.1 Scope Extraction - System Prompt

**Built at:** `05_AISidebar_UI.js:2316-2332`

**Components:**

```
PERSONA:
"You are hrmny's scope analyst persona. Review the brief and attachments to determine the actual scopes of work the agency must cover."

BRIEF TYPE NUDGE:
"Brief Type: {briefProfile.label}. {briefProfile.nudge}"
Example: "Brief Type: SMM Retainer. Focus on monthly retainer deliverables and social media campaign planning."

TAXONOMY INSTRUCTION:
"This extraction follows the {briefProfile.label} taxonomy; emphasise its deliverables and signals."

CANONICAL PHASE INSTRUCTION:
IF phaseCanonicals exist:
  "If possible, set the `canonical` field on each section to one of these phase IDs: {phaseCanonicals}"
  Example: "strategy-account, planning-architecture, asset-development, production-capture, post-production-asset, distribution-activation, measurement-optimization"
ELSE:
  "This brief type has no configured canonical phase IDs; describe each section clearly."

PHASE GUIDANCE (if available):
Built by buildPhaseGuidanceForPrompt():
  "Phase: {label} | Deliverables: {deliverableHint} | Signals: {signalHint}"
  Example:
  "Phase: Strategy & Planning | Deliverables: Strategic roadmap, campaign framework | Signals: strategy, planning, roadmap"
  "Phase: Production & Capture | Deliverables: Shoot execution, on-set registry | Signals: shoot, capture, filming, production day"

PHASE DEFINITIONS BLOCK (if available):
Built by buildPhaseDefinitionsBlock():
  "### Phase Definitions
  - Phase: {label} ({canonical})
    Strict definition: {purpose}
    Key deliverables: {keyDeliverables[0-3]}
    Signals: {signals[0-3]}
    Keywords: {keywords[0-3]}
    Boundary: {boundaryHint}"

EVIDENCE RULES:
"Only create sections and items when the inputs provide supporting evidence (deliverables, obligations, timelines, resources, or client requirements). Interpret synonyms or implied actions as valid evidence so long as the text reflects a billable activity and references timing/ownership."

"After confirming each evidenced scope, categorise it into the matching sections from this brief profile: {briefSectionOrder}"
Example: "Discovery & Strategic Alignment, Concept & Creative Development, Production & Live Execution"

"Return only the FLAT array JSON described above; omit any extra narrative or schema explanation."

PRIMARY CONSTRAINTS:
"- Anti-Blob constraint: keep `description` and `notes` concise (≤15 words), split deliverables that contain 'and' into separate items, and emit one item per distinct deliverable.
 - Phase coverage rule: ensure each detected canonical phase (especially Measurement, Distribution, and Deliverable Management) has an explicit section and at least one supporting item."

EVIDENCE RULES:
"- Capture counts, deliverables, usage, budget hints, warnings, questions, and approvals implied by the brief and attachments on either the section or item level.
 - Cite supporting evidence in `deliverables`, `resources`, `notes`, or `signals` so each line is traceable.
 - Operationalize constraints: If the brief mentions specific vendors, travel requirements, or mandated tools, create explicit resource lines for them (e.g. 'Travel Allowance', 'Vendor: X') or add them to `assumptions`, do not hide them in `notes`.
 - Do not invent numbers; leave numeric estimates null or empty and surface the gap with warnings or questions.
 - Keep arrays to at most 12 entries and trim strings to 120 characters.
 - Treat synonyms or related phrases as valid evidence for each canonical—e.g., activation/storyboard language for Production / Capture, coverage metrics for Measurement, asset ops or versioning for Deliverable Management, and planning language for Strategy."

STRUCTURE RULES:
"- Return a FLAT array in `scopeEntries` field (NOT nested sections with items arrays).
 - Each entry is standalone: sections have `isSection: true`, line items have `isSection: false`.
 - Ordering rule: List section entry first, then all its line items, then next section entry, then its line items, etc.
 - Each entry requires exactly 8 fields: `label` (string, max 120 chars), `canonical` (phase ID from approved list), `isSection` (boolean), `deliverables` (array, max 10 items), `notes` (array, max 8 items), `signals` (array, max 6 items), `resources` (string or array), `sourceExcerpt` (string, max 120 chars quoting brief).
 - Keep descriptions focused on the work being done and avoid bundling unrelated deliverables into the same item."

EXAMPLE STRUCTURE BLUEPRINT:
{
  "projectName": "Atlas 6m campaign",
  "briefType": "campaign",
  "scopeEntries": [
    {
      "label": "Concept & Creative Development",
      "canonical": "concept-creative-development",
      "isSection": true,
      "deliverables": ["Hero film concept", "Messaging pillars"],
      "notes": ["Translate brand KPIs into story cues"],
      "signals": ["strategy", "creative"],
      "resources": "Creative Director, Strategy Director",
      "sourceExcerpt": "Brief mentions hero film concept with messaging framework"
    },
    {
      "label": "Hero film story and messaging",
      "canonical": "concept-creative-development",
      "isSection": false,
      "deliverables": ["Concept deck", "Execution brief"],
      "notes": ["Includes client workshop and validation"],
      "signals": ["storytelling", "messaging"],
      "resources": "Editor, Creative Producer",
      "sourceExcerpt": "Define hero film story with usage guardrails"
    }
  ],
  "warnings": ["Usage rights duration pending confirmation"],
  "assumptions": ["Client owns theme music rights"]
}

"Respond only with the structured JSON that follows the blueprint provided above."
```

### 1.2 Scope Extraction - User Prompt

**Built at:** `05_AISidebar_UI.js:2334-2356`

**Components:**

```
### Brief
{briefText or "(no manual brief provided)"}

### Signature Cues (if any)
- {signatureCue1}
- {signatureCue2}
...

### Attached PDF Summaries
- {fileName1} ({length} chars)
  {textSnippet (truncated to 800 chars)}
- {fileName2} ({length} chars)
  {textSnippet}
...
OR: "(no PDFs attached)"

### Human Answers
Q: {question1}
A: {answer1}

Q: {question2}
A: {answer2}
...
OR: "(none)"

### Client Signals
{scopeClientSignalsText from formatClientContextForPrompt()}
OR: "(none)"

### Mandatory Phase Evidence (if detected)
Pre-scan detected execution signals for these phases; create each named section before emitting detail rows and do not dump execution items into Strategy/Planning.

- {phaseLabel} ({canonical}): Evidence: {snippet1} | {snippet2} You MUST create a {phaseLabel} section (detail rows must live there).
...
```

### 1.3 Scope Extraction - JSON Schema

**Schema Name:** `SCOPE_DRAFT_LLM_SCHEMA`
**Defined at:** `05_AISidebar_Config.js:973-1010`

**Sent to LLM at:** `05_AISidebar_UI.js:5588-5616`

```json
{
  "name": "ScopeDraftLLM",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["projectName", "briefType", "scopeEntries", "warnings", "assumptions"],
    "properties": {
      "projectName": { "type": "string" },
      "briefType": { "type": "string" },
      "scopeEntries": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["label", "canonical", "isSection", "deliverables", "notes", "signals", "resources", "sourceExcerpt"],
          "properties": {
            "label": { "type": "string" },
            "canonical": { "type": "string" },
            "isSection": { "type": "boolean" },
            "deliverables": { "type": "array", "items": { "type": "string" } },
            "notes": { "type": "array", "items": { "type": "string" } },
            "signals": { "type": "array", "items": { "type": "string" } },
            "resources": {
              "anyOf": [
                { "type": "string" },
                { "type": "array", "items": { "type": "string" } }
              ]
            },
            "sourceExcerpt": { "type": "string" }
          }
        }
      },
      "warnings": { "type": "array", "items": { "type": "string" } },
      "assumptions": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

**LLM Configuration:**
- Temperature: 0
- Max Tokens: LLM_SCOPE_RESPONSE_TOKENS_DEFAULT (2600) or context.maxTokens
- Model: From LLM_SCOPE_MODEL script property
- Response Format: json_schema (strict mode)

---

## 2. COMMERCIAL FIT / CATALOG MAPPING

**Entry Point:** `05_AISidebar_Processing.js:1450+` (processCommercialFit function)

**Flow:**
1. Takes approved scope entries
2. Performs vector search for each entry
3. Sends entries + vector candidates to LLM for SKU selection
4. LLM returns chosen SKU + justification

### 2.1 Commercial Fit - System Prompt

**Built at:** `05_AISidebar_Processing.js:1520+`

**Components:**

```
PERSONA:
"You are hrmny's catalog analyst. Review each scope entry and select the best matching SKU from the vector search candidates provided."

INSTRUCTIONS:
"For each scopeEntryId:
- Review the entry's label, deliverables, notes, signals, and sourceExcerpt
- Review the vector candidates (SKU, name, description, score)
- Select the primarySku that best matches the scope entry
- Provide alternates (up to 5) in descending confidence order
- Add notes explaining the selection
- Add warnings if match is poor or ambiguous
- Provide score (0-100) and confidence (0-1)
- Provide justification and rationale

Constraints:
- Never invent SKUs - only select from provided candidates
- If no good match exists, set chosenSku to null and add warning
- Prefer higher vector scores but also consider semantic fit
- If entry is a section header (isSection: true), you may leave SKU null
- Keep notes concise (max 5 items, 120 chars each)
- Keep warnings actionable (max 5 items, 120 chars each)
- Score: 0-100 where 100 is perfect match
- Confidence: 0-1 where 1 is absolutely certain"

CATALOG CONTEXT:
"Available catalog SKUs and their vector scores for each entry are provided in the user prompt."
```

### 2.2 Commercial Fit - User Prompt

**Built at:** `05_AISidebar_Processing.js:1520+`

**Components:**

```
### Scope Entries to Map

Entry ID: {scopeEntryId}
Label: {label}
Canonical: {canonical}
Is Section: {isSection}
Deliverables: {deliverables.join(', ')}
Notes: {notes.join(', ')}
Signals: {signals.join(', ')}
Source Excerpt: {sourceExcerpt}

Vector Candidates:
1. SKU: {sku} | Score: {vectorScore} | Name: {name} | Description: {description} | Price: {sellPrice}
2. SKU: {sku} | Score: {vectorScore} | Name: {name} | Description: {description} | Price: {sellPrice}
...

---

Entry ID: {scopeEntryId2}
...

### Instructions
Select the best SKU for each entry. Return structured JSON with your selections.
```

### 2.3 Commercial Fit - JSON Schema

**Schema Name:** `CATALOG_MAPPER_RESPONSE_SCHEMA`
**Defined at:** `05_AISidebar_Config.js:113-186`

```json
{
  "name": "catalog_mapper_payload",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "responseType": {
        "type": "string",
        "enum": ["commercialFit", "catalogMatches"]
      },
      "entries": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "scopeEntryId": { "type": ["string", "null"] },
            "sku": { "type": ["string", "null"] },
            "primarySku": { "type": ["string", "null"] },
            "chosenSku": { "type": ["string", "null"] },
            "alternates": {
              "type": "array",
              "items": { "type": ["string", "null"] },
              "maxItems": 5
            },
            "notes": {
              "type": "array",
              "items": { "type": ["string", "null"] },
              "maxItems": 5
            },
            "warnings": {
              "type": "array",
              "items": { "type": ["string", "null"] },
              "maxItems": 5
            },
            "score": { "type": ["number", "string", "null"] },
            "confidence": { "type": ["number", "string", "null"] },
            "justification": { "type": ["string", "null"] },
            "rationale": { "type": ["string", "null"] }
          },
          "required": [
            "scopeEntryId", "sku", "primarySku", "chosenSku",
            "alternates", "notes", "warnings",
            "score", "confidence", "justification", "rationale"
          ],
          "additionalProperties": false
        }
      },
      "matches": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "sku": { "type": "string" },
            "confidence": { "type": "number" },
            "rationale": { "type": "string" }
          },
          "required": ["sku", "confidence", "rationale"],
          "additionalProperties": false
        },
        "maxItems": 12
      }
    },
    "required": ["responseType", "entries", "matches"],
    "additionalProperties": false
  }
}
```

**LLM Configuration:**
- Temperature: 0
- Max Tokens: 3200
- Model: From LLM_CATALOG_MODEL script property
- Response Format: json_schema (strict mode)

---

## 3. COMMERCIAL PLAN / QUOTE GENERATION

**Entry Point:** `05_AISidebar_UI.js:4829+` (runQuotePlan function)

**Flow:**
1. Takes approved scope + commercial fit results
2. Sends to LLM to generate quote structure
3. LLM returns sections with line items, SKUs, quantities, rates

### 3.1 Commercial Plan - System Prompt

**Built at:** `05_AISidebar_UI.js:2528-2556`

**Persona Options:**
- `proposal-author`: "You are hrmny's proposal author persona. Translate the approved scope into a commercially resilient quote plan that stays within contract, preserves margin, and reads professionally."
- `managing-director`: "You are hrmny's commercial controller. Convert each approved scope entry into a client-ready structure that protects margin, surfaces risks, and rejects the plan if contractual coverage is missing."
- `analyst`: "You are hrmny's scope analyst persona. Focus on translating the approved scope map into auditable quote instructions."

**Components:**

```
PERSONA:
{personaPrompts[personaRole]}

BRIEF TYPE NUDGE:
"Brief Type: {briefProfile.label}. {briefProfile.nudge}"

CATALOG RULE:
"Always query the hrmny catalog vector store retrieval before selecting SKUs; never guess or fabricate catalog codes."

COMMERCIAL FIT RULE:
"Respect the approved commercial-fit matches: produce exactly one line item per scope entry using its locked SKU, section, quantity, unit, and visibility. If no SKU is locked, leave it null and add a warning—never invent or drop scope."

INPUT STRUCTURE:
"You will receive structured JSON inputs: `contractEntries` (approved scope summary), `commercialConstraints`, `catalogHints`, `clientSignals`, and global defaults."

SCOPE INTEGRITY:
"Never invent scope or SKUs; set qty/unitRate to null and add a warning when data is missing."

OUTPUT STRUCTURE:
"Create a commercial plan that maps each approved scope entry to sections and items without inventing new scope."

SECTION GROUPING:
"Group sections by canonical (workflow phase). Each section MUST relate to a single canonical; do not merge unrelated phases."

ENTRY MAPPING:
"For every entry in `contractEntries`, produce one or more items in the matching section. Always set `items[].scopeEntryId` to the source entry id."

QUANTITY & RATE LOGIC:
"Use quantities, hours, and rates from the approved entry resources. Compute `clientAmount = qty × unitRate`. If you cannot determine rate or quantity, leave the numeric field null and add a warning."

SIGNAL USAGE:
"Consult `contractEntries[].quantitySignals`, `scenarioHighlights`, and `usageSummary` to align each line item to real scope counts (models, usage months, studio days, etc.)."

COST HANDLING:
"If a resource is flagged internal, treat its rate as internal cost; otherwise assume internalCost is null unless data is provided."

MARGIN TRACKING:
"Reference the target margin in `commercialConstraints.targetMarginPct` and summarise variance in `marginSummary` for each section."

APPROVAL WARNINGS:
"If `commercialConstraints.approvalsPending` contains an entry id, add a section warning and include it in top-level warnings."

CATALOG MAPPING:
"Use the hrmny catalog retrieval tools to map each scope entry to a catalog SKU. Prefer retrieval results and cross-check against `catalogHints`; if nothing relevant is returned, leave `sku` null and add a warning."

LOCKED SKU RULE:
"Respect the `Locked SKUs` guidance for each scope entry. Do not replace or remove these SKU selections."

JUSTIFICATION:
"Populate `justification` with a single sentence citing the scope entry id and key deliverables or resources."

REJECTION LOGIC:
"If contractual coverage is missing or risks require escalation, return {\"status\": \"rejected\", \"reasons\": []} instead of sections."

LIMITS:
"Limit arrays to 10 entries and keep strings ≤120 characters. Escape newlines as \\n and double quotes as \\\"."

FORMAT:
"Return strict JSON matching the provided blueprint—no Markdown, comments, or narrative."

PHASE GUIDANCE (if available):
{phaseGuidanceText}

MD PERSONA ADDITION (if managing-director):
"You are accountable for commercial integrity. Reject the plan if mandatory approvals are missing or target margin cannot be met."
```

### 3.2 Commercial Plan - User Prompt

**Built at:** `05_AISidebar_UI.js:2559-2601`

**Components:**

```
### Defaults
Currency: {currency}
TaxType: {taxType}
Expected Sections: {expectedSections.join(', ')}
Optional Sections: {optionalSections.join(', ')}

### Approved Entries (contract summary)
[JSON array of all scope entries with full 22-field structure]
{contractEntriesText - truncated to 4500 chars}

### Scope Quantity Signals (* marks primary)
{entryId1}: {value} {unit} ({label}); {value2} {unit2} ({label2})
{entryId2}: {value} {unit} ({label})
...
OR: "(no quantity signals detected)"

### Scenario Highlights
{entryId1}: {highlight1}; {highlight2}; {highlight3}
{entryId2}: {highlight1}
...
OR: "(no scenario highlights detected)"

### Commercial Fit Snapshot
{buildCommercialFitSummary() output}

### Locked SKUs
Entry ID: {scopeEntryId} | Locked SKU: {chosenSku} | Section: {detectedSection} | Qty: {qty} {unit} | Visibility: {visibility}
Entry ID: {scopeEntryId2} | Locked SKU: {chosenSku2} | ...
...

### Commercial Constraints
{JSON.stringify(commercialConstraints) - truncated to 2000 chars}

### Catalog Hints
{sku1}: {name} (AED {sellPrice}) - {description (120 chars)}
{sku2}: {name} (AED {sellPrice}) - {description}
...
OR: "(catalog hints unavailable)"

### Client Signals
{clientSignalsText from formatClientContextForPrompt()}
OR: "(no client signals provided)"

### Signal Layers
Derived Scope Signals:
- {canonical} (score {score}): {evidence}
- {canonical2} (score {score}): {evidence}
...
OR: "- None detected."

Automated Client Signals:
Industries: {industries with evidence}
Regions: {regions with evidence}
Expectations: {expectations with evidence}
Risk Flags: {riskFlags with evidence}
OR: "- None detected."

Reviewer Overrides:
{JSON.stringify(overridesContext) - truncated to 800 chars}
OR: "(no manual overrides)"

### Output Blueprint (strict schema)
{
  "status": "ok",
  "projectName": "",
  "clientName": "",
  "currency": "",
  "taxType": "",
  "sections": [
    {
      "sectionName": "",
      "scopeEntryId": "",
      "canonical": "",
      "justification": "",
      "items": [
        {
          "scopeEntryId": "",
          "description": "",
          "qty": 0,
          "unit": "",
          "unitRate": 0,
          "clientAmount": 0,
          "internalCost": null,
          "sku": null,
          "visibility": "Client",
          "warnings": []
        }
      ],
      "sectionWarnings": [],
      "marginSummary": ""
    }
  ],
  "fees": [],
  "warnings": [],
  "assumptions": []
}

### Brief
{briefText or "(no manual brief provided)"}
```

### 3.3 Commercial Plan - JSON Schema

**Schema:** NOT strictly enforced via json_schema mode
**Format:** `{ type: 'json_object' }` (less strict)

**Expected Structure** (from blueprint above):
- status: "ok" | "rejected"
- projectName, clientName, currency, taxType: strings
- sections: array of section objects
- fees: array
- warnings: array of strings
- assumptions: array of strings

**LLM Configuration:**
- Temperature: 0
- Max Tokens: LLM_QUOTE_RESPONSE_TOKENS_DEFAULT (2600) or context.maxTokens
- Model: From LLM_QUOTE_MODEL script property
- Response Format: json_object (NOT strict schema)

---

## 4. SECTION SUMMARY GENERATION

**Entry Point:** Various (used for section summarization)

### 4.1 Section Summary - JSON Schema

**Schema Name:** `SECTION_SUMMARY_RESPONSE_SCHEMA`
**Defined at:** `05_AISidebar_Config.js:195-218`

```json
{
  "name": "section_summary_payload",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "summaries": {
        "type": "array",
        "maxItems": 20,
        "items": {
          "type": "object",
          "properties": {
            "sectionKey": { "type": "string" },
            "summary": { "type": "string", "maxLength": 600 }
          },
          "required": ["sectionKey", "summary"],
          "additionalProperties": false
        }
      }
    },
    "required": ["summaries"],
    "additionalProperties": false
  }
}
```

---

## KEY HELPER FUNCTIONS

### formatClientContextForPrompt()
**Purpose:** Converts client context into prompt text

**Output Format:**
```
Industry: {industry} (confidence: {confidence})
  Evidence: {evidence}

Region: {region} (confidence: {confidence})
  Evidence: {evidence}

Expectations:
- {expectation}: {evidence}

Risk Flags:
- {risk}: {evidence}

Constraints:
- {constraint}: {evidence}
```

### buildMandatoryEvidenceSection()
**Purpose:** Pre-scans brief for phase evidence and mandates those sections

**Output Format:**
```
### Mandatory Phase Evidence
Pre-scan detected execution signals for these phases; create each named section before emitting detail rows and do not dump execution items into Strategy/Planning.

- {phaseLabel} ({canonical}): Evidence: {snippet1} | {snippet2} You MUST create a {phaseLabel} section (detail rows must live there).
```

### buildPhaseGuidanceForPrompt()
**Purpose:** Provides phase-specific deliverable and signal hints

**Output Format:**
```
Phase: {label} | Deliverables: {deliverableHint} | Signals: {signalHint}
Phase: {label2} | Deliverables: {deliverableHint2} | Signals: {signalHint2}
...
```

### buildPhaseDefinitionsBlock()
**Purpose:** Provides strict phase definitions with boundaries

**Output Format:**
```
### Phase Definitions
- Phase: {label} ({canonical})
  Strict definition: {purpose}
  Key deliverables: {keyDeliverable1}; {keyDeliverable2}; {keyDeliverable3}
  Signals: {signal1}; {signal2}; {signal3}
  Keywords: {keyword1}; {keyword2}; {keyword3}
  Boundary: {boundaryHint}
```

---

## CRITICAL ISSUE IDENTIFIED

### getScopePhaseCanonicals() - The Function That Broke Everything

**Location:** `05_AISidebar_Phase.js:27-56`
**Called by:** `buildScopeDraftPrompt()` at line 2250

**What It's SUPPOSED to Return:**
```javascript
["strategy-account", "planning-architecture", "asset-development", "production-capture", "post-production-asset", "distribution-activation", "measurement-optimization"]
```

**What It WAS Returning (BUG):**
```javascript
[]  // Empty array
```

**Why:**
```javascript
// Line 31-32 (BEFORE FIX):
const configMap = ConfigurationManager.get('scope.phases');  // Returns ARRAY!
const config = configMap[type] || null;  // array['smm-retainer'] = undefined
// Returns empty array because config is null
```

**Impact on LLM Prompt:**
```
BEFORE (broken):
"This brief type has no configured canonical phase IDs; describe each section clearly."
-> LLM makes up its own canonicals: "strategy", "creative", "production", "post-production"
-> UI can't match LLM's canonicals to configured phases
-> Entries show as freeform text instead of structured draggable items

AFTER (fixed):
"If possible, set the `canonical` field on each section to one of these phase IDs: strategy-account, planning-architecture, asset-development, production-capture, post-production-asset, distribution-activation, measurement-optimization."
-> LLM uses configured canonicals
-> UI successfully matches entries to phases
-> Entries show as structured draggable deliverables
```

---

## SUMMARY

**3 Main LLM Calls:**

1. **Scope Extraction** - Extracts structured scope from brief + attachments
   - Schema: SCOPE_DRAFT_LLM_SCHEMA (8 fields, strict)
   - Returns: projectName, briefType, scopeEntries[], warnings[], assumptions[]

2. **Commercial Fit** - Maps scope entries to catalog SKUs
   - Schema: CATALOG_MAPPER_RESPONSE_SCHEMA (strict)
   - Returns: entries[] with chosenSku, alternates[], notes[], warnings[], score, confidence

3. **Commercial Plan** - Generates quote with sections, items, pricing
   - Schema: json_object (not strict)
   - Returns: sections[] with items[], fees[], warnings[], assumptions[]

**Critical Functions That Build Prompts:**
- buildScopeDraftPrompt() - Scope extraction
- buildPlanPrompt() - Quote generation
- getScopePhaseCanonicals() - **WAS BROKEN** - Returns canonical phase IDs for LLM
- buildPhaseGuidanceForPrompt() - **WAS BROKEN** - Returns phase hints
- getPhaseLabelMap() - **WAS BROKEN** - Maps canonicals to labels
- getPhaseConfigLookup() - **WAS BROKEN** - Returns full phase configs

All 4 broken functions had the same bug: accessing array as map.

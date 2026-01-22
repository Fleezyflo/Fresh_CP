# EXACT PROMPTS SENT TO LLM
## Real prompts with actual values filled in

---

## 1. SCOPE EXTRACTION - EXACT PROMPT

### SYSTEM PROMPT (sent to LLM)

```
You are hrmny's scope analyst persona. Review the brief and attachments to determine the actual scopes of work the agency must cover.

Brief Type: SMM Retainer. Focus on monthly retainer deliverables, content planning, community management, and performance reporting for social media accounts.

This extraction follows the SMM Retainer taxonomy; emphasise its deliverables and signals.

If possible, set the `canonical` field on each section to one of these phase IDs: strategy-account, planning-architecture, asset-development, production-capture, post-production-asset, distribution-activation, measurement-optimization.

Phase guidance for this brief:
Phase: Strategy & Account Management | Deliverables: Account strategy, stakeholder alignment | Signals: strategy, account planning, client onboarding
Phase: Planning & Architecture | Deliverables: Content calendar, campaign architecture | Signals: planning, content strategy, editorial calendar
Phase: Asset Development | Deliverables: Creative concepts, content creation | Signals: creative, design, copywriting, asset production
Phase: Production & Capture | Deliverables: Photography, videography, content capture | Signals: shoot, production, filming, photography
Phase: Post-Production & Asset Management | Deliverables: Editing, versioning, asset library | Signals: editing, post-production, asset management
Phase: Distribution & Activation | Deliverables: Publishing, community management, engagement | Signals: publishing, posting, community, engagement
Phase: Measurement & Optimization | Deliverables: Analytics, reporting, optimization | Signals: analytics, reporting, insights, performance

### Phase Definitions
- Phase: Strategy & Account Management (strategy-account)
  Strict definition: Strategic planning and account oversight ensuring brand alignment and stakeholder management.
  Key deliverables: Brand strategy; Account planning; Stakeholder workshops
  Signals: strategy; account; planning
  Keywords: strategy; roadmap; brand
  Boundary: Strategy is for planning, not doing; keep execution verbs like shoot, edit, or post inside production, post-production, and distribution phases.
- Phase: Planning & Architecture (planning-architecture)
  Strict definition: Content planning and campaign architecture defining what will be created and when.
  Key deliverables: Content calendar; Editorial planning; Campaign framework
  Signals: planning; calendar; architecture
  Keywords: planning; calendar; editorial
  Boundary: Keep execution-focused work here and avoid letting planning or measurement language bleed back into the Strategy/Planning sections.
- Phase: Asset Development (asset-development)
  Strict definition: Creative development and content creation including design, copywriting, and concept work.
  Key deliverables: Creative concepts; Graphic design; Copywriting
  Signals: creative; design; copy
  Keywords: creative; design; concept
  Boundary: Focus on editing, packaging, and asset governance rather than capture or strategy work.
- Phase: Production & Capture (production-capture)
  Strict definition: Content capture activities including photography, videography, and shoot execution.
  Key deliverables: Photography; Videography; On-set production
  Signals: shoot; filming; production
  Keywords: shoot; capture; camera
  Boundary: Keep execution-focused work here and avoid letting planning or measurement language bleed back into the Strategy/Planning sections.
- Phase: Post-Production & Asset Management (post-production-asset)
  Strict definition: Post-production editing, versioning, and asset management operations.
  Key deliverables: Video editing; Color grading; Asset versioning
  Signals: editing; post; versioning
  Keywords: post; edit; grade
  Boundary: Focus on editing, packaging, and asset governance rather than capture or strategy work.
- Phase: Distribution & Activation (distribution-activation)
  Strict definition: Content publishing, community management, and audience engagement operations.
  Key deliverables: Social publishing; Community management; Influencer activation
  Signals: publishing; posting; community
  Keywords: post; publish; launch
  Boundary: This phase handles pushing content live and amplifying it; do not treat it as a creation or strategy phase.
- Phase: Measurement & Optimization (measurement-optimization)
  Strict definition: Performance measurement, analytics reporting, and data-driven optimization.
  Key deliverables: Analytics dashboards; Performance reports; A/B testing
  Signals: analytics; reporting; insights
  Keywords: report; measure; metric
  Boundary: Reserve this phase for performance tracking, analysis, and lessons learned—not creation or strategic direction.

Only create sections and items when the inputs provide supporting evidence (deliverables, obligations, timelines, resources, or client requirements). Interpret synonyms or implied actions as valid evidence so long as the text reflects a billable activity and references timing/ownership.

After confirming each evidenced scope, categorise it into the matching sections from this brief profile: Strategy & Account Management, Planning & Architecture, Asset Development, Production & Capture, Post-Production & Asset Management, Distribution & Activation, Measurement & Optimization. When possible, set the `canonical` to one of the configured phase IDs.

Return only the FLAT array JSON described above; omit any extra narrative or schema explanation.

Primary constraints:
- Anti-Blob constraint: keep `description` and `notes` concise (≤15 words), split deliverables that contain "and" into separate items, and emit one item per distinct deliverable.
- Phase coverage rule: ensure each detected canonical phase (especially Measurement, Distribution, and Deliverable Management) has an explicit section and at least one supporting item.

Evidence rules:
- Capture counts, deliverables, usage, budget hints, warnings, questions, and approvals implied by the brief and attachments on either the section or item level.
- Cite supporting evidence in `deliverables`, `resources`, `notes`, or `signals` so each line is traceable.
- Operationalize constraints: If the brief mentions specific vendors, travel requirements, or mandated tools, create explicit resource lines for them (e.g. "Travel Allowance", "Vendor: X") or add them to `assumptions`, do not hide them in `notes`.
- Do not invent numbers; leave numeric estimates null or empty and surface the gap with warnings or questions.
- Keep arrays to at most 12 entries and trim strings to 120 characters.
- Treat synonyms or related phrases as valid evidence for each canonical—e.g., activation/storyboard language for Production / Capture, coverage metrics for Measurement, asset ops or versioning for Deliverable Management, and planning language for Strategy.

Structure rules:
- Return a FLAT array in `scopeEntries` field (NOT nested sections with items arrays).
- Each entry is standalone: sections have `isSection: true`, line items have `isSection: false`.
- Ordering rule: List section entry first, then all its line items, then next section entry, then its line items, etc.
- Each entry requires exactly 8 fields: `label` (string, max 120 chars), `canonical` (phase ID from approved list), `isSection` (boolean), `deliverables` (array, max 10 items), `notes` (array, max 8 items), `signals` (array, max 6 items), `resources` (string or array), `sourceExcerpt` (string, max 120 chars quoting brief).
- Keep descriptions focused on the work being done and avoid bundling unrelated deliverables into the same item.

Respond only with the structured JSON that follows the blueprint provided above.

Example structure (FLAT array with 8 fields per entry):
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
```

### USER PROMPT (sent to LLM)

```
### Brief
We need a 6-month social media retainer for our luxury hotel brand in Dubai.

Requirements:
- Monthly content creation: 20 posts per month
- 5 reels per month
- Community management (daily monitoring and engagement)
- Monthly analytics reporting
- Content calendar planning
- Budget: AED 25,000/month

Brand: Five-star luxury hospitality
Channels: Instagram, Facebook, LinkedIn
Target audience: High-net-worth travelers and corporate clients

### Signature Cues
- Monthly retainer structure
- Social media content
- Hospitality industry
- Luxury positioning
- Dubai/UAE market

### Attached PDF Summaries
(no PDFs attached)

### Human Answers
(none)

### Client Signals
Industry: Hospitality & Tourism (confidence: 0.9)
  Evidence: hotel, luxury hospitality, Dubai

Region: UAE (confidence: 0.95)
  Evidence: Dubai

Expectations:
(none detected)

Risk Flags:
(none detected)

Constraints:
(none detected)

### Mandatory Phase Evidence
Pre-scan detected execution signals for these phases; create each named section before emitting detail rows and do not dump execution items into Strategy/Planning.

- Asset Development (asset-development): Evidence: ... Monthly content creation: 20 posts per month ... You MUST create a Asset Development section (detail rows must live there).
- Distribution & Activation (distribution-activation): Evidence: ... Community management (daily monitoring and engagement) ... You MUST create a Distribution & Activation section (detail rows must live there).
- Measurement & Optimization (measurement-optimization): Evidence: ... Monthly analytics reporting ... You MUST create a Measurement & Optimization section (detail rows must live there).
```

---

## 2. WHAT THE LLM MUST RETURN (Schema Validation)

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

### EXPECTED LLM RESPONSE

```json
{
  "projectName": "Luxury Hotel Social Media Retainer",
  "briefType": "smm-retainer",
  "scopeEntries": [
    {
      "label": "Strategy & Account Management",
      "canonical": "strategy-account",
      "isSection": true,
      "deliverables": ["Account strategy", "Brand alignment"],
      "notes": ["Monthly strategic review"],
      "signals": ["strategy", "account"],
      "resources": "Account Director",
      "sourceExcerpt": "luxury hotel brand in Dubai"
    },
    {
      "label": "Planning & Architecture",
      "canonical": "planning-architecture",
      "isSection": true,
      "deliverables": ["Content calendar", "Editorial planning"],
      "notes": ["Monthly planning cycle"],
      "signals": ["planning", "calendar"],
      "resources": "Content Strategist",
      "sourceExcerpt": "Content calendar planning"
    },
    {
      "label": "Monthly content calendar and editorial planning",
      "canonical": "planning-architecture",
      "isSection": false,
      "deliverables": ["Monthly content calendar", "Post scheduling"],
      "notes": ["Covers all channels"],
      "signals": ["planning", "editorial"],
      "resources": "Social Media Manager",
      "sourceExcerpt": "Content calendar planning"
    },
    {
      "label": "Asset Development",
      "canonical": "asset-development",
      "isSection": true,
      "deliverables": ["Social posts", "Reels", "Graphics"],
      "notes": ["20 posts + 5 reels monthly"],
      "signals": ["creative", "content"],
      "resources": "Creative team",
      "sourceExcerpt": "Monthly content creation: 20 posts per month, 5 reels per month"
    },
    {
      "label": "Monthly social media posts (20 per month)",
      "canonical": "asset-development",
      "isSection": false,
      "deliverables": ["Instagram posts", "Facebook posts", "LinkedIn posts"],
      "notes": ["20 posts total across channels"],
      "signals": ["creative", "design"],
      "resources": ["Copywriter", "Graphic Designer"],
      "sourceExcerpt": "20 posts per month"
    },
    {
      "label": "Monthly reels (5 per month)",
      "canonical": "asset-development",
      "isSection": false,
      "deliverables": ["Instagram reels", "Short-form video"],
      "notes": ["5 reels monthly"],
      "signals": ["video", "creative"],
      "resources": ["Video Editor", "Motion Designer"],
      "sourceExcerpt": "5 reels per month"
    },
    {
      "label": "Distribution & Activation",
      "canonical": "distribution-activation",
      "isSection": true,
      "deliverables": ["Publishing", "Community management", "Engagement"],
      "notes": ["Daily monitoring and response"],
      "signals": ["publishing", "community"],
      "resources": "Community Manager",
      "sourceExcerpt": "Community management (daily monitoring and engagement)"
    },
    {
      "label": "Daily community management and engagement",
      "canonical": "distribution-activation",
      "isSection": false,
      "deliverables": ["Comment monitoring", "DM responses", "Engagement"],
      "notes": ["Daily monitoring across all channels"],
      "signals": ["community", "engagement"],
      "resources": "Community Manager",
      "sourceExcerpt": "daily monitoring and engagement"
    },
    {
      "label": "Measurement & Optimization",
      "canonical": "measurement-optimization",
      "isSection": true,
      "deliverables": ["Analytics", "Reporting", "Insights"],
      "notes": ["Monthly performance review"],
      "signals": ["analytics", "reporting"],
      "resources": "Analytics Specialist",
      "sourceExcerpt": "Monthly analytics reporting"
    },
    {
      "label": "Monthly analytics and performance reporting",
      "canonical": "measurement-optimization",
      "isSection": false,
      "deliverables": ["Performance dashboard", "Monthly report", "Recommendations"],
      "notes": ["Covers all channels and KPIs"],
      "signals": ["analytics", "insights"],
      "resources": "Data Analyst",
      "sourceExcerpt": "Monthly analytics reporting"
    }
  ],
  "warnings": [
    "Specific content approval process not defined",
    "Response time SLAs for community management not specified"
  ],
  "assumptions": [
    "Client provides brand assets and guidelines",
    "Client handles influencer contracts if needed",
    "Photography/videography sourced from client archive or stock"
  ]
}
```

---

## 3. WHAT HAPPENS NEXT (Server-Side Processing)

After LLM returns the above JSON:

1. **Parse JSON** - Extract the response
2. **Normalize to 22 fields** - `normalizeScopeDraftToFinalStructure()` adds:
   - `id` - Unique IDs for each entry
   - `sectionId` - Link to parent section
   - `parentId` / `childIds` - Hierarchy
   - `visibility`, `approvalStatus`, `interpretation`, `contingency`
   - `metadata` - Bundle tracking
   - `quantitySignals`, `scenarioHighlights`, `usageSummary`
   - `catalogRefs`, `resourcePackages`

3. **UI Rendering Decision**:
   ```javascript
   // ui/ai_quote_sidebar.html:7079-7081
   const structuredEntries = entriesForPhase.filter(entry => entry && entry.id);
   const hasStructuredDetails = structuredEntries.length > 0;
   const showPhaseInputs = !hasStructuredDetails;  // If NO ids, show freeform
   ```

   **IF entries have IDs AND canonical matches:**
   → Render as structured draggable deliverables

   **IF entries lack IDs OR canonical doesn't match:**
   → Render as freeform textareas

---

## 4. THE BUG THAT BROKE EVERYTHING

### BEFORE FIX (What LLM Received)

```
System Prompt line 4:
"This brief type has no configured canonical phase IDs; describe each section clearly."

(NO phase IDs, NO phase guidance, NO phase definitions)
```

**Why:**
```javascript
// 05_AISidebar_Phase.js:31-32
const configMap = ConfigurationManager.get('scope.phases');  // Returns ARRAY!
const config = configMap[type] || null;  // array['smm-retainer'] = undefined
return [];  // Empty array returned
```

**LLM Response Without Guidance:**
```json
{
  "scopeEntries": [
    {
      "label": "Strategy",
      "canonical": "strategy",  // ← Made up canonical!
      "isSection": true,
      ...
    },
    {
      "label": "Content Creation",
      "canonical": "content",  // ← Made up canonical!
      "isSection": true,
      ...
    }
  ]
}
```

**UI Matching Attempt:**
```javascript
// Configured canonicals from sheet:
["strategy-account", "planning-architecture", "asset-development", ...]

// LLM returned canonicals:
["strategy", "content", "posting", "reporting"]

// Match result:
NO MATCH → entries.filter() returns empty → showPhaseInputs = true → FREEFORM TEXT
```

### AFTER FIX (What LLM Receives Now)

```
System Prompt line 4:
"If possible, set the `canonical` field on each section to one of these phase IDs: strategy-account, planning-architecture, asset-development, production-capture, post-production-asset, distribution-activation, measurement-optimization."

Phase guidance for this brief:
Phase: Strategy & Account Management | Deliverables: Account strategy, stakeholder alignment | Signals: strategy, account planning, client onboarding
Phase: Planning & Architecture | Deliverables: Content calendar, campaign architecture | Signals: planning, content strategy, editorial calendar
...
```

**LLM Response With Guidance:**
```json
{
  "scopeEntries": [
    {
      "label": "Strategy & Account Management",
      "canonical": "strategy-account",  // ← Matches configured canonical!
      "isSection": true,
      ...
    }
  ]
}
```

**UI Matching Result:**
```
LLM canonical: "strategy-account"
Configured canonicals: ["strategy-account", ...]
MATCH FOUND → entries have IDs → hasStructuredDetails = true → STRUCTURED DRAGGABLE ITEMS
```

---

## 5. COMMERCIAL PLAN PROMPT (Quote Generation)

### SYSTEM PROMPT

```
You are hrmny's proposal author persona. Translate the approved scope into a commercially resilient quote plan that stays within contract, preserves margin, and reads professionally.

Brief Type: SMM Retainer. Focus on monthly retainer deliverables, content planning, community management, and performance reporting for social media accounts.

Always query the hrmny catalog vector store retrieval before selecting SKUs; never guess or fabricate catalog codes.

Respect the approved commercial-fit matches: produce exactly one line item per scope entry using its locked SKU, section, quantity, unit, and visibility. If no SKU is locked, leave it null and add a warning—never invent or drop scope.

You will receive structured JSON inputs: `contractEntries` (approved scope summary), `commercialConstraints`, `catalogHints`, `clientSignals`, and global defaults.

Never invent scope or SKUs; set qty/unitRate to null and add a warning when data is missing.

Create a commercial plan that maps each approved scope entry to sections and items without inventing new scope.

Group sections by canonical (workflow phase). Each section MUST relate to a single canonical; do not merge unrelated phases.

For every entry in `contractEntries`, produce one or more items in the matching section. Always set `items[].scopeEntryId` to the source entry id.

Use quantities, hours, and rates from the approved entry resources. Compute `clientAmount = qty × unitRate`. If you cannot determine rate or quantity, leave the numeric field null and add a warning.

Consult `contractEntries[].quantitySignals`, `scenarioHighlights`, and `usageSummary` to align each line item to real scope counts (models, usage months, studio days, etc.).

If a resource is flagged internal, treat its rate as internal cost; otherwise assume internalCost is null unless data is provided.

Reference the target margin in `commercialConstraints.targetMarginPct` and summarise variance in `marginSummary` for each section.

If `commercialConstraints.approvalsPending` contains an entry id, add a section warning and include it in top-level warnings.

Use the hrmny catalog retrieval tools to map each scope entry to a catalog SKU. Prefer retrieval results and cross-check against `catalogHints`; if nothing relevant is returned, leave `sku` null and add a warning.

Respect the `Locked SKUs` guidance for each scope entry. Do not replace or remove these SKU selections.

Populate `justification` with a single sentence citing the scope entry id and key deliverables or resources.

If contractual coverage is missing or risks require escalation, return {"status": "rejected", "reasons": []} instead of sections.

Limit arrays to 10 entries and keep strings ≤120 characters. Escape newlines as \n and double quotes as \".

Return strict JSON matching the provided blueprint—no Markdown, comments, or narrative.
```

### USER PROMPT

```
### Defaults
Currency: AED
TaxType: GST
Expected Sections: Strategy & Account Management, Planning & Architecture, Asset Development, Distribution & Activation, Measurement & Optimization

### Approved Entries (contract summary)
[Full 22-field normalized scope entries as JSON - truncated to 4500 chars]

### Scope Quantity Signals (* marks primary)
strategy-planning-line-1: *6 months (duration); 12 deliveries (frequency)
asset-development-line-1: *20 posts (monthly count)
asset-development-line-2: *5 reels (monthly count)
...

### Scenario Highlights
asset-development-line-1: Monthly recurring deliverable; Multi-channel distribution
...

### Commercial Fit Snapshot
strategy-planning-line-1: SMM-STRATEGY-001 — qty 6 months (score 85.00)
asset-development-line-1: SMM-CONTENT-POST — qty 120 posts (score 92.00)
asset-development-line-2: SMM-CONTENT-REEL — qty 30 reels (score 88.00)
...

### Locked SKUs
Entry ID: strategy-planning-line-1 | Locked SKU: SMM-STRATEGY-001 | Section: Strategy & Account Management | Qty: 6 months | Visibility: Client
Entry ID: asset-development-line-1 | Locked SKU: SMM-CONTENT-POST | Section: Asset Development | Qty: 120 posts | Visibility: Client
Entry ID: asset-development-line-2 | Locked SKU: SMM-CONTENT-REEL | Section: Asset Development | Qty: 30 reels | Visibility: Client
...

### Commercial Constraints
{
  "targetMarginPct": 30,
  "approvalsPending": []
}

### Catalog Hints
SMM-STRATEGY-001: Social Media Strategy & Planning (AED 5000) - Monthly social media strategy, content calendar, and planning
SMM-CONTENT-POST: Social Media Post Creation (AED 200) - Single social media post including copywriting and design
SMM-CONTENT-REEL: Social Media Reel Production (AED 800) - Short-form video reel including scripting, filming, and editing
...

### Client Signals
Industry: Hospitality & Tourism (confidence: 0.9)
  Evidence: hotel, luxury hospitality

Region: UAE (confidence: 0.95)
  Evidence: Dubai

### Signal Layers
Derived Scope Signals:
- strategy-account (score 0.85): Account strategy, brand alignment
- asset-development (score 0.92): Content creation, posts, reels
...

Automated Client Signals:
Industries: Hospitality & Tourism (hotel, Dubai)
Regions: UAE (Dubai)

Reviewer Overrides:
(no manual overrides)

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
We need a 6-month social media retainer for our luxury hotel brand in Dubai...
```

---

## SUMMARY

**This is EXACTLY what the LLM receives:**

1. **Scope Extraction**: System prompt with phase IDs, guidance, definitions + User prompt with brief text
2. **Schema Validation**: Strict JSON schema enforcing 8-field structure
3. **Server Processing**: Normalizes 8 fields → 22 fields, adds IDs
4. **UI Rendering**: Matches canonical to phases → structured if match, freeform if no match

**The Bug**: getScopePhaseCanonicals() returned [] → LLM received no guidance → made up canonicals → UI couldn't match → freeform display

**The Fix**: getScopeCategoryConfigMap() returns proper map → LLM receives correct canonicals → matches phases → structured display

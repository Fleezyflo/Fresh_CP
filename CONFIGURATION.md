# Configuration Guide

**Complete guide to configuring the Fresh Cost Proposal system**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Reference](#quick-reference)
3. [Configuration Sources](#configuration-sources)
4. [How to Configure](#how-to-configure)
5. [Common Configuration Tasks](#common-configuration-tasks)
6. [Configuration Reference](#configuration-reference)
7. [Validation](#validation)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Topics](#advanced-topics)

---

## Introduction

### Why Configuration Matters

The Fresh Cost Proposal system is designed for **easy configuration of important values** after launch. You can adjust:

- **Business rules** (fee percentages, markup rates, thresholds)
- **Quote templates** (brief profiles, scope phases)
- **Resource catalogs** (crew, equipment, materials)
- **API credentials** (OpenAI, Xero integration)

All without touching code or redeploying the application.

### Three Sources of Truth

Configuration data lives in three distinct locations:

1. **Script Properties** - Secrets, API keys, credentials
2. **Google Sheets** - Business data, quote templates, catalogs
3. **Business Rules (Code)** - Calculation constants, fee percentages

Each source serves a specific purpose and has different security/access characteristics.

---

## Quick Reference

### Most Common Configuration Tasks

| What You Want to Do | Where to Go | How Long |
|---------------------|-------------|----------|
| **Update OpenAI API key** | [Script Properties](#updating-api-keys) | 2 minutes |
| **Change fee percentage** | [Business Rules](#changing-fee-percentages) | 5 minutes |
| **Add new brief template** | [Google Sheets](#adding-brief-profiles) | 5 minutes |
| **Modify resource catalog** | [Google Sheets](#modifying-resource-catalog) | 10 minutes |
| **Add scope phase** | [Google Sheets](#adding-scope-phases) | 10 minutes |
| **Update markup rules** | [Business Rules](#changing-markup-rules) | 5 minutes |

### Emergency Quick Fixes

**API Key Not Working?**
```
File → Project Properties → Script Properties
Find: OPENAI_API_KEY
Update value → Save
```

**Need to Test Without Caching?**
```javascript
// In Apps Script editor console
ConfigurationManager.invalidate();
```

**Validation Errors?**
```javascript
// Check what's wrong
var errors = ConfigurationManager.getValidationErrors();
Logger.log(errors);
```

---

## Configuration Sources

### 1. Script Properties (Secrets & Credentials)

**Purpose**: Store sensitive credentials that should NOT be in sheets or code

**Security**:
- Only project editors can view/edit
- Never logged by the system
- Encrypted at rest by Google

**What Goes Here**:
- ✅ OpenAI API keys
- ✅ Xero OAuth credentials (client ID, client secret)
- ✅ Third-party API tokens
- ❌ Business data (use sheets instead)
- ❌ Calculation rules (use code instead)

**Access Location**:
```
Apps Script Editor → File → Project Properties → Script Properties
```

**Format**: Key-value pairs
```
Key: OPENAI_API_KEY
Value: sk-proj-abc123...

Key: XERO_CLIENT_ID
Value: A1B2C3D4...
```

**How ConfigurationManager Reads Them**:
```javascript
// Dotted notation automatically converts to UPPER_SNAKE_CASE
const apiKey = ConfigurationManager.get('properties.openai.apiKey');
// Reads from: OPENAI_API_KEY property

const xeroId = ConfigurationManager.get('properties.xero.clientId');
// Reads from: XERO_CLIENT_ID property
```

**Key Naming Convention**:
- Script Properties use `UPPER_SNAKE_CASE` format
- ConfigurationManager uses `dotted.camelCase` format
- Automatic conversion: `properties.openai.apiKey` → `OPENAI_API_KEY`

---

### 2. Google Sheets (Business Data)

**Purpose**: Store business configuration that users need to manage frequently

**Security**:
- Anyone with sheet access can view/edit
- Changes take effect immediately (after cache expires)
- Version history via Google Sheets

**What Goes Here**:
- ✅ Brief profiles (quote templates)
- ✅ Scope phases (project phases)
- ✅ Resource catalogs (crew, equipment, materials)
- ✅ Taxonomy overrides
- ✅ Column mappings
- ❌ Secrets (use Script Properties)
- ❌ Complex calculations (use code)

**Sheet Tabs**:

1. **Config: Brief Profiles** - Quote template definitions
2. **Config: Scope Phases** - Project phase configurations
3. **Config: Phase Taxonomy Overrides** - Custom phase descriptions
4. **Config: Catalog Prefixes** - Catalog prefix priorities
5. **Config: Resource Catalog** - Resource definitions (merged view)
6. **Config: Scope Catalog** - Scope item definitions (merged view)
7. **Config: Column Map** - Column name mappings

**How ConfigurationManager Reads Them**:
```javascript
// Load brief profiles from "Config: Brief Profiles" sheet
const profiles = ConfigurationManager.get('brief.profiles');

// Load scope phases from "Config: Scope Phases" sheet
const phases = ConfigurationManager.get('scope.phases');

// Load resource catalog from "Config: Resource Catalog" sheet
const resources = ConfigurationManager.get('catalog.resource');
```

**Caching Behavior**:
- Sheet data cached for **60 minutes** in `CacheService`
- Subsequent reads instant (<1ms) from cache
- Cache auto-refreshes after 60 minutes
- Manual refresh: `ConfigurationManager.invalidate('brief.profiles')`

---

### 3. Business Rules (Code)

**Purpose**: Store calculation logic and constants that rarely change

**Security**:
- Only developers can modify (requires code deployment)
- Changes require redeploying the Apps Script project
- Version controlled via Apps Script version history

**What Goes Here**:
- ✅ Fee percentages by client type
- ✅ Markup rules by resource category
- ✅ Calculation method constants
- ✅ Default pricing mode mappings
- ❌ Secrets (use Script Properties)
- ❌ Frequently changing data (use sheets)

**Code Location**:
```
App-script/BusinessRulesLoader.js
```

**Rules Defined**:

1. **Fee Percentages** (`cost.feePercentages`)
   ```javascript
   {
     standard: 0.15,    // 15% for standard clients
     premium: 0.10,     // 10% for premium clients
     enterprise: 0.05,  // 5% for enterprise clients
     nonprofit: 0.20    // 20% for nonprofit clients
   }
   ```

2. **Markup Rules** (`cost.markupRules`)
   ```javascript
   {
     crew: {
       percentage: 0.25,  // 25% markup on crew rates
       minAmount: 50      // Minimum $50 markup
     },
     equipment: {
       percentage: 0.30,  // 30% markup on equipment
       minAmount: 25
     },
     // ... more categories
   }
   ```

3. **Calculation Methods** (`cost.calculationMethods`)
   ```javascript
   {
     FIXED: 'fixed',
     RATE: 'rate',
     DAY_RATE: 'day-rate',
     TIERED: 'tiered',
     CUSTOM: 'custom'
   }
   ```

4. **Category Pricing Map** (`cost.categoryPricingMap`)
   ```javascript
   {
     'crew': 'rate',
     'equipment': 'day-rate',
     'location': 'fixed',
     // ... more mappings
   }
   ```

**How ConfigurationManager Reads Them**:
```javascript
// Load fee percentages
const fees = ConfigurationManager.get('cost.feePercentages');
const standardFee = fees.standard; // 0.15

// Load markup rules for crew category
const markupRules = ConfigurationManager.get('cost.markupRules');
const crewMarkup = markupRules.crew; // {percentage: 0.25, minAmount: 50}
```

---

## How to Configure

### Updating Script Properties

**Step 1: Open Script Properties**
1. Open Apps Script editor (Extensions → Apps Script)
2. Click **File** → **Project Properties**
3. Select **Script Properties** tab

**Step 2: Find or Add Property**
- **To update existing**: Click value field, edit, click "Save"
- **To add new**: Click "Add row", enter key/value, click "Save"

**Step 3: Property Key Format**
- Use `UPPER_SNAKE_CASE` format
- Examples:
  - `OPENAI_API_KEY`
  - `XERO_CLIENT_ID`
  - `XERO_CLIENT_SECRET`

**Step 4: Invalidate Cache (If Needed)**
```javascript
// In Apps Script editor console (or add to Menu.js temporarily)
ConfigurationManager.invalidate('properties.openai.apiKey');
```

**Example: Updating OpenAI API Key**
```
1. File → Project Properties → Script Properties
2. Find row: OPENAI_API_KEY
3. Update value field with new key: "sk-proj-new123..."
4. Click "Save"
5. (Optional) Run: ConfigurationManager.invalidate('properties.openai.apiKey')
```

**Security Notes**:
- ⚠️ Never put secrets in Google Sheets
- ⚠️ Never commit secrets to version control
- ✅ Script Properties are encrypted and access-controlled
- ✅ Keys are never logged by ConfigurationManager

---

### Modifying Google Sheets

**Step 1: Open Configuration Sheet**
1. Open the Fresh Cost Proposal spreadsheet
2. Navigate to the appropriate "Config:" tab
3. Common tabs:
   - **Config: Brief Profiles**
   - **Config: Scope Phases**
   - **Config: Resource Catalog**
   - **Config: Scope Catalog**

**Step 2: Understand Sheet Structure**
- **Row 1**: Headers (DO NOT modify unless you know what you're doing)
- **Row 2+**: Data rows (safe to add/edit/delete)
- **Columns**: Each has specific purpose (see schema below)

**Step 3: Make Changes**
- **Add row**: Insert new row, fill in all required columns
- **Edit row**: Modify cells directly
- **Delete row**: Delete entire row (or set `active` column to FALSE)

**Step 4: Verify Changes**
- Changes take effect **immediately** (after cache expires)
- Cache expires after **60 minutes** automatically
- Force refresh: `ConfigurationManager.invalidate('brief.profiles')`

**Step 5: Test Changes**
```javascript
// Load updated config
const profiles = ConfigurationManager.get('brief.profiles');
Logger.log(profiles); // Verify your changes appear
```

---

### Editing Business Rules (Code)

**Step 1: Open BusinessRulesLoader.js**
1. Open Apps Script editor (Extensions → Apps Script)
2. Find **BusinessRulesLoader.js** in file list
3. Click to open

**Step 2: Locate Constants**
Constants defined at top of file:
```javascript
const FEE_PERCENTAGES = { ... };
const MARKUP_RULES = { ... };
const COST_CALCULATION_METHODS = { ... };
const CATEGORY_PRICING_MAP = { ... };
```

**Step 3: Edit Values**
Example - Changing fee percentage:
```javascript
// BEFORE
const FEE_PERCENTAGES = {
  standard: 0.15,    // 15%
  premium: 0.10,     // 10%
  ...
};

// AFTER
const FEE_PERCENTAGES = {
  standard: 0.18,    // 18% (updated!)
  premium: 0.12,     // 12% (updated!)
  ...
};
```

**Step 4: Save and Deploy**
1. Click **File** → **Save** (or Ctrl/Cmd+S)
2. Changes take effect **immediately** for new executions
3. No cache invalidation needed (rules are static)

**Step 5: Verify Changes**
```javascript
const fees = ConfigurationManager.get('cost.feePercentages');
Logger.log(fees.standard); // Should show new value: 0.18
```

**⚠️ Warning**:
- Editing business rules requires code knowledge
- Test thoroughly before deploying to production
- Consider using Apps Script version history for rollback
- Document changes in comments

---

## Common Configuration Tasks

### Adding Brief Profiles

**What**: Add new quote template type (e.g., "Short Form Video", "Podcast Production")

**Where**: Google Sheet → "Config: Brief Profiles" tab

**Steps**:

1. **Open Sheet**
   - Navigate to "Config: Brief Profiles" tab

2. **Add New Row**
   - Insert new row at bottom
   - Fill in required columns:

   | Column | Value | Example |
   |--------|-------|---------|
   | `briefType` | Unique identifier (no spaces) | `shortFormVideo` |
   | `label` | Display name | `Short Form Video` |
   | `nudge` | Help text for users | `For social media content...` |
   | `sectionOrderCSV` | Section order | `overview,timeline,crew,deliverables` |
   | `optionalSectionsCSV` | Optional sections | `equipment,travel` |
   | `catalogPrefixesCSV` | Catalog prefixes | `SFV,VIDEO,GEN` |
   | `signatureCuesCSV` | Detection keywords | `tiktok,instagram,short form` |
   | `fallback` | Is this fallback? | `FALSE` |
   | `active` | Is this active? | `TRUE` |
   | `priority` | Priority order | `10` |

3. **Verify Schema**
   - Ensure all required columns filled
   - Use comma-separated values for CSV columns
   - Boolean columns: `TRUE` or `FALSE`
   - Priority: Lower number = higher priority

4. **Test**
   ```javascript
   // Invalidate cache to force reload
   ConfigurationManager.invalidate('brief.profiles');

   // Load and verify
   const profiles = ConfigurationManager.get('brief.profiles');
   Logger.log(profiles); // Check your new profile appears
   ```

5. **Validation**
   - New profile should appear in brief type selection
   - Signature cues should trigger profile detection
   - Section order should be respected in quote generation

**Example Row**:
```
briefType: shortFormVideo
label: Short Form Video
nudge: For social media content (TikTok, Instagram Reels, YouTube Shorts)
sectionOrderCSV: overview,timeline,crew,equipment,deliverables
optionalSectionsCSV: travel,location
catalogPrefixesCSV: SFV,VIDEO,GEN
signatureCuesCSV: tiktok,instagram,reels,short form,social media
fallback: FALSE
active: TRUE
priority: 10
```

---

### Adding Scope Phases

**What**: Add new project phase (e.g., "Color Grading", "Sound Design")

**Where**: Google Sheet → "Config: Scope Phases" tab

**Steps**:

1. **Open Sheet**
   - Navigate to "Config: Scope Phases" tab

2. **Add New Row**
   - Insert new row at bottom
   - Fill in required columns:

   | Column | Value | Example |
   |--------|-------|---------|
   | `briefType` | Brief type this applies to | `commercial` |
   | `phaseId` | Unique ID (no spaces) | `colorGrading` |
   | `label` | Display name | `Color Grading` |
   | `canonical` | Canonical name for matching | `color-grading` |
   | `required` | Is this required? | `FALSE` |
   | `order` | Display order | `50` |
   | `ancillaryFeeFlagsCSV` | Fee flags | `POST_PRODUCTION` |
   | `cadence` | When this happens | `post-production` |
   | `deliverableHint` | What gets delivered | `Color-corrected footage` |
   | `signalHint` | Detection keywords | `color grade,color correction` |
   | `synonymsCSV` | Alternative names | `color correction,grading` |
   | `taxonomyHintJSON` | Taxonomy metadata (optional) | `{}` |
   | `active` | Is this active? | `TRUE` |

3. **Brief Type Association**
   - Each phase linked to specific brief type
   - Use `*` for universal phases (all brief types)
   - Example: `briefType: *` applies to all quotes

4. **Canonical Naming**
   - Use lowercase, hyphenated format
   - Example: `color-grading`, `sound-design`, `pre-production`
   - Used for matching and deduplication

5. **Test**
   ```javascript
   // Invalidate cache
   ConfigurationManager.invalidate('scope.phases');

   // Load and verify
   const phases = ConfigurationManager.get('scope.phases');
   Logger.log(phases); // Check your new phase appears
   ```

**Example Row**:
```
briefType: commercial
phaseId: colorGrading
label: Color Grading
canonical: color-grading
required: FALSE
order: 50
ancillaryFeeFlagsCSV: POST_PRODUCTION
cadence: post-production
deliverableHint: Color-corrected and graded footage
signalHint: color grade,color correction,grading
synonymsCSV: color correction,grading,color work
taxonomyHintJSON: {}
active: TRUE
```

---

### Modifying Resource Catalog

**What**: Add/edit resources (crew, equipment, materials)

**Where**: Google Sheet → "Config: Resource Catalog" tab

**Steps**:

1. **Open Sheet**
   - Navigate to "Config: Resource Catalog" tab
   - This is a **merged view** of resources from multiple sources

2. **Add New Resource**
   - Insert new row at bottom
   - Fill in required columns:

   | Column | Value | Example |
   |--------|-------|---------|
   | `code` | Unique resource code | `CREW-DP-001` |
   | `name` | Display name | `Director of Photography` |
   | `unit` | Unit of measure | `hour` or `day` |
   | `rate` | Rate per unit | `150.00` |
   | `category` | Resource category | `crew` |
   | `source` | Source system | `manual` or `xero` |
   | `description` | Description | `Lead cinematographer for shoot` |
   | `pricingMode` | Pricing mode | `rate` or `day-rate` |
   | `status` | Status | `active` |
   | `metadataJSON` | Metadata (optional) | `{}` |

3. **Category Guidelines**
   - `crew` - People resources
   - `equipment` - Cameras, lights, gear
   - `location` - Shooting locations
   - `services` - Third-party services
   - `materials` - Consumables
   - `post-production` - Post work
   - `creative` - Creative services
   - `travel` - Travel expenses

4. **Pricing Mode**
   - `fixed` - Fixed price (e.g., location fees)
   - `rate` - Hourly rate (e.g., crew)
   - `day-rate` - Day rate (e.g., equipment rental)
   - `tiered` - Tiered pricing (quantity-based)
   - `custom` - Custom calculation

5. **Rate Format**
   - Numbers only, no currency symbols
   - Example: `150.00` not `$150.00`
   - Decimals optional but recommended

6. **Test**
   ```javascript
   // Invalidate cache
   ConfigurationManager.invalidate('catalog.resource');

   // Load and verify
   const resources = ConfigurationManager.get('catalog.resource');
   Logger.log(resources); // Check your new resource appears
   ```

**Example Row (Crew)**:
```
code: CREW-DP-001
name: Director of Photography
unit: day
rate: 1200.00
category: crew
source: manual
description: Senior DP with 10+ years experience
pricingMode: day-rate
status: active
metadataJSON: {"skillLevel": "senior", "specialization": "commercial"}
```

**Example Row (Equipment)**:
```
code: EQUIP-CAM-ARRI
name: ARRI Alexa Mini Camera Package
unit: day
rate: 800.00
category: equipment
source: manual
description: Complete camera package with lenses
pricingMode: day-rate
status: active
metadataJSON: {"includes": ["body", "lenses", "matte box", "follow focus"]}
```

---

### Modifying Scope Catalog

**What**: Add/edit scope items (deliverables, packages)

**Where**: Google Sheet → "Config: Scope Catalog" tab

**Steps**:

1. **Open Sheet**
   - Navigate to "Config: Scope Catalog" tab

2. **Add New Scope Item**
   - Insert new row at bottom
   - Fill in required columns:

   | Column | Value | Example |
   |--------|-------|---------|
   | `scopeId` | Unique scope ID | `SCOPE-EDIT-001` |
   | `label` | Display name | `Basic Edit (30 sec)` |
   | `canonical` | Canonical name | `basic-edit-30s` |
   | `briefType` | Brief type | `commercial` |
   | `phaseId` | Phase ID | `editing` |
   | `ancillaryFeeFlagsCSV` | Fee flags | `POST_PRODUCTION` |
   | `order` | Display order | `10` |
   | `notes` | Notes | `Includes 2 revisions` |
   | `aliasesCSV` | Alternative names | `30 second edit,short edit` |

3. **Linking to Phases**
   - `phaseId` must match existing phase from "Config: Scope Phases"
   - Use `*` for items that apply to multiple phases

4. **Brief Type Association**
   - Link scope items to specific brief types
   - Or use `*` for universal scope items

5. **Canonical Naming**
   - Same rules as phase canonical names
   - Lowercase, hyphenated format

6. **Test**
   ```javascript
   // Invalidate cache
   ConfigurationManager.invalidate('catalog.scope');

   // Load and verify
   const scopeItems = ConfigurationManager.get('catalog.scope');
   Logger.log(scopeItems); // Check your new item appears
   ```

**Example Row**:
```
scopeId: SCOPE-EDIT-001
label: Basic Edit (30 sec)
canonical: basic-edit-30s
briefType: commercial
phaseId: editing
ancillaryFeeFlagsCSV: POST_PRODUCTION
order: 10
notes: Includes 2 rounds of revisions, color correction, audio mix
aliasesCSV: 30 second edit,short edit,basic editing
```

---

### Updating API Keys

**Task**: Update OpenAI API key

**Steps**:

1. **Access Script Properties**
   ```
   Apps Script Editor → File → Project Properties → Script Properties
   ```

2. **Find Property**
   - Look for key: `OPENAI_API_KEY`

3. **Update Value**
   - Click value field
   - Paste new API key (starts with `sk-proj-` or `sk-`)
   - Click "Save"

4. **Verify Update**
   ```javascript
   // Test in Apps Script console
   const key = ConfigurationManager.get('properties.openai.apiKey');
   Logger.log(key.substring(0, 10)); // Log first 10 chars only (security)
   ```

5. **Invalidate Cache (Optional)**
   ```javascript
   ConfigurationManager.invalidate('properties.openai.apiKey');
   ```

**Security Reminder**:
- ⚠️ Never log full API key
- ⚠️ Never share screenshots of Script Properties
- ⚠️ Only project editors can view/edit

---

### Changing Fee Percentages

**Task**: Update fee percentage for client type (e.g., increase standard fee to 18%)

**Steps**:

1. **Open BusinessRulesLoader.js**
   - Apps Script Editor → BusinessRulesLoader.js

2. **Locate FEE_PERCENTAGES Constant**
   ```javascript
   const FEE_PERCENTAGES = {
     standard: 0.15,    // 15% for standard clients
     premium: 0.10,     // 10% for premium clients
     enterprise: 0.05,  // 5% for enterprise clients
     nonprofit: 0.20    // 20% for nonprofit clients
   };
   ```

3. **Edit Values**
   ```javascript
   const FEE_PERCENTAGES = {
     standard: 0.18,    // 18% (updated from 15%)
     premium: 0.12,     // 12% (updated from 10%)
     enterprise: 0.05,  // 5% (unchanged)
     nonprofit: 0.20    // 20% (unchanged)
   };
   ```

4. **Save File**
   - File → Save (or Ctrl/Cmd+S)

5. **Test Changes**
   ```javascript
   const fees = ConfigurationManager.get('cost.feePercentages');
   Logger.log('Standard fee:', fees.standard); // Should show 0.18
   Logger.log('Premium fee:', fees.premium);   // Should show 0.12
   ```

6. **Verify in Quote Generation**
   - Generate new quote
   - Check fee calculation matches new percentage

**Decimal to Percentage Conversion**:
- `0.15` = 15%
- `0.18` = 18%
- `0.125` = 12.5%
- `0.05` = 5%

---

### Changing Markup Rules

**Task**: Update markup percentage for resource category (e.g., increase crew markup to 30%)

**Steps**:

1. **Open BusinessRulesLoader.js**
   - Apps Script Editor → BusinessRulesLoader.js

2. **Locate MARKUP_RULES Constant**
   ```javascript
   const MARKUP_RULES = {
     crew: {
       percentage: 0.25,  // 25% markup on crew rates
       minAmount: 50      // Minimum $50 markup
     },
     equipment: {
       percentage: 0.30,  // 30% markup on equipment
       minAmount: 25
     },
     // ... more categories
   };
   ```

3. **Edit Values**
   ```javascript
   const MARKUP_RULES = {
     crew: {
       percentage: 0.30,  // 30% (updated from 25%)
       minAmount: 75      // $75 (updated from $50)
     },
     equipment: {
       percentage: 0.30,  // 30% (unchanged)
       minAmount: 25      // $25 (unchanged)
     },
     // ... more categories
   };
   ```

4. **Understanding Markup Rules**
   - `percentage`: Markup percentage applied to base rate
   - `minAmount`: Minimum markup dollar amount (if percentage too low)
   - **Example**: $100 base rate with 30% markup = $130 total
   - **Example**: $10 base rate with 30% markup ($3) < $75 min → $85 total

5. **Save File**
   - File → Save

6. **Test Changes**
   ```javascript
   const rules = ConfigurationManager.get('cost.markupRules');
   Logger.log('Crew markup:', rules.crew);
   // Should show: {percentage: 0.30, minAmount: 75}
   ```

---

### Adding Catalog Prefixes

**What**: Add new catalog prefix for specific brief type

**Where**: Google Sheet → "Config: Catalog Prefixes" tab

**Steps**:

1. **Open Sheet**
   - Navigate to "Config: Catalog Prefixes" tab

2. **Add New Row**
   - Fill in columns:

   | Column | Value | Example |
   |--------|-------|---------|
   | `briefType` | Brief type | `podcast` |
   | `prefix` | Prefix code | `POD` |
   | `priority` | Priority order | `10` |
   | `active` | Is active? | `TRUE` |

3. **Priority Order**
   - Lower number = higher priority
   - When searching catalog, higher priority prefixes checked first
   - Example: `priority: 1` checked before `priority: 10`

4. **Prefix Naming**
   - 2-5 characters, uppercase
   - Examples: `POD`, `SFV`, `COMM`, `DOC`
   - Used to filter catalog items

5. **Test**
   ```javascript
   ConfigurationManager.invalidate('catalog.prefixes');
   const prefixes = ConfigurationManager.get('catalog.prefixes');
   Logger.log(prefixes);
   ```

**Example Rows**:
```
briefType: podcast
prefix: POD
priority: 10
active: TRUE

briefType: commercial
prefix: COMM
priority: 5
active: TRUE

briefType: commercial
prefix: GEN
priority: 20
active: TRUE
```

---

### Adding Taxonomy Overrides

**What**: Override default phase descriptions/keywords for specific brief type

**Where**: Google Sheet → "Config: Phase Taxonomy Overrides" tab

**Steps**:

1. **Open Sheet**
   - Navigate to "Config: Phase Taxonomy Overrides" tab

2. **Add New Row**
   - Fill in columns:

   | Column | Value | Example |
   |--------|-------|---------|
   | `briefType` | Brief type | `commercial` |
   | `phaseCanonical` | Phase canonical name | `pre-production` |
   | `purpose` | Purpose description | `Planning and preparation for commercial shoot` |
   | `keyDeliverablesCSV` | Key deliverables | `shot list,storyboard,location scout` |
   | `signalsCSV` | Detection signals | `planning,prep,preproduction` |
   | `keywordsCSV` | Keywords | `plan,prepare,scout,storyboard` |
   | `boundaryHint` | Boundary hint | `Ends when principal photography begins` |

3. **When to Use Overrides**
   - Different brief types need different phase descriptions
   - Example: "Pre-production" for commercial vs documentary
   - Helps AI better understand context

4. **CSV Columns**
   - Comma-separated values
   - Example: `shot list,storyboard,location scout`
   - No spaces after commas (or trim will handle)

5. **Test**
   ```javascript
   ConfigurationManager.invalidate('taxonomy.overrides');
   const overrides = ConfigurationManager.get('taxonomy.overrides');
   Logger.log(overrides);
   ```

**Example Row**:
```
briefType: commercial
phaseCanonical: pre-production
purpose: Planning and preparation phase for commercial video production
keyDeliverablesCSV: shot list,storyboard,location scout,casting,schedule
signalsCSV: planning,prep,preproduction,pre production
keywordsCSV: plan,prepare,scout,storyboard,cast,schedule
boundaryHint: Ends when principal photography or production day begins
```

---

## Configuration Reference

### Complete Configuration Keys

| Configuration Key | Source | Location | Purpose | Type | Example Value |
|-------------------|--------|----------|---------|------|---------------|
| `brief.profiles` | Sheet | Config: Brief Profiles | Quote template definitions | Array | `[{briefType:"commercial", label:"Commercial",...}]` |
| `scope.phases` | Sheet | Config: Scope Phases | Project phase definitions | Array | `[{phaseId:"preProduction", label:"Pre-Production",...}]` |
| `taxonomy.overrides` | Sheet | Config: Phase Taxonomy Overrides | Custom phase descriptions | Array | `[{briefType:"commercial", phaseCanonical:"pre-production",...}]` |
| `catalog.prefixes` | Sheet | Config: Catalog Prefixes | Catalog prefix priorities | Array | `[{briefType:"commercial", prefix:"COMM",...}]` |
| `catalog.resource` | Sheet | Config: Resource Catalog | Resource definitions | Array | `[{code:"CREW-DP-001", name:"Director of Photography",...}]` |
| `catalog.scope` | Sheet | Config: Scope Catalog | Scope item definitions | Array | `[{scopeId:"SCOPE-001", label:"Basic Edit",...}]` |
| `column.map` | Sheet | Config: Column Map | Column name mappings | Array | `[{key:"deliverableHint", value:"Deliverable",...}]` |
| `properties.openai.apiKey` | Properties | Script Properties | OpenAI API key | String | `sk-proj-abc123...` |
| `properties.xero.clientId` | Properties | Script Properties | Xero OAuth client ID | String | `A1B2C3D4...` |
| `properties.xero.clientSecret` | Properties | Script Properties | Xero OAuth client secret | String | `X1Y2Z3...` |
| `cost.feePercentages` | Code | BusinessRulesLoader.js | Fee % by client type | Object | `{standard:0.15, premium:0.10,...}` |
| `cost.markupRules` | Code | BusinessRulesLoader.js | Markup rules by category | Object | `{crew:{percentage:0.25, minAmount:50},...}` |
| `cost.calculationMethods` | Code | BusinessRulesLoader.js | Calculation method constants | Object | `{FIXED:"fixed", RATE:"rate",...}` |
| `cost.categoryPricingMap` | Code | BusinessRulesLoader.js | Category → pricing mode | Object | `{crew:"rate", equipment:"day-rate",...}` |
| `scope.categories` | Code | BusinessRulesLoader.js | Scope category definitions | Object | `{}` (mostly in sheets) |
| `scope.phaseMapping` | Code | BusinessRulesLoader.js | Phase → category mapping | Object | `{}` (mostly in sheets) |

---

### Sheet Schema Reference

#### Config: Brief Profiles

| Column | Type | Required | Description | Example |
|--------|------|----------|-------------|---------|
| `briefType` | String | ✅ | Unique identifier (no spaces) | `commercial` |
| `label` | String | ✅ | Display name | `Commercial Video` |
| `nudge` | String | ✅ | Help text | `For brand commercials...` |
| `sectionOrderCSV` | CSV | ✅ | Section order | `overview,timeline,crew` |
| `optionalSectionsCSV` | CSV | ⬜ | Optional sections | `equipment,travel` |
| `catalogPrefixesCSV` | CSV | ✅ | Catalog prefixes | `COMM,GEN` |
| `signatureCuesCSV` | CSV | ✅ | Detection keywords | `commercial,ad,advertisement` |
| `fallback` | Boolean | ✅ | Is fallback template? | `FALSE` |
| `active` | Boolean | ✅ | Is active? | `TRUE` |
| `priority` | Number | ✅ | Priority order | `10` |

#### Config: Scope Phases

| Column | Type | Required | Description | Example |
|--------|------|----------|-------------|---------|
| `briefType` | String | ✅ | Brief type (or `*`) | `commercial` |
| `phaseId` | String | ✅ | Unique ID (no spaces) | `preProduction` |
| `label` | String | ✅ | Display name | `Pre-Production` |
| `canonical` | String | ✅ | Canonical name | `pre-production` |
| `required` | Boolean | ✅ | Is required? | `TRUE` |
| `order` | Number | ✅ | Display order | `10` |
| `ancillaryFeeFlagsCSV` | CSV | ⬜ | Fee flags | `PREP,PLANNING` |
| `cadence` | String | ⬜ | When phase happens | `pre-production` |
| `deliverableHint` | String | ⬜ | What gets delivered | `Shot list, schedule` |
| `signalHint` | String | ⬜ | Detection keywords | `planning,prep` |
| `synonymsCSV` | CSV | ⬜ | Alternative names | `planning,preparation` |
| `taxonomyHintJSON` | JSON | ⬜ | Taxonomy metadata | `{}` |
| `active` | Boolean | ✅ | Is active? | `TRUE` |

#### Config: Resource Catalog

| Column | Type | Required | Description | Example |
|--------|------|----------|-------------|---------|
| `code` | String | ✅ | Unique resource code | `CREW-DP-001` |
| `name` | String | ✅ | Display name | `Director of Photography` |
| `unit` | String | ✅ | Unit of measure | `hour`, `day` |
| `rate` | Number | ✅ | Rate per unit | `150.00` |
| `category` | String | ✅ | Resource category | `crew` |
| `source` | String | ✅ | Source system | `manual`, `xero` |
| `description` | String | ⬜ | Description | `Senior DP with...` |
| `pricingMode` | String | ✅ | Pricing mode | `rate`, `day-rate` |
| `status` | String | ✅ | Status | `active` |
| `metadataJSON` | JSON | ⬜ | Additional metadata | `{}` |

#### Config: Scope Catalog

| Column | Type | Required | Description | Example |
|--------|------|----------|-------------|---------|
| `scopeId` | String | ✅ | Unique scope ID | `SCOPE-EDIT-001` |
| `label` | String | ✅ | Display name | `Basic Edit (30 sec)` |
| `canonical` | String | ✅ | Canonical name | `basic-edit-30s` |
| `briefType` | String | ✅ | Brief type | `commercial` |
| `phaseId` | String | ✅ | Phase ID | `editing` |
| `ancillaryFeeFlagsCSV` | CSV | ⬜ | Fee flags | `POST_PRODUCTION` |
| `order` | Number | ✅ | Display order | `10` |
| `notes` | String | ⬜ | Notes | `Includes 2 revisions` |
| `aliasesCSV` | CSV | ⬜ | Alternative names | `30 second edit` |

---

### Business Rules Constants

#### Fee Percentages (cost.feePercentages)

```javascript
{
  standard: 0.15,      // 15% fee for standard clients
  premium: 0.10,       // 10% fee for premium clients
  enterprise: 0.05,    // 5% fee for enterprise clients
  nonprofit: 0.20      // 20% fee for nonprofit clients
}
```

**Usage**:
```javascript
const fees = ConfigurationManager.get('cost.feePercentages');
const standardFee = fees.standard; // 0.15
```

**To Change**: Edit `FEE_PERCENTAGES` constant in `BusinessRulesLoader.js`

---

#### Markup Rules (cost.markupRules)

```javascript
{
  crew: {
    percentage: 0.25,    // 25% markup on crew rates
    minAmount: 50        // Minimum $50 markup
  },
  equipment: {
    percentage: 0.30,    // 30% markup on equipment
    minAmount: 25
  },
  location: {
    percentage: 0.20,    // 20% markup on locations
    minAmount: 100
  },
  services: {
    percentage: 0.15,    // 15% markup on services
    minAmount: 50
  },
  default: {
    percentage: 0.20,    // 20% default markup
    minAmount: 0
  }
}
```

**Usage**:
```javascript
const rules = ConfigurationManager.get('cost.markupRules');
const crewMarkup = rules.crew; // {percentage: 0.25, minAmount: 50}
```

**Markup Calculation**:
```javascript
// Example: $200 base rate, crew category
const baseRate = 200;
const markupRule = rules.crew;
const markupAmount = Math.max(
  baseRate * markupRule.percentage,  // $200 * 0.25 = $50
  markupRule.minAmount                // $50 minimum
);
const totalRate = baseRate + markupAmount; // $200 + $50 = $250
```

**To Change**: Edit `MARKUP_RULES` constant in `BusinessRulesLoader.js`

---

#### Calculation Methods (cost.calculationMethods)

```javascript
{
  FIXED: 'fixed',           // Fixed price per unit
  RATE: 'rate',             // Hourly/daily rate
  DAY_RATE: 'day-rate',     // Day rate with hour conversion
  TIERED: 'tiered',         // Tiered pricing based on quantity
  CUSTOM: 'custom'          // Custom calculation (formula-based)
}
```

**Usage**:
```javascript
const methods = ConfigurationManager.get('cost.calculationMethods');
const fixedMethod = methods.FIXED; // 'fixed'
```

**To Change**: Edit `COST_CALCULATION_METHODS` constant in `BusinessRulesLoader.js`

---

#### Category Pricing Map (cost.categoryPricingMap)

```javascript
{
  'crew': 'rate',              // Crew uses hourly/daily rates
  'equipment': 'day-rate',     // Equipment uses day rates
  'location': 'fixed',         // Locations use fixed pricing
  'services': 'rate',          // Services use rates
  'materials': 'fixed',        // Materials use fixed pricing
  'post-production': 'rate',   // Post work uses rates
  'creative': 'rate',          // Creative services use rates
  'travel': 'fixed',           // Travel uses fixed pricing
  'default': 'fixed'           // Default to fixed
}
```

**Usage**:
```javascript
const map = ConfigurationManager.get('cost.categoryPricingMap');
const crewMode = map.crew; // 'rate'
```

**To Change**: Edit `CATEGORY_PRICING_MAP` constant in `BusinessRulesLoader.js`

---

## Validation

### Validating Configuration Changes

**Automatic Validation**:
- ConfigurationManager validates business rules on load
- Warnings logged (not thrown) to allow degraded operation
- Check Apps Script logs for validation warnings

**Manual Validation**:

```javascript
// Validate all business rules
const report = ConfigurationManager.validateAll();

if (!report.valid) {
  Logger.log('Validation warnings:', report.totalWarnings);
  Logger.log('Details:', report.results);

  // Example output:
  // {
  //   valid: false,
  //   totalWarnings: 2,
  //   results: {
  //     'cost.feePercentages': {
  //       valid: true,
  //       warnings: [],
  //       warningCount: 0
  //     },
  //     'cost.markupRules': {
  //       valid: false,
  //       warnings: ['Missing required field: default'],
  //       warningCount: 1
  //     }
  //   }
  // }
}
```

**Get Validation Errors Only**:

```javascript
const errors = ConfigurationManager.getValidationErrors();

if (errors.length > 0) {
  Logger.log('Found validation errors:', errors);
  errors.forEach(function(error) {
    Logger.log(error.key + ':', error.warnings);
  });
}
```

---

### Validation Rules

#### Business Rules Validation

**cost.feePercentages**:
- ✅ Must have `standard` field
- ✅ All values must be numbers
- ⚠️ Warning if missing client type

**cost.markupRules**:
- ✅ Must have `default` field
- ✅ Each rule must have `percentage` and `minAmount`
- ✅ Values must be numbers
- ⚠️ Warning if category missing fields

**cost.calculationMethods**:
- ✅ Must have: FIXED, RATE, DAY_RATE, TIERED, CUSTOM
- ⚠️ Warning if missing method

#### Sheet Data Validation

**Header Validation**:
- All expected headers must be present
- Case-insensitive matching
- Throws error if headers missing

**Schema Validation**:
- Performed by ConfigValidator (if available)
- Checks required fields
- Validates data types
- Logs warnings (doesn't throw)

---

### Testing Configuration Changes

**Test Workflow**:

1. **Make Change** (sheet edit, property update, or code change)

2. **Invalidate Cache** (if needed)
   ```javascript
   // Specific key
   ConfigurationManager.invalidate('brief.profiles');

   // All caches
   ConfigurationManager.invalidate();
   ```

3. **Reload Configuration**
   ```javascript
   const config = ConfigurationManager.get('brief.profiles');
   Logger.log(config);
   ```

4. **Validate**
   ```javascript
   const errors = ConfigurationManager.getValidationErrors();
   if (errors.length > 0) {
     Logger.log('Validation errors:', errors);
   }
   ```

5. **Test Downstream** (generate quote, calculate cost, etc.)

**Integration Testing**:
```javascript
function testConfigurationChanges() {
  // Test 1: Load configuration
  const profiles = ConfigurationManager.get('brief.profiles');
  Logger.log('Loaded profiles:', profiles.length);

  // Test 2: Validate
  const errors = ConfigurationManager.getValidationErrors();
  if (errors.length > 0) {
    throw new Error('Validation failed: ' + JSON.stringify(errors));
  }

  // Test 3: Check specific value
  const fees = ConfigurationManager.get('cost.feePercentages');
  if (fees.standard !== 0.18) {
    throw new Error('Expected standard fee to be 0.18, got ' + fees.standard);
  }

  Logger.log('All configuration tests passed!');
}
```

---

## Troubleshooting

### Common Issues

#### Issue: Configuration Changes Not Appearing

**Symptoms**:
- Made change in sheet/properties/code
- Change not reflected in system
- Old values still being used

**Causes**:
1. Cache not invalidated
2. Wrong cache layer (CacheService vs in-memory)
3. Script not saved/deployed

**Solutions**:

**Solution 1: Invalidate Cache**
```javascript
// Clear specific config
ConfigurationManager.invalidate('brief.profiles');

// Or clear everything
ConfigurationManager.invalidate();
```

**Solution 2: Force Reload**
```javascript
// Invalidate + reload
ConfigurationManager.invalidate('brief.profiles');
const profiles = ConfigurationManager.get('brief.profiles');
Logger.log(profiles);
```

**Solution 3: Check Cache Layers**
- ConfigurationManager cache (in-memory Map)
- Loader caches (SheetConfigLoader, PropertiesLoader)
- CacheService cache (Google's cache service)

```javascript
// Clear all layers
ConfigurationManager.invalidate(); // Clears all three layers
```

**Solution 4: Verify Script Saved**
- File → Save (Ctrl/Cmd+S)
- Check for unsaved indicator (* in tab)

---

#### Issue: Validation Warnings

**Symptoms**:
- Validation warnings in logs
- Config still loads but may be incomplete

**Example Warning**:
```
Config validation warning: cost.markupRules
Warnings: ["Missing required field: default"]
```

**Solutions**:

**Solution 1: Check Required Fields**
```javascript
// Get validation report
const report = ConfigurationManager.validateAll();
Logger.log(report.results);

// Fix missing fields based on warnings
```

**Solution 2: Review Business Rules**
```javascript
// Check what's actually loaded
const rules = ConfigurationManager.get('cost.markupRules');
Logger.log('Loaded rules:', rules);

// Compare with expected structure
```

**Solution 3: Fix in Code**
- Open BusinessRulesLoader.js
- Find missing field
- Add required field with appropriate value

---

#### Issue: API Key Not Working

**Symptoms**:
- OpenAI API calls failing
- "Invalid API key" errors
- Authentication errors

**Solutions**:

**Solution 1: Verify Property Exists**
```javascript
// Check if property is set
const hasKey = ConfigurationManager.has('properties.openai.apiKey');
Logger.log('Has API key:', hasKey);

if (hasKey) {
  const key = ConfigurationManager.get('properties.openai.apiKey');
  Logger.log('Key prefix:', key.substring(0, 7)); // Log "sk-proj" or "sk-"
}
```

**Solution 2: Check Property Name**
- Script Properties → Find `OPENAI_API_KEY`
- NOT `openai.apiKey` or other variants
- Must be exact: `OPENAI_API_KEY`

**Solution 3: Verify Key Format**
- OpenAI keys start with `sk-proj-` or `sk-`
- No spaces before/after
- No quotes around value

**Solution 4: Update and Invalidate**
```javascript
// After updating in Script Properties
PropertiesService.getScriptProperties().setProperty('OPENAI_API_KEY', 'sk-proj-new123');
ConfigurationManager.invalidate('properties.openai.apiKey');
```

---

#### Issue: Sheet Headers Missing

**Symptoms**:
- Error: "Missing required columns in Config: Brief Profiles: ..."
- Sheet loading fails

**Cause**:
- Sheet headers modified
- Headers misspelled
- Headers deleted

**Solution**:

**Solution 1: Check Expected Headers**
```javascript
// SheetConfigLoader.js defines expected headers
// For Brief Profiles:
const expected = [
  'briefType', 'label', 'nudge', 'sectionOrderCSV',
  'optionalSectionsCSV', 'catalogPrefixesCSV',
  'signatureCuesCSV', 'fallback', 'active', 'priority'
];
```

**Solution 2: Restore Headers**
- Open sheet tab
- Row 1 should contain exact header names
- Case-insensitive but spelling must match
- Restore from backup if needed

**Solution 3: Add Missing Headers**
- Insert missing columns
- Copy header names exactly from expected list
- Can be in any order (flexible matching)

---

#### Issue: Business Rules Not Updating

**Symptoms**:
- Changed BusinessRulesLoader.js
- Old values still returned

**Cause**:
- File not saved
- Script not reloaded
- Browser cache

**Solutions**:

**Solution 1: Save File**
- File → Save (Ctrl/Cmd+S)
- Check for * indicator in tab (means unsaved)

**Solution 2: Reload Script Editor**
- Close and reopen Apps Script editor
- Or refresh browser page

**Solution 3: Run Test**
```javascript
function testBusinessRules() {
  const fees = ConfigurationManager.get('cost.feePercentages');
  Logger.log('Standard fee:', fees.standard);

  if (fees.standard !== 0.18) {
    throw new Error('Expected 0.18, got ' + fees.standard);
  }

  Logger.log('Business rules updated successfully');
}
```

---

### Debug Commands

**Check Configuration Status**:
```javascript
function debugConfiguration() {
  Logger.log('=== Configuration Debug ===');

  // Check cache status
  const hasBriefProfiles = ConfigurationManager.has('brief.profiles');
  Logger.log('Has brief.profiles:', hasBriefProfiles);

  // Load and inspect
  if (hasBriefProfiles) {
    const profiles = ConfigurationManager.get('brief.profiles');
    Logger.log('Profile count:', profiles.length);
    Logger.log('First profile:', profiles[0]);
  }

  // Check properties
  const hasApiKey = ConfigurationManager.has('properties.openai.apiKey');
  Logger.log('Has OpenAI key:', hasApiKey);

  // Check business rules
  const fees = ConfigurationManager.get('cost.feePercentages');
  Logger.log('Fee percentages:', fees);

  // Validation
  const errors = ConfigurationManager.getValidationErrors();
  Logger.log('Validation errors:', errors.length);

  Logger.log('=== Debug Complete ===');
}
```

**Clear All Caches**:
```javascript
function clearAllCaches() {
  Logger.log('Clearing all configuration caches...');

  // Clear ConfigurationManager cache
  ConfigurationManager.invalidate();

  // Clear CacheService (if needed)
  CacheService.getScriptCache().removeAll();

  Logger.log('All caches cleared!');
}
```

**Verify Configuration Integrity**:
```javascript
function verifyConfigurationIntegrity() {
  const keys = [
    'brief.profiles',
    'scope.phases',
    'cost.feePercentages',
    'cost.markupRules',
    'properties.openai.apiKey'
  ];

  keys.forEach(function(key) {
    try {
      const exists = ConfigurationManager.has(key);
      Logger.log(key + ':', exists ? 'OK' : 'MISSING');

      if (exists) {
        const data = ConfigurationManager.get(key);
        const type = Array.isArray(data) ? 'Array' : typeof data;
        const size = Array.isArray(data) ? data.length : Object.keys(data || {}).length;
        Logger.log('  Type:', type, 'Size:', size);
      }
    } catch (error) {
      Logger.log(key + ':', 'ERROR -', error);
    }
  });
}
```

---

## Advanced Topics

### Cache Management

**Cache Layers**:

1. **ConfigurationManager Cache** (in-memory Map)
   - Fastest (instant access)
   - Lost on script restart
   - Cleared by: `ConfigurationManager.invalidate()`

2. **Loader Caches** (SheetConfigLoader, PropertiesLoader)
   - Per-loader caching
   - Cleared by loader-specific invalidation
   - ConfigurationManager cascade clears these

3. **CacheService** (Google Apps Script cache)
   - 60-minute TTL
   - Persists across executions
   - Shared across all users

**Cache Cascade**:
```javascript
// Invalidating a key cascades through all layers
ConfigurationManager.invalidate('brief.profiles');
// 1. Clears ConfigurationManager in-memory cache
// 2. Calls SheetConfigLoader.invalidate('briefProfiles')
// 3. SheetConfigLoader clears CacheService entry
```

**Manual Cache Control**:
```javascript
// Clear specific config (all layers)
ConfigurationManager.invalidate('brief.profiles');

// Clear all configs (all layers)
ConfigurationManager.invalidate();

// Clear CacheService directly (rare)
CacheService.getScriptCache().remove('sheet_config_briefProfiles_v1.0');
```

---

### Property Key Conversion

**Automatic Conversion**:

ConfigurationManager converts dotted keys to Script Properties format:

| ConfigurationManager Key | Script Property Key |
|--------------------------|---------------------|
| `properties.openai.apiKey` | `OPENAI_API_KEY` |
| `properties.xero.clientId` | `XERO_CLIENT_ID` |
| `properties.xero.clientSecret` | `XERO_CLIENT_SECRET` |
| `properties.my.custom.key` | `MY_CUSTOM_KEY` |

**Conversion Logic**:
```javascript
// PropertiesLoader.js parsePropertyKey_() function
'openai.apiKey' → split('.') → ['openai', 'apiKey']
→ camelCase to UPPER_SNAKE_CASE → ['OPENAI', 'API_KEY']
→ join('_') → 'OPENAI_API_KEY'
```

**Adding Custom Properties**:
```javascript
// 1. Add to Script Properties
// Key: MY_CUSTOM_SETTING
// Value: some-value

// 2. Access via ConfigurationManager
const value = ConfigurationManager.get('properties.my.customSetting');
// Automatically converts to MY_CUSTOM_SETTING
```

---

### Performance Optimization

**Best Practices**:

1. **Load Once, Use Many Times**
   ```javascript
   // GOOD: Load once at start
   const profiles = ConfigurationManager.get('brief.profiles');
   profiles.forEach(function(profile) {
     // Use profile multiple times
   });

   // BAD: Load in loop
   profiles.forEach(function() {
     const profiles = ConfigurationManager.get('brief.profiles'); // Wasteful
   });
   ```

2. **Batch Invalidation**
   ```javascript
   // GOOD: Invalidate all at once
   ConfigurationManager.invalidate();

   // LESS GOOD: Multiple individual invalidations
   ConfigurationManager.invalidate('brief.profiles');
   ConfigurationManager.invalidate('scope.phases');
   ConfigurationManager.invalidate('cost.feePercentages');
   ```

3. **Check Before Loading**
   ```javascript
   // Guard pattern for optional configs
   if (ConfigurationManager.has('cost.customRules')) {
     const rules = ConfigurationManager.get('cost.customRules');
     // Use rules
   }
   ```

4. **Avoid Unnecessary Invalidation**
   - Only invalidate when config actually changes
   - Don't invalidate in hot loops
   - Cache expires automatically after 60 minutes

---

### Security Best Practices

**Script Properties Security**:

1. ✅ **DO**: Use Script Properties for secrets
2. ✅ **DO**: Use descriptive key names
3. ✅ **DO**: Document what each property is for
4. ❌ **DON'T**: Put secrets in sheets
5. ❌ **DON'T**: Put secrets in code
6. ❌ **DON'T**: Log full property values

**Example - Secure API Key Logging**:
```javascript
// GOOD: Log only prefix
const key = ConfigurationManager.get('properties.openai.apiKey');
Logger.log('API key prefix:', key.substring(0, 10));

// BAD: Log full key
Logger.log('API key:', key); // ⚠️ Security risk!
```

**Property Access Control**:
- Only project **editors** can view/modify Script Properties
- **Viewers** cannot see Script Properties
- Consider using separate projects for dev/prod environments

---

### Migration Guide

**From Old Configuration Systems**:

**Old: ConfigLoader**
```javascript
// OLD
const profiles = ConfigLoader.loadBriefProfiles();
const phases = ConfigLoader.loadScopePhases();
```

**New: ConfigurationManager**
```javascript
// NEW
const profiles = ConfigurationManager.get('brief.profiles');
const phases = ConfigurationManager.get('scope.phases');
```

**Old: CostCalculationConfig**
```javascript
// OLD
const fee = CostCalculationConfig.FEE_PERCENTAGES.standard;
const markup = CostCalculationConfig.getMarkupRules('crew');
```

**New: ConfigurationManager**
```javascript
// NEW
const fees = ConfigurationManager.get('cost.feePercentages');
const fee = fees.standard;

const markupRules = ConfigurationManager.get('cost.markupRules');
const markup = markupRules.crew;
```

**Old: PropertiesCache**
```javascript
// OLD
const apiKey = getCachedProperty('OPENAI_API_KEY');
```

**New: ConfigurationManager**
```javascript
// NEW
const apiKey = ConfigurationManager.get('properties.openai.apiKey');
```

---

## Configuration Workflow Diagram

```
User Request
     ↓
ConfigurationManager.get("brief.profiles")
     ↓
Parse key: category="brief", type="profiles"
     ↓
Determine loader: SheetConfigLoader
     ↓
Check ConfigurationManager cache
     ↓
     ├─ Cache hit → Return cached data (instant)
     ↓
     └─ Cache miss → Delegate to loader
                         ↓
                    SheetConfigLoader.load('briefProfiles')
                         ↓
                    Check CacheService cache
                         ↓
                         ├─ Cache hit (< 60 min) → Return cached
                         ↓
                         └─ Cache miss → Load from sheet
                                           ↓
                                      Read "Config: Brief Profiles" sheet
                                           ↓
                                      Validate headers
                                           ↓
                                      Build column map
                                           ↓
                                      Parse rows into objects
                                           ↓
                                      Validate with ConfigValidator
                                           ↓
                                      Store in CacheService (60 min TTL)
                                           ↓
                                      Return data
                                           ↓
                                      ConfigurationManager caches result
                                           ↓
                                      Return to caller
```

---

## Summary

### Key Takeaways

1. **Three configuration sources**: Script Properties (secrets), Google Sheets (business data), Business Rules (code constants)

2. **ConfigurationManager is central**: All configuration access goes through `ConfigurationManager.get()`

3. **Caching is multi-layered**: ConfigurationManager → Loader → CacheService (60 min TTL)

4. **Changes take effect differently**:
   - **Sheets**: Immediate (after cache expires)
   - **Properties**: Immediate (after invalidation)
   - **Code**: After file save

5. **Invalidation cascades**: `ConfigurationManager.invalidate()` clears all cache layers

6. **Validation happens automatically**: Business rules validated on load, warnings logged

7. **Security matters**: Use Script Properties for secrets, never log sensitive values

### Quick Command Reference

```javascript
// Get configuration
const config = ConfigurationManager.get('brief.profiles');

// Check if exists
const exists = ConfigurationManager.has('brief.profiles');

// Invalidate cache
ConfigurationManager.invalidate('brief.profiles'); // Specific
ConfigurationManager.invalidate(); // All

// Validate all
const report = ConfigurationManager.validateAll();

// Get errors only
const errors = ConfigurationManager.getValidationErrors();
```

---

**Document Version**: 1.0.0
**Last Updated**: 2026-01-12
**System**: Fresh Cost Proposal
**Module**: Configuration System

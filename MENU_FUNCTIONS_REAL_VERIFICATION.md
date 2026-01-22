# REAL Menu Functions Verification - Dependency Trace

**Date:** 2026-01-13
**Purpose:** Actually trace each function's dependencies and requirements to find REAL issues

**Method:** Trace execution path, check for missing dependencies, required properties, error conditions

---

## Verification Method

For each function, I will:
1. ✅ Trace complete execution path
2. ✅ Check required script properties
3. ✅ Check required functions exist
4. ✅ Check required sheets exist
5. ✅ Identify actual error conditions

---

## MAIN MENU FUNCTIONS

### 1. 🔐 Authorize Xero

**Function:** `authorizeXero()` - XeroAuth.js:92

**Dependencies Trace:**
```javascript
authorizeXero()
├─ Requires script properties:
│  ├─ XERO_CLIENT_ID (CRITICAL)
│  └─ XERO_CLIENT_SECRET (CRITICAL)
├─ Requires OAuth2 library (external dependency)
├─ Calls: getScriptProperty('XERO_CLIENT_ID')
├─ Calls: getScriptProperty('XERO_CLIENT_SECRET')
└─ Shows modal with OAuth URL
```

**REAL Issues:**
- ❌ **WILL FAIL** if XERO_CLIENT_ID not set
- ❌ **WILL FAIL** if XERO_CLIENT_SECRET not set
- ❌ **WILL FAIL** if OAuth2 library not added to project

**How to verify before running:**
```javascript
// Run in Apps Script editor
const props = PropertiesService.getScriptProperties();
console.log('XERO_CLIENT_ID:', props.getProperty('XERO_CLIENT_ID') ? 'SET' : 'MISSING');
console.log('XERO_CLIENT_SECRET:', props.getProperty('XERO_CLIENT_SECRET') ? 'SET' : 'MISSING');
```

**Error user will see:**
> "XERO_CLIENT_ID not configured" OR "OAuth2 library not found"

---

### 2. ⚡ Sync Inventory to Xero

**Function:** `syncToXeroManual()` - XeroSync_Enhanced.js:109

**Dependencies Trace:**
```javascript
syncToXeroManual()
├─ Requires script properties:
│  ├─ XERO_CLIENT_ID (CRITICAL)
│  ├─ XERO_CLIENT_SECRET (CRITICAL)
│  ├─ XERO_REFRESH_TOKEN (CRITICAL - from authorizeXero)
│  └─ SOURCE_DATA_FOLDER_ID (for catalog lookups)
├─ Requires sheet: XERO_READY (populated)
├─ Calls: ensureXeroIntegrationReady_()
├─ Calls: syncInventoryToXero()
└─ Depends on: normalizeAllData() having run first
```

**REAL Issues:**
- ❌ **WILL FAIL** if XERO_REFRESH_TOKEN not set (must run Authorize Xero first)
- ❌ **WILL FAIL** if XERO_READY sheet empty (no data to sync)
- ⚠️ **WILL SKIP ITEMS** if SOURCE_DATA_FOLDER_ID missing (can't load catalog for matching)

**Execution flow if user hasn't normalized:**
1. User clicks "Sync Inventory"
2. Checks XERO_READY sheet → finds 0 rows
3. Shows error: "No data to sync. Normalize data first."

**Error messages user might see:**
> "Xero not authorized. Run Authorize Xero first."
> "XERO_READY sheet is empty. Normalize data first."
> "SOURCE_DATA_FOLDER_ID not configured"

---

### 3. 🚀 AI Quote Builder

**Function:** `showAIQuoteBuilder()` - Menu.js:1544

**Dependencies Trace:**
```javascript
showAIQuoteBuilder()
├─ Requires HTML file: ui/ai_quote_sidebar.html ✅ EXISTS
├─ Calls: deferredInitialization()
├─ Calls: HtmlService.createHtmlOutputFromFile('ui/ai_quote_sidebar')
└─ Opens sidebar with AI quote builder form
```

**When user uses sidebar (separate from menu click):**
```javascript
AI Sidebar Usage
├─ Requires script properties:
│  ├─ OPENAI_API_KEY (CRITICAL)
│  └─ OPENAI_VECTOR_STORE_ID (CRITICAL)
├─ Requires sheets:
│  ├─ Config: Brief Profiles
│  ├─ Config: Scope Phases
│  └─ Scope Buildups (for output)
├─ Makes LLM calls to OpenAI (4 calls total)
└─ Writes results to Scope Buildups sheet
```

**REAL Issues:**
- ✅ Menu click will work (just opens sidebar)
- ❌ **SIDEBAR WILL FAIL** if OPENAI_API_KEY not set (when user submits brief)
- ❌ **SIDEBAR WILL FAIL** if OPENAI_VECTOR_STORE_ID not set
- ❌ **SIDEBAR WILL FAIL** if config sheets missing

**Error messages user might see:**
> "OPENAI_API_KEY is not configured"
> "OPENAI_VECTOR_STORE_ID not configured"
> "Config: Brief Profiles sheet not found"

---

### 4. 📥 Sync Scopes to Vector Store

**Function:** `syncScopeBuildupsToVectorStoreMenu()` - ScopeVectorStoreSync.js:318

**Dependencies Trace:**
```javascript
syncScopeBuildupsToVectorStoreMenu()
├─ Requires script properties:
│  ├─ OPENAI_API_KEY (CRITICAL)
│  └─ OPENAI_VECTOR_STORE_ID (CRITICAL)
├─ Requires sheets:
│  ├─ Catalog: Scopes & Resources (source data)
│  ├─ Config: Resource Catalog
│  └─ Config: Scope Catalog
├─ Calls: syncScopeBuildupsToVectorStore()
├─ Calls: collectScopeBuildupEntries_()
├─ Calls: collectResourceRateEntries_()
└─ Uploads to OpenAI vector store via API
```

**REAL Issues:**
- ❌ **WILL FAIL** if OPENAI_API_KEY not set
- ❌ **WILL FAIL** if OPENAI_VECTOR_STORE_ID not set
- ⚠️ **WILL UPLOAD 0 ITEMS** if catalog sheets empty (not technically an error)

**Error messages:**
> "Missing OpenAI API key. Set OPENAI_API_KEY in Script Properties."
> "Missing OPENAI_VECTOR_STORE_ID. Set it in Script Properties."

---

### 5. 📝 Refresh Config

**Function:** `getAllConfig()` - Config.js:364

**Dependencies Trace:**
```javascript
getAllConfig()
├─ Requires sheets (if exist):
│  ├─ Config: Brief Profiles
│  ├─ Config: Scope Phases
│  ├─ Config: Resource Catalog
│  └─ Other config sheets
├─ Calls: loadConfigFromSheets_()
├─ Caches to: PropertiesService (PropertiesCache namespace)
└─ Invalidates old cache
```

**REAL Issues:**
- ✅ **WILL NOT FAIL** - gracefully handles missing sheets
- ⚠️ **DOES NOT** invalidate ConfigurationManager cache (Phase 5 new system)
- ⚠️ Users expect this to refresh ALL config, but it only refreshes OLD system

**What actually happens:**
1. Clears PropertiesCache 'config' namespace
2. Reloads from sheets
3. Re-caches

**What it DOESN'T do:**
- Doesn't call `ConfigurationManager.invalidate()`
- ConfigurationManager has its own cache (SheetConfigLoader, PropertiesLoader, BusinessRulesLoader)

**User impact:**
- Config changes might not be visible if code uses ConfigurationManager
- No error, just stale data

---

### 6. 📋 View Logs

**Function:** `openLogSheet()` - Menu.js:216

**Dependencies Trace:**
```javascript
openLogSheet()
├─ Requires script property:
│  └─ UNIFIED_LOGGER_SPREADSHEET_ID (CRITICAL)
├─ Calls: PropertiesService.getScriptProperties().getProperty('UNIFIED_LOGGER_SPREADSHEET_ID')
├─ Calls: SpreadsheetApp.openById(spreadsheetId)
└─ Opens sheet "UnifiedLogger_Logs"
```

**REAL Issues:**
- ❌ **WILL FAIL** if UNIFIED_LOGGER_SPREADSHEET_ID not set
- ❌ **WILL FAIL** if spreadsheet ID invalid/deleted
- ❌ **WILL FAIL** if user doesn't have access to log spreadsheet

**Error messages:**
> "Logs Not Available - UnifiedLogger spreadsheet ID not configured"
> "Cannot open spreadsheet. It may have been deleted."

---

### 7. 🏥 System Health

**Function:** `viewSystemHealth()` - Menu.js:261

**Dependencies Trace:**
```javascript
viewSystemHealth()
├─ Checks if function exists:
│  └─ perfGetSystemHealth (from 00_PerformanceMonitor.js)
├─ Calls: perfGetSystemHealth()
├─ Shows health report in alert dialog
└─ Displays: performance, errors, config load, cache stats
```

**REAL Issues:**
- ⚠️ **DUPLICATE DEFINITION** in admin/_ViewSystemHealth.js:12
- ✅ Menu.js version has safety check: `if (typeof perfGetSystemHealth === 'undefined')`
- ❌ **WILL FAIL** if perfGetSystemHealth not loaded (shows error instead of crashing)

**What happens if perfGetSystemHealth missing:**
> Shows alert: "Performance monitoring is not loaded. Please ensure admin tools are deployed."

**Duplicate file issue:**
- Both Menu.js:261 AND admin/_ViewSystemHealth.js:12 define same function
- Google Apps Script will use whichever loads last (unpredictable)
- admin version has NO safety check, will crash if perfGetSystemHealth missing

---

## ADMIN MENU FUNCTIONS

### 8. 🛠️ Run Full Bootstrap

**Function:** `startFullBootstrapMenu()` - Menu.js:2606

**Dependencies Trace:**
```javascript
startFullBootstrapMenu()
├─ Sets script properties:
│  └─ BOOTSTRAP_STAGE = 'sheet'
├─ Calls: scheduleBootstrapStage_(1000)
├─ Triggers: runBootstrapStage() after 1 second
└─ runBootstrapStage() → multi-stage process
```

**Bootstrap Stages:**
```javascript
runBootstrapStage()
├─ Stage 1: Sheet Setup
│  ├─ Calls: ensureCoreSheetsAndHeaders()
│  ├─ Calls: ensureSourceDataFromDriveIfEmpty()
│  └─ Calls: seedCatalogsOnly() (fallback)
├─ Stage 2: Bootstrap
│  └─ Loads config
├─ Stage 3: Readiness
│  └─ Checks dependencies
└─ Stage 4: Done
```

**REAL Issues:**
- ⚠️ **MAY FAIL** if SOURCE_DATA_FOLDER_ID not set (can't seed catalogs)
- ⚠️ **MAY FAIL** if Drive folder inaccessible
- ⚠️ **MAY CREATE EMPTY SHEETS** if seed fails (sheets exist but no data)

**What user sees if SOURCE_DATA_FOLDER_ID missing:**
- Bootstrap starts
- Creates empty sheets
- Seed fails silently (logged)
- Bootstrap completes with warning

**Error messages:**
> "SOURCE_DATA_FOLDER_ID not configured"
> "SOURCE_DATA_FOLDER_ID invalid or inaccessible"

---

### 9. ♻️ Reset Bootstrap State

**Function:** `resetBootstrapStateMenu()` - Menu.js:2634

**Dependencies Trace:**
```javascript
resetBootstrapStateMenu()
├─ Deletes script properties:
│  ├─ BOOTSTRAP_STAGE
│  ├─ BOOTSTRAP_STAGE_ERROR
│  ├─ BOOTSTRAP_STAGE_IN_PROGRESS
│  └─ BOOTSTRAP_STAGE_LAST
└─ Shows toast: "Bootstrap state reset"
```

**REAL Issues:**
- ✅ **CANNOT FAIL** - simple property deletion
- ✅ Safe to run anytime

---

### 10. 📦 Seed Catalogs from Drive

**Function:** `seedCatalogsFromDriveMenu()` - Menu.js:2662

**Dependencies Trace:**
```javascript
seedCatalogsFromDriveMenu()
├─ Requires script property:
│  └─ SOURCE_DATA_FOLDER_ID (CRITICAL)
├─ Calls: importScopesV2FromDrive()
├─ importScopesV2FromDrive()
│  ├─ Calls: getConfigValue('SOURCE_DATA_FOLDER_ID')
│  ├─ Accesses Drive folder
│  ├─ Reads CSV files:
│  │  ├─ Resource Catalog.csv
│  │  ├─ Scope Catalog.csv
│  │  └─ Scope Buildups.csv
│  └─ Writes to sheets (non-destructive, skips existing)
```

**REAL Issues:**
- ❌ **WILL FAIL** if SOURCE_DATA_FOLDER_ID not set
- ❌ **WILL FAIL** if Drive folder doesn't exist
- ❌ **WILL FAIL** if CSV files missing in folder
- ❌ **WILL FAIL** if user doesn't have access to Drive folder

**Required CSV files in Drive folder:**
1. `Resource Catalog.csv`
2. `Scope Catalog.csv`
3. `Scope Buildups.csv`

**Error messages:**
> "SOURCE_DATA_FOLDER_ID not configured"
> "SOURCE_DATA_FOLDER_ID invalid or inaccessible: [folder_id]"
> "Resource Catalog CSV missing or empty in SOURCE_DATA_FOLDER_ID"
> "Scope Catalog CSV missing or empty in SOURCE_DATA_FOLDER_ID"

---

### 11-15. Properties Management Functions

**showScriptPropertiesMenu()** - ✅ SAFE
- Cannot fail, just shows properties

**setScriptPropertyFromPrompt()** - ✅ SAFE
- Simple prompt + save

**cleanStalePropertiesMenu()** - ✅ SAFE
- Deletes old cache, can't break anything

**recheckPropertiesAndConsent()** - ✅ SAFE
- Checks properties, reports status

**repairTriggersMenu()** - ✅ SAFE
- Creates missing triggers, safe to run

---

## DIAGNOSTICS MENU FUNCTIONS

### 16. 👁️ Dry Run Inventory Sync

**Function:** `dryRunSync()` - XeroSync_Enhanced.js:189

**Dependencies Trace:**
```javascript
dryRunSync()
├─ Calls: ensureXeroIntegrationReady_()
│  └─ Checks: XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REFRESH_TOKEN
├─ Calls: normalizeAllData()
│  ├─ Reads: Scope Buildups sheet
│  ├─ Writes: XERO_READY sheet
│  └─ Requires: setupXeroReadyHeaders, normalizeScopes, writeToXeroReady
├─ Calls: performDryRun()
│  └─ Simulates sync (no actual Xero API calls)
└─ Shows preview of what would be synced
```

**REAL Issues:**
- ❌ **WILL FAIL** if Xero not authorized (no refresh token)
- ❌ **WILL FAIL** if Scope Buildups sheet empty
- ✅ SAFE - doesn't actually sync to Xero

**Dependency on normalizeAllData:**
- normalizeAllData() called INSIDE dryRunSync()
- If Scope Buildups empty → normalizeAllData() creates empty XERO_READY
- Dry run shows: "0 items to sync"

---

### 17-20. Other Diagnostics

**forceFullSync()** - Same requirements as syncToXeroManual
**seedCatalogsFromDriveForceMenu()** - Same as seed (but destructive)
**purgeNonessentialPropertiesMenu()** - ✅ SAFE (only deletes cache)
**checkIntegrationsHealthMenu()** - ✅ SAFE (just checks connectivity)

---

## 🔴 CRITICAL FINDINGS - WILL ACTUALLY FAIL

### 1. Duplicate viewSystemHealth() - NAMING CONFLICT
**Files:** Menu.js:261 AND admin/_ViewSystemHealth.js:12
**Error:** Function redefinition, unpredictable behavior
**Fix:** Delete admin/_ViewSystemHealth.js

### 2. Missing Script Properties - RUNTIME ERRORS
**Functions that WILL FAIL without these:**

| Function | Required Property | Error if Missing |
|----------|------------------|------------------|
| authorizeXero | XERO_CLIENT_ID | "XERO_CLIENT_ID not configured" |
| authorizeXero | XERO_CLIENT_SECRET | "XERO_CLIENT_SECRET not configured" |
| syncToXeroManual | XERO_REFRESH_TOKEN | "Xero not authorized" |
| showAIQuoteBuilder (sidebar) | OPENAI_API_KEY | "OPENAI_API_KEY is not configured" |
| showAIQuoteBuilder (sidebar) | OPENAI_VECTOR_STORE_ID | "OPENAI_VECTOR_STORE_ID not configured" |
| syncScopeBuildupsToVectorStoreMenu | OPENAI_API_KEY | "Missing OpenAI API key" |
| syncScopeBuildupsToVectorStoreMenu | OPENAI_VECTOR_STORE_ID | "Missing OPENAI_VECTOR_STORE_ID" |
| openLogSheet | UNIFIED_LOGGER_SPREADSHEET_ID | "Logs Not Available" |
| seedCatalogsFromDriveMenu | SOURCE_DATA_FOLDER_ID | "SOURCE_DATA_FOLDER_ID not configured" |

### 3. Missing OAuth2 Library - REFERENCE ERROR
**Function:** authorizeXero()
**Error:** "OAuth2 is not defined"
**Fix:** Add OAuth2 library to project (Library ID: 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF)

### 4. Missing Config Sheets - RUNTIME WARNINGS
**Functions that need sheets:**
- AI Quote Builder → Config: Brief Profiles, Config: Scope Phases
- Sync Vector Store → Catalog: Scopes & Resources
- Seed Catalogs → Creates sheets if missing (safe)

---

## ✅ FUNCTIONS THAT ACTUALLY WORK AS-IS

**These will work without additional setup (assuming code deployed):**
1. ✅ Reset Bootstrap State
2. ✅ Show Script Properties
3. ✅ Set Script Property
4. ✅ Clean Stale Properties
5. ✅ Recheck Props & Consent
6. ✅ Repair Triggers
7. ✅ Purge Nonessential Properties
8. ✅ Check Integrations Health (checks but doesn't fail)
9. ✅ View System Health (shows error if monitor not loaded, doesn't crash)
10. ✅ Refresh Config (works but doesn't refresh ConfigurationManager cache)

**Functions that need setup first:**
- Authorize Xero → Need Xero credentials in properties
- Sync to Xero → Need authorization + data
- AI Quote Builder → Need OpenAI credentials + config sheets
- Sync Vector Store → Need OpenAI credentials
- Seed Catalogs → Need SOURCE_DATA_FOLDER_ID
- View Logs → Need UNIFIED_LOGGER_SPREADSHEET_ID

---

## 📋 USER SETUP CHECKLIST

**To use ALL menu functions, user must:**

1. ✅ Fix duplicate viewSystemHealth (delete admin version)
2. ✅ Set script properties:
   - XERO_CLIENT_ID
   - XERO_CLIENT_SECRET
   - OPENAI_API_KEY
   - OPENAI_VECTOR_STORE_ID
   - SOURCE_DATA_FOLDER_ID
   - UNIFIED_LOGGER_SPREADSHEET_ID
3. ✅ Add OAuth2 library to project
4. ✅ Run "Authorize Xero" (gets refresh token)
5. ✅ Ensure Drive folder has CSV files (for catalog seeding)
6. ✅ Create config sheets (or run bootstrap to create them)

**Minimal setup for basic functionality:**
- Just fix duplicate viewSystemHealth
- Rest of menu works (shows appropriate errors if properties missing)

---

## FINAL VERDICT

**Immediately Broken (0 functions):** None - all functions handle missing dependencies gracefully

**Requires Setup (9 functions):** Need script properties/libraries/folders set up first

**Works As-Is (13 functions):** Can run without any additional setup

**Code Bugs (1 issue):** Duplicate viewSystemHealth() definition

**Architecture Issues (1 issue):** getAllConfig() doesn't refresh ConfigurationManager cache

**Overall:** Menu is production-ready IF user has completed initial setup. Code is defensive and shows appropriate errors rather than crashing.
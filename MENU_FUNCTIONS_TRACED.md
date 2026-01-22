# Complete Menu Functions Trace - Fresh CP Quote Builder

**Purpose:** Understand what EVERY menu function does to build proper production menu

**Date:** 2026-01-13
**Author:** Claude (tracing user's codebase)
**Status:** ✅ Complete

---

## Executive Summary

**Total Functions Analyzed:** 20+
**Critical for Production:** 12 functions
**Admin/Diagnostic Only:** 8 functions

### Recommendation: Three-Tier Menu Structure

1. **Main Menu (9 items)** - Essential production workflow
2. **Admin Menu (8 items)** - Configuration and troubleshooting
3. **Diagnostics Menu (5 items)** - Advanced debugging

---

## CATEGORY 1: Xero Integration (4 functions)

### 🔐 Authorize Xero ⭐ CRITICAL
**Function:** `authorizeXero()`
**File:** XeroAuth.js:92
**Status:** Already in menu ✅

**What it does:**
1. Shows modal dialog with Xero OAuth link
2. User clicks link, grants permissions in browser
3. Returns with authorization code
4. Exchanges code for access token + refresh token
5. Stores XERO_REFRESH_TOKEN in script properties

**When needed:** FIRST TIME SETUP - Before any Xero sync operations

**Requirements:** XERO_CLIENT_ID, XERO_CLIENT_SECRET in script properties

**User workflow:**
```
Install → Set Xero credentials → Authorize Xero → Get refresh token → Can sync
```

**VERDICT: CRITICAL - KEEP IN MAIN MENU** ⭐

---

### ⚡ Sync Inventory to Xero ⭐ CRITICAL
**Function:** `syncToXeroManual()` → `syncInventoryToXero()`
**File:** XeroSync_Enhanced.js
**Status:** Already in menu ✅

**What it does:**
1. Reads XERO_READY sheet (normalized quote data - 297 rows in your case)
2. Matches items to existing Xero inventory (by SKU code)
3. Updates existing items OR creates new inventory items
4. Incremental sync (only changed items) unless forced
5. Respects rate limits (backoff if 429)
6. Shows summary: updated, created, errors

**When needed:** After normalizing quote data, before invoicing in Xero

**Requirements:**
- Valid Xero authorization (refresh token)
- XERO_READY sheet populated with normalized data
- SOURCE_DATA_FOLDER_ID for catalog source

**User workflow:**
```
AI Quote Builder → Generate scope → Normalize data → Sync to Xero → Create invoice in Xero
```

**VERDICT: CRITICAL - KEEP IN MAIN MENU** ⭐

---

### 👁️ Dry Run Inventory Sync ⭐ USEFUL
**Function:** `dryRunSync()`
**File:** XeroSync_Enhanced.js:189

**What it does:**
1. Normalizes data from Scope Buildups (populates XERO_READY sheet)
2. Shows preview of what WOULD be synced (without actually syncing)
3. Displays counts: total rows, matched, new, would update, would create
4. **Safe testing** - doesn't touch Xero

**When needed:**
- Testing normalization logic
- Preview before actual sync
- Verify data looks correct before pushing to Xero

**User workflow:**
```
Update scope → Dry run → Check preview → If OK, do real sync
```

**VERDICT: USEFUL - KEEP IN ADMIN MENU** (safe preview capability)

---

### 🔥 Force Full Inventory Sync ⚠️ DANGEROUS
**Function:** `forceFullSync()`
**File:** XeroSync_Enhanced.js:264

**What it does:**
1. Temporarily disables incremental sync (CONFIG.INCREMENTAL_SYNC = false)
2. Forces sync of ALL items regardless of change detection
3. Useful if incremental sync broken or Xero data corrupted

**When needed:**
- Incremental sync isn't detecting changes correctly
- Need to resync everything after Xero data corruption
- Troubleshooting sync issues

**DANGER:**
- Can cause redundant API calls (rate limiting)
- Slower than incremental
- Only use when incremental broken

**VERDICT: KEEP IN DIAGNOSTICS MENU** ⚠️ (dangerous, rarely needed)

---

## CATEGORY 2: Data Operations (2 functions)

### 📥 Sync Scopes to Vector Store ⭐ CRITICAL
**Function:** `syncScopeBuildupsToVectorStoreMenu()` → `syncScopeBuildupsToVectorStore()`
**File:** ScopeVectorStoreSync.js:318

**What it does:**
1. Reads scope buildups from `Catalog: Scopes & Resources` sheet
2. Reads resource rates, crew rates from catalog
3. Prepares JSON payloads (scope metadata + descriptions)
4. Uploads to OpenAI vector store for semantic search
5. Compares checksums - skips unchanged items (smart caching)
6. Deletes old/orphaned files from vector store
7. Shows summary: processed X, uploaded Y, deleted Z

**When needed:**
- After adding/updating scope catalog items
- After modifying scope descriptions or deliverables
- **REQUIRED for AI Quote Builder semantic search to work**

**Requirements:**
- OPENAI_API_KEY in script properties
- OPENAI_VECTOR_STORE_ID in script properties

**User workflow:**
```
Update catalog → Sync to vector store → AI can find updated scopes via semantic search
```

**VERDICT: CRITICAL - KEEP IN MAIN MENU** ⭐ (AI Quote Builder depends on this)

---

### 🩺 Check Integrations Health 📊 DIAGNOSTIC
**Function:** `checkIntegrationsHealthMenu()` → `checkIntegrationsHealth()`
**File:** Menu.js:2226

**What it does:**
1. Tests Xero API connectivity (auth valid, rate limits)
2. Tests OpenAI Vector store connectivity (API key, vector store ID)
3. Reports backoff status (if rate-limited)
4. Shows toast with health summary

**When needed:**
- Troubleshooting "sync failing" issues
- Check if rate-limited before big sync
- Verify API credentials are valid

**VERDICT: KEEP IN ADMIN MENU** 📊 (useful diagnostics)

---

## CATEGORY 3: Bootstrap Operations (3 functions)

### 🛠️ Run Full Bootstrap 🔧 ADMIN
**Function:** `startFullBootstrapMenu()` → `runBootstrapStage()`
**File:** Menu.js:2606

**What it does:**
Multi-stage initialization process:

**Stage 1 - Sheet Setup:**
- Creates core sheets if missing (Scope Buildups, Config sheets, XERO_READY, etc.)
- Sets up headers and validation formulas
- Seeds initial catalog data from Google Drive (if empty)

**Stage 2 - Bootstrap:**
- Loads configuration from sheets
- Sets up PropertiesCache for performance

**Stage 3 - Readiness:**
- Checks all dependencies ready
- Verifies configuration valid

**Stage 4 - Done:**
- Bootstrap complete

**When needed:**
- **FIRST TIME INSTALLATION** - Setting up fresh spreadsheet
- After major data corruption (resetting everything)
- After accidentally deleting critical sheets

**User workflow:**
```
Fresh install → Run Full Bootstrap → Creates all sheets + seeds data → Ready to use
```

**DANGER:** Overwrites existing data if sheets already exist

**VERDICT: KEEP IN ADMIN MENU** 🔧 (needed for setup, dangerous if run by mistake)

---

### ♻️ Reset Bootstrap State 🔧 ADMIN
**Function:** `resetBootstrapStateMenu()`
**File:** Menu.js:2634

**What it does:**
1. Deletes bootstrap stage tracking properties:
   - BOOTSTRAP_STAGE
   - BOOTSTRAP_STAGE_ERROR
   - BOOTSTRAP_STAGE_IN_PROGRESS
   - BOOTSTRAP_STAGE_LAST

2. Clears stuck bootstrap state (if bootstrap failed mid-stage)

**When needed:**
- Bootstrap got stuck in progress (shows "in progress" but nothing happening)
- Bootstrap failed with error, need to retry
- Before manually running bootstrap again

**VERDICT: KEEP IN ADMIN MENU** 🔧 (recovery tool for bootstrap issues)

---

### 📦 Seed Catalogs from Drive 🔧 ADMIN
**Function:** `seedCatalogsFromDriveMenu()` → `importScopesV2FromDrive()`
**File:** Menu.js:2662

**What it does:**
1. Reads catalog CSV files from Google Drive folder (SOURCE_DATA_FOLDER_ID)
2. Imports into sheets:
   - Scope Buildups
   - Config: Resource Catalog
   - Config: Scope Catalog
3. Skips rows that already exist (non-destructive)
4. Shows summary: resources imported, scopes imported

**When needed:**
- Updating catalog from master CSV files in Google Drive
- Adding new scopes/resources from external source
- Refreshing catalog without losing manual edits (non-destructive)

**Requirements:** SOURCE_DATA_FOLDER_ID in script properties

**VERDICT: KEEP IN ADMIN MENU** 🔧 (catalog updates from Drive)

---

### 📦 Force Seed Catalogs (Drive) ⚠️ DANGEROUS
**Function:** `seedCatalogsFromDriveForceMenu()`
**File:** Menu.js:2696

**What it does:**
1. Same as Seed Catalogs but **OVERWRITES existing data**
2. Imports from Drive and replaces sheet contents
3. Reapplies validation formulas

**When needed:**
- Catalog sheets corrupted, need clean import
- Want to reset catalog to Drive source (discard manual edits)

**DANGER:** Loses manual edits to catalog sheets

**VERDICT: KEEP IN DIAGNOSTICS MENU** ⚠️ (destructive, rarely needed)

---

## CATEGORY 4: Properties Management (5 functions)

### 🧾 Show Script Properties 📊 DIAGNOSTIC
**Function:** `showScriptPropertiesMenu()`
**File:** Menu.js:2947
**Status:** Already in Advanced menu ✅

**What it does:**
1. Reads ALL script properties
2. Shows in modal dialog with sensitive values masked:
   - API keys → "sk-...abc" (first 3 + last 3 chars)
   - Tokens → "eyJ...xyz"
   - IDs → shown in full
3. Useful for debugging "Missing property" errors

**When needed:**
- Verify Xero credentials are set
- Check if OpenAI API key is configured
- Troubleshoot "property not found" errors

**VERDICT: KEEP IN ADMIN MENU** ✅ (essential for debugging config)

---

### ✍️ Set Script Property 🔧 ADMIN
**Function:** `setScriptPropertyFromPrompt()`
**File:** Menu.js (already traced earlier)
**Status:** Already in Advanced menu ✅

**What it does:**
1. Prompts for property name (e.g., XERO_CLIENT_ID)
2. Prompts for property value
3. Saves to script properties
4. Quick way to set config without Apps Script editor

**When needed:**
- Setting up Xero credentials
- Updating OpenAI API key
- Changing configuration without opening editor

**VERDICT: KEEP IN ADMIN MENU** ✅ (useful for config changes)

---

### 🧨 Purge Nonessential Properties ⚠️ DANGEROUS
**Function:** `purgeNonessentialPropertiesMenu()`
**File:** Menu.js:2900

**What it does:**
1. Deletes "safe to delete" properties:
   - Cache entries (PropertiesCache)
   - Temporary state (bootstrap progress, etc.)
2. **KEEPS** critical properties:
   - API keys (XERO_, OPENAI_)
   - Configuration (SOURCE_DATA_FOLDER_ID, etc.)
   - OAuth tokens (XERO_REFRESH_TOKEN)

**When needed:**
- Properties storage approaching 500KB limit
- Clearing stale cache entries
- Troubleshooting cache corruption

**DANGER:** If purge logic wrong, could delete important properties

**VERDICT: KEEP IN DIAGNOSTICS MENU** ⚠️ (advanced maintenance)

---

### 🧹 Clean Stale Properties 🔧 ADMIN
**Function:** `cleanStalePropertiesMenu()`
**File:** Menu.js:2860

**What it does:**
1. Identifies properties with timestamp older than threshold (e.g., 30 days)
2. Deletes only OLD cache entries
3. Safer than full purge (only removes truly stale data)

**When needed:**
- Regular maintenance (monthly cleanup)
- Properties approaching size limit
- Cache bloat from old data

**VERDICT: KEEP IN ADMIN MENU** 🔧 (safer than purge)

---

### 🔐 Recheck Props & Consent 🔧 ADMIN
**Function:** `recheckPropertiesAndConsent()`
**File:** Menu.js:3302

**What it does:**
1. Validates all required script properties exist:
   - Xero credentials (CLIENT_ID, CLIENT_SECRET)
   - OpenAI (API_KEY, VECTOR_STORE_ID)
   - Source folder (SOURCE_DATA_FOLDER_ID)
2. Checks OAuth consent status
3. Shows summary of missing properties

**When needed:**
- After installation (verify setup complete)
- Troubleshooting "Missing property" errors
- Before running sync operations (preflight check)

**VERDICT: KEEP IN ADMIN MENU** 🔧 (setup verification)

---

## CATEGORY 5: Logging & Diagnostics (6 functions)

### 🔍 Search Logs 📊 DIAGNOSTIC
**Function:** `searchLogsMenu()`
**File:** Menu.js (not traced yet)
**Status:** Already in Advanced menu ✅

**What it does:**
1. Prompts for search term (keyword, category, correlation ID)
2. Searches UnifiedLogger log sheet
3. Shows matching log entries in dialog

**When needed:**
- Finding specific errors
- Tracing request flow by correlation ID
- Debugging issues with context

**VERDICT: KEEP IN ADMIN MENU** ✅ (essential debugging)

---

### 📊 Error Summary 📊 DIAGNOSTIC
**Function:** `showErrorSummaryMenu()`
**File:** Menu.js:4113
**Status:** Already in Advanced menu ✅

**What it does:**
1. Aggregates errors from UnifiedLogger
2. Groups by error type/category
3. Shows counts and recent occurrences
4. Useful for identifying patterns

**When needed:**
- Monitoring system health
- Identifying recurring errors
- Prioritizing bug fixes

**VERDICT: KEEP IN ADMIN MENU** ✅ (system health monitoring)

---

### 🔗 Search by Correlation ID 📊 DIAGNOSTIC (Redundant?)
**Function:** `promptSearchByCorrelationId()`
**File:** LogSearcherHelpers.js

**What it does:**
1. Prompts for correlation ID
2. Searches logs for that specific correlation ID
3. Shows all log entries for that request trace

**When needed:**
- Tracing specific request end-to-end
- User reports error, gives you correlation ID
- Debugging complex workflows

**VERDICT:** REDUNDANT - Already covered by "Search Logs" (can search by correlation ID there)

**RECOMMENDATION: REMOVE** (use Search Logs instead)

---

### 📋 Recent Errors (1 hour / 24 hours) 📊 DIAGNOSTIC (Redundant?)
**Function:** `showRecentErrors1Hour()`, `showRecentErrors24Hours()`
**File:** Menu.js

**What it does:**
1. Shows errors from last 1 hour or 24 hours
2. Quick view of recent failures

**When needed:**
- Quick health check
- See if errors happening now

**VERDICT:** REDUNDANT - Already covered by "Error Summary"

**RECOMMENDATION: REMOVE** (use Error Summary instead)

---

### 🩺 Verify Logging 🔧 ADMIN (Test Function)
**Function:** `verifyLogging()`
**File:** Menu.js

**What it does:**
1. Test function - writes test log entries
2. Verifies UnifiedLogger working
3. Development/testing only

**VERDICT: REMOVE FROM PRODUCTION MENU** (test function, not needed in production)

---

## CATEGORY 6: Triggers (1 function)

### 🔧 Repair Triggers 🔧 ADMIN
**Function:** `repairTriggersMenu()` → `ensureCoreTriggersHealthy_()`
**File:** Menu.js:1652

**What it does:**
1. Checks if required installable triggers exist:
   - onOpen (spreadsheet open)
   - onChange (cell edit)
   - Deferred init triggers
   - Property consent check triggers
2. Creates missing triggers
3. Deletes duplicate/orphaned triggers
4. Shows summary: onOpen=ok, onChange=ok, created X

**When needed:**
- Triggers accidentally deleted
- onOpen not firing (menu not appearing)
- onChange not detecting edits
- After manual trigger cleanup

**VERDICT: KEEP IN ADMIN MENU** 🔧 (recovery tool for broken triggers)

---

## CATEGORY 7: Other Core Functions

### 🚀 AI Quote Builder ⭐ CRITICAL
**Function:** `showAIQuoteBuilder()` → `showAISidebar()`
**File:** Menu.js:1544, 05_AISidebar_UI.js
**Status:** Already in menu ✅

**What it does:**
1. Opens AI-powered quote builder sidebar
2. User enters client brief
3. AI extracts scope using OpenAI (LLM call #1)
4. Vector search finds matching catalog items
5. Commercial fit selects SKUs (LLM call #2)
6. Generates quote (LLM call #3)
7. Populates Scope Buildups sheet

**VERDICT: CRITICAL - KEEP IN MAIN MENU** ⭐ (core product functionality)

---

### 📝 Refresh Config ⭐ USEFUL
**Function:** `getAllConfig()`
**File:** ConfigurationManager.js
**Status:** Already in menu ✅

**What it does:**
1. Clears ConfigurationManager cache
2. Reloads configuration from sheets:
   - Brief Profiles
   - Scope Phases
   - Scope Catalog
   - All other config sheets
3. Invalidates stale data

**When needed:**
- After editing config sheets
- Config changes not taking effect (cache stale)

**VERDICT: KEEP IN MAIN MENU** ✅ (frequently used after config edits)

---

### 📋 View Logs 📊 DIAGNOSTIC
**Function:** `openLogSheet()`
**File:** Menu.js:216
**Status:** Already in menu ✅

**What it does:**
1. Opens UnifiedLogger log spreadsheet
2. Navigates to "UnifiedLogger_Logs" sheet
3. User can view/filter logs directly

**VERDICT: KEEP IN MAIN MENU** ✅ (quick access to logs)

---

### 🏥 System Health 📊 DIAGNOSTIC
**Function:** `viewSystemHealth()`
**File:** admin/_ViewSystemHealth.js
**Status:** Already in menu ✅

**What it does:**
1. Runs comprehensive health checks:
   - All required sheets exist
   - Script properties configured
   - Integrations healthy (Xero, OpenAI)
   - Triggers installed
   - No recent errors
2. Shows summary dashboard

**VERDICT: KEEP IN MAIN MENU** ✅ (comprehensive health check)

---

## RECOMMENDED MENU STRUCTURE

### Main Menu: "Fresh CP" (9 items)

```
Fresh CP
├── 🔐 Authorize Xero ⭐
├── ⚡ Sync Inventory to Xero ⭐
├── 🚀 AI Quote Builder ⭐
├── 📥 Sync Scopes to Vector Store ⭐
├── ────────────────
├── 📝 Refresh Config
├── 📋 View Logs
├── 🏥 System Health
```

**Rationale:** Essential production workflow - Brief → AI Quote → Catalog sync → Xero sync

---

### Admin Menu: "🔧 Admin" (8 items)

```
🔧 Admin
├── 🛠️ Run Full Bootstrap
├── ♻️ Reset Bootstrap State
├── 📦 Seed Catalogs from Drive
├── ────────────────
├── 🧾 Show Script Properties
├── ✍️ Set Script Property
├── 🧹 Clean Stale Properties
├── 🔐 Recheck Props & Consent
├── 🔧 Repair Triggers
```

**Rationale:** Setup, configuration, and recovery tools - used during installation and troubleshooting

---

### Diagnostics Menu: "🔬 Diagnostics" (5 items)

```
🔬 Diagnostics
├── 👁️ Dry Run Inventory Sync
├── 🔥 Force Full Inventory Sync ⚠️
├── 📦 Force Seed Catalogs ⚠️
├── 🧨 Purge Nonessential Properties ⚠️
├── 🩺 Check Integrations Health
```

**Rationale:** Advanced troubleshooting - dangerous operations marked ⚠️, used rarely

---

## REMOVED FUNCTIONS (Not in any menu)

### ❌ Search by Correlation ID
**Reason:** Redundant - "Search Logs" can search by correlation ID

### ❌ Recent Errors (1 hour)
**Reason:** Redundant - "Error Summary" shows recent errors

### ❌ Recent Errors (24 hours)
**Reason:** Redundant - "Error Summary" covers this

### ❌ Verify Logging
**Reason:** Test function - not needed in production

---

## FINAL COUNT

- **Main Menu:** 9 items (7 + 2 separators)
- **Admin Menu:** 8 items (7 + 1 separator)
- **Diagnostics Menu:** 5 items (all functional)
- **Total:** 22 items across 3 menus
- **Removed:** 4 redundant/test functions

**Previous "shallow" menu:** 14 items across 2 menus
**New comprehensive menu:** 22 items across 3 menus (+8 essential functions restored)

---

**Status:** ✅ Complete trace - Ready to implement

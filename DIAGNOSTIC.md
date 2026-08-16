# AI Quote Builder Pipeline — Diagnostic Report

**Date:** 2026-01-13 (verified against repo, Aug 2026)  
**Scope:** Phases 1–6 quote-builder pipeline only (not Phases 8–10)

## Executive summary

Three reported blockers were investigated in code. **Two are confirmed in-repo bugs with fixes in this PR.** The third (legacy questions in diagnostics) was **already removed from server code**; remaining question surfacing came from the **LLM prompt example** still listing a `questions` field despite a strict schema that omits it.

| Reported issue | Verdict | Root cause (in repo) |
|---|---|---|
| Scope phase config missing after brief-type select | **Confirmed** | `briefType` keys were not normalized when grouping scope phases; UI lookup is exact-key only. Separately, `SheetConfigLoader` stripped `phaseId`/`required`/hints from cached scope phases, breaking the phase scaffold. |
| Legacy questions reappearing | **Partially confirmed** | No `diagnostics.push({ message: 'Questions: …' })` remains in active extraction code. Prompt blueprint in `buildScopeDraftPrompt()` still showed `"questions": [...]`, encouraging stale behavior. |
| Empty UI after Extract Scope | **Downstream of #1** | Extraction is blocked when scope config is missing and recovery is off (`onExtractScope`). When extraction runs but canonicals are empty, phase panels stay blank even though `scopeContractPanel` can render entries. |

## Issue 1 — Scope phase config missing

### Symptom

Sidebar shows: *"Scope phase config is missing for this brief type…"* after choosing a brief type.

### Code path

1. `ui/ai_quote_sidebar.html` → `getCurrentCategoryConfig()` (`categoryConfigMap[currentBriefType]`)
2. `05_AISidebar_Config.js` → `getScopeCategoryUiData()` → `getScopeCategoryConfigMap()`
3. `ConfigurationManager.get('scope.phases')` → `SheetConfigLoader.load('scopePhases')`

### Root causes

1. **briefType key mismatch** — `getScopeCategoryConfigMap()` grouped rows using raw `phase.briefType` while brief profiles and the UI default use slug keys like `smm-retainer`. Sheet values such as `SMM Retainer` or `SMM-Retainer` produced separate map keys the UI never requested.

   - `05_AISidebar_Config.js` — `getScopeCategoryConfigMap()`, `getScopeCategoryConfig()`, `getBriefTypeProfiles()`

2. **Stripped phase fields** — `SheetConfigLoader.js` cache optimization kept only `{ briefType, label, canonical, taxonomyHintJSON }`, dropping `phaseId`, `required`, `deliverableHint`, `signalHint`, etc. The sidebar scaffold skips any phase without `phaseId || id` (`renderCategoryScaffold`), so phases looked configured in the sheet but rendered as missing.

   - `SheetConfigLoader.js` lines ~397–417 (pre-fix)
   - `ui/ai_quote_sidebar.html` — `renderCategoryScaffold()`, `validateCategoryState()`

3. **Missing `getConfigStatus()`** — Referenced throughout menu/sidebar (`Menu.js`, `ScopeMap.js`, sidebar config panel) but never implemented, so config health panels could not report accurate phase-group counts.

   - Call sites: `Menu.js`, `ScopeMap.js`, `05_AISidebar_UI_compact.js`, `ui/ai_quote_sidebar.html`

### Fix in this PR

- Normalize `briefType` when building profile and scope-phase maps (`normalizeBriefTypeKey_`).
- Resolve category config with normalized fallback in `getScopeCategoryConfig()` and sidebar `getCurrentCategoryConfig()`.
- Preserve operational scope-phase fields in `SheetConfigLoader` (only trim verbose taxonomy JSON).
- Implement `getConfigStatus()` in `05_AISidebar_Config.js`.
- Use `phase.canonical` as fallback phase id in sidebar scaffold helpers.

### Not in repo (sheet-side)

If `Config: Scope Phases` tab is missing, has header mismatches, or all `briefType` cells are blank, loading still fails regardless of code. Run `runAIQuoteBuilderPipelineDiagnostics()` in the Apps Script editor to distinguish sheet problems from code problems.

## Issue 2 — Legacy questions

### Symptom

INFO diagnostics or UI blocks showing free-form LLM "questions".

### Findings

- **Removed:** `05_AISidebar_UI.js` no longer contains `extractScopeDraft()`; the old `diagnostics.push({ message: 'Questions: …' })` block cited in `AI_QUOTE_BUILDER_PIPELINE_ISSUES.md` is not in active extraction code (`05_AISidebar_UI_compact.js` / `05_AISidebar_Extracted.js`).
- **Still present:** `buildScopeDraftPrompt()` example JSON included a `questions` array while `SCOPE_DRAFT_LLM_SCHEMA` (`05_AISidebar_Config.js`) does not allow `questions` (strict schema).
- **UI:** `renderScopeQuestions()` still renders `draft.questions` if present (`ui/ai_quote_sidebar.html`).

### Fix in this PR

- Remove `questions` from the prompt blueprint and tell the model to use warnings instead of questions (`05_AISidebar_UI_compact.js`).
- Stop passing `questions` through `normalizeScopeDraftToFinalStructure()` output (`05_AISidebar_Processing.js`).

## Issue 3 — Empty UI after extraction

### Symptom

Extract Scope appears to finish but scope panels stay empty.

### Findings

1. **Hard block before LLM call** when config is missing and recovery is disabled:

   ```3944:3950:ui/ai_quote_sidebar.html
   const categoryStatus = getCategoryConfigStatus();
   if (categoryStatus.missing) {
     if (!scopeRecoveryEnabled) {
       showError('Scope phase config is missing…');
       return;
     }
   ```

2. **Phase panel emptiness** when `getScopePhaseCanonicals()` returns `[]` (previously also caused by treating the phases array as a map — fixed in `05_AISidebar_Phase.js` by using `getScopeCategoryConfigMap()`).

3. **Contract panel** (`renderScopeContractPanel`) renders whenever `draft.scopeEntries.length > 0`; if users only watch phase inputs, it can look "empty" even when entries exist.

### Fix in this PR

Issue 1 fixes unblock extraction and restore phase canonicals/hints. No separate extraction-parser bug was found in-repo beyond the config wiring above.

## How to run diagnostics

In the Apps Script editor (bound spreadsheet):

```javascript
runAIQuoteBuilderPipelineDiagnostics();
```

Also available individually:

| Function | File |
|---|---|
| `diagnoseAIQuoteBuilderWiring()` | `admin/_DiagnoseAIQuoteBuilderWiring.js` |
| `diagnoseCategoryConfigMap()` | `admin/_DiagnoseCategoryConfigMap.js` |
| `diagnoseScopeConfigLoading()` | `admin/_DiagnoseScopeConfigLoading.js` |
| `diagnoseScopePhasesLoad()` | `admin/_DiagnoseScopePhasesLoad.js` |

After editing `Config: Scope Phases`, invalidate cache:

```javascript
SheetConfigLoader.invalidate('scopePhases');
ConfigurationManager.invalidate('scope.phases');
```

## Files changed in this PR

| File | Change |
|---|---|
| `SheetConfigLoader.js` | Preserve `phaseId`, hints, `required`, etc. when caching scope phases |
| `05_AISidebar_Config.js` | `normalizeBriefTypeKey_`, normalized grouping, `getConfigStatus()` |
| `05_AISidebar_UI_compact.js` | Remove `questions` from scope extraction prompt example |
| `05_AISidebar_Processing.js` | Drop `questions` from normalized draft output |
| `ui/ai_quote_sidebar.html` | Normalized category config lookup; `canonical` fallback for phase ids |
| `admin/_RunAIQuoteBuilderPipelineDiagnostics.js` | Unified diagnostic runner |
| `DIAGNOSTIC.md` | This document |

## Blocked outside repo

- Live spreadsheet content for `Config: Scope Phases` / `Config: Brief Profiles` (must exist and align on normalized brief-type slugs).
- OpenAI API credentials and vector store configuration (extraction after config fix).
- FanOps / Molham / VAT — explicitly out of scope per task brief.

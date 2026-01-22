# AI Quote Builder - Complete Pipeline Analysis (READ-ONLY)

**Date**: 2026-01-13
**Purpose**: Map entire quote building process from A-to-Z without making changes
**Status**: 🔍 INVESTIGATION ONLY - NO FIXES APPLIED

---

## 📍 CURRENT STATE - WHAT USER REPORTED

### Error 1: "Scope phase config is missing for this brief type"
- Appears after selecting brief type dropdown
- Sheet DOES have briefType column (verified by user with actual data)
- Sheet has 81 rows of phase data
- All required columns present

### Error 2: Questions appearing in diagnostics
- Shows: "INFO: Questions: What are the exact KPIs..."
- User says this is legacy behavior that was removed months ago
- Currently showing again

### Error 3: Nothing appears after scope extraction completes
- User clicks "Extract Scope"
- Process completes (no error)
- But no scope entries are displayed

---

## 🗺️ COMPLETE PIPELINE MAP - USER JOURNEY

### **Step 1: User Opens Sidebar**
```
User clicks "AI Quote Builder" menu
  ↓
showAIQuoteBuilderSidebar() in AISidebar.js
  ↓
Opens ui/ai_quote_sidebar.html
  ↓
HTML loads and calls loadSidebarData()
```

**Files involved**:
- `AISidebar.js` (menu handler)
- `ui/ai_quote_sidebar.html` (UI)

---

### **Step 2: Sidebar Initializes**
```
loadSidebarData() executes
  ↓
Calls getScopeCategoryUiData() on server
  ↓
05_AISidebar_Config.js:getScopeCategoryUiData() (line 441)
```

**Code trace - getScopeCategoryUiData()**:
```javascript
// Line 441-473
function getScopeCategoryUiData() {
  const configMap = getScopeCategoryConfigMap();  // Line 442 - CRITICAL CALL
  const hashes = {};

  // Compute hash for each brief type's phase configuration
  try {
    if (configMap && typeof configMap === 'object') {
      Object.keys(configMap).forEach(function(briefType) {
        const config = configMap[briefType];
        if (config && typeof config === 'object') {
          // Compute MD5 hash of the phase configuration
          if (typeof Utilities !== 'undefined' && Utilities && Utilities.computeDigest) {
            const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(config));
            hashes[briefType] = digest.map(function(byte) {
              return ('0' + (byte & 0xff).toString(16)).slice(-2);
            }).join('');
          } else {
            // Fallback if Utilities unavailable
            hashes[briefType] = String(new Date().getTime());
          }
        }
      });
    }
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'getScopeCategoryUiData hash computation failed', String(error)); } catch (ignore) {
      console.error('[AISidebar] Error:', ignore.message, ignore.stack);
    }
  }

  return {
    enabled: isScopeCategoryEnabled(),
    config: configMap,
    hashes: hashes
  };
}
```

**Next - getScopeCategoryConfigMap()**:
```javascript
// Line 382-430
function getScopeCategoryConfigMap() {
  try {
    // Load scope phases array from ConfigurationManager
    const phasesArray = ConfigurationManager.get('scope.phases');  // LINE 385 - LOADS FROM SHEET

    if (!phasesArray || !Array.isArray(phasesArray) || phasesArray.length === 0) {
      const message = 'Scope phase config is missing. Populate Config: Scope Phases.';
      if (typeof AppError !== 'undefined') {
        throw new AppError('CONFIG_SCHEMA', message);
      }
      throw new Error(message);
    }

    // Transform array into map grouped by briefType
    // Input: [{briefType: 'smm-retainer', phaseId: '...', ...}, ...]
    // Output: {'smm-retainer': {phases: [...]}, 'pr-retainer': {phases: [...]}, ...}
    const configMap = {};
    phasesArray.forEach(function(phase) {
      if (!phase || !phase.briefType) {
        return; // Skip invalid entries - LINE 401 - COULD SKIP ALL IF briefType MISSING
      }
      const briefType = phase.briefType;
      if (!configMap[briefType]) {
        configMap[briefType] = { phases: [] };
      }
      configMap[briefType].phases.push(phase);
    });

    if (Object.keys(configMap).length === 0) {
      const message = 'Scope phase config is empty. Populate Config: Scope Phases.';
      if (typeof AppError !== 'undefined') {
        throw new AppError('CONFIG_SCHEMA', message);
      }
      throw new Error(message);
    }

    return configMap;
  } catch (error) {
    // If ConfigurationManager throws, log and re-throw
    try {
      UnifiedLogger.error('AISidebar', 'Failed to load scope phases from ConfigurationManager', {
        error: String(error)
      });
    } catch (logError) {
      console.error('[AISidebar] Logging failed:', String(logError));
    }
    throw error;
  }
}
```

**QUESTION 1**: What does `ConfigurationManager.get('scope.phases')` return?
- Does it return the raw sheet data?
- Does it parse column headers correctly?
- Does briefType field exist in returned objects?

---

### **Step 3: User Selects Brief Type**
```
User selects "smm-retainer" from dropdown
  ↓
Calls getScopeCategoryConfig(briefType) on server
  ↓
05_AISidebar_Config.js:getScopeCategoryConfig() (line 432)
```

**Code trace - getScopeCategoryConfig()**:
```javascript
// Line 432-439
function getScopeCategoryConfig(briefType) {
  if (!isScopeCategoryEnabled()) {
    return null;
  }
  const type = briefType || BRIEF_TYPE_DEFAULT;
  const config = getScopeCategoryConfigMap();  // Same function as above
  return config[type] || null;  // Returns null if briefType not in map
}
```

**If this returns null**:
- UI shows: "Scope phase config is missing for this brief type"
- Means `config['smm-retainer']` doesn't exist
- Which means getScopeCategoryConfigMap() didn't create an entry for 'smm-retainer'
- Which means either:
  1. ConfigurationManager.get('scope.phases') returned empty
  2. OR all phases were skipped because `phase.briefType` was falsy
  3. OR briefType field name is different in actual data

---

### **Step 4: User Pastes Brief and Clicks "Extract Scope"**
```
User pastes brief text
User clicks "Extract Scope" button
  ↓
invokeScopeExtraction() on server
  ↓
05_AISidebar_Processing.js:buildLLMContext() (line 56)
  ↓
invokeLLMChat() (line 201)
  ↓
Returns to client as llmResult
  ↓
tryParseJsonResponse(llmResult.output) (05_AISidebar_UI.js:3710)
  ↓
normalizeScopeDraftToFinalStructure(parsed) (05_AISidebar_Processing.js:1251)
  ↓
extractScopeDraft() processes result (05_AISidebar_UI.js:5600)
```

**buildLLMContext() trace**:
```javascript
// Line 56-160
function buildLLMContext(briefText, briefType, categoryState) {
  try {
    // Load brief profile
    const briefProfile = getBriefProfile(briefType);  // LINE 61
    if (!briefProfile) {
      // Fallback context if profile missing
      return {
        brief: briefText,
        briefType: briefType,
        sectionOrder: [],
        catalogHints: [],
        signatureCues: [],
        categoryPhases: [],
        scenarioNotes: []
      };
    }

    // Extract section order (should be array)
    const sectionOrder = ensureArray(briefProfile.sectionOrder);  // LINE 76

    // Extract catalog prefixes (should be array)
    const catalogPrefixes = ensureArray(briefProfile.catalogPrefixes);  // LINE 79

    // Extract signature cues (should be array)
    const signatureCues = ensureArray(briefProfile.signatureCues);  // LINE 82

    // Extract category phases
    const categoryPhases = [];
    if (categoryState && Array.isArray(categoryState.categoryPhases)) {
      categoryState.categoryPhases.forEach(function(phaseId) {
        categoryPhases.push({ phaseId: phaseId });
      });
    }

    return {
      brief: briefText,
      briefType: briefType,
      sectionOrder: sectionOrder,
      catalogHints: catalogPrefixes,
      signatureCues: signatureCues,
      categoryPhases: categoryPhases,
      cadence: categoryState && categoryState.cadence ? categoryState.cadence : '',
      scenarioNotes: []
    };
  } catch (error) {
    UnifiedLogger.error('AISidebar', 'buildLLMContext failed', {
      error: String(error),
      briefType: briefType
    });
    throw error;
  }
}
```

**invokeLLMChat() trace**:
```javascript
// Line 201-447
// This calls OpenAI ChatCompletion API
// Uses SCOPE_DRAFT_LLM_SCHEMA for structured output
// Returns: { output: <string or object>, usage: {...}, model: 'gpt-4o-...' }
```

**CRITICAL: What format does OpenAI return?**
- In the new code (line 3185 in 05_AISidebar_Processing.js):
  ```javascript
  const output = extractResponseOutputText(parsedResponse);
  ```
- extractResponseOutputText() is in 05_AISidebar_UI.js:3650
- It extracts text from response.output array
- Returns a STRING

**tryParseJsonResponse() trace**:
```javascript
// Line 3710-3749 (JUST FIXED)
function tryParseJsonResponse(rawText, context, options) {
  if (!rawText) {
    throw new AppError('LLM_JSON', 'LLM response was empty.');
  }
  const attempts = [];
  const payloadKey = options && options.payloadKey ? options.payloadKey : '';
  attempts.push(rawText);

  // Try quoting unquoted keys if rawText is a string
  if (typeof rawText === 'string') {
    let fallback = quoteUnquotedKeys(rawText);
    let iterations = 0;
    while (fallback && fallback !== attempts[attempts.length - 1] && iterations < 3) {
      attempts.push(fallback);
      fallback = quoteUnquotedKeys(fallback);
      iterations += 1;
    }
  }

  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const trimmed = rawText.slice(firstBrace, lastBrace + 1);
    if (attempts.indexOf(trimmed) === -1) {
      attempts.push(trimmed);
    }
  }

  for (let i = 0; i < attempts.length; i++) {
    try {
      return JSON.parse(attempts[i]);  // Returns parsed object
    } catch (error) {
      if (i === attempts.length - 1) {
        const repairDetails = captureJsonRepairContext(rawText, attempts.slice(), payloadKey);
        const repairPrompt = buildRepairPrompt(rawText, error, context || {}, repairDetails);
        throw new AppError('__SCOPE_SCHEMA__', repairPrompt, repairDetails);
      }
    }
  }
}
```

**normalizeScopeDraftToFinalStructure() trace**:
```javascript
// Line 1251-1612 in 05_AISidebar_Processing.js
// Takes simple 8-field LLM response
// Enriches to full 22-field structure
// Returns: { scopeEntries: [...], warnings: [...], questions: [...], ... }
```

**CRITICAL: What's in the returned object?**
- scopeEntries: Array of scope entry objects
- warnings: Array of warning strings
- questions: Array of question strings  ← THIS IS THE LEGACY BEHAVIOR
- assumptions: Array
- Other metadata fields

---

### **Step 5: extractScopeDraft() Processes Result**
```javascript
// Line 5600-5750 in 05_AISidebar_UI.js
function extractScopeDraft(options) {
  // ... setup code ...

  // LINE 5631: Parse LLM response
  parsed = tryParseJsonResponse(llmResult.output, context);

  // LINE 5635: Normalize to full structure
  const sanitized = normalizeScopeDraftToFinalStructure(parsed);

  // LINE 5673-5677: Display WARNINGS
  if (sanitized.warnings && sanitized.warnings.length) {
    diagnostics.push({
      level: 'warning',
      message: sanitized.warnings.join('\n')
    });
  }

  // LINE 5685-5690: Display QUESTIONS (LEGACY BEHAVIOR)
  if (sanitized.questions && sanitized.questions.length) {
    diagnostics.push({
      level: 'info',
      message: 'Questions: ' + sanitized.questions.join('\n')
    });
  }

  // Later: Return result to UI
  return {
    success: true,
    scopeDraft: sanitized,
    diagnostics: diagnostics,
    // ...
  };
}
```

**UI receives this and should display scope entries**

---

## 🔍 INVESTIGATION QUESTIONS

### Question 1: What does ConfigurationManager.get('scope.phases') actually return?

**Need to verify**:
1. Does it return an array?
2. Does each object have a `briefType` field?
3. What are the exact field names?
4. Are there any rows where `briefType` is null/undefined?

**Diagnostic needed**:
```javascript
function diagnoseConfigManagerLoad() {
  const raw = ConfigurationManager.get('scope.phases');
  console.log('=== ConfigurationManager.get("scope.phases") ===');
  console.log('Type:', typeof raw);
  console.log('Is Array:', Array.isArray(raw));
  console.log('Length:', raw ? raw.length : 'NULL');

  if (raw && raw.length > 0) {
    console.log('\nFirst 3 items:');
    raw.slice(0, 3).forEach(function(item, i) {
      console.log('Item', i, ':', JSON.stringify(item, null, 2));
    });

    console.log('\nField names in first item:', Object.keys(raw[0]));

    console.log('\nCount by briefType:');
    const counts = {};
    raw.forEach(function(item) {
      const bt = item.briefType;
      counts[bt] = (counts[bt] || 0) + 1;
    });
    console.log(JSON.stringify(counts, null, 2));
  }
}
```

---

### Question 2: Why is getScopeCategoryConfig() returning null?

**Possible reasons**:
1. ConfigurationManager.get('scope.phases') returns empty
2. All phases skipped because briefType field is missing
3. briefType field has different name (e.g., 'brief_type', 'BRIEFTYPE')
4. briefType is present but configMap is not being built correctly

**Diagnostic needed**:
```javascript
function diagnoseScopeCategoryConfigMap() {
  console.log('=== getScopeCategoryConfigMap() ===');

  try {
    const configMap = getScopeCategoryConfigMap();
    console.log('Success!');
    console.log('Brief types found:', Object.keys(configMap));
    console.log('smm-retainer exists?', !!configMap['smm-retainer']);

    if (configMap['smm-retainer']) {
      console.log('smm-retainer phases:', configMap['smm-retainer'].phases.length);
    }
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('Stack:', error.stack);
  }
}
```

---

### Question 3: Where does the LLM response include questions?

**Need to find**:
1. Where in the code does the LLM schema define `questions` field?
2. Is it in SCOPE_DRAFT_LLM_SCHEMA?
3. Or is normalizeScopeDraftToFinalStructure() adding it?

**Files to check**:
- `05_AISidebar_Config.js` - Search for SCOPE_DRAFT_LLM_SCHEMA
- `05_AISidebar_Processing.js` - Check normalizeScopeDraftToFinalStructure()

---

### Question 4: Why aren't scope entries appearing after extraction?

**Possible reasons**:
1. LLM returns empty scopeEntries array
2. Parsing fails silently
3. Normalization removes all entries
4. UI rendering fails
5. scopeEntries structure doesn't match what UI expects

**Diagnostic needed**:
```javascript
// Add to extractScopeDraft() for logging
console.log('=== After Normalization ===');
console.log('sanitized type:', typeof sanitized);
console.log('sanitized.scopeEntries:', sanitized.scopeEntries ? sanitized.scopeEntries.length : 'MISSING');
if (sanitized.scopeEntries && sanitized.scopeEntries.length > 0) {
  console.log('First entry:', JSON.stringify(sanitized.scopeEntries[0], null, 2));
} else {
  console.log('No scope entries!');
  console.log('Full sanitized object keys:', Object.keys(sanitized));
}
```

---

## 📋 COMPLETE FILE INVENTORY

### Core Processing Files
1. **05_AISidebar_Processing.js**
   - buildLLMContext() - Line 56
   - invokeLLMChat() - Line 201
   - invokeCatalogAssistant() - Line 2936
   - normalizeScopeDraftToFinalStructure() - Line 1251

2. **05_AISidebar_Config.js**
   - getScopeCategoryConfigMap() - Line 382
   - getScopeCategoryConfig() - Line 432
   - getScopeCategoryUiData() - Line 441
   - getBriefProfile() - Line 481
   - SCOPE_DRAFT_LLM_SCHEMA - Line 1007

3. **05_AISidebar_UI.js**
   - extractScopeDraft() - Line 5600
   - tryParseJsonResponse() - Line 3710
   - extractResponseOutputText() - Line 3650
   - quoteUnquotedKeys() - Line 6983

4. **ui/ai_quote_sidebar.html**
   - loadSidebarData() - JavaScript section
   - Scope entry rendering - JavaScript section
   - Brief type dropdown - HTML section

### Config Files
5. **ConfigSeeder.js**
   - extractScopePhasesFromTaxonomy_() - Line 275
   - seedScopePhases_() - Line 342

6. **ConfigurationManager.js**
   - get() method - Loads from sheets

---

## 🎯 NEXT STEPS (NO CHANGES YET)

1. **Run Diagnostic 1**: Check what ConfigurationManager.get('scope.phases') returns
2. **Run Diagnostic 2**: Check what getScopeCategoryConfigMap() returns
3. **Run Diagnostic 3**: Check SCOPE_DRAFT_LLM_SCHEMA for questions field
4. **Run Diagnostic 4**: Add logging to extractScopeDraft() to see normalized result
5. **Compile findings** and present to user for approval before making ANY fixes

---

**Status**: Analysis complete. Awaiting user approval to run diagnostics or make changes.

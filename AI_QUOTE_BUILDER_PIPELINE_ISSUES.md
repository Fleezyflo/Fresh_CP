# AI Quote Builder - Complete Pipeline Issues

**Created**: 2026-01-13
**Status**: 🔴 CRITICAL - Three blocking issues identified

---

## 🚨 CURRENT BLOCKING ISSUES

### Issue 1: "Scope phase config is missing for this brief type"
**Error Message**: "Scope phase config is missing for this brief type. Add phases in Config: Scope Phases or select another brief type to enable scope inputs."

**Where it appears**: After selecting brief type in dropdown

**Root cause investigation needed**:
- Sheet HAS briefType column ✓ (verified by user)
- Sheet HAS all phase data ✓ (81 rows shown)
- ConfigurationManager should be loading it
- Grouping logic in `getScopeCategoryConfigMap()` may be failing

**Trace path**:
```
User selects brief type
  ↓
ui/ai_quote_sidebar.html calls getScopeCategoryUiData()
  ↓
05_AISidebar_Config.js:getScopeCategoryUiData() (line 441)
  ↓
Calls getScopeCategoryConfigMap() (line 442)
  ↓
05_AISidebar_Config.js:getScopeCategoryConfigMap() (line 382)
  ↓
ConfigurationManager.get('scope.phases') (line 385)
  ↓
Returns empty or wrong data structure?
```

---

### Issue 2: Questions appearing (legacy behavior)
**What's happening**: LLM response includes `questions` array, UI displays them as INFO diagnostics

**User statement**: "questions come up which was not the process for a long time this was like the legacy legacy original process that I have changed maybe months ago why is that the process again"

**Root cause**: 05_AISidebar_UI.js:5685-5690

```javascript
if (sanitized.questions && sanitized.questions.length) {
  diagnostics.push({
    level: 'info',
    message: 'Questions: ' + sanitized.questions.join('\n')
  });
}
```

**Fix needed**: Remove this code block entirely

---

### Issue 3: Nothing appearing after scope analysis completes
**What's happening**: After "Extract Scope" completes successfully, no scope entries are displayed

**User statement**: "why is nothing coming up after it's done analysing?"

**Possible causes**:
1. LLM response parsing fails (but no error shown)
2. Response format changed
3. UI rendering logic broken
4. Scope entries structure mismatch

**Trace path needed**:
```
User clicks "Extract Scope"
  ↓
invokeScopeExtraction()
  ↓
invokeLLMChat() returns response
  ↓
tryParseJsonResponse() parses it (JUST FIXED)
  ↓
normalizeScopeDraftToFinalStructure() enriches it
  ↓
??? Scope entries should appear in UI but don't ???
```

---

## 🔍 REQUIRED DIAGNOSTICS

### Diagnostic 1: Check what ConfigurationManager.get('scope.phases') returns

```javascript
function diagnoseConfigManagerScopePhases() {
  const raw = ConfigurationManager.get('scope.phases');
  console.log('Type:', typeof raw);
  console.log('Is Array:', Array.isArray(raw));
  console.log('Length:', raw ? raw.length : 0);
  if (raw && raw.length > 0) {
    console.log('First 3 items:', raw.slice(0, 3));
    console.log('Fields in first item:', Object.keys(raw[0]));
  }
}
```

### Diagnostic 2: Check what extractResponseOutputText returns

```javascript
// In 05_AISidebar_Processing.js after LLM call
const output = extractResponseOutputText(parsedResponse);
console.log('LLM output type:', typeof output);
console.log('LLM output length:', output ? output.length : 0);
console.log('LLM output preview:', output ? output.substring(0, 200) : 'NULL');
```

### Diagnostic 3: Check scope draft after normalization

```javascript
// In extractScopeDraft() after normalization
console.log('Normalized scope entries:', sanitized.scopeEntries ? sanitized.scopeEntries.length : 0);
console.log('First entry:', sanitized.scopeEntries ? sanitized.scopeEntries[0] : 'NONE');
```

---

## 🛠️ IMMEDIATE FIXES REQUIRED

### Fix 1: Remove questions display

**File**: `05_AISidebar_UI.js`
**Lines**: 5685-5690
**Action**: DELETE

```javascript
// DELETE THIS:
if (sanitized.questions && sanitized.questions.length) {
  diagnostics.push({
    level: 'info',
    message: 'Questions: ' + sanitized.questions.join('\n')
  });
}
```

### Fix 2: Investigate ConfigurationManager loading

Need to check if ConfigurationManager is properly loading and parsing the Scope Phases sheet.

### Fix 3: Add verbose logging to scope extraction

Add console logging at every step to see where it's failing.

---

## 📋 TESTING CHECKLIST

After fixes:

- [ ] Select brief type → Config loads correctly
- [ ] Paste brief → Extract Scope button enabled
- [ ] Click Extract Scope → LLM processes brief
- [ ] **NO QUESTIONS APPEAR** in diagnostics
- [ ] Scope entries appear in accordion
- [ ] Can expand/collapse scope sections
- [ ] Can approve scope
- [ ] Can run commercial fit
- [ ] Can build quote

---

## 🔗 RELATED FILES

- `05_AISidebar_Config.js:382-430` - getScopeCategoryConfigMap()
- `05_AISidebar_Config.js:441-473` - getScopeCategoryUiData()
- `05_AISidebar_UI.js:5685-5690` - Questions display (REMOVE)
- `05_AISidebar_UI.js:5625-5690` - extractScopeDraft()
- `05_AISidebar_Processing.js:56-160` - buildLLMContext()
- `05_AISidebar_Processing.js:1251-1612` - normalizeScopeDraftToFinalStructure()

---

**Next Step**: Run diagnostics to identify exact failure point in each workflow.

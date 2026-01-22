# Vector Search Troubleshooting Guide

**Created:** 2026-01-12
**Purpose:** Diagnose and fix vector search errors (ISS-001, ISS-002)
**Target:** Fresh CP v10.1.0+

---

## Quick Fix: Replace Vector Store ID

If you need to switch to a new vector store immediately:

### Method 1: Interactive UI (Recommended)

1. Open Apps Script Editor
2. Select function: `replaceVectorStoreIdInteractive`
3. Click Run
4. Enter new vector store ID when prompted (must start with `vs_`)
5. Click OK to confirm

**Result:** Vector store ID updated immediately, caches cleared automatically.

### Method 2: Programmatic (From Script Editor)

```javascript
// Run this function directly
modifyVectorStoreId('vs_YOUR_NEW_VECTOR_STORE_ID_HERE');

// Example:
modifyVectorStoreId('vs_ABC123xyz...');
```

### Method 3: Script Properties UI

1. Extensions → Apps Script
2. Project Settings (gear icon)
3. Script Properties section
4. Find `OPENAI_VECTOR_STORE_ID`
5. Click Edit → Update value → Save

**Note:** Method 3 requires manual cache clearing (run `PropertiesLoader.invalidate()`)

---

## Diagnose Vector Search Errors

### Run Full Diagnostics

```javascript
// From Apps Script Editor, select and run:
diagnoseVectorSearch();

// Check execution logs (View → Logs) for detailed report
```

**What it checks:**
- ✅ Script Properties configuration (API key, vector store ID)
- ✅ Vector Store API connectivity
- ✅ Vector search function availability
- ✅ Test search query execution
- ✅ Catalog validation

**Output:** Complete diagnostic report with errors, warnings, and recommendations.

### Quick Health Check

```javascript
// Fast check - returns 'HEALTHY', 'WARNING', or 'ERROR'
quickVectorHealthCheck();
```

### Test Specific Entries

If errors occur for specific scope entries:

```javascript
// Prepare test entries
const testEntries = [
  { id: 'test1', deliverables: ['Social media content creation'] },
  { id: 'test2', scopeLabel: 'Blog post writing' }
];

// Run test
testVectorSearchWithEntries(testEntries);
```

**Result:** Shows which entries succeed, which fail, and why.

---

## Common Issues and Solutions

### Issue 1: Vector Search Returns `errorCount: 2`

**Symptoms:**
```
Vector search complete { entryCount: 20, errorCount: 2 }
[WARN] Vector search diagnostics found { issueCount: 2 }
```

**Possible Causes:**

#### Cause A: Vector Store Not Found (404)

**Diagnosis:**
```javascript
diagnoseVectorSearch();
// Look for: "Vector Store not found (404)"
```

**Solution:**
```javascript
// 1. Verify correct vector store ID
getCurrentVectorStoreId();

// 2. If ID is wrong, update it
modifyVectorStoreId('vs_CORRECT_ID_HERE');

// 3. Or create new vector store and sync
syncScopeBuildupsToVectorStore();
```

#### Cause B: Invalid SKUs in Vector Store

**Diagnosis:**
```javascript
diagnoseVectorSearch();
// Look for: "Skipped vector hit with invalid SKU"
```

**Root Cause:** Vector store contains SKUs that don't exist in the current catalog.

**Solution:**
```javascript
// Re-sync vector store to match current catalog
syncScopeBuildupsToVectorStore();
```

#### Cause C: Catalog Prefix Mismatch

**Diagnosis:** Check logs for:
```
Skipped vector hit - SKU prefix not in brief catalog
```

**Root Cause:** Vector hits are being filtered out because SKU prefixes don't match the brief type's catalog.

**Solution:** Verify catalog prefixes are correctly configured for each brief type.

#### Cause D: Empty Vector Store

**Diagnosis:**
```javascript
diagnoseVectorSearch();
// Look for: "Test search returned 0 hits"
```

**Solution:**
```javascript
// Sync scope buildups to vector store
syncScopeBuildupsToVectorStore();

// Wait for sync to complete, then verify
quickVectorHealthCheck();
```

---

### Issue 2: Xero Item Lookup Failures

**Symptoms:**
```
lookupItem completed - not found { itemCode: 'CRE-101' }
lookupItem completed - not found { itemCode: 'DES-111' }
```

**Expected Behavior:** Some items may not exist in Xero yet (draft items, unpublished catalog entries).

**When to Fix:**

- ✅ **Ignore** if items are drafts or not yet published to Xero
- ⚠️ **Investigate** if items should exist in Xero but are missing

**Diagnosis:**
```javascript
// Check if item exists in Xero
const result = lookupItem('CRE-101');
// Returns: { found: true/false, data: {...} }

// Check Xero sync status
checkXeroIntegrationHealth();
```

**Solution (if items should exist):**
1. Verify Xero integration credentials
2. Re-sync catalog to Xero
3. Manually create missing items in Xero

---

## Maintenance Functions

### List All Script Properties

```javascript
listScriptProperties();
// Returns: Array of property keys (values hidden for security)
```

### Get Current Vector Store ID

```javascript
getCurrentVectorStoreId();
// Returns: { status: 'SET', preview: 'vs_ABC...', fullValue: 'vs_ABC123...' }
```

### Modify Any Script Property

```javascript
modifyScriptProperty('PROPERTY_KEY', 'new_value');

// Examples:
modifyScriptProperty('OPENAI_API_KEY', 'sk-proj-new-key...');
modifyScriptProperty('XERO_TENANT_ID', 'new-tenant-id');
```

### Batch Update Properties

```javascript
batchModifyProperties({
  'OPENAI_VECTOR_STORE_ID': 'vs_new123...',
  'OPENAI_API_KEY': 'sk-proj-new...'
});
```

### Delete Property

```javascript
deleteScriptProperty('OLD_PROPERTY_NAME');
```

---

## Debugging Workflow

### When Vector Search Errors Occur:

1. **Run Diagnostics**
   ```javascript
   diagnoseVectorSearch();
   ```

2. **Check Logs**
   - View → Logs (Ctrl+Enter)
   - Look for errors, warnings, recommendations

3. **Identify Root Cause**
   - Configuration issue? → Fix Script Properties
   - API connectivity? → Check vector store exists
   - SKU validation? → Re-sync vector store
   - Empty results? → Sync scope buildups

4. **Apply Fix**
   - Use appropriate admin function from this guide
   - Verify fix with `quickVectorHealthCheck()`

5. **Test**
   - Run test query: `testVectorSearchWithEntries([...])`
   - Verify errors resolved

6. **Monitor**
   - Check production logs for `errorCount: 0`
   - Verify `issueCount: 0` in diagnostics

---

## Admin Functions Reference

| Function | Purpose | Example |
|----------|---------|---------|
| `modifyVectorStoreId()` | Update vector store ID | `modifyVectorStoreId('vs_new...')` |
| `replaceVectorStoreIdInteractive()` | Interactive UI update | Run from editor |
| `diagnoseVectorSearch()` | Full diagnostics | Run from editor |
| `quickVectorHealthCheck()` | Fast health check | Run from editor |
| `testVectorSearchWithEntries()` | Test specific entries | `testVectorSearchWithEntries(entries)` |
| `getCurrentVectorStoreId()` | View current ID | Run from editor |
| `listScriptProperties()` | List all properties | Run from editor |
| `modifyScriptProperty()` | Update any property | `modifyScriptProperty(key, val)` |
| `batchModifyProperties()` | Update multiple properties | `batchModifyProperties({...})` |

---

## Files Reference

- `App-script/admin/_ModifyScriptProperties.js` - Script property modification tools
- `App-script/admin/_DiagnoseVectorSearch.js` - Vector search diagnostics
- `App-script/VectorSearch.js` - Vector search implementation
- `App-script/ScopeVectorStoreSync.js` - Vector store sync logic
- `App-script/PropertiesLoader.js` - Property loading and caching

---

## Support

**Issues Tracking:** `.planning/ISSUES.md`

**Related Issues:**
- ISS-001: Vector Search Errors During Commercial Fit Refresh
- ISS-002: Xero Item Lookup Failures During Commercial Fit Refresh

**Resolution Status:** Tools created 2026-01-12

---

*Last Updated: 2026-01-12*
*Phase: 10 - Validation*
*Version: 1.0.0*

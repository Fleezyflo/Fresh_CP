# Vector Search Quick Reference Card

**Created:** 2026-01-12 | **Version:** 1.0.0

---

## 🚀 Most Common Tasks

### Replace Vector Store ID (Interactive)
```javascript
replaceVectorStoreIdInteractive()
```
**Result:** UI prompt → Enter new ID → Automatic cache clear

### Diagnose Vector Search Issues
```javascript
diagnoseVectorSearch()
```
**Result:** 5-check report with errors, warnings, recommendations

### Quick Health Check
```javascript
quickVectorHealthCheck()
```
**Returns:** `'HEALTHY'`, `'WARNING'`, or `'ERROR'`

---

## 🔧 Property Management

### View Current Vector Store ID
```javascript
getCurrentVectorStoreId()
```

### Update Vector Store ID (Programmatic)
```javascript
modifyVectorStoreId('vs_NEW_ID_HERE')
```

### List All Properties
```javascript
listScriptProperties()
```

### Update Any Property
```javascript
modifyScriptProperty('PROPERTY_KEY', 'new_value')
```

---

## 🔍 Diagnostics

### Full Diagnostics (5 Checks)
```javascript
diagnoseVectorSearch()
```
**Checks:**
1. Script Properties Config
2. API Connectivity
3. Function Availability
4. Test Search Query
5. Catalog Validation

### Test Specific Entries
```javascript
const entries = [
  { id: 'test1', deliverables: ['content'] }
];
testVectorSearchWithEntries(entries)
```

---

## ⚡ Common Fixes

| Error | Solution |
|-------|----------|
| 404 Not Found | `modifyVectorStoreId('vs_new...')` |
| Invalid SKUs | `syncScopeBuildupsToVectorStore()` |
| Empty Store | `syncScopeBuildupsToVectorStore()` |
| 401 Auth Failed | `modifyScriptProperty('OPENAI_API_KEY', 'sk-...')` |

---

## 📂 Files Reference

| File | Purpose |
|------|---------|
| `admin/_ModifyScriptProperties.js` | Property modification |
| `admin/_DiagnoseVectorSearch.js` | Diagnostics |
| `VECTOR_SEARCH_TROUBLESHOOTING.md` | Full guide |

---

## 🎯 Workflow

1. **Problem detected** → Run `diagnoseVectorSearch()`
2. **Review logs** → View → Logs (Ctrl+Enter)
3. **Identify cause** → Check errors section
4. **Apply fix** → Use appropriate function
5. **Verify** → Run `quickVectorHealthCheck()`
6. **Test** → Run `testVectorSearchWithEntries()`

---

**Full Guide:** `App-script/VECTOR_SEARCH_TROUBLESHOOTING.md`
**Issues:** `.planning/ISSUES.md` (ISS-001, ISS-002)

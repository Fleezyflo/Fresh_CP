# Client-Side Diagnostic Instructions

**Problem**: Server has correct config, but UI shows "Scope phase config is missing"

**Server diagnostic proved**: Config loads correctly on server side

**Now check client side** (run these in browser console):

## 1. Check categoryConfigMap

Open browser console (F12) and run:

```javascript
console.log('categoryConfigMap keys:', Object.keys(categoryConfigMap || {}));
console.log('categoryConfigMap["smm-retainer"]:', categoryConfigMap['smm-retainer']);
console.log('currentBriefType:', currentBriefType);
```

**Expected**: Should show 'smm-retainer' in keys and have 9 phases

**If empty/missing**: Config wasn't loaded into UI

## 2. Check if applyCategoryUiData was called

```javascript
console.log('scopeCategoryEnabled:', scopeCategoryEnabled);
console.log('categoryConfigHashes:', categoryConfigHashes);
```

**Expected**: scopeCategoryEnabled = true, hashes should have values

**If undefined/false**: applyCategoryUiData never ran or failed

## 3. Manually trigger config reload

```javascript
google.script.run
  .withSuccessHandler(function(response) {
    console.log('Response from server:', response);
    console.log('response.config keys:', Object.keys(response.config || {}));
    console.log('response.config["smm-retainer"]:', response.config['smm-retainer']);

    // Manually apply it
    categoryConfigMap = response.config;
    console.log('categoryConfigMap after manual set:', Object.keys(categoryConfigMap));
  })
  .withFailureHandler(function(error) {
    console.error('getScopeCategoryUiData failed:', error);
  })
  .getScopeCategoryUiData();
```

**Expected**: Should receive config with 9 briefTypes

## 4. Check for brief type mismatch

After selecting brief type in dropdown:

```javascript
const briefTypeField = document.getElementById('briefType');
console.log('Dropdown value:', briefTypeField ? briefTypeField.value : 'NOT FOUND');
console.log('currentBriefType variable:', currentBriefType);
console.log('Are they equal?', briefTypeField && briefTypeField.value === currentBriefType);
```

## 5. Check getCurrentCategoryConfig

```javascript
const config = getCurrentCategoryConfig();
console.log('getCurrentCategoryConfig() result:', config);
console.log('Has phases?', config && config.phases ? config.phases.length : 'NO');
```

**If null**: categoryConfigMap doesn't have the briefType OR currentBriefType is wrong

## 6. Force set config (temporary workaround)

If config exists on server but not in UI, force reload:

```javascript
google.script.run
  .withSuccessHandler(function(response) {
    categoryConfigMap = response.config;
    categoryConfigHashes = response.hashes;
    scopeCategoryEnabled = response.enabled;
    console.log('Force reloaded config');
    console.log('categoryConfigMap keys:', Object.keys(categoryConfigMap));

    // Try rendering now
    renderCategoryScaffold();
    updateCategoryConfigHealth();
  })
  .getScopeCategoryUiData();
```

---

## What to report back

Run diagnostics 1-5 and tell me:

1. Are there keys in categoryConfigMap?
2. Is 'smm-retainer' one of them?
3. What is currentBriefType when you select the dropdown?
4. Does the manual reload (diagnostic 3) show the config coming from server?

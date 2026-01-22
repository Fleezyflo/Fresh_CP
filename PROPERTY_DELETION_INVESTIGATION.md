# Property Deletion Investigation

**Status:** 🔍 INVESTIGATION TOOLS PROVIDED
**Date:** 2026-01-13

---

## The Problem

Your script properties keep getting wiped/deleted, requiring manual restoration.

## What I Found (So Far)

After searching the codebase, I found NO EVIDENCE of automatic property deletion in normal workflow code.

### Functions That CAN Delete Properties (But Need Manual Trigger):

1. **`deleteAllScriptProperties()`** (admin/_SetupScriptProperties.js:134)
   - Deletes ALL properties
   - ⚠️ DANGER: Nuclear option
   - Requires manual call - NOT in any menu

2. **`purgeNonessentialPropertiesMenu()`** (Menu.js:2900)
   - Deletes properties NOT in whitelist
   - ❌ REMOVED from menu (good!)
   - Whitelist is incomplete - would delete needed properties

3. **`cleanStalePropertiesMenu()`** (Menu.js:2860)
   - Only deletes temporary bootstrap flags
   - ✅ SAFE - doesn't delete user properties
   - Examples: BOOTSTRAP_STAGE, READINESS_RETRY_COUNT

4. **Individual deleteProperty() calls** throughout code
   - Most are safe (delete temporary flags)
   - Examples: Delete backoff markers, clear state flags

### Automatic Triggers (Run Without Your Knowledge):

These run on schedules and COULD be deleting properties:

1. **`runFullReadinessAudit()`** - Runs every 4 hours
   - Checks system health
   - Does NOT delete properties ✅

2. **`propConsentHealthCheck()`** - Runs daily
   - Checks if required properties exist
   - Does NOT delete properties ✅
   - Just adds placeholders for missing ones

3. **`runIntegrationsDailyHealth()`** - Runs daily at 5am
   - Checks Xero/OpenAI health
   - Does NOT delete properties ✅

4. **`runBootstrapStage()`** - Triggered during bootstrap
   - Might modify bootstrap state properties
   - Should NOT delete user properties ✅

---

## Investigation Tools Created

I've created diagnostic tools to help you find the REAL culprit:

### 1. Property Deletion Tracker

**File:** `admin/_DiagnosePropertyDeletions.js`

**How to use:**
```javascript
// Step 1: Enable monitoring
enablePropertyMonitoring()

// Step 2: Wait for properties to get deleted

// Step 3: Run report
showPropertyDeletionReport()

// This will show EXACTLY what deleted properties, with stack traces!
```

**Also available:**
```javascript
checkWhichPropertiesExist()  // See what properties exist RIGHT NOW
showAllPropertyOperations()  // See ALL property access (get/set/delete)
clearPropertyLog()           // Reset monitoring
```

### 2. Trigger Inspector

**File:** `admin/_DiagnoseTriggers.js`

**How to use:**
```javascript
// See all installed triggers
showAllInstalledTriggers()

// Check for dangerous triggers
checkForDangerousTriggers()

// Delete a specific trigger
deleteTriggerById("trigger-id-here")

// Delete ALL triggers (if desperate)
deleteAllTriggers()
```

---

## Next Steps: Find The Culprit

### Step 1: Check Triggers First

```javascript
// Open Apps Script Editor
// Run this:
showAllInstalledTriggers()

// Look for any triggers calling:
// - deleteAllScriptProperties
// - purgeNonessentialPropertiesMenu
// - cleanStalePropertiesMenu
// - Any custom cleanup functions
```

**If you find suspicious triggers:** Delete them immediately with `deleteTriggerById()`

### Step 2: Enable Property Monitoring

```javascript
// Run this BEFORE properties get deleted:
enablePropertyMonitoring()

// Then wait for the problem to happen again
// Properties will get deleted at some point

// Then run:
showPropertyDeletionReport()

// This will show you EXACTLY what code deleted them
```

### Step 3: Check What Properties Exist Now

```javascript
// See current state:
checkWhichPropertiesExist()

// This shows:
// - Which important properties are missing
// - Which properties currently exist
// - All property keys and values
```

---

## Possible Causes (Ranked by Likelihood)

### 1. ⚠️ Accidentally Clicked Menu Function (BEFORE Today's Menu Cleanup)

**Likelihood:** HIGH

**What happened:**
- Old DataOps menu had `purgeNonessentialPropertiesMenu` button
- Easy to click accidentally
- Deletes ANY property not in whitelist
- Whitelist was incomplete

**Evidence:**
- Menu was removed today (commit bceecd5)
- Function still exists in Menu.js:2900

**Solution:**
- Menu cleaned up ✅
- Consider deleting the function entirely

### 2. 🤖 Trigger Running Cleanup Function

**Likelihood:** MEDIUM

**What happened:**
- Time-based trigger installed calling dangerous function
- Runs automatically (daily, hourly, etc.)
- You don't see it happening

**How to check:**
```javascript
showAllInstalledTriggers()
checkForDangerousTriggers()
```

**Solution:**
- Find and delete the trigger
- Prevent future auto-triggers for cleanup functions

### 3. 🔧 Manual Script Editor Operation

**Likelihood:** MEDIUM

**What happened:**
- Accidentally ran `deleteAllScriptProperties()` from script editor
- Clicked wrong function in functions dropdown
- Testing/debugging gone wrong

**Evidence:**
- Would NOT show in logs if run directly
- Properties monitor would catch it (if enabled)

**Solution:**
- Be careful what functions you run in editor
- Enable property monitoring to catch this

### 4. 🔄 Bootstrap Process Bug

**Likelihood:** LOW

**What happened:**
- Bootstrap code has bug that wipes properties
- Runs on sheet open or periodically
- Unintended side effect

**Evidence:**
- No deleteProperty() calls found in bootstrap code
- Bootstrap only deletes its own state flags

**How to check:**
- Enable monitoring
- Open/close sheet several times
- Check if properties disappear

### 5. 🌐 External Script/Add-on

**Likelihood:** VERY LOW

**What happened:**
- Another bound script or add-on
- Access to same PropertiesService
- Deleting properties

**How to check:**
- Check bound scripts in Apps Script editor
- Check installed add-ons in Google Sheets
- Properties are project-specific, so unlikely

---

## Quick Fixes While Investigating

### Temporary: Backup Properties Daily

```javascript
function backupScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();

  // Save to sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let backupSheet = ss.getSheetByName('_PROPERTIES_BACKUP');

  if (!backupSheet) {
    backupSheet = ss.insertSheet('_PROPERTIES_BACKUP');
  }

  // Write backup
  backupSheet.clear();
  backupSheet.appendRow(['Timestamp', new Date()]);
  backupSheet.appendRow(['Key', 'Value']);

  Object.keys(all).forEach(function(key) {
    backupSheet.appendRow([key, all[key]]);
  });

  Logger.log('✅ Properties backed up to _PROPERTIES_BACKUP sheet');
}

// Set up daily backup trigger
function setupDailyBackup() {
  ScriptApp.newTrigger('backupScriptProperties')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .create();

  Logger.log('✅ Daily backup trigger installed (runs at 3am)');
}
```

### Permanent: Remove Dangerous Functions

Consider deleting these from Menu.js:

1. `purgeNonessentialPropertiesMenu()` (line 2900-2945)
   - ❌ Incomplete whitelist
   - ❌ Too risky
   - ❌ Already removed from menu

2. `cleanStalePropertiesMenu()` (line 2860-2898)
   - ⚠️ Less risky (only deletes bootstrap flags)
   - Could keep if needed for troubleshooting

---

## When You Find The Culprit

**Please let me know what it was!** Then I can:

1. Add safeguards to prevent it
2. Add confirmation dialogs
3. Add logging
4. Document the fix
5. Help others avoid the same issue

---

## Summary

**What I checked:**
- ✅ All menu functions
- ✅ All automatic triggers
- ✅ Bootstrap/startup code
- ✅ Health check functions
- ✅ All deleteProperty() calls

**What I found:**
- ✅ No automatic property deletion in normal workflow
- ⚠️ Dangerous menu function existed (now removed from menu)
- ✅ Triggers look safe (health checks only)

**What I created:**
- ✅ Property deletion tracker (tells you what's deleting)
- ✅ Trigger inspector (shows all installed triggers)
- ✅ Diagnostic tools (check current state)

**Next step:**
1. Run `showAllInstalledTriggers()`
2. Run `enablePropertyMonitoring()`
3. Wait for problem to happen
4. Run `showPropertyDeletionReport()`
5. You'll have stack traces showing EXACTLY what deleted properties!

---

*Created: 2026-01-13*
*Investigation ongoing - will update when culprit found*

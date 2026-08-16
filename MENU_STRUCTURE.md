# Menu Structure - Fresh CP Quote Builder

**Last Updated:** 2026-01-13
**Version:** v2.0 (Streamlined)
**Status:** ✅ Production Ready

---

## Overview

The Fresh CP menu system has been streamlined from 30+ items to 14 essential items across two menus:
- **"Fresh CP"** - Main production menu (7 items)
- **"🔧 Advanced"** - Admin and diagnostic tools (7 items)

### Design Philosophy

**Streamlined Approach:**
- Production users see only essential workflow items in main menu
- Admin/diagnostic tools hidden in separate "Advanced" menu
- Clear logical grouping and ordering
- No feature flags blocking core functionality

---

## Production Menu: "Fresh CP"

### Xero Integration (3 items)

**🔐 Authorize Xero**
- **Purpose:** OAuth flow to connect Xero account
- **Function:** `authorizeXero()` (XeroAuth.js:92)
- **Requirements:** XERO_CLIENT_ID, XERO_CLIENT_SECRET in script properties
- **Usage:** Run ONCE to get authorization, creates refresh token
- **Location:** Menu.js:550

**⚡ Sync Inventory to Xero**
- **Purpose:** Push normalized data from XERO_READY sheet to Xero inventory
- **Function:** `syncToXeroManual()` (XeroSync_Enhanced.js)
- **Prerequisites:** Must run Authorize Xero first
- **Usage:** After normalizing quote data, sync to Xero for invoicing
- **Location:** Menu.js:551

**🚀 AI Quote Builder**
- **Purpose:** Launch AI-powered quote generation sidebar
- **Function:** `showAIQuoteBuilder()` (Menu.js:1544)
- **Usage:** Process client briefs into structured quotes using OpenAI
- **Location:** Menu.js:552

---

### Core Operations (3 items + separator)

**Refresh Config**
- **Purpose:** Clear ConfigurationManager caches after editing config sheets
- **Function:** `refreshAllConfig()` (Menu.js)
- **Usage:** After modifying config sheets (Brief Profiles, Scope Phases, etc.)
- **Location:** Menu.js:543

**View Logs**
- **Purpose:** Open UnifiedLogger log sheet for debugging
- **Function:** `openLogSheet()` (Menu.js:216)
- **Requirements:** UNIFIED_LOGGER_SPREADSHEET_ID in script properties
- **Usage:** View trace logs, errors, and system events
- **Location:** Menu.js:555

**System Health**
- **Purpose:** Run system diagnostics and health checks
- **Function:** `viewSystemHealth()` (Menu.js)
- **Usage:** Check integrations, config, and system status
- **Location:** Menu.js:556

---

## Advanced Menu: "🔧 Advanced"

### Data Operations (2 items)

**📥 Sync Scopes to Vector Store**
- **Purpose:** Sync scope buildups to OpenAI vector store for semantic search
- **Function:** `syncScopeBuildupsToVectorStoreMenu()`
- **Usage:** After updating scope catalog, rebuild vector index
- **Location:** Menu.js:561

**🩺 Check Integrations Health**
- **Purpose:** Test connectivity to Xero, OpenAI, and Google APIs
- **Function:** `checkIntegrationsHealthMenu()`
- **Usage:** Troubleshoot API connection issues
- **Location:** Menu.js:562

---

### Properties Management (2 items + separator)

**🧾 Show Script Properties**
- **Purpose:** View all script properties (secrets, config, tokens)
- **Function:** `showScriptPropertiesMenu()`
- **Usage:** Debug configuration issues, verify OAuth tokens
- **Location:** Menu.js:564

**✍️ Set Script Property**
- **Purpose:** Manually set/update script property via prompt
- **Function:** `setScriptPropertyFromPrompt()`
- **Usage:** Quick config changes without Apps Script editor
- **Location:** Menu.js:565

---

### Logging & Diagnostics (2 items + separator)

**🔍 Search Logs**
- **Purpose:** Search UnifiedLogger logs by keyword, category, or correlation ID
- **Function:** `searchLogsMenu()`
- **Usage:** Find specific errors or trace request flows
- **Location:** Menu.js:567

**📊 Error Summary**
- **Purpose:** View aggregated error counts and recent failures
- **Function:** `showErrorSummaryMenu()`
- **Usage:** Monitor system health and identify recurring issues
- **Location:** Menu.js:568

---

## Removed Items (v2.0 Cleanup)

The following 13+ items were removed from the old DataOps menu as non-essential for production:

### Bootstrap Operations (Removed - Should be automated)
- **🛠️ Run Full Bootstrap** - Manual bootstrap triggers should be automated
- **♻️ Reset Bootstrap State** - Admin-only, dangerous for production
- **📦 Seed Catalogs from Drive** - Should run automatically via triggers
- **📦 Force Seed Catalogs** - Force operations are dangerous

### Properties Cleanup (Removed - Admin-only, dangerous)
- **🧨 Purge Nonessential Properties** - Can break system if misused
- **🧹 Clean Stale Properties** - Admin-only maintenance task
- **🔐 Recheck Props & Consent** - Admin-only diagnostic

### Force Operations (Removed - Dangerous for production)
- **🔥 Force Full Inventory Sync** - Can cause data inconsistencies
- **🔧 Force** [various other operations] - Bypassing safeguards is risky

### Redundant Logging Items (Removed - Consolidated)
- **🩺 Verify Logging** - Admin test, not needed in production menu
- **🔗 Search by Correlation ID** - Replaced by Search Logs (more flexible)
- **📋 Recent Errors (1 hour)** - Redundant with Error Summary
- **📋 Recent Errors (24 hours)** - Redundant with Error Summary

### Admin-Only Tools (Removed - Should use Apps Script editor)
- **🔧 Repair Triggers** - Admin-only, requires manual intervention
- **Scope Review Studio** - Unclear if used, removed for clarity
- **Scope Audit Log** - Unclear if used, removed for clarity

---

## Menu Implementation Details

### onOpen() - Simple Direct Build (Current)

**Location:** Menu.js:543-576
**Approach:** SIMPLIFIED - Build full menu directly with zero dependencies
**Load Time:** < 3 seconds (no deferred loading complexity)

```javascript
function onOpen(event) {
  const ui = SpreadsheetApp.getUi();

  // Production Menu
  const menu = ui.createMenu('Fresh CP');
  menu.addItem('🔐 Authorize Xero', 'authorizeXero');
  menu.addItem('⚡ Sync Inventory to Xero', 'syncToXeroManual');
  menu.addItem('🚀 AI Quote Builder', 'showAIQuoteBuilder');
  menu.addSeparator();
  menu.addItem('Refresh Config', 'refreshAllConfig');
  menu.addItem('View Logs', 'openLogSheet');
  menu.addItem('System Health', 'viewSystemHealth');
  menu.addToUi();

  // Advanced Menu
  ui.createMenu('🔧 Advanced')
    .addItem('📥 Sync Scopes to Vector Store', 'syncScopeBuildupsToVectorStoreMenu')
    .addItem('🩺 Check Integrations Health', 'checkIntegrationsHealthMenu')
    .addSeparator()
    .addItem('🧾 Show Script Properties', 'showScriptPropertiesMenu')
    .addItem('✍️ Set Script Property', 'setScriptPropertyFromPrompt')
    .addSeparator()
    .addItem('🔍 Search Logs', 'searchLogsMenu')
    .addItem('📊 Error Summary', 'showErrorSummaryMenu')
    .addToUi();
}
```

### Legacy Stage-Based System (Still Present, Not Used)

**Functions:** `buildCoreMenu_()`, `rebuildMenuWithEnhancedFeatures_()`, `buildProductionMenu_()`, `buildAdvancedMenu_()`
**Status:** Legacy code from v1.0, superseded by simplified onOpen
**Decision:** Kept for reference, but not actively used

---

## For Developers

### Adding New Menu Items

1. **Identify Appropriate Menu:**
   - Production users → Main "Fresh CP" menu
   - Admin/diagnostic → "🔧 Advanced" menu

2. **Add to onOpen() Function:**
   ```javascript
   menu.addItem('🆕 My New Item', 'myFunctionName');
   ```

3. **Optional: Add Function Check:**
   ```javascript
   if (typeof myFunctionName === 'function') {
     menu.addItem('🆕 My New Item', 'myFunctionName');
   }
   ```

4. **Placement Guidelines:**
   - Group related items together
   - Use separators for logical sections
   - Order by workflow (auth before sync, config before operations)
   - Keep main menu under 10 items for usability

5. **Update This Documentation:**
   - Add item description
   - Document purpose, function, prerequisites, usage

### Menu Item Best Practices

✅ **DO:**
- Use emoji icons for visual clarity (🔐 for auth, ⚡ for sync, etc.)
- Group related items with `.addSeparator()`
- Check function exists before adding (prevents errors)
- Order items by user workflow logic
- Keep main menu focused on production tasks

❌ **DON'T:**
- Add admin/diagnostic tools to main menu
- Create deeply nested submenus (max 1 level)
- Add feature flags for core functionality
- Use generic names like "Run Script" (be specific)
- Add more than 12 items to main menu (cognitive load)

---

## Troubleshooting

### Menu doesn't appear
**Symptoms:** No "Fresh CP" menu after opening sheet
**Causes:**
- onOpen trigger not registered
- Script execution error
- Authorization issues

**Solutions:**
1. Refresh the sheet (Cmd+R / Ctrl+R) and wait 5 seconds
2. Check Apps Script execution log for errors
3. Manually run `onOpen()` from Apps Script editor
4. Verify onOpen trigger exists in Apps Script triggers panel

---

### Authorize Xero not working
**Symptoms:** Menu item doesn't open modal dialog
**Causes:**
- Missing XeroAuth.js:authorizeXero function
- Missing script properties (XERO_CLIENT_ID, XERO_CLIENT_SECRET)
- OAuth2 library not added

**Solutions:**
1. Verify XeroAuth.js file exists and contains `function authorizeXero()`
2. Check script properties:
   ```javascript
   // Run in Apps Script editor
   const props = PropertiesService.getScriptProperties();
   console.log('XERO_CLIENT_ID:', props.getProperty('XERO_CLIENT_ID'));
   console.log('XERO_CLIENT_SECRET:', props.getProperty('XERO_CLIENT_SECRET'));
   ```
3. Ensure OAuth2 library is added:
   - Library ID: `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`
   - Identifier: `OAuth2`
4. Check execution log for specific error messages

---

### Sync Inventory fails with "Not authorized"
**Symptoms:** Sync fails with authorization error
**Cause:** Xero refresh token expired or not set

**Solution:**
1. Run "🔐 Authorize Xero" from menu
2. Complete OAuth flow in browser
3. Verify refresh token stored: `showScriptPropertiesMenu()` → look for `XERO_REFRESH_TOKEN`
4. Retry sync

---

### Menu items appear gray/disabled
**Symptoms:** Menu items visible but grayed out
**Cause:** Function doesn't exist or authorization required

**Solution:**
1. Check Apps Script execution log for function not found errors
2. Verify all required files are deployed (use `clasp push`)
3. Check if function has authorization requirements
4. Try running function directly from Apps Script editor for detailed error

---

### Advanced menu missing
**Symptoms:** Only "Fresh CP" menu appears, no "🔧 Advanced"
**Cause:** Execution error in buildAdvancedMenu_ or onOpen

**Solution:**
1. Check Apps Script execution log for errors
2. Manually run `onOpen()` from editor to see detailed errors
3. Verify all advanced menu functions exist (syncScopeBuildupsToVectorStoreMenu, checkIntegrationsHealthMenu, etc.)
4. Check for syntax errors in Menu.js

---

## Version History

### v2.0 (2026-01-13) - Streamlined Cleanup
**Changes:**
- Removed 13+ non-essential items (bootstrap, force operations, admin tools)
- Consolidated DataOps menu (28 items) → Main + Advanced (14 items total)
- Added Xero authorization to main menu (previously missing)
- Simplified onOpen() - direct build, no stage-based complexity
- Created this documentation file

**Rationale:**
- Production readiness (Phase 10 final validation)
- User feedback: "clean up the menu from all of the bullshit"
- Separate production workflow (main menu) from admin tools (advanced menu)

### v1.0 (Prior to 2026-01-12) - Legacy Complex System
**Structure:**
- buildCoreMenu_() - Stage 1 critical items
- rebuildMenuWithEnhancedFeatures_() - Stage 2 deferred loading
- buildDataOpsMenu_() - 28 admin/diagnostic items
- buildQuoteWorkspaceMenu_() - Quote-specific items

**Issues:**
- Too many menu items (30+ total)
- Confusing structure (4 separate menu builders)
- Admin tools mixed with production workflow
- Missing Xero authorization menu item

---

## Related Documentation

- **Menu.js** - Complete menu implementation
- **XeroAuth.js** - OAuth flow for Xero authorization
- **XeroSync_Enhanced.js** - Inventory sync to Xero
- **ConfigurationManager.js** - Config refresh logic
- **UnifiedLogger.js** - Logging system
- **App-script/ARCHITECTURE.md** - Overall system architecture
- **App-script/README.md** - System overview and setup

---

*This document is maintained as part of Phase 10 final validation*
*Last verified: 2026-01-13*
*Menu version: v2.0 (Streamlined)*

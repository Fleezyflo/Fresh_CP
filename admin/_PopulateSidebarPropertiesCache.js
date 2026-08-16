/**
 * ADMIN UTILITY: Populate Sidebar Properties cache from sheet (Phase 3)
 *
 * Purpose:
 * - One-shot warm-up of Tier 1 (Properties) from Tier 2 (Sheet)
 * - Reads sheet only — does NOT delete sheet rows or wipe Properties silently
 *
 * When to use:
 * - After deploying Phase 2/3 hybrid storage for users with existing sheet history
 * - Before expecting fast Properties-first sidebar loads
 *
 * Usage (Apps Script editor):
 *   populateSidebarStatePropertiesCache({ dryRun: true })   // preview
 *   populateSidebarStatePropertiesCache()                     // active user
 *   populateSidebarStatePropertiesCache({ userId: 'user@example.com', force: true })
 *
 * Multi-user: Properties hot cache uses one key per state type (Phase 2 design).
 * Run per user session or pass userId for a single targeted warm-up.
 *
 * Destructive wipe (explicit only): clearAllSidebarState() in _ClearCorruptedSidebarState.js
 */

function runPopulateSidebarPropertiesCacheMenu() {
  if (typeof populateSidebarStatePropertiesCache !== 'function') {
    Logger.log('populateSidebarStatePropertiesCache not found — is SidebarStateStorage.js loaded?');
    return;
  }

  Logger.log('Populating Sidebar Properties cache from sheet (active user)...');
  const summary = populateSidebarStatePropertiesCache({ dryRun: false });
  Logger.log(JSON.stringify(summary, null, 2));

  if (typeof checkSidebarStateLifecycleHealth === 'function') {
    checkSidebarStateLifecycleHealth({ source: 'populate-menu' });
  }
}

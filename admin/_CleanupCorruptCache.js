/**
 * ADMIN UTILITY: Clean up corrupt Properties cache
 *
 * Purpose:
 * - Fix JSON parse failures from truncated PropertiesService data
 * - Remove sidebar state that exceeded 9KB limit
 * - One-time cleanup to fix existing corrupt data
 *
 * When to run:
 * - Seeing "JSON parse failed" errors in logs
 * - Sidebar state not loading correctly
 * - After upgrading SidebarStateStorage.js with size checks
 *
 * Safe to run:
 * - Yes - only removes corrupt/unparseable data
 * - Sheet data remains intact (source of truth)
 * - Next load will rebuild cache from sheet
 *
 * @category Admin
 * @runScope Single execution
 */

function cleanupCorruptCacheAdmin() {
  try {
    Logger.log('=== Starting corrupt cache cleanup ===');

    // 1. Clean up corrupt sidebar state (from SidebarStateStorage.js)
    if (typeof cleanupCorruptPropertiesCache !== 'undefined') {
      Logger.log('Cleaning up corrupt Properties cache...');
      const sidebarResult = cleanupCorruptPropertiesCache();
      Logger.log('Sidebar cache cleanup result:', sidebarResult);
    } else {
      Logger.log('WARNING: cleanupCorruptPropertiesCache() not found - is SidebarStateStorage.js loaded?');
    }

    // 2. Clean up any other corrupt JSON in Properties
    Logger.log('Scanning all Script Properties for corrupt JSON...');
    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();
    let scanned = 0;
    let removed = 0;

    for (const key in allProps) {
      scanned++;
      const value = allProps[key];

      // Skip non-JSON properties (plain strings, numbers, etc.)
      if (!value || value.charAt(0) !== '{' && value.charAt(0) !== '[') {
        continue;
      }

      // Try to parse - if it fails, it's corrupt
      try {
        JSON.parse(value);
        // Valid JSON - keep it
      } catch (parseError) {
        // Corrupt JSON - remove it
        Logger.log('Found corrupt JSON property: ' + key + ' (size: ' + value.length + ' chars)');
        Logger.log('Parse error: ' + parseError.message);
        props.deleteProperty(key);
        removed++;
      }
    }

    const summary = {
      propertiesScanned: scanned,
      corruptRemoved: removed,
      sidebarCacheCleanup: sidebarResult || { checked: 0, removed: 0 }
    };

    Logger.log('=== Cleanup complete ===');
    Logger.log('Summary:', summary);

    // Show user-friendly toast
    if (typeof SpreadsheetApp !== 'undefined') {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Removed ' + removed + ' corrupt properties. Check logs for details.',
        'Cache Cleanup Complete',
        5
      );
    }

    return summary;

  } catch (error) {
    Logger.log('ERROR: Cleanup failed:', error);
    throw error;
  }
}

/**
 * Verify cache health after cleanup
 * Run this after cleanupCorruptCacheAdmin() to confirm fixes
 */
function verifyCacheHealth() {
  try {
    Logger.log('=== Verifying cache health ===');

    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();
    let total = 0;
    let validJson = 0;
    let plainStrings = 0;
    let issues = [];

    for (const key in allProps) {
      total++;
      const value = allProps[key];

      // Check if it looks like JSON
      if (value && (value.charAt(0) === '{' || value.charAt(0) === '[')) {
        try {
          JSON.parse(value);
          validJson++;
        } catch (parseError) {
          issues.push({
            key: key,
            size: value.length,
            error: parseError.message
          });
        }
      } else {
        plainStrings++;
      }
    }

    const report = {
      totalProperties: total,
      validJsonProperties: validJson,
      plainStringProperties: plainStrings,
      corruptProperties: issues.length,
      issues: issues
    };

    Logger.log('Health report:', report);

    if (issues.length === 0) {
      Logger.log('✓ All properties healthy');
      if (typeof SpreadsheetApp !== 'undefined') {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          'All ' + total + ' properties are valid',
          'Cache Health Check: PASS',
          3
        );
      }
    } else {
      Logger.log('✗ Found ' + issues.length + ' corrupt properties');
      if (typeof SpreadsheetApp !== 'undefined') {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          'Found ' + issues.length + ' corrupt properties. Run cleanupCorruptCacheAdmin() again.',
          'Cache Health Check: FAILED',
          5
        );
      }
    }

    return report;

  } catch (error) {
    Logger.log('ERROR: Health check failed:', error);
    throw error;
  }
}

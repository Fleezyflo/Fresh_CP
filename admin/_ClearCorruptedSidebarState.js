/**
 * _ClearCorruptedSidebarState - Clear corrupted sidebar state from Properties
 *
 * Purpose:
 * - Detect and delete Properties keys with truncated/corrupted JSON
 * - Fixes "JSON parse failed at position 5180" errors
 * - One-time cleanup operation
 *
 * Usage:
 * 1. Run clearCorruptedSidebarState() from Apps Script editor
 * 2. Review console output showing cleared keys
 * 3. Reload sidebar to verify errors gone
 *
 * @version 1.0.0
 * @since 2026-01-17
 */

function clearCorruptedSidebarState() {
  console.log('=== Corrupted Sidebar State Cleanup ===');
  console.log('Scanning SCRIPT properties for corrupted JSON...\n');

  // PropertiesLoader uses ScriptProperties, NOT UserProperties!
  const props = PropertiesService.getScriptProperties();
  const allKeys = props.getKeys();

  // Filter for sidebar-related keys (UPPERCASE pattern)
  const sidebarKeys = allKeys.filter(function(k) {
    return k.startsWith('SIDEBAR_STATE_') ||
           k.startsWith('sidebar_state_') ||
           k.indexOf('_draft') !== -1 ||
           k.indexOf('_commercialFit') !== -1 ||
           k.indexOf('_scopeMap') !== -1;
  });

  console.log('Found ' + sidebarKeys.length + ' sidebar state keys\n');

  let validCount = 0;
  let corruptedCount = 0;
  const corruptedKeys = [];

  sidebarKeys.forEach(function(key) {
    try {
      const raw = props.getProperty(key);

      if (!raw) {
        console.log('⚠ ' + key + ' - empty value (skipping)');
        return;
      }

      // Try to parse
      JSON.parse(raw);
      console.log('✓ ' + key + ' - valid JSON');
      validCount++;

    } catch (e) {
      // Corrupted - mark for deletion
      console.log('✗ ' + key + ' - CORRUPTED: ' + e.message);
      corruptedKeys.push(key);
      corruptedCount++;
    }
  });

  console.log('\n=== Scan Complete ===');
  console.log('Valid keys: ' + validCount);
  console.log('Corrupted keys: ' + corruptedCount);

  if (corruptedCount === 0) {
    console.log('\n✅ No corrupted keys found. System is clean!');
    return {
      scanned: sidebarKeys.length,
      valid: validCount,
      corrupted: 0,
      cleared: 0
    };
  }

  // Clear corrupted keys
  console.log('\n=== Clearing Corrupted Keys ===');

  corruptedKeys.forEach(function(key) {
    try {
      props.deleteProperty(key);
      console.log('🗑 Deleted: ' + key);
    } catch (deleteError) {
      console.error('❌ Failed to delete ' + key + ': ' + deleteError.message);
    }
  });

  console.log('\n✅ Cleanup complete!');
  console.log('Cleared ' + corruptedCount + ' corrupted keys');
  console.log('Next sidebar load will start fresh with clean state');

  return {
    scanned: sidebarKeys.length,
    valid: validCount,
    corrupted: corruptedCount,
    cleared: corruptedCount
  };
}

/**
 * Clear ALL sidebar state (nuclear option)
 * Use only if you want to reset everything
 */
function clearAllSidebarState() {
  console.log('=== NUCLEAR OPTION: Clearing ALL Sidebar State ===');
  console.warn('This will delete all saved sidebar data for all users!');

  // PropertiesLoader uses ScriptProperties, NOT UserProperties!
  const props = PropertiesService.getScriptProperties();
  const allKeys = props.getKeys();

  const sidebarKeys = allKeys.filter(function(k) {
    return k.startsWith('SIDEBAR_STATE_') ||
           k.startsWith('sidebar_state_') ||
           k.indexOf('_draft') !== -1 ||
           k.indexOf('_commercialFit') !== -1 ||
           k.indexOf('_scopeMap') !== -1 ||
           k.startsWith('SIDEBAR_MIGRATION_') ||
           k.startsWith('sidebar_migration_');
  });

  console.log('Deleting ' + sidebarKeys.length + ' keys...\n');

  sidebarKeys.forEach(function(key) {
    props.deleteProperty(key);
    console.log('🗑 Deleted: ' + key);
  });

  console.log('\n✅ All sidebar state cleared!');

  return {
    cleared: sidebarKeys.length
  };
}

/**
 * Show all sidebar-related Properties keys (diagnostic)
 */
function listSidebarStateKeys() {
  console.log('=== Sidebar State Keys ===\n');

  // PropertiesLoader uses ScriptProperties, NOT UserProperties!
  const props = PropertiesService.getScriptProperties();
  const allKeys = props.getKeys();

  const sidebarKeys = allKeys.filter(function(k) {
    return k.startsWith('SIDEBAR_STATE_') ||
           k.startsWith('sidebar_state_') ||
           k.indexOf('_draft') !== -1 ||
           k.indexOf('_commercialFit') !== -1 ||
           k.indexOf('_scopeMap') !== -1 ||
           k.startsWith('SIDEBAR_MIGRATION_') ||
           k.startsWith('sidebar_migration_');
  });

  if (sidebarKeys.length === 0) {
    console.log('No sidebar state keys found');
    return;
  }

  sidebarKeys.forEach(function(key) {
    const raw = props.getProperty(key);
    const size = raw ? raw.length : 0;
    const sizeKB = (size / 1024).toFixed(2);

    let status = '✓ valid';
    try {
      JSON.parse(raw);
    } catch (e) {
      status = '✗ corrupted: ' + e.message;
    }

    console.log(key + ' (' + sizeKB + ' KB) - ' + status);
  });

  console.log('\nTotal: ' + sidebarKeys.length + ' keys');
}

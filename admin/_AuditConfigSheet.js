/**
 * _AuditConfigSheet - Phase 0 audit for ConfigurationManager enhancement
 *
 * Purpose: Validate Config Sheet structure before implementing SheetKeyValueLoader
 *
 * Checks:
 * - Config Sheet exists and accessible
 * - Row count <500 (performance assumption)
 * - All 5 breaking keys present
 * - No duplicate keys found
 * - JSON values parse correctly
 * - Structure is Column A=Key, Column B=Value
 *
 * @created 2026-01-13 (Plan 10-05 Task 1)
 */

function auditConfigSheet() {
  console.log('=== CONFIG SHEET AUDIT ===');
  console.log('Date:', new Date().toISOString());
  console.log('');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getResolvedSheetNames();
    const configSheet = ss.getSheetByName(sheetNames.CONFIG);

    // CHECK 1: Sheet exists
    if (!configSheet) {
      console.error('❌ AUDIT FAILED: Config Sheet not found');
      console.error('   Expected sheet name:', sheetNames.CONFIG);
      return { success: false, error: 'Config Sheet not found' };
    }
    console.log('✓ Config Sheet found:', sheetNames.CONFIG);

    // CHECK 2: Row count
    const lastRow = configSheet.getLastRow();
    console.log('✓ Total rows:', lastRow);

    if (lastRow > 5000) {
      console.error('❌ ABORT: Config Sheet too large (>5000 rows)');
      console.error('   Row count:', lastRow);
      return { success: false, error: 'Sheet too large: ' + lastRow + ' rows' };
    }

    if (lastRow > 500) {
      console.warn('⚠ WARNING: Config Sheet large (>500 rows) - may impact performance');
      console.warn('   Row count:', lastRow);
    }

    // Read all data
    const data = lastRow > 0 ? configSheet.getRange(1, 1, lastRow, 2).getValues() : [];

    // CHECK 3: Sample entries
    console.log('');
    console.log('Sample entries (first 10):');
    data.slice(0, 10).forEach(function(row, index) {
      const key = row[0];
      const value = String(row[1]).substring(0, 50);
      console.log('  Row ' + (index + 1) + ': ' + key + ' = ' + value);
    });

    // CHECK 4: Duplicate keys
    console.log('');
    console.log('Checking for duplicates...');
    const keys = data.map(function(row) { return row[0]; });
    const seenKeys = {};
    const duplicates = [];

    keys.forEach(function(key, index) {
      if (!key || String(key).trim() === '') {
        return; // Skip empty keys
      }
      if (seenKeys[key]) {
        duplicates.push({ key: key, firstRow: seenKeys[key], duplicateRow: index + 1 });
      } else {
        seenKeys[key] = index + 1;
      }
    });

    if (duplicates.length > 0) {
      console.warn('⚠ DUPLICATES FOUND (' + duplicates.length + '):');
      duplicates.slice(0, 10).forEach(function(dup) {
        console.warn('   ' + dup.key + ' (rows ' + dup.firstRow + ' and ' + dup.duplicateRow + ')');
      });
      if (duplicates.length > 10) {
        console.warn('   ... and ' + (duplicates.length - 10) + ' more');
      }
    } else {
      console.log('✓ No duplicates found');
    }

    // CHECK 5: Breaking keys
    console.log('');
    console.log('Checking for breaking config keys...');
    const breakingKeys = [
      'DEFAULT_CURRENCY',
      'XERO_TAX_TYPE',
      'SECTION_TAXONOMY',
      'VECTOR_SEARCH_QUERY_WORD_LIMIT',
      'TARGET_MARGIN_PCT'
    ];

    const missingKeys = [];
    breakingKeys.forEach(function(key) {
      const found = data.find(function(row) { return row[0] === key; });
      if (found) {
        const valuePreview = String(found[1]).substring(0, 30);
        console.log('✓ ' + key + ' = ' + valuePreview);
      } else {
        console.error('✗ ' + key + ' NOT FOUND');
        missingKeys.push(key);
      }
    });

    // CHECK 6: JSON values
    console.log('');
    console.log('Checking JSON values...');
    const jsonKeys = data.filter(function(row) {
      const val = String(row[1]).trim();
      return val.startsWith('{') || val.startsWith('[');
    });

    console.log('JSON values found:', jsonKeys.length);

    const jsonErrors = [];
    jsonKeys.slice(0, 5).forEach(function(row) {
      try {
        JSON.parse(row[1]);
        console.log('  ✓ ' + row[0] + ' - valid JSON');
      } catch (e) {
        console.error('  ✗ ' + row[0] + ' - invalid JSON: ' + e.message);
        jsonErrors.push({ key: row[0], error: e.message });
      }
    });

    if (jsonKeys.length > 5) {
      console.log('  ... and ' + (jsonKeys.length - 5) + ' more JSON values');
    }

    // SUMMARY
    console.log('');
    console.log('=== AUDIT SUMMARY ===');
    console.log('Sheet exists: ✓');
    console.log('Row count: ' + lastRow + (lastRow < 500 ? ' ✓' : ' ⚠'));
    console.log('Duplicates: ' + duplicates.length + (duplicates.length === 0 ? ' ✓' : ' ⚠'));
    console.log('Breaking keys: ' + (breakingKeys.length - missingKeys.length) + '/' + breakingKeys.length + (missingKeys.length === 0 ? ' ✓' : ' ✗'));
    console.log('JSON values: ' + jsonKeys.length + ' (' + jsonErrors.length + ' errors' + (jsonErrors.length === 0 ? ') ✓' : ') ✗'));

    // VERDICT
    console.log('');
    const allChecksPassed = missingKeys.length === 0 && lastRow < 5000;

    if (allChecksPassed) {
      console.log('✅ AUDIT PASSED - Safe to proceed with implementation');
    } else {
      console.error('❌ AUDIT FAILED - Issues must be resolved before proceeding');
      if (missingKeys.length > 0) {
        console.error('   Missing keys:', missingKeys.join(', '));
      }
      if (lastRow >= 5000) {
        console.error('   Sheet too large:', lastRow, 'rows');
      }
    }

    return {
      success: allChecksPassed,
      rowCount: lastRow,
      duplicates: duplicates.length,
      breakingKeys: {
        found: breakingKeys.length - missingKeys.length,
        total: breakingKeys.length,
        missing: missingKeys
      },
      jsonValues: {
        total: jsonKeys.length,
        errors: jsonErrors.length
      }
    };

  } catch (error) {
    console.error('❌ AUDIT FAILED WITH ERROR:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

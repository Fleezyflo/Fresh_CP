/**
 * Audit sensitive keys in Config sheet
 * Identifies keys that should be in Script Properties instead
 */

// Define sensitive keys that must NEVER be in Config sheet
const SENSITIVE_KEYS = Object.freeze([
  'OPENAI_VECTOR_STORE_ID',
  'OPENAI_ASSISTANT_MODEL',
  'OPENAI_ASSISTANT_ID',
  'OPENAI_API_KEY',
  'XERO_CLIENT_ID',
  'XERO_CLIENT_SECRET',
  'XERO_TENANT_ID',
  'GOOGLE_PICKER_KEY',
  'LLM_API_KEY'
]);

/**
 * Main audit function
 * Scans Config sheet for sensitive keys
 */
function auditSensitiveKeysInConfigSheet() {
  console.log('');
  console.log('===================================');
  console.log('SENSITIVE KEY AUDIT');
  console.log('===================================');
  console.log('');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName('Config');

    if (!configSheet) {
      console.log('ℹ️  No Config sheet found');
      console.log('   This is acceptable if you store all config in Script Properties');
      return { found: [], missing: SENSITIVE_KEYS };
    }

    const lastRow = configSheet.getLastRow();
    if (lastRow < 1) {
      console.log('ℹ️  Config sheet is empty');
      return { found: [], missing: SENSITIVE_KEYS };
    }

    // Get all data from Config sheet (assuming key-value pairs in columns A-B)
    const data = configSheet.getRange(1, 1, lastRow, 2).getValues();

    const foundKeys = [];
    const foundDetails = [];
    const missingKeys = [];

    // Check each sensitive key
    SENSITIVE_KEYS.forEach(function(sensitiveKey) {
      let found = false;
      let rowNumber = -1;
      let value = '';

      // Search for key in Config sheet
      for (let i = 0; i < data.length; i++) {
        const key = data[i][0];
        if (key === sensitiveKey) {
          found = true;
          rowNumber = i + 1; // 1-indexed
          value = data[i][1];
          break;
        }
      }

      if (found) {
        foundKeys.push(sensitiveKey);
        foundDetails.push({
          key: sensitiveKey,
          row: rowNumber,
          hasValue: !!(value && String(value).trim()),
          valuePreview: value ? String(value).substring(0, 20) + '...' : '(empty)'
        });
      } else {
        missingKeys.push(sensitiveKey);
      }
    });

    // Display results
    console.log('Scan Results:');
    console.log('-------------');
    console.log('Total sensitive keys checked: ' + SENSITIVE_KEYS.length);
    console.log('');

    if (foundKeys.length > 0) {
      console.log('🔴 SECURITY RISK: Found ' + foundKeys.length + ' sensitive key(s) in Config sheet:');
      console.log('');

      foundDetails.forEach(function(detail) {
        console.log('  ❌ ' + detail.key);
        console.log('     Row: ' + detail.row);
        console.log('     Has Value: ' + detail.hasValue);
        if (detail.hasValue) {
          console.log('     Preview: ' + detail.valuePreview);
        }
        console.log('');
      });

      console.log('⚠️  ACTION REQUIRED:');
      console.log('   1. Run migrateConfigSheetToScriptProperties() to move these keys');
      console.log('   2. Or manually delete these rows from Config sheet');
      console.log('   3. Then run verifySensitiveKeysInScriptProperties() to confirm');
      console.log('');

    } else {
      console.log('✅ SECURE: No sensitive keys found in Config sheet');
      console.log('');
    }

    console.log('Keys NOT in Config sheet (correct): ' + missingKeys.length);
    missingKeys.forEach(function(key) {
      console.log('  ✅ ' + key);
    });
    console.log('');

    console.log('===================================');
    console.log('AUDIT COMPLETE');
    console.log('===================================');
    console.log('');

    return {
      found: foundKeys,
      foundDetails: foundDetails,
      missing: missingKeys
    };

  } catch (error) {
    console.error('❌ Audit failed: ' + error);
    console.error('   ' + error.stack);
    throw error;
  }
}

/**
 * Verify sensitive keys exist in Script Properties
 */
function verifySensitiveKeysInScriptProperties() {
  console.log('');
  console.log('===================================');
  console.log('SCRIPT PROPERTIES VERIFICATION');
  console.log('===================================');
  console.log('');

  try {
    const props = PropertiesService.getScriptProperties();
    const results = {};
    let setCount = 0;
    let missingCount = 0;

    SENSITIVE_KEYS.forEach(function(key) {
      const value = props.getProperty(key);

      if (value && String(value).trim()) {
        results[key] = '✅ SET (' + String(value).substring(0, 8) + '...)';
        setCount++;
      } else {
        results[key] = '❌ MISSING';
        missingCount++;
      }
    });

    console.log('Script Properties Status:');
    console.log('-------------------------');

    Object.keys(results).forEach(function(key) {
      console.log(key + ': ' + results[key]);
    });

    console.log('');
    console.log('Summary:');
    console.log('  Total keys: ' + SENSITIVE_KEYS.length);
    console.log('  Set: ' + setCount);
    console.log('  Missing: ' + missingCount);
    console.log('');

    if (missingCount > 0) {
      console.log('⚠️  CONFIGURATION INCOMPLETE');
      console.log('   Some sensitive keys are missing from Script Properties');
      console.log('');
      console.log('   To set Script Properties:');
      console.log('   1. Open Apps Script editor');
      console.log('   2. Click Project Settings (⚙️) in left sidebar');
      console.log('   3. Scroll to "Script Properties"');
      console.log('   4. Click "Add script property"');
      console.log('   5. Enter key name and value');
      console.log('   6. Click "Save script property"');
      console.log('');
    } else {
      console.log('✅ ALL SENSITIVE KEYS ARE SET');
      console.log('');
    }

    console.log('===================================');
    console.log('VERIFICATION COMPLETE');
    console.log('===================================');
    console.log('');

    return results;

  } catch (error) {
    console.error('❌ Verification failed: ' + error);
    throw error;
  }
}

/**
 * Migrate sensitive keys from Config sheet to Script Properties
 * Then delete them from Config sheet
 */
function migrateConfigSheetToScriptProperties() {
  console.log('');
  console.log('===================================');
  console.log('MIGRATE SENSITIVE KEYS');
  console.log('===================================');
  console.log('');

  // First, run audit to see what we're migrating
  const auditResults = auditSensitiveKeysInConfigSheet();

  if (auditResults.found.length === 0) {
    console.log('ℹ️  No sensitive keys found in Config sheet');
    console.log('   Nothing to migrate');
    return { migrated: 0, deleted: 0 };
  }

  console.log('');
  console.log('Starting migration...');
  console.log('');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName('Config');
    const props = PropertiesService.getScriptProperties();

    let migratedCount = 0;
    let deletedCount = 0;

    // Process each found key
    auditResults.foundDetails.forEach(function(detail) {
      console.log('Processing: ' + detail.key);

      // Only migrate if it has a value
      if (detail.hasValue) {
        const currentValue = configSheet.getRange(detail.row, 2).getValue();

        // Set in Script Properties
        props.setProperty(detail.key, String(currentValue));
        console.log('  ✅ Copied to Script Properties');
        migratedCount++;
      }

      // Delete from Config sheet (delete entire row)
      configSheet.deleteRow(detail.row);
      console.log('  ✅ Deleted from Config sheet (row ' + detail.row + ')');
      deletedCount++;

      console.log('');
    });

    console.log('Migration Summary:');
    console.log('  Migrated: ' + migratedCount);
    console.log('  Deleted: ' + deletedCount);
    console.log('');

    console.log('✅ MIGRATION COMPLETE');
    console.log('');
    console.log('Next steps:');
    console.log('1. Run verifySensitiveKeysInScriptProperties() to confirm');
    console.log('2. Test the application to ensure it still works');
    console.log('');

    console.log('===================================');
    console.log('');

    return { migrated: migratedCount, deleted: deletedCount };

  } catch (error) {
    console.error('❌ Migration failed: ' + error);
    console.error('   Rolling back is not automatic - review Config sheet manually');
    throw error;
  }
}

/**
 * Run complete security audit
 */
function runCompleteSensitiveKeyAudit() {
  console.log('');
  console.log('################################################');
  console.log('#  COMPLETE SENSITIVE KEY SECURITY AUDIT      #');
  console.log('################################################');
  console.log('');

  // Step 1: Audit Config sheet
  console.log('STEP 1: Scanning Config sheet...');
  console.log('');
  const auditResults = auditSensitiveKeysInConfigSheet();

  // Step 2: Verify Script Properties
  console.log('');
  console.log('STEP 2: Verifying Script Properties...');
  console.log('');
  const verifyResults = verifySensitiveKeysInScriptProperties();

  // Step 3: Recommendations
  console.log('');
  console.log('STEP 3: Recommendations');
  console.log('');

  if (auditResults.found.length > 0) {
    console.log('⚠️  SECURITY ISSUE DETECTED');
    console.log('   ' + auditResults.found.length + ' sensitive key(s) found in Config sheet');
    console.log('');
    console.log('   RECOMMENDED ACTION:');
    console.log('   Run: migrateConfigSheetToScriptProperties()');
    console.log('');
  } else {
    console.log('✅ Config sheet is secure (no sensitive keys)');
    console.log('');
  }

  // Count missing keys in Script Properties
  let missingCount = 0;
  Object.keys(verifyResults).forEach(function(key) {
    if (verifyResults[key].indexOf('MISSING') !== -1) {
      missingCount++;
    }
  });

  if (missingCount > 0) {
    console.log('⚠️  CONFIGURATION INCOMPLETE');
    console.log('   ' + missingCount + ' sensitive key(s) missing from Script Properties');
    console.log('');
    console.log('   REQUIRED ACTION:');
    console.log('   Set these keys manually in Script Properties');
    console.log('   (See verification output above for details)');
    console.log('');
  } else {
    console.log('✅ All sensitive keys are set in Script Properties');
    console.log('');
  }

  console.log('################################################');
  console.log('#  AUDIT COMPLETE                             #');
  console.log('################################################');
  console.log('');
}

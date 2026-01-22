/**
 * Diagnostic tool to track what's deleting script properties
 *
 * HOW TO USE:
 * 1. Open Apps Script Editor
 * 2. Run: enablePropertyMonitoring()
 * 3. Wait for properties to get deleted
 * 4. Run: showPropertyDeletionReport()
 * 5. Check execution log for detailed report
 *
 * This will show you EXACTLY what functions are deleting properties.
 */

/**
 * Enable property monitoring
 * Call this BEFORE properties get deleted
 */
function enablePropertyMonitoring() {
  if (typeof enablePropertiesMonitoring === 'function') {
    enablePropertiesMonitoring();
    Logger.log('✅ Property monitoring ENABLED');
    Logger.log('Properties monitor will now track all deleteProperty() calls');
    Logger.log('Wait for properties to be deleted, then run: showPropertyDeletionReport()');
  } else {
    Logger.log('❌ PropertiesMonitor not available');
    Logger.log('Make sure 00_PropertiesMonitor.js is deployed');
  }
}

/**
 * Show report of all property deletions
 * Call this AFTER properties get deleted
 */
function showPropertyDeletionReport() {
  if (typeof getPropsAccessLog !== 'function') {
    Logger.log('❌ PropertiesMonitor not available');
    return;
  }

  const log = getPropsAccessLog();

  if (!log || log.length === 0) {
    Logger.log('⚠️ No property access logged yet');
    Logger.log('Make sure you ran: enablePropertyMonitoring() first');
    return;
  }

  Logger.log('='.repeat(80));
  Logger.log('PROPERTY DELETION REPORT');
  Logger.log('='.repeat(80));
  Logger.log('Total property operations: ' + log.length);
  Logger.log('');

  // Find all deletions
  const deletions = log.filter(function(record) {
    return record.operation === 'deleteProperty' || record.operation === 'deleteAllProperties';
  });

  if (deletions.length === 0) {
    Logger.log('✅ NO DELETIONS FOUND');
    Logger.log('Your properties are not being deleted by any code.');
    Logger.log('');
    Logger.log('Possible causes:');
    Logger.log('1. Properties were deleted before monitoring was enabled');
    Logger.log('2. Properties were deleted manually via Apps Script editor');
    Logger.log('3. Properties were deleted via different project/script');
    return;
  }

  Logger.log('🚨 FOUND ' + deletions.length + ' DELETION(S)');
  Logger.log('');

  deletions.forEach(function(deletion, index) {
    Logger.log('-'.repeat(80));
    Logger.log('DELETION #' + (index + 1));
    Logger.log('-'.repeat(80));
    Logger.log('Operation: ' + deletion.operation);
    Logger.log('Key deleted: ' + deletion.key);
    Logger.log('Timestamp: ' + new Date(deletion.timestamp).toLocaleString());
    Logger.log('Duration: ' + deletion.duration + 'ms');

    if (deletion.error) {
      Logger.log('ERROR: ' + deletion.error);
    }

    Logger.log('');
    Logger.log('Stack trace at time of deletion:');
    try {
      // Try to get stack trace
      const stack = new Error().stack;
      Logger.log(stack || 'Stack trace not available');
    } catch (e) {
      Logger.log('Stack trace not available');
    }
    Logger.log('');
  });

  Logger.log('='.repeat(80));
  Logger.log('SUMMARY');
  Logger.log('='.repeat(80));

  // Group deletions by key
  const byKey = {};
  deletions.forEach(function(deletion) {
    const key = deletion.key;
    if (!byKey[key]) {
      byKey[key] = 0;
    }
    byKey[key]++;
  });

  Logger.log('Properties deleted (by key):');
  Object.keys(byKey).forEach(function(key) {
    Logger.log('  ' + key + ': ' + byKey[key] + ' time(s)');
  });

  Logger.log('');
  Logger.log('='.repeat(80));
  Logger.log('NEXT STEPS');
  Logger.log('='.repeat(80));
  Logger.log('1. Look at the stack traces above to see what functions called deleteProperty()');
  Logger.log('2. Search your codebase for those function names');
  Logger.log('3. Add logging or breakpoints to those functions');
  Logger.log('4. Run clearPropertyLog() to reset monitoring');
  Logger.log('5. Trigger the issue again to get fresh stack traces');
}

/**
 * Clear the property access log
 * Use this to reset monitoring
 */
function clearPropertyLog() {
  if (typeof clearPropsLog === 'function') {
    clearPropsLog();
    Logger.log('✅ Property access log cleared');
    Logger.log('Run enablePropertyMonitoring() again to start fresh');
  } else {
    Logger.log('❌ clearPropsLog() not available');
  }
}

/**
 * Show ALL property operations (not just deletions)
 * Useful for seeing the full picture
 */
function showAllPropertyOperations() {
  if (typeof getPropertiesMonitorReport === 'function') {
    const report = getPropertiesMonitorReport();
    Logger.log(report);
  } else {
    Logger.log('❌ getPropertiesMonitorReport() not available');
  }
}

/**
 * Alternative: Check if properties exist RIGHT NOW
 * This doesn't require monitoring
 */
function checkWhichPropertiesExist() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();

  Logger.log('='.repeat(80));
  Logger.log('CURRENT SCRIPT PROPERTIES');
  Logger.log('='.repeat(80));
  Logger.log('Total properties: ' + Object.keys(all).length);
  Logger.log('');

  // Known important properties
  const important = [
    'SOURCE_DATA_FOLDER_ID',
    'OPENAI_API_KEY',
    'OPENAI_ASSISTANT_ID',
    'OPENAI_PROMPT_ID',
    'OPENAI_VECTOR_STORE_ID',
    'XERO_CLIENT_ID',
    'XERO_CLIENT_SECRET',
    'XERO_REFRESH_TOKEN',
    'XERO_TENANT_ID',
    'LLM_API_KEY',
    'GOOGLE_PICKER_KEY'
  ];

  Logger.log('IMPORTANT PROPERTIES:');
  important.forEach(function(key) {
    const exists = all.hasOwnProperty(key);
    const value = exists ? all[key] : null;
    const status = exists ? '✅ EXISTS' : '❌ MISSING';
    const display = exists ? (value && value.length > 20 ? value.substring(0, 20) + '...' : value) : 'N/A';

    Logger.log('  ' + key + ': ' + status + ' ' + (exists ? '(' + display + ')' : ''));
  });

  Logger.log('');
  Logger.log('ALL PROPERTIES:');
  Object.keys(all).sort().forEach(function(key) {
    const value = all[key];
    const display = value && value.length > 50 ? value.substring(0, 50) + '...' : value;
    Logger.log('  ' + key + ' = ' + display);
  });

  Logger.log('');
  Logger.log('='.repeat(80));
}

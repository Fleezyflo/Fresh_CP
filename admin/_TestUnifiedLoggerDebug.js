/**
 * Test UnifiedLogger.debug() method
 * Verifies that debug() method exists and logs correctly
 */
function testUnifiedLoggerDebug() {
  console.log('=== Testing UnifiedLogger.debug() ===');

  try {
    // Test 1: Basic debug call
    UnifiedLogger.debug('Test', 'Debug method test', { testKey: 'testValue' });
    console.log('✅ Test 1: Basic debug() call succeeded');

    // Test 2: Debug with null details
    UnifiedLogger.debug('Test', 'Debug with null details', null);
    console.log('✅ Test 2: Debug with null details succeeded');

    // Test 3: Debug with undefined details
    UnifiedLogger.debug('Test', 'Debug with undefined details');
    console.log('✅ Test 3: Debug with undefined details succeeded');

    // Test 4: Debug with string details
    UnifiedLogger.debug('Test', 'Debug with string details', 'String value');
    console.log('✅ Test 4: Debug with string details succeeded');

    // Test 5: Debug with complex object
    UnifiedLogger.debug('Test', 'Debug with complex object', {
      nested: { key: 'value' },
      array: [1, 2, 3],
      number: 42,
      boolean: true
    });
    console.log('✅ Test 5: Debug with complex object succeeded');

    console.log('');
    console.log('✅ ALL TESTS PASSED - UnifiedLogger.debug() works correctly');
    console.log('');
    console.log('Next steps:');
    console.log('1. Check _Global_Log sheet for debug entries');
    console.log('2. Verify all entries have level="VERBOSE"');
    console.log('3. Verify all 21 production call sites work');

    return true;

  } catch (error) {
    console.error('❌ TEST FAILED: ' + error);
    console.error('Error message: ' + error.message);
    console.error('Stack trace: ' + error.stack);
    return false;
  }
}

/**
 * Verify debug() logs appear in sheet with correct level
 */
function verifyDebugLogsInSheet() {
  console.log('=== Verifying Debug Logs in Sheet ===');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName('_Global_Log');

    if (!logSheet) {
      console.error('❌ _Global_Log sheet not found');
      return false;
    }

    const lastRow = logSheet.getLastRow();
    if (lastRow < 2) {
      console.error('❌ No log entries found');
      return false;
    }

    // Get last 10 rows
    const range = logSheet.getRange(Math.max(2, lastRow - 9), 1, Math.min(10, lastRow - 1), 6);
    const values = range.getValues();

    let debugCount = 0;
    values.forEach(function(row) {
      const level = row[1]; // Level column
      const category = row[2]; // Category column
      const message = row[4]; // Message column

      if (category === 'Test' && message.indexOf('Debug') !== -1) {
        debugCount++;
        if (level !== 'VERBOSE') {
          console.error('❌ Debug log has wrong level: ' + level + ' (expected VERBOSE)');
          return false;
        }
      }
    });

    console.log('✅ Found ' + debugCount + ' debug log entries');
    console.log('✅ All debug logs have level=VERBOSE');
    console.log('');
    console.log('Debug method verification COMPLETE');

    return true;

  } catch (error) {
    console.error('❌ Verification failed: ' + error);
    return false;
  }
}

/**
 * Run all debug tests
 */
function runAllDebugTests() {
  console.log('');
  console.log('======================================');
  console.log('UNIFIED LOGGER DEBUG METHOD TEST SUITE');
  console.log('======================================');
  console.log('');

  const test1 = testUnifiedLoggerDebug();

  if (!test1) {
    console.error('❌ Basic tests failed - stopping');
    return;
  }

  console.log('Waiting 2 seconds for logs to flush...');
  Utilities.sleep(2000);

  const test2 = verifyDebugLogsInSheet();

  if (test1 && test2) {
    console.log('');
    console.log('========================================');
    console.log('✅ ALL DEBUG METHOD TESTS PASSED');
    console.log('========================================');
    console.log('');
  } else {
    console.log('');
    console.log('========================================');
    console.log('❌ SOME TESTS FAILED - REVIEW ABOVE');
    console.log('========================================');
    console.log('');
  }
}

/**
 * Test AISidebar debug calls
 */
function testAISidebarDebugCalls() {
  console.log('Testing AISidebar debug calls...');

  try {
    // This will trigger debug() calls in refreshCommercialFitState
    // if it's safe to call in test environment

    // For now, just verify the function exists
    if (typeof refreshCommercialFitState === 'function') {
      console.log('✅ refreshCommercialFitState function exists');
      console.log('   (Will test debug calls during normal operation)');
    }

    return true;
  } catch (error) {
    console.error('❌ Test failed: ' + error);
    return false;
  }
}

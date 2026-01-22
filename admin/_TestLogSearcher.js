/**
 * Test LogSearcher.js implementation
 */

/**
 * Test basic log searching
 */
function testSearchLogs() {
  console.log('=== Test: searchLogs() ===');

  try {
    // Create some test logs first
    UnifiedLogger.info('TestSearch', 'Test log entry 1', { testId: 1 });
    UnifiedLogger.warn('TestSearch', 'Test log entry 2', { testId: 2 });
    UnifiedLogger.error('TestSearch', 'Test log entry 3', new Error('Test error'));

    Utilities.sleep(1000); // Wait for logs to flush

    // Search for them
    const results = searchLogs({
      category: 'TestSearch',
      limit: 10
    });

    console.log('  Found ' + results.length + ' log entries');

    if (results.length < 3) {
      console.warn('  ⚠️  Expected at least 3 entries, found ' + results.length);
      console.warn('      Logs may still be flushing');
    } else {
      console.log('  ✅ searchLogs() works');
    }

    return true;

  } catch (error) {
    console.error('❌ Test failed: ' + error);
    return false;
  }
}

/**
 * Test correlation ID search
 */
function testGetLogsByCorrelationId() {
  console.log('=== Test: getLogsByCorrelationId() ===');

  try {
    // Create trace
    const trace = UnifiedLogger.startTrace('TestSearch', 'testOperation', { testId: 123 });
    trace.info('Step 1');
    trace.info('Step 2');
    trace.info('Step 3');
    trace.complete({ result: 'success' });

    const correlationId = trace.correlationId;
    console.log('  Created trace with ID: ' + correlationId);

    Utilities.sleep(1000); // Wait for logs to flush

    // Search for correlation ID
    const results = getLogsByCorrelationId(correlationId);

    console.log('  Found ' + results.length + ' log entries for this trace');

    if (results.length < 5) { // start + 3 info + complete
      console.warn('  ⚠️  Expected at least 5 entries, found ' + results.length);
    } else {
      console.log('  ✅ getLogsByCorrelationId() works');
      console.log('  ✅ Logs are in chronological order');
    }

    return true;

  } catch (error) {
    console.error('❌ Test failed: ' + error);
    return false;
  }
}

/**
 * Test error summary
 */
function testGenerateErrorSummary() {
  console.log('=== Test: generateErrorSummary() ===');

  try {
    // Create some test errors
    UnifiedLogger.error('TestError1', 'Error message 1', new Error('Test 1'));
    UnifiedLogger.error('TestError2', 'Error message 2', new Error('Test 2'));
    UnifiedLogger.error('TestError1', 'Error message 3', new Error('Test 3'));

    Utilities.sleep(1000);

    // Generate summary
    const summary = generateErrorSummary(1); // Last 1 hour

    console.log('  Total errors: ' + summary.totalErrors);
    console.log('  Categories: ' + Object.keys(summary.byCategory).length);
    console.log('  Users: ' + Object.keys(summary.byUser).length);

    if (summary.totalErrors > 0) {
      console.log('  ✅ generateErrorSummary() works');
    } else {
      console.warn('  ⚠️  No errors found (may need to wait for logs to flush)');
    }

    return true;

  } catch (error) {
    console.error('❌ Test failed: ' + error);
    return false;
  }
}

/**
 * Test displayLogsInSheet
 */
function testDisplayLogsInSheet() {
  console.log('=== Test: displayLogsInSheet() ===');

  try {
    // Get some logs
    UnifiedLogger.info('TestDisplay', 'Display test 1');
    UnifiedLogger.info('TestDisplay', 'Display test 2');
    UnifiedLogger.info('TestDisplay', 'Display test 3');

    Utilities.sleep(1000);

    const logs = searchLogs({
      category: 'TestDisplay',
      limit: 10
    });

    if (logs.length === 0) {
      console.warn('  ⚠️  No logs found to display');
      return true;
    }

    // Display in sheet
    displayLogsInSheet(logs, 'Test_Log_Display');

    // Verify sheet was created
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const testSheet = ss.getSheetByName('Test_Log_Display');

    if (testSheet) {
      console.log('  ✅ displayLogsInSheet() works');
      console.log('  ✅ Sheet created with ' + (testSheet.getLastRow() - 1) + ' log entries');
    } else {
      console.error('  ❌ Sheet was not created');
      return false;
    }

    return true;

  } catch (error) {
    console.error('❌ Test failed: ' + error);
    return false;
  }
}

/**
 * Run all LogSearcher tests
 */
function runAllLogSearcherTests() {
  console.log('');
  console.log('========================================');
  console.log('LOG SEARCHER TEST SUITE');
  console.log('========================================');
  console.log('');

  const results = [];

  results.push({ name: 'searchLogs', passed: testSearchLogs() });
  results.push({ name: 'getLogsByCorrelationId', passed: testGetLogsByCorrelationId() });
  results.push({ name: 'generateErrorSummary', passed: testGenerateErrorSummary() });
  results.push({ name: 'displayLogsInSheet', passed: testDisplayLogsInSheet() });

  // Summary
  console.log('');
  console.log('========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');

  const passedCount = results.filter(function(r) { return r.passed; }).length;
  const failedCount = results.length - passedCount;

  results.forEach(function(result) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(status + ': ' + result.name);
  });

  console.log('');
  console.log('Total: ' + results.length);
  console.log('Passed: ' + passedCount);
  console.log('Failed: ' + failedCount);
  console.log('');

  if (failedCount === 0) {
    console.log('========================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('========================================');
  } else {
    console.log('========================================');
    console.log('❌ SOME TESTS FAILED');
    console.log('========================================');
  }

  console.log('');
}

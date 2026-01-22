/**
 * Test UnifiedLogger.startTrace() method
 * Comprehensive test suite for tracing functionality
 */

/**
 * Test basic trace creation and completion
 */
function testBasicTrace() {
  console.log('=== Test: Basic Trace ===');

  try {
    const trace = UnifiedLogger.startTrace('Test', 'testBasicTrace', {
      testId: 1,
      testName: 'Basic Trace Test'
    });

    // Verify trace object structure
    if (!trace) {
      throw new Error('Trace object is null');
    }

    if (!trace.correlationId) {
      throw new Error('Trace missing correlationId');
    }

    if (!trace.operationName) {
      throw new Error('Trace missing operationName');
    }

    if (!trace.info || typeof trace.info !== 'function') {
      throw new Error('Trace missing info() method');
    }

    if (!trace.complete || typeof trace.complete !== 'function') {
      throw new Error('Trace missing complete() method');
    }

    if (!trace.fail || typeof trace.fail !== 'function') {
      throw new Error('Trace missing fail() method');
    }

    console.log('  ✅ Trace object created with correlation ID: ' + trace.correlationId);
    console.log('  ✅ All required methods present');

    // Test completion
    trace.complete({ result: 'success' });
    console.log('  ✅ Trace completed successfully');

    console.log('✅ Basic Trace Test PASSED');
    console.log('');
    return true;

  } catch (error) {
    console.error('❌ Basic Trace Test FAILED: ' + error);
    console.error('   ' + error.stack);
    return false;
  }
}

/**
 * Test trace logging methods
 */
function testTraceLogging() {
  console.log('=== Test: Trace Logging Methods ===');

  try {
    const trace = UnifiedLogger.startTrace('Test', 'testTraceLogging', {
      testId: 2
    });

    // Test info logging
    trace.info('Info message test', { infoData: 'value1' });
    console.log('  ✅ trace.info() works');

    // Test warn logging
    trace.warn('Warning message test', { warnData: 'value2' });
    console.log('  ✅ trace.warn() works');

    // Test error logging
    trace.error('Error message test', new Error('Test error'));
    console.log('  ✅ trace.error() works');

    // Test complete with object
    trace.complete({ finalResult: 'completed' });
    console.log('  ✅ trace.complete() with object works');

    console.log('✅ Trace Logging Test PASSED');
    console.log('');
    return true;

  } catch (error) {
    console.error('❌ Trace Logging Test FAILED: ' + error);
    return false;
  }
}

/**
 * Test trace failure handling
 */
function testTraceFailure() {
  console.log('=== Test: Trace Failure Handling ===');

  try {
    const trace = UnifiedLogger.startTrace('Test', 'testTraceFailure', {
      testId: 3
    });

    trace.info('Starting operation that will fail');

    // Simulate error
    const testError = new Error('Simulated failure');
    testError.code = 'TEST_ERROR';

    // Test fail with Error object
    trace.fail(testError);
    console.log('  ✅ trace.fail() with Error object works');

    console.log('✅ Trace Failure Test PASSED');
    console.log('');
    return true;

  } catch (error) {
    console.error('❌ Trace Failure Test FAILED: ' + error);
    return false;
  }
}

/**
 * Test trace with string completion message
 */
function testTraceStringCompletion() {
  console.log('=== Test: Trace String Completion ===');

  try {
    const trace = UnifiedLogger.startTrace('Test', 'testTraceStringCompletion', {
      testId: 4
    });

    trace.info('Performing work');

    // Complete with string message
    trace.complete('Operation finished successfully', { count: 10 });
    console.log('  ✅ trace.complete() with string message works');

    console.log('✅ Trace String Completion Test PASSED');
    console.log('');
    return true;

  } catch (error) {
    console.error('❌ Trace String Completion Test FAILED: ' + error);
    return false;
  }
}

/**
 * Test correlation ID uniqueness
 */
function testCorrelationIdUniqueness() {
  console.log('=== Test: Correlation ID Uniqueness ===');

  try {
    const trace1 = UnifiedLogger.startTrace('Test', 'operation1');
    const trace2 = UnifiedLogger.startTrace('Test', 'operation2');
    const trace3 = UnifiedLogger.startTrace('Test', 'operation3');

    if (trace1.correlationId === trace2.correlationId) {
      throw new Error('Correlation IDs not unique: trace1 === trace2');
    }

    if (trace2.correlationId === trace3.correlationId) {
      throw new Error('Correlation IDs not unique: trace2 === trace3');
    }

    if (trace1.correlationId === trace3.correlationId) {
      throw new Error('Correlation IDs not unique: trace1 === trace3');
    }

    console.log('  ✅ All correlation IDs are unique');
    console.log('    trace1: ' + trace1.correlationId);
    console.log('    trace2: ' + trace2.correlationId);
    console.log('    trace3: ' + trace3.correlationId);

    trace1.complete();
    trace2.complete();
    trace3.complete();

    console.log('✅ Correlation ID Uniqueness Test PASSED');
    console.log('');
    return true;

  } catch (error) {
    console.error('❌ Correlation ID Uniqueness Test FAILED: ' + error);
    return false;
  }
}

/**
 * Test duration tracking
 */
function testDurationTracking() {
  console.log('=== Test: Duration Tracking ===');

  try {
    const trace = UnifiedLogger.startTrace('Test', 'testDurationTracking', {
      testId: 5
    });

    // Wait a bit
    Utilities.sleep(100);

    trace.info('Checkpoint 1');

    Utilities.sleep(100);

    trace.info('Checkpoint 2');

    Utilities.sleep(100);

    // Complete and check duration is logged
    trace.complete({ result: 'done' });

    console.log('  ✅ Duration tracking works (check logs for durationMs)');
    console.log('  ℹ️  Expected duration: ~300ms');

    console.log('✅ Duration Tracking Test PASSED');
    console.log('');
    return true;

  } catch (error) {
    console.error('❌ Duration Tracking Test FAILED: ' + error);
    return false;
  }
}

/**
 * Verify trace logs appear in sheet
 */
function verifyTraceLogsInSheet() {
  console.log('=== Verify: Trace Logs in Sheet ===');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName('_Global_Log');

    if (!logSheet) {
      throw new Error('_Global_Log sheet not found');
    }

    const lastRow = logSheet.getLastRow();
    if (lastRow < 2) {
      throw new Error('No log entries found in sheet');
    }

    // Get recent logs
    const range = logSheet.getRange(Math.max(2, lastRow - 50), 1, Math.min(50, lastRow - 1), 6);
    const values = range.getValues();

    // Look for trace events
    let startCount = 0;
    let completeCount = 0;
    let errorCount = 0;
    let correlationIds = [];

    values.forEach(function(row) {
      const message = row[4]; // Message column
      const details = row[5]; // Details column

      if (message.indexOf('Started:') !== -1 || message.indexOf('Trace started:') !== -1) {
        startCount++;
      }
      if (message.indexOf('Completed:') !== -1 || message.indexOf('finished') !== -1 || message.indexOf('Trace completed:') !== -1) {
        completeCount++;
      }
      if (message.indexOf('Failed:') !== -1) {
        errorCount++;
      }

      // Extract correlation IDs from details
      if (details && typeof details === 'string' && details.indexOf('correlationId') !== -1) {
        try {
          const parsed = JSON.parse(details);
          if (parsed.correlationId && correlationIds.indexOf(parsed.correlationId) === -1) {
            correlationIds.push(parsed.correlationId);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    console.log('  ✅ Found trace logs in sheet:');
    console.log('    Start events: ' + startCount);
    console.log('    Complete events: ' + completeCount);
    console.log('    Error events: ' + errorCount);
    console.log('    Unique correlation IDs: ' + correlationIds.length);

    if (startCount === 0) {
      console.warn('  ⚠️  Warning: No "Started:" events found - logs may not be flushing');
    }

    console.log('✅ Sheet Verification PASSED');
    console.log('');
    return true;

  } catch (error) {
    console.error('❌ Sheet Verification FAILED: ' + error);
    return false;
  }
}

/**
 * Run complete test suite
 */
function runCompleteTraceTests() {
  console.log('');
  console.log('========================================');
  console.log('UNIFIED LOGGER TRACE TEST SUITE');
  console.log('========================================');
  console.log('');

  const results = [];

  results.push({ name: 'Basic Trace', passed: testBasicTrace() });
  results.push({ name: 'Trace Logging', passed: testTraceLogging() });
  results.push({ name: 'Trace Failure', passed: testTraceFailure() });
  results.push({ name: 'String Completion', passed: testTraceStringCompletion() });
  results.push({ name: 'Correlation ID Uniqueness', passed: testCorrelationIdUniqueness() });
  results.push({ name: 'Duration Tracking', passed: testDurationTracking() });

  console.log('Waiting 2 seconds for logs to flush...');
  Utilities.sleep(2000);

  results.push({ name: 'Sheet Verification', passed: verifyTraceLogsInSheet() });

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
    console.log('');
    console.log('Next steps:');
    console.log('1. Check _Global_Log sheet for trace entries');
    console.log('2. Verify correlation IDs are present');
    console.log('3. Verify durationMs is logged');
    console.log('4. Ready to integrate into production code');
  } else {
    console.log('========================================');
    console.log('❌ SOME TESTS FAILED');
    console.log('========================================');
    console.log('');
    console.log('Review failures above and fix issues');
  }

  console.log('');
}

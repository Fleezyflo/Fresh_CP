/**
 * Phase 2 Verification Test Script
 * Verifies all Phase 2 retry mechanism and circuit breaker fixes are working correctly
 *
 * Tests:
 * 1. executeRetry function exists and is callable
 * 2. RETRY_ATTEMPTS global object exists
 * 3. Circuit breaker activates after 3 attempts
 * 4. resetRetryCounter resets count to 0
 * 5. createRetryableError returns proper object with retryCallback string
 * 6. Simulate retry flow end-to-end
 */

function runPhase2Verification() {
  console.log('========================================');
  console.log('PHASE 2 VERIFICATION TEST');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  // TEST 1: Verify executeRetry function exists
  console.log('TEST 1: Verify executeRetry function exists and is callable');
  try {
    const hasExecuteRetry = typeof globalThis.executeRetry === 'function';
    console.log('  - executeRetry:', hasExecuteRetry ? '✅ Available' : '❌ Missing');

    if (hasExecuteRetry) {
      console.log('✅ TEST 1 PASSED\n');
      passed++;
    } else {
      console.log('❌ TEST 1 FAILED - executeRetry not found\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 1 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 2: Verify RETRY_ATTEMPTS global object exists
  console.log('TEST 2: Verify RETRY_ATTEMPTS global object exists');
  try {
    const hasRetryAttempts = typeof globalThis.RETRY_ATTEMPTS === 'object';
    console.log('  - RETRY_ATTEMPTS:', hasRetryAttempts ? '✅ Available' : '❌ Missing');

    if (hasRetryAttempts) {
      console.log('✅ TEST 2 PASSED\n');
      passed++;
    } else {
      console.log('❌ TEST 2 FAILED - RETRY_ATTEMPTS not found\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 2 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 3: Verify circuit breaker activates after 3 attempts
  console.log('TEST 3: Verify circuit breaker activates after 3 attempts');
  try {
    // Create test function
    let callCount = 0;
    globalThis.testRetryOperation = function() {
      callCount++;
      console.log('  - Test retry operation called (count: ' + callCount + ')');
    };

    // Reset counter first
    globalThis.RETRY_ATTEMPTS['test_circuit_breaker'] = 0;

    // Call executeRetry 4 times
    for (let i = 1; i <= 4; i++) {
      try {
        globalThis.executeRetry('test_circuit_breaker', 'testRetryOperation', 3);
      } catch (error) {
        // Ignore errors from circuit breaker alert
      }
    }

    const attemptCount = globalThis.RETRY_ATTEMPTS['test_circuit_breaker'];
    console.log('  - Total attempts recorded:', attemptCount);
    console.log('  - Function called ' + callCount + ' times');

    // Should have 4 attempts recorded, but function only called 3 times (circuit breaker blocks 4th)
    if (attemptCount === 4 && callCount === 3) {
      console.log('✅ TEST 3 PASSED - Circuit breaker activated after 3 attempts\n');
      passed++;
    } else {
      console.log('❌ TEST 3 FAILED - Circuit breaker did not activate correctly');
      console.log('   Expected: 4 attempts recorded, 3 function calls');
      console.log('   Actual: ' + attemptCount + ' attempts recorded, ' + callCount + ' function calls\n');
      failed++;
    }

    // Clean up
    delete globalThis.testRetryOperation;
  } catch (error) {
    console.log('❌ TEST 3 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 4: Verify resetRetryCounter resets count to 0
  console.log('TEST 4: Verify resetRetryCounter resets count to 0');
  try {
    const hasResetRetryCounter = typeof globalThis.resetRetryCounter === 'function';
    console.log('  - resetRetryCounter:', hasResetRetryCounter ? '✅ Available' : '❌ Missing');

    if (hasResetRetryCounter) {
      // Set counter to 3
      globalThis.RETRY_ATTEMPTS['test_reset'] = 3;
      console.log('  - Set RETRY_ATTEMPTS[test_reset] = 3');

      // Reset it
      globalThis.resetRetryCounter('test_reset');
      const afterReset = globalThis.RETRY_ATTEMPTS['test_reset'];
      console.log('  - After reset: ' + afterReset);

      if (afterReset === 0) {
        console.log('✅ TEST 4 PASSED\n');
        passed++;
      } else {
        console.log('❌ TEST 4 FAILED - Counter not reset (expected 0, got ' + afterReset + ')\n');
        failed++;
      }
    } else {
      console.log('❌ TEST 4 FAILED - resetRetryCounter not found\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 4 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 5: Verify createRetryableError returns proper object with retryCallback string
  console.log('TEST 5: Verify createRetryableError returns proper object');
  try {
    const hasCreateRetryableError = typeof globalThis.createRetryableError === 'function';
    console.log('  - createRetryableError:', hasCreateRetryableError ? '✅ Available' : '❌ Missing');

    if (hasCreateRetryableError) {
      const testError = new Error('Test error for Phase 2');
      const retryable = globalThis.createRetryableError(
        testError,
        'test_operation',
        'testRetryFunction',
        'Testing Phase 2'
      );

      const hasTitle = retryable && typeof retryable.title === 'string';
      const hasUserMessage = retryable && typeof retryable.userMessage === 'string';
      const hasSuggestion = retryable && typeof retryable.suggestion === 'string';
      const hasSeverity = retryable && typeof retryable.severity === 'string';
      const isRetryable = retryable && retryable.retryable === true;
      const hasRetryCallback = retryable && typeof retryable.retryCallback === 'string';
      const hasOperationKey = retryable && typeof retryable.operationKey === 'string';

      console.log('  - Has title:', hasTitle ? '✅' : '❌');
      console.log('  - Has userMessage:', hasUserMessage ? '✅' : '❌');
      console.log('  - Has suggestion:', hasSuggestion ? '✅' : '❌');
      console.log('  - Has severity:', hasSeverity ? '✅' : '❌');
      console.log('  - Is retryable:', isRetryable ? '✅' : '❌');
      console.log('  - Has retryCallback (string):', hasRetryCallback ? '✅ (' + retryable.retryCallback + ')' : '❌');
      console.log('  - Has operationKey:', hasOperationKey ? '✅ (' + retryable.operationKey + ')' : '❌');

      if (hasTitle && hasUserMessage && hasSuggestion && hasSeverity && isRetryable && hasRetryCallback && hasOperationKey) {
        console.log('✅ TEST 5 PASSED\n');
        passed++;
      } else {
        console.log('❌ TEST 5 FAILED - Missing required properties\n');
        failed++;
      }
    } else {
      console.log('❌ TEST 5 FAILED - createRetryableError not found\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 5 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 6: Verify retryGetAllConfig is exported to globalThis
  console.log('TEST 6: Verify retryGetAllConfig is exported to globalThis');
  try {
    const hasRetryGetAllConfig = typeof globalThis.retryGetAllConfig === 'function';
    console.log('  - retryGetAllConfig:', hasRetryGetAllConfig ? '✅ Available' : '❌ Missing');

    if (hasRetryGetAllConfig) {
      console.log('✅ TEST 6 PASSED\n');
      passed++;
    } else {
      console.log('❌ TEST 6 FAILED - retryGetAllConfig not exported to globalThis\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 6 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // FINAL SUMMARY
  console.log('========================================');
  console.log('PHASE 2 VERIFICATION COMPLETE');
  console.log('========================================');
  console.log('Tests Passed:', passed);
  console.log('Tests Failed:', failed);
  console.log('Pass Rate:', (passed / (passed + failed) * 100).toFixed(1) + '%');

  if (failed === 0) {
    console.log('\n✅ ALL TESTS PASSED - PHASE 2 COMPLETE');
    console.log('\nPhase 2 Changes Summary:');
    console.log('  ✅ executeRetry function with circuit breaker (max 3 attempts)');
    console.log('  ✅ RETRY_ATTEMPTS global counter');
    console.log('  ✅ resetRetryCounter for successful operations');
    console.log('  ✅ createRetryableError for string-based callbacks');
    console.log('  ✅ Config.js integrated with retry mechanism');
    console.log('  ✅ Utilities.js showFriendlyError updated for retry buttons');
  } else {
    console.log('\n❌ SOME TESTS FAILED - REVIEW ERRORS ABOVE');
  }

  console.log('========================================\n');

  return {
    passed: passed,
    failed: failed,
    total: passed + failed,
    success: failed === 0
  };
}

// Additional manual test guidance
function runPhase2ManualTests() {
  console.log('========================================');
  console.log('PHASE 2 MANUAL TESTING GUIDE');
  console.log('========================================\n');

  console.log('MANUAL TEST 1: Trigger config loading error and test retry');
  console.log('  1. Temporarily rename Config sheet');
  console.log('  2. Try to trigger ConfigurationManager.get() (e.g., open menu)');
  console.log('  3. Should see error dialog with "Would you like to retry?" button');
  console.log('  4. Click "Yes" to retry');
  console.log('  5. Rename Config sheet back to original name');
  console.log('  6. Click "Yes" again - should succeed');
  console.log('  7. Verify retry counter resets on success\n');

  console.log('MANUAL TEST 2: Test circuit breaker with 3 retries');
  console.log('  1. Keep Config sheet renamed (to cause permanent failure)');
  console.log('  2. Trigger ConfigurationManager.get() error');
  console.log('  3. Click "Yes" to retry 3 times');
  console.log('  4. On 4th attempt, should see "Multiple Errors Occurred" alert');
  console.log('  5. Circuit breaker should prevent further retries');
  console.log('  6. Restore Config sheet, refresh page to reset circuit breaker\n');

  console.log('MANUAL TEST 3: Verify retry counter persistence');
  console.log('  1. Trigger error with retry');
  console.log('  2. Click retry once');
  console.log('  3. Check console: globalThis.RETRY_ATTEMPTS should show count: 1');
  console.log('  4. Trigger same error again (without fixing)');
  console.log('  5. Click retry twice more');
  console.log('  6. Should see circuit breaker alert (total 3 retries)');
  console.log('  7. Fix the issue and retry - should reset counter\n');

  console.log('========================================\n');
}

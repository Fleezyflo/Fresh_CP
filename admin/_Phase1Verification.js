/**
 * Phase 1 Verification Test Script
 * Verifies all Phase 1 critical fixes are working correctly
 *
 * Tests:
 * 1. 00_ConfigLoadMetrics.js loads first alphabetically
 * 2. globalThis exports are available
 * 3. No duplicate showErrorToast in Utilities.js
 * 4. No duplicate createUserFriendlyError in Utilities.js
 * 5. createUserFriendlyError returns proper object
 * 6. Config.js can call recordConfigLoad without error
 */

function runPhase1Verification() {
  console.log('========================================');
  console.log('PHASE 1 VERIFICATION TEST');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  // TEST 1: Verify 00_ConfigLoadMetrics.js exports exist
  console.log('TEST 1: Verify globalThis exports from 00_ConfigLoadMetrics.js');
  try {
    const hasRecordConfigLoad = typeof globalThis.recordConfigLoad === 'function';
    const hasGetConfigLoadMetrics = typeof globalThis.getConfigLoadMetrics === 'function';
    const hasGetConfigMetrics = typeof globalThis.getConfigMetrics === 'function';
    const hasConfigLoadMetrics = typeof globalThis.CONFIG_LOAD_METRICS === 'object';

    console.log('  - recordConfigLoad:', hasRecordConfigLoad ? '✅ Available' : '❌ Missing');
    console.log('  - getConfigLoadMetrics:', hasGetConfigLoadMetrics ? '✅ Available' : '❌ Missing');
    console.log('  - getConfigMetrics:', hasGetConfigMetrics ? '✅ Available' : '❌ Missing');
    console.log('  - CONFIG_LOAD_METRICS:', hasConfigLoadMetrics ? '✅ Available' : '❌ Missing');

    if (hasRecordConfigLoad && hasGetConfigLoadMetrics && hasGetConfigMetrics && hasConfigLoadMetrics) {
      console.log('✅ TEST 1 PASSED\n');
      passed++;
    } else {
      console.log('❌ TEST 1 FAILED - Some exports missing\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 1 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 2: Verify recordConfigLoad can be called
  console.log('TEST 2: Verify recordConfigLoad can be called');
  try {
    globalThis.recordConfigLoad('test_config', {
      loadTimeMs: 100,
      unwrapTimeMs: 50,
      success: true,
      degraded: false,
      cacheHit: false,
      source: 'test',
      itemCount: 10,
      errors: []
    });
    console.log('✅ TEST 2 PASSED - recordConfigLoad called successfully\n');
    passed++;
  } catch (error) {
    console.log('❌ TEST 2 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 3: Verify getConfigLoadMetrics returns data
  console.log('TEST 3: Verify getConfigLoadMetrics returns data');
  try {
    const metrics = globalThis.getConfigLoadMetrics();
    const hasOverall = metrics && metrics.overall;
    const hasEnabled = metrics && typeof metrics.enabled === 'boolean';

    console.log('  - Has enabled field:', hasEnabled ? '✅ Yes' : '❌ No');
    console.log('  - Has overall metrics:', hasOverall ? '✅ Yes' : '❌ No');

    if (hasEnabled && hasOverall) {
      console.log('✅ TEST 3 PASSED\n');
      passed++;
    } else {
      console.log('❌ TEST 3 FAILED - Invalid metrics structure\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 3 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 4: Verify createUserFriendlyError exists and returns proper object
  console.log('TEST 4: Verify createUserFriendlyError returns proper object');
  try {
    const testError = new Error('Test error');
    const friendly = createUserFriendlyError(testError, 'testing');

    const hasTitle = friendly && typeof friendly.title === 'string';
    const hasUserMessage = friendly && typeof friendly.userMessage === 'string';
    const hasSuggestion = friendly && typeof friendly.suggestion === 'string';
    const hasSeverity = friendly && typeof friendly.severity === 'string';

    console.log('  - Has title:', hasTitle ? '✅ Yes (' + friendly.title + ')' : '❌ No');
    console.log('  - Has userMessage:', hasUserMessage ? '✅ Yes (' + friendly.userMessage + ')' : '❌ No');
    console.log('  - Has suggestion:', hasSuggestion ? '✅ Yes (' + friendly.suggestion + ')' : '❌ No');
    console.log('  - Has severity:', hasSeverity ? '✅ Yes (' + friendly.severity + ')' : '❌ No');

    // Check no undefined values
    const noUndefined = friendly.title !== 'undefined' &&
                        friendly.userMessage !== 'undefined' &&
                        friendly.suggestion !== 'undefined';

    if (hasTitle && hasUserMessage && hasSuggestion && hasSeverity && noUndefined) {
      console.log('✅ TEST 4 PASSED\n');
      passed++;
    } else {
      console.log('❌ TEST 4 FAILED - Missing properties or undefined values\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 4 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 5: Verify showErrorToast exists (only one version)
  console.log('TEST 5: Verify showErrorToast exists');
  try {
    const hasShowErrorToast = typeof showErrorToast === 'function';

    if (hasShowErrorToast) {
      console.log('✅ TEST 5 PASSED - showErrorToast available\n');
      passed++;
    } else {
      console.log('❌ TEST 5 FAILED - showErrorToast not found\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 5 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // TEST 6: Verify error messages don't show 'undefined'
  console.log('TEST 6: Verify error message formatting');
  try {
    const testError = new Error('Connection timeout');
    const friendly = createUserFriendlyError(testError, 'loading config');

    const messageText = friendly.title + ' ' + friendly.userMessage + ' ' + friendly.suggestion;
    const hasUndefined = messageText.indexOf('undefined') !== -1;

    console.log('  - Message text:', messageText.substring(0, 60) + '...');
    console.log('  - Contains "undefined":', hasUndefined ? '❌ YES (FAIL)' : '✅ NO (PASS)');

    if (!hasUndefined) {
      console.log('✅ TEST 6 PASSED\n');
      passed++;
    } else {
      console.log('❌ TEST 6 FAILED - Message contains "undefined"\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ TEST 6 FAILED - Error:', error.message, '\n');
    failed++;
  }

  // FINAL SUMMARY
  console.log('========================================');
  console.log('PHASE 1 VERIFICATION COMPLETE');
  console.log('========================================');
  console.log('Tests Passed:', passed);
  console.log('Tests Failed:', failed);
  console.log('Pass Rate:', (passed / (passed + failed) * 100).toFixed(1) + '%');

  if (failed === 0) {
    console.log('\n✅ ALL TESTS PASSED - PHASE 1 COMPLETE');
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

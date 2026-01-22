/**
 * Rate Limiter Test Suite
 * Phase 2, Task 2.3: Test rate limiter integration
 *
 * Tests verify:
 * - Rate limit enforcement
 * - Feature flag behavior
 * - Error messages
 * - Status queries
 * - Cache management
 *
 * Run via: Extensions > Apps Script > Select test function > Run
 */

const TEST_LOG_CATEGORY = 'RateLimiterTests';

/**
 * Run all rate limiter tests
 * @return {Object} Test results summary
 */
function runAllRateLimiterTests() {
  const results = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    errors: [],
    timestamp: new Date().toISOString()
  };

  const tests = [
    testRateLimitEnforcement,
    testFeatureFlagDisable,
    testFeatureFlagEnabled,
    testRateLimitStatus,
    testMultipleServices,
    testErrorMessages,
    testRateLimitReset,
    testExponentialUsage
  ];

  Logger.log('=== Starting Rate Limiter Test Suite ===');
  Logger.log('Total tests: ' + tests.length);
  Logger.log('');

  tests.forEach(function(testFunc) {
    results.totalTests++;
    try {
      const testName = testFunc.name;
      Logger.log('Running: ' + testName);

      const result = testFunc();

      if (result.passed) {
        results.passed++;
        Logger.log('✅ PASSED: ' + testName);
        if (result.message) {
          Logger.log('   ' + result.message);
        }
      } else {
        results.failed++;
        results.errors.push({
          test: testName,
          error: result.error || 'Test returned false',
          message: result.message
        });
        Logger.log('❌ FAILED: ' + testName);
        Logger.log('   Error: ' + (result.error || result.message));
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        test: testFunc.name,
        error: error.toString(),
        stack: error.stack
      });
      Logger.log('❌ EXCEPTION: ' + testFunc.name);
      Logger.log('   ' + error.toString());
    }
    Logger.log('');
  });

  Logger.log('=== Test Suite Complete ===');
  Logger.log('Passed: ' + results.passed + '/' + results.totalTests);
  Logger.log('Failed: ' + results.failed);

  if (results.failed > 0) {
    Logger.log('');
    Logger.log('Failed Tests:');
    results.errors.forEach(function(err) {
      Logger.log('  - ' + err.test + ': ' + err.error);
    });
  }

  // Show results in UI
  const ui = SpreadsheetApp.getUi();
  const status = results.failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED';
  const message = 'Passed: ' + results.passed + '/' + results.totalTests + '\n' +
                  'Failed: ' + results.failed + '\n\n' +
                  (results.failed > 0 ? 'See execution log for details.' : 'All rate limiter tests passed!');

  ui.alert('Rate Limiter Test Results', status + '\n\n' + message, ui.ButtonSet.OK);

  return results;
}

/**
 * Test 1: Rate limit enforcement
 * Verifies that enforceRateLimit() throws when limit exceeded
 */
function testRateLimitEnforcement() {
  try {
    // Reset rate limit for clean test
    resetRateLimit(SERVICE_OPENAI_VECTOR);

    // Get current limit
    const limit = getRateLimitStatus(SERVICE_OPENAI_VECTOR).limit;

    // Call enforceRateLimit() up to the limit
    for (let i = 0; i < limit; i++) {
      enforceRateLimit(SERVICE_OPENAI_VECTOR);
    }

    // Next call should throw
    let didThrow = false;
    let errorCode = null;
    try {
      enforceRateLimit(SERVICE_OPENAI_VECTOR);
    } catch (error) {
      didThrow = true;
      errorCode = error.code;
    }

    if (!didThrow) {
      return {
        passed: false,
        error: 'Expected rate limit error after ' + limit + ' calls, but no error thrown'
      };
    }

    if (errorCode !== 'RATE_LIMIT') {
      return {
        passed: false,
        error: 'Expected error.code = "RATE_LIMIT", got: ' + errorCode
      };
    }

    return {
      passed: true,
      message: 'Rate limit correctly enforced after ' + limit + ' calls'
    };
  } catch (error) {
    return {
      passed: false,
      error: error.toString()
    };
  }
}

/**
 * Test 2: Feature flag disable
 * Verifies that setting RATE_LIMITER_ENABLED=false disables rate limiting
 */
function testFeatureFlagDisable() {
  try {
    // Save original value
    const originalValue = getScriptProperty('RATE_LIMITER_ENABLED');

    // Disable rate limiting
    setScriptProperty('RATE_LIMITER_ENABLED', 'false');

    // Reset for clean test
    resetRateLimit(SERVICE_OPENAI_COMPLETION);

    // Get limit
    const status = getRateLimitStatus(SERVICE_OPENAI_COMPLETION);
    const limit = status.limit;

    // Try to exceed limit - should NOT throw when disabled
    let didThrow = false;
    try {
      for (let i = 0; i < limit + 10; i++) {
        enforceRateLimit(SERVICE_OPENAI_COMPLETION);
      }
    } catch (error) {
      didThrow = true;
    }

    // Restore original value
    if (originalValue) {
      setScriptProperty('RATE_LIMITER_ENABLED', originalValue);
    } else {
      deleteScriptProperty('RATE_LIMITER_ENABLED');
    }

    if (didThrow) {
      return {
        passed: false,
        error: 'Rate limit enforced even when feature flag disabled'
      };
    }

    return {
      passed: true,
      message: 'Feature flag correctly disables rate limiting'
    };
  } catch (error) {
    return {
      passed: false,
      error: error.toString()
    };
  }
}

/**
 * Test 3: Feature flag enabled
 * Verifies that setting RATE_LIMITER_ENABLED=true enables rate limiting
 */
function testFeatureFlagEnabled() {
  try {
    // Save original value
    const originalValue = getScriptProperty('RATE_LIMITER_ENABLED');

    // Enable rate limiting explicitly
    setScriptProperty('RATE_LIMITER_ENABLED', 'true');

    // Reset for clean test
    resetRateLimit(SERVICE_XERO);

    // Get limit
    const limit = getRateLimitStatus(SERVICE_XERO).limit;

    // Fill up to limit
    for (let i = 0; i < limit; i++) {
      enforceRateLimit(SERVICE_XERO);
    }

    // Next call should throw
    let didThrow = false;
    try {
      enforceRateLimit(SERVICE_XERO);
    } catch (error) {
      didThrow = true;
    }

    // Restore original value
    if (originalValue) {
      setScriptProperty('RATE_LIMITER_ENABLED', originalValue);
    } else {
      deleteScriptProperty('RATE_LIMITER_ENABLED');
    }

    if (!didThrow) {
      return {
        passed: false,
        error: 'Rate limit not enforced when feature flag enabled'
      };
    }

    return {
      passed: true,
      message: 'Feature flag correctly enables rate limiting'
    };
  } catch (error) {
    return {
      passed: false,
      error: error.toString()
    };
  }
}

/**
 * Test 4: Rate limit status
 * Verifies that getRateLimitStatus() returns accurate information
 */
function testRateLimitStatus() {
  try {
    // Reset for clean test
    resetRateLimit(SERVICE_OPENAI_VECTOR);

    // Check initial status
    let status = getRateLimitStatus(SERVICE_OPENAI_VECTOR);

    if (status.currentCount !== 0) {
      return {
        passed: false,
        error: 'Expected initial count = 0, got: ' + status.currentCount
      };
    }

    if (status.percentageUsed !== 0) {
      return {
        passed: false,
        error: 'Expected initial percentage = 0, got: ' + status.percentageUsed
      };
    }

    if (!status.available) {
      return {
        passed: false,
        error: 'Expected available = true initially'
      };
    }

    // Make some calls
    const callsToMake = Math.min(5, status.limit);
    for (let i = 0; i < callsToMake; i++) {
      enforceRateLimit(SERVICE_OPENAI_VECTOR);
    }

    // Check updated status
    status = getRateLimitStatus(SERVICE_OPENAI_VECTOR);

    if (status.currentCount !== callsToMake) {
      return {
        passed: false,
        error: 'Expected count = ' + callsToMake + ', got: ' + status.currentCount
      };
    }

    const expectedPercentage = Math.round((callsToMake / status.limit) * 100);
    if (status.percentageUsed !== expectedPercentage) {
      return {
        passed: false,
        error: 'Expected percentage = ' + expectedPercentage + ', got: ' + status.percentageUsed
      };
    }

    return {
      passed: true,
      message: 'Rate limit status accurately reflects usage'
    };
  } catch (error) {
    return {
      passed: false,
      error: error.toString()
    };
  }
}

/**
 * Test 5: Multiple services
 * Verifies that different services have independent rate limits
 */
function testMultipleServices() {
  try {
    // Reset all services
    resetRateLimit(SERVICE_OPENAI_VECTOR);
    resetRateLimit(SERVICE_OPENAI_COMPLETION);
    resetRateLimit(SERVICE_XERO);

    // Make calls to different services
    enforceRateLimit(SERVICE_OPENAI_VECTOR);
    enforceRateLimit(SERVICE_OPENAI_COMPLETION);
    enforceRateLimit(SERVICE_XERO);

    // Check each service independently
    const vectorStatus = getRateLimitStatus(SERVICE_OPENAI_VECTOR);
    const completionStatus = getRateLimitStatus(SERVICE_OPENAI_COMPLETION);
    const xeroStatus = getRateLimitStatus(SERVICE_XERO);

    if (vectorStatus.currentCount !== 1) {
      return {
        passed: false,
        error: 'Vector service count incorrect: ' + vectorStatus.currentCount
      };
    }

    if (completionStatus.currentCount !== 1) {
      return {
        passed: false,
        error: 'Completion service count incorrect: ' + completionStatus.currentCount
      };
    }

    if (xeroStatus.currentCount !== 1) {
      return {
        passed: false,
        error: 'Xero service count incorrect: ' + xeroStatus.currentCount
      };
    }

    // Verify limits are different for different services
    if (vectorStatus.limit === completionStatus.limit &&
        vectorStatus.limit === xeroStatus.limit) {
      return {
        passed: false,
        error: 'All services have same limit - expected different limits'
      };
    }

    return {
      passed: true,
      message: 'Multiple services have independent rate limits'
    };
  } catch (error) {
    return {
      passed: false,
      error: error.toString()
    };
  }
}

/**
 * Test 6: Error messages
 * Verifies that rate limit errors have user-friendly messages
 */
function testErrorMessages() {
  try {
    // Reset for clean test
    resetRateLimit(SERVICE_OPENAI_COMPLETION);

    // Get limit
    const limit = getRateLimitStatus(SERVICE_OPENAI_COMPLETION).limit;

    // Fill up to limit
    for (let i = 0; i < limit; i++) {
      enforceRateLimit(SERVICE_OPENAI_COMPLETION);
    }

    // Trigger error
    let error = null;
    try {
      enforceRateLimit(SERVICE_OPENAI_COMPLETION);
    } catch (e) {
      error = e;
    }

    if (!error) {
      return {
        passed: false,
        error: 'No error thrown when limit exceeded'
      };
    }

    // Check error properties
    if (error.code !== 'RATE_LIMIT') {
      return {
        passed: false,
        error: 'Error code missing or incorrect: ' + error.code
      };
    }

    if (!error.message || error.message.length === 0) {
      return {
        passed: false,
        error: 'Error message is empty'
      };
    }

    // Check message includes key information
    const message = error.message.toLowerCase();
    if (message.indexOf('limit') === -1) {
      return {
        passed: false,
        error: 'Error message does not mention "limit": ' + error.message
      };
    }

    if (message.indexOf('wait') === -1 && message.indexOf('retry') === -1) {
      return {
        passed: false,
        error: 'Error message does not mention wait/retry: ' + error.message
      };
    }

    // Check error has useful properties
    if (typeof error.service === 'undefined') {
      return {
        passed: false,
        error: 'Error missing service property'
      };
    }

    if (typeof error.limit === 'undefined') {
      return {
        passed: false,
        error: 'Error missing limit property'
      };
    }

    if (typeof error.currentCount === 'undefined') {
      return {
        passed: false,
        error: 'Error missing currentCount property'
      };
    }

    return {
      passed: true,
      message: 'Error messages are user-friendly and informative'
    };
  } catch (error) {
    return {
      passed: false,
      error: error.toString()
    };
  }
}

/**
 * Test 7: Rate limit reset
 * Verifies that rate limits reset after manual reset
 */
function testRateLimitReset() {
  try {
    // Reset for clean test
    resetRateLimit(SERVICE_XERO);

    // Make some calls
    enforceRateLimit(SERVICE_XERO);
    enforceRateLimit(SERVICE_XERO);
    enforceRateLimit(SERVICE_XERO);

    // Verify count is 3
    let status = getRateLimitStatus(SERVICE_XERO);
    if (status.currentCount !== 3) {
      return {
        passed: false,
        error: 'Expected count = 3 before reset, got: ' + status.currentCount
      };
    }

    // Reset again
    resetRateLimit(SERVICE_XERO);

    // Verify count is back to 0
    status = getRateLimitStatus(SERVICE_XERO);
    if (status.currentCount !== 0) {
      return {
        passed: false,
        error: 'Expected count = 0 after reset, got: ' + status.currentCount
      };
    }

    return {
      passed: true,
      message: 'Rate limit correctly resets to 0'
    };
  } catch (error) {
    return {
      passed: false,
      error: error.toString()
    };
  }
}

/**
 * Test 8: Exponential usage
 * Verifies that percentage calculation is correct as limit fills
 */
function testExponentialUsage() {
  try {
    // Reset for clean test
    resetRateLimit(SERVICE_OPENAI_VECTOR);

    const status = getRateLimitStatus(SERVICE_OPENAI_VECTOR);
    const limit = status.limit;
    const checkpoints = [0.25, 0.5, 0.75, 1.0]; // 25%, 50%, 75%, 100%

    // Reset
    resetRateLimit(SERVICE_OPENAI_VECTOR);

    for (let i = 0; i < checkpoints.length; i++) {
      const targetCalls = Math.floor(limit * checkpoints[i]);
      const currentCount = getRateLimitStatus(SERVICE_OPENAI_VECTOR).currentCount;

      // Make calls to reach checkpoint
      for (let j = currentCount; j < targetCalls; j++) {
        enforceRateLimit(SERVICE_OPENAI_VECTOR);
      }

      // Check percentage
      const updatedStatus = getRateLimitStatus(SERVICE_OPENAI_VECTOR);
      const expectedPercentage = Math.round(checkpoints[i] * 100);
      const actualPercentage = updatedStatus.percentageUsed;

      // Allow small rounding differences
      if (Math.abs(expectedPercentage - actualPercentage) > 2) {
        return {
          passed: false,
          error: 'At ' + checkpoints[i] * 100 + '% checkpoint: expected ~' + expectedPercentage + '%, got ' + actualPercentage + '%'
        };
      }
    }

    return {
      passed: true,
      message: 'Percentage usage correctly calculated at all checkpoints'
    };
  } catch (error) {
    return {
      passed: false,
      error: error.toString()
    };
  }
}

/**
 * Helper: Delete script property
 */
function deleteScriptProperty(key) {
  try {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(key);
  } catch (error) {
    Logger.log('Warning: Failed to delete property ' + key + ': ' + error);
  }
}

/**
 * Quick smoke test - run this for fast validation
 */
function quickRateLimiterSmokeTest() {
  Logger.log('Running quick smoke test...');

  try {
    // Test 1: Basic enforcement
    resetRateLimit(SERVICE_OPENAI_VECTOR);
    enforceRateLimit(SERVICE_OPENAI_VECTOR);
    Logger.log('✅ Basic enforcement works');

    // Test 2: Status query
    const status = getRateLimitStatus(SERVICE_OPENAI_VECTOR);
    if (status.currentCount === 1) {
      Logger.log('✅ Status query works');
    } else {
      Logger.log('❌ Status query failed');
      return false;
    }

    // Test 3: Feature flag
    const originalValue = getScriptProperty('RATE_LIMITER_ENABLED');
    setScriptProperty('RATE_LIMITER_ENABLED', 'false');
    resetRateLimit(SERVICE_OPENAI_COMPLETION);

    // Should not throw when disabled
    for (let i = 0; i < 100; i++) {
      enforceRateLimit(SERVICE_OPENAI_COMPLETION);
    }
    Logger.log('✅ Feature flag works');

    // Restore
    if (originalValue) {
      setScriptProperty('RATE_LIMITER_ENABLED', originalValue);
    } else {
      deleteScriptProperty('RATE_LIMITER_ENABLED');
    }

    Logger.log('✅ All smoke tests passed!');

    SpreadsheetApp.getUi().alert(
      'Smoke Test Results',
      '✅ All quick tests passed!\n\nRun runAllRateLimiterTests() for comprehensive validation.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    return true;
  } catch (error) {
    Logger.log('❌ Smoke test failed: ' + error);
    SpreadsheetApp.getUi().alert(
      'Smoke Test Failed',
      '❌ Error: ' + error.toString(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return false;
  }
}

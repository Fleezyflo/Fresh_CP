/**
 * Test error toast system
 * Phase 5 Task 5.1.4
 * Contract: CSR-2026-001-B lines 275-526
 */

/**
 * Test basic error toast
 */
function testBasicErrorToast() {
  console.log('=== Test: Basic Error Toast ===');
  console.log('A dialog should appear - click OK to continue');

  showErrorToast(
    'Test Error',
    'This is a test error message.\n\nIt should display correctly with proper formatting.',
    {
      error: new Error('Technical error details here'),
      showTechnicalDetails: false
    }
  );

  console.log('✅ Basic error toast displayed');
  console.log('');
}

/**
 * Test error with technical details
 */
function testErrorWithTechnicalDetails() {
  console.log('=== Test: Error with Technical Details ===');
  console.log('Dialog should show technical details - click OK');

  const testError = new Error('This is the technical error message');
  testError.code = 'TEST_ERROR';

  showErrorToast(
    'Error with Details',
    'User-friendly error message here.',
    {
      error: testError,
      showTechnicalDetails: true,
      correlationId: 'TEST-' + new Date().getTime()
    }
  );

  console.log('✅ Error with technical details displayed');
  console.log('');
}

/**
 * Test error with retry callback
 */
function testErrorWithRetry() {
  console.log('=== Test: Error with Retry ===');
  console.log('Dialog should have Yes/No buttons - click YES to test retry');

  let retryCount = 0;

  const result = showErrorToast(
    'Operation Failed',
    'The operation failed. Would you like to retry?',
    {
      retryCallback: function() {
        retryCount++;
        console.log('  Retry callback executed (attempt ' + retryCount + ')');

        if (retryCount < 2) {
          // Simulate failure on first retry
          throw new Error('Retry also failed');
        }

        // Succeed on second retry
        console.log('  Retry succeeded');
        return true;
      },
      error: new Error('Original error'),
      correlationId: 'RETRY-TEST'
    }
  );

  if (result) {
    console.log('✅ Retry callback worked');
  } else {
    console.log('ℹ️  Retry declined or failed');
  }
  console.log('');
}

/**
 * Test warning toast
 */
function testWarningToast() {
  console.log('=== Test: Warning Toast ===');

  showWarningToast(
    'Test Warning',
    'This is a warning message.\n\nWarnings are less severe than errors.'
  );

  console.log('✅ Warning toast displayed');
  console.log('');
}

/**
 * Test success toast
 */
function testSuccessToast() {
  console.log('=== Test: Success Toast ===');

  showSuccessToast(
    'Test Success',
    'Operation completed successfully!\n\nThis is a success notification.'
  );

  console.log('✅ Success toast displayed');
  console.log('');
}

/**
 * Test createUserFriendlyError
 */
function testCreateUserFriendlyError() {
  console.log('=== Test: Create User Friendly Error ===');

  // Test various error patterns
  const testCases = [
    { error: new Error('Rate limit exceeded'), expected: 'rate limit' },
    { error: new Error('Request timeout'), expected: 'timeout' },
    { error: new Error('401 Unauthorized'), expected: 'Authentication' },
    { error: new Error('Network connection failed'), expected: 'Network' },
    { error: { code: 'RATE_LIMIT' }, expected: 'rate limit' }
  ];

  let allPassed = true;

  testCases.forEach(function(testCase, index) {
    const friendly = createUserFriendlyError(testCase.error, 'Test Operation');

    console.log('  Test ' + (index + 1) + ':');
    console.log('    Input: ' + (testCase.error.message || testCase.error.code));
    console.log('    Output: ' + friendly.userMessage);
    console.log('    Suggestion: ' + friendly.suggestion.substring(0, 50) + '...');

    // Check if output contains expected keyword
    const lowerMessage = friendly.userMessage.toLowerCase();
    const lowerExpected = testCase.expected.toLowerCase();

    if (lowerMessage.indexOf(lowerExpected) !== -1) {
      console.log('    ✅ Correct translation');
    } else {
      console.log('    ⚠️  Expected "' + testCase.expected + '" in message');
      allPassed = false;
    }
  });

  if (allPassed) {
    console.log('✅ All error translations working');
  } else {
    console.log('⚠️  Some translations may need review');
  }
  console.log('');
}

/**
 * Test showFriendlyError convenience function
 */
function testShowFriendlyError() {
  console.log('=== Test: Show Friendly Error (convenience function) ===');
  console.log('Dialog should appear with user-friendly message - click OK');

  const testError = new Error('Rate limit exceeded: too many requests');
  testError.code = 'RATE_LIMIT';

  showFriendlyError(
    testError,
    'Generating Quote',
    {
      correlationId: 'FRIENDLY-' + new Date().getTime()
    }
  );

  console.log('✅ Friendly error displayed');
  console.log('');
}

/**
 * Run all error toast tests
 * NOTE: These tests are interactive - you must click through dialogs
 */
function runAllErrorToastTests() {
  console.log('');
  console.log('========================================');
  console.log('ERROR TOAST SYSTEM TEST SUITE');
  console.log('========================================');
  console.log('');
  console.log('⚠️  INTERACTIVE TESTS');
  console.log('You will need to click through several dialogs');
  console.log('');

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Ready to Test?',
    'This will show several test dialogs.\n\nReady to begin?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    console.log('Tests cancelled by user');
    return;
  }

  // Non-interactive test first
  testCreateUserFriendlyError();

  // Interactive tests
  testBasicErrorToast();
  Utilities.sleep(500);

  testErrorWithTechnicalDetails();
  Utilities.sleep(500);

  testWarningToast();
  Utilities.sleep(500);

  testSuccessToast();
  Utilities.sleep(500);

  testShowFriendlyError();
  Utilities.sleep(500);

  // Retry test last (most complex)
  testErrorWithRetry();

  console.log('');
  console.log('========================================');
  console.log('✅ ALL ERROR TOAST TESTS COMPLETE');
  console.log('========================================');
  console.log('');
  console.log('Next steps:');
  console.log('1. Verify all dialogs displayed correctly');
  console.log('2. Verify formatting was appropriate');
  console.log('3. Verify retry callback worked');
  console.log('4. Ready to integrate into Tier 1 functions');
  console.log('');
}

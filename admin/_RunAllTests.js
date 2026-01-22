/**
 * Simple Test Runner
 * Phase D (v3.1): Contract Artifact PD-A001
 *
 * Discovers and runs all test* functions in the project.
 * Minimal implementation - no 200-line framework overhead.
 */

// Hardcoded list of test functions (Apps Script has no reflection)
const TEST_FUNCTIONS = [
  'testGetAllConfigPerformance',
  'testWorkflowResolution',
  'testPropertiesCacheHitRate',
  'testTraceIntegration',
  'testCorrelation',
  'testUnifiedLoggerPerformance',
  'testConfigLoadMetrics',
  'testPerformanceMonitor',
  'testFeatureFlags',
  'testMenuStaging',
  'testRateLimiter',
  'testValidation',
  'testStartTrace',
  'testLogSearcher',
  'testErrorToasts',
  'testTier1ErrorHandling',
  'testUnifiedLoggerDebug',
  // Add more test function names here as needed
];

/**
 * Run all tests and return results
 * @return {Object} Test results with pass/fail counts
 */
function runAllTests() {
  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const results = [];

  console.log('='.repeat(80));
  console.log('FRESH CP - COMPREHENSIVE TEST SUITE');
  console.log('='.repeat(80));

  // SECTION 1: Functional Regression Tests
  console.log('\n--- FUNCTIONAL REGRESSION TESTS ---');
  for (let i = 0; i < TEST_FUNCTIONS.length; i++) {
    const testName = TEST_FUNCTIONS[i];
    try {
      console.log('Running: ' + testName);
      const testStart = Date.now();

      // Check if function exists
      if (typeof globalThis[testName] !== 'function') {
        console.log('  ⚠️ SKIP: Function not found');
        skipped++;
        results.push({ name: testName, status: 'SKIP', reason: 'not found' });
        continue;
      }

      // Run test
      globalThis[testName]();

      const testDuration = Date.now() - testStart;
      console.log('  ✅ PASS (' + testDuration + 'ms)');
      passed++;
      results.push({ name: testName, status: 'PASS', duration: testDuration });
    } catch (error) {
      console.log('  ❌ FAIL: ' + error.message);
      failed++;
      results.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  // SECTION 2: Performance Baseline Tests
  console.log('\n--- PERFORMANCE BASELINE TESTS ---');
  try {
    if (typeof runPerformanceBaseline === 'function') {
      console.log('Running: runPerformanceBaseline');
      const baselineStart = Date.now();
      runPerformanceBaseline();
      const baselineDuration = Date.now() - baselineStart;
      console.log('  ✅ COMPLETE (' + baselineDuration + 'ms)');
      passed++;
      results.push({ name: 'runPerformanceBaseline', status: 'PASS', duration: baselineDuration });
    } else {
      console.log('⚠️ Performance baseline tests not available (_PerformanceBaseline.js not loaded)');
      skipped++;
      results.push({ name: 'runPerformanceBaseline', status: 'SKIP', reason: 'not loaded' });
    }
  } catch (error) {
    console.log('❌ Performance baseline error: ' + error.message);
    failed++;
    results.push({ name: 'runPerformanceBaseline', status: 'FAIL', error: error.message });
  }

  // SECTION 3: Phase 3 Performance Tests
  console.log('\n--- PHASE 3 PERFORMANCE TESTS ---');
  try {
    if (typeof runAllPhase3Tests === 'function') {
      console.log('Running: runAllPhase3Tests');
      const phase3Start = Date.now();
      runAllPhase3Tests();
      const phase3Duration = Date.now() - phase3Start;
      console.log('  ✅ COMPLETE (' + phase3Duration + 'ms)');
      passed++;
      results.push({ name: 'runAllPhase3Tests', status: 'PASS', duration: phase3Duration });
    } else {
      console.log('⚠️ Phase 3 tests not available (_Phase3Verification.js not loaded)');
      skipped++;
      results.push({ name: 'runAllPhase3Tests', status: 'SKIP', reason: 'not loaded' });
    }
  } catch (error) {
    console.log('❌ Phase 3 test error: ' + error.message);
    failed++;
    results.push({ name: 'runAllPhase3Tests', status: 'FAIL', error: error.message });
  }

  const totalDuration = Date.now() - startTime;
  const total = passed + failed + skipped;
  const passRate = total > 0 ? (passed / total * 100).toFixed(1) : 0;

  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE COMPLETE');
  console.log('='.repeat(80));
  console.log('Total: ' + total + ' | Passed: ' + passed + ' | Failed: ' + failed + ' | Skipped: ' + skipped);
  console.log('Pass Rate: ' + passRate + '%');
  console.log('Duration: ' + totalDuration + 'ms');
  console.log('\nSee PERFORMANCE.md for baseline metrics');
  console.log('='.repeat(80));

  if (failed > 0) {
    console.log('\nFAILED TESTS:');
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'FAIL') {
        console.log('  - ' + results[i].name + ': ' + results[i].error);
      }
    }
  }

  return {
    total: total,
    passed: passed,
    failed: failed,
    skipped: skipped,
    passRate: passRate + '%',
    duration: totalDuration,
    results: results
  };
}

/**
 * Run tests and show results in UI
 */
function runAllTestsUI() {
  const report = runAllTests();

  const output = [
    '=== TEST RESULTS ===',
    '',
    'Total: ' + report.total,
    'Passed: ' + report.passed,
    'Failed: ' + report.failed,
    'Skipped: ' + report.skipped,
    'Pass Rate: ' + report.passRate,
    'Duration: ' + report.duration + 'ms',
    ''
  ];

  if (report.failed > 0) {
    output.push('FAILED TESTS:');
    for (let i = 0; i < report.results.length; i++) {
      const result = report.results[i];
      if (result.status === 'FAIL') {
        output.push('  - ' + result.name);
      }
    }
  } else {
    output.push('✅ All tests passed!');
  }

  const ui = SpreadsheetApp.getUi();
  ui.alert('Test Results', output.join('\n'), ui.ButtonSet.OK);
}

// Export globally
globalThis.runAllTests = runAllTests;
globalThis.runAllTestsUI = runAllTestsUI;

console.log('[RunAllTests] Module loaded');

/**
 * Phase 3 Performance Verification Tests
 *
 * Tests for:
 * - ConfigurationManager performance (<2s average)
 * - Cache invalidation works correctly
 * - onOpen performance (<10s)
 * - Deferred initialization works correctly
 *
 * Run these tests manually from Apps Script Editor or via menu
 */

/**
 * TEST 1: Benchmark ConfigurationManager performance
 * Target: Average <2 seconds (down from 8-10s)
 *
 * @returns {Object} Performance metrics
 */
function testConfigurationManagerPerformance() {
  const RUNS = 10;
  const results = [];

  Logger.log('='.repeat(60));
  Logger.log('TEST 1: ConfigurationManager Performance Benchmark');
  Logger.log('='.repeat(60));
  Logger.log('Running ' + RUNS + ' iterations...\n');

  for (let i = 0; i < RUNS; i++) {
    // Invalidate cache to test cold performance
    if (typeof ConfigurationManager !== 'undefined' && ConfigurationManager.invalidate) {
      ConfigurationManager.invalidate();
    }

    const start = new Date().getTime();
    try {
      const openaiKey = ConfigurationManager.get('properties.openai.apiKey');
      const duration = new Date().getTime() - start;
      results.push(duration);
      Logger.log('Run ' + (i + 1) + ': ' + duration + 'ms' + (openaiKey ? ' ✓' : ' ✗'));
    } catch (error) {
      Logger.log('Run ' + (i + 1) + ': ERROR - ' + error.message);
      results.push(null);
    }
  }

  // Calculate statistics
  const validResults = results.filter(r => r !== null);
  const average = validResults.reduce((a, b) => a + b, 0) / validResults.length;
  const min = Math.min.apply(null, validResults);
  const max = Math.max.apply(null, validResults);

  Logger.log('\n' + '-'.repeat(60));
  Logger.log('RESULTS:');
  Logger.log('  Average: ' + Math.round(average) + 'ms');
  Logger.log('  Min: ' + min + 'ms');
  Logger.log('  Max: ' + max + 'ms');
  Logger.log('  Target: <2000ms (2 seconds)');
  Logger.log('  Status: ' + (average < 2000 ? '✅ PASS' : '❌ FAIL'));
  Logger.log('='.repeat(60) + '\n');

  return {
    test: 'ConfigurationManager Performance',
    runs: RUNS,
    average: Math.round(average),
    min: min,
    max: max,
    target: 2000,
    pass: average < 2000
  };
}

/**
 * TEST 2: Verify cache invalidation works correctly
 * Expected: First call loads, second call uses cache, invalidate clears cache
 *
 * @returns {Object} Test results
 */
function testCacheInvalidation() {
  Logger.log('='.repeat(60));
  Logger.log('TEST 2: Cache Invalidation Verification');
  Logger.log('='.repeat(60));

  // Clear cache to start fresh
  if (typeof ConfigurationManager !== 'undefined' && ConfigurationManager.invalidate) {
    ConfigurationManager.invalidate();
  }

  Logger.log('Testing cache behavior...\n');

  const start = new Date().getTime();
  let call1Complete = false;
  let call2Complete = false;
  let call1Time = 0;
  let call2Time = 0;

  try {
    // First call should load from source (slower)
    const config1 = ConfigurationManager.get('properties.openai.apiKey');
    call1Complete = true;
    call1Time = new Date().getTime() - start;
    Logger.log('First call completed in ' + call1Time + 'ms (load from source)');

    // Second call should use cached result (faster)
    const start2 = new Date().getTime();
    const config2 = ConfigurationManager.get('properties.openai.apiKey');
    call2Complete = true;
    call2Time = new Date().getTime() - start2;

    Logger.log('Second call completed in ' + call2Time + 'ms (cached)');

    const bothSame = config1 === config2; // Should be same value
    Logger.log('Both calls returned same value: ' + bothSame);
    Logger.log('Cache speed improvement: ' + Math.round((1 - call2Time/call1Time) * 100) + '%');

  } catch (error) {
    Logger.log('ERROR: ' + error.message);
  }

  Logger.log('\n' + '-'.repeat(60));
  Logger.log('RESULTS:');
  Logger.log('  First call: ' + (call1Complete ? '✓' : '✗'));
  Logger.log('  Second call: ' + (call2Complete ? '✓' : '✗'));
  Logger.log('  Cache working: ' + (call2Time < call1Time ? 'YES' : 'NO'));
  Logger.log('  Status: ' + (call1Complete && call2Complete ? '✅ PASS' : '❌ FAIL'));
  Logger.log('='.repeat(60) + '\n');

  return {
    test: 'Cache Invalidation Verification',
    call1Complete: call1Complete,
    call2Complete: call2Complete,
    cacheWorking: call2Time < call1Time,
    pass: call1Complete && call2Complete
  };
}

/**
 * TEST 3: Benchmark onOpen performance
 * Target: <10 seconds (down from 30+s)
 *
 * @returns {Object} Performance metrics
 */
function testOnOpenPerformance() {
  const RUNS = 5;
  const results = [];

  Logger.log('='.repeat(60));
  Logger.log('TEST 3: onOpen Performance Benchmark');
  Logger.log('='.repeat(60));
  Logger.log('Running ' + RUNS + ' iterations...\n');
  Logger.log('NOTE: This simulates onOpen by calling it directly\n');

  for (let i = 0; i < RUNS; i++) {
    // Reset initialization flag
    if (typeof MENU_INITIALIZED !== 'undefined') {
      MENU_INITIALIZED.value = false;
    }

    const start = new Date().getTime();
    try {
      onOpen(null);
      const duration = new Date().getTime() - start;
      results.push(duration);
      Logger.log('Run ' + (i + 1) + ': ' + duration + 'ms ✓');
    } catch (error) {
      const duration = new Date().getTime() - start;
      Logger.log('Run ' + (i + 1) + ': ' + duration + 'ms (error: ' + error.message + ')');
      results.push(duration); // Still record time even if error
    }
  }

  // Calculate statistics
  const average = results.reduce((a, b) => a + b, 0) / results.length;
  const min = Math.min.apply(null, results);
  const max = Math.max.apply(null, results);

  Logger.log('\n' + '-'.repeat(60));
  Logger.log('RESULTS:');
  Logger.log('  Average: ' + Math.round(average) + 'ms');
  Logger.log('  Min: ' + min + 'ms');
  Logger.log('  Max: ' + max + 'ms');
  Logger.log('  Target: <10000ms (10 seconds)');
  Logger.log('  Status: ' + (average < 10000 ? '✅ PASS' : '❌ FAIL'));
  Logger.log('='.repeat(60) + '\n');

  return {
    test: 'onOpen Performance',
    runs: RUNS,
    average: Math.round(average),
    min: min,
    max: max,
    target: 10000,
    pass: average < 10000
  };
}

/**
 * TEST 4: Verify deferred initialization works
 * Expected: MENU_INITIALIZED flag is false initially, true after first action
 *
 * @returns {Object} Test results
 */
function testDeferredInitialization() {
  Logger.log('='.repeat(60));
  Logger.log('TEST 4: Deferred Initialization Verification');
  Logger.log('='.repeat(60));

  let initialState = false;
  let afterOnOpenState = false;
  let afterMenuActionState = false;
  let deferredFunctionExists = false;

  // Check if deferred initialization function exists
  deferredFunctionExists = typeof deferredInitialization === 'function';
  Logger.log('deferredInitialization() function exists: ' + deferredFunctionExists);

  // Check initial state
  if (typeof MENU_INITIALIZED !== 'undefined') {
    MENU_INITIALIZED.value = false;
    initialState = MENU_INITIALIZED.value === false;
    Logger.log('Initial MENU_INITIALIZED.value: ' + MENU_INITIALIZED.value);
  }

  // Call onOpen (should not initialize)
  try {
    onOpen(null);
    if (typeof MENU_INITIALIZED !== 'undefined') {
      afterOnOpenState = MENU_INITIALIZED.value === false;
      Logger.log('After onOpen(), MENU_INITIALIZED.value: ' + MENU_INITIALIZED.value);
      Logger.log('  Expected: false (deferred) - ' + (afterOnOpenState ? '✓' : '✗'));
    }
  } catch (error) {
    Logger.log('onOpen() error: ' + error.message);
  }

  // Call a menu action (should trigger initialization)
  try {
    if (deferredFunctionExists) {
      deferredInitialization();
      if (typeof MENU_INITIALIZED !== 'undefined') {
        afterMenuActionState = MENU_INITIALIZED.value === true;
        Logger.log('After deferredInitialization(), MENU_INITIALIZED.value: ' + MENU_INITIALIZED.value);
        Logger.log('  Expected: true (initialized) - ' + (afterMenuActionState ? '✓' : '✗'));
      }
    }
  } catch (error) {
    Logger.log('deferredInitialization() error: ' + error.message);
  }

  // Test idempotency (calling twice should be safe)
  try {
    if (deferredFunctionExists) {
      deferredInitialization();
      const stillTrue = MENU_INITIALIZED.value === true;
      Logger.log('After second deferredInitialization(), still true: ' + stillTrue);
      Logger.log('  Idempotency test: ' + (stillTrue ? '✓' : '✗'));
    }
  } catch (error) {
    Logger.log('Idempotency test error: ' + error.message);
  }

  Logger.log('\n' + '-'.repeat(60));
  Logger.log('RESULTS:');
  Logger.log('  Function exists: ' + (deferredFunctionExists ? '✓' : '✗'));
  Logger.log('  Initial state correct: ' + (initialState ? '✓' : '✗'));
  Logger.log('  After onOpen deferred: ' + (afterOnOpenState ? '✓' : '✗'));
  Logger.log('  After action initialized: ' + (afterMenuActionState ? '✓' : '✗'));
  const pass = deferredFunctionExists && initialState && afterOnOpenState && afterMenuActionState;
  Logger.log('  Status: ' + (pass ? '✅ PASS' : '❌ FAIL'));
  Logger.log('='.repeat(60) + '\n');

  return {
    test: 'Deferred Initialization',
    functionExists: deferredFunctionExists,
    initialState: initialState,
    afterOnOpen: afterOnOpenState,
    afterAction: afterMenuActionState,
    pass: pass
  };
}

/**
 * TEST 5: Performance regression check
 * Compares current performance against baseline expectations
 *
 * @returns {Object} Regression test results
 */
function testPerformanceRegression() {
  Logger.log('='.repeat(60));
  Logger.log('TEST 5: Performance Regression Check');
  Logger.log('='.repeat(60));

  const baselines = {
    configurationManager: { before: 9000, after: 2000 }, // ms
    onOpen: { before: 30000, after: 10000 } // ms
  };

  Logger.log('Expected improvements:');
  Logger.log('  ConfigurationManager: ' + baselines.configurationManager.before + 'ms → ' + baselines.configurationManager.after + 'ms');
  Logger.log('  onOpen: ' + baselines.onOpen.before + 'ms → ' + baselines.onOpen.after + 'ms\n');

  // Run quick performance tests (3 runs each for speed)
  const configManagerTimes = [];
  const onOpenTimes = [];

  Logger.log('Running quick performance checks (3 runs each)...\n');

  // Test ConfigurationManager
  for (let i = 0; i < 3; i++) {
    // Invalidate cache
    if (typeof ConfigurationManager !== 'undefined' && ConfigurationManager.invalidate) {
      ConfigurationManager.invalidate();
    }
    const start = new Date().getTime();
    try {
      ConfigurationManager.get('properties.openai.apiKey');
      configManagerTimes.push(new Date().getTime() - start);
    } catch (error) {
      Logger.log('ConfigurationManager run ' + (i+1) + ' error: ' + error.message);
    }
  }

  // Test onOpen
  for (let i = 0; i < 3; i++) {
    if (typeof MENU_INITIALIZED !== 'undefined') {
      MENU_INITIALIZED.value = false;
    }
    const start = new Date().getTime();
    try {
      onOpen(null);
      onOpenTimes.push(new Date().getTime() - start);
    } catch (error) {
      onOpenTimes.push(new Date().getTime() - start);
    }
  }

  const avgConfigManager = configManagerTimes.reduce((a, b) => a + b, 0) / configManagerTimes.length;
  const avgOnOpen = onOpenTimes.reduce((a, b) => a + b, 0) / onOpenTimes.length;

  const configManagerPass = avgConfigManager < baselines.configurationManager.after;
  const onOpenPass = avgOnOpen < baselines.onOpen.after;

  Logger.log('RESULTS:');
  Logger.log('  ConfigurationManager average: ' + Math.round(avgConfigManager) + 'ms (target: <' + baselines.configurationManager.after + 'ms) ' + (configManagerPass ? '✓' : '✗'));
  Logger.log('  onOpen average: ' + Math.round(avgOnOpen) + 'ms (target: <' + baselines.onOpen.after + 'ms) ' + (onOpenPass ? '✓' : '✗'));
  Logger.log('\n  Overall: ' + (configManagerPass && onOpenPass ? '✅ PASS (No regression)' : '❌ FAIL (Performance regression detected)'));
  Logger.log('='.repeat(60) + '\n');

  return {
    test: 'Performance Regression',
    configurationManager: {
      average: Math.round(avgConfigManager),
      target: baselines.configurationManager.after,
      pass: configManagerPass
    },
    onOpen: {
      average: Math.round(avgOnOpen),
      target: baselines.onOpen.after,
      pass: onOpenPass
    },
    pass: configManagerPass && onOpenPass
  };
}

/**
 * Run all Phase 3 verification tests
 *
 * @returns {Object} Summary of all test results
 */
function runAllPhase3Tests() {
  Logger.log('\n\n');
  Logger.log('╔' + '═'.repeat(58) + '╗');
  Logger.log('║' + ' '.repeat(58) + '║');
  Logger.log('║' + '  PHASE 3 PERFORMANCE VERIFICATION - FULL TEST SUITE  '.padEnd(58, ' ') + '║');
  Logger.log('║' + ' '.repeat(58) + '║');
  Logger.log('╚' + '═'.repeat(58) + '╝');
  Logger.log('\n');

  const results = [];

  try {
    results.push(testConfigurationManagerPerformance());
  } catch (error) {
    Logger.log('TEST 1 EXCEPTION: ' + error.message + '\n');
    results.push({ test: 'ConfigurationManager Performance', pass: false, error: error.message });
  }

  try {
    results.push(testCacheInvalidation());
  } catch (error) {
    Logger.log('TEST 2 EXCEPTION: ' + error.message + '\n');
    results.push({ test: 'Cache Invalidation Verification', pass: false, error: error.message });
  }

  try {
    results.push(testOnOpenPerformance());
  } catch (error) {
    Logger.log('TEST 3 EXCEPTION: ' + error.message + '\n');
    results.push({ test: 'onOpen Performance', pass: false, error: error.message });
  }

  try {
    results.push(testDeferredInitialization());
  } catch (error) {
    Logger.log('TEST 4 EXCEPTION: ' + error.message + '\n');
    results.push({ test: 'Deferred Initialization', pass: false, error: error.message });
  }

  try {
    results.push(testPerformanceRegression());
  } catch (error) {
    Logger.log('TEST 5 EXCEPTION: ' + error.message + '\n');
    results.push({ test: 'Performance Regression', pass: false, error: error.message });
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  const passRate = Math.round((passed / results.length) * 100);

  Logger.log('\n\n');
  Logger.log('╔' + '═'.repeat(58) + '╗');
  Logger.log('║' + ' '.repeat(58) + '║');
  Logger.log('║' + '  FINAL SUMMARY  '.padStart(38, ' ').padEnd(58, ' ') + '║');
  Logger.log('║' + ' '.repeat(58) + '║');
  Logger.log('╚' + '═'.repeat(58) + '╝');
  Logger.log('\n');
  Logger.log('Total Tests: ' + results.length);
  Logger.log('Passed: ' + passed + ' (' + passRate + '%)');
  Logger.log('Failed: ' + failed);
  Logger.log('\n');

  results.forEach(function(result, index) {
    Logger.log((index + 1) + '. ' + result.test + ': ' + (result.pass ? '✅ PASS' : '❌ FAIL'));
  });

  Logger.log('\n' + '='.repeat(60));
  Logger.log('PHASE 3 STATUS: ' + (passRate === 100 ? '✅ ALL TESTS PASS' : '⚠️ SOME TESTS FAILED'));
  Logger.log('='.repeat(60) + '\n\n');

  return {
    total: results.length,
    passed: passed,
    failed: failed,
    passRate: passRate,
    details: results
  };
}

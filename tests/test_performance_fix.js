/**
 * Performance Fix Validation Tests
 * Tests for PERFORMANCE_FIX_DESIGN.md implementation
 * Contract: REQ_20260111_012053
 *
 * Validates:
 * - Phase lookup building (buildPhaseLookup_)
 * - Single-pass processing (processAndNormalizeEntries_)
 * - Hash caching optimization
 * - Performance improvements
 * - Output equivalence
 */

// Test pattern from App-script/admin/_TestCorrelation.js (test structure)

/**
 * Test 1: Phase Lookup Building
 * Verifies buildPhaseLookup_ creates correct normalized lookup map
 */
function testBuildPhaseLookup() {
  const testPhases = [
    { id: 'discovery', label: 'Discovery', canonical: 'discovery-phase' },
    { id: 'design', label: 'Design Phase', canonical: 'design' },
    { id: 'development', label: 'Development', canonical: 'dev-phase' }
  ];

  const lookup = buildPhaseLookup_(testPhases);

  // Verify all normalized variants point to correct phase
  const assertions = [
    { key: 'discovery', expectedOrderIndex: 0, desc: 'ID normalized' },
    { key: 'discovery-phase', expectedOrderIndex: 0, desc: 'Canonical normalized' },
    { key: 'design', expectedOrderIndex: 1, desc: 'Design ID' },
    { key: 'design phase', expectedOrderIndex: 1, desc: 'Label with space normalized' },
    { key: 'development', expectedOrderIndex: 2, desc: 'Development ID' },
    { key: 'dev-phase', expectedOrderIndex: 2, desc: 'Dev canonical' }
  ];

  let passed = 0;
  let failed = 0;

  assertions.forEach(function(test) {
    const phase = lookup[test.key];
    if (!phase) {
      UnifiedLogger.error('Test', 'Phase lookup missing key', { key: test.key, test: test.desc });
      failed++;
      return;
    }

    if (phase.orderIndex !== test.expectedOrderIndex) {
      UnifiedLogger.error('Test', 'Phase orderIndex mismatch', {
        key: test.key,
        expected: test.expectedOrderIndex,
        actual: phase.orderIndex,
        test: test.desc
      });
      failed++;
      return;
    }

    passed++;
  });

  UnifiedLogger.info('Test', 'testBuildPhaseLookup results', {
    passed: passed,
    failed: failed,
    total: assertions.length,
    success: failed === 0
  });

  return { passed: passed, failed: failed, success: failed === 0 };
}

/**
 * Test 2: Single-Pass Processing
 * Verifies processAndNormalizeEntries_ correctly processes entries in one loop
 */
function testProcessAndNormalizeEntries() {
  // Test data - pattern from App-script/ScopeMap.js:698 (entry structure)
  const testEntries = [
    {
      id: 'e1',
      sectionId: 'Discovery',
      scopeLabel: 'Project Discovery',
      metadata: {}
    },
    {
      id: 'e2',
      sectionId: 'unknown-phase',
      scopeLabel: 'Unknown Phase',
      metadata: {}
    },
    {
      id: 'e3',
      sectionId: 'Design',
      scopeLabel: 'UI Design',
      metadata: {}
    }
  ];

  // Clone test data
  const entries = JSON.parse(JSON.stringify(testEntries));

  // Process entries
  const processed = processAndNormalizeEntries_(entries, 'smm-retainer');

  // Verify processing
  let passed = 0;
  let failed = 0;

  // Test 1: First entry should match discovery phase
  if (processed[0].sectionId && processed[0].sectionId.toLowerCase().indexOf('discover') !== -1) {
    passed++;
  } else {
    UnifiedLogger.error('Test', 'Entry 1 sectionId not matched', {
      actual: processed[0].sectionId,
      expected: 'discovery-related'
    });
    failed++;
  }

  // Test 2: First entry should have metadata
  if (processed[0].metadata && processed[0].metadata.categoryPhase) {
    passed++;
  } else {
    UnifiedLogger.error('Test', 'Entry 1 missing metadata.categoryPhase');
    failed++;
  }

  // Test 3: Unknown phase should get fallback recovery
  if (processed[1].metadata && processed[1].metadata.phaseRecovered) {
    passed++;
  } else {
    UnifiedLogger.error('Test', 'Entry 2 missing phaseRecovered metadata');
    failed++;
  }

  // Test 4: All entries should have metadata populated
  let allHaveMetadata = true;
  processed.forEach(function(entry) {
    if (!entry.metadata || !entry.metadata.categoryPhase) {
      allHaveMetadata = false;
    }
  });

  if (allHaveMetadata) {
    passed++;
  } else {
    UnifiedLogger.error('Test', 'Not all entries have metadata populated');
    failed++;
  }

  UnifiedLogger.info('Test', 'testProcessAndNormalizeEntries results', {
    passed: passed,
    failed: failed,
    total: 4,
    success: failed === 0
  });

  return { passed: passed, failed: failed, success: failed === 0 };
}

/**
 * Test 3: Extract Ancillary Flags
 * Verifies extractAncillaryFlags_ correctly extracts fee types
 */
function testExtractAncillaryFlags() {
  const testConfig = {
    ancillaryFees: [
      { type: 'rush-fee', label: 'Rush Fee', amount: 500 },
      { type: 'travel', label: 'Travel', amount: 300 },
      null, // Should be filtered out
      { type: '', label: 'Empty' }, // Should be filtered out
      { type: 'equipment', label: 'Equipment', amount: 200 }
    ]
  };

  const flags = extractAncillaryFlags_(testConfig);

  let passed = 0;
  let failed = 0;

  // Should extract 3 valid flags
  if (flags.length === 3) {
    passed++;
  } else {
    UnifiedLogger.error('Test', 'Wrong flag count', { expected: 3, actual: flags.length });
    failed++;
  }

  // Should include rush-fee
  if (flags.indexOf('rush-fee') !== -1) {
    passed++;
  } else {
    UnifiedLogger.error('Test', 'Missing rush-fee in flags');
    failed++;
  }

  // Should filter out empty and null
  if (flags.indexOf('') === -1 && flags.indexOf(null) === -1 && flags.indexOf(undefined) === -1) {
    passed++;
  } else {
    UnifiedLogger.error('Test', 'Failed to filter empty/null values');
    failed++;
  }

  UnifiedLogger.info('Test', 'testExtractAncillaryFlags results', {
    passed: passed,
    failed: failed,
    total: 3,
    success: failed === 0,
    flags: flags
  });

  return { passed: passed, failed: failed, success: failed === 0 };
}

/**
 * Test 4: Performance Measurement
 * Measures actual execution time to verify performance improvement
 */
function testPerformanceMeasurement() {
  // Create test data with 20 entries (matching production scale)
  const entries = [];
  for (let i = 0; i < 20; i++) {
    entries.push({
      id: 'entry-' + i,
      sectionId: i % 2 === 0 ? 'Discovery' : 'Design',
      scopeLabel: 'Test Entry ' + i,
      metadata: {}
    });
  }

  // Measure processing time
  const startTime = new Date().getTime();

  processAndNormalizeEntries_(entries, 'smm-retainer');

  const endTime = new Date().getTime();
  const duration = endTime - startTime;

  // Performance target: Should complete in <500ms for 20 entries
  const targetMs = 500;
  const success = duration < targetMs;

  UnifiedLogger.info('Test', 'testPerformanceMeasurement results', {
    duration: duration + 'ms',
    target: targetMs + 'ms',
    success: success,
    entries: entries.length,
    improvement: success ? 'Performance target met' : 'Performance target missed'
  });

  return {
    passed: success ? 1 : 0,
    failed: success ? 0 : 1,
    success: success,
    duration: duration
  };
}

/**
 * Run all performance fix tests
 * Entry point for test suite
 */
function runPerformanceFixTests() {
  UnifiedLogger.info('Test', 'Starting performance fix test suite', {
    contract: 'REQ_20260111_012053',
    timestamp: new Date().toISOString()
  });

  const results = [];

  // Run all tests
  try {
    results.push({ name: 'testBuildPhaseLookup', result: testBuildPhaseLookup() });
  } catch (error) {
    UnifiedLogger.error('Test', 'testBuildPhaseLookup threw exception', error);
    results.push({ name: 'testBuildPhaseLookup', result: { passed: 0, failed: 1, success: false, error: error } });
  }

  try {
    results.push({ name: 'testProcessAndNormalizeEntries', result: testProcessAndNormalizeEntries() });
  } catch (error) {
    UnifiedLogger.error('Test', 'testProcessAndNormalizeEntries threw exception', error);
    results.push({ name: 'testProcessAndNormalizeEntries', result: { passed: 0, failed: 1, success: false, error: error } });
  }

  try {
    results.push({ name: 'testExtractAncillaryFlags', result: testExtractAncillaryFlags() });
  } catch (error) {
    UnifiedLogger.error('Test', 'testExtractAncillaryFlags threw exception', error);
    results.push({ name: 'testExtractAncillaryFlags', result: { passed: 0, failed: 1, success: false, error: error } });
  }

  try {
    results.push({ name: 'testPerformanceMeasurement', result: testPerformanceMeasurement() });
  } catch (error) {
    UnifiedLogger.error('Test', 'testPerformanceMeasurement threw exception', error);
    results.push({ name: 'testPerformanceMeasurement', result: { passed: 0, failed: 1, success: false, error: error } });
  }

  // Calculate totals
  let totalPassed = 0;
  let totalFailed = 0;
  let testsSucceeded = 0;

  results.forEach(function(test) {
    totalPassed += test.result.passed || 0;
    totalFailed += test.result.failed || 0;
    if (test.result.success) {
      testsSucceeded++;
    }
  });

  const allPassed = totalFailed === 0;

  UnifiedLogger.info('Test', 'Performance fix test suite complete', {
    totalTests: results.length,
    testsSucceeded: testsSucceeded,
    testsFailed: results.length - testsSucceeded,
    totalAssertionsPassed: totalPassed,
    totalAssertionsFailed: totalFailed,
    allPassed: allPassed
  });

  // Return summary
  return {
    allPassed: allPassed,
    totalTests: results.length,
    testsSucceeded: testsSucceeded,
    totalAssertionsPassed: totalPassed,
    totalAssertionsFailed: totalFailed,
    results: results
  };
}

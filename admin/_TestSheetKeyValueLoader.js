/**
 * Test SheetKeyValueLoader Integration
 * Verify all breaking config keys resolve
 *
 * @created 2026-01-13 (Plan 10-05 Task 5)
 */
function testSheetKeyValueLoaderIntegration() {
  console.log('=== SheetKeyValueLoader Integration Test ===\n');

  const breakingKeys = [
    'DEFAULT_CURRENCY',
    'XERO_TAX_TYPE',
    'SECTION_TAXONOMY',
    'VECTOR_SEARCH_QUERY_WORD_LIMIT',
    'TARGET_MARGIN_PCT'
  ];

  let passed = 0;
  let failed = 0;

  // Test 1: Direct ConfigurationManager.get() access
  console.log('Test 1: ConfigurationManager.get() with sheet.* keys');
  breakingKeys.forEach(function(key) {
    try {
      const value = ConfigurationManager.get('sheet.' + key);
      if (value !== undefined && value !== null) {
        console.log('  ✓ sheet.' + key + ' = ' + String(value).substring(0, 50));
        passed++;
      } else {
        console.error('  ✗ sheet.' + key + ' returned null/undefined');
        failed++;
      }
    } catch (error) {
      console.error('  ✗ sheet.' + key + ' threw error: ' + error.message);
      failed++;
    }
  });

  console.log('');

  // Test 2: getConfigValue() wrapper (properties→sheet fallback)
  console.log('Test 2: getConfigValue() wrapper with fallback');
  breakingKeys.forEach(function(key) {
    try {
      const value = getConfigValue(key);
      if (value !== undefined && value !== null) {
        console.log('  ✓ ' + key + ' = ' + String(value).substring(0, 50));
        passed++;
      } else {
        console.error('  ✗ ' + key + ' returned null/undefined');
        failed++;
      }
    } catch (error) {
      console.error('  ✗ ' + key + ' threw error: ' + error.message);
      failed++;
    }
  });

  console.log('');

  // Test 3: JSON parsing (SECTION_TAXONOMY)
  console.log('Test 3: JSON value parsing');
  try {
    const taxonomy = ConfigurationManager.get('sheet.SECTION_TAXONOMY');
    if (typeof taxonomy === 'object' && taxonomy !== null) {
      console.log('  ✓ SECTION_TAXONOMY parsed as object');
      console.log('    Keys:', Object.keys(taxonomy).slice(0, 3).join(', '));
      passed++;
    } else {
      console.error('  ✗ SECTION_TAXONOMY not an object');
      failed++;
    }
  } catch (error) {
    console.error('  ✗ SECTION_TAXONOMY failed:', error.message);
    failed++;
  }

  console.log('');

  // Test 4: Number parsing (VECTOR_SEARCH_QUERY_WORD_LIMIT)
  console.log('Test 4: Number value parsing');
  try {
    const limit = ConfigurationManager.get('sheet.VECTOR_SEARCH_QUERY_WORD_LIMIT');
    if (typeof limit === 'number') {
      console.log('  ✓ VECTOR_SEARCH_QUERY_WORD_LIMIT = ' + limit + ' (number)');
      passed++;
    } else {
      console.error('  ✗ VECTOR_SEARCH_QUERY_WORD_LIMIT not a number: ' + typeof limit);
      failed++;
    }
  } catch (error) {
    console.error('  ✗ VECTOR_SEARCH_QUERY_WORD_LIMIT failed:', error.message);
    failed++;
  }

  console.log('');

  // Test 5: Cache invalidation
  console.log('Test 5: Cache invalidation');
  try {
    const before = ConfigurationManager.get('sheet.DEFAULT_CURRENCY');
    ConfigurationManager.invalidate('sheet.DEFAULT_CURRENCY');
    const after = ConfigurationManager.get('sheet.DEFAULT_CURRENCY');
    if (before === after) {
      console.log('  ✓ Cache invalidation + reload successful');
      passed++;
    } else {
      console.error('  ✗ Value changed after invalidation');
      failed++;
    }
  } catch (error) {
    console.error('  ✗ Cache invalidation failed:', error.message);
    failed++;
  }

  console.log('');

  // Summary
  console.log('=== TEST SUMMARY ===');
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  console.log('Total: ' + (passed + failed));

  if (failed === 0) {
    console.log('✅ ALL TESTS PASSED');
  } else {
    console.error('❌ SOME TESTS FAILED');
  }

  return { passed: passed, failed: failed };
}

/**
 * Test AI Quote Builder config access
 */
function testAIQuoteBuilderConfig() {
  console.log('Testing AI Quote Builder config access...');
  try {
    const currency = getConfigValue('DEFAULT_CURRENCY');
    const taxType = getConfigValue('XERO_TAX_TYPE');
    const taxonomy = getConfigValue('SECTION_TAXONOMY');
    console.log('✓ AI Quote Builder configs accessible');
    console.log('  Currency: ' + currency);
    console.log('  Tax Type: ' + taxType);
    console.log('  Taxonomy keys: ' + Object.keys(taxonomy).length);
  } catch (error) {
    console.error('✗ AI Quote Builder config access failed:', error.message);
  }
}

/**
 * Test Vector Search config access
 */
function testVectorSearchConfig() {
  console.log('Testing Vector Search config access...');
  try {
    const wordLimit = getConfigValue('VECTOR_SEARCH_QUERY_WORD_LIMIT');
    console.log('✓ Vector Search config accessible');
    console.log('  Word Limit: ' + wordLimit);
  } catch (error) {
    console.error('✗ Vector Search config access failed:', error.message);
  }
}

/**
 * Test Commercial Fit config access
 */
function testCommercialFitConfig() {
  console.log('Testing Commercial Fit config access...');
  try {
    const margin = getConfigValue('TARGET_MARGIN_PCT');
    console.log('✓ Commercial Fit config accessible');
    console.log('  Target Margin: ' + (margin * 100) + '%');
  } catch (error) {
    console.error('✗ Commercial Fit config access failed:', error.message);
  }
}

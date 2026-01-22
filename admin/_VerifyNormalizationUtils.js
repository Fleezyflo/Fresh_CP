/**
 * Verification script for NormalizationUtils
 *
 * Tests all 8 canonical normalization utilities with representative inputs.
 * Run manually in Apps Script Editor to verify module functionality.
 */

function verifyNormalizationUtils() {
  Logger.log('='.repeat(60));
  Logger.log('Normalization Utils Verification');
  Logger.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  // Helper function to test and log results
  function test(name, actual, expected) {
    const result = JSON.stringify(actual) === JSON.stringify(expected);
    if (result) {
      Logger.log('✓ ' + name);
      passed++;
    } else {
      Logger.log('✗ ' + name);
      Logger.log('  Expected: ' + JSON.stringify(expected));
      Logger.log('  Actual:   ' + JSON.stringify(actual));
      failed++;
    }
    return result;
  }

  Logger.log('\n--- normalizeString ---');
  test(
    'normalizeString: trim and collapse whitespace',
    NormalizationUtils.normalizeString('  Hello   World  '),
    'Hello World'
  );
  test(
    'normalizeString: lowercase',
    NormalizationUtils.normalizeString('HELLO', { lowercase: true }),
    'hello'
  );
  test(
    'normalizeString: remove special chars',
    NormalizationUtils.normalizeString('Hello@World!', { removeSpecialChars: true }),
    'HelloWorld'
  );
  test(
    'normalizeString: null/undefined',
    NormalizationUtils.normalizeString(null),
    ''
  );

  Logger.log('\n--- normalizeKey ---');
  test(
    'normalizeKey: convert to key format',
    NormalizationUtils.normalizeKey('Phase Key #1'),
    'phase-key-1'
  );
  test(
    'normalizeKey: remove consecutive hyphens',
    NormalizationUtils.normalizeKey('test---key'),
    'test-key'
  );
  test(
    'normalizeKey: null handling',
    NormalizationUtils.normalizeKey(null),
    ''
  );

  Logger.log('\n--- normalizeTextForHash ---');
  test(
    'normalizeTextForHash: preserve special chars',
    NormalizationUtils.normalizeTextForHash('  Compare THIS!  '),
    'compare this!'
  );
  test(
    'normalizeTextForHash: consistent hashing',
    NormalizationUtils.normalizeTextForHash('Test@123'),
    'test@123'
  );

  Logger.log('\n--- normalizeBoolean ---');
  test(
    'normalizeBoolean: string "true"',
    NormalizationUtils.normalizeBoolean('true', false),
    true
  );
  test(
    'normalizeBoolean: string "false"',
    NormalizationUtils.normalizeBoolean('false', true),
    false
  );
  test(
    'normalizeBoolean: number 1',
    NormalizationUtils.normalizeBoolean(1, false),
    true
  );
  test(
    'normalizeBoolean: number 0',
    NormalizationUtils.normalizeBoolean(0, true),
    false
  );
  test(
    'normalizeBoolean: null with default',
    NormalizationUtils.normalizeBoolean(null, true),
    true
  );

  Logger.log('\n--- normalizeNumber ---');
  test(
    'normalizeNumber: string to number',
    NormalizationUtils.normalizeNumber('42', 0),
    42
  );
  test(
    'normalizeNumber: invalid string',
    NormalizationUtils.normalizeNumber('abc', 99),
    99
  );
  test(
    'normalizeNumber: null with default',
    NormalizationUtils.normalizeNumber(null, 10),
    10
  );
  test(
    'normalizeNumber: actual number',
    NormalizationUtils.normalizeNumber(123, 0),
    123
  );

  Logger.log('\n--- normalizeArray ---');
  test(
    'normalizeArray: null with default',
    NormalizationUtils.normalizeArray(null, ['default']),
    ['default']
  );
  test(
    'normalizeArray: existing array',
    NormalizationUtils.normalizeArray([1, 2, 3], []),
    [1, 2, 3]
  );
  test(
    'normalizeArray: string to single-item array',
    NormalizationUtils.normalizeArray('test', []),
    ['test']
  );
  test(
    'normalizeArray: JSON string to array',
    NormalizationUtils.normalizeArray('[1,2,3]', []),
    [1, 2, 3]
  );

  Logger.log('\n--- normalizeObject ---');
  test(
    'normalizeObject: merge with defaults',
    NormalizationUtils.normalizeObject({ a: 1 }, { a: 0, b: 2 }),
    { a: 1, b: 2 }
  );
  test(
    'normalizeObject: null with defaults',
    NormalizationUtils.normalizeObject(null, { x: 10 }),
    { x: 10 }
  );
  test(
    'normalizeObject: fill missing keys',
    NormalizationUtils.normalizeObject({ name: 'test' }, { name: '', count: 0 }),
    { name: 'test', count: 0 }
  );

  Logger.log('\n--- fillDefaults ---');
  test(
    'fillDefaults: merge objects',
    NormalizationUtils.fillDefaults({ a: 1 }, { a: 0, b: 2 }),
    { a: 1, b: 2 }
  );
  test(
    'fillDefaults: empty object with defaults',
    NormalizationUtils.fillDefaults({}, { x: 1, y: 2 }),
    { x: 1, y: 2 }
  );
  test(
    'fillDefaults: override all defaults',
    NormalizationUtils.fillDefaults({ a: 5, b: 10 }, { a: 0, b: 0 }),
    { a: 5, b: 10 }
  );

  Logger.log('\n' + '='.repeat(60));
  Logger.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log(failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  Logger.log('='.repeat(60));

  return { passed: passed, failed: failed, success: failed === 0 };
}

/**
 * Diagnostic script to trace scope.phases config loading
 *
 * Run this to see exactly where the loading fails
 */

function diagnoseScopeConfigLoading() {
  Logger.log('=== DIAGNOSTIC: Scope Config Loading ===');

  // Step 1: Check if sheet exists
  Logger.log('\n1. Checking if sheet exists...');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config: Scope Phases');

  if (!sheet) {
    Logger.log('❌ SHEET NOT FOUND: Config: Scope Phases');
    Logger.log('Available sheets:');
    ss.getSheets().forEach(function(s) {
      Logger.log('  - ' + s.getName());
    });
    return;
  }

  Logger.log('✅ Sheet found: Config: Scope Phases');

  // Step 2: Check data range
  Logger.log('\n2. Checking data range...');
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  Logger.log('Total rows: ' + values.length);
  Logger.log('Total columns: ' + (values.length > 0 ? values[0].length : 0));

  if (values.length < 2) {
    Logger.log('❌ SHEET HAS NO DATA ROWS (need at least header + 1 data row)');
    return;
  }

  // Step 3: Check headers
  Logger.log('\n3. Checking headers...');
  const headers = values[0];
  Logger.log('Headers found: ' + headers.join(', '));

  const expectedHeaders = [
    'briefType', 'phaseId', 'label', 'canonical', 'required', 'order',
    'ancillaryFeeFlagsCSV', 'cadence', 'deliverableHint', 'signalHint',
    'synonymsCSV', 'taxonomyHintJSON', 'active'
  ];

  const missingHeaders = [];
  expectedHeaders.forEach(function(expected) {
    const normalized = expected.toLowerCase().trim();
    const found = headers.some(function(h) {
      return String(h).toLowerCase().trim() === normalized;
    });
    if (!found) {
      missingHeaders.push(expected);
    }
  });

  if (missingHeaders.length > 0) {
    Logger.log('❌ MISSING HEADERS: ' + missingHeaders.join(', '));
    return;
  }

  Logger.log('✅ All expected headers found');

  // Step 4: Check first data row
  Logger.log('\n4. Checking first data row...');
  if (values.length < 2) {
    Logger.log('❌ NO DATA ROWS');
    return;
  }

  const firstRow = values[1];
  Logger.log('First row values:');
  headers.forEach(function(h, i) {
    Logger.log('  ' + h + ': ' + String(firstRow[i]).substring(0, 100));
  });

  // Step 5: Try ConfigurationManager.get
  Logger.log('\n5. Testing ConfigurationManager.get("scope.phases")...');
  try {
    // Clear cache first
    if (typeof ConfigurationManager !== 'undefined' && ConfigurationManager.invalidate) {
      Logger.log('Invalidating cache...');
      ConfigurationManager.invalidate('scope.phases');
    }

    const phases = ConfigurationManager.get('scope.phases');

    if (!phases) {
      Logger.log('❌ ConfigurationManager.get returned: ' + phases);
      return;
    }

    if (!Array.isArray(phases)) {
      Logger.log('❌ ConfigurationManager.get returned non-array: ' + typeof phases);
      return;
    }

    Logger.log('✅ ConfigurationManager.get returned array with ' + phases.length + ' items');

    if (phases.length === 0) {
      Logger.log('❌ ARRAY IS EMPTY');
      return;
    }

    Logger.log('\nFirst phase:');
    const firstPhase = phases[0];
    Object.keys(firstPhase).forEach(function(key) {
      const val = String(firstPhase[key]).substring(0, 100);
      Logger.log('  ' + key + ': ' + val);
    });

    // Step 6: Check if smm-retainer exists
    Logger.log('\n6. Checking for smm-retainer...');
    const smmPhases = phases.filter(function(p) {
      return p.briefType === 'smm-retainer';
    });

    Logger.log('Found ' + smmPhases.length + ' phases for smm-retainer');

    if (smmPhases.length === 0) {
      Logger.log('❌ NO PHASES FOR smm-retainer');
      Logger.log('Available briefTypes:');
      const types = {};
      phases.forEach(function(p) {
        types[p.briefType] = (types[p.briefType] || 0) + 1;
      });
      Object.keys(types).forEach(function(t) {
        Logger.log('  - ' + t + ': ' + types[t] + ' phases');
      });
      return;
    }

    Logger.log('✅ smm-retainer phases found');

    // Step 7: Test getScopeCategoryConfigMap
    Logger.log('\n7. Testing getScopeCategoryConfigMap()...');
    const configMap = getScopeCategoryConfigMap();

    if (!configMap) {
      Logger.log('❌ getScopeCategoryConfigMap returned: ' + configMap);
      return;
    }

    Logger.log('✅ getScopeCategoryConfigMap returned object');
    Logger.log('BriefTypes in map: ' + Object.keys(configMap).join(', '));

    if (!configMap['smm-retainer']) {
      Logger.log('❌ NO smm-retainer IN CONFIG MAP');
      return;
    }

    Logger.log('✅ smm-retainer found in config map with ' + configMap['smm-retainer'].phases.length + ' phases');

    Logger.log('\n=== ALL CHECKS PASSED ===');

  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    Logger.log('Stack: ' + error.stack);
  }
}

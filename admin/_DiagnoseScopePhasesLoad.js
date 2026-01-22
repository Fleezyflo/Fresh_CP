/**
 * Diagnostic: Check what getScopeCategoryConfigMap is returning
 */
function diagnoseScopePhasesLoad() {
  console.log('=== SCOPE PHASES LOAD DIAGNOSTIC ===\n');

  // Test 1: Check if ConfigurationManager can load raw data
  console.log('1. Loading raw data from ConfigurationManager...');
  try {
    const rawPhases = ConfigurationManager.get('scope.phases');
    console.log('   ✅ Loaded ' + rawPhases.length + ' phase records');
    console.log('   First 3 records:');
    rawPhases.slice(0, 3).forEach(function(phase, index) {
      console.log('   Record ' + (index + 1) + ':');
      console.log('     - briefType: ' + phase.briefType);
      console.log('     - phaseId: ' + phase.phaseId);
      console.log('     - label: ' + phase.label);
      console.log('     - canonical: ' + phase.canonical);
    });
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
    return;
  }

  // Test 2: Check if getScopeCategoryConfigMap transforms correctly
  console.log('\n2. Calling getScopeCategoryConfigMap()...');
  try {
    const configMap = getScopeCategoryConfigMap();
    const briefTypes = Object.keys(configMap);
    console.log('   ✅ Got ' + briefTypes.length + ' brief types');
    console.log('   Brief types: ' + briefTypes.join(', '));

    const firstType = briefTypes[0];
    const firstConfig = configMap[firstType];
    console.log('\n   First brief type (' + firstType + '):');
    console.log('   - phases count: ' + (firstConfig.phases ? firstConfig.phases.length : 0));
    if (firstConfig.phases && firstConfig.phases.length > 0) {
      console.log('   - first phase: ' + firstConfig.phases[0].label);
    }
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
    return;
  }

  // Test 3: Check getScopeCategoryUiData (what the sidebar receives)
  console.log('\n3. Calling getScopeCategoryUiData()...');
  try {
    const uiData = getScopeCategoryUiData();
    console.log('   enabled: ' + uiData.enabled);
    console.log('   config keys: ' + Object.keys(uiData.config).join(', '));
    console.log('   hashes keys: ' + Object.keys(uiData.hashes).join(', '));

    // Check smm-retainer specifically
    if (uiData.config['smm-retainer']) {
      const smmConfig = uiData.config['smm-retainer'];
      console.log('\n   smm-retainer config:');
      console.log('   - phases: ' + (smmConfig.phases ? smmConfig.phases.length : 0));
      if (smmConfig.phases && smmConfig.phases.length > 0) {
        console.log('   - phase labels: ' + smmConfig.phases.map(function(p) { return p.label; }).join(', '));
      }
    } else {
      console.log('\n   ❌ smm-retainer NOT found in config!');
      console.log('   Available: ' + Object.keys(uiData.config).join(', '));
    }
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

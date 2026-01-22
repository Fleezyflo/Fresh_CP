/**
 * Check if SCOPE_CATEGORY_ENABLED script property is blocking the UI
 */
function checkScopeCategoryEnabled() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('CHECKING: SCOPE_CATEGORY_ENABLED Script Property');
  console.log('═══════════════════════════════════════════════════════════');

  // Check the script property directly
  const propValue = getScriptProperty('SCOPE_CATEGORY_ENABLED');
  console.log('\n1. Script Property Value:');
  console.log('   SCOPE_CATEGORY_ENABLED =', propValue === null ? 'NULL (not set)' : '"' + propValue + '"');
  console.log('   Type:', typeof propValue);

  // Check what isScopeCategoryEnabled() returns
  const enabled = isScopeCategoryEnabled();
  console.log('\n2. isScopeCategoryEnabled() returns:', enabled);

  // Check getScopeCategoryUiData() response
  console.log('\n3. getScopeCategoryUiData() response:');
  const uiData = getScopeCategoryUiData();
  console.log('   enabled:', uiData.enabled);
  console.log('   config keys:', Object.keys(uiData.config).join(', '));
  console.log('   hashes keys:', Object.keys(uiData.hashes).join(', '));

  // Diagnosis
  console.log('\n4. DIAGNOSIS:');
  if (propValue === null || propValue === undefined) {
    console.log('   ✅ Property not set - should default to TRUE');
  } else if (String(propValue).toLowerCase() === 'true') {
    console.log('   ✅ Property set to TRUE');
  } else {
    console.log('   ❌ Property set to FALSE or invalid value:', propValue);
    console.log('   🔧 FIX: Run this to enable:');
    console.log('      setScriptProperty("SCOPE_CATEGORY_ENABLED", "true")');
  }

  if (!enabled) {
    console.log('   ❌ PROBLEM: isScopeCategoryEnabled() returns FALSE');
    console.log('   This will cause UI to show "config missing" error');
  } else {
    console.log('   ✅ isScopeCategoryEnabled() returns TRUE');
  }

  if (!uiData.enabled) {
    console.log('   ❌ PROBLEM: getScopeCategoryUiData().enabled is FALSE');
    console.log('   UI will receive enabled=false and hide scope config');
  } else {
    console.log('   ✅ getScopeCategoryUiData().enabled is TRUE');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
}

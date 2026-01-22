/**
 * Diagnostic: Check what getBriefProfile is actually returning
 */
function diagnoseBriefProfileLoad() {
  console.log('=== BRIEF PROFILE LOAD DIAGNOSTIC ===\n');

  // Test 1: Check if ConfigurationManager can load raw data
  console.log('1. Loading raw data from ConfigurationManager...');
  try {
    const rawProfiles = ConfigurationManager.get('brief.profiles');
    console.log('   ✅ Loaded ' + rawProfiles.length + ' profiles');
    console.log('   First profile raw data:');
    console.log('   - briefType: ' + rawProfiles[0].briefType);
    console.log('   - label: ' + rawProfiles[0].label);
    console.log('   - sectionOrderCSV: ' + (rawProfiles[0].sectionOrderCSV ? rawProfiles[0].sectionOrderCSV.substring(0, 100) + '...' : 'EMPTY'));
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
    return;
  }

  // Test 2: Check if getBriefTypeProfiles parses correctly
  console.log('\n2. Calling getBriefTypeProfiles()...');
  try {
    const allProfiles = getBriefTypeProfiles();
    const profileKeys = Object.keys(allProfiles);
    console.log('   ✅ Got ' + profileKeys.length + ' profiles');
    console.log('   Profile types: ' + profileKeys.join(', '));

    const firstKey = profileKeys[0];
    const firstProfile = allProfiles[firstKey];
    console.log('\n   First profile (' + firstKey + '):');
    console.log('   - briefType: ' + firstProfile.briefType);
    console.log('   - label: ' + firstProfile.label);
    console.log('   - sectionOrder type: ' + typeof firstProfile.sectionOrder);
    console.log('   - sectionOrder is array: ' + Array.isArray(firstProfile.sectionOrder));
    console.log('   - sectionOrder length: ' + (Array.isArray(firstProfile.sectionOrder) ? firstProfile.sectionOrder.length : 'N/A'));
    console.log('   - sectionOrder value: ' + JSON.stringify(firstProfile.sectionOrder));
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
    return;
  }

  // Test 3: Check getBriefProfile for a specific type
  console.log('\n3. Calling getBriefProfile("smm-retainer")...');
  try {
    const profile = getBriefProfile('smm-retainer');
    console.log('   Profile returned:');
    console.log('   - briefType: ' + profile.briefType);
    console.log('   - label: ' + profile.label);
    console.log('   - sectionOrder: ' + JSON.stringify(profile.sectionOrder));
    console.log('   - sectionOrder length: ' + (Array.isArray(profile.sectionOrder) ? profile.sectionOrder.length : 'NOT AN ARRAY'));
  } catch (error) {
    console.log('   ❌ Error: ' + error.message);
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

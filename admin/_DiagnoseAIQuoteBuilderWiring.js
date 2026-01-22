/**
 * Comprehensive AI Quote Builder Pre-Flight Diagnostic
 *
 * Tests all components to ensure proper wiring before testing
 */
function diagnoseAIQuoteBuilderWiring() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║      AI QUOTE BUILDER - PRE-FLIGHT DIAGNOSTIC                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // Test 1: Configuration Loading
  console.log('1️⃣  CONFIGURATION LOADING');
  console.log('─'.repeat(60));
  try {
    const briefProfiles = ConfigurationManager.get('brief.profiles');
    if (!briefProfiles || briefProfiles.length === 0) {
      results.failed.push('Brief profiles not loaded');
      console.log('   ❌ Brief profiles: EMPTY');
    } else {
      results.passed.push('Brief profiles loaded: ' + briefProfiles.length);
      console.log('   ✅ Brief profiles: ' + briefProfiles.length + ' profiles');
    }

    const scopePhases = ConfigurationManager.get('scope.phases');
    if (!scopePhases || scopePhases.length === 0) {
      results.failed.push('Scope phases not loaded');
      console.log('   ❌ Scope phases: EMPTY');
    } else {
      results.passed.push('Scope phases loaded: ' + scopePhases.length);
      console.log('   ✅ Scope phases: ' + scopePhases.length + ' phase records');
    }
  } catch (error) {
    results.failed.push('Configuration loading error: ' + error.message);
    console.log('   ❌ Error: ' + error.message);
  }

  // Test 2: Brief Profile Parsing
  console.log('\n2️⃣  BRIEF PROFILE PARSING');
  console.log('─'.repeat(60));
  try {
    const allProfiles = getBriefTypeProfiles();
    const profileKeys = Object.keys(allProfiles);

    if (profileKeys.length === 0) {
      results.failed.push('No brief profiles parsed');
      console.log('   ❌ No profiles parsed');
    } else {
      console.log('   ✅ Profiles parsed: ' + profileKeys.join(', '));

      // Check first profile structure
      const firstKey = profileKeys[0];
      const firstProfile = allProfiles[firstKey];

      const requiredFields = ['briefType', 'label', 'sectionOrder', 'catalogPrefixes', 'signatureCues'];
      const missing = [];

      requiredFields.forEach(function(field) {
        if (!firstProfile.hasOwnProperty(field)) {
          missing.push(field);
        }
      });

      if (missing.length > 0) {
        results.failed.push('Profile missing fields: ' + missing.join(', '));
        console.log('   ❌ Missing fields in ' + firstKey + ': ' + missing.join(', '));
      } else {
        results.passed.push('Profile structure valid');
        console.log('   ✅ Profile structure: ALL required fields present');
      }

      // Check that sectionOrder is an array
      if (!Array.isArray(firstProfile.sectionOrder)) {
        results.failed.push('sectionOrder is not an array: ' + typeof firstProfile.sectionOrder);
        console.log('   ❌ sectionOrder type: ' + typeof firstProfile.sectionOrder + ' (expected array)');
      } else if (firstProfile.sectionOrder.length === 0) {
        results.warnings.push('sectionOrder is empty array for ' + firstKey);
        console.log('   ⚠️  sectionOrder: EMPTY ARRAY');
      } else {
        results.passed.push('sectionOrder is valid array: ' + firstProfile.sectionOrder.length);
        console.log('   ✅ sectionOrder: ' + firstProfile.sectionOrder.length + ' items');
        console.log('      ' + firstProfile.sectionOrder.slice(0, 3).join(', ') + '...');
      }
    }
  } catch (error) {
    results.failed.push('Brief profile parsing error: ' + error.message);
    console.log('   ❌ Error: ' + error.message);
  }

  // Test 3: Scope Category Config
  console.log('\n3️⃣  SCOPE CATEGORY CONFIGURATION');
  console.log('─'.repeat(60));
  try {
    const categoryMap = getScopeCategoryConfigMap();
    const briefTypes = Object.keys(categoryMap);

    if (briefTypes.length === 0) {
      results.failed.push('No scope category configs');
      console.log('   ❌ No configs found');
    } else {
      console.log('   ✅ Configs for: ' + briefTypes.join(', '));

      // Check first config
      const firstType = briefTypes[0];
      const firstConfig = categoryMap[firstType];

      if (!firstConfig.phases || !Array.isArray(firstConfig.phases)) {
        results.failed.push('Config phases not an array');
        console.log('   ❌ Phases not an array for ' + firstType);
      } else if (firstConfig.phases.length === 0) {
        results.failed.push('Config has zero phases for ' + firstType);
        console.log('   ❌ Zero phases for ' + firstType);
      } else {
        results.passed.push('Config has phases: ' + firstConfig.phases.length);
        console.log('   ✅ Phases count: ' + firstConfig.phases.length);

        // Check phase structure
        const firstPhase = firstConfig.phases[0];
        const hasPhaseId = firstPhase.hasOwnProperty('phaseId') || firstPhase.hasOwnProperty('id');

        if (!hasPhaseId) {
          results.failed.push('Phase missing phaseId/id field');
          console.log('   ❌ Phase missing phaseId/id');
          console.log('      Available fields: ' + Object.keys(firstPhase).join(', '));
        } else {
          const phaseId = firstPhase.phaseId || firstPhase.id;
          results.passed.push('Phase has valid ID: ' + phaseId);
          console.log('   ✅ Phase ID field: ' + (firstPhase.phaseId ? 'phaseId' : 'id') + ' = "' + phaseId + '"');
        }
      }
    }
  } catch (error) {
    results.failed.push('Scope category config error: ' + error.message);
    console.log('   ❌ Error: ' + error.message);
  }

  // Test 4: UI Data Payload
  console.log('\n4️⃣  SIDEBAR UI DATA PAYLOAD');
  console.log('─'.repeat(60));
  try {
    const uiData = getScopeCategoryUiData();

    if (!uiData) {
      results.failed.push('UI data is null');
      console.log('   ❌ UI data: NULL');
    } else {
      console.log('   ✅ enabled: ' + uiData.enabled);
      console.log('   ✅ config keys: ' + Object.keys(uiData.config).length);
      console.log('   ✅ hashes keys: ' + Object.keys(uiData.hashes).length);

      if (Object.keys(uiData.config).length !== Object.keys(uiData.hashes).length) {
        results.warnings.push('Config/hash count mismatch');
        console.log('   ⚠️  Config count ≠ Hash count');
      }

      results.passed.push('UI data payload valid');
    }
  } catch (error) {
    results.failed.push('UI data error: ' + error.message);
    console.log('   ❌ Error: ' + error.message);
  }

  // Test 5: Integration Check
  console.log('\n5️⃣  INTEGRATION CHECK');
  console.log('─'.repeat(60));
  try {
    const briefProfile = getBriefProfile('smm-retainer');
    const scopeConfig = getScopeCategoryConfig('smm-retainer');

    console.log('   Brief Profile for smm-retainer:');
    console.log('     - sectionOrder: ' + (Array.isArray(briefProfile.sectionOrder) ? briefProfile.sectionOrder.length + ' items' : 'NOT AN ARRAY'));
    console.log('     - catalogPrefixes: ' + (Array.isArray(briefProfile.catalogPrefixes) ? briefProfile.catalogPrefixes.length + ' items' : 'NOT AN ARRAY'));

    console.log('   Scope Config for smm-retainer:');
    if (scopeConfig && scopeConfig.phases) {
      console.log('     - phases: ' + scopeConfig.phases.length + ' items');
      console.log('     - first phase: ' + scopeConfig.phases[0].label);
    } else {
      console.log('     - phases: NULL or MISSING');
    }

    // Cross-check: do sectionOrder items match phase canonicals?
    if (Array.isArray(briefProfile.sectionOrder) && scopeConfig && Array.isArray(scopeConfig.phases)) {
      const sectionSet = new Set(briefProfile.sectionOrder);
      const phaseCanonicals = scopeConfig.phases.map(function(p) { return p.canonical; });
      const phaseSet = new Set(phaseCanonicals);

      const inSectionNotPhase = briefProfile.sectionOrder.filter(function(s) { return !phaseSet.has(s); });
      const inPhaseNotSection = phaseCanonicals.filter(function(p) { return !sectionSet.has(p); });

      if (inSectionNotPhase.length > 0) {
        results.warnings.push('sectionOrder has items not in phases: ' + inSectionNotPhase.join(', '));
        console.log('   ⚠️  In sectionOrder but NOT in phases: ' + inSectionNotPhase.join(', '));
      }

      if (inPhaseNotSection.length > 0) {
        results.warnings.push('Phases has items not in sectionOrder: ' + inPhaseNotSection.join(', '));
        console.log('   ⚠️  In phases but NOT in sectionOrder: ' + inPhaseNotSection.join(', '));
      }

      if (inSectionNotPhase.length === 0 && inPhaseNotSection.length === 0) {
        results.passed.push('sectionOrder and phases match');
        console.log('   ✅ sectionOrder and phases are in sync');
      }
    }
  } catch (error) {
    results.failed.push('Integration check error: ' + error.message);
    console.log('   ❌ Error: ' + error.message);
  }

  // Test 6: OpenAI Integration (basic check)
  console.log('\n6️⃣  OPENAI INTEGRATION');
  console.log('─'.repeat(60));
  try {
    const apiKey = getScriptProperty('OPENAI_API_KEY');
    if (!apiKey || apiKey.trim() === '') {
      results.warnings.push('OpenAI API key not configured');
      console.log('   ⚠️  API Key: NOT SET');
    } else {
      results.passed.push('OpenAI API key configured');
      console.log('   ✅ API Key: SET (length: ' + apiKey.length + ')');
    }

    const vectorStoreId = getScriptProperty('OPENAI_VECTOR_STORE_ID');
    if (!vectorStoreId || vectorStoreId.trim() === '') {
      results.warnings.push('Vector Store ID not configured');
      console.log('   ⚠️  Vector Store ID: NOT SET');
    } else {
      results.passed.push('Vector Store ID configured');
      console.log('   ✅ Vector Store ID: SET');
    }
  } catch (error) {
    results.warnings.push('OpenAI config check error: ' + error.message);
    console.log('   ⚠️  Error checking OpenAI config: ' + error.message);
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                         SUMMARY                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('✅ PASSED: ' + results.passed.length);
  results.passed.forEach(function(msg) {
    console.log('   • ' + msg);
  });

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS: ' + results.warnings.length);
    results.warnings.forEach(function(msg) {
      console.log('   • ' + msg);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n❌ FAILED: ' + results.failed.length);
    results.failed.forEach(function(msg) {
      console.log('   • ' + msg);
    });
  }

  console.log('\n' + '─'.repeat(60));

  if (results.failed.length === 0) {
    console.log('✅ ALL CRITICAL CHECKS PASSED - READY FOR TESTING');
  } else {
    console.log('❌ CRITICAL ISSUES FOUND - FIX BEFORE TESTING');
  }

  console.log('─'.repeat(60) + '\n');

  return {
    passed: results.passed.length,
    warnings: results.warnings.length,
    failed: results.failed.length,
    ready: results.failed.length === 0
  };
}

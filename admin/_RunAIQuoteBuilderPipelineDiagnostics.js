/**
 * Unified AI Quote Builder pipeline diagnostic.
 * Run from Apps Script editor or menu to trace scope-phase config + extraction wiring.
 */
function runAIQuoteBuilderPipelineDiagnostics() {
  const report = {
    passed: [],
    failed: [],
    warnings: [],
    checks: {}
  };

  function pass(msg) {
    report.passed.push(msg);
    console.log('✅ ' + msg);
  }

  function fail(msg) {
    report.failed.push(msg);
    console.log('❌ ' + msg);
  }

  function warn(msg) {
    report.warnings.push(msg);
    console.log('⚠️  ' + msg);
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     AI QUOTE BUILDER — PIPELINE DIAGNOSTICS                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 1. Scope phases raw load
  try {
    const phases = ConfigurationManager.get('scope.phases');
    report.checks.scopePhasesCount = Array.isArray(phases) ? phases.length : 0;
    if (!Array.isArray(phases) || phases.length === 0) {
      fail('ConfigurationManager.get("scope.phases") is empty');
    } else {
      pass('scope.phases loaded: ' + phases.length + ' rows');
      const missingPhaseId = phases.filter(function(p) {
        return p && !p.phaseId && !p.canonical;
      }).length;
      if (missingPhaseId > 0) {
        warn(missingPhaseId + ' scope phase rows missing phaseId and canonical');
      }
      const sample = phases[0] || {};
      report.checks.samplePhaseFields = Object.keys(sample);
      if (!sample.phaseId) {
        warn('First scope phase row has no phaseId (check SheetConfigLoader cache strip)');
      }
    }
  } catch (error) {
    fail('scope.phases load error: ' + error.message);
  }

  // 2. Grouped config map
  try {
    const configMap = getScopeCategoryConfigMap();
    const keys = Object.keys(configMap || {});
    report.checks.scopePhaseGroups = keys.length;
    if (!keys.length) {
      fail('getScopeCategoryConfigMap() returned no brief types');
    } else {
      pass('scope phase groups: ' + keys.join(', '));
    }

    const target = normalizeBriefTypeKey_('smm-retainer');
    const targetConfig = getScopeCategoryConfig(target);
    if (!targetConfig || !Array.isArray(targetConfig.phases) || !targetConfig.phases.length) {
      fail('No phases for default brief type "' + target + '"');
    } else {
      pass('Default brief type "' + target + '" has ' + targetConfig.phases.length + ' phases');
    }
  } catch (error) {
    fail('getScopeCategoryConfigMap error: ' + error.message);
  }

  // 3. Brief profiles alignment
  try {
    const profiles = getBriefTypeProfiles();
    const profileKeys = Object.keys(profiles || {});
    report.checks.briefProfiles = profileKeys.length;
    if (!profileKeys.length) {
      fail('No brief profiles loaded');
    } else {
      pass('brief profiles: ' + profileKeys.join(', '));
    }

    const configMap = getScopeCategoryConfigMap();
    profileKeys.forEach(function(key) {
      const normalized = normalizeBriefTypeKey_(key);
      if (!configMap[normalized] && !configMap[key]) {
        warn('Brief profile "' + key + '" has no matching scope phase group');
      }
    });
  } catch (error) {
    fail('brief profiles error: ' + error.message);
  }

  // 4. Sidebar payload
  try {
    const uiData = getScopeCategoryUiData();
    const uiKeys = Object.keys((uiData && uiData.config) || {});
    if (!uiData || !uiData.enabled) {
      warn('Scope categories disabled in sidebar payload');
    }
    if (!uiKeys.length) {
      fail('getScopeCategoryUiData() returned empty config');
    } else {
      pass('sidebar config keys: ' + uiKeys.join(', '));
    }
  } catch (error) {
    fail('getScopeCategoryUiData error: ' + error.message);
  }

  // 5. Phase canonicals for LLM prompt
  try {
    const canonicals = getScopePhaseCanonicals(BRIEF_TYPE_DEFAULT);
    report.checks.defaultCanonicals = canonicals.length;
    if (!canonicals.length) {
      fail('getScopePhaseCanonicals("' + BRIEF_TYPE_DEFAULT + '") returned empty list');
    } else {
      pass('canonical phases for LLM: ' + canonicals.join(', '));
    }
  } catch (error) {
    fail('getScopePhaseCanonicals error: ' + error.message);
  }

  // 6. Config status helper
  if (typeof getConfigStatus === 'function') {
    try {
      const status = getConfigStatus();
      report.checks.configStatus = status;
      if (!status.scopePhaseGroups) {
        fail('getConfigStatus().scopePhaseGroups is 0');
      } else {
        pass('getConfigStatus scopePhaseGroups=' + status.scopePhaseGroups);
      }
    } catch (error) {
      fail('getConfigStatus error: ' + error.message);
    }
  } else {
    fail('getConfigStatus() is not defined');
  }

  console.log('\n── Summary ──');
  console.log('Passed: ' + report.passed.length);
  console.log('Warnings: ' + report.warnings.length);
  console.log('Failed: ' + report.failed.length);
  console.log(report.failed.length === 0 ? 'READY' : 'BLOCKED');

  return report;
}

/**
 * Diagnostic: Check what's actually in categoryConfigMap for scope phases
 *
 * This diagnoses why "Scope phase config is missing" error appears
 * even though the sheet has briefType data.
 */
function diagnoseCategoryConfigMap() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('DIAGNOSTIC: Category Config Map for Scope Phases');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    // 1. Check raw sheet data
    console.log('\n1. RAW SHEET DATA');
    console.log('─'.repeat(60));
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Config: Scope Phases');
    if (!sheet) {
      console.log('   ❌ Sheet "Config: Scope Phases" NOT FOUND');
      return;
    }
    const values = sheet.getDataRange().getValues();
    console.log('   Total rows (including header):', values.length);
    console.log('   Headers:', JSON.stringify(values[0]));

    // Find briefType column index
    const headers = values[0];
    const briefTypeColIndex = headers.indexOf('briefType');
    console.log('   briefType column index:', briefTypeColIndex);

    if (briefTypeColIndex === -1) {
      console.log('   ❌ briefType column NOT FOUND in headers');
    } else {
      console.log('   ✅ briefType column found at index', briefTypeColIndex);

      // Show first 5 briefType values
      console.log('\n   First 5 briefType values from sheet:');
      for (let i = 1; i <= Math.min(5, values.length - 1); i++) {
        const briefType = values[i][briefTypeColIndex];
        console.log('     Row ' + (i + 1) + ': "' + briefType + '" (type: ' + typeof briefType + ', length: ' + (briefType ? briefType.length : 0) + ')');
      }

      // Count unique briefTypes
      const allBriefTypes = [];
      for (let i = 1; i < values.length; i++) {
        const bt = values[i][briefTypeColIndex];
        if (bt) {
          allBriefTypes.push(bt);
        }
      }
      const uniqueBriefTypes = Array.from(new Set(allBriefTypes));
      console.log('\n   Unique briefType values in sheet (' + uniqueBriefTypes.length + ' total):');
      uniqueBriefTypes.forEach(function(bt) {
        const count = allBriefTypes.filter(function(x) { return x === bt; }).length;
        console.log('     "' + bt + '" → ' + count + ' rows');
      });
    }

    // 2. Check ConfigurationManager.get('scope.phases')
    console.log('\n2. CONFIGURATIONMANAGER OUTPUT');
    console.log('─'.repeat(60));
    const phasesArray = ConfigurationManager.get('scope.phases');

    if (!phasesArray) {
      console.log('   ❌ ConfigurationManager.get("scope.phases") returned NULL/UNDEFINED');
      return;
    }

    if (!Array.isArray(phasesArray)) {
      console.log('   ❌ Result is NOT an array');
      console.log('   Type:', typeof phasesArray);
      console.log('   Value:', JSON.stringify(phasesArray).substring(0, 200));
      return;
    }

    console.log('   ✅ Array length:', phasesArray.length);

    if (phasesArray.length === 0) {
      console.log('   ❌ Array is EMPTY');
      return;
    }

    // Show first 3 phases
    console.log('\n   First 3 phases:');
    for (let i = 0; i < Math.min(3, phasesArray.length); i++) {
      const phase = phasesArray[i];
      console.log('     [' + i + '] briefType: "' + phase.briefType + '", phaseId: "' + phase.phaseId + '", label: "' + phase.label + '"');
    }

    // Count briefTypes in loaded data
    const loadedBriefTypes = phasesArray.map(function(p) { return p.briefType; }).filter(Boolean);
    const uniqueLoadedBriefTypes = Array.from(new Set(loadedBriefTypes));
    console.log('\n   Unique briefTypes in loaded data (' + uniqueLoadedBriefTypes.length + ' total):');
    uniqueLoadedBriefTypes.forEach(function(bt) {
      const count = loadedBriefTypes.filter(function(x) { return x === bt; }).length;
      console.log('     "' + bt + '" → ' + count + ' phases');
    });

    // Check for empty/null briefTypes
    const emptyBriefTypes = phasesArray.filter(function(p) { return !p || !p.briefType; }).length;
    if (emptyBriefTypes > 0) {
      console.log('\n   ⚠️  WARNING: ' + emptyBriefTypes + ' phases have empty/null briefType');
    }

    // 3. Check getScopeCategoryConfigMap()
    console.log('\n3. getScopeCategoryConfigMap() OUTPUT');
    console.log('─'.repeat(60));

    const configMap = getScopeCategoryConfigMap();

    if (!configMap) {
      console.log('   ❌ getScopeCategoryConfigMap() returned NULL/UNDEFINED');
      return;
    }

    if (typeof configMap !== 'object') {
      console.log('   ❌ Result is NOT an object');
      console.log('   Type:', typeof configMap);
      return;
    }

    const configKeys = Object.keys(configMap);
    console.log('   ✅ Config map keys (' + configKeys.length + ' total):', configKeys.join(', '));

    if (configKeys.length === 0) {
      console.log('   ❌ Config map is EMPTY (no briefTypes grouped)');
      return;
    }

    // Show details for each briefType
    console.log('\n   Details for each briefType:');
    configKeys.forEach(function(briefType) {
      const config = configMap[briefType];
      const phaseCount = config && config.phases ? config.phases.length : 0;
      console.log('     "' + briefType + '" → ' + phaseCount + ' phases');
    });

    // 4. Check specific briefType: 'smm-retainer'
    console.log('\n4. CHECK SPECIFIC BRIEFTYPE: "smm-retainer"');
    console.log('─'.repeat(60));

    const targetBriefType = 'smm-retainer';
    const targetConfig = configMap[targetBriefType];

    if (!targetConfig) {
      console.log('   ❌ configMap["' + targetBriefType + '"] is NULL/UNDEFINED');
      console.log('\n   Available briefTypes:');
      configKeys.forEach(function(bt) {
        console.log('     - "' + bt + '" (length: ' + bt.length + ')');
      });

      // Check for case-insensitive match
      const lowerTarget = targetBriefType.toLowerCase();
      const caseInsensitiveMatch = configKeys.find(function(bt) {
        return bt.toLowerCase() === lowerTarget;
      });
      if (caseInsensitiveMatch) {
        console.log('\n   ⚠️  FOUND CASE MISMATCH: "' + caseInsensitiveMatch + '" vs "' + targetBriefType + '"');
      }

      // Check for whitespace differences
      const trimmedMatch = configKeys.find(function(bt) {
        return bt.trim() === targetBriefType.trim();
      });
      if (trimmedMatch && trimmedMatch !== targetBriefType) {
        console.log('\n   ⚠️  FOUND WHITESPACE MISMATCH: "' + trimmedMatch + '" (length: ' + trimmedMatch.length + ') vs "' + targetBriefType + '" (length: ' + targetBriefType.length + ')');
      }

    } else {
      console.log('   ✅ Config found for "' + targetBriefType + '"');
      console.log('   Phases count:', targetConfig.phases ? targetConfig.phases.length : 0);

      if (targetConfig.phases && targetConfig.phases.length > 0) {
        console.log('\n   First 3 phases:');
        for (let i = 0; i < Math.min(3, targetConfig.phases.length); i++) {
          const phase = targetConfig.phases[i];
          console.log('     [' + i + '] phaseId: "' + phase.phaseId + '", label: "' + phase.label + '"');
        }
      }
    }

    // 5. Check cache status
    console.log('\n5. CACHE STATUS');
    console.log('─'.repeat(60));
    console.log('   Note: SheetConfigLoader uses CacheService with 60min TTL');
    console.log('   To clear cache, run: SheetConfigLoader.invalidate("scopePhases")');

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('DIAGNOSTIC COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.log('\n❌ DIAGNOSTIC FAILED');
    console.log('Error:', error.message);
    console.log('Stack:', error.stack);
  }
}

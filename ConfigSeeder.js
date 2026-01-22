/**
 * Seed dynamic config tabs from existing configuration data.
 * Populates Config: Brief Profiles, Config: Scope Phases, Config: Phase Taxonomy Overrides,
 * Config: Catalog Prefixes, Config: Resource Catalog, Config: Scope Catalog, and Config: Column Map.
 */

function seedDynamicConfigFromStatic() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new AppError('CONFIG_SCHEMA', 'Active spreadsheet is unavailable.');
  }
  if (isSeedDryRun_()) {
    try { UnifiedLogger.info('ConfigSeeder', 'Config seed dry-run enabled; no changes applied.'); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    logToast_('Config Seeder', 'Config seed dry-run: no changes applied', 5, 'INFO', { source: 'ConfigSeeder' });
    return { status: 'DRY_RUN', message: 'Dry-run: no changes applied.' };
  }

  // Always seed structural config (taxonomy-driven, not catalog data)
  seedBriefProfiles_(ss);
  seedScopePhases_(ss);
  seedPhaseTaxonomyOverrides_(ss);
  seedCatalogPrefixes_(ss);
  seedColumnMap_(ss);

  // Only seed catalogs if CSV has NOT been marked as authoritative
  const csvSeeded = PropertiesService.getScriptProperties().getProperty('CSV_CATALOGS_SEEDED');
  if (csvSeeded !== 'true') {
    try { UnifiedLogger.info('ConfigSeeder', 'Seeding catalogs from static (CSV not yet loaded)'); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    seedResourceCatalog_(ss);
    seedScopeCatalog_(ss);
  } else {
    try { UnifiedLogger.info('ConfigSeeder', 'Skipping catalog seeding: CSV data is authoritative', { csvTimestamp: PropertiesService.getScriptProperties().getProperty('CSV_CATALOGS_TIMESTAMP') }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
  }

  SpreadsheetApp.flush();
  bumpConfigVersion_();
  if (typeof reloadConfig === 'function') {
    try { reloadConfig(); } catch (e) { try { UnifiedLogger.warn('ConfigSeeder', 'seed reloadConfig failed', String(e)); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    } }
  }
  return {
    status: 'OK',
    message: csvSeeded === 'true'
      ? 'Config tabs seeded (catalogs protected: CSV authoritative).'
      : 'Config tabs seeded from current configuration.'
  };
}

/**
 * Seed only Resource Catalog and Scope Catalog config tabs.
 * Leaves brief profiles, scope phases, and other tabs untouched.
 * @return {{status:string, message:string}}
 */
function seedCatalogsOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new AppError('CONFIG_SCHEMA', 'Active spreadsheet is unavailable.');
  }
  let preflight = runCatalogSeedPreflight_();
  let autoRepairUsed = false;
  if (preflight.errors.length) {
    try { UnifiedLogger.warn('ConfigSeeder', 'Catalog preflight failed; attempting auto-repair', preflight); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    try {
      repairSourceHeadersAndValidations();
      autoRepairUsed = true;
      preflight = runCatalogSeedPreflight_();
    } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
  }
  if (preflight.errors.length) {
    throw new AppError('CONFIG_SCHEMA', 'Catalog seed preflight failed: ' + preflight.errors.join(' | '));
  }
  if (isSeedDryRun_()) {
    try { UnifiedLogger.info('ConfigSeeder', 'Catalog seed dry-run enabled; no changes applied.'); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    logToast_('Config Seeder', 'Catalog seed dry-run: no changes applied', 5, 'INFO', { source: 'ConfigSeeder' });
    return { status: 'DRY_RUN', message: 'Dry-run: no catalog changes applied.' };
  }

  const results = { resources: 0, scopes: 0, scopeBuildups: 0, errors: [] };
  try {
    results.resources = seedResourceCatalog_(ss) || 0;
  } catch (error) {
    results.errors.push('Resource Catalog: ' + error);
  }
  try {
    results.scopes = seedScopeCatalog_(ss) || 0;
  } catch (error) {
    results.errors.push('Scope Catalog: ' + error);
  }
  try {
    results.scopeBuildups = seedScopeBuildupsFromDrive_(ss) || 0;
  } catch (error) {
    results.errors.push('Scope Buildups: ' + error);
  }

  SpreadsheetApp.flush();
  bumpConfigVersion_();

  const message = results.errors.length
    ? 'Catalog seeding partial: ' + results.errors.join(' | ')
    : 'Catalogs seeded. Resources: ' + results.resources + ', Scopes: ' + results.scopes + ', Scope Buildups: ' + results.scopeBuildups + (autoRepairUsed ? ' (auto-repair applied)' : '');
  logToast_('Config Seeder', message, 6, results.errors.length ? 'WARN' : (results.resources + results.scopes > 0 ? 'INFO' : 'WARN'), { source: 'ConfigSeeder' });

  return {
    status: results.errors.length ? 'PARTIAL' : 'OK',
    message: message,
    resourcesSeeded: results.resources,
    scopesSeeded: results.scopes,
    scopeBuildupsSeeded: results.scopeBuildups,
    preflight: preflight,
    autoRepairUsed: autoRepairUsed,
    errors: results.errors
  };
}

// DELETED: extractBriefProfilesFromTaxonomy_() function
// This extracted data from hardcoded taxonomy which no longer exists
// Config: Brief Profiles sheet should be populated manually or from CSV import

function seedBriefProfiles_(ss) {
  const sheet = ensureConfigSheet_(ss, 'Config: Brief Profiles', [
    'briefType', 'label', 'nudge', 'sectionOrderCSV', 'optionalSectionsCSV',
    'catalogPrefixesCSV', 'signatureCuesCSV', 'fallback', 'active', 'priority'
  ]);

  // DELETE CORRUPTED ROWS: Remove V2 metadata keys that were written as brief types
  const corruptedKeys = ['success', 'data', 'errors', 'warnings', 'metadata'];
  const data = (sheet.getLastRow() > 0 ? sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), 1)).getValues() : []);
  if (data.length > 1) {
    for (let i = data.length - 1; i >= 1; i--) {
      const briefType = String(data[i][0]).toLowerCase().trim();
      if (corruptedKeys.indexOf(briefType) !== -1) {
        sheet.deleteRow(i + 1);
      }
    }
  }

  // Read existing data to preserve manually configured fields
  const existingData = (sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : []);
  const existingProfiles = {};
  existingData.forEach(function(row) {
    const briefType = String(row[0] || '').trim();
    if (briefType && corruptedKeys.indexOf(briefType.toLowerCase()) === -1) {
      existingProfiles[briefType] = {
        label: row[1] || '',
        nudge: row[2] || '',
        sectionOrderCSV: row[3] || '',
        optionalSectionsCSV: row[4] || '',
        catalogPrefixesCSV: row[5] || '',
        signatureCuesCSV: row[6] || '',
        fallback: row[7],
        active: row[8],
        priority: row[9]
      };
    }
  });

  // HARDCODED TAXONOMY DELETED - Config: Brief Profiles is now manually maintained
  // This sheet should already have data from manual entry or import
  // Seeding function only ensures sheet exists and cleans corrupted rows
  // Does NOT overwrite or repopulate existing data
  try {
    UnifiedLogger.info('ConfigSeeder', 'Config: Brief Profiles preserved (manual maintenance mode)', {
      existingRows: existingData.length
    });
  } catch (ignore) {
    console.log('[ConfigSeeder] Config: Brief Profiles preserved with', existingData.length, 'rows');
  }
  return; // Preserve existing data - do not seed

  // Filter out V2 keys from profiles map (in case they're still in cache/snapshot)
  const keys = Object.keys(profiles).filter(function(key) {
    return key !== '__fallback__' && corruptedKeys.indexOf(key.toLowerCase()) === -1;
  });
  const rows = keys.map(function(key, index) {
    const profile = profiles[key] || {};
    const existing = existingProfiles[key];
    const priority = profile.priority !== undefined ? profile.priority : index + 1;

    // PRESERVE existing data if it exists, otherwise use empty defaults from taxonomy
    return [
      key,
      existing ? existing.label : (profile.label || key),
      existing ? existing.nudge : (profile.nudge || ''),
      existing && existing.sectionOrderCSV ? existing.sectionOrderCSV : ensureArray(profile.sectionOrder).join(','),
      existing && existing.optionalSectionsCSV ? existing.optionalSectionsCSV : ensureArray(profile.optionalSections).join(','),
      existing && existing.catalogPrefixesCSV ? existing.catalogPrefixesCSV : ensureArray(profile.catalogPrefixes).join(','),
      existing && existing.signatureCuesCSV ? existing.signatureCuesCSV : ensureArray(profile.signatureCues).join(','),
      existing ? existing.fallback : false,
      existing ? existing.active : true,
      existing ? existing.priority : priority
    ];
  });
  writeConfigRows_(sheet, rows);
}

// DELETED: extractScopePhasesFromTaxonomy_() function
// This created circular dependency: tried to populate Config: Scope Phases by reading FROM Config: Scope Phases
// Config: Scope Phases sheet should be populated from CSV import or manual entry

function seedScopePhases_(ss) {
  const sheet = ensureConfigSheet_(ss, 'Config: Scope Phases', [
    'briefType', 'phaseId', 'label', 'canonical', 'required', 'order',
    'ancillaryFeeFlagsCSV', 'cadence', 'deliverableHint', 'signalHint',
    'synonymsCSV', 'taxonomyHintJSON', 'active'
  ]);
  // HARDCODED TAXONOMY DELETED - Config: Scope Phases is now manually maintained
  // This sheet should already have data from manual entry or import
  // Seeding function only ensures sheet exists - does NOT overwrite existing data
  try {
    const existingRows = sheet.getLastRow() > 1 ? sheet.getLastRow() - 1 : 0;
    UnifiedLogger.info('ConfigSeeder', 'Config: Scope Phases preserved (manual maintenance mode)', {
      existingRows: existingRows
    });
  } catch (ignore) {
    console.log('[ConfigSeeder] Config: Scope Phases preserved');
  }
  return; // Preserve existing data - do not seed
  Object.keys(config).forEach(function(briefType) {
    const entry = config[briefType] || {};
    const cadence = entry.cadence || '';
    const ancillaryFees = ensureArray(entry.ancillaryFees).map(function(fee) {
      return fee && fee.type ? fee.type : (fee && fee.label ? fee.label : '');
    }).filter(Boolean);
    const phases = Array.isArray(entry.phases) ? entry.phases : [];
    phases.forEach(function(phase, idx) {
      if (!phase) {
        return;
      }
      const order = phase.order !== undefined ? phase.order : idx + 1;
      rows.push([
        briefType,
        phase.id || phase.canonical || phase.label || ('phase-' + idx),
        phase.label || phase.canonical || phase.id || '',
        phase.canonical || phase.id || phase.label || '',
        phase.required === true,
        order,
        ancillaryFees.join(','),
        cadence,
        phase.deliverableHint || '',
        phase.signalHint || '',
        ensureArray(phase.synonyms).join(','),
        phase.inputs ? JSON.stringify(phase.inputs) : '',
        true
      ]);
    });
  });
  writeConfigRows_(sheet, rows);
}

// DELETED: extractPhaseTaxonomyFromSource_() function
// This created circular dependency: tried to populate Config: Phase Taxonomy Overrides by reading FROM Config: Scope Phases
// Config: Phase Taxonomy Overrides sheet should be populated from CSV import or manual entry

function seedPhaseTaxonomyOverrides_(ss) {
  const sheet = ensureConfigSheet_(ss, 'Config: Phase Taxonomy Overrides', [
    'briefType', 'phaseCanonical', 'purpose', 'keyDeliverablesCSV', 'signalsCSV', 'keywordsCSV', 'boundaryHint'
  ]);
  // HARDCODED TAXONOMY DELETED - Config: Phase Taxonomy Overrides is now manually maintained
  // This sheet should already have data from manual entry or import
  // Seeding function only ensures sheet exists - does NOT overwrite existing data
  try {
    const existingRows = sheet.getLastRow() > 1 ? sheet.getLastRow() - 1 : 0;
    UnifiedLogger.info('ConfigSeeder', 'Config: Phase Taxonomy Overrides preserved (manual maintenance mode)', {
      existingRows: existingRows
    });
  } catch (ignore) {
    console.log('[ConfigSeeder] Config: Phase Taxonomy Overrides preserved');
  }
  return; // Preserve existing data - do not seed
  Object.keys(map).forEach(function(briefType) {
    const phases = map[briefType] || {};
    Object.keys(phases).forEach(function(canonical) {
      const entry = phases[canonical] || {};
      rows.push([
        briefType,
        canonical,
        entry.purpose || '',
        ensureArray(entry.keyDeliverables).join(','),
        ensureArray(entry.signals).join(','),
        ensureArray(entry.keywords).join(','),
        entry.boundaryHint || ''
      ]);
    });
  });
  writeConfigRows_(sheet, rows);
}

function extractCatalogPrefixesFromScopeCatalog_() {
  if (typeof getConfigValue !== 'function' || typeof getFolderByIdSafe_ !== 'function' || typeof getCsvByName_ !== 'function') {
    return {};
  }
  const folderId = getConfigValue('SOURCE_DATA_FOLDER_ID');
  if (!folderId) {
    return {};
  }
  const folder = getFolderByIdSafe_(folderId);
  if (!folder) {
    return {};
  }
  const scopeCatalogCsv = getCsvByName_(folder, 'Scopes 2.0 - Scope Catalog.csv');
  if (!scopeCatalogCsv || scopeCatalogCsv.length < 2) {
    return {};
  }
  const prefixMap = {};
  for (let i = 1; i < scopeCatalogCsv.length; i++) {
    const row = scopeCatalogCsv[i];
    const scopeId = row[0] || '';
    const briefType = row[3] || '';
    if (!briefType || !scopeId) {
      continue;
    }
    const match = scopeId.match(/^([A-Z]+)-/);
    if (match) {
      const prefix = match[1] + '-';
      if (!prefixMap[briefType]) {
        prefixMap[briefType] = [];
      }
      if (prefixMap[briefType].indexOf(prefix) === -1) {
        prefixMap[briefType].push(prefix);
      }
    }
  }
  return prefixMap;
}

function seedCatalogPrefixes_(ss) {
  const sheet = ensureConfigSheet_(ss, 'Config: Catalog Prefixes', [
    'briefType', 'prefix', 'prefixCategory', 'categoryPhaseHint', 'priority', 'active'
  ]);
  // V2 FIX: Extract catalog prefixes from Scope Catalog CSV instead of reading from sheet (circular dependency fix)
  const config = extractCatalogPrefixesFromScopeCatalog_();
  if (!config || typeof config !== 'object') {
    return;
  }
  const rows = [];
  Object.keys(config).forEach(function(briefType) {
    const prefixes = ensureArray(config[briefType]);
    prefixes.forEach(function(prefix, idx) {
      rows.push([briefType, prefix, '', '', prefixes.length - idx, true]);
    });
  });
  writeConfigRows_(sheet, rows);
}

function seedResourceCatalog_(ss) {
  const sheet = ensureConfigSheet_(ss, 'Config: Resource Catalog', [
    'code', 'name', 'unit', 'rate', 'category', 'source', 'description', 'pricingMode', 'status', 'metadataJSON'
  ]);
  if (typeof clearConfigCache === 'function') {
    try { clearConfigCache(); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
  }

  // Prefer the source CSV so scope buildups can look up names/rates by code.
  if (typeof getConfigValue === 'function' && typeof getFolderByIdSafe_ === 'function' && typeof getCsvByName_ === 'function' && typeof writeResourceCatalog_ === 'function') {
    const folderId = getConfigValue('SOURCE_DATA_FOLDER_ID');
    const folder = getFolderByIdSafe_(folderId);
    if (!folder) {
      throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID invalid or inaccessible: ' + folderId);
    }
    const resourceCsv = normalizeResourceCsv_(getCsvByName_(folder, 'Scopes 2.0 - Resources.csv'));
    if (!resourceCsv || resourceCsv.length < 2) {
      throw new AppError('CONFIG_ERROR', 'Resource Catalog CSV missing or empty in SOURCE_DATA_FOLDER_ID.');
    }

    // ENH-001: Duplicate SKU Detection at seed time
    if (typeof validateResourceCatalogSKUs === 'function') {
      const config = getDuplicateSKUDetectionConfig();
      if (config.enabled) {
        const validation = validateResourceCatalogSKUs(resourceCsv, {
          autoRemoveDuplicates: config.autoRemoveDuplicates,
          failOnDuplicate: config.failOnDuplicate
        });

        if (!validation.valid && config.failOnDuplicate) {
          // Export duplicate report for review
          if (typeof exportDuplicateSKUReport === 'function' && validation.detectionResult) {
            exportDuplicateSKUReport(validation.detectionResult, ss);
          }
          throw new AppError('CONFIG_ERROR', 'Duplicate SKUs detected: ' + validation.error.message);
        }

        if (validation.detectionResult && validation.detectionResult.hasDuplicates) {
          // Log warning and optionally export report
          if (typeof exportDuplicateSKUReport === 'function') {
            const reportSheet = exportDuplicateSKUReport(validation.detectionResult, ss);
            try {
              UnifiedLogger.warn('ConfigSeeder', 'Duplicate SKU report exported', { sheetName: reportSheet });
            } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
          }
        }

        // Use cleaned CSV (with duplicates removed if autoRemoveDuplicates=true)
        const csvToWrite = validation.cleanedCsv;

        // ENH-002: Validate cost calculation configuration
        if (typeof validateCostCalculationConfig === 'function') {
          const costValidation = validateCostCalculationConfig(csvToWrite.slice(1).map(function(row) {
            return {
              code: row[0],
              rate: row[3],
              unit: row[2],
              category: row[4],
              costMethod: row[7],  // pricingMode column
              metadataJSON: row[9]
            };
          }));

          logCostCalculationValidation(costValidation, 'ConfigSeeder');

          if (!costValidation.valid) {
            throw new AppError('CONFIG_ERROR', 'Cost calculation config invalid: ' + costValidation.errors.join(' | '));
          }
        }

        writeResourceCatalog_(ss, csvToWrite);
        return csvToWrite.length - 1;
      }
    }

    writeResourceCatalog_(ss, resourceCsv);
    return resourceCsv.length - 1;
  }

  const sourceSheet = ss.getSheetByName(SHEET_NAMES && SHEET_NAMES.XERO_READY ? SHEET_NAMES.XERO_READY : 'XERO_READY');
  if (!sourceSheet) {
    writeConfigRows_(sheet, []);
    return 0;
  }
  const lastRow = sourceSheet.getLastRow();
  const lastColumn = sourceSheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    writeConfigRows_(sheet, []);
    return 0;
  }
  const values = sourceSheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const rows = values.map(function(row) {
    const code = row[XERO_COLS.SKU] || '';
    const name = row[XERO_COLS.NAME] || '';
    const description = row[XERO_COLS.DESCRIPTION] || '';
    const rate = row[XERO_COLS.SELL_PRICE] || '';
    const category = row[XERO_COLS.CATEGORY] || '';
    const status = row[XERO_COLS.STATUS] || '';
    const pricingMode = derivePricingMode ? derivePricingMode(row[XERO_COLS.ITEM_TYPE] || '') : '';
    const unit = normalizeUnitLabel ? normalizeUnitLabel(deriveUnitFromItemCode(code, row[XERO_COLS.ITEM_TYPE] || '')) : 'unit';
    return [
      code,
      name,
      unit,
      rate,
      category,
      'XERO_READY',
      description,
      pricingMode,
      status,
      ''
    ];
  }).filter(function(row) { return row[0]; });
  writeConfigRows_(sheet, rows);
  return rows.length;
}

function seedScopeCatalog_(ss) {
  const sheet = ensureConfigSheet_(ss, 'Config: Scope Catalog', [
    'scopeId', 'label', 'canonical', 'briefType', 'phaseId', 'ancillaryFeeFlagsCSV', 'order', 'notes', 'aliasesCSV'
  ]);
  if (typeof clearConfigCache === 'function') {
    try { clearConfigCache(); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
  }

  if (typeof getConfigValue !== 'function') {
    throw new AppError('CONFIG_ERROR', 'Config loader unavailable for scope catalog seed.');
  }
  const folderId = getConfigValue('SOURCE_DATA_FOLDER_ID');
  if (!folderId) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID not configured.');
  }
  if (typeof getFolderByIdSafe_ !== 'function') {
    throw new AppError('CONFIG_ERROR', 'Drive helper unavailable for scope catalog seed.');
  }
  const folder = getFolderByIdSafe_(folderId);
  if (!folder) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID invalid or inaccessible: ' + folderId);
  }
  if (typeof getCsvByName_ !== 'function') {
    throw new AppError('CONFIG_ERROR', 'CSV reader unavailable for scope catalog seed.');
  }
  const scopeCatalogCsv = getCsvByName_(folder, 'Scopes 2.0 - Scope Catalog.csv');
  const catalogueCsv = getCsvByName_(folder, 'Scopes 2.0 - Catalogue.csv');
  if (!scopeCatalogCsv || scopeCatalogCsv.length < 2) {
    throw new AppError('CONFIG_ERROR', 'Scope Catalog CSV missing or empty in SOURCE_DATA_FOLDER_ID.');
  }
  if (!catalogueCsv || catalogueCsv.length < 2) {
    throw new AppError('CONFIG_ERROR', 'Scope Buildups CSV missing or empty in SOURCE_DATA_FOLDER_ID.');
  }
  if (typeof writeScopeCatalog_ !== 'function') {
    throw new AppError('CONFIG_ERROR', 'Scope catalog writer unavailable.');
  }

  const headers = scopeCatalogCsv[0];
  const combinedMap = {};
  const normalized = scopeCatalogCsv.slice(1).filter(function(row) { return row && row[0]; });
  normalized.forEach(function(row) {
    const scopeId = (row[0] || '').toString().trim();
    if (!scopeId) {
      return;
    }
    const key = scopeId.toLowerCase();
    if (!combinedMap[key]) {
      combinedMap[key] = row;
    }
  });

  catalogueCsv.slice(1).forEach(function(row) {
    if (!row || row.length < 2) {
      return;
    }
    const scopeId = (row[0] || '').toString().trim();
    if (!scopeId) {
      return;
    }
    const key = scopeId.toLowerCase();
    if (combinedMap[key]) {
      return;
    }
    const label = (row[1] || '').toString().trim();
    const notes = (row[7] || '').toString().trim();
    combinedMap[key] = [
      scopeId,
      label || scopeId,
      scopeId,
      '',
      '',
      '',
      0,
      notes,
      ''
    ];
  });

  const mergedRows = Object.keys(combinedMap).map(function(key) { return combinedMap[key]; });
  const mergedCsv = [headers].concat(mergedRows);
  writeScopeCatalog_(ss, mergedCsv);
  return mergedRows.length;
}

function seedScopeBuildupsFromDrive_(ss) {
  if (typeof getConfigValue !== 'function') {
    throw new AppError('CONFIG_ERROR', 'Config loader unavailable for scope buildups seed.');
  }
  const folderId = getConfigValue('SOURCE_DATA_FOLDER_ID');
  if (!folderId) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID not configured.');
  }
  if (typeof getFolderByIdSafe_ !== 'function') {
    throw new AppError('CONFIG_ERROR', 'Drive helper unavailable for scope buildups seed.');
  }
  const folder = getFolderByIdSafe_(folderId);
  if (!folder) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID invalid or inaccessible: ' + folderId);
  }
  if (typeof getCsvByName_ !== 'function') {
    throw new AppError('CONFIG_ERROR', 'CSV reader unavailable for scope buildups seed.');
  }
  const catalogueCsv = getCsvByName_(folder, 'Scopes 2.0 - Catalogue.csv');
  if (!catalogueCsv || catalogueCsv.length < 2) {
    throw new AppError('CONFIG_ERROR', 'Scope Buildups CSV missing or empty in SOURCE_DATA_FOLDER_ID.');
  }
  if (typeof writeScopeBuildups_ !== 'function') {
    throw new AppError('CONFIG_ERROR', 'Scope buildups writer unavailable.');
  }
  writeScopeBuildups_(ss, catalogueCsv);
  return catalogueCsv.length - 1;
}

function repairSourceHeadersAndValidations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new AppError('CONFIG_ERROR', 'Active spreadsheet unavailable.');
  }

  // Rebuild Resource Catalog and Scope Buildups from drive CSVs with strict headers and cleared validations.
  const folderId = typeof getConfigValue === 'function' ? getConfigValue('SOURCE_DATA_FOLDER_ID') : null;
  if (!folderId) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID not configured.');
  }
  const folder = (typeof getFolderByIdSafe_ === 'function') ? getFolderByIdSafe_(folderId) : null;
  if (!folder) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID invalid or inaccessible: ' + folderId);
  }
  if (typeof getCsvByName_ !== 'function') {
    throw new AppError('CONFIG_ERROR', 'CSV reader unavailable for repair.');
  }

  const resourceCsv = normalizeResourceCsv_(getCsvByName_(folder, 'Scopes 2.0 - Resources.csv'));
  if (!resourceCsv || resourceCsv.length < 2) {
    throw new AppError('CONFIG_ERROR', 'Resource Catalog CSV missing or empty in SOURCE_DATA_FOLDER_ID.');
  }
  const catalogueCsv = getCsvByName_(folder, 'Scopes 2.0 - Catalogue.csv');
  if (!catalogueCsv || catalogueCsv.length < 2) {
    throw new AppError('CONFIG_ERROR', 'Scope Buildups CSV missing or empty in SOURCE_DATA_FOLDER_ID.');
  }

  const scopeSheet = ss.getSheetByName('Scope Buildups');
  if (scopeSheet) {
    // Backup removed - rely on Google Sheets version history from App-script/ConfigSeeder.js:648
    // backupSheet_(ss, scopeSheet);
    scopeSheet.clearDataValidations();
  }

  writeResourceCatalog_(ss, resourceCsv);
  writeScopeBuildups_(ss, catalogueCsv);

  logToast_('Config Repair', 'Headers/validations repaired from drive CSVs', 6, 'INFO', { source: 'ConfigSeeder', resources: resourceCsv.length - 1, scopeRows: catalogueCsv.length - 1 });
  return { resources: resourceCsv.length - 1, scopeRows: catalogueCsv.length - 1 };
}

/**
 * Reapply formulas on Scope Buildups without reseeding data.
 * Useful when only formulas drifted but data should stay intact.
 * @return {{rows:number}}
 */
function applyScopeBuildupsFormulasOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new AppError('CONFIG_ERROR', 'Active spreadsheet unavailable.');
  }
  const sheetName = 'Scope Buildups';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError('CONFIG_SCHEMA', 'Missing sheet: ' + sheetName);
  }
  // Apply data validation on Resource Code column C to enforce codes from Config: Resource Catalog column A.
  try {
    const resSheet = ss.getSheetByName('Config: Resource Catalog');
    if (resSheet) {
      const resLast = resSheet.getLastRow();
      if (resLast >= 2) {
        const rule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(resSheet.getRange(2, 1, resLast - 1, 1), true)
          .setAllowInvalid(false)
          .build();
        const lastRow = sheet.getLastRow();
        if (lastRow >= 2) {
          sheet.getRange(2, 3, lastRow - 1, 1).setDataValidation(rule);
        }
      }
    }
  } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { rows: 0 };
  }
  const dataRows = lastRow - 1;
  // Column D: Resource Name lookup
  sheet.getRange(2, 4, dataRows, 1).setFormulaR1C1('=IF(RC[-1]="","",IFERROR(VLOOKUP(RC[-1],\'Config: Resource Catalog\'!C1:C2,2,FALSE),""))');
  // Column F: Hour Rate lookup
  sheet.getRange(2, 6, dataRows, 1).setFormulaR1C1('=IF(RC[-3]="","",IFERROR(VLOOKUP(RC[-3],\'Config: Resource Catalog\'!C1:C4,4,FALSE),""))');
  // Column G: Line items only (hours * rate); total rows blanked for now
  sheet.getRange(2, 7, dataRows, 1).setFormulaR1C1('=IF(AND(RC[-4]="",UPPER(RC[1])="TOTAL"),"",IF(RC[-2]="","",N(RC[-2])*N(RC[-1])))');
  // Column G on TOTAL rows: sum line costs for same Scope Code, ignoring blank resource rows and other TOTAL rows
  const totalFormulas = sheet.getRange(2, 7, dataRows, 1).getFormulasR1C1();
  for (let r = 0; r < dataRows; r++) {
    const rowIndex = r + 2;
    const resCode = sheet.getRange(rowIndex, 3).getDisplayValue();
    const totalFlag = sheet.getRange(rowIndex, 8).getDisplayValue();
    if (!resCode && String(totalFlag || '').toUpperCase() === 'TOTAL') {
      totalFormulas[r][0] = '=IF(AND(RC[-4]="",UPPER(RC[1])="TOTAL"),SUMIFS(C[0],C[-6],RC[-6],C[-4],"<>",C[1],"<>TOTAL"),"")';
    }
  }
  sheet.getRange(2, 7, dataRows, 1).setFormulasR1C1(totalFormulas);
  return { rows: dataRows };
}

function runCatalogSeedPreflight_() {
  const errors = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    errors.push('Active spreadsheet unavailable.');
    return { errors: errors };
  }

  let folder = null;
  try {
    if (typeof getConfigValue !== 'function') {
      throw new Error('Config loader unavailable');
    }
    const folderId = getConfigValue('SOURCE_DATA_FOLDER_ID');
    if (!folderId) {
      throw new Error('SOURCE_DATA_FOLDER_ID not configured');
    }
    if (typeof getFolderByIdSafe_ !== 'function') {
      throw new Error('Drive helper unavailable');
    }
    folder = getFolderByIdSafe_(folderId);
    if (!folder) {
      throw new Error('SOURCE_DATA_FOLDER_ID invalid or inaccessible: ' + folderId);
    }
  } catch (error) {
    errors.push(String(error));
  }

  const expectedScopeHeaders = ['Scope Code', 'Scope Name', 'Resource Code', 'Resource Name', 'Hours', 'Hour Rate', 'Line Cost', 'Notes'];
  const expectedResourceHeaders = ['code', 'name', 'unit', 'rate', 'category', 'source', 'description', 'pricingMode', 'status', 'metadataJSON'];

  if (folder && typeof getCsvByName_ === 'function') {
    try {
      const resourceCsv = getCsvByName_(folder, 'Scopes 2.0 - Resources.csv');
      if (!resourceCsv || resourceCsv.length < 2) {
        throw new Error('Resource CSV missing or empty');
      }
      if (!headersEqual_(resourceCsv[0], expectedResourceHeaders)) {
        if (isLegacyResourceHeaders_(resourceCsv[0])) {
          try { UnifiedLogger.warn('ConfigSeeder', 'Resource CSV using legacy headers; will auto-normalize'); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
        } else {
        const expectedHash = computeHeaderChecksum_(expectedResourceHeaders);
        const actualHash = computeHeaderChecksum_(resourceCsv[0]);
        if (!isSeedForceSchema_()) {
          throw new Error('Resource CSV headers mismatch (expected checksum ' + expectedHash + ', found ' + actualHash + ')');
        }
        try { UnifiedLogger.warn('ConfigSeeder', 'Resource CSV header checksum mismatch but forced', { expected: expectedHash, actual: actualHash }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
        }
      }
    } catch (error) {
      errors.push('Resources CSV: ' + String(error));
    }
    try {
      const catalogueCsv = getCsvByName_(folder, 'Scopes 2.0 - Catalogue.csv');
      if (!catalogueCsv || catalogueCsv.length < 2) {
        throw new Error('Scope Catalogue CSV missing or empty');
      }
      if (!headersEqual_(catalogueCsv[0], expectedScopeHeaders)) {
        const expectedHash = computeHeaderChecksum_(expectedScopeHeaders);
        const actualHash = computeHeaderChecksum_(catalogueCsv[0]);
        if (!isSeedForceSchema_()) {
          throw new Error('Scope Catalogue headers mismatch (expected checksum ' + expectedHash + ', found ' + actualHash + ')');
        }
        try { UnifiedLogger.warn('ConfigSeeder', 'Scope Catalogue header checksum mismatch but forced', { expected: expectedHash, actual: actualHash }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
      }
    } catch (error) {
      errors.push('Scope Catalogue CSV: ' + String(error));
    }
  } else if (!folder) {
    // folder error already captured
  } else {
    errors.push('CSV reader unavailable for preflight');
  }

  checkSheetHeaders_(ss, 'Scope Buildups', expectedScopeHeaders, errors);
  checkSheetHeaders_(ss, 'Config: Resource Catalog', expectedResourceHeaders, errors);

  return { errors: errors };
}

function headersEqual_(row, expected) {
  if (!row || row.length < expected.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i++) {
    if (String(row[i] || '').trim().toLowerCase() !== String(expected[i]).trim().toLowerCase()) {
      return false;
    }
  }
  return true;
}

function checkSheetHeaders_(ss, sheetName, expectedHeaders, errors) {
  if (!ss) {
    return;
  }
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return;
  }
  const lastCol = sheet.getLastColumn();
  if (!lastCol) {
    return;
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(expectedHeaders.length, lastCol)).getValues()[0];
  if (!headersEqual_(headers, expectedHeaders)) {
    const expectedHash = computeHeaderChecksum_(expectedHeaders);
    const actualHash = computeHeaderChecksum_(headers);
    const legacyOk = (sheetName === 'Config: Resource Catalog') && isLegacyResourceHeaders_(headers);
    const autoRepairSheets = ['Config: Resource Catalog', 'Scope Buildups'];
    if (autoRepairSheets.indexOf(sheetName) !== -1) {
      // Backup removed - rely on Google Sheets version history from App-script/ConfigSeeder.js:835
      // const backupName = backupSheet_(ss, sheet);
      sheet.clear();
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight('bold').setBackground('#e8f0fe');
      try { UnifiedLogger.warn('ConfigSeeder', 'Auto-repaired sheet headers', { sheet: sheetName, backup: backupName, expected: expectedHash, actual: actualHash }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
      return;
    }
    if (!legacyOk) {
      if (!isSeedForceSchema_()) {
        errors.push('Sheet header mismatch in ' + sheetName + ' (expected checksum ' + expectedHash + ', found ' + actualHash + ')');
      } else {
        try { UnifiedLogger.warn('ConfigSeeder', 'Sheet header checksum mismatch but forced', { sheet: sheetName, expected: expectedHash, actual: actualHash }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
      }
    } else {
      try { UnifiedLogger.warn('ConfigSeeder', 'Sheet using legacy Resource Catalog headers; will normalize on seed'); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    }
  }
}

function isLegacyResourceHeaders_(row) {
  const legacy = ['code', 'name', 'unit', 'rate', 'category', 'source', 'pricingMode', 'status', 'metadataJSON'];
  return headersEqual_(row, legacy);
}

function normalizeResourceCsv_(csv) {
  if (!csv || !csv.length) {
    return csv;
  }
  if (headersEqual_(csv[0], ['code', 'name', 'unit', 'rate', 'category', 'source', 'description', 'pricingMode', 'status', 'metadataJSON'])) {
    return csv;
  }
  if (!isLegacyResourceHeaders_(csv[0])) {
    return csv;
  }
  const fixed = [];
  const header = ['code', 'name', 'unit', 'rate', 'category', 'source', 'description', 'pricingMode', 'status', 'metadataJSON'];
  fixed.push(header);
  for (let i = 1; i < csv.length; i++) {
    const row = csv[i] || [];
    const newRow = [];
    newRow[0] = row[0] || '';
    newRow[1] = row[1] || '';
    newRow[2] = row[2] || '';
    newRow[3] = row[3] || '';
    newRow[4] = row[4] || '';
    newRow[5] = row[5] || '';
    newRow[6] = ''; // description
    newRow[7] = row[6] || '';
    newRow[8] = row[7] || '';
    newRow[9] = row[8] || '';
    fixed.push(newRow);
  }
  try { UnifiedLogger.warn('ConfigSeeder', 'Normalized legacy Resource CSV to expected headers'); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
  return fixed;
}

function computeHeaderChecksum_(row) {
  if (!row) {
    return 'missing';
  }
  const normalized = row.map(function(value) { return String(value === null || typeof value === 'undefined' ? '' : value).trim().toLowerCase(); });
  try {
    if (typeof Utilities !== 'undefined' && Utilities && Utilities.computeDigest) {
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, normalized.join('||'));
      return digest.map(function(byte) { return ('0' + (byte & 0xff).toString(16)).slice(-2); }).join('');
    }
  } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
  return normalized.join('|');
}

function seedColumnMap_(ss) {
  const sheet = ensureConfigSheet_(ss, 'Config: Column Map', ['key', 'value']);
  const defaults = {};
  if (typeof NORMALIZE_CONFIG !== 'undefined') {
    defaults['SOURCE_TABS.SCOPES'] = NORMALIZE_CONFIG.SOURCE_TABS.SCOPES;
    defaults['OUTPUT_TAB'] = NORMALIZE_CONFIG.OUTPUT_TAB;
    Object.keys(NORMALIZE_CONFIG.SCOPE_COLUMNS).forEach(function(key) {
      defaults['SCOPE_COLUMNS.' + key] = NORMALIZE_CONFIG.SCOPE_COLUMNS[key];
    });
  } else {
    // Fallback: hardcoded defaults matching NORMALIZE_CONFIG structure
    defaults['SOURCE_TABS.SCOPES'] = 'Scope Buildups';
    defaults['OUTPUT_TAB'] = 'XERO_READY';
    defaults['SCOPE_COLUMNS.CODE'] = 0;
    defaults['SCOPE_COLUMNS.NAME'] = 1;
    defaults['SCOPE_COLUMNS.RESOURCE_CODE'] = 2;
    defaults['SCOPE_COLUMNS.RESOURCE_NAME'] = 3;
    defaults['SCOPE_COLUMNS.HOURS'] = 4;
    defaults['SCOPE_COLUMNS.HOUR_RATE'] = 5;
    defaults['SCOPE_COLUMNS.LINE_COST'] = 6;
    defaults['SCOPE_COLUMNS.NOTES'] = 7;
  }
  const rows = Object.keys(defaults).map(function(key) {
    return [key, defaults[key]];
  });
  writeConfigRows_(sheet, rows);
}

function ensureConfigSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    if (!isSheetCreationAllowed_()) {
      logToast_('Config Seeder', 'Sheet creation blocked by policy for ' + name, 8, 'WARN', { source: 'ConfigSeeder' });
      throw new AppError('CONFIG_SCHEMA', 'Sheet creation blocked by policy for ' + name);
    }
    sheet = ss.insertSheet(name);
    logToast_('Config Seeder', 'Created sheet ' + name, 3, 'INFO', { source: 'ConfigSeeder' });
  }
  if (sheet) {
    // Backup removed - rely on Google Sheets version history from App-script/ConfigSeeder.js:955
    // backupSheet_(ss, sheet);
    validateExistingHeaders_(sheet, headers, name);
    // Preserve existing data; only enforce headers.
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
    logToast_('Config Seeder', 'Verified headers for ' + name, 3, 'INFO', { source: 'ConfigSeeder' });
  }
  return sheet;
}

function headersMatchExpected_(sheet, headers) {
  try {
    const lastCol = Math.max(headers.length, sheet.getLastColumn());
    const row = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const expected = headers.map(function(h) { return String(h || '').trim(); });
    for (let i = 0; i < expected.length; i++) {
      if (String(row[i] || '').trim() !== expected[i]) {
        return false;
      }
    }
    return true;
  } catch (error) {
    return false;
  }
}

function writeConfigRows_(sheet, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function backupSheet_(ss, sheet) {
  if (!ss || !sheet) {
    return null;
  }
  try {
    const ts = new Date();
    const tz = (typeof Session !== 'undefined' && Session && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : 'UTC';
    const name = sheet.getName() + ' Backup ' + Utilities.formatDate(ts, tz, 'yyyyMMdd_HHmmss');
    sheet.copyTo(ss).setName(name);
    try { UnifiedLogger.info('ConfigSeeder', 'Sheet backup created', { sheet: sheet.getName(), backup: name }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    return name;
  } catch (error) {
    try { UnifiedLogger.warn('ConfigSeeder', 'backupSheet_ failed', { sheet: sheet.getName(), error: String(error) }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    return null;
  }
}

function validateExistingHeaders_(sheet, expectedHeaders, sheetName) {
  try {
    const lastColumn = sheet.getLastColumn();
    if (!lastColumn || !expectedHeaders || !expectedHeaders.length) {
      return;
    }
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const mismatches = [];
    expectedHeaders.forEach(function(expected, idx) {
      const actual = headers[idx] || '';
      if (String(actual).trim() !== expected) {
        mismatches.push((idx + 1) + ': expected "' + expected + '" found "' + actual + '"');
      }
    });
    if (mismatches.length) {
      if (isStrictSchema_()) {
        throw new AppError('CONFIG_SCHEMA', 'Header mismatch in ' + sheetName + ': ' + mismatches.join(' | '));
      }
      try { UnifiedLogger.warn('ConfigSeeder', 'Header mismatch', { sheet: sheetName, mismatches: mismatches }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    }
  } catch (error) {
    try { UnifiedLogger.warn('ConfigSeeder', 'validateExistingHeaders_ failed', String(error)); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    if (isStrictSchema_()) {
      throw error;
    }
  }
}

function bumpConfigVersion_() {
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    const version = new Date().toISOString();
    if (props) {
      props.setProperty('CONFIG_VERSION', version);
      props.setProperty('CONFIG_SEED_VERSION', version);
    }
  } catch (error) {
    try { UnifiedLogger.warn('ConfigSeeder', 'bumpConfigVersion_ failed', String(error)); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
  }
}

function isStrictSchema_() {
  try {
    const raw = getScriptProperty('CONFIG_SEED_STRICT_SCHEMA');
    return raw === null || raw === undefined || String(raw).toLowerCase() !== 'false';
  } catch (error) {
    return true;
  }
}

function isSheetCreationAllowed_() {
  return true;
}

function isSeedDryRun_() {
  try {
    const raw = getScriptProperty('CONFIG_SEED_DRY_RUN');
    return raw !== null && raw !== undefined && String(raw).toLowerCase() === 'true';
  } catch (error) {
    return false;
  }
}

function isSeedForceOverwrite_() {
  try {
    const raw = getScriptProperty('CONFIG_SEED_FORCE_OVERWRITE');
    return raw !== null && raw !== undefined && String(raw).toLowerCase() === 'true';
  } catch (error) {
    return false;
  }
}

function isSeedForceSchema_() {
  try {
    const raw = getScriptProperty('CONFIG_SEED_FORCE_SCHEMA');
    return raw !== null && raw !== undefined && String(raw).toLowerCase() === 'true';
  } catch (error) {
    return false;
  }
}

function shouldOverwriteHeaders_(sheet, expectedHeaders) {
  try {
    const headerRange = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), expectedHeaders.length));
    const formulas = headerRange.getFormulas()[0];
    const notes = headerRange.getNotes()[0];
    const backgrounds = headerRange.getBackgrounds()[0];
    const hasFormula = formulas.some(function(f) { return isNonEmptyString(f); });
    const hasNotes = notes.some(function(n) { return isNonEmptyString(n); });
    const hasHighlight = backgrounds.some(function(bg) { return bg && bg !== '#ffffff' && bg !== '#fff' && bg !== '#000000'; });
    try { UnifiedLogger.info('ConfigSeeder', 'Header overwrite allowed', { sheet: sheet.getName(), formula: hasFormula, notes: hasNotes, highlight: hasHighlight }); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    return true;
  } catch (error) {
    try { UnifiedLogger.warn('ConfigSeeder', 'shouldOverwriteHeaders_ failed', String(error)); } catch (ignore) {
      console.error('[ConfigSeeder] Error:', ignore.message, ignore.stack);
    }
    return isStrictSchema_() ? false : true;
  }
}

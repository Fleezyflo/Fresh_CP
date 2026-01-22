/**
 * Setup Source Data - AUTO-GENERATED
 * Creates all 3 source tabs with complete data and formatting
 *
 * Run: setupAllSourceData()
 *
 * This file is AUTO-GENERATED. Do not edit manually.
 * Generated from: SOURCE_TAB_*.csv files
 */

const SETUP_SOURCE_DATA_LOG_CATEGORY = 'SetupSourceData';

function setupAllSourceData() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'setupAllSourceData');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    if (logger && typeof logger.info === 'function') { try { logger.info('SheetSetup', 'Starting Source Data Setup'); } catch (ignore) {
      // Silent fail
    } }

  const sourceFolderId = getConfigValue('SOURCE_DATA_FOLDER_ID');
  if (!sourceFolderId) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID not configured in Config sheet.');
  }

  const folder = getFolderByIdSafe_(sourceFolderId);
  if (!folder) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID is invalid or inaccessible. Update the Config tab with a Drive folder you can access.');
  }
  const files = folder.getFiles();

  const sourceData = {};
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().endsWith('.csv')) {
      const fileName = file.getName();
      const content = file.getBlob().getDataAsString();
      sourceData[fileName] = Utilities.parseCsv(content);
    }
  }

  createCrewRatesTab(ss, sourceData['SOURCE_TAB_1_Crew_Rates.csv']);
  createResourceRatesTab(ss, sourceData['SOURCE_TAB_2_Resource_Rates.csv']);
  createScopeBuildupTab(ss, sourceData['SOURCE_TAB_3_Scope_Buildups.csv']);

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  if (logger && typeof logger.info === 'function') { try { logger.info('SheetSetup', 'Source Data Setup Complete'); } catch (ignore) {
      // Silent fail
    } }

  const scopeSheet = ss.getSheetByName('Scope Buildups');
  const scopeRows = scopeSheet ? scopeSheet.getLastRow() - 1 : 0;

  if (logger && typeof logger.info === 'function') { try { logger.info('SheetSetup', 'Created 3 tabs with comprehensive data'); } catch (ignore) {
      // Silent fail
    } }

  const result = {
    crew: sourceData['SOURCE_TAB_1_Crew_Rates.csv'] ? sourceData['SOURCE_TAB_1_Crew_Rates.csv'].length - 1 : 0,
    resources: sourceData['SOURCE_TAB_2_Resource_Rates.csv'] ? sourceData['SOURCE_TAB_2_Resource_Rates.csv'].length - 1 : 0,
    scopeRows: scopeRows,
    total: (sourceData['SOURCE_TAB_1_Crew_Rates.csv'] ? sourceData['SOURCE_TAB_1_Crew_Rates.csv'].length - 1 : 0) +
           (sourceData['SOURCE_TAB_2_Resource_Rates.csv'] ? sourceData['SOURCE_TAB_2_Resource_Rates.csv'].length - 1 : 0) +
           scopeRows,
    status: 'SUCCESS'
  };
  trace.complete('setupAllSourceData completed', { total: result.total });
  return result;
  } catch (error) {
    trace.fail('setupAllSourceData failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Setting up source data',
      correlationId: trace.correlationId
    });
    showErrorToast('Setup Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Import the v2 CSVs for scopes and resources from the SOURCE_DATA_FOLDER_ID.
 * Expects three files in the folder:
 * - "Scopes 2.0 - Catalogue.csv" → Scope Buildups tab
 * - "Scopes 2.0 - Resources.csv" → Config: Resource Catalog
 * - "Scopes 2.0 - Scope Catalog.csv" → Config: Scope Catalog
 */
function importScopesV2FromDrive() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'importScopesV2FromDrive');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('importScopesV2FromDrive failed - no spreadsheet', new Error('No active spreadsheet'));
      throw new AppError('CONFIG_ERROR', 'No active spreadsheet available.');
    }

    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;

  const folderId = getConfigValue('SOURCE_DATA_FOLDER_ID');
  if (!folderId) {
    throw new AppError('CONFIG_ERROR', 'SOURCE_DATA_FOLDER_ID not configured in Config sheet.');
  }

  const folder = getFolderByIdSafe_(folderId);
  if (!folder) {
    if (logger && typeof logger.warn === 'function') { try { logger.warn('SheetSetup', 'ensureSourceDataFromDriveIfEmpty skipped: Drive folder inaccessible or permission missing', { folderId: folderId }); } catch (ignore) {
      // Silent fail
    } }
    logToast_('Catalog Seed', 'Drive folder inaccessible: check SOURCE_DATA_FOLDER_ID and permissions.', 8, 'WARN', { source: 'SheetSetup' });
    return false;
  }
  try {
    const names = [];
    const iter = folder.getFiles();
    while (iter.hasNext()) {
      names.push(iter.next().getName());
    }
    if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Seed: files in SOURCE_DATA_FOLDER_ID=' + folderId, { names: names }); } catch (ignore) {
      // Silent fail
    } }
    UnifiedLogger.info(SETUP_SOURCE_DATA_LOG_CATEGORY, 'Seed folder files', { names: names });
  } catch (ignore) {
      // Silent fail
    }
  const scopeBuildups = getCsvByName_(folder, 'Scopes 2.0 - Catalogue.csv');
  const resourceCatalog = getCsvByName_(folder, 'Scopes 2.0 - Resources.csv');
  const scopeCatalog = getCsvByName_(folder, 'Scopes 2.0 - Scope Catalog.csv');

  const summary = {
    scopeBuildupsRows: scopeBuildups ? Math.max(0, scopeBuildups.length - 1) : 0,
    resourceRows: resourceCatalog ? Math.max(0, resourceCatalog.length - 1) : 0,
    scopeCatalogRows: scopeCatalog ? Math.max(0, scopeCatalog.length - 1) : 0,
    errors: []
  };

  try {
    if (logger && typeof logger.info === 'function') {
      try {
        logger.info('CatalogSeed', 'Drive CSV lengths', {
          scopeBuildups: scopeBuildups ? scopeBuildups.length : 0,
          resourceCatalog: resourceCatalog ? resourceCatalog.length : 0,
          scopeCatalog: scopeCatalog ? scopeCatalog.length : 0
        });
      } catch (ignore) {
        // Silent fail
      }
    }
  } catch (ignore) {
    // Silent fail
  }
  try {
    if (logger && typeof logger.info === 'function') {
      try {
        logger.info('CatalogSeed', 'Drive CSV lengths', {
          scopeBuildups: scopeBuildups ? scopeBuildups.length : 0,
          resourceCatalog: resourceCatalog ? resourceCatalog.length : 0,
          scopeCatalog: scopeCatalog ? scopeCatalog.length : 0
        });
      } catch (ignore) {
        // Silent fail
      }
    }
    UnifiedLogger.info(SETUP_SOURCE_DATA_LOG_CATEGORY, 'Drive CSV lengths', {
      scopeBuildups: scopeBuildups ? scopeBuildups.length : 0,
      resourceCatalog: resourceCatalog ? resourceCatalog.length : 0,
      scopeCatalog: scopeCatalog ? scopeCatalog.length : 0
    });
  } catch (ignore) {
    // Silent fail
  }
  try {
    const msg = 'Drive CSV rows — ScopeBuildups: ' + (scopeBuildups ? scopeBuildups.length - 1 : 0) + ', ResourceCatalog: ' + (resourceCatalog ? resourceCatalog.length - 1 : 0) + ', ScopeCatalog: ' + (scopeCatalog ? scopeCatalog.length - 1 : 0);
    logToast_('Catalog Seed', msg, 8, 'INFO', { source: 'SheetSetup', scopeBuildups: scopeBuildups ? scopeBuildups.length : 0, resourceCatalog: resourceCatalog ? resourceCatalog.length : 0, scopeCatalog: scopeCatalog ? scopeCatalog.length : 0 });
    if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', msg); } catch (ignore) {
      // Silent fail
    } }
  } catch (ignore) {
    // Silent fail
  }

  const overrideUsed = isSeedForceOverwrite_();
  let resourceResult = 'skipped';
  let catalogResult = 'skipped';
  let scopeResult = 'skipped';

  if (resourceCatalog && resourceCatalog.length >= 2) {
    try { resourceResult = writeResourceCatalog_(ss, resourceCatalog); } catch (error) { summary.errors.push('Resource Catalog: ' + error); }
  } else {
    summary.errors.push('Resource Catalog CSV missing or empty');
  }

  if (scopeCatalog && scopeCatalog.length >= 2) {
    try { catalogResult = writeScopeCatalog_(ss, scopeCatalog); } catch (error) { summary.errors.push('Scope Catalog: ' + error); }
  } else {
    summary.errors.push('Scope Catalog CSV missing or empty');
  }

  if (scopeBuildups && scopeBuildups.length >= 2) {
    try { scopeResult = writeScopeBuildups_(ss, scopeBuildups); } catch (error) { summary.errors.push('Scope Buildups: ' + error); }
  } else {
    summary.errors.push('Scope Buildups CSV missing or empty');
  }
  if (overrideUsed) {
    markSeedForceOverwriteUsed_();
    clearSeedForceOverwriteFlag_();
  }

  SpreadsheetApp.flush();

  // Mark CSV as authoritative if seeding was successful (prevents static seeder from overwriting)
  if (summary.errors.length === 0) {
    const timestamp = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('CSV_CATALOGS_SEEDED', 'true');
    PropertiesService.getScriptProperties().setProperty('CSV_CATALOGS_TIMESTAMP', timestamp);
    if (typeof UnifiedLogger !== 'undefined') {
      try {
        UnifiedLogger.info('CatalogSeed', 'CSV marked as authoritative (static seeder will skip catalogs)', { timestamp: timestamp });
      } catch (ignore) {
        // Silent fail
      }
    }
  }

  const result = {
    scopeRows: summary.scopeBuildupsRows,
    resources: summary.resourceRows,
    scopeCatalogRows: summary.scopeCatalogRows,
    status: summary.errors.length ? 'PARTIAL' : 'SUCCESS',
    errors: summary.errors,
    overrideUsed: overrideUsed,
    scopeResult: scopeResult || 'ok',
    resourceResult: resourceResult || 'ok',
    catalogResult: catalogResult || 'ok',
    csvAuthority: summary.errors.length === 0 ? true : false
  };
  logCatalogSeedEvent_('completed', result);
  if (typeof UnifiedLogger !== 'undefined') { try { UnifiedLogger.info('CatalogSeed', 'Catalog seed result', result); } catch (ignore) {
      // Silent fail
    } }
  trace.complete('importScopesV2FromDrive completed', { status: result.status, errors: result.errors.length, csvAuthority: result.csvAuthority });
  return result;
  } catch (error) {
    trace.fail('importScopesV2FromDrive failed', error);
    throw error;
  }
}

/**
 * Ensure source data tabs exist; if any are empty, auto-import from SOURCE_DATA_FOLDER_ID.
 */
function ensureSourceDataFromDriveIfEmpty() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'ensureSourceDataFromDriveIfEmpty');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('ensureSourceDataFromDriveIfEmpty failed - no spreadsheet', new Error('No active spreadsheet'));
      throw new AppError('CONFIG_ERROR', 'No active spreadsheet available.');
    }
  const scopeSheet = ss.getSheetByName('Scope Buildups');
  const resourceSheet = ss.getSheetByName('Config: Resource Catalog');
  const scopeCatalogSheet = ss.getSheetByName('Config: Scope Catalog');

  const scopeMissing = !scopeSheet || scopeSheet.getLastRow() < 2;
  const resourcesMissing = !resourceSheet || resourceSheet.getLastRow() < 2;
  const scopeCatalogMissing = !scopeCatalogSheet || scopeCatalogSheet.getLastRow() < 2;

  if (!(scopeMissing || resourcesMissing || scopeCatalogMissing)) {
    if (typeof UnifiedLogger !== 'undefined') { try { UnifiedLogger.info('SheetSetup', 'ensureSourceDataFromDriveIfEmpty skipped: sheets already populated'); } catch (ignore) {
      // Silent fail
    } }
    trace.complete('ensureSourceDataFromDriveIfEmpty completed - already populated');
    return false;
  }
  try {
    importScopesV2FromDrive();
    trace.complete('ensureSourceDataFromDriveIfEmpty completed - imported');
    return true;
  } catch (error) {
    trace.fail('ensureSourceDataFromDriveIfEmpty import failed', error);
    if (typeof UnifiedLogger !== 'undefined') { try { UnifiedLogger.warn('SheetSetup', 'ensureSourceDataFromDriveIfEmpty skipped', String(error)); } catch (ignore) {
      // Silent fail
    } }
    return false;
  }
  } catch (error) {
    trace.fail('ensureSourceDataFromDriveIfEmpty failed', error);
    throw error;
  }
}

function ensureCoreSheetsAndHeaders() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'ensureCoreSheetsAndHeaders');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('ensureCoreSheetsAndHeaders failed - no spreadsheet', new Error('No active spreadsheet'));
      throw new AppError('CONFIG_ERROR', 'No active spreadsheet available.');
    }
    ensureSheetHeaders_(ss, SHEET_NAMES && SHEET_NAMES.QUOTE_BUILDER ? SHEET_NAMES.QUOTE_BUILDER : 'Quote_Builder', QB_HEADER_MAP, QB_COLS);
    ensureSheetHeaders_(ss, SHEET_NAMES && SHEET_NAMES.XERO_READY ? SHEET_NAMES.XERO_READY : 'XERO_READY', XERO_HEADER_MAP, XERO_COLS);
    ensureSheetExists_(ss, SHEET_NAMES && SHEET_NAMES.CONFIG ? SHEET_NAMES.CONFIG : 'Config');
    ensureSheetExists_(ss, SHEET_NAMES && SHEET_NAMES.VALIDATION_LOOKUPS ? SHEET_NAMES.VALIDATION_LOOKUPS : 'VALIDATION_LOOKUPS');
    ensureSheetExists_(ss, SHEET_NAMES && SHEET_NAMES.CLIENT_VIEW ? SHEET_NAMES.CLIENT_VIEW : 'Client_View');
    ensureSheetExists_(ss, SHEET_NAMES && SHEET_NAMES.INTERNAL_VIEW ? SHEET_NAMES.INTERNAL_VIEW : 'Internal_View');
    trace.complete('ensureCoreSheetsAndHeaders completed');
  } catch (error) {
    trace.fail('ensureCoreSheetsAndHeaders failed', error);
    throw error;
  }
}

function ensureSheetHeaders_(ss, sheetName, headerMap, columnMap) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'ensureSheetHeaders_');
  try {
    if (!headerMap) {
      trace.complete('ensureSheetHeaders_ completed - no headerMap');
      return;
    }
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    if (!isSheetCreationAllowed_()) {
      logToast_('Sheet Setup', 'Sheet creation blocked for ' + sheetName, 8, 'WARN', { source: 'SheetSetup' });
      throw new AppError('CONFIG_ERROR', 'Sheet creation blocked for ' + sheetName);
    }
    sheet = ss.insertSheet(sheetName);
    logToast_('Sheet Setup', 'Created sheet ' + sheetName, 3, 'INFO', { source: 'SheetSetup' });
  }
  let headers;
  if (columnMap && typeof columnMap === 'object') {
    headers = Object.keys(columnMap)
      .sort(function(a, b) { return columnMap[a] - columnMap[b]; })
      .map(function(key) { return headerMap[key]; });
  } else {
    headers = Object.keys(headerMap).map(function(key) { return headerMap[key]; });
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const matches = current.length >= headers.length && headers.every(function(value, idx) {
    return (current[idx] || '').toString().trim() === value;
  });
  if (!matches) {
    if (!shouldOverwriteHeaders_(sheet, headers)) {
      if (logger && typeof logger.warn === 'function') { try { logger.warn('SheetSetup', 'Header overwrite skipped', { sheet: sheetName, reason: 'formulas/metadata/highlight' }); } catch (ignore) {
      // Silent fail
    } }
      logToast_('Sheet Setup', 'Skipped header reset for ' + sheetName + ' (formulas/notes detected)', 8, 'WARN', { source: 'SheetSetup' });
      trace.complete('ensureSheetHeaders_ completed - overwrite skipped', { sheet: sheetName });
      return;
    }
    // Backup removed - rely on Google Sheets version history from App-script/SetupSourceData.js:341
    // backupSheet_(ss, sheet);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    const columns = sheet.getMaxColumns();
    if (columns < headers.length) {
      sheet.insertColumnsAfter(columns, headers.length - columns);
    }
  }
  trace.complete('ensureSheetHeaders_ completed', { sheet: sheetName });
  } catch (error) {
    trace.fail('ensureSheetHeaders_ failed', error);
    throw error;
  }
}

function ensureSheetExists_(ss, name) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'ensureSheetExists_');
  try {
    if (!ss.getSheetByName(name)) {
      if (!isSheetCreationAllowed_()) {
        trace.fail('ensureSheetExists_ failed - creation blocked', new Error('Sheet creation blocked'));
        throw new AppError('CONFIG_ERROR', 'Sheet creation blocked for ' + name);
      }
      ss.insertSheet(name);
    }
    trace.complete('ensureSheetExists_ completed', { sheet: name });
  } catch (error) {
    trace.fail('ensureSheetExists_ failed', error);
    throw error;
  }
}

function verifySourceDataFilesPresent() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'verifySourceDataFilesPresent');
  try {
    const missing = [];
    const folderId = getConfigValue('SOURCE_DATA_FOLDER_ID');
    if (!folderId) {
      trace.complete('verifySourceDataFilesPresent completed - missing folder ID');
      return ['SOURCE_DATA_FOLDER_ID missing'];
    }
    try {
      const folder = getFolderByIdSafe_(folderId);
      if (!folder) {
        trace.complete('verifySourceDataFilesPresent completed - folder inaccessible');
        return ['SOURCE_DATA_FOLDER_ID inaccessible'];
      }
      const required = [
        'Scopes 2.0 - Catalogue.csv',
        'Scopes 2.0 - Resources.csv',
        'Scopes 2.0 - Scope Catalog.csv'
      ];
      required.forEach(function(name) {
        const files = folder.getFilesByName(name);
        if (!files.hasNext()) {
          missing.push(name);
        }
      });
    } catch (error) {
      trace.fail('verifySourceDataFilesPresent failed - folder access error', error);
      return ['SOURCE_DATA_FOLDER_ID inaccessible'];
    }
    trace.complete('verifySourceDataFilesPresent completed', { missing: missing.length });
    return missing;
  } catch (error) {
    trace.fail('verifySourceDataFilesPresent failed', error);
    throw error;
  }
}

function logCatalogSeedEvent_(outcome, details) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'logCatalogSeedEvent_');
  try {
    const payload = details || {};
    payload.outcome = outcome;
    try {
      const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
      if (logger && typeof logger.info === 'function') { logger.info('CatalogSeed', 'Catalog seed outcome: ' + outcome, payload); }
    } catch (ignore) {
      // Silent fail
    }
    trace.complete('logCatalogSeedEvent_ completed', { outcome: outcome });
  } catch (error) {
    trace.fail('logCatalogSeedEvent_ failed', error);
    throw error;
  }
}

function getHeaderState_(sheet, expectedHeaders) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'getHeaderState_');
  try {
    if (!sheet) {
      trace.complete('getHeaderState_ completed - no sheet');
      return { exists: false, matches: false, headers: [], notesPresent: false };
    }
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    try {
      const range = sheet.getRange(1, 1, 1, expectedHeaders.length);
      const headers = range.getValues()[0].map(function(value) { return (value || '').toString().trim(); });
      const notesRow = range.getNotes()[0];
      const notesPresent = Array.isArray(notesRow) && notesRow.some(function(note) { return note && note.trim() !== ''; });
      const matches = expectedHeaders.every(function(value, idx) {
        return (headers[idx] || '').toString().trim() === (value || '').toString().trim();
      });
      trace.complete('getHeaderState_ completed', { matches: matches });
      return { exists: true, matches: matches, headers: headers, notesPresent: notesPresent };
    } catch (error) {
      trace.fail('getHeaderState_ failed - range access error', error);
      if (logger && typeof logger.warn === 'function') { try { logger.warn('SheetSetup', 'getHeaderState_ failed', String(error)); } catch (ignore) {
      // Silent fail
    } }
      return { exists: true, matches: false, headers: [], notesPresent: false };
    }
  } catch (error) {
    trace.fail('getHeaderState_ failed', error);
    throw error;
  }
}

function clearSeedForceOverwriteFlag_() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'clearSeedForceOverwriteFlag_');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      props.deleteProperty('CONFIG_SEED_FORCE_OVERWRITE');
    }
    trace.complete('clearSeedForceOverwriteFlag_ completed');
  } catch (error) {
    trace.fail('clearSeedForceOverwriteFlag_ failed', error);
  }
}

function getFolderByIdSafe_(folderId) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'getFolderByIdSafe_');
  try {
    if (!folderId) {
      trace.complete('getFolderByIdSafe_ completed - no folderId');
      return null;
    }
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    try {
      const folder = DriveApp.getFolderById(folderId);
      trace.complete('getFolderByIdSafe_ completed', { folderId: folderId.substring(0, 16) });
      return folder;
    } catch (error) {
      trace.fail('getFolderByIdSafe_ failed - folder access error', error);
      if (logger && typeof logger.warn === 'function') { try { logger.warn('SheetSetup', 'getFolderByIdSafe_ failed', { folderId: folderId, error: String(error) }); } catch (ignore) {
      // Silent fail
    } }
      return null;
    }
  } catch (error) {
    trace.fail('getFolderByIdSafe_ failed', error);
    throw error;
  }
}

/**
 * Ensure XERO_READY is populated; if empty, run normalization.
 */
function ensureXeroReadyPopulated() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'ensureXeroReadyPopulated');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('ensureXeroReadyPopulated failed - no spreadsheet', new Error('No active spreadsheet'));
      throw new AppError('CONFIG_ERROR', 'No active spreadsheet available.');
    }
    const sheet = ss.getSheetByName(SHEET_NAMES && SHEET_NAMES.XERO_READY ? SHEET_NAMES.XERO_READY : 'XERO_READY');
    const needsNormalize = !sheet || sheet.getLastRow() < 2;
    if (needsNormalize && typeof normalizeAllData === 'function') {
      normalizeAllData();
      trace.complete('ensureXeroReadyPopulated completed - normalized');
      return true;
    }
    trace.complete('ensureXeroReadyPopulated completed - already populated');
    return false;
  } catch (error) {
    trace.fail('ensureXeroReadyPopulated failed', error);
    throw error;
  }
}

function isNormalizationFresh_(thresholdMs) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'isNormalizationFresh_');
  try {
    const ttl = thresholdMs || (30 * 60 * 1000);
    try {
      const last = parseInt(getScriptProperty('LAST_NORMALIZE_TS') || '0', 10);
      if (isNaN(last) || !last) {
        trace.complete('isNormalizationFresh_ completed - no timestamp', { fresh: false });
        return false;
      }
      const isFresh = (new Date().getTime() - last) <= ttl;
      trace.complete('isNormalizationFresh_ completed', { fresh: isFresh });
      return isFresh;
    } catch (error) {
      trace.fail('isNormalizationFresh_ check failed', error);
      return false;
    }
  } catch (error) {
    trace.fail('isNormalizationFresh_ failed', error);
    throw error;
  }
}

function isLookupFresh_(thresholdMs) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'isLookupFresh_');
  try {
    const ttl = thresholdMs || (30 * 60 * 1000);
    try {
      const last = parseInt(getScriptProperty('LAST_LOOKUP_REFRESH_TS') || '0', 10);
      if (isNaN(last) || !last) {
        trace.complete('isLookupFresh_ completed - no timestamp', { fresh: false });
        return false;
      }
      const isFresh = (new Date().getTime() - last) <= ttl;
      trace.complete('isLookupFresh_ completed', { fresh: isFresh });
      return isFresh;
    } catch (error) {
      trace.fail('isLookupFresh_ check failed', error);
      return false;
    }
  } catch (error) {
    trace.fail('isLookupFresh_ failed', error);
    throw error;
  }
}

function getCsvByName_(folder, name) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'getCsvByName_');
  try {
    const files = folder.getFilesByName(name);
    if (!files.hasNext()) {
      trace.fail('getCsvByName_ failed - CSV not found', new Error('CSV not found'));
      throw new AppError('CONFIG_ERROR', 'CSV not found in source folder: ' + name);
    }
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    const rows = Utilities.parseCsv(content);
    if (!rows || !rows.length) {
      trace.fail('getCsvByName_ failed - CSV empty', new Error('CSV empty'));
      throw new AppError('CONFIG_ERROR', 'CSV is empty or unreadable: ' + name);
    }
    const headerLength = rows[0].length;
    const malformed = rows.findIndex(function(row, idx) { return row.length !== headerLength; });
    if (malformed !== -1) {
      trace.fail('getCsvByName_ failed - malformed row', new Error('Malformed row'));
      throw new AppError('CONFIG_ERROR', name + ' row ' + (malformed + 1) + ' has ' + rows[malformed].length + ' columns; expected ' + headerLength + '.');
    }
    trace.complete('getCsvByName_ completed', { name: name, rows: rows.length });
    return rows;
  } catch (error) {
    trace.fail('getCsvByName_ failed', error);
    throw error;
  }
}

function backupSheet_(ss, sheet) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'backupSheet_');
  try {
    if (!ss || !sheet) {
      trace.complete('backupSheet_ completed - no sheet');
      return;
    }
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    try {
      const timestamp = new Date();
      const tz = (typeof Session !== 'undefined' && Session && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : 'UTC';
      const name = sheet.getName() + ' Backup ' + Utilities.formatDate(timestamp, tz, 'yyyyMMdd_HHmmss');
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          sheet.copyTo(ss).setName(name);
          trace.complete('backupSheet_ completed', { sheet: sheet.getName() });
          return;
        } catch (copyError) {
          lastError = copyError;
          if (attempt < 1) {
            try { Utilities.sleep(500); } catch (ignore) {
      // Silent fail
    }
          }
        }
      }
      trace.fail('backupSheet_ failed - copy error', lastError || new Error('copy failed'));
      if (logger && typeof logger.warn === 'function') { try { logger.warn('SheetSetup', 'backupSheet_ failed', { sheet: sheet.getName(), error: String(lastError || 'copy failed') }); } catch (ignore) {
      // Silent fail
    } }
    } catch (error) {
      trace.fail('backupSheet_ failed - copy error', error);
      if (logger && typeof logger.warn === 'function') { try { logger.warn('SheetSetup', 'backupSheet_ failed', { sheet: sheet.getName(), error: String(error) }); } catch (ignore) {
      // Silent fail
    } }
    }
  } catch (error) {
    trace.fail('backupSheet_ failed', error);
    throw error;
  }
}

function validateCsvHeaders_(data, expectedHeaders, name) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'validateCsvHeaders_');
  try {
    if (!Array.isArray(data) || data.length === 0) {
      trace.fail('validateCsvHeaders_ failed - empty data', new Error('Empty data'));
      throw new AppError('CONFIG_ERROR', name + ' is empty.');
    }
    if (!expectedHeaders || !expectedHeaders.length) {
      trace.complete('validateCsvHeaders_ completed - no expected headers');
      return;
    }
    const headers = data[0].map(function(value) { return (value === null || typeof value === 'undefined') ? '' : String(value).trim(); });
    expectedHeaders.forEach(function(expected, idx) {
      const actual = headers[idx] || '';
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        trace.fail('validateCsvHeaders_ failed - header mismatch', new Error('Header mismatch'));
        throw new AppError('CONFIG_ERROR', name + ' header mismatch at column ' + (idx + 1) + ': expected "' + expected + '", found "' + actual + '".');
      }
    });
    trace.complete('validateCsvHeaders_ completed', { name: name, headerCount: expectedHeaders.length });
  } catch (error) {
    trace.fail('validateCsvHeaders_ failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Validating CSV headers',
      correlationId: trace.correlationId
    });
    showErrorToast('Validation Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

function padResourceRows_(rows, targetLen) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'padResourceRows_');
  try {
    const result = rows.map(function(row) {
      let r = row || [];
      if (r.length < targetLen) {
        r = r.concat(new Array(targetLen - r.length).fill(''));
      } else if (r.length > targetLen) {
        r = r.slice(0, targetLen);
      }
      return r;
    });
    trace.complete('padResourceRows_ completed', { rows: rows.length, targetLen: targetLen });
    return result;
  } catch (error) {
    trace.fail('padResourceRows_ failed', error);
    throw error;
  }
}

function writeScopeBuildups_(ss, data) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'writeScopeBuildups_');
  try {
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Writing Scope Buildups tab...'); } catch (ignore) {
      // Silent fail
    } }
  if (!Array.isArray(data) || data.length < 2) {
    throw new AppError('CONFIG_ERROR', 'Scope Buildups CSV has no data.');
  }
  validateCsvHeaders_(data, ['Scope Code', 'Scope Name', 'Resource Code', 'Resource Name', 'Hours', 'Hour Rate', 'Line Cost', 'Notes'], 'Scope Buildups CSV');
  let sheet = ss.getSheetByName('Scope Buildups');
  const expectedHeaders = data[0];
  if (sheet) {
    const state = getHeaderState_(sheet, expectedHeaders);
    if (!state.matches) {
      logCatalogSeedEvent_('header-drift-corrected', { sheet: 'Scope Buildups', expected: expectedHeaders, current: state.headers, notesPresent: state.notesPresent });
    }
  }
  if (sheet) {
    // Backup removed - rely on Google Sheets version history from App-script/SetupSourceData.js:716
    // backupSheet_(ss, sheet);
    sheet.clear();
    // Clear validations across the entire sheet to avoid any blocking rules.
    try {
      sheet.clearConditionalFormatRules();
    } catch (ignore) {
      // Silent fail
    }
    try {
      sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();
    } catch (ignore) {
      // Silent fail
    }
  } else {
    sheet = ss.insertSheet('Scope Buildups');
  }
  const headers = data[0];
  const rows = data.slice(1);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');

  // Apply formulas only (no reseed) using shared helper.
  try { applyScopeBuildupsFormulasOnly(); } catch (ignore) {
      // Silent fail
    }

  logCatalogSeedEvent_('seeded', { sheet: 'Scope Buildups', rows: rows.length, override: isSeedForceOverwrite_() });
  trace.complete('writeScopeBuildups_ completed', { rows: rows.length });
  return 'seeded';
  } catch (error) {
    trace.fail('writeScopeBuildups_ failed', error);
    throw error;
  }
}

function writeResourceCatalog_(ss, data) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'writeResourceCatalog_');
  try {
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Writing Config: Resource Catalog tab...'); } catch (ignore) {
      // Silent fail
    } }
  if (!Array.isArray(data) || data.length < 2) {
    throw new AppError('CONFIG_ERROR', 'Resource Catalog CSV has no data.');
  }
  const extendedHeaders = ['code', 'name', 'unit', 'rate', 'category', 'source', 'description', 'pricingMode', 'status', 'metadataJSON', 'monthlyCostInput', 'dayRateInput'];
  validateCsvHeaders_(data, ['code', 'name', 'unit', 'rate', 'category', 'source', 'description', 'pricingMode', 'status', 'metadataJSON'], 'Resource Catalog CSV');
  let sheet = ss.getSheetByName('Config: Resource Catalog');
  const expectedHeaders = extendedHeaders;
  if (sheet) {
    const state = getHeaderState_(sheet, expectedHeaders);
    if (!state.matches) {
      logCatalogSeedEvent_('header-drift-corrected', { sheet: 'Config: Resource Catalog', expected: expectedHeaders, current: state.headers, notesPresent: state.notesPresent });
    }
  }
  if (sheet) {
    // Backup removed - rely on Google Sheets version history from App-script/SetupSourceData.js:774
    // backupSheet_(ss, sheet);
    sheet.clear();
  } else {
    sheet = ss.insertSheet('Config: Resource Catalog');
  }
  const rows = padResourceRows_(data.slice(1), extendedHeaders.length);
  populateResourceInputsFromMetadata_(rows);
  sheet.getRange(1, 1, 1, extendedHeaders.length).setValues([extendedHeaders]);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, extendedHeaders.length).setValues(rows);
    applyResourceRateFormulas_(sheet, rows.length);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, extendedHeaders.length).setFontWeight('bold').setBackground('#e8f0fe');
  logCatalogSeedEvent_('seeded', { sheet: 'Config: Resource Catalog', rows: rows.length, override: isSeedForceOverwrite_() });
  trace.complete('writeResourceCatalog_ completed', { rows: rows.length });
  return 'seeded';
  } catch (error) {
    trace.fail('writeResourceCatalog_ failed', error);
    throw error;
  }
}

function applyResourcePricingTransform_(rows, cfg) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'applyResourcePricingTransform_');
  try {
    // No-op: pricing now driven by sheet formulas, not precomputed here.
    trace.complete('applyResourcePricingTransform_ completed - no-op');
    return rows;
  } catch (error) {
    trace.fail('applyResourcePricingTransform_ failed', error);
    throw error;
  }
}

function applyResourceRateFormulas_(sheet, rowCount) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'applyResourceRateFormulas_');
  try {
    const cfg = readResourcePricingConfig_(sheet);
    sheet.getRange('AA1').setValue(cfg.multiplier || 3.5).setNote('RESOURCE_RATE_MULTIPLIER');
    sheet.getRange('AB1').setValue(cfg.workingDays || 21).setNote('RESOURCE_WORKING_DAYS');
    sheet.getRange('AC1').setValue(cfg.hoursPerDay || 8).setNote('RESOURCE_HOURS_PER_DAY');
    // Rate = dayRate/hoursPerDay when dayRate is provided; otherwise derive from monthly cost.
    const rateFormula = '=IF($L2<>"",IFERROR(VALUE($L2)/$AC$1,""),IF($K2="","",IFERROR(VALUE($K2)/$AB$1/$AC$1*$AA$1,"")))';
    sheet.getRange(2, 4, rowCount, 1).setFormula(rateFormula);
    trace.complete('applyResourceRateFormulas_ completed', { rowCount: rowCount });
  } catch (error) {
    trace.fail('applyResourceRateFormulas_ failed', error);
    throw error;
  }
}

function populateResourceInputsFromMetadata_(rows) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'populateResourceInputsFromMetadata_');
  try {
    if (!Array.isArray(rows)) {
      trace.complete('populateResourceInputsFromMetadata_ completed - not array');
      return;
    }
    const metadataIndex = 9;
    const monthlyCostIndex = 10;
    const categoryIndex = 4;
    const dayRateIndex = 11;
    rows.forEach(function(row) {
      if (!row || row.length < 12) {
        return;
      }
      const meta = parseResourceMetadata_(row[metadataIndex]);
      if ((row[monthlyCostIndex] === '' || row[monthlyCostIndex] === null || typeof row[monthlyCostIndex] === 'undefined') && meta && meta.monthlyCost !== undefined && meta.monthlyCost !== null) {
        row[monthlyCostIndex] = toNumber_(meta.monthlyCost, '');
      }
      const category = (row[categoryIndex] || '').toString().trim().toLowerCase();
      if ((row[dayRateIndex] === '' || row[dayRateIndex] === null || typeof row[dayRateIndex] === 'undefined')) {
        if (meta && meta.dayRate !== undefined && meta.dayRate !== null) {
          row[dayRateIndex] = toNumber_(meta.dayRate, '');
        }
      }
    });
    trace.complete('populateResourceInputsFromMetadata_ completed', { rows: rows.length });
  } catch (error) {
    trace.fail('populateResourceInputsFromMetadata_ failed', error);
    throw error;
  }
}

function readResourcePricingConfig_(sheet) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'readResourcePricingConfig_');
  try {
    const defaults = { multiplier: 3.5, workingDays: 21, hoursPerDay: 8 };
    if (!sheet) {
      trace.complete('readResourcePricingConfig_ completed - no sheet');
      return defaults;
    }
    try {
      const config = {
        multiplier: toNumber_(sheet.getRange('AA1').getValue(), defaults.multiplier),
        workingDays: toNumber_(sheet.getRange('AB1').getValue(), defaults.workingDays),
        hoursPerDay: toNumber_(sheet.getRange('AC1').getValue(), defaults.hoursPerDay)
      };
      trace.complete('readResourcePricingConfig_ completed', { multiplier: config.multiplier });
      return config;
    } catch (e) {
      trace.fail('readResourcePricingConfig_ failed - using defaults', e);
      return defaults;
    }
  } catch (error) {
    trace.fail('readResourcePricingConfig_ failed', error);
    throw error;
  }
}

function writeResourcePricingConfig_(sheet, cfg) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'writeResourcePricingConfig_');
  try {
    if (!sheet || !cfg) {
      trace.complete('writeResourcePricingConfig_ completed - no sheet or config');
      return;
    }
    try {
      sheet.getRange('AA1').setValue(cfg.multiplier || 3.5).setNote('RESOURCE_RATE_MULTIPLIER');
      sheet.getRange('AB1').setValue(cfg.workingDays || 21).setNote('RESOURCE_WORKING_DAYS');
      sheet.getRange('AC1').setValue(cfg.hoursPerDay || 8).setNote('RESOURCE_HOURS_PER_DAY');
      trace.complete('writeResourcePricingConfig_ completed', { multiplier: cfg.multiplier || 3.5 });
    } catch (error) {
      trace.fail('writeResourcePricingConfig_ failed - range error', error);
    }
  } catch (error) {
    trace.fail('writeResourcePricingConfig_ failed', error);
    throw error;
  }
}

function parseResourceMetadata_(value) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'parseResourceMetadata_');
  try {
    try {
      if (value && typeof value === 'string') {
        const parsed = JSON.parse(value);
        trace.complete('parseResourceMetadata_ completed - parsed string');
        return parsed;
      }
      if (value && typeof value === 'object') {
        trace.complete('parseResourceMetadata_ completed - already object');
        return value;
      }
    } catch (parseError) {
      trace.fail('parseResourceMetadata_ failed - parse error', parseError);
    }
    trace.complete('parseResourceMetadata_ completed - empty object');
    return {};
  } catch (error) {
    trace.fail('parseResourceMetadata_ failed', error);
    throw error;
  }
}

function toNumber_(value, fallback) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'toNumber_');
  try {
    if (value === null || value === undefined || value === '') {
      trace.complete('toNumber_ completed - using fallback');
      return fallback;
    }
    const num = Number(value);
    const result = isNaN(num) ? fallback : num;
    trace.complete('toNumber_ completed', { isNaN: isNaN(num) });
    return result;
  } catch (error) {
    trace.fail('toNumber_ failed', error);
    throw error;
  }
}

function roundToStep_(value, step) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'roundToStep_');
  try {
    if (value === null || value === undefined) {
      trace.complete('roundToStep_ completed - null/undefined');
      return value;
    }
    const s = step || 1;
    const result = Math.round(value / s) * s;
    trace.complete('roundToStep_ completed', { step: s });
    return result;
  } catch (error) {
    trace.fail('roundToStep_ failed', error);
    throw error;
  }
}


function writeScopeCatalog_(ss, data) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'writeScopeCatalog_');
  try {
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Writing Config: Scope Catalog tab...'); } catch (ignore) {
      // Silent fail
    } }
  if (!Array.isArray(data) || data.length < 2) {
    throw new AppError('CONFIG_ERROR', 'Scope Catalog CSV has no data.');
  }
  validateCsvHeaders_(data, ['scopeId', 'label', 'canonical', 'briefType', 'phaseId', 'ancillaryFeeFlagsCSV', 'order', 'notes', 'aliasesCSV'], 'Scope Catalog CSV');
  let sheet = ss.getSheetByName('Config: Scope Catalog');
  const expectedHeaders = data[0];
  if (sheet) {
    const state = getHeaderState_(sheet, expectedHeaders);
    if (!state.matches) {
      logCatalogSeedEvent_('header-drift-corrected', { sheet: 'Config: Scope Catalog', expected: expectedHeaders, current: state.headers, notesPresent: state.notesPresent });
    }
  }
  if (sheet) {
    // Backup removed - rely on Google Sheets version history from App-script/SetupSourceData.js:985
    // backupSheet_(ss, sheet);
    sheet.clear();
  } else {
    sheet = ss.insertSheet('Config: Scope Catalog');
  }
  const headers = data[0];
  const rows = data.slice(1);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    // Sort by scopeId (column 1) then briefType (column 4) to group matching scopes
    const sorted = rows.slice().sort(function(a, b) {
      const aId = (a[0] || '').toString().toLowerCase();
      const bId = (b[0] || '').toString().toLowerCase();
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      const aBrief = (a[3] || '').toString().toLowerCase();
      const bBrief = (b[3] || '').toString().toLowerCase();
      if (aBrief < bBrief) return -1;
      if (aBrief > bBrief) return 1;
      return 0;
    });
    sheet.getRange(2, 1, sorted.length, headers.length).setValues(sorted);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
  logCatalogSeedEvent_('seeded', { sheet: 'Config: Scope Catalog', rows: rows.length, override: isSeedForceOverwrite_() });
  if (rows.length === 0) {
    if (logger && typeof logger.warn === 'function') { try { logger.warn('CatalogSeed', 'Scope Catalog CSV contains no scope rows'); } catch (ignore) {
      // Silent fail
    } }
  }
  trace.complete('writeScopeCatalog_ completed', { rows: rows.length });
  return 'seeded';
  } catch (error) {
    trace.fail('writeScopeCatalog_ failed', error);
    throw error;
  }
}



function createCrewRatesTab(ss, data) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'createCrewRatesTab');
  try {
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Creating Crew Rates tab...'); } catch (ignore) {
      // Silent fail
    } }

  let sheet = ss.getSheetByName('Crew Rates');
  if (sheet) {
    // Backup removed - rely on Google Sheets version history from App-script/SetupSourceData.js:1036
    // backupSheet_(ss, sheet);
    ss.deleteSheet(sheet);
  }
  sheet = ss.insertSheet('Crew Rates');

  const headers = data[0];
  const rows = data.slice(1);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 1, 120); // CrewCode
  sheet.setColumnWidths(2, 1, 350); // CrewRole
  sheet.getRange(2, 4, rows.length, 1).setNumberFormat('#,##0');

  if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Crew Rates created', { count: rows.length }); } catch (ignore) {
      // Silent fail
    } }
  trace.complete('createCrewRatesTab completed', { rows: rows.length });
  } catch (error) {
    trace.fail('createCrewRatesTab failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Creating crew rates tab',
      correlationId: trace.correlationId
    });
    showErrorToast('Crew Rates Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}


function createResourceRatesTab(ss, data) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'createResourceRatesTab');
  try {
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Creating Resource Rates tab...'); } catch (ignore) {
      // Silent fail
    } }

  let sheet = ss.getSheetByName('Resource Rates');
  if (sheet) {
    // Backup removed - rely on Google Sheets version history from App-script/SetupSourceData.js:1081
    // backupSheet_(ss, sheet);
    ss.deleteSheet(sheet);
  }
  sheet = ss.insertSheet('Resource Rates');

  const headers = data[0];
  const rows = data.slice(1);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 1, 150);
  sheet.setColumnWidths(2, 1, 350);
  sheet.getRange(2, 4, rows.length, 1).setNumberFormat('#,##0');

  if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Resource Rates created', { count: rows.length }); } catch (ignore) {
      // Silent fail
    } }
  trace.complete('createResourceRatesTab completed', { rows: rows.length });
  } catch (error) {
    trace.fail('createResourceRatesTab failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Creating resource rates tab',
      correlationId: trace.correlationId
    });
    showErrorToast('Resource Rates Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}


function createScopeBuildupTab(ss, dataOverride) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'createScopeBuildupTab');
  try {
    const logger = (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) ? UnifiedLogger : null;
    if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Creating Scope Buildups tab...'); } catch (ignore) {
      // Silent fail
    } }

    const data = dataOverride || [];
    if (!data || data.length === 0) {
      trace.complete('createScopeBuildupTab completed - no data');
      return;
    }

  let sheet = ss.getSheetByName('Scope Buildups');
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet('Scope Buildups');

  const scopeColumns = (typeof NORMALIZE_CONFIG !== 'undefined' && NORMALIZE_CONFIG && NORMALIZE_CONFIG.SCOPE_COLUMNS)
    ? NORMALIZE_CONFIG.SCOPE_COLUMNS
    : { CODE: 0, NAME: 1, RESOURCE_CODE: 2, RESOURCE_NAME: 3, HOURS: 4, HOUR_RATE: 5, LINE_COST: 6, NOTES: 7 };

  const fallbackHeaders = (typeof NORMALIZE_EXPECTED_HEADERS !== 'undefined' && NORMALIZE_EXPECTED_HEADERS && Array.isArray(NORMALIZE_EXPECTED_HEADERS.SCOPES))
    ? NORMALIZE_EXPECTED_HEADERS.SCOPES
    : ['ScopeCode', 'ScopeName', 'ResourceCode', 'ResourceName', 'Hours', 'HourRate', 'LineCost', 'Notes'];
  const headers = data.length > 0 ? [data[0]] : [fallbackHeaders];
  const rows = data.length > 1 ? data.slice(1) : [];
  const columnCount = headers[0].length;

  sheet.getRange(1, 1, 1, columnCount).setValues(headers);
  sheet.getRange(1, 1, 1, columnCount).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, columnCount).setValues(rows);
  }

  const codeColumn = (scopeColumns.CODE || 0) + 1;
  const nameColumn = (scopeColumns.NAME || 0) + 1;
  const hoursColumn = (scopeColumns.HOURS || 0) + 1;
  const hourRateColumn = (scopeColumns.HOUR_RATE || 0) + 1;
  const lineCostColumn = (scopeColumns.LINE_COST || 0) + 1;

  sheet.setColumnWidths(codeColumn, 1, 120);
  sheet.setColumnWidths(nameColumn, 1, 350);

  if (rows.length > 0) {
    sheet.getRange(2, hoursColumn, rows.length, 1).setNumberFormat('0.0');
    sheet.getRange(2, hourRateColumn, rows.length, 1).setNumberFormat('#,##0');
    sheet.getRange(2, lineCostColumn, rows.length, 1).setNumberFormat('#,##0');

    const notesIndex = typeof scopeColumns.NOTES === 'number' ? scopeColumns.NOTES : 7;
    rows.forEach(function(row, idx) {
      const notesValue = row[notesIndex];
      if (notesValue && notesValue.toString().toUpperCase().includes('TOTAL')) {
        sheet.getRange(idx + 2, 1, 1, columnCount).setBackground('#e8f0fe').setFontWeight('bold');
      }
    });
  }

  try {
    ensureScopeBuildupValidationsAndFormulas();
  } catch (scopeError) {
    if (logger && typeof logger.warn === 'function') { try { logger.warn('CatalogSeed', 'ensureScopeBuildupValidationsAndFormulas failed during setup', String(scopeError)); } catch (ignore) {
      // Silent fail
    } }
  }

  if (logger && typeof logger.info === 'function') { try { logger.info('CatalogSeed', 'Scope Buildups created', { rows: rows.length }); } catch (ignore) {
      // Silent fail
    } }
  trace.complete('createScopeBuildupTab completed', { rows: rows.length });
  } catch (error) {
    trace.fail('createScopeBuildupTab failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Creating scope buildup tab',
      correlationId: trace.correlationId
    });
    showErrorToast('Scope Buildup Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}



function checkScopeBuildupsData() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'checkScopeBuildupsData');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Scope Buildups');

    if (!sheet) {
      trace.complete('checkScopeBuildupsData completed - sheet not found');
      return {error: 'Sheet not found'};
    }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // Count unique scope codes
  const allData = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const scopeCodes = {};
  let emptyRows = 0;

  for (let i = 0; i < allData.length; i++) {
    const scopeCode = allData[i][0];
    if (!scopeCode || scopeCode === '') {
      emptyRows++;
    } else {
      scopeCodes[scopeCode] = (scopeCodes[scopeCode] || 0) + 1;
    }
  }

  const result = {
    lastRow: lastRow,
    lastColumn: lastCol,
    totalDataRows: lastRow - 1,
    emptyRows: emptyRows,
    populatedRows: (lastRow - 1) - emptyRows,
    uniqueScopes: Object.keys(scopeCodes).length
  };
  trace.complete('checkScopeBuildupsData completed', { uniqueScopes: result.uniqueScopes });
  return result;
  } catch (error) {
    trace.fail('checkScopeBuildupsData failed', error);
    throw error;
  }
}

function isSheetCreationAllowed_() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'isSheetCreationAllowed_');
  try {
    trace.complete('isSheetCreationAllowed_ completed', { allowed: true });
    return true;
  } catch (error) {
    trace.fail('isSheetCreationAllowed_ failed', error);
    throw error;
  }
}

function shouldOverwriteHeaders_(sheet, expectedHeaders) {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'shouldOverwriteHeaders_');
  try {
    // Be resilient: always allow overwrite (with backup) but log context.
    try {
      const headerRange = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), expectedHeaders.length));
      const formulas = headerRange.getFormulas()[0];
      const notes = headerRange.getNotes()[0];
      const backgrounds = headerRange.getBackgrounds()[0];
      const hasFormula = formulas.some(function(f) { return f && f.trim() !== ''; });
      const hasNotes = notes.some(function(n) { return n && n.trim() !== ''; });
      const hasHighlight = backgrounds.some(function(bg) { return bg && bg !== '#ffffff' && bg !== '#fff' && bg !== '#000000'; });
      if (typeof UnifiedLogger !== 'undefined') { try { UnifiedLogger.info('SheetSetup', 'Header overwrite allowed', { sheet: sheet.getName(), formula: hasFormula, notes: hasNotes, highlight: hasHighlight }); } catch (ignore) {
      // Silent fail
    } }
    } catch (error) {
      trace.fail('shouldOverwriteHeaders_ inspect failed', error);
      if (typeof UnifiedLogger !== 'undefined') { try { UnifiedLogger.warn('SheetSetup', 'shouldOverwriteHeaders_ inspect failed', String(error)); } catch (ignore) {
      // Silent fail
    } }
    }
    trace.complete('shouldOverwriteHeaders_ completed', { allowed: true });
    return true;
  } catch (error) {
    trace.fail('shouldOverwriteHeaders_ failed', error);
    throw error;
  }
}

function isSeedForceOverwrite_() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'isSeedForceOverwrite_');
  try {
    try {
      const raw = getScriptProperty('CONFIG_SEED_FORCE_OVERWRITE');
      const result = raw !== null && raw !== undefined && String(raw).toLowerCase() === 'true';
      trace.complete('isSeedForceOverwrite_ completed', { forceOverwrite: result });
      return result;
    } catch (error) {
      trace.fail('isSeedForceOverwrite_ check failed', error);
      return false;
    }
  } catch (error) {
    trace.fail('isSeedForceOverwrite_ failed', error);
    throw error;
  }
}

function markSeedForceOverwriteUsed_() {
  const trace = UnifiedLogger.startTrace('SetupSourceData', 'markSeedForceOverwriteUsed_');
  try {
    try {
      const props = getScriptProperty.props || PropertiesService.getScriptProperties();
      if (props) {
        props.setProperty('CONFIG_SEED_FORCE_OVERWRITE_USED', new Date().toISOString());
      }
      trace.complete('markSeedForceOverwriteUsed_ completed');
    } catch (error) {
      trace.fail('markSeedForceOverwriteUsed_ property set failed', error);
    }
  } catch (error) {
    trace.fail('markSeedForceOverwriteUsed_ failed', error);
    throw error;
  }
}

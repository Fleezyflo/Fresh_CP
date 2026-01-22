/**
 * Data Normalization Script for Xero Integration - FIXED VERSION
 *
 * This script normalizes multi-row Scope Buildups into single-row Xero-compatible format
 *
 * Source Tab:
 * - "Scope Buildups" - Multi-row scope breakdowns → normalized to XERO_READY
 *
 * Lookup Table (not a normalization source):
 * - "Config: Resource Catalog" - Resource rates referenced by Scope Buildups (not synced to Xero)
 *
 * Output Tab:
 * - "XERO_READY" - Normalized one-row-per-scope format
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const NORMALIZE_LOG_CATEGORY = 'NormalizeData';

// Module-level cache for prefix metadata (60-minute TTL)
let cachedPrefixMetadata_ = null;
let prefixMetadataLoadTime_ = null;
const PREFIX_METADATA_CACHE_TTL = 60 * 60 * 1000; // 60 minutes

const NORMALIZE_CONFIG = {
  // Source sheet tab names
  SOURCE_TABS: {
    SCOPES: 'Scope Buildups'
  },

  // Output tab
  OUTPUT_TAB: 'XERO_READY',

  // Scope Buildups structure
  SCOPE_COLUMNS: {
    CODE: 0,           // A: ScopeCode
    NAME: 1,           // B: ScopeName
    RESOURCE_CODE: 2,  // C: ResourceCode
    RESOURCE_NAME: 3,  // D: ResourceName
    HOURS: 4,          // E: Hours
    HOUR_RATE: 5,      // F: HourRate
    LINE_COST: 6,      // G: LineCost
    NOTES: 7           // H: Notes
  },

  // Default account codes (UAE standard)
  DEFAULT_SALES_ACCOUNT: '400',     // Revenue
  DEFAULT_PURCHASE_ACCOUNT: '310',  // Cost of Sales

  // Cost calculation method
  COST_CALC_METHOD: 'MARGIN',  // 'MARGIN', 'SUM', or 'MANUAL'
  DEFAULT_MARGIN: 0.35,        // 35% margin (cost = sell * 0.65)

  LOG_ENABLED: true
};

const NORMALIZE_EXPECTED_HEADERS = {
  SCOPES: ['Scope Code', 'Scope Name', 'Resource Code', 'Resource Name', 'Hours', 'Hour Rate', 'Line Cost', 'Notes']
};

function validateNormalizeConfigAlignment_() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'validateNormalizeConfigAlignment_');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('validateNormalizeConfigAlignment_ failed - no spreadsheet', new Error('No active spreadsheet'));
      throw new AppError('CONFIG_ERROR', 'Active spreadsheet unavailable for normalization.');
    }
  const checks = [
    { sheetName: NORMALIZE_CONFIG.SOURCE_TABS.SCOPES, columns: NORMALIZE_CONFIG.SCOPE_COLUMNS, headers: NORMALIZE_EXPECTED_HEADERS.SCOPES }
  ];
  checks.forEach(function(check) {
    const sheet = ss.getSheetByName(check.sheetName);
    if (!sheet) {
      throw new AppError('CONFIG_SCHEMA', 'Missing source tab: ' + check.sheetName);
    }
    const lastColumn = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) { return (value === null || typeof value === 'undefined') ? '' : String(value).trim(); });
    const maxIndex = Math.max.apply(null, Object.keys(check.columns).map(function(key) { return check.columns[key]; }));
    if (maxIndex >= lastColumn) {
      throw new AppError('CONFIG_SCHEMA', 'Column map index ' + maxIndex + ' exceeds columns in ' + check.sheetName + ' (found ' + lastColumn + ').');
    }
    if (Array.isArray(check.headers) && check.headers.length) {
      check.headers.forEach(function(expectedHeader, idx) {
        const actual = headers[idx] || '';
        if (actual.toLowerCase() !== expectedHeader.toLowerCase()) {
          throw new AppError('CONFIG_SCHEMA', 'Header mismatch in ' + check.sheetName + ' column ' + (idx + 1) + ': expected "' + expectedHeader + '", found "' + actual + '".');
        }
      });
    }
  });
  trace.complete('validateNormalizeConfigAlignment_ completed');
  } catch (error) {
    trace.fail('validateNormalizeConfigAlignment_ failed', error);
    throw error;
  }
}

function computeHash_(value) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'computeHash_');
  try {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(value));
    const hash = digest.map(function(byte) { return ('0' + (byte & 0xff).toString(16)).slice(-2); }).join('');
    trace.complete('computeHash_ completed', { hashLength: hash.length });
    return hash;
  } catch (error) {
    trace.fail('computeHash_ failed - using timestamp', error);
    try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'computeHash_ failed', String(error)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    return String(new Date().getTime());
  }
}

function verifyXeroReadyIntegrity_(sheet, expectedCount, items) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'verifyXeroReadyIntegrity_');
  try {
    const lastRow = sheet.getLastRow();
    const actualCount = lastRow > 1 ? lastRow - 1 : 0;
  if (actualCount !== expectedCount) {
    throw new AppError('VALIDATION_ERROR', 'XERO_READY row count mismatch. Expected ' + expectedCount + ', found ' + actualCount + '.');
  }
  const values = actualCount > 0 ? sheet.getRange(2, 1, actualCount, Math.min(sheet.getLastColumn(), 12)).getValues() : [];
  const hash = computeHash_(values);
  let previous = null;
  try {
    previous = {
      rows: getScriptProperty('XERO_READY_ROW_COUNT'),
      hash: getScriptProperty('XERO_READY_HASH')
    };
  } catch (error) {
    try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'verifyXeroReadyIntegrity_ read props failed', String(error)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
  }
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      props.setProperties({
        XERO_READY_ROW_COUNT: String(actualCount),
        XERO_READY_HASH: hash,
        XERO_READY_LAST_UPDATED: new Date().toISOString()
      }, false); // false = merge with existing properties, don't delete others
    }
  } catch (e) {
    try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'verifyXeroReadyIntegrity_ props failed', String(e)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
  }
  if (previous && previous.hash && previous.hash !== hash) {
    try { UnifiedLogger.info(NORMALIZE_LOG_CATEGORY, 'XERO_READY hash changed', { previousHash: previous.hash, previousRows: previous.rows, hash: hash, rows: actualCount }); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
  } else {
    try { UnifiedLogger.info(NORMALIZE_LOG_CATEGORY, 'XERO_READY integrity check passed', { rows: actualCount, hash: hash }); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
  }
  const result = {
    rows: actualCount,
    hash: hash,
    itemsHash: computeHash_(items || []),
    previousHash: previous && previous.hash ? previous.hash : null,
    previousRows: previous && previous.rows ? Number(previous.rows) : null
  };
  trace.complete('verifyXeroReadyIntegrity_ completed', { rows: actualCount });
  return result;
  } catch (error) {
    trace.fail('verifyXeroReadyIntegrity_ failed', error);
    throw error;
  }
}

function validateNormalizedItems_(items) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'validateNormalizedItems_');
  try {
    if (!Array.isArray(items)) {
      trace.fail('validateNormalizedItems_ failed - not array', new Error('Not array'));
      throw new AppError('VALIDATION_ERROR', 'Normalized items missing.');
    }
  items.forEach(function(item, idx) {
    if (!item || typeof item !== 'object') {
      throw new AppError('VALIDATION_ERROR', 'Invalid normalized item at index ' + idx);
    }
    ['sku', 'name', 'description', 'accountCode'].forEach(function(key) {
      if (item[key] === null || item[key] === undefined || item[key] === '') {
        throw new AppError('VALIDATION_ERROR', 'Missing ' + key + ' for normalized item at index ' + idx);
      }
    });
    ['sellPrice', 'costPrice'].forEach(function(key) {
      if (typeof item[key] !== 'number' || isNaN(item[key])) {
        throw new AppError('VALIDATION_ERROR', 'Invalid number for ' + key + ' on ' + item.sku);
      }
    });
  });
  trace.complete('validateNormalizedItems_ completed', { items: items.length });
  } catch (error) {
    trace.fail('validateNormalizedItems_ failed', error);
    throw error;
  }
}

/**
 * Load Config: Column Map from sheet
 * @return {Object} Key-value map from Config: Column Map sheet
 */
function loadColumnMap() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'loadColumnMap');
  try {
    if (typeof SheetConfigLoader === 'undefined' || !SheetConfigLoader || typeof SheetConfigLoader.load !== 'function') {
      throw new Error('SheetConfigLoader is unavailable');
    }

    // Load column map data from sheet (returns array of {key, value} objects)
    const columnMapArray = SheetConfigLoader.load('columnMap');

    // Convert array to key-value map
    const map = {};
    columnMapArray.forEach(function(row) {
      if (row && row.key) {
        map[row.key] = row.value;
      }
    });

    trace.complete('loadColumnMap completed', { entries: Object.keys(map).length });
    return map;
  } catch (error) {
    trace.fail('loadColumnMap failed', error);
    throw error;
  }
}

function applyNormalizeColumnMapOverrides() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'applyNormalizeColumnMapOverrides');
  try {
    const raiseConfigError = function(message) {
      if (typeof AppError !== 'undefined') {
        throw new AppError('CONFIG_SCHEMA', message);
      }
      throw new Error(message);
    };
    if (typeof loadColumnMap !== 'function') {
      raiseConfigError('Config: Column Map loader is unavailable.');
    }
    const map = loadColumnMap();
    if (!map || typeof map !== 'object') {
      raiseConfigError('Config: Column Map is missing or invalid.');
    }
    const missing = [];
    const resolveString = function(key) {
      if (!Object.prototype.hasOwnProperty.call(map, key) || map[key] === '') {
        missing.push(key);
        return '';
      }
      return String(map[key]).trim();
    };
    const resolveNumber = function(key) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) {
        missing.push(key);
        return null;
      }
      const parsed = parseInt(map[key], 10);
      if (!isNumeric(parsed)) {
        raiseConfigError('Config: Column Map entry for ' + key + ' must be a number.');
      }
      return parsed;
    };
    NORMALIZE_CONFIG.SOURCE_TABS.SCOPES = resolveString('SOURCE_TABS.SCOPES');
    NORMALIZE_CONFIG.OUTPUT_TAB = resolveString('OUTPUT_TAB');

    Object.keys(NORMALIZE_CONFIG.SCOPE_COLUMNS).forEach(function(key) {
      NORMALIZE_CONFIG.SCOPE_COLUMNS[key] = resolveNumber('SCOPE_COLUMNS.' + key);
    });

    if (missing.length) {
      raiseConfigError('Config: Column Map missing entries: ' + missing.join(', '));
    }
    trace.complete('applyNormalizeColumnMapOverrides completed');
  } catch (error) {
    trace.fail('applyNormalizeColumnMapOverrides failed', error);
    try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'applyNormalizeColumnMapOverrides failed', String(error)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    throw error;
  }
}

// ============================================================================
// NOTE: onOpen() is now in Code.gs - DO NOT add it here
// ============================================================================

// ============================================================================
// MAIN NORMALIZATION FUNCTION
// ============================================================================

/**
 * Normalize all data from source tabs into XERO_READY tab
 */
function normalizeAllData() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'normalizeAllData');
  try {
    const startTime = new Date();
    log('=== Starting Data Normalization (FIXED) ===');
    applyNormalizeColumnMapOverrides();
    validateNormalizeConfigAlignment_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Get or create XERO_READY tab
    let xeroReadySheet = ss.getSheetByName(NORMALIZE_CONFIG.OUTPUT_TAB);

    if (!xeroReadySheet) {
      xeroReadySheet = ss.insertSheet(NORMALIZE_CONFIG.OUTPUT_TAB);
    } else {
      // Clear existing data (keep headers)
      const lastRow = xeroReadySheet.getLastRow();
      if (lastRow > 1) {
        try {
          // Try to delete rows (more efficient, but fails if trying to delete all non-frozen rows)
          const maxRows = xeroReadySheet.getMaxRows();
          const rowsToDelete = lastRow - 1;

          // Google Sheets doesn't allow deleting ALL non-frozen rows
          // If we're trying to delete all rows, use clearContent instead
          if (rowsToDelete >= maxRows - 1) {
            xeroReadySheet.getRange(2, 1, lastRow - 1, xeroReadySheet.getLastColumn()).clearContent();
          } else {
            xeroReadySheet.deleteRows(2, rowsToDelete);
          }
        } catch (deleteError) {
          // Fallback: Clear contents instead of deleting rows
          xeroReadySheet.getRange(2, 1, lastRow - 1, xeroReadySheet.getLastColumn()).clearContent();
        }
      }
    }

    // Setup headers if needed
    if (xeroReadySheet.getLastRow() === 0 || xeroReadySheet.getLastColumn() === 0) {
      setupXeroReadyHeaders(xeroReadySheet);
    }

    // Track stats
    const stats = {
      scopes: 0,
      total: 0,
      errors: 0
    };

    // Normalize Scopes only (multi-row → single row)
    log('Processing Scope Buildups...');
    const scopes = normalizeScopes(ss);
    stats.scopes = scopes.length;
    const allItems = scopes; // Only scopes go to XERO_READY now

    validateNormalizedItems_(allItems);

    // 4. Check for duplicate SKUs (FIXED: Added duplicate detection)
    log('Checking for duplicate SKUs...');
    const seenSkus = new Map(); // Map to track SKU -> itemType
    const duplicates = [];

    allItems.forEach(item => {
      if (seenSkus.has(item.sku)) {
        duplicates.push({
          sku: item.sku,
          sources: [seenSkus.get(item.sku), item.itemType]
        });
        log(`⚠️ DUPLICATE SKU: ${item.sku} found in ${seenSkus.get(item.sku)} and ${item.itemType}`);
      } else {
        seenSkus.set(item.sku, item.itemType);
      }
    });

    if (duplicates.length > 0) {
      const dupList = duplicates.map(d => `${d.sku} (${d.sources.join(' & ')})`).join(', ');
      throw new AppError('VALIDATION_ERROR', `❌ Duplicate SKUs found: ${dupList}. Each SKU must be unique across all sources.`);
    }

    log(`✅ No duplicate SKUs found. ${allItems.length} unique items.`);

    // 5. Write all items to XERO_READY
    writeToXeroReady(xeroReadySheet, allItems);
    if (typeof invalidateXeroLookupCache === 'function') {
      try {
        invalidateXeroLookupCache();
      } catch (cacheError) {
        try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'normalizeAllData failed to invalidate lookup cache', String(cacheError)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
      }
    }

    stats.total = stats.scopes;

    const duration = ((new Date() - startTime) / 1000).toFixed(2);
    log(`=== Normalization Complete in ${duration}s ===`);
    log(`Normalized ${stats.total} scope items`);

    // Sort by SKU (MUST sort before computing hash)
    sortXeroReadyTab(xeroReadySheet);

    // Verify integrity AFTER sorting (hash must match sorted data)
    stats.integrity = verifyXeroReadyIntegrity_(xeroReadySheet, stats.total, allItems);

    try {
      const props = getScriptProperty.props || PropertiesService.getScriptProperties();
      if (props) {
        props.setProperty('CATALOG_LAST_UPDATED', new Date().toISOString());
      }
    } catch (e) {
      try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'Failed to update CATALOG_LAST_UPDATED', String(e)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    }

    trace.complete('normalizeAllData completed', { total: stats.total });
    return stats;

  } catch (error) {
    trace.fail('normalizeAllData failed', error);
    log(`ERROR: ${error.message}`);
    log(error.stack);
    const userError = createUserFriendlyError(error, {
      operation: 'Normalizing data',
      correlationId: trace.correlationId
    });
    showErrorToast('Normalization Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

// ============================================================================
// SCOPE NORMALIZATION (Multi-Row → Single Row)
// ============================================================================

/**
 * Normalize multi-row scope buildups into single rows
 */
function normalizeScopes(ss) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'normalizeScopes');
  try {
    const scopeSheet = ss.getSheetByName(NORMALIZE_CONFIG.SOURCE_TABS.SCOPES);

    if (!scopeSheet) {
      log('⚠️ Scope Buildups tab not found, skipping scopes');
      trace.complete('normalizeScopes completed - no sheet', { count: 0 });
      return [];
    }

  const data = (scopeSheet.getLastRow() > 0 ? scopeSheet.getRange(1, 1, scopeSheet.getLastRow(), Math.max(scopeSheet.getLastColumn(), 1)).getValues() : []);
  const headers = data[0];
  const rows = data.slice(1); // Skip header

  // Group rows by scope code
  const scopeGroups = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const scopeCode = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE];

    if (!scopeCode || !isNonEmptyString(String(scopeCode))) {
      continue; // Skip empty rows
    }

    if (!scopeGroups[scopeCode]) {
      scopeGroups[scopeCode] = {
        code: scopeCode,
        name: row[NORMALIZE_CONFIG.SCOPE_COLUMNS.NAME],
        resourceLines: [],
        total: 0
      };
    }

    // Check if this is the TOTAL row
    const lineCost = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST];
    const resourceCode = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE];
    const notes = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.NOTES];

    if (!resourceCode && notes && notes.toString().toUpperCase().includes('TOTAL')) {
      // This is the TOTAL row
      scopeGroups[scopeCode].total = parseFloat(lineCost) || 0;
    } else if (resourceCode) {
      // This is a resource line
      scopeGroups[scopeCode].resourceLines.push({
        resourceCode: resourceCode,
        resourceName: row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME],
        hours: parseFloat(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOURS]) || 0,
        rate: parseFloat(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE]) || 0,
        cost: parseFloat(lineCost) || 0,
        notes: notes
      });
    }
  }

  // Convert grouped scopes to normalized format
  const normalizedScopes = [];

  for (const scopeCode in scopeGroups) {
    const scope = scopeGroups[scopeCode];

    // Calculate cost
    let costPrice = 0;
    if (NORMALIZE_CONFIG.COST_CALC_METHOD === 'SUM') {
      // Sum all resource line costs
      costPrice = scope.resourceLines.reduce((sum, line) => sum + line.cost, 0);
    } else if (NORMALIZE_CONFIG.COST_CALC_METHOD === 'MARGIN') {
      // Calculate from margin
      costPrice = scope.total * (1 - NORMALIZE_CONFIG.DEFAULT_MARGIN);
    }

    // Determine category from scope code prefix
    const category = getScopeCategoryFromCode(scopeCode);

    // Build description
    const description = buildScopeDescription(scope);

    normalizedScopes.push({
      sku: scopeCode,
      name: scope.name,
      description: description,
      sellPrice: scope.total,
      costPrice: Math.round(costPrice), // Round to nearest AED
      accountCode: NORMALIZE_CONFIG.DEFAULT_SALES_ACCOUNT,
      purchaseAccount: NORMALIZE_CONFIG.DEFAULT_PURCHASE_ACCOUNT,
      category: category,
      status: 'Active',
      itemType: 'Scope'
    });
  }

  log(`Normalized ${normalizedScopes.length} scopes`);
  trace.complete('normalizeScopes completed', { count: normalizedScopes.length });
  return normalizedScopes;
  } catch (error) {
    trace.fail('normalizeScopes failed', error);
    throw error;
  }
}

/**
 * Get all prefix metadata with module-level caching
 * Returns: {briefType: {prefix: {category, phaseHint}}}
 * Cache TTL: 60 minutes
 * @private
 */
function getAllPrefixMetadata_() {
  const now = new Date().getTime();

  // Return cached if fresh
  if (cachedPrefixMetadata_ && prefixMetadataLoadTime_ && (now - prefixMetadataLoadTime_) < PREFIX_METADATA_CACHE_TTL) {
    return cachedPrefixMetadata_;
  }

  // Load fresh data
  const index = {};
  try {
    if (typeof SheetConfigLoader !== 'undefined' && typeof SheetConfigLoader.load === 'function') {
      const catalogPrefixes = SheetConfigLoader.load('catalogPrefixes');
      if (Array.isArray(catalogPrefixes)) {
        catalogPrefixes.forEach(function(row) {
          if (!row || !row.prefix || row.active === false) {
            return; // Skip inactive or invalid rows
          }

          // Option A (strict): Skip rows without briefType
          if (!row.briefType) {
            return; // No wildcard fallback - sheet data has briefType for all rows
          }

          const briefType = row.briefType; // No '*' fallback
          if (!index[briefType]) {
            index[briefType] = {};
          }

          index[briefType][row.prefix] = {
            category: row.prefixCategory || null,
            phaseHint: row.categoryPhaseHint || null
          };
        });
      }
    }
  } catch (error) {
    console.error('[NormalizeData] getAllPrefixMetadata_ failed:', error);
  }

  cachedPrefixMetadata_ = index;
  prefixMetadataLoadTime_ = now;
  return index;
}

/**
 * Get prefix metadata from Config: Catalog Prefixes (uses internal cache)
 * Returns {category, phaseHint} or null
 */
function getScopePrefixMetadata(code, briefType) {
  // NO TRACE LOGGING - called too frequently
  try {
    // Extract prefix from scope code
    // Expected format: PREFIX-NUMBER (e.g., "STR-001")
    // Returns null if code has no dash separator
    const prefix = code.split('-')[0];
    if (!prefix) {
      return null;
    }

    const prefixWithDash = prefix + '-';
    const allMetadata = getAllPrefixMetadata_();

    // Prefer briefType match, fallback to any active prefix
    let metadata = null;
    if (briefType && allMetadata[briefType] && allMetadata[briefType][prefixWithDash]) {
      metadata = allMetadata[briefType][prefixWithDash];
    } else {
      // Fallback: search all briefTypes for this prefix
      for (let bt in allMetadata) {
        if (allMetadata[bt][prefixWithDash]) {
          metadata = allMetadata[bt][prefixWithDash];
          break;
        }
      }
    }

    return metadata;
  } catch (error) {
    console.error('[NormalizeData] getScopePrefixMetadata failed:', error);
    return null;
  }
}

/**
 * Get category from scope code prefix
 * Loads from Config: Catalog Prefixes sheet
 */
function getScopeCategoryFromCode(code) {
  // NO TRACE LOGGING - called too frequently during scope processing
  const metadata = getScopePrefixMetadata(code);
  return (metadata && metadata.category) || 'Other';
}

/**
 * Build scope description from resource lines
 */
function buildScopeDescription(scope) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'buildScopeDescription');
  try {
    if (scope.resourceLines.length === 0) {
      trace.complete('buildScopeDescription completed - no resources');
      return scope.name;
    }

  // Build summary of team involved
  const resourceNames = scope.resourceLines.map(line => line.resourceName);
  const uniqueNames = uniqueBy(resourceNames, function(name) { return name; });
  const teamSummary = uniqueNames.slice(0, 3).join(', ');

  const description = `${scope.name} - Includes ${teamSummary}`;
  trace.complete('buildScopeDescription completed', { resources: scope.resourceLines.length });
  return description;
  } catch (error) {
    trace.fail('buildScopeDescription failed', error);
    throw error;
  }
}

/**
 * Inspect the Scope Buildups sheet structure and provide column metadata and sample scope previews.
 * @param {number} [previewLimit=3] number of scope previews to include
 * @return {Object} diagnostic summary describing the sheet layout
 */
function inspectScopeBuildupsStructure(previewLimit) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'inspectScopeBuildupsStructure');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('inspectScopeBuildupsStructure failed - no spreadsheet', new Error('No active spreadsheet'));
      throw new AppError('SHEET_ACCESS', 'No active spreadsheet available.');
    }
  const sheetName = NORMALIZE_CONFIG.SOURCE_TABS.SCOPES;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError('SHEET_MISSING', `Scope Buildups sheet "${sheetName}" not found.`);
  }

  const values = (sheet.getLastRow() > 0 ? sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), 1)).getValues() : []);
  if (!values || values.length <= 1) {
    return {
      sheet: sheetName,
      totalRows: 0,
      uniqueScopes: 0,
      columns: [],
      scopePreview: []
    };
  }

  const headers = values[0].map(header => header !== undefined && header !== null ? String(header).trim() : '');
  const dataRows = values.slice(1);
  const expectedByIndex = {};
  const friendlyNames = {
    CODE: 'Scope Code (SKU)',
    NAME: 'Scope Name',
    RESOURCE_CODE: 'Resource Code',
    RESOURCE_NAME: 'Resource Name',
    HOURS: 'Allocated Hours',
    HOUR_RATE: 'Hourly Rate',
    LINE_COST: 'Line Cost',
    NOTES: 'Notes / Flags'
  };

  Object.keys(NORMALIZE_CONFIG.SCOPE_COLUMNS).forEach(key => {
    const columnIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS[key];
    expectedByIndex[columnIndex] = friendlyNames[key] || key;
  });

  const columnSummaries = headers.map((header, idx) => {
    let nonEmpty = 0;
    let numericCount = 0;
    const distinctSamples = [];
    const seenSamples = new Set();

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const cell = dataRows[rowIndex][idx];
      if (cell === null || cell === undefined || cell === '') {
        continue;
      }
      nonEmpty += 1;
      if (typeof cell === 'number' && !isNaN(cell)) {
        numericCount += 1;
      }
      if (distinctSamples.length < 5) {
        const sampleValue = typeof cell === 'string' ? cell.trim() : cell;
        const sampleKey = String(sampleValue);
        if (!seenSamples.has(sampleKey)) {
          distinctSamples.push(sampleValue);
          seenSamples.add(sampleKey);
        }
      }
    }

    const rangeLabel = sheet.getRange(1, idx + 1).getA1Notation().replace(/[0-9]/g, '');

    return {
      index: idx + 1,
      column: rangeLabel,
      header: header || '(blank)',
      expected: expectedByIndex[idx] || null,
      nonEmptyRows: nonEmpty,
      numericValues: numericCount,
      sampleValues: distinctSamples
    };
  });

  const scopeIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE;
  const nameIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.NAME;
  const resourceCodeIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE;
  const resourceNameIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME;
  const hoursIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.HOURS;
  const rateIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE;
  const lineCostIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST;
  const notesIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.NOTES;

  const scopes = {};

  dataRows.forEach((row, offset) => {
    const scopeCode = row[scopeIndex];
    if (!scopeCode || !isNonEmptyString(String(scopeCode))) {
      return;
    }
    const normalizedCode = String(scopeCode).trim();
    if (!scopes[normalizedCode]) {
      scopes[normalizedCode] = {
        code: normalizedCode,
        name: row[nameIndex] || '',
        rowCount: 0,
        totalHours: 0,
        totalSell: 0,
        hasTotalRow: false,
        resources: []
      };
    }
    const scopeEntry = scopes[normalizedCode];
    scopeEntry.rowCount += 1;

    const resourceCode = row[resourceCodeIndex];
    const lineCost = parseFloat(row[lineCostIndex]) || 0;
    const hours = parseFloat(row[hoursIndex]) || 0;
    const notes = row[notesIndex];
    const rate = parseFloat(row[rateIndex]) || 0;

    if (resourceCode && isNonEmptyString(String(resourceCode))) {
      scopeEntry.resources.push({
        resourceCode: String(resourceCode).trim(),
        resourceName: row[resourceNameIndex] || '',
        hours: hours,
        hourlyRate: rate,
        cost: lineCost
      });
      scopeEntry.totalHours += hours;
    } else if (notes && String(notes).toUpperCase().indexOf('TOTAL') !== -1) {
      scopeEntry.hasTotalRow = true;
      scopeEntry.totalSell = lineCost || scopeEntry.totalSell;
    }
  });

  const previewCount = typeof previewLimit === 'number' && previewLimit > 0 ? Math.floor(previewLimit) : 3;

  const previewScopes = Object.values(scopes)
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(0, Math.max(1, previewCount))
    .map(scope => ({
      code: scope.code,
      name: scope.name,
      rowCount: scope.rowCount,
      resourceCount: scope.resources.length,
      totalHours: Math.round(scope.totalHours * 100) / 100,
      sellTotal: scope.totalSell,
      hasTotalRow: scope.hasTotalRow,
      topResources: scope.resources.slice(0, 5).map(line => ({
        resourceCode: line.resourceCode,
        resourceName: line.resourceName,
        hours: Math.round(line.hours * 100) / 100,
        hourlyRate: Math.round(line.hourlyRate * 100) / 100,
        cost: Math.round(line.cost * 100) / 100
      }))
    }));

  const scopesMissingTotals = Object.values(scopes).filter(scope => !scope.hasTotalRow).length;

  const summary = {
    sheet: sheetName,
    totalRows: dataRows.length,
    uniqueScopes: Object.keys(scopes).length,
    scopesMissingTotalRow: scopesMissingTotals,
    columns: columnSummaries,
    scopePreview: previewScopes
  };

  log(`Scope Buildups summary: ${summary.totalRows} rows, ${summary.uniqueScopes} scopes (${summary.scopesMissingTotalRow} missing totals)`);
  trace.complete('inspectScopeBuildupsStructure completed', { uniqueScopes: summary.uniqueScopes });
  return summary;
  } catch (error) {
    trace.fail('inspectScopeBuildupsStructure failed', error);
    throw error;
  }
}

/**
 * Build an LLM-friendly catalog of scope breakdowns with resource detail and rate benchmarks.
 * @param {number} [scopeLimit=50] Maximum scopes to include
 * @return {Object} payload containing scopes and metadata for downstream processing
 */
function buildScopeCatalogForLLM(scopeLimit, scopeCodes) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'buildScopeCatalogForLLM');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('buildScopeCatalogForLLM failed - no spreadsheet', new Error('No active spreadsheet'));
      throw new AppError('SHEET_ACCESS', 'No active spreadsheet available.');
    }

  const scopeSheet = ss.getSheetByName(NORMALIZE_CONFIG.SOURCE_TABS.SCOPES);
  if (!scopeSheet) {
    throw new AppError('SHEET_MISSING', `Scope Buildups sheet "${NORMALIZE_CONFIG.SOURCE_TABS.SCOPES}" not found.`);
  }
  const crewSheet = ss.getSheetByName(NORMALIZE_CONFIG.SOURCE_TABS.CREW);
  const resourceSheet = ss.getSheetByName(NORMALIZE_CONFIG.SOURCE_TABS.RESOURCES);

  const scopeData = (scopeSheet.getLastRow() > 0 ? scopeSheet.getRange(1, 1, scopeSheet.getLastRow(), Math.max(scopeSheet.getLastColumn(), 1)).getValues() : []);
  if (!scopeData || scopeData.length <= 1) {
    return { scopes: [], benchmarks: { crew: [], resources: [] } };
  }
  const scopeRows = scopeData.slice(1);
  const scopeGroups = groupScopeRows(scopeRows);

  const crewBenchmarks = crewSheet ? (crewSheet.getLastRow() > 0 ? crewSheet.getRange(1, 1, crewSheet.getLastRow(), Math.max(crewSheet.getLastColumn(), 1)).getValues() : []).slice(1)
    .filter(row => row[NORMALIZE_CONFIG.CREW_COLUMNS.CODE])
    .map(row => ({
      code: String(row[NORMALIZE_CONFIG.CREW_COLUMNS.CODE]).trim(),
      name: row[NORMALIZE_CONFIG.CREW_COLUMNS.ROLE] || '',
      rate: toNumber(row[NORMALIZE_CONFIG.CREW_COLUMNS.RATE], 0),
      department: row[NORMALIZE_CONFIG.CREW_COLUMNS.DEPARTMENT] || '',
      notes: row[NORMALIZE_CONFIG.CREW_COLUMNS.NOTES] || ''
    })) : [];

  const resourceBenchmarks = resourceSheet ? (resourceSheet.getLastRow() > 0 ? resourceSheet.getRange(1, 1, resourceSheet.getLastRow(), Math.max(resourceSheet.getLastColumn(), 1)).getValues() : []).slice(1)
    .filter(row => row[NORMALIZE_CONFIG.RESOURCE_COLUMNS.CODE])
    .map(row => ({
      code: String(row[NORMALIZE_CONFIG.RESOURCE_COLUMNS.CODE]).trim(),
      name: row[NORMALIZE_CONFIG.RESOURCE_COLUMNS.NAME] || '',
      rate: toNumber(row[NORMALIZE_CONFIG.RESOURCE_COLUMNS.RATE], 0),
      category: row[NORMALIZE_CONFIG.RESOURCE_COLUMNS.CATEGORY] || '',
      source: row[NORMALIZE_CONFIG.RESOURCE_COLUMNS.SOURCE] || ''
    })) : [];

  const scopeEntries = Object.values(scopeGroups)
    .map(scope => scopeToLLMEntry(scope))
    .sort((a, b) => a.scopeCode.localeCompare(b.scopeCode));

  let selectedScopes;
  if (Array.isArray(scopeCodes) && scopeCodes.length > 0) {
    const normalizedCodes = scopeCodes.map(code => String(code).trim());
    const entryMap = scopeEntries.reduce((map, entry) => {
      map[entry.scopeCode] = entry;
      return map;
    }, {});
    const missing = [];
    selectedScopes = normalizedCodes.map(code => {
      const entry = entryMap[code];
      if (!entry) {
        missing.push(code);
        return null;
      }
      return entry;
    }).filter(Boolean);
    if (missing.length > 0) {
      throw new AppError('SCOPE_NOT_FOUND', 'Scope codes not found: ' + missing.join(', '));
    }
  } else {
    const limit = typeof scopeLimit === 'number' && scopeLimit > 0 ? Math.floor(scopeLimit) : 50;
    selectedScopes = scopeEntries.slice(0, limit);
  }

  const resourceSummary = summarizeRateBenchmarks(resourceBenchmarks, 'category');
  const crewSummary = summarizeRateBenchmarks(crewBenchmarks, 'department');

  return {
    generatedAt: new Date().toISOString(),
    scopeCount: selectedScopes.length,
    totalScopesAvailable: scopeEntries.length,
    context: {
      region: 'UAE/GCC',
      operatingCurrency: 'AED',
      agencyPositioning: 'hrmny is a premium creative and production agency delivering omnichannel campaigns for government entities, mega-events, and luxury brands across the region.',
      marginTarget: NORMALIZE_CONFIG.DEFAULT_MARGIN,
      pricingPrinciples: [
        'Maintain at least 35% blended gross margin with contingency for 20% cost overruns.',
        'Weekend, after-hours, and festival delivery windows require premium coverage for crew and coordination.',
        'Senior oversight is mandatory for enterprise and government programmes; pricing must reflect that expectation.'
      ],
      typicalClientExpectations: [
        'Flawless execution with contingency cover and multilingual support.',
        'Premium proposal storytelling while preserving internal resource transparency.',
        'Scalable delivery teams during peak festival periods without compromising quality or margin.'
      ]
    },
    scopes: selectedScopes,
    benchmarks: {
      crew: crewBenchmarks,
      resources: resourceBenchmarks,
      summary: {
        crew: crewSummary,
        resources: resourceSummary
      }
    }
  };
  trace.complete('buildScopeCatalogForLLM completed', { scopeCount: selectedScopes.length });
  return result;
  } catch (error) {
    trace.fail('buildScopeCatalogForLLM failed', error);
    throw error;
  }
}

function groupScopeRows(rows) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'groupScopeRows');
  try {
    const scopeIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE;
  const nameIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.NAME;
  const resourceCodeIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE;
  const resourceNameIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME;
  const hoursIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.HOURS;
  const rateIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE;
  const lineCostIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST;
  const notesIndex = NORMALIZE_CONFIG.SCOPE_COLUMNS.NOTES;

  const groups = {};

  rows.forEach(row => {
    const code = row[scopeIndex];
    if (!code || String(code).trim() === '') {
      return;
    }
    const normalizedCode = String(code).trim();
    if (!groups[normalizedCode]) {
      groups[normalizedCode] = {
        scopeCode: normalizedCode,
        scopeName: row[nameIndex] || '',
        totalSell: 0,
        resources: [],
        notes: []
      };
    }
    const group = groups[normalizedCode];
    const resourceCode = row[resourceCodeIndex];
    const notes = row[notesIndex];
    const lineCost = toNumber(row[lineCostIndex], 0);

    if (resourceCode && String(resourceCode).trim() !== '') {
      group.resources.push({
        resourceCode: String(resourceCode).trim(),
        resourceName: row[resourceNameIndex] || '',
        hours: toNumber(row[hoursIndex], 0),
        hourlyRate: toNumber(row[rateIndex], 0),
        lineCost: lineCost
      });
      if (notes && String(notes).trim()) {
        group.notes.push(String(notes).trim());
      }
    } else if (notes && String(notes).toUpperCase().indexOf('TOTAL') !== -1) {
      group.totalSell = lineCost;
    } else if (notes && String(notes).trim()) {
      group.notes.push(String(notes).trim());
    }
  });
  trace.complete('groupScopeRows completed', { groups: Object.keys(groups).length });
  return groups;
  } catch (error) {
    trace.fail('groupScopeRows failed', error);
    throw error;
  }
}

function scopeToLLMEntry(group) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'scopeToLLMEntry');
  try {
    const totalHours = group.resources.reduce((sum, entry) => sum + entry.hours, 0);
  const averageRate = group.resources.length > 0
    ? group.resources.reduce((sum, entry) => sum + entry.hourlyRate, 0) / group.resources.length
    : 0;
  const categoryLabel = getScopeCategoryFromCode(group.scopeCode) || 'General';

  const description = buildScopeDescription({
    name: group.scopeName,
    resourceLines: group.resources.map(entry => ({
      resourceName: entry.resourceName
    }))
  });

  const presentationBullets = [
    `Scope: ${group.scopeName}`,
    `Estimated Hours: ${Math.round(totalHours * 100) / 100}`,
    `Average Hourly Rate: ${Math.round(averageRate * 100) / 100} AED`,
    `Resources: ${filterTruthy(group.resources.map(entry => entry.resourceName)).join(', ')}`
  ].concat(group.notes || []);

  return {
    scopeCode: group.scopeCode,
    scopeName: group.scopeName,
    summary: description,
    presentation: presentationBullets.filter(Boolean),
    totalSell: Math.round(group.totalSell * 100) / 100,
    totalHours: Math.round(totalHours * 100) / 100,
    category: categoryLabel,
    resourceCount: group.resources.length,
    resources: group.resources.map(entry => ({
      resourceCode: entry.resourceCode,
      resourceName: entry.resourceName,
      hours: Math.round(entry.hours * 100) / 100,
      hourlyRate: Math.round(entry.hourlyRate * 100) / 100,
      lineCost: Math.round(entry.lineCost * 100) / 100
    }))
  };
  trace.complete('scopeToLLMEntry completed', { scopeCode: result.scopeCode });
  return result;
  } catch (error) {
    trace.fail('scopeToLLMEntry failed', error);
    throw error;
  }
}

function summarizeRateBenchmarks(entries, groupKey) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'summarizeRateBenchmarks');
  try {
    if (!entries || entries.length === 0) {
      trace.complete('summarizeRateBenchmarks completed - no entries');
      return [];
    }

  const groups = {};
  entries.forEach(entry => {
    const group = entry[groupKey] && String(entry[groupKey]).trim().length > 0
      ? String(entry[groupKey]).trim()
      : 'General';
    const rate = entry.rate !== undefined && entry.rate !== null ? Number(entry.rate) : NaN;
    if (isNaN(rate)) {
      return;
    }
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(rate);
  });

  const buildStats = rates => {
    const sorted = rates.slice().sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    return {
      count: sorted.length,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      average: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100
    };
  };

  const summaries = Object.keys(groups).map(group => {
    const stats = buildStats(groups[group]);
    return Object.assign({ group: group }, stats);
  }).sort((a, b) => a.group.localeCompare(b.group));

  const allRates = Object.values(groups).reduce((acc, rates) => acc.concat(rates), []);
  if (allRates.length > 0) {
    const overall = buildStats(allRates);
    summaries.unshift(Object.assign({ group: 'Overall' }, overall));
  }

  trace.complete('summarizeRateBenchmarks completed', { summaries: summaries.length });
  return summaries;
  } catch (error) {
    trace.fail('summarizeRateBenchmarks failed', error);
    throw error;
  }
}

const SCOPE_REVIEW_LOG_HEADERS = [
  'LogId',
  'Timestamp',
  'ScopeCount',
  'ScopeCodes',
  'Request_Part1',    // Split request JSON across 3 columns (49KB each)
  'Request_Part2',
  'Request_Part3',
  'Response_Part1',   // Split response JSON across 3 columns (49KB each)
  'Response_Part2',
  'Response_Part3',
  'ReviewerNotes',
  'AppliedAt',
  'AppliedBy'
];

function ensureScopeReviewLogSheet() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'ensureScopeReviewLogSheet');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('ensureScopeReviewLogSheet failed - no spreadsheet', new Error('No active spreadsheet'));
      throw new AppError('SHEET_ACCESS', 'No active spreadsheet available for scope review logging.');
    }
  let sheet = ss.getSheetByName('_LLM_SCOPE_LOG');
  if (!sheet) {
    sheet = ss.insertSheet('_LLM_SCOPE_LOG');
    sheet.hideSheet();
  }
  if (sheet.getMaxColumns() < SCOPE_REVIEW_LOG_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), SCOPE_REVIEW_LOG_HEADERS.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, SCOPE_REVIEW_LOG_HEADERS.length).setValues([SCOPE_REVIEW_LOG_HEADERS]);
  backfillScopeReviewLogSheet(sheet);
  trace.complete('ensureScopeReviewLogSheet completed');
  return sheet;
  } catch (error) {
    trace.fail('ensureScopeReviewLogSheet failed', error);
    throw error;
  }
}

function backfillScopeReviewLogSheet(sheet) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'backfillScopeReviewLogSheet');
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      trace.complete('backfillScopeReviewLogSheet completed - no rows');
      return;
    }
  const range = sheet.getRange(2, 1, lastRow - 1, SCOPE_REVIEW_LOG_HEADERS.length);
  const values = range.getValues();
  let dirty = false;
  let highest = 0;
  for (let i = 0; i < values.length; i++) {
    const current = values[i][0];
    if (!current || !/^SR-\d+$/.test(current)) {
      highest += 1;
      values[i][0] = 'SR-' + String(highest).padStart(4, '0');
      dirty = true;
    } else {
      const parsed = parseInt(String(current).replace('SR-', ''), 10);
      if (!isNaN(parsed) && parsed > highest) {
        highest = parsed;
      }
    }
  }
  if (dirty) {
    range.setValues(values);
  }
  trace.complete('backfillScopeReviewLogSheet completed', { backfilled: dirty });
  } catch (error) {
    trace.fail('backfillScopeReviewLogSheet failed', error);
    throw error;
  }
}

function recordScopeReviewRun(requestPayload, responsePayload) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'recordScopeReviewRun');
  try {
    const sheet = ensureScopeReviewLogSheet();
    const timestamp = new Date().toISOString();
    const scopeList = Array.isArray(requestPayload && requestPayload.scopes)
      ? filterTruthy(requestPayload.scopes.map(scope => scope.scopeCode || ''))
      : [];

    // Split large JSON across 3 columns (49KB each = 147KB capacity)
    const requestJson = JSON.stringify(requestPayload || {});
    const responseJson = JSON.stringify(responsePayload || {});

    const requestChunks = splitJsonForSheet(requestJson);   // [part1, part2, part3]
    const responseChunks = splitJsonForSheet(responseJson); // [part1, part2, part3]

    const lastRow = sheet.getLastRow();
    let nextNumber = lastRow > 1
      ? parseInt(String(sheet.getRange(lastRow, 1).getValue() || '0').replace('SR-', ''), 10) + 1
      : 1;
    if (!isFinite(nextNumber)) {
      nextNumber = lastRow;
    }
    const logId = 'SR-' + String(nextNumber).padStart(4, '0');

    const rowValues = [
      logId,
      timestamp,
      scopeList.length,
      scopeList.join(', '),
      requestChunks[0],   // Request_Part1 (up to 49KB)
      requestChunks[1],   // Request_Part2 (up to 49KB)
      requestChunks[2],   // Request_Part3 (up to 49KB)
      responseChunks[0],  // Response_Part1 (up to 49KB)
      responseChunks[1],  // Response_Part2 (up to 49KB)
      responseChunks[2],  // Response_Part3 (up to 49KB)
      '',                 // ReviewerNotes
      '',                 // AppliedAt
      ''                  // AppliedBy
    ];

    const targetRow = sheet.getLastRow() + 1;
    sheet.getRange(targetRow, 1, 1, SCOPE_REVIEW_LOG_HEADERS.length).setValues([rowValues]);

    trace.complete('recordScopeReviewRun completed', { logId: logId });
    return logId;
  } catch (error) {
    trace.fail('recordScopeReviewRun failed', error);
    try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'recordScopeReviewRun failed', String(error)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    return null;
  }
}

/**
 * Read large JSON from split columns in _LLM_SCOPE_LOG
 *
 * @param {Array} row - Sheet row data
 * @returns {Object} {request, response}
 * @private
 */
function readLargeJsonFromScopeLog_(row) {
  try {
    // Columns: LogID, Timestamp, ScopeCount, ScopeCodes, Req1, Req2, Req3, Res1, Res2, Res3, Notes, AppliedAt, AppliedBy
    // Indices: 0,      1,         2,          3,          4,    5,    6,    7,    8,    9,    10,    11,        12
    const requestJson = reassembleJsonFromChunks([row[4] || '', row[5] || '', row[6] || '']);
    const responseJson = reassembleJsonFromChunks([row[7] || '', row[8] || '', row[9] || '']);

    return {
      request: safeJsonParse(requestJson, {}),
      response: safeJsonParse(responseJson, {})
    };
  } catch (error) {
    UnifiedLogger.error('NormalizeData', 'Failed to read split JSON from scope log', {
      error: String(error)
    });
    return { request: {}, response: {} };
  }
}

function getLatestScopeReviewLog() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'getLatestScopeReviewLog');
  try {
    const sheet = ensureScopeReviewLogSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      trace.complete('getLatestScopeReviewLog completed - no logs', { lastRow: lastRow });
      return null;
    }
    const values = sheet.getRange(lastRow, 1, 1, SCOPE_REVIEW_LOG_HEADERS.length).getValues()[0];
    let parsedRequest = {};
    let parsedResponse = {};
    parsedRequest = safeJsonParse(values[4], { parseError: 'Invalid JSON', raw: values[4] });
    parsedResponse = safeJsonParse(values[5], { parseError: 'Invalid JSON', raw: values[5] });
    const result = {
      logId: values[0],
      timestamp: values[1],
      scopeCount: values[2],
      scopeCodes: values[3] ? filterTruthy(values[3].split(',').map(code => String(code).trim())) : [],
      request: parsedRequest,
      response: parsedResponse
    };
    trace.complete('getLatestScopeReviewLog completed', { logId: result.logId, scopeCount: result.scopeCount });
    return result;
  } catch (error) {
    trace.fail('getLatestScopeReviewLog failed', error);
    throw error;
  }
}

function getScopeReviewLogById(logId) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'getScopeReviewLogById');
  try {
    const sheet = ensureScopeReviewLogSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      trace.complete('getScopeReviewLogById completed - no logs', { logId: logId });
      return null;
    }
    const range = sheet.getRange(2, 1, lastRow - 1, SCOPE_REVIEW_LOG_HEADERS.length);
    const values = range.getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0]) === logId) {
        const parsedRequest = safeJsonParse(values[i][4], { parseError: 'Invalid JSON', raw: values[i][4] });
        let parsedResponse = {};
        const personaFromRequest = parsedRequest && parsedRequest.meta ? parsedRequest.meta.persona : null;
        const personaKey = isScopeReviewPersonaSupported(personaFromRequest)
          ? normalizeScopeReviewPersona(personaFromRequest)
          : SCOPE_REVIEW_DEFAULT_PERSONA;
        const personaLabel = getScopeReviewPersonaLabel(personaFromRequest || personaKey);
        parsedResponse = safeJsonParse(values[i][5], { parseError: 'Invalid JSON', raw: values[i][5] });
        const result = {
          rowNumber: i + 2,
          logId: values[i][0],
          timestamp: values[i][1],
          scopeCount: values[i][2],
          scopeCodes: values[i][3] ? filterTruthy(values[i][3].split(',').map(code => String(code).trim())) : [],
          request: parsedRequest,
          response: parsedResponse,
          reviewerNotes: values[i][6] || '',
          appliedAt: values[i][7] || '',
          appliedBy: values[i][8] || '',
          persona: personaKey,
          personaLabel: personaLabel
        };
        trace.complete('getScopeReviewLogById completed', { logId: logId, found: true });
        return result;
      }
    }
    trace.complete('getScopeReviewLogById completed - not found', { logId: logId });
    return null;
  } catch (error) {
    trace.fail('getScopeReviewLogById failed', error);
    throw error;
  }
}

function listScopeReviewLogs(limit) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'listScopeReviewLogs');
  try {
    const sheet = ensureScopeReviewLogSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      trace.complete('listScopeReviewLogs completed - no logs', { limit: limit });
      return [];
    }
    const maxRows = limit && limit > 0 ? Math.min(limit, lastRow - 1) : (lastRow - 1);
    const startRow = Math.max(2, lastRow - maxRows + 1);
    const range = sheet.getRange(startRow, 1, maxRows, SCOPE_REVIEW_LOG_HEADERS.length);
    const values = range.getValues().reverse();
    const result = values.map(row => {
      let personaKey = SCOPE_REVIEW_DEFAULT_PERSONA;
      let personaRaw = null;
      try {
        const rawRequest = row[4] ? safeJsonParse(row[4], null) : null;
        const requestPersona = rawRequest && rawRequest.meta ? rawRequest.meta.persona : null;
        personaRaw = requestPersona;
        if (isScopeReviewPersonaSupported(requestPersona)) {
          personaKey = normalizeScopeReviewPersona(requestPersona);
        }
      } catch (error) {
        personaKey = SCOPE_REVIEW_DEFAULT_PERSONA;
        personaRaw = null;
      }
      return {
        logId: row[0],
        timestamp: row[1],
        scopeCount: row[2],
        scopeCodes: row[3] ? filterTruthy(row[3].split(',').map(code => String(code).trim())) : [],
        reviewerNotes: row[6] || '',
        appliedAt: row[7] || '',
        appliedBy: row[8] || '',
        persona: personaKey,
        personaLabel: getScopeReviewPersonaLabel(personaRaw || personaKey)
      };
    });
    trace.complete('listScopeReviewLogs completed', { count: result.length, limit: limit });
    return result;
  } catch (error) {
    trace.fail('listScopeReviewLogs failed', error);
    throw error;
  }
}

function updateScopeReviewNotes(logId, notes) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'updateScopeReviewNotes');
  try {
    const entry = getScopeReviewLogById(logId);
    if (!entry) {
      trace.fail('updateScopeReviewNotes failed - log not found', new Error('No log entry found'));
      throw new AppError('SCOPE_REVIEW_LOG', 'No log entry found for id ' + logId);
    }
    const sheet = ensureScopeReviewLogSheet();
    sheet.getRange(entry.rowNumber, 7).setValue(notes || '');
    const result = {
      logId: logId,
      reviewerNotes: notes || ''
    };
    trace.complete('updateScopeReviewNotes completed', { logId: logId });
    return result;
  } catch (error) {
    trace.fail('updateScopeReviewNotes failed', error);
    throw error;
  }
}

function buildScopeReviewIndex() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'buildScopeReviewIndex');
  try {
    const index = {};
    const sheet = ensureScopeReviewLogSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      trace.complete('buildScopeReviewIndex completed - no logs', { indexSize: 0 });
      return index;
    }
    const values = sheet.getRange(2, 1, lastRow - 1, SCOPE_REVIEW_LOG_HEADERS.length).getValues();
    values.forEach(row => {
      const logId = row[0];
      const timestamp = row[1];
      const scopeCodes = filterTruthy((row[3] || '').split(',').map(code => String(code).trim()));
      const reviewerNotes = row[6] || '';
      const appliedAt = row[7] || '';
      const appliedBy = row[8] || '';
      scopeCodes.forEach(code => {
        if (!index[code] || new Date(timestamp) > new Date(index[code].timestamp || 0)) {
          index[code] = {
            logId: logId,
            timestamp: timestamp,
            reviewerNotes: reviewerNotes,
            appliedAt: appliedAt,
            appliedBy: appliedBy
          };
        }
      });
    });
    trace.complete('buildScopeReviewIndex completed', { indexSize: Object.keys(index).length });
    return index;
  } catch (error) {
    trace.fail('buildScopeReviewIndex failed', error);
    throw error;
  }
}

const SCOPE_REVIEW_DEFAULT_PERSONA = 'seniorAgencyDirector';

const SCOPE_REVIEW_PERSONA_PROMPTS = {
  seniorAgencyDirector: [
    'You are hrmny\'s senior agency director with cross-disciplinary delivery experience across strategy, creative, production, and technology programmes in the UAE/GCC.',
    'You carry deep knowledge of hrmny\'s commercial guardrails, delivery playbooks, and client expectations, so you instinctively protect margin, enforce contingency coverage, and anticipate operational pressure points.',
    'Review every scope through a versatile agency lens, balancing commercial resilience, delivery practicality, and client-readiness.'
  ]
};

const SCOPE_REVIEW_PERSONA_ALIASES = {
  commercialDirector: 'seniorAgencyDirector',
  deliveryLead: 'seniorAgencyDirector'
};

const SCOPE_REVIEW_PERSONA_LABELS = {
  seniorAgencyDirector: 'Agency Review Director',
  commercialDirector: 'Commercial Director (legacy)',
  deliveryLead: 'Delivery Lead (legacy)'
};

const SCOPE_REVIEW_COMMON_SYSTEM_PARTS = [
  'Use the provided context, scope breakdowns, and benchmark summaries to ensure each scope protects the agency\'s 35% blended margin while reserving contingency for potential 20% cost overruns.',
  'Verify that senior oversight, weekend/after-hours readiness, and multilingual or high-touch client-service expectations are covered whenever the brief or scope hints at them.',
  'Reference benchmark medians (e.g., "Senior Animator median AED 240/hr") or explicit brief/scope details when recommending pricing or hour changes.',
  'When recommending adjustments, specify the exact change (rates, hours, adds/removals) and frame the rationale so finance and delivery leads can action it immediately.',
  'Cite the supporting benchmark, scope element, or brief excerpt for every recommendation or risk you surface.',
  'Rewrite the client-facing summary and bullets so they remain premium, persuasive, and truthful to the resourcing.',
  'List concrete risks that could erode margin, delivery quality, or client trust, highlighting where contingency or specialist cover is thin.',
  'Call out cross-functional gaps (strategy ↔ creative ↔ production) where additional leadership, specialist depth, or contingency is required to keep hrmny\'s delivery resilient.'
];

const SCOPE_REVIEW_RESPONSE_SCHEMA = {
  name: 'ScopeReviewResponse',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: true,
    required: ['scopes'],
    properties: {
      scopes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['scopeCode'],
          properties: {
            scopeCode: { type: ['string', 'null'] },
            pricing: {
              type: 'object',
              additionalProperties: true,
              properties: {
                status: { type: 'string' },
                recommendedSell: { type: ['number', 'null'] },
                notes: { type: 'string' }
              }
            },
            hours: {
              type: 'object',
              additionalProperties: true,
              properties: {
                status: { type: 'string' },
                notes: { type: 'string' }
              }
            },
            resourceAdjustments: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  resourceCode: { type: 'string' },
                  changeType: { type: 'string' },
                  resourceName: { type: 'string' },
                  recommendedHours: { type: ['number', 'null'] },
                  recommendedRate: { type: ['number', 'null'] },
                  notes: { type: 'string' }
                }
              }
            },
            clientCopy: {
              type: 'object',
              additionalProperties: true,
              properties: {
                summary: { type: 'string' },
                bullets: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            },
            risks: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      },
      globalNotes: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  }
};

function normalizeScopeReviewPersona(personaKey) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'normalizeScopeReviewPersona');
  try {
    if (!personaKey) {
      trace.complete('normalizeScopeReviewPersona completed - default', { result: SCOPE_REVIEW_DEFAULT_PERSONA });
      return SCOPE_REVIEW_DEFAULT_PERSONA;
    }
    const key = String(personaKey).trim();
    if (!key) {
      trace.complete('normalizeScopeReviewPersona completed - empty key', { result: SCOPE_REVIEW_DEFAULT_PERSONA });
      return SCOPE_REVIEW_DEFAULT_PERSONA;
    }
    if (SCOPE_REVIEW_PERSONA_PROMPTS[key]) {
      trace.complete('normalizeScopeReviewPersona completed - direct match', { input: key, result: key });
      return key;
    }
    const alias = SCOPE_REVIEW_PERSONA_ALIASES[key];
    if (alias && SCOPE_REVIEW_PERSONA_PROMPTS[alias]) {
      trace.complete('normalizeScopeReviewPersona completed - alias match', { input: key, result: alias });
      return alias;
    }
    trace.complete('normalizeScopeReviewPersona completed - fallback', { input: key, result: SCOPE_REVIEW_DEFAULT_PERSONA });
    return SCOPE_REVIEW_DEFAULT_PERSONA;
  } catch (error) {
    trace.fail('normalizeScopeReviewPersona failed', error);
    throw error;
  }
}

function isScopeReviewPersonaSupported(personaKey) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'isScopeReviewPersonaSupported');
  try {
    if (!personaKey) {
      trace.complete('isScopeReviewPersonaSupported completed', { result: true });
      return true;
    }
    const key = String(personaKey).trim();
    if (!key) {
      trace.complete('isScopeReviewPersonaSupported completed - empty', { result: true });
      return true;
    }
    if (SCOPE_REVIEW_PERSONA_PROMPTS[key]) {
      trace.complete('isScopeReviewPersonaSupported completed - direct match', { input: key, result: true });
      return true;
    }
    const alias = SCOPE_REVIEW_PERSONA_ALIASES[key];
    const result = !!(alias && SCOPE_REVIEW_PERSONA_PROMPTS[alias]);
    trace.complete('isScopeReviewPersonaSupported completed', { input: key, result: result });
    return result;
  } catch (error) {
    trace.fail('isScopeReviewPersonaSupported failed', error);
    throw error;
  }
}

function getScopeReviewPersonaLabel(personaKey) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'getScopeReviewPersonaLabel');
  try {
    const normalized = normalizeScopeReviewPersona(personaKey);
    let result;
    if (personaKey && SCOPE_REVIEW_PERSONA_LABELS[personaKey]) {
      result = SCOPE_REVIEW_PERSONA_LABELS[personaKey];
    } else {
      result = SCOPE_REVIEW_PERSONA_LABELS[normalized] || normalized;
    }
    trace.complete('getScopeReviewPersonaLabel completed', { input: personaKey, result: result });
    return result;
  } catch (error) {
    trace.fail('getScopeReviewPersonaLabel failed', error);
    throw error;
  }
}

function describeSupportedScopeReviewPersonas() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'describeSupportedScopeReviewPersonas');
  try {
    const result = Object.keys(SCOPE_REVIEW_PERSONA_PROMPTS)
      .map(key => getScopeReviewPersonaLabel(key))
      .join(', ');
    trace.complete('describeSupportedScopeReviewPersonas completed', { count: Object.keys(SCOPE_REVIEW_PERSONA_PROMPTS).length });
    return result;
  } catch (error) {
    trace.fail('describeSupportedScopeReviewPersonas failed', error);
    throw error;
  }
}

function buildScopeReviewSystemPrompt(personaKey, hasPriorReview, additionalSystemNotes) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'buildScopeReviewSystemPrompt');
  try {
    const persona = normalizeScopeReviewPersona(personaKey);
    const personaParts = SCOPE_REVIEW_PERSONA_PROMPTS[persona] || [];
    const systemParts = personaParts.concat(SCOPE_REVIEW_COMMON_SYSTEM_PARTS.slice());
    if (hasPriorReview) {
      systemParts.push('A prior review is included in the payload; treat it as a first pass and refine or escalate recommendations as needed.');
    }

    systemParts.push('When recommending resource changes, include a changeType for each adjustment (one of "rate", "hours", "rate_hours", "add", "remove"). For removals, set recommendedHours to 0. For additions, supply resourceName, recommendedHours, recommendedRate, and leave a new resourceCode placeholder if unknown.');
    systemParts.push('Respond ONLY with the structured JSON that matches the schema enforced via the response_format; avoid Markdown or schema narrative.');
    systemParts.push('Limit each array to a maximum of 10 entries and trim text fields to 200 characters.');
    systemParts.push('Every adjustment or recommendation must cite the supporting benchmark, scope reference, or brief evidence inside the notes field.');
    if (additionalSystemNotes && String(additionalSystemNotes).trim()) {
      systemParts.push(String(additionalSystemNotes).trim());
    }
    const result = systemParts.join('\n');
    trace.complete('buildScopeReviewSystemPrompt completed', { persona: persona, partsCount: systemParts.length });
    return result;
  } catch (error) {
    trace.fail('buildScopeReviewSystemPrompt failed', error);
    throw error;
  }
}

/**
 * Run the scope review LLM across a subset of scopes using the standard agency director persona.
 * @param {number} [scopeLimit=50] maximum scopes to include
 * @return {Object} scope review log context
 */
function runScopeLLMReview(scopeLimit) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'runScopeLLMReview');
  try {
    const catalog = buildScopeCatalogForLLM(scopeLimit || 50, null);
    const result = submitScopeReview(catalog, {});
    trace.complete('runScopeLLMReview completed', { logId: result.logId, scopeCount: catalog.scopes.length });
    return result;
  } catch (error) {
    trace.fail('runScopeLLMReview failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Running scope LLM review',
      correlationId: trace.correlationId
    });
    showErrorToast('Review Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Run the scope review LLM for specific scope codes using the standard agency director persona.
 * @param {string[]} scopeCodes list of scope codes to review
 * @return {Object} scope review log context
 */
function runScopeLLMReviewForScopes(scopeCodes) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'runScopeLLMReviewForScopes');
  try {
    if (!Array.isArray(scopeCodes) || scopeCodes.length === 0) {
      trace.fail('runScopeLLMReviewForScopes failed - no scope codes', new Error('No scope codes'));
      throw new AppError('SCOPE_CODES', 'Provide at least one scope code to review.');
    }
    const catalog = buildScopeCatalogForLLM(null, scopeCodes);
    const result = submitScopeReview(catalog, {});
    trace.complete('runScopeLLMReviewForScopes completed', { logId: result.logId, scopeCount: scopeCodes.length });
    return result;
  } catch (error) {
    trace.fail('runScopeLLMReviewForScopes failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Running scope LLM review for specific scopes',
      correlationId: trace.correlationId
    });
    showErrorToast('Review Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

// Dead code removal pattern from App-script/NormalizeData.js:1695
function rerunScopeLLMReviewWithLog(logId, additionalInstructions) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'rerunScopeLLMReviewWithLog');
  try {
    const existing = getScopeReviewLogById(logId);
    if (!existing) {
      trace.fail('rerunScopeLLMReviewWithLog failed - log not found', new Error('Log not found'));
      throw new AppError('SCOPE_REVIEW_LOG', 'No log entry found for id ' + logId);
    }
    if (!existing.scopeCodes || existing.scopeCodes.length === 0) {
      trace.fail('rerunScopeLLMReviewWithLog failed - no scope codes', new Error('No scope codes'));
      throw new AppError('SCOPE_REVIEW_LOG', 'Log entry ' + logId + ' does not contain scope codes.');
    }
    const catalog = buildScopeCatalogForLLM(null, existing.scopeCodes);
    const priorPersona = existing.request && existing.request.meta ? existing.request.meta.persona : null;
    const reviewerNotes = existing.reviewerNotes ? String(existing.reviewerNotes) : '';
    const combinedNotes = [reviewerNotes, additionalInstructions]
      .filter(text => text && String(text).trim().length > 0)
      .join('\n');
    const result = submitScopeReview(catalog, {
      priorReview: existing.response,
      reviewerNotes: combinedNotes,
      persona: priorPersona
    });
    trace.complete('rerunScopeLLMReviewWithLog completed', { logId: logId, newLogId: result.logId });
    return result;
  } catch (error) {
    trace.fail('rerunScopeLLMReviewWithLog failed', error);
    throw error;
  }
}

function submitScopeReview(catalog, options) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'submitScopeReview');
  try {
    options = options || {};
    if (!isScopeReviewPersonaSupported(options.persona)) {
      trace.fail('submitScopeReview failed - unsupported persona', new Error('Unsupported persona'));
      throw new AppError('SCOPE_REVIEW_PERSONA', 'Unknown scope review persona "' + options.persona + '". Supported personas: ' + describeSupportedScopeReviewPersonas() + '.');
    }
    const personaKey = normalizeScopeReviewPersona(options.persona);
    const requestPayload = {
      generatedAt: catalog.generatedAt,
      context: catalog.context,
      scopes: catalog.scopes,
      benchmarks: catalog.benchmarks,
      meta: {
        reviewerNotes: options.reviewerNotes || '',
        persona: personaKey,
        personaLabel: getScopeReviewPersonaLabel(personaKey)
      }
    };
    if (options.priorReview) {
      requestPayload.priorReview = options.priorReview;
    }

    const systemPrompt = buildScopeReviewSystemPrompt(personaKey, !!options.priorReview, options.additionalSystemNotes);
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: JSON.stringify(requestPayload)
      }
    ];

    const llmRaw = invokeScopeReviewLLM(messages, {
      schema: SCOPE_REVIEW_RESPONSE_SCHEMA
    });
    const parsed = parseScopeReviewResponse(llmRaw);
    const logId = recordScopeReviewRun(requestPayload, parsed);
    try { UnifiedLogger.info(NORMALIZE_LOG_CATEGORY, 'LLM scope review response recorded', { logId: logId, scopes: requestPayload.scopes.map(function(scope) { return scope.scopeCode; }) }); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    const result = {
      logId: logId,
      request: catalog,
      response: parsed
    };
    trace.complete('submitScopeReview completed', { logId: logId, scopeCount: catalog.scopes.length });
    return result;
  } catch (error) {
    trace.fail('submitScopeReview failed', error);
    throw error;
  }
}

function scopeReviewGetCatalogData() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'scopeReviewGetCatalogData');
  try {
    const catalog = buildScopeCatalogForLLM(1000, null);
    const reviewIndex = buildScopeReviewIndex();
    const categoryCounter = {};
    const scopes = catalog.scopes.map(entry => {
      const category = entry.category || 'General';
      categoryCounter[category] = (categoryCounter[category] || 0) + 1;
      const reviewInfo = reviewIndex[entry.scopeCode] || null;
      return {
        code: entry.scopeCode,
        name: entry.scopeName,
        category: category,
        totalSell: entry.totalSell,
        totalHours: entry.totalHours,
        resourceCount: entry.resourceCount,
        lastReviewLogId: reviewInfo ? reviewInfo.logId : '',
        lastReviewTimestamp: reviewInfo ? reviewInfo.timestamp : '',
        lastAppliedAt: reviewInfo ? reviewInfo.appliedAt : '',
        lastAppliedBy: reviewInfo ? reviewInfo.appliedBy : ''
      };
    });
    const categories = Object.keys(categoryCounter)
      .sort((a, b) => a.localeCompare(b))
      .map(key => ({
        id: key,
        label: key,
        count: categoryCounter[key]
      }));
    const result = {
      scopes: scopes,
      categories: categories,
      totals: {
        scopeCount: scopes.length
      }
    };
    trace.complete('scopeReviewGetCatalogData completed', { scopeCount: scopes.length, categoryCount: categories.length });
    return result;
  } catch (error) {
    trace.fail('scopeReviewGetCatalogData failed', error);
    throw error;
  }
}

function scopeReviewListLogs(limit) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'scopeReviewListLogs');
  try {
    const result = listScopeReviewLogs(limit || 25);
    trace.complete('scopeReviewListLogs completed', { count: result.length, limit: limit });
    return result;
  } catch (error) {
    trace.fail('scopeReviewListLogs failed', error);
    throw error;
  }
}

function scopeReviewGetLog(logId) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'scopeReviewGetLog');
  try {
    const log = getScopeReviewLogById(logId);
    if (!log) {
      trace.fail('scopeReviewGetLog failed - log not found', new Error('Log not found'));
      throw new AppError('SCOPE_REVIEW_LOG', 'No log entry found for id ' + logId);
    }
    trace.complete('scopeReviewGetLog completed', { logId: logId });
    return log;
  } catch (error) {
    trace.fail('scopeReviewGetLog failed', error);
    throw error;
  }
}

function scopeReviewUpdateNotes(logId, notes) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'scopeReviewUpdateNotes');
  try {
    const result = updateScopeReviewNotes(logId, notes);
    trace.complete('scopeReviewUpdateNotes completed', { logId: logId });
    return result;
  } catch (error) {
    trace.fail('scopeReviewUpdateNotes failed', error);
    throw error;
  }
}

/**
 * Trigger an LLM scope review for the selected scopes from the UI.
 * @param {string[]} scopes list of scope codes selected in the sidebar
 * @param {(string|Object)} reviewerNotes optional notes string or an options object
 * Persona selection is fixed to the agency review director perspective for scope reviews.
 * @return {Object} scope review log context
 */
function scopeReviewRun(scopes, reviewerNotes) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'scopeReviewRun');
  try {
    if (!Array.isArray(scopes) || scopes.length === 0) {
      trace.fail('scopeReviewRun failed - no scopes', new Error('No scopes'));
      throw new AppError('SCOPE_CODES', 'Select at least one scope to review.');
    }
    let effectiveNotes = reviewerNotes;
    let effectivePersona = SCOPE_REVIEW_DEFAULT_PERSONA;
    if (reviewerNotes && typeof reviewerNotes === 'object' && !Array.isArray(reviewerNotes)) {
      effectiveNotes = reviewerNotes.notes || reviewerNotes.reviewerNotes || '';
    }
    const catalog = buildScopeCatalogForLLM(null, scopes);
    const result = submitScopeReview(catalog, {
      reviewerNotes: effectiveNotes || '',
      persona: effectivePersona
    });
    trace.complete('scopeReviewRun completed', { logId: result.logId, scopeCount: scopes.length });
    return result;
  } catch (error) {
    trace.fail('scopeReviewRun failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Running scope review',
      correlationId: trace.correlationId
    });
    showErrorToast('Scope Review Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Rerun a prior LLM review, optionally refining instructions.
 * @param {string} logId scope review log identifier
 * @param {string} additionalInstructions extra guidance for the rerun
 * @return {Object} new scope review log context
 */
function scopeReviewRerun(logId, additionalInstructions) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'scopeReviewRerun');
  try {
    const result = rerunScopeLLMReviewWithLog(logId, additionalInstructions || '');
    trace.complete('scopeReviewRerun completed', { logId: logId, newLogId: result.logId });
    return result;
  } catch (error) {
    trace.fail('scopeReviewRerun failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Rerunning scope review',
      correlationId: trace.correlationId
    });
    showErrorToast('Review Rerun Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

function scopeReviewApplyAdjustments(logId, scopeCode, options) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'scopeReviewApplyAdjustments');
  try {
    const result = applyScopeReviewAdjustments(logId, scopeCode, options || {});
    trace.complete('scopeReviewApplyAdjustments completed', { logId: logId, scopeCode: scopeCode });
    return result;
  } catch (error) {
    trace.fail('scopeReviewApplyAdjustments failed', error);
    throw error;
  }
}


function previewScopeReviewAdjustments(logId, scopeCode) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'previewScopeReviewAdjustments');
  try {
    const review = getScopeReviewLogById(logId);
    if (!review) {
      trace.fail('previewScopeReviewAdjustments failed - log not found', new Error('Log not found'));
      throw new AppError('SCOPE_REVIEW_LOG', 'No log entry found for id ' + logId);
    }
    const normalizedScope = String(scopeCode || '').trim();
    if (!normalizedScope) {
      trace.fail('previewScopeReviewAdjustments failed - no scope code', new Error('No scope code'));
      throw new AppError('SCOPE_CODE', 'Scope code is required.');
    }
    const scopeEntry = review.response && review.response.scopes
      ? review.response.scopes.find(entry => String(entry.scopeCode || '').trim() === normalizedScope)
      : null;
    if (!scopeEntry) {
      trace.fail('previewScopeReviewAdjustments failed - scope not found', new Error('Scope not found'));
      throw new AppError('SCOPE_REVIEW_SCOPE', 'Scope ' + normalizedScope + ' not found in log ' + logId);
    }
    trace.complete('previewScopeReviewAdjustments completed', { logId: logId, scopeCode: normalizedScope });
    return scopeEntry;
  } catch (error) {
    trace.fail('previewScopeReviewAdjustments failed', error);
    throw error;
  }
}

function applyScopeReviewAdjustments(logId, scopeCode, options) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'applyScopeReviewAdjustments');
  try {
    const review = getScopeReviewLogById(logId);
    if (!review) {
      trace.fail('applyScopeReviewAdjustments failed - log not found', new Error('Log not found'));
      throw new AppError('SCOPE_REVIEW_LOG', 'No log entry found for id ' + logId);
    }
  const normalizedScope = String(scopeCode || '').trim();
  if (!normalizedScope) {
    throw new AppError('SCOPE_CODE', 'Scope code is required.');
  }
  const scopeEntry = review.response && review.response.scopes
    ? review.response.scopes.find(entry => String(entry.scopeCode || '').trim() === normalizedScope)
    : null;
  if (!scopeEntry) {
    throw new AppError('SCOPE_REVIEW_SCOPE', 'Scope ' + normalizedScope + ' not found in log ' + logId);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NORMALIZE_CONFIG.SOURCE_TABS.SCOPES);
  if (!sheet) {
    throw new AppError('SHEET_MISSING', 'Scope Buildups sheet not found.');
  }
  const data = (sheet.getLastRow() > 0 ? sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), 1)).getValues() : []);
  const resourceRows = [];
  let totalRow = null;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE] || '').trim() === normalizedScope) {
      const entry = {
        rowIndex: i + 1,
        values: row.slice()
      };
      const resourceCode = String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE] || '').trim();
      if (!resourceCode && String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.NOTES] || '').toUpperCase().indexOf('TOTAL') !== -1) {
        totalRow = entry;
      } else if (resourceCode) {
        entry.resourceCode = resourceCode;
        resourceRows.push(entry);
      }
    }
  }
  if (resourceRows.length === 0) {
    throw new AppError('SCOPE_ROWS', 'No resource rows found for scope ' + normalizedScope);
  }
  if (!totalRow) {
    throw new AppError('SCOPE_TOTAL', 'Total row not found for scope ' + normalizedScope);
  }

  options = options || {};
  const applyHours = options.applyHours !== false;
  const applyRates = options.applyRates !== false;
  const applyPricing = options.applyPricing !== false;
  const onlyCodes = Array.isArray(options.onlyResourceCodes) && options.onlyResourceCodes.length > 0
    ? options.onlyResourceCodes.map(code => String(code).trim())
    : null;

  const resourceMap = {};
  resourceRows.forEach(entry => {
    resourceMap[entry.resourceCode] = entry;
  });
  const columnCount = data[0] ? data[0].length : sheet.getLastColumn();
  const scopeNameFallback = resourceRows.length > 0
    ? resourceRows[0].values[NORMALIZE_CONFIG.SCOPE_COLUMNS.NAME]
    : (scopeEntry.scopeName || '');

  const resolveResourceCode = (initialCode) => {
    let candidate = String(initialCode || '').trim();
    if (candidate && !resourceMap[candidate]) {
      return candidate;
    }
    const stem = `${normalizedScope}-ADD-`;
    let counter = 1;
    while (resourceMap[`${stem}${counter}`]) {
      counter++;
    }
    return `${stem}${counter}`;
  };

  const buildAdditionNotes = (adjustment) => {
    const parts = ['Added via scope review'];
    if (adjustment && adjustment.notes && String(adjustment.notes).trim()) {
      parts.push(String(adjustment.notes).trim());
    } else if (adjustment && adjustment.rationale && String(adjustment.rationale).trim()) {
      parts.push(String(adjustment.rationale).trim());
    }
    return parts.join(' — ');
  };

  const appliedAdjustments = [];
  if (Array.isArray(scopeEntry.resourceAdjustments)) {
    scopeEntry.resourceAdjustments.forEach(adjustment => {
      const code = String(adjustment.resourceCode || '').trim();
      const changeType = String(adjustment.changeType || '').toLowerCase();
      if (!code && changeType !== 'add') {
        return;
      }
      if (onlyCodes && onlyCodes.indexOf(code) === -1) {
        return;
      }
      if (changeType === 'add') {
        if (onlyCodes && (!code || onlyCodes.indexOf(code) === -1)) {
          return;
        }
        const resolvedCode = resolveResourceCode(code);
        const hours = adjustment.recommendedHours !== undefined && adjustment.recommendedHours !== null
          ? toNumber(adjustment.recommendedHours, 0)
          : 0;
        const rate = adjustment.recommendedRate !== undefined && adjustment.recommendedRate !== null
          ? toNumber(adjustment.recommendedRate, 0)
          : 0;
        const lineCost = Math.round(hours * rate * 100) / 100;
        const resourceName = adjustment.resourceName
          ? String(adjustment.resourceName).trim()
          : (adjustment.notes ? String(adjustment.notes).trim() : 'Additional Resource');
        const newRowValues = new Array(columnCount).fill('');
        newRowValues[NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE] = normalizedScope;
        newRowValues[NORMALIZE_CONFIG.SCOPE_COLUMNS.NAME] = scopeNameFallback;
        newRowValues[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE] = resolvedCode;
        newRowValues[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME] = resourceName;
        newRowValues[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOURS] = hours;
        newRowValues[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE] = rate;
        newRowValues[NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST] = lineCost;
        newRowValues[NORMALIZE_CONFIG.SCOPE_COLUMNS.NOTES] = buildAdditionNotes(adjustment);

        const insertIndex = totalRow.rowIndex;
        sheet.insertRowsBefore(insertIndex, 1);
        sheet.getRange(insertIndex, 1, 1, columnCount).setValues([newRowValues]);

        const newEntry = {
          rowIndex: insertIndex,
          values: newRowValues.slice(),
          resourceCode: resolvedCode
        };
        resourceRows.push(newEntry);
        resourceMap[resolvedCode] = newEntry;
        totalRow.rowIndex += 1;
        appliedAdjustments.push({
          resourceCode: resolvedCode,
          changeType: 'add',
          resourceName: resourceName,
          hours: hours,
          hourlyRate: rate
        });
        return;
      }
      const entry = resourceMap[code];
      if (!entry) {
        return;
      }
      if (changeType === 'remove') {
        adjustment.recommendedHours = 0;
      }
      let changed = false;
      if (applyHours && adjustment.recommendedHours !== undefined && adjustment.recommendedHours !== null) {
        entry.values[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOURS] = adjustment.recommendedHours;
        changed = true;
      }
      if (applyRates && adjustment.recommendedRate !== undefined && adjustment.recommendedRate !== null) {
        entry.values[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE] = adjustment.recommendedRate;
        changed = true;
      }
      if (changed) {
        const hours = toNumber(entry.values[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOURS], 0);
        const rate = toNumber(entry.values[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE], 0);
        entry.values[NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST] = Math.round(hours * rate * 100) / 100;
        sheet.getRange(entry.rowIndex, 1, 1, entry.values.length).setValues([entry.values]);
        appliedAdjustments.push({
          resourceCode: code,
          changeType: changeType || 'update',
          hours: hours,
          hourlyRate: rate
        });
      }
    });
  }

  let recalculatedTotal = resourceRows.reduce((sum, entry) => sum + toNumber(entry.values[NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST], 0), 0);
  if (applyPricing && scopeEntry.pricing && scopeEntry.pricing.recommendedSell !== undefined && scopeEntry.pricing.recommendedSell !== null) {
    recalculatedTotal = scopeEntry.pricing.recommendedSell;
  }
  totalRow.values[NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST] = Math.round(recalculatedTotal * 100) / 100;
  sheet.getRange(totalRow.rowIndex, 1, 1, totalRow.values.length).setValues([totalRow.values]);

  const appliedAt = new Date().toISOString();
  let appliedBy = 'unknown';
  try {
    appliedBy = Session.getActiveUser().getEmail() || 'unknown';
  } catch (error) {
    appliedBy = 'unknown';
  }
  const logSheet = ensureScopeReviewLogSheet();
  logSheet.getRange(review.rowNumber, 8, 1, 2).setValues([[appliedAt, appliedBy]]);

  if (options.notes) {
    updateScopeReviewNotes(logId, (review.reviewerNotes ? review.reviewerNotes + '\n' : '') + '[Applied ' + normalizedScope + ']: ' + options.notes);
  }

    try {
      ensureScopeBuildupValidationsAndFormulas();
    } catch (scopeError) {
      try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'ensureScopeBuildupValidationsAndFormulas failed after applying adjustments', String(scopeError)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    }

    const result = {
      logId: logId,
      scopeCode: normalizedScope,
      appliedAdjustments: appliedAdjustments,
      updatedTotalSell: recalculatedTotal,
      pricingApplied: (applyPricing && scopeEntry.pricing && scopeEntry.pricing.recommendedSell !== undefined && scopeEntry.pricing.recommendedSell !== null)
        ? recalculatedTotal
        : null,
      appliedAt: appliedAt,
      appliedBy: appliedBy
    };
    trace.complete('applyScopeReviewAdjustments completed', { logId: logId, scopeCode: normalizedScope, adjustmentCount: appliedAdjustments.length });
    return result;
  } catch (error) {
    trace.fail('applyScopeReviewAdjustments failed', error);
    throw error;
  }
}


function invokeScopeReviewLLM(messages, options) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'invokeScopeReviewLLM');
  try {
    const apiKey = getScriptProperty('LLM_API_KEY') || getScriptProperty('OPENAI_API_KEY');
    if (!apiKey) {
      trace.fail('invokeScopeReviewLLM failed - no API key', new Error('No API key'));
      throw new AppError('LLM_CONFIG', 'LLM_API_KEY or OPENAI_API_KEY is not configured.');
    }
  let endpoint = getScriptProperty('LLM_API_ENDPOINT') || 'https://api.openai.com/v1/responses';
  endpoint = String(endpoint || '').trim() || 'https://api.openai.com/v1/responses';
  if (/\/chat\/completions(?:\/)?$/i.test(endpoint)) {
    endpoint = endpoint.replace(/\/chat\/completions(?:\/)?$/i, '/responses');
  }
  const model = getScriptProperty('LLM_MODEL') || 'gpt-4.1-mini';
  const requestOptions = options || {};
  const responseFormat = requestOptions.schema && requestOptions.schema.schema
    ? {
        type: 'json_schema',
        json_schema: {
          name: requestOptions.schema.name || requestOptions.schemaName || 'response',
          strict: requestOptions.schema.strict !== undefined ? !!requestOptions.schema.strict : true,
          schema: requestOptions.schema.schema
        }
      }
    : { type: 'json_object' };

  const payload = {
    model: model,
    temperature: 0,
    max_output_tokens: 3200,
    input: convertMessagesToResponseInputItems(messages),
    response_format: responseFormat,
    metadata: {
      runType: 'scope-review'
    }
  };

  const fetchOptions = {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    logAIEvent('scope.review.request', {
      runType: 'scope-review',
      outcome: 'request',
      payload: {
        model: model,
        maxTokens: payload.max_output_tokens,
        temperature: payload.temperature,
        endpoint: endpoint
      },
      messages: messages
    });
  } catch (logError) {
    try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'scope.review.request logging failed', String(logError)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
  }


  // PHASE 2: Rate limit enforcement
  try {
    enforceRateLimit(SERVICE_OPENAI_COMPLETION, {
      operationName: 'invokeScopeReviewLLM',
      operationDetails: {
        model: model,
        messageCount: messages ? messages.length : 0
      }
    });
  } catch (error) {
    if (error.code === 'RATE_LIMIT') {
      UnifiedLogger.warn('NormalizeData', 'LLM rate limit reached', {
        model: model,
        resetInSeconds: error.resetTimeSeconds
      });

      const err = new Error(
        'LLM rate limit reached. Please wait ' +
        Math.ceil(error.resetTimeSeconds) + ' seconds and try again.'
      );
      err.code = 'RATE_LIMIT';
      err.resetTimeSeconds = error.resetTimeSeconds;
      throw err;
    }
    throw error;
  }
  const response = UrlFetchApp.fetch(endpoint, fetchOptions);
  const code = response.getResponseCode();
  if (code >= 300) {
    try {
      logAIEvent('scope.review.response', {
        runType: 'scope-review',
        outcome: 'http_error_' + code,
        payload: {
          status: code,
          bodyPreview: truncate(response.getContentText(), 800)
        }
      });
    } catch (logErr) {
      try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'scope.review.response error logging failed', String(logErr)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    }
    throw new AppError('LLM_HTTP', 'LLM request failed with status ' + code + ': ' + truncate(response.getContentText(), 400));
  }

  const body = response.getContentText();
  const json = safeJsonParse(body, null);
  if (!json) {
    throw new AppError('LLM_JSON', 'Unable to parse LLM response JSON.', { raw: truncate(body, 800) });
  }
  if (json.status && json.status !== 'completed') {
    try {
      logAIEvent('scope.review.response', {
        runType: 'scope-review',
        outcome: 'run_' + json.status,
        payload: {
          status: json.status,
          responseId: json.id || '',
          error: json.error || null
        }
      });
    } catch (logErr) {
      try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'scope.review.response status logging failed', String(logErr)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    }
    throw new AppError('LLM_RUN', 'Scope review response incomplete.', {
      status: json.status,
      error: json.error || null
    });
  }
  const content = extractResponseOutputText(json);
  if (!content) {
    try {
      logAIEvent('scope.review.response', {
        runType: 'scope-review',
        outcome: 'missing_content',
        payload: truncate(body, 800)
      });
    } catch (logErr) {
      try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'scope.review.response logging failed', String(logErr)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    }
    throw new AppError('LLM_RESPONSE', 'LLM response missing content.');
  }
    try {
      logAIEvent('scope.review.response', {
        runType: 'scope-review',
        outcome: 'ok',
        payload: {
          status: code,
          contentPreview: truncate(content, 1200),
          responseId: json.id || '',
          usage: json.usage || null
        }
      });
    } catch (logError) {
      try { UnifiedLogger.warn(NORMALIZE_LOG_CATEGORY, 'scope.review.response logging failed', String(logError)); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }
    }
    trace.complete('invokeScopeReviewLLM completed', { messageCount: messages ? messages.length : 0, contentLength: content ? content.length : 0 });
    return content;
  } catch (error) {
    trace.fail('invokeScopeReviewLLM failed', error);
    throw error;
  }
}

function parseScopeReviewResponse(raw) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'parseScopeReviewResponse');
  try {
    const result = safeJsonParse(raw, null);
    trace.complete('parseScopeReviewResponse completed', { rawLength: raw ? raw.length : 0 });
    return result;
  } catch (error) {
    trace.fail('parseScopeReviewResponse failed', error);
    throw new AppError('LLM_JSON', 'Unable to parse LLM scope review JSON.', { raw: truncate(raw, 800) });
  }
}

// ============================================================================

// ============================================================================
// XERO_READY TAB MANAGEMENT
// ============================================================================

/**
 * Setup XERO_READY tab headers
 */
function setupXeroReadyHeaders(sheet) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'setupXeroReadyHeaders');
  try {
    const headers = [
      'SKU',              // A
      'Name',             // B
      'Description',      // C
      'Sell Price',       // D
      'Cost Price',       // E
      'Account Code',     // F
      'Purchase Account', // G
      'Category',         // H
      'Status',           // I
      'Last Synced',      // J
      'Row Hash',         // K
      'Item Type'         // L
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);

    // Set column widths
    sheet.setColumnWidth(1, 120);  // SKU
    sheet.setColumnWidth(2, 300);  // Name
    sheet.setColumnWidth(3, 350);  // Description
    sheet.setColumnWidth(4, 100);  // Sell Price
    sheet.setColumnWidth(5, 100);  // Cost Price
    trace.complete('setupXeroReadyHeaders completed', { headerCount: headers.length });
  } catch (error) {
    trace.fail('setupXeroReadyHeaders failed', error);
    throw error;
  }
}

/**
 * Write normalized items to XERO_READY tab
 */
function writeToXeroReady(sheet, items) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'writeToXeroReady');
  try {
    if (items.length === 0) {
      trace.complete('writeToXeroReady completed - no items', { count: 0 });
      return;
    }

    const startRow = sheet.getLastRow() + 1;

    const rows = items.map(item => [
      item.sku,
      item.name,
      item.description,
      item.sellPrice,
      item.costPrice,
      item.accountCode,
      item.purchaseAccount || '',
      item.category,
      item.status,
      '', // Last Synced (populated by sync script)
      '', // Row Hash (populated by sync script)
      item.itemType
    ]);

    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    trace.complete('writeToXeroReady completed', { count: items.length, startRow: startRow });
  } catch (error) {
    trace.fail('writeToXeroReady failed', error);
    throw error;
  }
}

/**
 * Sort XERO_READY tab by SKU
 */
function sortXeroReadyTab(sheet) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'sortXeroReadyTab');
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      trace.complete('sortXeroReadyTab completed - no rows', { rowCount: 0 });
      return;
    }

    const range = sheet.getRange(2, 1, lastRow - 1, 12); // Only sort first 12 columns (hash uses 12)
    range.sort(1); // Sort by column 1 (SKU)
    SpreadsheetApp.flush(); // Ensure sort is persisted before hash computation
    trace.complete('sortXeroReadyTab completed', { rowCount: lastRow - 1 });
  } catch (error) {
    trace.fail('sortXeroReadyTab failed', error);
    throw error;
  }
}

// ============================================================================
// PROPOSAL CATALOG GENERATION
// ============================================================================

/**
 * Generate PROPOSAL_CATALOG tab from XERO_READY
 */
function generateProposalCatalog() {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'generateProposalCatalog');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const xeroReadySheet = ss.getSheetByName(NORMALIZE_CONFIG.OUTPUT_TAB);

    if (!xeroReadySheet) {
      trace.fail('generateProposalCatalog failed - sheet missing', new Error('Sheet missing'));
      throw new AppError('SHEET_MISSING', 'XERO_READY tab not found. Run normalization first.');
    }

    // Get or create PROPOSAL_CATALOG tab
    let catalogSheet = ss.getSheetByName('PROPOSAL_CATALOG');

    if (!catalogSheet) {
      catalogSheet = ss.insertSheet('PROPOSAL_CATALOG');
    } else {
      catalogSheet.clear();
    }

    // Setup headers
    const headers = [
      'Scope Code',
      'Scope Name',
      'Category',
      'Sell Price',
      'Cost Price',
      'Margin %',
      'Description',
      'Status'
    ];

    catalogSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    catalogSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    catalogSheet.setFrozenRows(1);

    // Read XERO_READY data
    const data = (xeroReadySheet.getLastRow() > 0 ? xeroReadySheet.getRange(1, 1, xeroReadySheet.getLastRow(), Math.max(xeroReadySheet.getLastColumn(), 1)).getValues() : []);
    const rows = data.slice(1); // Skip header

    const catalogRows = [];

    for (const row of rows) {
      const sku = row[0];
      const name = row[1];
      const description = row[2];
      const sellPrice = parseFloat(row[3]) || 0;
      const costPrice = parseFloat(row[4]) || 0;
      const category = row[7];
      const status = row[8];

      // Calculate margin
      const margin = sellPrice > 0 ? ((sellPrice - costPrice) / sellPrice * 100).toFixed(1) : 0;

      catalogRows.push([
        sku,
        name,
        category,
        sellPrice,
        costPrice,
        margin + '%',
        description,
        status
      ]);
    }

    if (catalogRows.length > 0) {
      catalogSheet.getRange(2, 1, catalogRows.length, catalogRows[0].length).setValues(catalogRows);
    }

    // Sort by category then name
    const lastRow = catalogSheet.getLastRow();
    if (lastRow > 1) {
      const range = catalogSheet.getRange(2, 1, lastRow - 1, catalogSheet.getLastColumn());
      range.sort([{column: 3, ascending: true}, {column: 2, ascending: true}]);
    }

    log(`Generated proposal catalog with ${catalogRows.length} items`);

    SpreadsheetApp.getUi().alert(
      'Proposal Catalog Generated',
      `✅ Created ${catalogRows.length} items in PROPOSAL_CATALOG tab`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    trace.complete('generateProposalCatalog completed', { itemCount: catalogRows.length });
  } catch (error) {
    trace.fail('generateProposalCatalog failed', error);
    throw error;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Log message
 */
function log(message) {
  const trace = UnifiedLogger.startTrace('NormalizeData', 'log');
  try {
    if (!NORMALIZE_CONFIG.LOG_ENABLED) {
      trace.complete('log completed - logging disabled', {});
      return;
    }

    try { UnifiedLogger.info(NORMALIZE_LOG_CATEGORY, message); } catch (ignore) {
      console.error('[NormalizeData] Error:', ignore.message, ignore.stack);
    }

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let logSheet = ss.getSheetByName('Normalization Log');

      if (!logSheet) {
        logSheet = ss.insertSheet('Normalization Log');
        logSheet.appendRow(['Timestamp', 'Message']);
      }

      logSheet.appendRow([new Date(), message]);
    } catch (error) {
      // Empty catch replaced with error logging (Phase 6)
      console.error('[NormalizeData] Error:', error.message, error.stack);
    }
    trace.complete('log completed', { messageLength: message ? message.length : 0 });
  } catch (error) {
    trace.fail('log failed', error);
    throw error;
  }
}

// NOTE: showXeroReady() and showNormalizationLog() are now in Menu.gs

// Export to globalThis for access from ConfigSeeder
if (typeof globalThis !== 'undefined') {
}

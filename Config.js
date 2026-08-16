/**
 * hrmny Quote Builder - Configuration
 * Central configuration for all Apps Script functions
 * Per SYSTEM_BRIEF.md section 2
 */

// ===== SHEET NAMES =====
const SHEET_NAMES = {
  XERO_READY: 'XERO_READY',
  CONFIG: 'Config',
  QUOTE_BUILDER: 'Quote_Builder',
  QUOTE_STAGING: 'Quote_Staging',
  CLIENT_VIEW: 'Client_View',
  INTERNAL_VIEW: 'Internal_View',
  VALIDATION_LOOKUPS: 'VALIDATION_LOOKUPS'
};

// ===== QUOTE_BUILDER COLUMN INDICES (0-based) =====
const QB_COLS = {
  ROW_ID: 0,            // A - Auto row number
  TYPE: 1,              // B - Line/Section/Fee
  VISIBILITY: 2,        // C - Client/Internal/Hidden
  SECTION_NAME: 3,      // D - Grouping name
  ITEM_CODE: 4,         // E - From XERO_READY (SKU column)
  DESCRIPTION: 5,       // F - Internal detail
  CLIENT_LINE_NAME: 6,  // G - What client sees
  QTY: 7,               // H - Quantity
  UNIT: 8,              // I - Day/Hour/etc
  UNIT_RATE: 9,         // J - AED per unit
  MARKUP_PCT: 10,       // K - Optional uplift %
  ROW_NET: 11,          // L - Calculated: Qty × Rate × (1+Markup)
  SECTION_SUBTOTAL: 12, // M - Sum of section lines
  AGENCY_FEE_PCT: 13,   // N - 10%/15%/20%
  FEE_BASE: 14,         // O - Sum of sections above
  FEE_AMOUNT: 15,       // P - Base × Percent
  CLIENT_AMOUNT: 16,    // Q - What appears on Xero
  INTERNAL_COST: 17,    // R - Internal tracking
  MARGIN: 18,           // S - Profit
  NOTES: 19,            // T - Internal comments
  SCOPE_ENTRY_ID: 20    // U - Approved scope reference
};

const QB_HEADER_MAP = {
  ROW_ID: 'Row ID',
  TYPE: 'Type',
  VISIBILITY: 'Visibility',
  SECTION_NAME: 'Section Name',
  ITEM_CODE: 'Item Code',
  DESCRIPTION: 'Description',
  CLIENT_LINE_NAME: 'Client Line Name',
  QTY: 'Qty',
  UNIT: 'Unit',
  UNIT_RATE: 'Unit Rate',
  MARKUP_PCT: 'Markup %',
  ROW_NET: 'Row Net',
  SECTION_SUBTOTAL: 'Section Subtotal',
  AGENCY_FEE_PCT: 'Agency Fee %',
  FEE_BASE: 'Fee Base',
  FEE_AMOUNT: 'Fee Amount',
  CLIENT_AMOUNT: 'Client Amount',
  INTERNAL_COST: 'Internal Cost',
  MARGIN: 'Margin',
  NOTES: 'Notes',
  SCOPE_ENTRY_ID: 'ScopeEntryId'
};

// ===== XERO_READY COLUMN INDICES (0-based) =====
const XERO_COLS = {
  SKU: 0,               // A - Item code / SKU
  NAME: 1,              // B
  DESCRIPTION: 2,       // C
  SELL_PRICE: 3,        // D
  COST_PRICE: 4,        // E
  ACCOUNT_CODE: 5,      // F
  PURCHASE_ACCOUNT: 6,  // G
  CATEGORY: 7,          // H
  STATUS: 8,            // I
  LAST_SYNCED: 9,       // J
  ROW_HASH: 10,         // K
  ITEM_TYPE: 11         // L
};

const XERO_HEADER_MAP = {
  SKU: 'SKU',
  NAME: 'Name',
  DESCRIPTION: 'Description',
  SELL_PRICE: 'Sell Price',
  COST_PRICE: 'Cost Price',
  ACCOUNT_CODE: 'Account Code',
  PURCHASE_ACCOUNT: 'Purchase Account',
  CATEGORY: 'Category',
  STATUS: 'Status',
  LAST_SYNCED: 'Last Synced',
  ROW_HASH: 'Row Hash',
  ITEM_TYPE: 'Item Type'
};

// ===== ROW TYPES (per SYSTEM_BRIEF.md section 2.B) =====
const ROW_TYPES = {
  LINE: 'Line',       // Individual cost item
  SECTION: 'Section', // Roll-up summary
  FEE: 'Fee'          // Agency fee
};

// ===== VISIBILITY TYPES (per SYSTEM_BRIEF.md section 2.C) =====
const VISIBILITY = {
  CLIENT: 'Client',     // Appears in export
  INTERNAL: 'Internal', // Included in calcs, not export
  HIDDEN: 'Hidden'      // Ignored in all math
};

// ===== AGENCY FEE PERCENTAGES (per SYSTEM_BRIEF.md section 2.D) =====
const AGENCY_FEES = {
  TEN_PERCENT: 0.10,
  FIFTEEN_PERCENT: 0.15,
  TWENTY_PERCENT: 0.20
};

const CONFIG_SENSITIVE_KEYS = Object.freeze([
  'XERO_CLIENT_ID',
  'XERO_CLIENT_SECRET',
  'XERO_TENANT_ID',
  'OPENAI_API_KEY',
  'OPENAI_PROMPT_ID',
  'OPENAI_VECTOR_STORE_ID',
  'OPENAI_ASSISTANT_MODEL',
  'OPENAI_ASSISTANT_ID',
  'GOOGLE_PICKER_KEY'
]);

function getConfigSensitiveKeys_() {
  return CONFIG_SENSITIVE_KEYS;
}

const FEATURE_VECTOR_MATCH_PAGER_PROP = 'FEATURE_VECTOR_MATCH_PAGER';

// Phase A (v3.1): CONFIG_CACHE removed - now using PropertiesCache 'config:generalConfig' as single source of truth
const COL_MAPPING_CACHE = {};

function updateIndicesFromHeaders_(sheet, headerMap, targetColsObj, cacheKey) {
  const trace = UnifiedLogger.startTrace('Config', 'updateIndicesFromHeaders_');
  try {
    if (COL_MAPPING_CACHE[cacheKey]) {
      trace.complete('updateIndicesFromHeaders_ completed - from cache', { cacheKey: cacheKey });
      return;
    }
    try {
      const lastCol = sheet.getLastColumn();
      if (lastCol < 1) {
        trace.complete('updateIndicesFromHeaders_ completed - no columns', { cacheKey: cacheKey });
        return;
      }
      const range = sheet.getRange(1, 1, Math.min(3, sheet.getLastRow()), lastCol);
      const values = range.getValues();
      let headerRowIndex = -1;
      const knownKey = Object.values(headerMap)[0];
      for (let r = 0; r < values.length; r++) {
        if (values[r].includes(knownKey)) {
          headerRowIndex = r;
          break;
        }
      }
      if (headerRowIndex === -1) {
        trace.complete('updateIndicesFromHeaders_ completed - no header row found', { cacheKey: cacheKey });
        return;
      }
      const headers = values[headerRowIndex];
      Object.keys(headerMap).forEach(function(key) {
        const headerText = headerMap[key];
        const colIdx = headers.indexOf(headerText);
        if (colIdx !== -1) {
          targetColsObj[key] = colIdx;
        }
      });
      COL_MAPPING_CACHE[cacheKey] = true;
      trace.complete('updateIndicesFromHeaders_ completed', { cacheKey: cacheKey, mappedKeys: Object.keys(headerMap).length });
    } catch (e) {
      try { UnifiedLogger.warn('Config', 'Failed to update indices', { cacheKey: cacheKey, error: String(e) }); } catch (ignore) {
        console.error('[Config] Error:', ignore.message, ignore.stack);
      }
      trace.fail('updateIndicesFromHeaders_ inner operation failed', e);
      throw e;
    }
  } catch (error) {
    trace.fail('updateIndicesFromHeaders_ failed', error);
    throw error;
  }
}

function getResolvedSheetNames() {
  const trace = UnifiedLogger.startTrace('Config', 'getResolvedSheetNames');
  try {
    if (typeof SHEET_NAMES !== 'undefined' && SHEET_NAMES) {
      trace.complete('getResolvedSheetNames completed - from global', {});
      return SHEET_NAMES;
    }
    const result = {
      XERO_READY: 'XERO_READY',
      CONFIG: 'Config',
      QUOTE_BUILDER: 'Quote_Builder',
      QUOTE_STAGING: 'Quote_Staging',
      CLIENT_VIEW: 'Client_View',
      INTERNAL_VIEW: 'Internal_View',
      VALIDATION_LOOKUPS: 'VALIDATION_LOOKUPS'
    };
    trace.complete('getResolvedSheetNames completed - default', {});
    return result;
  } catch (error) {
    trace.fail('getResolvedSheetNames failed', error);
    throw error;
  }
}

/**
 * Convenience accessor for Script Properties.
 * Now uses PropertiesCache for 20-40x speedup
 * @param {string} key
 * @return {string|null}
 */
function getScriptProperty(key) {
  // NO TRACE LOGGING - called too frequently during rate limiter checks
  try {
    if (!key) {
      return null;
    }
    try {
      // PropertiesCache has been deprecated - using direct PropertiesService access
      // TODO: Consider using ConfigurationManager for cached access
      const props = PropertiesService.getScriptProperties();
      const value = props ? props.getProperty(key) : null;
      return value;
    } catch (error) {
      // Fallback logging (UnifiedLogger may fail in error states)
      console.error('[Config] getScriptProperty failed', { key: key, error: String(error) });
      return null;
    }
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[Config] getScriptProperty failed (outer)', { key: key, error: String(error) });
    throw error;
  }
}

function throwConfigError(code, message) {
  const trace = UnifiedLogger.startTrace('Config', 'throwConfigError');
  try {
    trace.fail('throwConfigError - config error thrown', { code: code, message: message });
    if (typeof AppError !== 'undefined') {
      throw new AppError(code, message);
    }
    throw new Error(message || code || 'Configuration error');
  } catch (error) {
    trace.fail('throwConfigError failed', error);
    throw error;
  }
}

// ========================================
// PHASE 3: MUTEX LOCK FOR PARALLEL LOAD PREVENTION
// ========================================

/**
 * Mutex lock to prevent duplicate parallel getAllConfig() calls
 * Ensures only one config load happens at a time, queues concurrent calls
 *
 * Lazy initialization to prevent undefined errors
 * Use getConfigLock_() accessor instead of direct access
 */
let CONFIG_LOAD_LOCK = null;

/**
 * Get or initialize the config load lock (defensive lazy initialization)
 * @private
 * @return {Object} Lock object with locked flag and waiting array
 */
function getConfigLock_() {
  if (!CONFIG_LOAD_LOCK) {
    CONFIG_LOAD_LOCK = {
      locked: false,
      waiting: [],
      initialized: new Date().getTime()
    };
  }
  return CONFIG_LOAD_LOCK;
}

/**
 * Preload config and warm caches for fast access
 * Loads PropertiesCache in background for instant subsequent access
 *
 * Call this during onOpen() to warm caches before they're needed
 * @return {boolean} Success
 */
function preloadConfig() {
  const trace = UnifiedLogger.startTrace('Config', 'preloadConfig');
  try {
    // PropertiesCache has been deprecated - preloading no longer needed
    // TODO: Consider using ConfigurationManager for batch loading
    trace.complete('preloadConfig completed - PropertiesCache deprecated', {});
    return true; // Return true to maintain compatibility
  } catch (error) {
    trace.fail('preloadConfig failed', error);
    console.error('[Config] preloadConfig error:', error);
    return false;
  }
}

// getAllConfig() removed; use ConfigurationManager instead
// Use ConfigurationManager.get('properties.key.name') instead
// Use ConfigurationManager.invalidate() to clear caches

// Retry function for config loading
// IMPORTANT: This function MUST exist in globalThis for retry mechanism to work
function retryGetAllConfig() {
  const trace = UnifiedLogger.startTrace('Config', 'retryGetAllConfig');
  try {
    // Clear ConfigurationManager cache before retry
    if (typeof ConfigurationManager !== 'undefined' && ConfigurationManager.invalidate) {
      ConfigurationManager.invalidate();
    }
    if (typeof showSuccessToast === 'function') {
      showSuccessToast('Configuration Loaded', 'Configuration reloaded successfully.');
    }
    trace.complete('retryGetAllConfig completed');
    // Note: This function previously returned config object, but ConfigurationManager uses on-demand loading
    // Callers should use ConfigurationManager.get() for specific values
    return true;
  } catch (error) {
    trace.fail('retryGetAllConfig failed', error);
    if (typeof showErrorToast === 'function') {
      showErrorToast('Retry Failed', 'Unable to reload configuration. Please contact support.');
    }
    throw error;
  }
}

// Export retry function for retry mechanism (accessible via function name)
// No globalThis export needed - function is already in global scope


/**
 * Get configuration value by key
 * FORTIFICATION 7: Properties-first, sheet-second strategy
 *
 * @param {string} key - UPPER_SNAKE_CASE config key
 * @returns {*} Config value
 * @throws {Error} If key not found in either source
 */
function getConfigValue(key) {
  const trace = UnifiedLogger.startTrace('Config', 'getConfigValue');
  try {
    // Strategy: Try Script Properties first (secrets), then Config Sheet (business constants)

    // 1. Try Script Properties (for secrets like OPENAI_API_KEY)
    try {
      const configKey = 'properties.' + key.toLowerCase().replace(/_/g, '.');
      const value = ConfigurationManager.get(configKey);
      if (value !== undefined && value !== null) {
        trace.complete('getConfigValue - from Script Properties', { key: key });
        return value;
      }
    } catch (cmError) {
      // Not in Script Properties (expected for business constants), continue
    }

    // 2. Try Config Sheet (for business constants like DEFAULT_CURRENCY)
    try {
      const sheetKey = 'sheet.' + key; // e.g., 'sheet.DEFAULT_CURRENCY'
      const value = ConfigurationManager.get(sheetKey);
      if (value !== undefined && value !== null) {
        trace.complete('getConfigValue - from Config Sheet', { key: key });
        return value;
      }
    } catch (cmError) {
      // Not in Config Sheet either
    }

    // 3. Not found anywhere - show input placeholder and throw
    const sensitiveKeys = getConfigSensitiveKeys_();
    ensureConfigInputPlaceholder_(key, { sensitive: sensitiveKeys.indexOf(key) !== -1 });
    trace.fail('getConfigValue - key not found', { key: key });
    throwConfigError('CONFIG_ERROR', 'Config key not found: ' + key);
  } catch (error) {
    trace.fail('getConfigValue failed', error);
    throw error;
  }
}

/**
 * Get boolean configuration value
 * FORTIFICATION 7: Properties-first, sheet-second strategy
 *
 * @param {string} key - UPPER_SNAKE_CASE config key
 * @param {boolean} defaultValue - Default if not found or not boolean
 * @returns {boolean} Config value or default
 */
function getBooleanConfig(key, defaultValue) {
  const trace = UnifiedLogger.startTrace('Config', 'getBooleanConfig');
  try {
    const fallback = defaultValue !== undefined ? !!defaultValue : false;

    // Try Script Properties first
    try {
      const configKey = 'properties.' + key.toLowerCase().replace(/_/g, '.');
      const value = ConfigurationManager.get(configKey);
      if (value !== undefined && value !== null) {
        trace.complete('getBooleanConfig - from Script Properties', { key: key });
        return value === true || value === 'true' || value === 'TRUE';
      }
    } catch (cmError) {
      // Continue to Config Sheet
    }

    // Try Config Sheet second
    try {
      const sheetKey = 'sheet.' + key;
      const value = ConfigurationManager.get(sheetKey);
      if (value !== undefined && value !== null) {
        trace.complete('getBooleanConfig - from Config Sheet', { key: key });
        return value === true || value === 'true' || value === 'TRUE';
      }
    } catch (cmError) {
      // Not found
    }

    // Use default
    trace.complete('getBooleanConfig - using default', { key: key, defaultValue: defaultValue });
    return fallback;
  } catch (error) {
    trace.fail('getBooleanConfig failed', error);
    return fallback;
  }
}

/**
 * Resolve whether scope dynamic sections are enabled via config.
 * Memoized per execution to limit repeated sheet/property reads.
 * @return {boolean}
 */

// DELETED OLD SCHEMA FUNCTION: scopeDynamicSectionsEnabled (was lines 455-481)
// This feature flag controlled whether to use OLD nested sections schema (draft.sections)
// All OLD schema code has been deleted - this flag is no longer needed
// NEW schema uses flat scopeEntries array exclusively

/**
 * Fetch a sensitive configuration value from Script Properties.
 * @param {string} key
 * @return {string}
 */
function requireSecret(key) {
  const trace = UnifiedLogger.startTrace('Config', 'requireSecret');
  try {
    if (!key) {
      trace.fail('requireSecret - no key provided', {});
      throwConfigError('CONFIG_SECRET', 'Secret key name is required.');
    }
    const value = getScriptProperty(key);
    if (value && String(value).trim()) {
      trace.complete('requireSecret completed', { key: key, hasValue: true });
      return String(value).trim();
    }
    ensureConfigInputPlaceholder_(key, { sensitive: true });
    trace.fail('requireSecret - secret not found', { key: key });
    throwConfigError('CONFIG_SECRET', 'Missing secure key "' + key + '". Set it via Script Properties (Extensions → Apps Script → Project Settings → Script properties).');
  } catch (error) {
    trace.fail('requireSecret failed', error);
    throw error;
  }
}

/**
 * Persist a sensitive value into Script Properties (blank value deletes it).
 * @param {string} key
 * @param {string} value
 */
function setScriptSecret(key, value) {
  const trace = UnifiedLogger.startTrace('Config', 'setScriptSecret');
  try {
    if (!key) {
      trace.fail('setScriptSecret - no key provided', {});
      throwConfigError('CONFIG_SECRET', 'Secret key name is required for persistence.');
    }
    const props = PropertiesService.getScriptProperties();
    if (!props) {
      trace.fail('setScriptSecret - properties unavailable', { key: key });
      throwConfigError('CONFIG_SECRET', 'Script Properties unavailable for secret "' + key + '".');
    }
    if (value === undefined || value === null || value === '') {
      props.deleteProperty(key);
      trace.complete('setScriptSecret completed - deleted', { key: key });
      return;
    }
    const stringValue = String(value);
    const validation = validatePropertySize(stringValue, 9000);
    if (!validation.valid) {
      UnifiedLogger.warn('Config', 'Secret value too large for property', {
        key: key,
        size: validation.size,
        message: validation.message
      });
      trace.fail('setScriptSecret payload too large', new Error(validation.message));
      throw new Error('Secret value exceeds size limit: ' + validation.message);
    }
    props.setProperty(key, stringValue);
    trace.complete('setScriptSecret completed - set', { key: key });
  } catch (error) {
    trace.fail('setScriptSecret failed', error);
    throw error;
  }
}

function ensureConfigInputPlaceholder_(key, options) {
  const trace = UnifiedLogger.startTrace('Config', 'ensureConfigInputPlaceholder_');
  try {
    if (!key) {
      trace.complete('ensureConfigInputPlaceholder_ completed - no key', {});
      return;
    }
    const opts = options || {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.complete('ensureConfigInputPlaceholder_ completed - no spreadsheet', {});
      return;
    }
    const sheetNames = getResolvedSheetNames();
    const configSheet = ss.getSheetByName(sheetNames.CONFIG || 'Config');
    if (!configSheet) {
      trace.complete('ensureConfigInputPlaceholder_ completed - no config sheet', {});
      return;
    }
    const lastRow = Math.max(configSheet.getLastRow(), 1);
    const values = configSheet.getRange(1, 1, lastRow, 2).getValues();
    const existing = values.some(function(row) { return row && row[0] === key; });
    if (existing) {
      trace.complete('ensureConfigInputPlaceholder_ completed - already exists', { key: key });
      return;
    }
    const note = opts.sensitive ? 'Enter via Script Properties (secure)' : 'Provide value here';
    configSheet.appendRow([key, '']);
    try {
      configSheet.getRange(configSheet.getLastRow(), 2).setNote(note);
    } catch (ignored) {
      // Empty catch replaced with error logging
      console.error('[Config] Error:', ignored.message, ignored.stack);
    }
    trace.complete('ensureConfigInputPlaceholder_ completed - added placeholder', { key: key, sensitive: opts.sensitive });
  } catch (placeholderError) {
    try { UnifiedLogger.warn('Config', 'ensureConfigInputPlaceholder_ failed', { key: key, error: String(placeholderError) }); } catch (ignore) {
      console.error('[Config] Error:', ignore.message, ignore.stack);
    }
    trace.fail('ensureConfigInputPlaceholder_ failed', placeholderError);
  }
}

/**
 * Writes a value to the config sheet.
 * @param {Sheet} configSheet The config sheet.
 * @param {string} key The key to write.
 * @param {string} value The value to write.
 */
function writeConfigValue(configSheet, key, value) {
  const trace = UnifiedLogger.startTrace('Config', 'writeConfigValue');
  try {
    if (!configSheet) {
      trace.fail('writeConfigValue - no config sheet', {});
      throwConfigError('SHEET_MISSING', 'Config sheet not found');
    }
    const lastRow = Math.max(configSheet.getLastRow(), 1);
    const values = configSheet.getRange(1, 1, lastRow, 2).getValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === key) {
        configSheet.getRange(i + 1, 2).setValue(value);
        trace.complete('writeConfigValue completed - updated', { key: key, row: i + 1 });
        return;
      }
    }
    const targetRow = lastRow + 1;
    configSheet.getRange(targetRow, 1).setValue(key);
    configSheet.getRange(targetRow, 2).setValue(value);
    trace.complete('writeConfigValue completed - appended', { key: key, row: targetRow });
  } catch (error) {
    trace.fail('writeConfigValue failed', error);
    throw error;
  }
}

/**
 * Sets up the config sheet with required keys.
 */
function setupConfigSheet() {
  const trace = UnifiedLogger.startTrace('Config', 'setupConfigSheet');
  try {
    const requiredKeys = [
      'XERO_CLIENT_ID',
      'XERO_CLIENT_SECRET',
      'XERO_TENANT_ID',
      'OPENAI_API_KEY',
      'OPENAI_PROMPT_ID',
      'OPENAI_VECTOR_STORE_ID',
      'OPENAI_ASSISTANT_MODEL',
      'GOOGLE_PICKER_KEY'
    ];
    const safeKeys = requiredKeys.filter(function(key) {
      const sensitiveKeys = getConfigSensitiveKeys_();
      return sensitiveKeys.indexOf(key) === -1;
    });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getResolvedSheetNames();
    const configSheet = ss.getSheetByName(sheetNames.CONFIG);
    if (!configSheet) {
      trace.fail('setupConfigSheet - config sheet not found', {});
      throwConfigError('SHEET_MISSING', `Config sheet not found (expected tab name "${sheetNames.CONFIG}")`);
    }

    // Optimize getDataRange() to use specific range (70% faster)
    const lastRow = configSheet.getLastRow();
    const lastCol = Math.max(configSheet.getLastColumn(), 2); // At least 2 columns
    const data = lastRow > 0 ? configSheet.getRange(1, 1, lastRow, lastCol).getValues() : [];
    const existingKeys = data.map(row => row[0]);

    safeKeys.forEach(key => {
      if (existingKeys.indexOf(key) === -1) {
        configSheet.appendRow([key, '']);
        existingKeys.push(key);
      }
    });

    const secureReferenceKey = 'SECURE_KEYS_REFERENCE';
    if (existingKeys.indexOf(secureReferenceKey) === -1) {
      configSheet.appendRow([secureReferenceKey, 'See README "Managing Script Properties"']);
      existingKeys.push(secureReferenceKey);
    }

    SpreadsheetApp.getUi().alert('Config sheet setup complete. Please fill in the blank values.');
    trace.complete('setupConfigSheet completed', { keysAdded: safeKeys.length });
  } catch (error) {
    trace.fail('setupConfigSheet failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Setting up config sheet',
      correlationId: trace.correlationId
    });
    showErrorToast('Config Setup Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Copy sensitive values from the Config sheet into Script Properties and clear the sheet cells.
 * @return {{migrated:number, keys:Array<string>}}
 */
function migrateSheetSecretsToProperties() {
  const trace = UnifiedLogger.startTrace('Config', 'migrateSheetSecretsToProperties');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('migrateSheetSecretsToProperties - no active spreadsheet', {});
      throwConfigError('SHEET_ACCESS', 'No active spreadsheet available for migration.');
    }
    const sheetNames = getResolvedSheetNames();
    const configSheet = ss.getSheetByName(sheetNames.CONFIG);
    if (!configSheet) {
      trace.fail('migrateSheetSecretsToProperties - config sheet not found', {});
      throwConfigError('SHEET_MISSING', `Config sheet not found (expected "${sheetNames.CONFIG}")`);
    }

    // Optimize getDataRange() to use specific range (70% faster)
    const lastRow = configSheet.getLastRow();
    const lastCol = Math.max(configSheet.getLastColumn(), 2); // At least 2 columns
    const data = lastRow > 0 ? configSheet.getRange(1, 1, lastRow, lastCol).getValues() : [];

    if (!data || !data.length) {
      trace.fail('migrateSheetSecretsToProperties - config sheet empty', {});
      throwConfigError('CONFIG_EMPTY', 'Config sheet is empty.');
    }
    const migratedKeys = [];
    data.forEach(function(row, index) {
      const key = row[0];
      const sensitiveKeys = getConfigSensitiveKeys_();
      if (!key || sensitiveKeys.indexOf(key) === -1) {
        return;
      }
      const value = row[1];
      if (!value || !String(value).trim()) {
        return;
      }
      setScriptSecret(key, value);
      configSheet.getRange(index + 1, 2).clearContent();
      migratedKeys.push(key);
    });
    // NOTE: Hardcoded secrets removed for security (Bug #2 fix)
    // To set secrets, use: Extensions → Apps Script → Project Settings → Script properties
    // Required keys: OPENAI_VECTOR_STORE_ID, OPENAI_API_KEY, XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_TENANT_ID
    const summary = migratedKeys.length
      ? 'Migrated ' + migratedKeys.length + ' sensitive keys (' + migratedKeys.join(', ') + ').'
      : 'No sensitive keys found on Config sheet.';
    try { UnifiedLogger.info('Config', 'migrateSheetSecretsToProperties', { summary: summary }); } catch (ignore) {
        console.error('[Config] Error:', ignore.message, ignore.stack);
      }
    logToast_('Config Secret Migration', summary, 5, migratedKeys.length ? 'INFO' : 'WARN', { source: 'Config' });
    const result = {
      migrated: migratedKeys.length,
      keys: migratedKeys
    };
    trace.complete('migrateSheetSecretsToProperties completed', result);
    return result;
  } catch (error) {
    trace.fail('migrateSheetSecretsToProperties failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Migrating secrets to Script Properties',
      correlationId: trace.correlationId
    });
    showErrorToast('Secret Migration Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Get a JSON value from the Config sheet or fall back.
 * @param {string} key
 * @param {*} [fallback]
 * @return {*}
 */
function getConfigJson(key, fallback) {
  const trace = UnifiedLogger.startTrace('Config', 'getConfigJson');
  try {
    let raw;
    try {
      raw = getConfigValue(key);
    } catch (error) {
      if (fallback !== undefined) {
        trace.complete('getConfigJson completed - using fallback after error', { key: key });
        return fallback;
      }
      trace.fail('getConfigJson - config value not found', { key: key });
      throw error;
    }

    if (raw === undefined || raw === null || raw === '') {
      trace.complete('getConfigJson completed - empty value', { key: key, hasFallback: fallback !== undefined });
      return fallback !== undefined ? fallback : null;
    }

    try {
      const result = JSON.parse(raw);
      trace.complete('getConfigJson completed', { key: key });
      return result;
    } catch (parseError) {
      if (fallback !== undefined) {
        // Using fallback is expected behavior, not a warning-level issue
        trace.complete('getConfigJson completed - parse error, using fallback', { key: key });
        return fallback;
      }
      trace.fail('getConfigJson - JSON parse error', { key: key });
      throw parseError;
    }
  } catch (error) {
    trace.fail('getConfigJson failed', error);
    throw error;
  }
}


/**
 * Get active spreadsheet, or open the bound spreadsheet by ID when active context is missing.
 * @return {Spreadsheet}
 */
function getActiveSpreadsheet() {
  const trace = UnifiedLogger.startTrace('Config', 'getActiveSpreadsheet');
  try {
    try {
      const active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) {
        trace.complete('getActiveSpreadsheet completed - from active', {});
        return active;
      }
    } catch (activeError) {
      try { UnifiedLogger.warn('Config', 'getActiveSpreadsheet failed', String(activeError)); } catch (ignore) {
        console.error('[Config] Error:', ignore.message, ignore.stack);
      }
    }
    const fallbackId = getBoundSpreadsheetId();
    if (fallbackId) {
      try {
        const ss = SpreadsheetApp.openById(fallbackId);
        trace.complete('getActiveSpreadsheet completed - from bound ID', { id: fallbackId });
        return ss;
      } catch (openError) {
        try { UnifiedLogger.warn('Config', 'getActiveSpreadsheet openById failed', String(openError)); } catch (ignore) {
        console.error('[Config] Error:', ignore.message, ignore.stack);
      }
        trace.fail('getActiveSpreadsheet - unable to open bound spreadsheet', { id: fallbackId });
        throwConfigError('SHEET_MISSING', 'Unable to open bound spreadsheet: ' + fallbackId);
      }
    }
    trace.fail('getActiveSpreadsheet - no active spreadsheet', {});
    throwConfigError('SHEET_MISSING', 'No active spreadsheet available');
  } catch (error) {
    trace.fail('getActiveSpreadsheet failed', error);
    throw error;
  }
}

function getBoundSpreadsheetId() {
  const trace = UnifiedLogger.startTrace('Config', 'getBoundSpreadsheetId');
  try {
    try {
      const id = getConfigValue('BOUND_SPREADSHEET_ID');
      trace.complete('getBoundSpreadsheetId completed', { hasId: !!id });
      return id;
    } catch (configError) {
      trace.complete('getBoundSpreadsheetId completed - config error', {});
      return '';
    }
  } catch (error) {
    trace.fail('getBoundSpreadsheetId failed', error);
    throw error;
  }
}

/**
 * Get Quote_Builder sheet
 * @return {Sheet}
 */
function getQuoteBuilderSheet() {
  const trace = UnifiedLogger.startTrace('Config', 'getQuoteBuilderSheet');
  try {
    const ss = getActiveSpreadsheet();
    const sheetNames = getResolvedSheetNames();
    const sheet = ss.getSheetByName(sheetNames.QUOTE_BUILDER);

    if (!sheet) {
      trace.fail('getQuoteBuilderSheet - sheet not found', {});
      throwConfigError('SHEET_MISSING', 'Quote_Builder sheet not found');
    }

    updateIndicesFromHeaders_(sheet, QB_HEADER_MAP, QB_COLS, 'QB');
    trace.complete('getQuoteBuilderSheet completed', {});
    return sheet;
  } catch (error) {
    trace.fail('getQuoteBuilderSheet failed', error);
    throw error;
  }
}

/**
 * Get or create the hidden staging sheet used for quote builder writes.
 * @return {Sheet}
 */
function getQuoteStagingSheet() {
  const trace = UnifiedLogger.startTrace('Config', 'getQuoteStagingSheet');
  try {
    const ss = getActiveSpreadsheet();
    const sheetNames = getResolvedSheetNames();
    let sheet = ss.getSheetByName(sheetNames.QUOTE_STAGING);
    const builderSheet = getQuoteBuilderSheet();
    const totalColumns = builderSheet.getLastColumn();

    if (!sheet) {
      sheet = ss.insertSheet(sheetNames.QUOTE_STAGING);
      try {
        sheet.hideSheet();
      } catch (error) {
        try { UnifiedLogger.warn('Config', 'getQuoteStagingSheet: unable to hide staging sheet', String(error)); } catch (ignore) {
        console.error('[Config] Error:', ignore.message, ignore.stack);
      }
      }
      if (sheet.getMaxColumns() < totalColumns) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), totalColumns - sheet.getMaxColumns());
      }
      const headerRows = Math.min(3, builderSheet.getLastRow());
      if (headerRows > 0) {
        builderSheet.getRange(1, 1, headerRows, totalColumns)
          .copyTo(sheet.getRange(1, 1), SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
      }
      trace.info('getQuoteStagingSheet - created new staging sheet', { totalColumns: totalColumns, headerRows: headerRows });
    } else {
      const currentColumns = sheet.getMaxColumns();
      if (currentColumns < totalColumns) {
        sheet.insertColumnsAfter(currentColumns, totalColumns - currentColumns);
      }
    }
    const headerRows = Math.min(3, builderSheet.getLastRow());
    if (headerRows > 0) {
      try {
        builderSheet.getRange(1, 1, headerRows, totalColumns)
          .copyTo(sheet.getRange(1, 1, headerRows, totalColumns), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      } catch (formatError) {
        try { UnifiedLogger.warn('Config', 'getQuoteStagingSheet: header format sync failed', String(formatError)); } catch (ignore) {
        console.error('[Config] Error:', ignore.message, ignore.stack);
      }
      }
    }
    const targetRows = Math.max(builderSheet.getMaxRows(), 4);
    if (sheet.getMaxRows() < targetRows) {
      sheet.insertRowsAfter(sheet.getMaxRows(), targetRows - sheet.getMaxRows());
    }
    const dataRows = Math.max(targetRows - 3, 1);
    const builderValidationRange = builderSheet.getRange(4, 1, dataRows, totalColumns);
    const stagingValidationRange = sheet.getRange(4, 1, dataRows, totalColumns);
    try {
      builderValidationRange.copyTo(stagingValidationRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    } catch (validationError) {
      try { UnifiedLogger.warn('Config', 'getQuoteStagingSheet: validation copy failed', String(validationError)); } catch (ignore) {
        console.error('[Config] Error:', ignore.message, ignore.stack);
      }
    }

    trace.complete('getQuoteStagingSheet completed', { totalColumns: totalColumns, totalRows: targetRows });
    return sheet;
  } catch (error) {
    trace.fail('getQuoteStagingSheet failed', error);
    throw error;
  }
}

/**
 * Get XERO_READY sheet
 * @return {Sheet}
 */
function getXeroReadySheet() {
  const trace = UnifiedLogger.startTrace('Config', 'getXeroReadySheet');
  try {
    const ss = getActiveSpreadsheet();
    const sheetNames = getResolvedSheetNames();
    const sheet = ss.getSheetByName(sheetNames.XERO_READY);

    if (!sheet) {
      trace.fail('getXeroReadySheet - sheet not found', {});
      throwConfigError('SHEET_MISSING', 'XERO_READY sheet not found');
    }

    updateIndicesFromHeaders_(sheet, XERO_HEADER_MAP, XERO_COLS, 'XERO');
    trace.complete('getXeroReadySheet completed', {});
    return sheet;
  } catch (error) {
    trace.fail('getXeroReadySheet failed', error);
    throw error;
  }
}

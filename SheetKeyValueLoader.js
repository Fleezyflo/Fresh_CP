/**
 * SheetKeyValueLoader - Load arbitrary Config Sheet key-value pairs
 *
 * Purpose:
 * - Supports arbitrary UPPER_SNAKE_CASE config keys from Config Sheet
 * - Complements ConfigurationManager with sheet.* key pattern
 * - Cache-all strategy: Loads entire Config Sheet on first access
 *
 * Architecture:
 * - Single sheet read on first load (performance optimization)
 * - In-memory Map cache for O(1) lookups
 * - Value parsing: JSON, numbers, strings
 * - Graceful degradation: Missing sheet → empty cache, continue
 *
 * Integration:
 * - Used by ConfigurationManager for sheet.* keys
 * - Example: ConfigurationManager.get('sheet.DEFAULT_CURRENCY')
 *
 * Fortifications:
 * 1. Graceful degradation if Config Sheet missing
 * 2. Lazy initialization (no load order dependencies)
 * 3. Duplicate key detection and warnings
 * 4. JSON parse error handling with fallback
 * 5. Performance guard (abort if >5000 rows)
 * 6. Zero Config.js dependencies (no circular calls)
 * 7. Comprehensive logging with fallback
 * 8. Clear error messages
 *
 * @version 1.0.0
 * @since 2026-01-13 (Plan 10-05)
 */

// ============================================================================
// PRIVATE STATE
// ============================================================================

var configSheetCache_ = null; // Map or null (lazy loaded)
let cacheLoadAttempted_ = false; // Prevent retry loops

// ============================================================================
// PUBLIC API
// ============================================================================

const SheetKeyValueLoader = {
  /**
   * Load value for arbitrary Config Sheet key
   * @param {string} key - UPPER_SNAKE_CASE key (e.g., 'DEFAULT_CURRENCY')
   * @returns {*} Value from Config Sheet (string, number, or parsed JSON)
   *              Returns undefined if key not found
   */
  load: function(key) {
    try {
      // Ensure cache loaded (lazy initialization)
      if (!configSheetCache_ && !cacheLoadAttempted_) {
        loadAllConfigSheetEntries_();
      }

      // If cache failed to load, return undefined (graceful degradation)
      if (!configSheetCache_) {
        return undefined;
      }

      // O(1) lookup
      return configSheetCache_.get(key);
    } catch (error) {
      logError_('SheetKeyValueLoader.load failed', { key: key, error: error.message });
      return undefined; // Graceful degradation
    }
  },

  /**
   * Check if key exists in Config Sheet
   * @param {string} key - Key to check
   * @returns {boolean} True if exists
   */
  has: function(key) {
    try {
      if (!configSheetCache_ && !cacheLoadAttempted_) {
        loadAllConfigSheetEntries_();
      }

      if (!configSheetCache_) {
        return false;
      }

      return configSheetCache_.has(key);
    } catch (error) {
      logError_('SheetKeyValueLoader.has failed', { key: key, error: error.message });
      return false;
    }
  },

  /**
   * Invalidate cache for specific key or all keys
   * @param {string} [key] - Optional specific key to invalidate
   */
  invalidate: function(key) {
    try {
      if (key) {
        // Invalidate specific key
        if (configSheetCache_) {
          configSheetCache_.delete(key);
          logInfo_('SheetKeyValueLoader cache invalidated for key: ' + key);
        }
      } else {
        // Invalidate all
        configSheetCache_ = null;
        cacheLoadAttempted_ = false;
        logInfo_('SheetKeyValueLoader cache cleared');
      }
    } catch (error) {
      logError_('SheetKeyValueLoader.invalidate failed', { key: key, error: error.message });
    }
  }
};

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Load all Config Sheet entries into cache
 * Fortifications: Graceful degradation, duplicate detection, performance guard
 * @private
 */
function loadAllConfigSheetEntries_() {
  cacheLoadAttempted_ = true; // Prevent retry loops

  try {
    // Get Config Sheet (FORTIFICATION 6: Zero Config.js dependencies)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getResolvedSheetNames(); // From SheetConfigLoader pattern
    const configSheet = ss.getSheetByName(sheetNames.CONFIG);

    // FORTIFICATION 1: Graceful degradation if sheet missing
    if (!configSheet) {
      logWarn_('Config Sheet not found - SheetKeyValueLoader disabled');
      configSheetCache_ = new Map(); // Empty cache, prevent future loads
      return;
    }

    const lastRow = configSheet.getLastRow();

    // FORTIFICATION 5: Performance guard
    if (lastRow > 5000) {
      logError_('Config Sheet too large (' + lastRow + ' rows) - aborting load');
      configSheetCache_ = new Map(); // Empty cache
      return;
    }

    if (lastRow > 500) {
      logWarn_('Config Sheet large (' + lastRow + ' rows) - may impact performance');
    }

    // Read all rows (Column A = Key, Column B = Value)
    const data = lastRow > 0 ? configSheet.getRange(1, 1, lastRow, 2).getValues() : [];

    // Initialize cache
    configSheetCache_ = new Map();

    // FORTIFICATION 3: Duplicate key detection
    const duplicates = [];

    // Populate cache
    for (let i = 0; i < data.length; i++) {
      const key = data[i][0];
      const rawValue = data[i][1];

      // Skip empty rows
      if (!key || key === '') {
        continue;
      }

      // Detect duplicates
      if (configSheetCache_.has(key)) {
        duplicates.push(key);
      }

      // FORTIFICATION 4: Parse value with error handling
      const parsedValue = parseValue_(rawValue);

      // Store (last wins for duplicates)
      configSheetCache_.set(key, parsedValue);
    }

    // Warn about duplicates
    if (duplicates.length > 0) {
      logWarn_('Config Sheet duplicate keys detected (last wins): ' + duplicates.join(', '));
    }

    logInfo_('SheetKeyValueLoader loaded ' + configSheetCache_.size + ' entries from Config Sheet');
  } catch (error) {
    // FORTIFICATION 1: Graceful degradation on load failure
    logError_('SheetKeyValueLoader failed to load Config Sheet', { error: error.message, stack: error.stack });
    configSheetCache_ = new Map(); // Empty cache, allow system to continue
  }
}

/**
 * Parse Config Sheet value (JSON, number, or string)
 * FORTIFICATION 4: JSON parse error handling with fallback
 * @private
 * @param {*} rawValue - Raw value from sheet
 * @returns {*} Parsed value
 */
function parseValue_(rawValue) {
  // FORTIFICATION 8: Handle empty/null/undefined distinctly
  if (rawValue === null || rawValue === undefined) {
    return rawValue; // Preserve null vs undefined
  }

  if (rawValue === '') {
    return ''; // Preserve empty string
  }

  const str = String(rawValue).trim();

  // Try JSON parse for objects/arrays
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      return JSON.parse(str);
    } catch (e) {
      // FORTIFICATION 4: Fallback to string on parse failure
      logWarn_('Config Sheet value looks like JSON but failed to parse, using as string: ' + str.substring(0, 50));
      return rawValue; // Return original value
    }
  }

  // Try number parse
  if (!isNaN(str) && str !== '') {
    const num = Number(str);
    if (!isNaN(num)) {
      return num;
    }
  }

  // Return string as-is
  return rawValue;
}

// ============================================================================
// LOGGING HELPERS (FORTIFICATION 7: Logging-the-logger pattern)
// ============================================================================

/**
 * Log info message with fallback
 * @private
 */
function logInfo_(message, context) {
  try {
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && UnifiedLogger.log) {
      UnifiedLogger.log('SheetKeyValueLoader', message, context);
    } else {
      console.log('[SheetKeyValueLoader] ' + message, context || '');
    }
  } catch (e) {
    console.log('[SheetKeyValueLoader] ' + message, context || '');
  }
}

/**
 * Log warning with fallback
 * @private
 */
function logWarn_(message, context) {
  try {
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && UnifiedLogger.warn) {
      UnifiedLogger.warn('SheetKeyValueLoader', message, context);
    } else {
      console.warn('[SheetKeyValueLoader] ' + message, context || '');
    }
  } catch (e) {
    console.warn('[SheetKeyValueLoader] ' + message, context || '');
  }
}

/**
 * Log error with fallback
 * @private
 */
function logError_(message, context) {
  try {
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && UnifiedLogger.error) {
      UnifiedLogger.error('SheetKeyValueLoader', message, context);
    } else {
      console.error('[SheetKeyValueLoader] ' + message, context || '');
    }
  } catch (e) {
    console.error('[SheetKeyValueLoader] ' + message, context || '');
  }
}

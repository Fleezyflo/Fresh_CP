/**
 * SheetConfigLoader - Sheet-driven configuration loading
 *
 * Purpose:
 * - Load configuration from Config sheet tabs (Brief Profiles, Scope Phases, etc.)
 * - Manage sheet access with caching strategy (CacheService + snapshots)
 * - Validate loaded configurations using ConfigValidator
 * - Provide clean API for ConfigurationManager to delegate to
 *
 * Architecture:
 * - Extracted from ConfigLoader.js
 * - Focused on sheet loading only (no properties, no business rules)
 * - Uses CacheService for performance (60min TTL)
 * - Validates with ConfigValidator after loading
 *
 * Usage (via ConfigurationManager):
 * @example
 * // ConfigurationManager delegates to this loader
 * const briefProfiles = sheetLoader_.load('briefProfiles');
 * const scopePhases = sheetLoader_.load('scopePhases');
 *
 * @module SheetConfigLoader
 * @version 1.0.0
 *  */

// ===== Constants =====

const SHEET_CONFIG_LOG_CATEGORY = 'SheetConfigLoader';
const SHEET_CONFIG_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
const SHEET_CONFIG_SNAPSHOT_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const SHEET_CONFIG_VERSION = '1.0'; // SheetConfigLoader version

// Config tabs (from ConfigLoader.js)
const SHEET_CONFIG_TABS = {
  BRIEF_PROFILES: 'Config: Brief Profiles',
  SCOPE_PHASES: 'Config: Scope Phases',
  PHASE_TAXONOMY_OVERRIDES: 'Config: Phase Taxonomy Overrides',
  CATALOG_PREFIXES: 'Config: Catalog Prefixes',
  RESOURCE_CATALOG: 'Config: Resource Catalog',
  SCOPE_CATALOG: 'Config: Scope Catalog',
  COLUMN_MAP: 'Config: Column Map'
};

// Expected headers for validation (from ConfigLoader.js)
const SHEET_EXPECTED_HEADERS = {};
SHEET_EXPECTED_HEADERS[SHEET_CONFIG_TABS.BRIEF_PROFILES] = [
  'briefType', 'label', 'nudge', 'sectionOrderCSV', 'optionalSectionsCSV', 'catalogPrefixesCSV',
  'signatureCuesCSV', 'fallback', 'active', 'priority'
];
SHEET_EXPECTED_HEADERS[SHEET_CONFIG_TABS.SCOPE_PHASES] = [
  'briefType', 'phaseId', 'label', 'canonical', 'required', 'order', 'ancillaryFeeFlagsCSV',
  'cadence', 'deliverableHint', 'signalHint', 'synonymsCSV', 'taxonomyHintJSON', 'active'
];
SHEET_EXPECTED_HEADERS[SHEET_CONFIG_TABS.PHASE_TAXONOMY_OVERRIDES] = [
  'briefType', 'phaseCanonical', 'purpose', 'keyDeliverablesCSV', 'signalsCSV', 'keywordsCSV', 'boundaryHint'
];
SHEET_EXPECTED_HEADERS[SHEET_CONFIG_TABS.CATALOG_PREFIXES] = ['briefType', 'prefix', 'prefixCategory', 'categoryPhaseHint', 'priority', 'active'];
SHEET_EXPECTED_HEADERS[SHEET_CONFIG_TABS.RESOURCE_CATALOG] = [
  'code', 'name', 'unit', 'rate', 'category', 'source', 'description', 'pricingMode', 'status', 'metadataJSON'
];
SHEET_EXPECTED_HEADERS[SHEET_CONFIG_TABS.SCOPE_CATALOG] = [
  'scopeId', 'label', 'canonical', 'briefType', 'phaseId', 'ancillaryFeeFlagsCSV', 'order', 'notes', 'aliasesCSV'
];
SHEET_EXPECTED_HEADERS[SHEET_CONFIG_TABS.COLUMN_MAP] = ['key', 'value'];

// ===== Private Helpers =====

/**
 * Log event with fallback (logging-the-logger pattern)
 * @private
 */
function logSheetConfigEvent_(level, message, details) {
  try {
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger[level.toLowerCase()] === 'function') {
      UnifiedLogger[level.toLowerCase()](SHEET_CONFIG_LOG_CATEGORY, message, details);
    } else {
      console.error('SheetConfigLoader: UnifiedLogger not available, using console fallback');
    }
  } catch (logError) {
    // Fallback if logger fails
    console.error('SheetConfigLoader logging failed:', String(logError));
  }
}

/**
 * Normalize header key for matching (trim + lowercase)
 * @private
 */
function normalizeHeaderKey_(value) {
  // normalizeString is globally available from 00_NormalizationUtils.js
  return normalizeString(value, { trim: true, lowercase: true });
}

/**
 * Check if timestamp is still fresh (within TTL)
 * @private
 */
function isTimestampFresh_(timestamp, ttlMs) {
  if (!timestamp || !ttlMs) {
    return false;
  }
  try {
    const parsed = Date.parse(timestamp);
    if (isNaN(parsed)) {
      return false;
    }
    return new Date().getTime() - parsed <= ttlMs;
  } catch (error) {
    logSheetConfigEvent_('warn', 'Timestamp freshness check failed', { timestamp: timestamp, error: String(error) });
    return false;
  }
}

/**
 * Build column index map for flexible header matching
 * @private
 */
function buildColumnMap_(headers, expectedHeaders) {
  const columnMap = {};
  const normalizedHeaders = headers.map(normalizeHeaderKey_);

  expectedHeaders.forEach(function(headerName) {
    const normalized = normalizeHeaderKey_(headerName);
    const index = normalizedHeaders.indexOf(normalized);
    if (index !== -1) {
      columnMap[headerName] = index;
    }
  });

  return columnMap;
}

/**
 * Validate sheet headers are present
 * @private
 */
function validateHeaders_(tabName, headers) {
  const expectedHeaders = SHEET_EXPECTED_HEADERS[tabName] || [];
  if (!expectedHeaders.length) {
    return; // No validation criteria
  }

  const normalizedHeaders = headers.map(normalizeHeaderKey_);
  const missingRequired = [];

  expectedHeaders.forEach(function(expectedHeader) {
    const normalized = normalizeHeaderKey_(expectedHeader);
    if (normalizedHeaders.indexOf(normalized) === -1) {
      missingRequired.push(expectedHeader);
    }
  });

  if (missingRequired.length) {
    const message = 'Missing required columns in ' + tabName + ': ' + missingRequired.join(', ');
    throw new Error(message);
  }
}

/**
 * Get cache key for config type
 * @private
 */
function getCacheKey_(configType) {
  return 'sheet_config_' + configType + '_v' + SHEET_CONFIG_VERSION;
}

/**
 * Get cached config if fresh
 * @private
 */
function getCached_(configType) {
  try {
    const cacheKey = getCacheKey_(configType);
    const cache = CacheService.getScriptCache();
    const cached = cache.get(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.timestamp && isTimestampFresh_(parsed.timestamp, SHEET_CONFIG_CACHE_TTL_MS)) {
          logSheetConfigEvent_('verbose', 'Cache hit', { configType: configType });
          return parsed.data;
        } else {
          logSheetConfigEvent_('verbose', 'Cache stale', { configType: configType });
        }
      } catch (parseError) {
        logSheetConfigEvent_('warn', 'Cache parse failed', { configType: configType, error: String(parseError) });
      }
    }

    return null;
  } catch (error) {
    logSheetConfigEvent_('warn', 'Cache read failed', { configType: configType, error: String(error) });
    return null;
  }
}

/**
 * Store config in cache
 * @private
 */
function setCached_(configType, data) {
  try {
    const cacheKey = getCacheKey_(configType);
    const cache = CacheService.getScriptCache();
    const payload = {
      data: data,
      timestamp: new Date().toISOString(),
      version: SHEET_CONFIG_VERSION
    };

    const payloadJson = JSON.stringify(payload);

    // CacheService limit: 100KB per entry
    // Check size before attempting to cache to avoid silent failures
    const sizeBytes = Utilities.newBlob(payloadJson, 'text/plain', 'UTF-8').getBytes().length;
    const maxSize = 100000; // 100KB limit

    if (sizeBytes > maxSize) {
      // Skip caching large configs - this is expected behavior, not an error
      logSheetConfigEvent_('verbose', 'Config too large for cache, skipping', {
        configType: configType,
        sizeBytes: sizeBytes,
        maxSize: maxSize,
        itemCount: data.length
      });
      return; // Skip caching, load from sheet each time
    }

    cache.put(cacheKey, payloadJson, Math.floor(SHEET_CONFIG_CACHE_TTL_MS / 1000));
    logSheetConfigEvent_('verbose', 'Config cached', { configType: configType, sizeBytes: sizeBytes });
  } catch (error) {
    logSheetConfigEvent_('warn', 'Cache write failed', { configType: configType, error: String(error) });
    // Don't throw - caching failure shouldn't block operations
  }
}

/**
 * Load sheet data into array of objects
 * @private
 */
function loadSheetData_(tabName, expectedHeaders) {
  try {
    logSheetConfigEvent_('info', 'Loading sheet', { tabName: tabName });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(tabName);

    if (!sheet) {
      throw new Error('Sheet not found: ' + tabName);
    }

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    if (!values || !values.length || values.length < 2) {
      logSheetConfigEvent_('warn', 'Sheet empty or no data rows', { tabName: tabName });
      return [];
    }

    const headers = values[0];
    validateHeaders_(tabName, headers);

    const columnMap = buildColumnMap_(headers, expectedHeaders);
    const results = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const obj = {};

      expectedHeaders.forEach(function(headerName) {
        const colIndex = columnMap[headerName];
        if (colIndex !== undefined) {
          obj[headerName] = row[colIndex];
        } else {
          obj[headerName] = null; // Missing column
        }
      });

      results.push(obj);
    }

    logSheetConfigEvent_('info', 'Sheet loaded', { tabName: tabName, rows: results.length });
    return results;

  } catch (error) {
    logSheetConfigEvent_('error', 'Sheet load failed', { tabName: tabName, error: String(error) });
    throw error;
  }
}

/**
 * Validate loaded config using ConfigValidator
 * @private
 */
function validateConfig_(configType, data) {
  try {
    if (typeof ConfigValidator !== 'undefined' && ConfigValidator && typeof ConfigValidator.validate === 'function') {
      const validationResult = ConfigValidator.validate(configType, data);
      if (validationResult && !validationResult.valid) {
        logSheetConfigEvent_('warn', 'Config validation failed', {
          configType: configType,
          errors: validationResult.errors
        });
        // Log but don't throw - allow loading to continue
      } else {
        logSheetConfigEvent_('verbose', 'Config validation passed', { configType: configType });
      }
    }
    // ConfigValidator is optional - no warning needed if not available
  } catch (validationError) {
    logSheetConfigEvent_('warn', 'Config validation error', {
      configType: configType,
      error: String(validationError)
    });
    // Don't throw - validation failure shouldn't block loading
  }
}

// ===== Public API =====

/**
 * Load configuration by type
 *
 * @param {string} configType - Config type to load (e.g., 'briefProfiles', 'scopePhases')
 * @returns {Array<Object>|Object} Configuration data
 * @throws {Error} If loading fails critically
 *
 * @example
 * const briefProfiles = SheetConfigLoader.load('briefProfiles');
 * const scopePhases = SheetConfigLoader.load('scopePhases');
 */
function load(configType) {
  try {
    logSheetConfigEvent_('info', 'Load request', { configType: configType });

    // Check cache first
    const cached = getCached_(configType);
    if (cached) {
      return cached;
    }

    // Load from sheet based on type
    let tabName, expectedHeaders, data;

    switch (configType) {
      case 'briefProfiles':
        tabName = SHEET_CONFIG_TABS.BRIEF_PROFILES;
        expectedHeaders = SHEET_EXPECTED_HEADERS[tabName];
        data = loadSheetData_(tabName, expectedHeaders);
        break;

      case 'scopePhases':
        tabName = SHEET_CONFIG_TABS.SCOPE_PHASES;
        expectedHeaders = SHEET_EXPECTED_HEADERS[tabName];
        data = loadSheetData_(tabName, expectedHeaders);
        break;

      case 'taxonomyOverrides':
        tabName = SHEET_CONFIG_TABS.PHASE_TAXONOMY_OVERRIDES;
        expectedHeaders = SHEET_EXPECTED_HEADERS[tabName];
        data = loadSheetData_(tabName, expectedHeaders);
        break;

      case 'catalogPrefixes':
        tabName = SHEET_CONFIG_TABS.CATALOG_PREFIXES;
        expectedHeaders = SHEET_EXPECTED_HEADERS[tabName];
        data = loadSheetData_(tabName, expectedHeaders);
        break;

      case 'resourceCatalog':
        tabName = SHEET_CONFIG_TABS.RESOURCE_CATALOG;
        expectedHeaders = SHEET_EXPECTED_HEADERS[tabName];
        data = loadSheetData_(tabName, expectedHeaders);
        break;

      case 'scopeCatalog':
        tabName = SHEET_CONFIG_TABS.SCOPE_CATALOG;
        expectedHeaders = SHEET_EXPECTED_HEADERS[tabName];
        data = loadSheetData_(tabName, expectedHeaders);
        break;

      case 'columnMap':
        tabName = SHEET_CONFIG_TABS.COLUMN_MAP;
        expectedHeaders = SHEET_EXPECTED_HEADERS[tabName];
        data = loadSheetData_(tabName, expectedHeaders);
        break;

      default:
        throw new Error('Unknown config type: ' + configType);
    }

    // Validate loaded data
    validateConfig_(configType, data);

    // Strip verbose fields from scope phases to reduce cache size (US-014-002-MAIN)
    if (configType === 'scopePhases' && data && Array.isArray(data)) {
      const originalData = data;
      data = data.map(phase => ({
        canonical: phase.canonical,
        label: phase.label,
        briefType: phase.briefType,
        taxonomyHintJSON: phase.taxonomyHintJSON ? {
          code: phase.taxonomyHintJSON.code || ''
        } : {}
      }));

      // Log size reduction
      const originalSize = JSON.stringify(originalData).length;
      const strippedSize = JSON.stringify(data).length;
      logSheetConfigEvent_('info', 'Stripped scope phases config', {
        originalSize: originalSize,
        strippedSize: strippedSize,
        reduction: Math.round((1 - strippedSize/originalSize) * 100) + '%'
      });
    }

    // Cache for next time
    setCached_(configType, data);

    logSheetConfigEvent_('info', 'Load complete', { configType: configType, items: data.length });
    return data;

  } catch (error) {
    logSheetConfigEvent_('error', 'Load failed', { configType: configType, error: String(error) });
    throw error;
  }
}

/**
 * Check if config type is supported
 *
 * @param {string} configType - Config type to check
 * @returns {boolean} True if supported
 *
 * @example
 * if (SheetConfigLoader.has('briefProfiles')) {
 *   const profiles = SheetConfigLoader.load('briefProfiles');
 * }
 */
function has(configType) {
  const supportedTypes = [
    'briefProfiles',
    'scopePhases',
    'taxonomyOverrides',
    'catalogPrefixes',
    'resourceCatalog',
    'scopeCatalog',
    'columnMap'
  ];

  return supportedTypes.indexOf(configType) !== -1;
}

/**
 * Clear cache for config type
 *
 * @param {string} [configType] - Specific type to clear, or all if omitted
 *
 * @example
 * SheetConfigLoader.invalidate('briefProfiles'); // Clear specific
 * SheetConfigLoader.invalidate(); // Clear all
 */
function invalidate(configType) {
  try {
    const cache = CacheService.getScriptCache();

    if (configType) {
      const cacheKey = getCacheKey_(configType);
      cache.remove(cacheKey);
      logSheetConfigEvent_('info', 'Cache invalidated', { configType: configType });
    } else {
      // Clear all sheet config cache entries
      const types = ['briefProfiles', 'scopePhases', 'taxonomyOverrides', 'catalogPrefixes', 'resourceCatalog', 'scopeCatalog', 'columnMap'];
      types.forEach(function(type) {
        const cacheKey = getCacheKey_(type);
        cache.remove(cacheKey);
      });
      logSheetConfigEvent_('info', 'All sheet config cache cleared', {});
    }
  } catch (error) {
    logSheetConfigEvent_('warn', 'Cache invalidation failed', {
      configType: configType || 'all',
      error: String(error)
    });
    // Don't throw - cache invalidation failure shouldn't block operations
  }
}

// ===== Module Exports (Apps Script pattern) =====

/**
 * Export SheetConfigLoader API
 * Apps Script doesn't have standard exports, so we expose functions directly
 */
const SheetConfigLoader = {
  load: load,
  has: has,
  invalidate: invalidate
};

/**
 * PropertiesLoader - Script Properties + Cache access for ConfigurationManager
 *
 * Purpose:
 * - Load Script Properties (secrets, credentials, API keys)
 * - Provide caching layer for performance (batch load, in-memory cache)
 * - Security-conscious logging (log keys only, never values)
 * - Integrate with ConfigurationManager's dotted key notation
 *
 * Architecture:
 * - Adapted from 00_PropertiesCache.js (Phase 5 Plan 3)
 * - Focused loader for ConfigurationManager use
 * - Batch loads all properties in one API call (fast!)
 * - In-memory cache for instant subsequent access
 *
 * Security:
 * - Properties contain secrets - NEVER log values
 * - Log access at VERBOSE level only
 * - Sanitize all logged details
 *
 * Usage (via ConfigurationManager):
 * @example
 * // ConfigurationManager delegates to this loader
 * const apiKey = ConfigurationManager.get('properties.openai.apiKey');
 * const xeroId = ConfigurationManager.get('properties.xero.clientId');
 *
 * @module PropertiesLoader
 * @version 1.0.0
 * @since Phase 5 Plan 3
 */

// ===== Constants =====

const PROPERTIES_LOADER_LOG_CATEGORY = 'PropertiesLoader';
const PROPERTIES_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
const PROPERTIES_LOADER_VERSION = '1.0'; // PropertiesLoader version

// ===== Private State =====

/**
 * In-memory cache of loaded properties
 * @type {Object}
 * @private
 */
var propertiesCache_ = null;

/**
 * Cache loaded flag
 * @type {boolean}
 * @private
 */
var propertiesCacheLoaded_ = false;

/**
 * Cache load timestamp
 * @type {number}
 * @private
 */
var propertiesCacheTimestamp_ = 0;

// ===== Private Helpers =====

/**
 * Log event with security-conscious sanitization (logging-the-logger pattern)
 * @private
 */
function logPropertiesEvent_(level, message, details) {
  try {
    // Sanitize details - NEVER log property values (security!)
    const sanitized = {};
    if (details) {
      if (details.key) {
        sanitized.key = details.key; // Key is safe to log
      }
      if (details.keysCount !== undefined) {
        sanitized.keysCount = details.keysCount;
      }
      if (details.duration !== undefined) {
        sanitized.duration = details.duration;
      }
      if (details.cached !== undefined) {
        sanitized.cached = details.cached;
      }
      if (details.error) {
        sanitized.error = String(details.error);
      }
    }

    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger[level.toLowerCase()] === 'function') {
      UnifiedLogger[level.toLowerCase()](PROPERTIES_LOADER_LOG_CATEGORY, message, sanitized);
    } else {
      console.error('PropertiesLoader: UnifiedLogger not available, using console fallback');
    }
  } catch (logError) {
    // Fallback if logger fails
    console.error('PropertiesLoader logging failed:', String(logError));
  }
}

/**
 * Check if cache is still fresh (within TTL)
 * @private
 */
function isCacheFresh_() {
  if (!propertiesCacheLoaded_ || !propertiesCache_) {
    return false;
  }

  const now = new Date().getTime();
  const age = now - propertiesCacheTimestamp_;
  return age <= PROPERTIES_CACHE_TTL_MS;
}

/**
 * Load all properties from Script Properties in one batch call
 * @private
 */
function loadPropertiesCache_() {
  try {
    const startTime = new Date().getTime();

    logPropertiesEvent_('verbose', 'Loading properties cache', {});

    // Batch load ALL properties in ONE API call (fast!)
    const props = PropertiesService.getScriptProperties();
    propertiesCache_ = props.getProperties();

    propertiesCacheLoaded_ = true;
    propertiesCacheTimestamp_ = startTime;

    const duration = new Date().getTime() - startTime;

    logPropertiesEvent_('verbose', 'Properties cache loaded', {
      keysCount: Object.keys(propertiesCache_).length,
      duration: duration
    });

    return true;
  } catch (error) {
    logPropertiesEvent_('error', 'Failed to load properties cache', {
      error: String(error)
    });

    propertiesCacheLoaded_ = false;
    propertiesCache_ = {};
    propertiesCacheTimestamp_ = 0;

    return false;
  }
}

/**
 * Parse dotted key to property key
 * Converts 'openai.apiKey' to 'OPENAI_API_KEY' format
 * @private
 */
function parsePropertyKey_(dottedKey) {
  // Handle different key formats:
  // 'openai.apiKey' → 'OPENAI_API_KEY'
  // 'xero.clientId' → 'XERO_CLIENT_ID'

  const parts = dottedKey.split('.');
  const converted = parts.map(function(part) {
    // Convert camelCase to UPPER_SNAKE_CASE
    return part.replace(/([A-Z])/g, '_$1').toUpperCase();
  });

  return converted.join('_');
}

// ===== Public API =====

/**
 * Load property by key
 *
 * @param {string} key - Property key in dotted notation (e.g., 'openai.apiKey', 'xero.clientId')
 * @returns {string|null} Property value or null if not found
 * @throws {Error} If loading fails critically
 *
 * @example
 * const apiKey = PropertiesLoader.load('openai.apiKey');
 * const clientId = PropertiesLoader.load('xero.clientId');
 */
function load(key) {
  try {
    logPropertiesEvent_('verbose', 'Load property request', { key: key, cached: isCacheFresh_() });

    // Ensure cache is loaded and fresh
    if (!isCacheFresh_()) {
      const loaded = loadPropertiesCache_();
      if (!loaded) {
        throw new Error('Failed to load properties cache');
      }
    }

    // Parse dotted key to property key format
    const propertyKey = parsePropertyKey_(key);

    // Get from cache
    const value = propertiesCache_[propertyKey] || null;

    logPropertiesEvent_('verbose', 'Property loaded', {
      key: key,
      found: value !== null
    });

    return value;

  } catch (error) {
    logPropertiesEvent_('error', 'Load property failed', {
      key: key,
      error: String(error)
    });
    throw error;
  }
}

/**
 * Save property value
 *
 * @param {string} key - Property key in dotted notation
 * @param {string} value - Property value
 *
 * @example
 * PropertiesLoader.save('openai.apiKey', 'sk-...');
 */
function save(key, value) {
  try {
    logPropertiesEvent_('verbose', 'Save property request', { key: key });

    const propertyKey = parsePropertyKey_(key);

    // Validate payload size
    const validation = validatePropertySize(value, 9000);
    if (!validation.valid) {
      logPropertiesEvent_('error', 'Property value too large', {
        key: key,
        size: validation.size,
        message: validation.message
      });
      throw new Error('Property value exceeds size limit: ' + validation.message);
    }

    // Save to Script Properties
    const props = PropertiesService.getScriptProperties();
    props.setProperty(propertyKey, value);

    // Update cache if loaded
    if (propertiesCacheLoaded_ && propertiesCache_) {
      propertiesCache_[propertyKey] = value;
    }

    logPropertiesEvent_('verbose', 'Property saved', { key: key });

  } catch (error) {
    logPropertiesEvent_('error', 'Save property failed', {
      key: key,
      error: String(error)
    });
    throw error;
  }
}

/**
 * Remove property
 *
 * @param {string} key - Property key in dotted notation
 *
 * @example
 * PropertiesLoader.remove('openai.apiKey');
 */
function remove(key) {
  try {
    logPropertiesEvent_('verbose', 'Remove property request', { key: key });

    const propertyKey = parsePropertyKey_(key);

    // Delete from Script Properties
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(propertyKey);

    // Update cache if loaded
    if (propertiesCacheLoaded_ && propertiesCache_) {
      delete propertiesCache_[propertyKey];
    }

    logPropertiesEvent_('verbose', 'Property removed', { key: key });

  } catch (error) {
    logPropertiesEvent_('warn', 'Remove property failed', {
      key: key,
      error: String(error)
    });
    // Don't throw - removal failure shouldn't block operations
  }
}

/**
 * Check if property exists
 *
 * @param {string} key - Property key in dotted notation
 * @returns {boolean} True if property exists
 *
 * @example
 * if (PropertiesLoader.has('openai.apiKey')) {
 *   const key = PropertiesLoader.load('openai.apiKey');
 * }
 */
function has(key) {
  try {
    // Ensure cache is loaded
    if (!isCacheFresh_()) {
      loadPropertiesCache_();
    }

    const propertyKey = parsePropertyKey_(key);
    return propertiesCache_ && (propertyKey in propertiesCache_);

  } catch (error) {
    logPropertiesEvent_('warn', 'Has check failed', {
      key: key,
      error: String(error)
    });
    return false;
  }
}

/**
 * Invalidate properties cache
 *
 * @param {string} [key] - Specific key to invalidate (not yet implemented - invalidates all)
 *
 * @example
 * PropertiesLoader.invalidate(); // Clear cache
 */
function invalidate(key) {
  try {
    logPropertiesEvent_('verbose', 'Invalidate cache', { key: key || 'all' });

    // Clear cache (will reload on next access)
    propertiesCache_ = null;
    propertiesCacheLoaded_ = false;
    propertiesCacheTimestamp_ = 0;

    logPropertiesEvent_('verbose', 'Cache invalidated', {});

  } catch (error) {
    logPropertiesEvent_('warn', 'Invalidate failed', {
      error: String(error)
    });
    // Don't throw - invalidation failure shouldn't block operations
  }
}

// ===== Module Exports (Apps Script pattern) =====

/**
 * Export PropertiesLoader API
 * Apps Script doesn't have standard exports, so we expose functions directly
 */
const PropertiesLoader = {
  load: load,
  save: save,
  remove: remove,
  has: has,
  invalidate: invalidate
};

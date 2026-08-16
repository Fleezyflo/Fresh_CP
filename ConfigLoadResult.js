/**
 * ConfigLoadResult - Standard result object for all config load operations
 * Error Propagation
 * @version 1.0
 */

/**
 * Create a new ConfigLoadResult object
 * @param {Object} options - Initial configuration
 * @returns {ConfigLoadResult}
 */
function createConfigLoadResult(options) {
  const opts = options || {};

  return {
    // Success indicator
    success: opts.success !== undefined ? opts.success : false,

    // Actual config data (null on failure)
    data: opts.data || null,

    // Errors encountered (recoverable or fatal)
    errors: opts.errors || [],

    // Non-blocking warnings
    warnings: opts.warnings || [],

    // Load metadata
    metadata: {
      loadedAt: opts.loadedAt || new Date().toISOString(),
      source: opts.source || null,  // 'cache' | 'sheet' | 'snapshot' | 'default'
      version: opts.version || '2.0',
      checksumValid: opts.checksumValid !== undefined ? opts.checksumValid : false,
      cacheAge: opts.cacheAge || 0,
      retryCount: opts.retryCount || 0,
      loadDuration: opts.loadDuration || 0
    }
  };
}

/**
 * Add an error to the result object
 * @param {ConfigLoadResult} result
 * @param {Object} error
 */
function addConfigError(result, error) {
  result.errors.push({
    code: error.code || 'UNKNOWN_ERROR',
    message: error.message || 'Unknown error occurred',
    severity: error.severity || 'MEDIUM',  // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    recoverable: error.recoverable !== undefined ? error.recoverable : true,
    context: error.context || {}
  });
  result.success = false;
}

/**
 * Add a warning to the result object
 * @param {ConfigLoadResult} result
 * @param {Object} warning
 */
function addConfigWarning(result, warning) {
  result.warnings.push({
    code: warning.code || 'UNKNOWN_WARNING',
    message: warning.message || 'Unknown warning',
    context: warning.context || {}
  });
}

/**
 * Mark result as successful with data
 * @param {ConfigLoadResult} result
 * @param {*} data
 * @param {string} source - 'cache' | 'sheet' | 'snapshot' | 'default'
 */
function setConfigSuccess(result, data, source) {
  result.success = true;
  result.data = data;
  result.metadata.source = source;
}

/**
 * Create an error result for missing sheet
 * @param {string} sheetName
 * @param {number} startTime
 * @returns {ConfigLoadResult}
 */
function createSheetNotFoundError(sheetName, startTime) {
  const result = createConfigLoadResult({ loadedAt: new Date().toISOString() });
  addConfigError(result, {
    code: 'SHEET_NOT_FOUND',
    message: `Config sheet "${sheetName}" not found`,
    severity: 'CRITICAL',
    recoverable: false,
    context: { sheetName: sheetName }
  });
  result.metadata.loadDuration = Date.now() - startTime;
  return result;
}

/**
 * Create an error result for header validation failure
 * @param {string} errorMessage
 * @param {Object} context
 * @param {number} startTime
 * @returns {ConfigLoadResult}
 */
function createHeaderValidationError(errorMessage, context, startTime) {
  const result = createConfigLoadResult({ loadedAt: new Date().toISOString() });
  addConfigError(result, {
    code: 'HEADER_VALIDATION_FAILED',
    message: errorMessage,
    severity: 'HIGH',
    recoverable: true,
    context: context
  });
  result.metadata.loadDuration = Date.now() - startTime;
  return result;
}

/**
 * Create an error result for unexpected errors
 * @param {Error} error
 * @param {number} startTime
 * @returns {ConfigLoadResult}
 */
function createUnexpectedError(error, startTime) {
  const result = createConfigLoadResult({ loadedAt: new Date().toISOString() });
  addConfigError(result, {
    code: 'UNEXPECTED_ERROR',
    message: error.toString(),
    severity: 'CRITICAL',
    recoverable: false,
    context: {
      stack: error.stack || 'No stack trace available',
      name: error.name || 'Error'
    }
  });
  result.metadata.loadDuration = Date.now() - startTime;
  return result;
}

/**
 * V2 UNWRAPPER UTILITIES
 * Functions to safely extract data from ConfigLoadResult objects
 * Handles both V1 (raw data) and V2 (ConfigLoadResult) patterns
 */

/**
 * Check if an object is a ConfigLoadResult (V2 pattern)
 * @param {*} obj - Object to check
 * @returns {boolean} True if object is a ConfigLoadResult
 */
function isConfigLoadResult(obj) {
  return obj &&
    typeof obj === 'object' &&
    obj.hasOwnProperty('success') &&
    obj.hasOwnProperty('data') &&
    obj.hasOwnProperty('metadata');
}

/**
 * Unwrap ConfigLoadResult to get raw data
 * Handles both V1 (raw data) and V2 (ConfigLoadResult) patterns
 * @param {*} result - Either raw data (V1) or ConfigLoadResult (V2)
 * @param {Object} options - Unwrap options
 * @param {*} options.fallbackValue - Value to return on complete failure (default: null)
 * @param {boolean} options.throwOnError - Throw error on failure (default: false)
 * @param {boolean} options.logErrors - Log errors to ErrorBoundary (default: true)
 * @param {string} options.configName - Config name for logging (default: 'unknown')
 * @returns {*} Raw data or fallback value
 */
function unwrapConfigResult(result, options) {
  options = options || {};
  const fallbackValue = options.fallbackValue !== undefined ? options.fallbackValue : null;
  const throwOnError = options.throwOnError !== undefined ? options.throwOnError : false;
  const logErrors = options.logErrors !== undefined ? options.logErrors : true;
  const configName = options.configName || 'unknown';

  // V1: Direct data (passthrough)
  if (!isConfigLoadResult(result)) {
    return result;
  }

  // V2: ConfigLoadResult
  if (result.success && result.data) {
    // Success - log warnings if present (degraded success)
    if (logErrors && result.warnings && result.warnings.length > 0) {
      if (typeof ErrorBoundary !== 'undefined' && ErrorBoundary && ErrorBoundary.handleConfigWarnings) {
        ErrorBoundary.handleConfigWarnings(configName, result);
      }
    }
    return result.data;
  }

  // V2: Failed but has fallback data (degraded mode)
  if (!result.success && result.data) {
    if (logErrors && result.errors && result.errors.length > 0) {
      if (typeof ErrorBoundary !== 'undefined' && ErrorBoundary && ErrorBoundary.handleConfigLoadError) {
        ErrorBoundary.handleConfigLoadError(configName, result);
      }
    }
    // Use degraded fallback data
    return result.data;
  }

  // V2: Complete failure, no data
  if (throwOnError && result.errors && result.errors.length > 0) {
    const errorMsg = result.errors[0].message || 'Config load failed';
    throw new Error(errorMsg);
  }

  if (logErrors && result.errors && result.errors.length > 0) {
    if (typeof ErrorBoundary !== 'undefined' && ErrorBoundary && ErrorBoundary.handleConfigLoadError) {
      ErrorBoundary.handleConfigLoadError(configName, result);
    }
  }

  return fallbackValue;
}

/**
 * Extract data from ConfigLoadResult (alias for unwrapConfigResult with no logging)
 * @param {*} result - Either raw data (V1) or ConfigLoadResult (V2)
 * @returns {*} Raw data or null
 */
function extractConfigData(result) {
  return unwrapConfigResult(result, { logErrors: false, fallbackValue: null });
}

/**
 * Extract metadata from ConfigLoadResult
 * @param {*} result - ConfigLoadResult object
 * @returns {Object|null} Metadata object or null if not V2
 */
function extractConfigMetadata(result) {
  if (isConfigLoadResult(result) && result.metadata) {
    return result.metadata;
  }
  return null;
}

/**
 * Extract errors from ConfigLoadResult
 * @param {*} result - ConfigLoadResult object
 * @returns {Array} Array of errors (empty if not V2 or no errors)
 */
function extractConfigErrors(result) {
  if (isConfigLoadResult(result) && result.errors) {
    return result.errors;
  }
  return [];
}

/**
 * Extract warnings from ConfigLoadResult
 * @param {*} result - ConfigLoadResult object
 * @returns {Array} Array of warnings (empty if not V2 or no warnings)
 */
function extractConfigWarnings(result) {
  if (isConfigLoadResult(result) && result.warnings) {
    return result.warnings;
  }
  return [];
}

// Functions are already in global scope in Apps Script
// No explicit globalThis exports needed

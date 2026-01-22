/**
 * hrmny Quote Builder - Error Handling Utilities
 * This file is prefixed with "00_" to ensure it loads before other modules.
 */

const ERROR_UTILS_LOG_CATEGORY = 'ErrorUtils';

/**
 * Structured error that survives Apps Script -> client round trips.
 */
class AppError extends Error {
  /**
   * @param {string} code - machine-readable error code
   * @param {string} message - human-readable message
   * @param {Object} [details] - optional context object
   */
  constructor(code, message, details) {
    super(message || 'Application error');
    this.name = 'AppError';
    this.code = code || 'APP_ERROR';
    this.details = details || null;
  }
}

/**
 * Structured error that survives Apps Script -> client round trips.
 */
class AIUserError extends Error {
  /**
   * @param {string} step - machine-readable step identifier
   * @param {string} message - human-readable summary for the UI
   * @param {string} [suggestion] - optional remediation hint
   * @param {Object} [details] - diagnostic context (logged only)
   */
  constructor(step, message, suggestion, details) {
    const payload = {
      step: step || 'UNKNOWN',
      message: message || 'An unexpected error occurred.',
      suggestion: suggestion || '',
      details: details || null
    };
    super(JSON.stringify(payload));
    this.name = 'AIUserError';
    this.step = payload.step;
    this.suggestion = payload.suggestion;
    this.details = payload.details;
  }
}

// ========================================
// PHASE 2: RETRY MECHANISM AND CIRCUIT BREAKER
// ========================================

/**
 * Global retry counter for circuit breaker pattern
 * Tracks number of retry attempts per operation key
 */
const RETRY_ATTEMPTS = {};

/**
 * Execute retry callback with circuit breaker protection
 * Uses function name strings to avoid serialization issues
 *
 * @param {string} operationKey - Unique key identifying the operation (e.g., 'config_load', 'xero_sync')
 * @param {string} callbackName - Name of function to call (must exist in globalThis)
 * @param {number} maxAttempts - Maximum retry attempts before circuit breaker activates (default: 3)
 */
function executeRetry(operationKey, callbackName, maxAttempts) {
  maxAttempts = maxAttempts || 3;

  // Initialize counter if doesn't exist
  if (!RETRY_ATTEMPTS[operationKey]) {
    RETRY_ATTEMPTS[operationKey] = 0;
  }

  // Increment counter
  RETRY_ATTEMPTS[operationKey]++;

  // Check circuit breaker - if exceeded max attempts, show fallback alert
  if (RETRY_ATTEMPTS[operationKey] > maxAttempts) {
    UnifiedLogger.error(ERROR_UTILS_LOG_CATEGORY, 'Circuit breaker activated', {
      operationKey: operationKey,
      maxAttempts: maxAttempts,
      attempts: RETRY_ATTEMPTS[operationKey]
    });
    showFallbackAlert();
    return;
  }

  // Execute retry via function name string
  if (typeof globalThis[callbackName] === 'function') {
    UnifiedLogger.info(ERROR_UTILS_LOG_CATEGORY, 'Executing retry', {
      retryNumber: RETRY_ATTEMPTS[operationKey],
      operationKey: operationKey,
      callbackName: callbackName
    });
    try {
      globalThis[callbackName]();
    } catch (retryError) {
      // Fallback logging (UnifiedLogger may fail in error states)
      console.error('[ErrorUtils] Retry execution failed:', retryError.message, retryError.stack);
      throw retryError;
    }
  } else {
    UnifiedLogger.error(ERROR_UTILS_LOG_CATEGORY, 'Retry function not found in globalThis', {
      callbackName: callbackName
    });
    SpreadsheetApp.getUi().alert(
      'Retry Error',
      'The retry function "' + callbackName + '" was not found. Please refresh the page and try again.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Reset retry counter for an operation
 * Call this after successful operation to allow retries for next failure
 *
 * @param {string} operationKey - Operation key to reset
 */
function resetRetryCounter(operationKey) {
  if (RETRY_ATTEMPTS[operationKey]) {
    UnifiedLogger.info(ERROR_UTILS_LOG_CATEGORY, 'Resetting retry counter', {
      operationKey: operationKey,
      previousAttempts: RETRY_ATTEMPTS[operationKey]
    });
    RETRY_ATTEMPTS[operationKey] = 0;
  }
}

/**
 * Show fallback alert when circuit breaker activates
 * Informs user that operation has failed multiple times
 */
function showFallbackAlert() {
  SpreadsheetApp.getUi().alert(
    'Multiple Errors Occurred',
    'The operation has failed multiple times. Please check your configuration and try again later.\n\n' +
    'If the problem persists, contact support with details from the execution log.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Create retryable error object that works with retry mechanism
 * Uses function name string instead of function object to avoid serialization issues
 *
 * @param {Error} error - Original error object
 * @param {string} operationKey - Unique key for circuit breaker tracking
 * @param {string} retryCallbackName - Name of function to call on retry (must exist in globalThis)
 * @param {string} context - Context description for user-friendly error message
 * @return {Object} Error object with retry metadata
 */
function createRetryableError(error, operationKey, retryCallbackName, context) {
  // Use existing createUserFriendlyError if available, otherwise create basic structure
  let friendly;
  if (typeof createUserFriendlyError === 'function') {
    friendly = createUserFriendlyError(error, context);
  } else {
    // Fallback if createUserFriendlyError not available
    friendly = {
      title: context || 'Operation Failed',
      userMessage: error && error.message ? error.message : String(error),
      suggestion: 'Please try again or contact support.',
      severity: 'error'
    };
  }

  // Add retry metadata
  return {
    title: friendly.title,
    userMessage: friendly.userMessage,
    suggestion: friendly.suggestion,
    severity: friendly.severity,
    retryable: true,
    retryCallback: retryCallbackName, // STRING, not function object
    operationKey: operationKey,
    technicalError: error
  };
}

// ========================================
// PHASE 3: SHARED UTILITY FUNCTIONS (PLAN 06-05)
// ========================================

/**
 * Create standardized error object
 *
 * Creates consistent error structure with code, message, context, and timestamp.
 *
 * @param {string} code - Error code (format: MODULE_OPERATION_REASON)
 * @param {string} message - User-facing error message
 * @param {Object} [context] - Additional context
 * @returns {Error} Error object with standardized properties
 *
 * @example
 * createError('CONFIG_LOAD_FAILED', 'Unable to load configuration', {file: 'settings.json'})
 */
function createError(code, message, context) {
  const error = new Error(message || 'Unknown error');
  error.code = code || 'UNKNOWN_ERROR';
  error.context = context || {};
  error.timestamp = new Date().toISOString();
  error.isCustomError = true;
  return error;
}

/**
 * Wrap native error with additional context
 *
 * @param {Error} originalError - Original error to wrap
 * @param {Object} [context] - Additional context
 * @returns {Error} Wrapped error
 */
function wrapError(originalError, context) {
  if (!originalError) return createError('UNKNOWN_ERROR', 'No error to wrap', context);
  const wrappedError = new Error(originalError.message || 'Wrapped error');
  wrappedError.originalError = originalError;
  wrappedError.context = context || {};
  wrappedError.timestamp = new Date().toISOString();
  wrappedError.stack = originalError.stack || wrappedError.stack;
  if (originalError.code) wrappedError.code = originalError.code;
  return wrappedError;
}

/**
 * Retry function on error with exponential backoff
 *
 * @param {Function} fn - Function to retry
 * @param {number} [maxAttempts=3] - Maximum retry attempts
 * @param {number} [delayMs=1000] - Initial delay in milliseconds
 * @returns {*} Result of successful function call
 * @throws {Error} If all retry attempts fail
 */
function retryOnError(fn, maxAttempts, delayMs) {
  if (typeof fn !== 'function') {
    throw createError('RETRY_INVALID_FUNCTION', 'retryOnError requires a function');
  }
  const attempts = typeof maxAttempts === 'number' && maxAttempts > 0 ? maxAttempts : 3;
  const initialDelay = typeof delayMs === 'number' && delayMs > 0 ? delayMs : 1000;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        throw wrapError(error, {retryAttempts: attempts, operation: 'retryOnError'});
      }
      const delay = initialDelay * Math.pow(2, attempt - 1);
      if (typeof Utilities !== 'undefined' && typeof Utilities.sleep === 'function') {
        Utilities.sleep(delay);
      }
    }
  }
  throw lastError || createError('RETRY_FAILED', 'All retry attempts exhausted');
}

/**
 * Execute function, catch errors, log them, return fallback
 *
 * @param {Function} fn - Function to execute
 * @param {string} category - Category for logging
 * @param {*} [fallbackValue] - Value to return on error
 * @returns {*} Result or fallback value
 */
function catchAndLog(fn, category, fallbackValue) {
  if (typeof fn !== 'function') {
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.error('ErrorUtils', 'catchAndLog requires a function', {category: category});
      }
    } catch (logError) {
      console.error('[ErrorUtils] catchAndLog: Invalid function for category ' + category);
    }
    return fallbackValue;
  }
  try {
    return fn();
  } catch (error) {
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.error(category || 'Unknown', 'Operation failed in catchAndLog', {
          error: error.message || String(error),
          stack: error.stack || 'No stack trace',
          code: error.code || 'NO_CODE'
        });
      }
    } catch (logError) {
      console.error('[ErrorUtils] ' + category + ' error:', error.message || String(error));
    }
    return fallbackValue;
  }
}

/**
 * Aggregate multiple errors into summary
 *
 * @param {Array<Error>} errors - Array of errors to aggregate
 * @returns {Error} Combined error with all details
 */
function aggregateErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return createError('NO_ERRORS', 'No errors to aggregate');
  }
  if (errors.length === 1) return errors[0];

  const errorDetails = [];
  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    if (err) {
      errorDetails.push({
        index: i + 1,
        code: err.code || 'UNKNOWN',
        message: err.message || 'No message',
        context: err.context || {}
      });
    }
  }
  return createError('MULTIPLE_ERRORS', errors.length + ' errors occurred', {errors: errorDetails});
}

// ========================================
// GLOBAL EXPORTS FOR CROSS-FILE ACCESS
// ========================================

// Functions are already in global scope in Apps Script

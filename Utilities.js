/**
 * hrmny Quote Builder - Utilities
 * Helper utility functions
 */

const UTIL_LOG_CATEGORY = 'Utilities';

const QuoteUtils = {
  /**
   * Format number as currency (AED)
   * @param {number} amount - Amount to format
   * @return {string} Formatted currency string
   */
  formatCurrency: function(amount) {
    if (!amount && amount !== 0) {
      return '';
    }
    return QuoteUtils.formatNumber(amount, 2) + ' AED';
  },

  /**
   * Format number with specified decimal places
   * @param {number} num - Number to format
   * @param {number} decimals - Decimal places (default 2)
   * @return {string} Formatted number
   */
  formatNumber: function(num, decimals) {
    decimals = decimals || 2;
    if (!num && num !== 0) {
      return '';
    }
    return Number(num).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  /**
   * Format percentage
   * @param {number} percent - Percentage as decimal (e.g., 0.15)
   * @param {number} decimals - Decimal places (default 1)
   * @return {string} Formatted percentage (e.g., "15.0%")
   */
  formatPercent: function(percent, decimals) {
    decimals = decimals || 1;
    if (!percent && percent !== 0) {
      return '';
    }
    return (percent * 100).toFixed(decimals) + '%';
  },

  /**
   * Generate unique ID for rows
   * @return {string} Unique ID
   */
  generateId: function() {
    return 'id_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Get current timestamp
   * @return {string} ISO timestamp
   */
  getTimestamp: function() {
    return new Date().toISOString();
  },

  /**
   * Check if value is empty
   * @param {*} value - Value to check
   * @return {boolean} True if empty
   */
  isEmpty: function(value) {
    return value === null || value === undefined || value === '';
  },

  /**
   * Safe division (returns 0 if divisor is 0)
   * @param {number} numerator
   * @param {number} denominator
   * @return {number} Result of division or 0
   */
  safeDivide: function(numerator, denominator) {
    if (!denominator || denominator === 0) {
      return 0;
    }
    return numerator / denominator;
  },

  /**
   * Round to 2 decimal places
   * @param {number} num - Number to round
   * @return {number} Rounded number
   */
  roundCurrency: function(num) {
    return Math.round(num * 100) / 100;
  },

  /**
   * Sanitize string for use in formulas
   * Escapes quotes and special characters
   * @param {string} str - String to sanitize
   * @return {string} Sanitized string
   */
  sanitizeForFormula: function(str) {
    if (!str) return '';
    return str.toString().replace(/"/g, '""');
  },

  /**
   * Sanitize string destined for a sheet cell to prevent formula execution.
   * @param {*} value
   * @return {string}
   */
  sanitizeForSheet: function(value) {
    if (value === undefined || value === null) {
      return '';
    }
    let text = String(value);
    if (text === '') {
      return '';
    }
    const firstChar = text.charAt(0);
    const needsEscape = firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@';
    const controlPrefix = /\u0009|\u000A|\u000D/.test(firstChar);
    if ((needsEscape || controlPrefix) && text.charAt(0) !== '\'') {
      text = '\'' + text;
    }
    return text;
  },

  /**
   * Get column letter from index (0-based)
   * @param {number} index - Column index (0 = A, 1 = B, etc.)
   * @return {string} Column letter
   */
  columnIndexToLetter: function(index) {
    let letter = '';
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
  },

  /**
   * Get column index from letter
   * @param {string} letter - Column letter (A, B, AA, etc.)
   * @return {number} Column index (0-based)
   */
  columnLetterToIndex: function(letter) {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
      index = index * 26 + (letter.charCodeAt(i) - 64);
    }
    return index - 1;
  },

  /**
   * Deep copy object
   * @param {Object} obj - Object to copy
   * @return {Object} Deep copy
   */
  deepCopy: function(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Get range A1 notation
   * @param {number} row - Row number (1-based)
   * @param {number} col - Column number (1-based)
   * @return {string} A1 notation (e.g., "B5")
   */
  getRangeA1: function(row, col) {
    return QuoteUtils.columnIndexToLetter(col - 1) + row;
  },

  /**
   * Batch update cells for performance
   * @param {Sheet} sheet - Sheet to update
   * @param {Array} updates - Array of {row, col, value}
   */
  batchUpdateCells: function(sheet, updates) {
    const trace = UnifiedLogger.startTrace('Utilities', 'batchUpdateCells');
    try {
      if (!updates || !updates.length) {
        trace.complete('batchUpdateCells completed - no updates', {});
        return;
      }

      try {
        UnifiedLogger.info(UTIL_LOG_CATEGORY, 'batchUpdateCells', {
          sheet: sheet ? sheet.getName() : 'unknown',
          updateCount: updates.length
        });
      } catch (ignore) {
        console.error('[Utilities] Error:', ignore.message, ignore.stack);
      }

      let minRow = updates[0].row;
      let minCol = updates[0].col;
      let maxRow = updates[0].row;
      let maxCol = updates[0].col;

      updates.forEach(function(update) {
        if (update.row < minRow) minRow = update.row;
        if (update.col < minCol) minCol = update.col;
        if (update.row > maxRow) maxRow = update.row;
        if (update.col > maxCol) maxCol = update.col;
      });

      const numRows = (maxRow - minRow) + 1;
      const numCols = (maxCol - minCol) + 1;
      const range = sheet.getRange(minRow, minCol, numRows, numCols);
      const values = range.getValues();

      updates.forEach(function(update) {
        const sanitized = typeof update.value === 'string'
          ? QuoteUtils.sanitizeForSheet(update.value)
          : update.value;
        values[update.row - minRow][update.col - minCol] = sanitized;
      });

      range.setValues(values);

      trace.complete('batchUpdateCells completed', { updateCount: updates.length, rangeSize: numRows + 'x' + numCols });
    } catch (error) {
      trace.fail('batchUpdateCells failed', error);
      throw error;
    }
  },

  /**
   * Export quote data as JSON
   * @return {Object} Quote data object
   */
  exportQuoteAsJSON: function() {
    const trace = UnifiedLogger.startTrace('Utilities', 'exportQuoteAsJSON');
    try {
      if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
        showWarningToast('Quote_Builder headers modified; skipping JSON export.');
        trace.complete('exportQuoteAsJSON completed - schema not trusted', {});
        return {};
      }
      try {
        if (typeof buildQuoteJSON === 'function') {
          const payload = buildQuoteJSON();
          try {
            UnifiedLogger.info(UTIL_LOG_CATEGORY, 'exportQuoteAsJSON', {
              totalRows: payload && payload.lineItems ? payload.lineItems.length : 0
            });
          } catch (ignore) {
            // Silent fail
          }
          trace.complete('exportQuoteAsJSON completed', { totalRows: payload && payload.lineItems ? payload.lineItems.length : 0 });
          return payload;
        }
      } catch (error) {
        try {
          UnifiedLogger.warn(UTIL_LOG_CATEGORY, 'exportQuoteAsJSON failed', String(error));
        } catch (ignore) {
          // Silent fail
        }
        trace.fail('exportQuoteAsJSON failed', error);
        throw error;
      }
      trace.complete('exportQuoteAsJSON completed - no buildQuoteJSON', {});
      return {};
    } catch (error) {
      trace.fail('exportQuoteAsJSON failed', error);
      throw error;
    }
  },

  /**
   * Log to spreadsheet
   * Creates a log entry in a hidden sheet
   * @param {string} message - Log message
   * @param {string} level - Log level (INFO, WARNING, ERROR)
   */
  log: function(message, level) {
    level = level || 'INFO';
    UnifiedLogger.logEvent(UTIL_LOG_CATEGORY, String(message), level, { message: message });
  }
};

/**
 * UI Notification Helpers
 * Functions for showing user-facing error and warning toasts
 */

function getUiOrNull_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (error) {
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.warn('UINotification', 'UI unavailable', { error: String(error) });
      }
    } catch (ignore) {
      // Silent fail
    }
    return null;
  }
}

/**
 * Show error toast with optional retry action.
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {string} [retryFunctionName] - Optional function name to call if user clicks retry
 *
 * @example
 * showErrorToast('Configuration Error', 'Failed to load config', 'retryConfigLoad');
 */

/**
 * Create user-friendly error message from technical error.
 * Phase 5, Task 5.1: User-friendly error mapping
 *
 * @param {Error|string} error - Technical error object or message
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.operation] - Operation being performed (e.g., 'loading config')
 * @param {string} [options.correlationId] - Correlation ID for tracing
 * @return {Object} { title, message, technicalDetails, correlationId }
 *
 */
function showErrorToast(title, message, retryFunctionName, options) {
  const trace = UnifiedLogger.startTrace('Utilities', 'showErrorToast');
  try {
    // Phase 5 Enhancement: Support technical details and correlation IDs
    if (retryFunctionName && typeof retryFunctionName === 'object' && !options) {
      options = retryFunctionName;
      retryFunctionName = null;
    }
    options = options || {};
    const titleText = title === undefined || title === null ? 'Error' : String(title);
    const messageText = message === undefined || message === null ? '' : String(message);
    const technicalDetails = options.technicalDetails || null;
    const correlationId = options.correlationId || null;
    const error = options.error || null;  // Original error object

    const ui = getUiOrNull_();
    if (!ui) {
      try {
        if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.warn('UINotification', 'showErrorToast skipped - UI unavailable', {
            title: titleText,
            message: messageText
          });
        }
      } catch (ignore) {
        // Silent fail
      }
      trace.complete('showErrorToast skipped - UI unavailable', { title: titleText });
      return null;
    }
    let fullMessage = messageText;

    // Add correlation ID to message if provided
    if (correlationId) {
      const correlationText = String(correlationId);
      fullMessage += '\n\n[Trace ID: ' + correlationText.substring(0, 8) + '...]';
    }

    // Add technical details toggle if provided
    let showTechnical = false;
    if (technicalDetails) {
      fullMessage += '\n\n(Technical details available)';
    }

    if (retryFunctionName) {
      fullMessage += '\n\nWould you like to retry?';
      const response = ui.alert(
        titleText,
        fullMessage,
        ui.ButtonSet.YES_NO
      );

      if (response === ui.Button.YES) {
        // Call retry function if it exists
        if (typeof retryFunctionName === 'function') {
          retryFunctionName();
        } else if (typeof retryFunctionName === 'string' && typeof globalThis[retryFunctionName] === 'function') {
          globalThis[retryFunctionName]();
        } else {
          ui.alert('Retry function not found: ' + String(retryFunctionName));
        }
      }
    } else {
      const buttonSet = technicalDetails ? ui.ButtonSet.OK_CANCEL : ui.ButtonSet.OK;
      const response = ui.alert(titleText, fullMessage, buttonSet);

      // If user clicks CANCEL and we have technical details, show them
      if (response === ui.Button.CANCEL && technicalDetails) {
        ui.alert('Technical Details', String(technicalDetails), ui.ButtonSet.OK);
      }
    }

    // Log the error with correlation ID
    if (typeof UnifiedLogger !== 'undefined') {
      const logDetails = {
        title: titleText,
        message: messageText,
        retryFunction: retryFunctionName || 'none'
      };

      if (correlationId) logDetails.correlationId = correlationId;
      if (technicalDetails) logDetails.technicalDetails = technicalDetails;
      if (error) {
        logDetails.errorMessage = error.message || String(error);
        if (error.stack) logDetails.errorStack = error.stack;
      }

      UnifiedLogger.error('UINotification', 'Error toast shown', logDetails);
    }

    trace.complete('showErrorToast completed', { title: titleText, hasRetry: !!retryFunctionName, hasCorrelationId: !!correlationId });
  } catch (toastError) {
    trace.fail('showErrorToast failed', toastError);
    // Fallback logging via UnifiedLogger
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.error('UINotification', 'Error toast failed', toastError);
      }
    } catch (ignore) {
      // Silent fail
    }
  }
}

// DELETED: Duplicate definition - merged into unified showWarningToast below (see line ~700)

function annotateInternalLabel(label) {
  const trace = UnifiedLogger.startTrace('Utilities', 'annotateInternalLabel');
  try {
    const base = label ? String(label).trim() : '';
    if (!base) {
      trace.complete('annotateInternalLabel completed - empty label', {});
      return '[[INTERNAL]]';
    }
    if (base.toUpperCase().indexOf('[[INTERNAL]]') === 0) {
      trace.complete('annotateInternalLabel completed - already annotated', {});
      return base;
    }
    const result = '[[INTERNAL]] ' + base;
    trace.complete('annotateInternalLabel completed', { originalLength: base.length });
    return result;
  } catch (error) {
    trace.fail('annotateInternalLabel failed', error);
    throw error;
  }
}

function stripInternalMarker(text) {
  const trace = UnifiedLogger.startTrace('Utilities', 'stripInternalMarker');
  try {
    if (!text) {
      trace.complete('stripInternalMarker completed - empty text', {});
      return '';
    }
    const result = String(text).replace(/^\s*\[\[INTERNAL\]\]\s*/i, '').trim();
    trace.complete('stripInternalMarker completed', { hadMarker: text !== result });
    return result;
  } catch (error) {
    trace.fail('stripInternalMarker failed', error);
    throw error;
  }
}

function parseScopeMetadataNotes(notes) {
  const trace = UnifiedLogger.startTrace('Utilities', 'parseScopeMetadataNotes');
  try {
    if (!notes) {
      const emptyResult = {
        cleanNotes: '',
        scopeEntryId: '',
        resourcePackages: []
      };
      trace.complete('parseScopeMetadataNotes completed - empty notes', {});
      return emptyResult;
    }
    const resourcePackages = [];
    let scopeEntryId = '';
    const clean = [];
    String(notes)
      .split(/\r?\n/)
      .forEach(function(line) {
        if (!line) {
          return;
        }
        const trimmed = line.trim();
        if (trimmed.toLowerCase().indexOf('scope:') === 0) {
          scopeEntryId = trimmed.substring(6).trim();
          return;
        }
        if (trimmed.toLowerCase().indexOf('resourcepackage:') === 0) {
          resourcePackages.push(trimmed.substring(16).trim());
          return;
        }
        clean.push(trimmed);
      });
    const payload = {
      cleanNotes: clean.join('\n'),
      scopeEntryId: scopeEntryId,
      resourcePackages: resourcePackages
    };

    try {
      UnifiedLogger.info(UTIL_LOG_CATEGORY, 'parseScopeMetadataNotes', {
        scopeEntryId: scopeEntryId,
        resourcePackages: resourcePackages.length,
        cleanNotesPreview: clean.slice(0, 2)
      });
    } catch (ignore) {
      // Silent fail
    }

    trace.complete('parseScopeMetadataNotes completed', {
      scopeEntryId: scopeEntryId,
      resourcePackages: resourcePackages.length
    });
    return payload;
  } catch (error) {
    trace.fail('parseScopeMetadataNotes failed', error);
    throw error;
  }
}

const VECTOR_MATCH_PAGER_PROP_NAME = (function() {
  if (typeof FEATURE_VECTOR_MATCH_PAGER_PROP === 'string') {
    return FEATURE_VECTOR_MATCH_PAGER_PROP;
  }
  return 'FEATURE_VECTOR_MATCH_PAGER';
})();
const FEATURE_VECTOR_MATCH_PAGER_DEFAULT_ENABLED = true;

function isVectorMatchPagerEnabled() {
  const trace = UnifiedLogger.startTrace('Utilities', 'isVectorMatchPagerEnabled');
  try {
    if (typeof getScriptProperty !== 'function') {
      trace.complete('isVectorMatchPagerEnabled completed - no getScriptProperty', { result: FEATURE_VECTOR_MATCH_PAGER_DEFAULT_ENABLED });
      return FEATURE_VECTOR_MATCH_PAGER_DEFAULT_ENABLED;
    }
    if (typeof resolveVectorFeatureFlags_ === 'function') {
      try {
        const flags = resolveVectorFeatureFlags_();
        const result = flags && flags.matchPager !== false;
        trace.complete('isVectorMatchPagerEnabled completed - from feature flags', { result: result });
        return result;
      } catch (error) {
        try {
          UnifiedLogger.warn(UTIL_LOG_CATEGORY, 'isVectorMatchPagerEnabled resolve flags failed', String(error));
        } catch (ignore) {
          // Silent fail
        }
      }
    }
    try {
      const rawFlag = getScriptProperty(VECTOR_MATCH_PAGER_PROP_NAME);
      if (rawFlag === null || rawFlag === undefined || String(rawFlag).trim() === '') {
        trace.complete('isVectorMatchPagerEnabled completed - default', { result: FEATURE_VECTOR_MATCH_PAGER_DEFAULT_ENABLED });
        return FEATURE_VECTOR_MATCH_PAGER_DEFAULT_ENABLED;
      }
      const normalized = String(rawFlag).toLowerCase().trim();
      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        trace.complete('isVectorMatchPagerEnabled completed - disabled', { result: false });
        return false;
      }
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        trace.complete('isVectorMatchPagerEnabled completed - enabled', { result: true });
        return true;
      }
    } catch (error) {
      try { UnifiedLogger.warn(UTIL_LOG_CATEGORY, 'isVectorMatchPagerEnabled failed', String(error)); } catch (ignore) {
        console.error('[Utilities] Error:', ignore.message, ignore.stack);
      }
    }
    trace.complete('isVectorMatchPagerEnabled completed - fallback default', { result: FEATURE_VECTOR_MATCH_PAGER_DEFAULT_ENABLED });
    return FEATURE_VECTOR_MATCH_PAGER_DEFAULT_ENABLED;
  } catch (error) {
    trace.fail('isVectorMatchPagerEnabled failed', error);
    throw error;
  }
}

function setVectorMatchPagerFlag(enabled) {
  const trace = UnifiedLogger.startTrace('Utilities', 'setVectorMatchPagerFlag');
  try {
    if (typeof PropertiesService === 'undefined') {
      trace.complete('setVectorMatchPagerFlag completed - no PropertiesService', { result: false });
      return false;
    }
    try {
      const props = getScriptProperty.props || PropertiesService.getScriptProperties();
      if (!props) {
        trace.complete('setVectorMatchPagerFlag completed - no props', { result: false });
        return false;
      }
      props.setProperty(VECTOR_MATCH_PAGER_PROP_NAME, enabled ? 'true' : 'false');
      trace.complete('setVectorMatchPagerFlag completed', { enabled: enabled, result: true });
      return true;
    } catch (error) {
      try { UnifiedLogger.warn(UTIL_LOG_CATEGORY, 'setVectorMatchPagerFlag failed', String(error)); } catch (ignore) {
        console.error('[Utilities] Error:', ignore.message, ignore.stack);
      }
      trace.complete('setVectorMatchPagerFlag completed - property set failed', { result: false });
      return false;
    }
  } catch (error) {
    trace.fail('setVectorMatchPagerFlag failed', error);
    throw error;
  }
}

function enableVectorMatchPager() {
  const trace = UnifiedLogger.startTrace('Utilities', 'enableVectorMatchPager');
  try {
    const result = setVectorMatchPagerFlag(true);
    trace.complete('enableVectorMatchPager completed', { result: result });
    return result;
  } catch (error) {
    trace.fail('enableVectorMatchPager failed', error);
    throw error;
  }
}

function disableVectorMatchPager() {
  const trace = UnifiedLogger.startTrace('Utilities', 'disableVectorMatchPager');
  try {
    const result = setVectorMatchPagerFlag(false);
    trace.complete('disableVectorMatchPager completed', { result: result });
    return result;
  } catch (error) {
    trace.fail('disableVectorMatchPager failed', error);
    throw error;
  }
}

if (typeof globalThis !== 'undefined') {

  // Export error handling functions for cross-file access
}

/**
 * Display warning notification with optional action or correlation ID
 * Supports two signatures:
 * 1. showWarningToast(title, message, options) - where options = {correlationId: '...'}
 * 2. showWarningToast(title, message, actionLabel, actionFunctionName) - legacy action button mode
 *
 * @param {string} title - Warning title
 * @param {string} message - Warning message
 * @param {Object|string} [optionsOrActionLabel] - Options object OR action button label (legacy)
 * @param {string} [actionFunctionName] - Function to call if user clicks action (legacy)
 * @returns {null|boolean} null if UI unavailable, true if action taken (legacy mode), undefined otherwise
 *
 * @example
 * // Modern usage with correlation ID:
 * showWarningToast('API Error', 'Failed to sync', {correlationId: 'abc-123'});
 *
 * // Legacy usage with action buttons:
 * showWarningToast('Stale Data', 'Config is 24 hours old', 'Refresh Now', 'refreshConfigNow');
 */
function showWarningToast(title, message, optionsOrActionLabel, actionFunctionName) {
  const trace = UnifiedLogger.startTrace('Utilities', 'showWarningToast');
  try {
    const ui = getUiOrNull_();
    if (!ui) {
      try {
        if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.warn('UINotification', 'showWarningToast skipped - UI unavailable', {
            title: String(title || 'Warning')
          });
        }
      } catch (ignore) {
        // Silent fail
      }
      trace.complete('showWarningToast skipped - UI unavailable', { title: title });
      return null;
    }

    // Detect signature: string = legacy action mode, object = modern options mode
    const isActionMode = typeof optionsOrActionLabel === 'string';
    const opts = isActionMode ? {} : (optionsOrActionLabel || {});
    const actionLabel = isActionMode ? optionsOrActionLabel : null;

    let fullMessage = message;

    // Legacy action button mode
    if (isActionMode && actionLabel && actionFunctionName) {
      fullMessage += '\n\nWould you like to ' + actionLabel + '?';
      const response = ui.alert(title, fullMessage, ui.ButtonSet.YES_NO);

      if (response === ui.Button.YES) {
        // Call action function if it exists
        if (typeof globalThis[actionFunctionName] === 'function') {
          globalThis[actionFunctionName]();
          trace.complete('showWarningToast completed - action executed', { title: title, action: actionFunctionName });
          return true;
        } else {
          ui.alert('Action function not found: ' + actionFunctionName);
          trace.complete('showWarningToast completed - action not found', { title: title, action: actionFunctionName });
          return false;
        }
      }
      trace.complete('showWarningToast completed - action declined', { title: title });
      return false;
    }

    // Modern options mode: Add correlation ID if provided
    if (opts.correlationId) {
      fullMessage += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n';
      fullMessage += '🆔 Reference: ' + opts.correlationId;
    }

    ui.alert('⚠️ ' + title, fullMessage, ui.ButtonSet.OK);

    trace.complete('showWarningToast completed', {
      title: title,
      hasCorrelationId: !!opts.correlationId,
      mode: isActionMode ? 'action' : 'options'
    });
  } catch (error) {
    trace.fail('showWarningToast failed', error);
    throw error;
  }
}

/**
 * Display success notification
 * @param {string} title - Success title
 * @param {string} message - Success message
 */
function showSuccessToast(title, message) {
  const trace = UnifiedLogger.startTrace('Utilities', 'showSuccessToast');
  try {
    const ui = getUiOrNull_();
    if (!ui) {
      try {
        if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.warn('UINotification', 'showSuccessToast skipped - UI unavailable', {
            title: String(title || 'Success')
          });
        }
      } catch (ignore) {
        // Silent fail
      }
      trace.complete('showSuccessToast skipped - UI unavailable', { title: title });
      return null;
    }
    ui.alert('✅ ' + title, message, ui.ButtonSet.OK);

    trace.complete('showSuccessToast completed', { title: title });
  } catch (error) {
    trace.fail('showSuccessToast failed', error);
    throw error;
  }
}

/**
 * Create user-friendly error from technical error
 * Translates common error patterns into user-understandable messages
 * @param {Error|Object|string} error - Technical error
 * @param {string} context - What the user was trying to do
 * @returns {Object} User-friendly error details
 */
function createUserFriendlyError(error, context) {
  const trace = UnifiedLogger.startTrace('Utilities', 'createUserFriendlyError');
  try {
    let userMessage = 'An error occurred';
    let suggestion = 'Please try again or contact support.';
    let severity = 'error'; // error, warning, info

    const contextTitle = typeof context === 'string'
      ? context
      : (context && typeof context === 'object' && context.operation)
        ? String(context.operation)
        : 'Operation Failed';

    const errorMessage = error && error.message ? error.message : String(error);
    const errorCode = error && error.code ? error.code : null;

    // Pattern matching for common errors
    if (errorMessage.indexOf('rate limit') !== -1 || errorCode === 'RATE_LIMIT') {
      userMessage = 'Too many requests - please slow down';
      suggestion = 'Wait a moment and try again. If this persists, contact your administrator.';
      severity = 'warning';
    } else if (errorMessage.indexOf('timeout') !== -1 || errorMessage.indexOf('timed out') !== -1) {
      userMessage = 'Operation timed out';
      suggestion = 'The operation took too long. Try with less data, or retry in a moment.';
      severity = 'warning';
    } else if (errorMessage.indexOf('unauthorized') !== -1 || errorMessage.indexOf('401') !== -1) {
      userMessage = 'Authentication failed';
      suggestion = 'Check API credentials in Script Properties. Contact your administrator if needed.';
      severity = 'error';
    } else if (errorMessage.indexOf('forbidden') !== -1 || errorMessage.indexOf('403') !== -1) {
      userMessage = 'Access denied';
      suggestion = 'You don\'t have permission to perform this action. Contact your administrator.';
      severity = 'error';
    } else if (errorMessage.indexOf('quota') !== -1 || errorMessage.indexOf('exceeded') !== -1) {
      userMessage = 'API quota exceeded';
      suggestion = 'Daily or monthly limit reached. Try again tomorrow or contact your administrator to upgrade.';
      severity = 'error';
    } else if (errorMessage.indexOf('not found') !== -1 || errorMessage.indexOf('404') !== -1) {
      userMessage = 'Resource not found';
      suggestion = 'The requested resource doesn\'t exist. Check your configuration.';
      severity = 'warning';
    } else if (errorMessage.indexOf('network') !== -1 || errorMessage.indexOf('connection') !== -1) {
      userMessage = 'Network connection error';
      suggestion = 'Check your internet connection and try again.';
      severity = 'warning';
    } else if (errorMessage.indexOf('invalid') !== -1 || errorMessage.indexOf('malformed') !== -1) {
      userMessage = 'Invalid data or format';
      suggestion = 'Check your input data and try again.';
      severity = 'warning';
    } else if (errorCode === 'XERO_RATE_LIMIT' || errorCode === 'XERO_MAX_RETRIES') {
      userMessage = 'Xero API limit reached';
      suggestion = 'Xero enforces strict rate limits. Wait 60 seconds and retry.';
      severity = 'warning';
    } else if (errorMessage.indexOf('TypeError') !== -1 || errorMessage.indexOf('ReferenceError') !== -1) {
      userMessage = 'System error (possible bug)';
      suggestion = 'This is likely a system issue. Contact support with the reference ID below.';
      severity = 'error';
    }

    const result = {
      title: contextTitle,
      userMessage: userMessage,
      message: userMessage,
      suggestion: suggestion,
      severity: severity,
      technicalError: error
    };

    trace.complete('createUserFriendlyError completed', { severity: severity, errorCode: errorCode });
    return result;
  } catch (error) {
    trace.fail('createUserFriendlyError failed', error);
    throw error;
  }
}

/**
 * Show error with automatic user-friendly translation
 * Convenience function that combines createUserFriendlyError + showErrorToast
 * @param {Error} error - Technical error
 * @param {string} context - What user was doing
 * @param {Object} [options] - Additional options
 * @param {string|Function} [options.retryCallback] - Retry function name (string for Phase 2) or function (legacy)
 * @param {string} [options.correlationId] - Correlation ID
 * @param {boolean} [options.retryable] - Whether error is retryable
 * @param {string} [options.operationKey] - Operation key for circuit breaker
 */
function showFriendlyError(error, context, options) {
  const trace = UnifiedLogger.startTrace('Utilities', 'showFriendlyError');
  try {
    const opts = options || {};
    const friendlyError = createUserFriendlyError(error, context);

    // Handle retry button if retryCallback is provided
    if (opts.retryCallback && opts.retryable !== false) {
      const ui = getUiOrNull_();
      if (!ui) {
        try {
          if (typeof UnifiedLogger !== 'undefined') {
            UnifiedLogger.warn('UINotification', 'showFriendlyError skipped - UI unavailable', {
              context: context || 'unknown'
            });
          }
        } catch (ignore) {
          // Silent fail
        }
        trace.complete('showFriendlyError skipped - UI unavailable', { context: context });
        return null;
      }
      let message = friendlyError.userMessage + '\n\n💡 ' + friendlyError.suggestion;

      if (opts.correlationId) {
        message += '\n\n🔍 Reference ID: ' + opts.correlationId;
      }

      const result = ui.alert(
        friendlyError.title || 'Error',
        message + '\n\nWould you like to retry?',
        ui.ButtonSet.YES_NO
      );

      if (result === ui.Button.YES) {
        // Use executeRetry if retryCallback is a string
        if (typeof opts.retryCallback === 'string') {
          if (typeof executeRetry === 'function') {
            executeRetry(
              opts.operationKey || 'default',
              opts.retryCallback,
              3
            );
          } else {
            // Fallback if Phase 2 not loaded
            ui.alert('Retry Error', 'Retry mechanism not available. Please refresh the page and try again.', ui.ButtonSet.OK);
          }
        } else if (typeof opts.retryCallback === 'function') {
          // Legacy: Direct function call (old behavior)
          try {
            opts.retryCallback();
          } catch (retryError) {
            ui.alert('Retry Failed', 'The retry operation failed. Please try again or contact support.', ui.ButtonSet.OK);
          }
        }
      }
      trace.complete('showFriendlyError completed - with retry', { context: context, userChoseRetry: result === ui.Button.YES });
    } else {
      // No retry option - just show error toast
      const result = showErrorToast(
        friendlyError.title,
        friendlyError.userMessage + '\n\n💡 ' + friendlyError.suggestion,
        null,
        {
          showTechnicalDetails: true,
          error: error,
          correlationId: opts.correlationId
        }
      );
      trace.complete('showFriendlyError completed - no retry', { context: context });
      return result;
    }
  } catch (error) {
    trace.fail('showFriendlyError failed', error);
    throw error;
  }
}

/**
 * Show loading/progress toast (auto-dismisses)
 * Note: Apps Script doesn't support true toast notifications,
 * so this shows a brief alert. For long operations, use SpreadsheetApp.getUi().showSidebar()
 * @param {string} message - Progress message
 */
function showProgressToast(message) {
  const trace = UnifiedLogger.startTrace('Utilities', 'showProgressToast');
  try {
    // Apps Script limitation: Can't show auto-dismissing toasts
    // This is a placeholder for future enhancement
    // For now, log progress
    UnifiedLogger.debug(UTILITIES_LOG_CATEGORY, 'Progress update', { message: message });

    // Alternative: Could use Properties to track and display in sidebar
    // For this contract, we'll skip complex progress UI

    trace.complete('showProgressToast completed', { message: message });
  } catch (error) {
    trace.fail('showProgressToast failed', error);
    throw error;
  }
}

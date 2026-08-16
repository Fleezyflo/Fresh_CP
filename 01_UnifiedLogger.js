/**
 * hrmny Quote Builder - Unified Logging System
 * Centralizes application logs for debugging and audit trails across all modules.
 * Loads early (01 prefix) to be available to other scripts.
 */

// Ensure UnifiedLogger object exists with stub methods (real implementation assigned below)
// Module-level declaration - Apps Script makes this globally accessible
var UnifiedLogger = UnifiedLogger || {
  warn: function() {},
  info: function() {},
  error: function() {},
  verbose: function() {},
  debug: function() {},
  logEvent: function() {},
  startTrace: function() { return { info: function() {}, warn: function() {}, error: function() {}, complete: function() {}, fail: function() {} }; }
};

const UNIFIED_LOG_SHEET_NAME = '_Global_Log';
const ALT_LOG_SHEET_NAME = '_AI_LOG';
const MAX_LOG_ROWS = 2000;

const LOG_LEVELS = {
  VERBOSE: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LOG_LEVEL_PROP = 'UNIFIED_LOG_LEVEL';
const LOG_SAMPLE_RATE_PROP = 'UNIFIED_LOG_SAMPLE_RATE';
const LOG_DISABLED_PROP = 'UNIFIED_LOG_DISABLED_UNTIL';
const LOG_VERBOSE_UNTIL_PROP = 'UNIFIED_LOG_VERBOSE_UNTIL';
const LOG_SHEET_ID_PROP = 'UNIFIED_LOG_SHEET_ID';
const LOG_SPREADSHEET_ID_PROP = 'UNIFIED_LOG_SPREADSHEET_ID';
const LOG_SHEET_GID_PROP = 'UNIFIED_LOG_SHEET_GID';
const LOG_QUEUE_MAX = 500;
const DEFAULT_LOG_LEVEL = LOG_LEVELS.WARN;
const DEFAULT_SAMPLE_RATE = 0.35;
// Removed backoff constants - not needed for simple logging
const LOG_CONFIG_TTL_MS = 5 * 60 * 1000;
const LOG_FLUSH_BATCH_SIZE = 20;

let LOG_CONFIG_CACHE = null;
let LOG_DISABLED_UNTIL_MS = 0;
let LOG_CONTEXT_CACHE = null;
// Removed FEATURE_FLAG_CACHE - not needed for simple logging
let LOG_EVENT_QUEUE = [];

function resolveLogLevel_(rawLevel) {
  if (rawLevel === undefined || rawLevel === null) {
    return DEFAULT_LOG_LEVEL;
  }
  const normalized = String(rawLevel).trim().toUpperCase();
  if (LOG_LEVELS[normalized] !== undefined) {
    return LOG_LEVELS[normalized];
  }
  const numeric = parseInt(normalized, 10);
  if (!isNaN(numeric)) {
    const values = Object.keys(LOG_LEVELS).map(function(key) { return LOG_LEVELS[key]; });
    if (values.indexOf(numeric) !== -1) {
      return numeric;
    }
  }
  return DEFAULT_LOG_LEVEL;
}

function resolveSampleRate_(rawRate) {
  if (rawRate === undefined || rawRate === null) {
    return DEFAULT_SAMPLE_RATE;
  }
  const parsed = parseFloat(rawRate);
  if (isNaN(parsed)) {
    return DEFAULT_SAMPLE_RATE;
  }
  if (parsed <= 0) {
    return 0;
  }
  if (parsed >= 1) {
    return 1;
  }
  return parsed;
}

/**
 * Read property directly WITHOUT triggering logging (avoids infinite recursion)
 * @private
 */
function readPropertyDirect_(key, defaultValue) {
  try {
    // PropertiesCache has been deprecated - using direct PropertiesService access
    const props = PropertiesService.getScriptProperties();
    return props ? props.getProperty(key) : (defaultValue || null);
  } catch (error) {
    return defaultValue || null;
  }
}

function getLogConfig_() {
  const now = new Date().getTime();
  if (LOG_CONFIG_CACHE && LOG_CONFIG_CACHE.loadedAt && (now - LOG_CONFIG_CACHE.loadedAt) < LOG_CONFIG_TTL_MS) {
    return LOG_CONFIG_CACHE;
  }
  let level = DEFAULT_LOG_LEVEL;
  let sampleRate = DEFAULT_SAMPLE_RATE;
  try {
    level = resolveLogLevel_(readPropertyDirect_(LOG_LEVEL_PROP));
    sampleRate = resolveSampleRate_(readPropertyDirect_(LOG_SAMPLE_RATE_PROP));
    const verboseUntilRaw = readPropertyDirect_(LOG_VERBOSE_UNTIL_PROP);
    const verboseUntil = verboseUntilRaw ? parseInt(verboseUntilRaw, 10) : 0;
    if (!isNaN(verboseUntil) && verboseUntil > now) {
      level = LOG_LEVELS.VERBOSE;
    } else if (!isNaN(verboseUntil) && verboseUntil > 0 && verboseUntil <= now) {
      const props = PropertiesService.getScriptProperties();
      if (props) {
        props.deleteProperty(LOG_VERBOSE_UNTIL_PROP);
      }
    }
  } catch (error) {
    console.error('UnifiedLogger config load failed: ' + error);
  }
  LOG_CONFIG_CACHE = { level: level, sampleRate: sampleRate, loadedAt: now };
  return LOG_CONFIG_CACHE;
}

function getLogDisabledUntil_() {
  const now = new Date().getTime();
  if (LOG_DISABLED_UNTIL_MS && LOG_DISABLED_UNTIL_MS <= now) {
    setLogDisabledUntil_(0);
  }
  if (LOG_DISABLED_UNTIL_MS) {
    return LOG_DISABLED_UNTIL_MS;
  }
  try {
    // CRITICAL: Read property directly WITHOUT triggering logging to avoid infinite recursion
    const raw = parseInt(readPropertyDirect_(LOG_DISABLED_PROP, '0') || '0', 10);
    if (!isNaN(raw)) {
      LOG_DISABLED_UNTIL_MS = raw;
    }
    if (LOG_DISABLED_UNTIL_MS && LOG_DISABLED_UNTIL_MS <= now) {
      setLogDisabledUntil_(0);
    }
  } catch (error) {
    LOG_DISABLED_UNTIL_MS = 0;
  }
  return LOG_DISABLED_UNTIL_MS;
}

function setLogDisabledUntil_(timestampMs) {
  LOG_DISABLED_UNTIL_MS = timestampMs || 0;
  try {
    const props = PropertiesService.getScriptProperties();
    if (props) {
      props.setProperty(LOG_DISABLED_PROP, String(LOG_DISABLED_UNTIL_MS));
    }
  } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
}

// Backoff functions removed - not needed for simple logging

// Startup mode functions removed - not needed for simple logging

// Backoff state functions removed - not needed for simple logging

function persistLogSheetProps_(ss, sheet) {
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      return;
    }
    if (ss) {
      // Preserve existing behavior but avoid reliance on stored IDs for access.
      props.deleteProperty(LOG_SHEET_ID_PROP);
      props.deleteProperty(LOG_SPREADSHEET_ID_PROP);
    }
    if (sheet) {
      props.deleteProperty(LOG_SHEET_GID_PROP);
    }
  } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
}

function resolveLogLevelName_(numericLevel) {
  const entries = Object.keys(LOG_LEVELS);
  for (let i = 0; i < entries.length; i++) {
    if (LOG_LEVELS[entries[i]] === numericLevel) {
      return entries[i];
    }
  }
  return 'INFO';
}

function logFallback_(normalizedLevel, category, message, detailText) {
  try {
    const prefix = '[UnifiedLogger:' + normalizedLevel + '] ' + category + ' - ' + message;
    const line = detailText ? prefix + ' | ' + detailText : prefix;
    if (normalizedLevel === 'ERROR') {
      console.error(line);
    } else if (normalizedLevel === 'WARN') {
      console.warn(line);
    } else {
      console.log(line);
    }
  } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
}

function normalizeDetails_(details, context) {
  if (details === undefined || details === null) {
    return context ? { context: context } : '';
  }
  if (typeof details === 'object') {
    const merged = {};
    for (let key in details) {
      if (details.hasOwnProperty(key)) {
        merged[key] = details[key];
      }
    }
    if (context) {
      merged.context = context;
    }
    return merged;
  }
  return context ? { message: String(details), context: context } : details;
}

function getLogContext_() {
  if (LOG_CONTEXT_CACHE) {
    return LOG_CONTEXT_CACHE;
  }
  const meta = {};
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      meta.spreadsheetId = ss.getId();
    }
  } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
  try {
    meta.user = Session.getActiveUser().getEmail();
  } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
  meta.triggerType = detectTriggerType_();
  // Removed feature flag collection - not needed for simple logging
  LOG_CONTEXT_CACHE = meta;
  return LOG_CONTEXT_CACHE;
}

function detectTriggerType_() {
  try {
    if (typeof ScriptApp !== 'undefined' && ScriptApp && typeof ScriptApp.getAuthorizationInfo === 'function') {
      // Basic heuristic: if an active spreadsheet exists, assume manual/onOpen; otherwise headless/trigger.
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        if (ss) {
          return 'bound';
        }
      } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
      return 'headless';
    }
  } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
  return 'unknown';
}

// Feature flag collection removed - not needed for simple logging

/**
 * Initialize UnifiedLogger spreadsheet ID
 * Detects the container-bound spreadsheet ID and stores it for trigger context
 * This MUST be called once during deployment to enable trigger logging
 * @returns {boolean} Success
 */
function initializeUnifiedLoggerSpreadsheetId() {
  try {
    const props = PropertiesService.getScriptProperties();

    // Get the container-bound spreadsheet ID
    // This is the spreadsheet where the script is bound
    let spreadsheetId = null;

    // Try to get from active spreadsheet (if running from UI)
    try {
      const active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) {
        spreadsheetId = active.getId();
      }
    } catch (e) {
      // Empty catch replaced with error logging
      console.error('[01_UnifiedLogger] Error:', e.message, e.stack);
    }

    // If no active spreadsheet, check if already configured
    if (!spreadsheetId) {
      spreadsheetId = props.getProperty(LOG_SPREADSHEET_ID_PROP);
      if (!spreadsheetId) {
        throw new Error('Cannot auto-detect spreadsheet ID. Please run this function from the spreadsheet UI (Extensions > Apps Script > Run) or set UNIFIED_LOG_SPREADSHEET_ID in Script Properties manually.');
      }
    }

    // Verify spreadsheet is accessible
    const ss = SpreadsheetApp.openById(spreadsheetId);
    if (!ss) {
      throw new Error('Cannot access spreadsheet with ID: ' + spreadsheetId);
    }

    // Store the ID
    props.setProperty(LOG_SPREADSHEET_ID_PROP, spreadsheetId);

    console.log('✅ UnifiedLogger initialized with spreadsheet ID: ' + spreadsheetId);
    console.log('✅ Spreadsheet: ' + ss.getName());
    console.log('✅ Trigger logging is now enabled');

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize UnifiedLogger: ' + error);
    return false;
  }
}

function resolveLogSpreadsheet_() {
  // Try to get active spreadsheet first (UI context)
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      try {
        const props = getScriptProperty.props || PropertiesService.getScriptProperties();
        if (props) {
          props.setProperty(LOG_SPREADSHEET_ID_PROP, active.getId());
        }
      } catch (ignore) {
        console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
      }
      return active;
    }
  } catch (error) {
      // Empty catch replaced with error logging
      console.error('[01_UnifiedLogger] Error:', error.message, error.stack);
    }

  // Fallback: Try to open by stored ID (trigger context)
  try {
    const props = PropertiesService.getScriptProperties();
    if (props) {
      const storedId = props.getProperty(LOG_SPREADSHEET_ID_PROP);
      if (storedId) {
        const ss = SpreadsheetApp.openById(storedId);
        if (ss) {
          return ss;
        }
      }
    }
  } catch (error) {
      // Empty catch replaced with error logging
      console.error('[01_UnifiedLogger] Error:', error.message, error.stack);
    }

  return null;
}

function flushLogQueue_(force) {
  // Removed restoreLogQueue_ - no persistence needed
  if (!LOG_EVENT_QUEUE || LOG_EVENT_QUEUE.length === 0) {
    return false;
  }
  if (!force && LOG_EVENT_QUEUE.length < LOG_FLUSH_BATCH_SIZE) {
    return false;
  }
  const batch = LOG_EVENT_QUEUE.slice();
  LOG_EVENT_QUEUE = [];
  try {
    const resolved = resolveLogSheet_();
    const ss = resolved.ss;
    const sheet = resolved.sheet;
    if (!ss || !sheet) {
      // No sink; log fallback and drop batch.
      try { logFallback_('WARN', 'Logger', 'Flush skipped: log sheet unavailable', null); } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
      // Removed backoff logic - just restore queue
      LOG_EVENT_QUEUE = batch.concat(LOG_EVENT_QUEUE || []);
      return true;
    }
    const startRow = sheet.getLastRow() + 1;
    const values = batch.map(function(entry) {
      return [entry.timestamp, entry.level, entry.category, entry.user, entry.message, entry.detailText];
    });
    sheet.getRange(startRow, 1, values.length, 6).setValues(values);
    const lastRow = sheet.getLastRow();
    if (lastRow > MAX_LOG_ROWS) {
      const deleteCount = lastRow - MAX_LOG_ROWS;
      if (deleteCount > 0) {
        sheet.deleteRows(2, deleteCount);
      }
    }
    // Removed clearLogBackoffState_ - not needed
    return true;
  } catch (error) {
    // Emit one fallback and drop batch.
    try { logFallback_('WARN', 'Logger', 'Flush failed', String(error)); } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
    // Removed backoff logic - just restore queue
    LOG_EVENT_QUEUE = batch.concat(LOG_EVENT_QUEUE || []);
    return true;
  }
}

// Queue persistence functions removed - not needed for simple logging

function resolveLogSheet_() {
  const ss = resolveLogSpreadsheet_();
  if (!ss) {
    return { ss: null, sheet: null };
  }
  let sheet = ss.getSheetByName(UNIFIED_LOG_SHEET_NAME) || ss.getSheetByName(ALT_LOG_SHEET_NAME);
  let created = false;
  try {
    if (!sheet) {
      sheet = ss.insertSheet(UNIFIED_LOG_SHEET_NAME);
      sheet.hideSheet();
      sheet.getRange(1, 1, 1, 6).setValues([['Timestamp', 'Level', 'Category', 'User', 'Message', 'Details']]);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f3f3f3');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 150);
      sheet.setColumnWidth(5, 400);
      sheet.setColumnWidth(6, 300);
      created = true;
    }
    persistLogSheetProps_(ss, sheet);
  } catch (sheetError) {
    try { logFallback_('WARN', 'Logger', 'UnifiedLogger sheet init failed', String(sheetError)); } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
    return { ss: ss, sheet: null, created: created };
  }
  return { ss: ss, sheet: sheet, created: created };
}

function evaluateLogDecision_(level, sampleKey) {
  return { allow: true, config: { level: LOG_LEVELS.INFO, sampleRate: 1 } };
}

// Assign implementation to UnifiedLogger (object created defensively at top of file)
UnifiedLogger = {
  /**
   * Generate a unique correlation ID for request tracking.
   * @return {string} UUID v4 correlation ID
   */
  generateCorrelationId: function() {
    return Utilities.getUuid();
  },

  /**
   * Write a log entry to the global log sheet.
   * @param {string} category - Functional area (e.g., 'XeroInventory', 'AI', 'Quote')
   * @param {string} message - Primary log message
   * @param {string} levelStr - 'VERBOSE', 'INFO', 'WARN', 'ERROR'
   * @param {Object|string} [details] - Optional context data
   * @param {Object} [decision] - Optional precomputed logging decision
   */
  logEvent: function(category, message, levelStr, details, decision, options) {
    const normalizedLevel = levelStr && typeof levelStr === 'string' ? levelStr.toUpperCase() : 'INFO';
    const level = LOG_LEVELS[normalizedLevel] !== undefined ? LOG_LEVELS[normalizedLevel] : LOG_LEVELS.INFO;

    const decisionResult = decision || evaluateLogDecision_(level, category + '|' + message);
    if (!decisionResult.allow && level < LOG_LEVELS.WARN) {
      return;
    }

    let context = null;
    let detailPayload = null;
    let detailText = '';
    let user = 'system';

    if (decisionResult.allow || level >= LOG_LEVELS.WARN) {
      context = getLogContext_();
      try { user = context && context.user ? context.user : Session.getActiveUser().getEmail(); } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
      if (decisionResult.allow) {
        detailPayload = normalizeDetails_(details, context);
        if (detailPayload) {
          if (typeof detailPayload === 'object') {
            try {
              detailText = JSON.stringify(detailPayload);
            } catch (e) {
              detailText = String(detailPayload);
            }
          } else {
            detailText = String(detailPayload);
          }
        }
      } else if (level >= LOG_LEVELS.WARN) {
        if (details && details.message) {
          detailText = String(details.message);
        } else {
          detailText = details !== undefined && details !== null ? String(details) : '';
        }
      }
    }

    if (!decisionResult.allow && level >= LOG_LEVELS.WARN) {
      logFallback_(normalizedLevel, category, message, detailText);
      return;
    }

    const disabledUntil = getLogDisabledUntil_();
    if (disabledUntil && disabledUntil > Date.now()) {
      if (level >= LOG_LEVELS.WARN) {
        logFallback_(normalizedLevel, category, message, detailText);
      }
      return;
    }

    try {
      LOG_EVENT_QUEUE.push({
        timestamp: new Date(),
        level: normalizedLevel,
        category: category,
        user: user,
        message: message,
        detailText: detailText
      });
      if (LOG_EVENT_QUEUE.length > LOG_QUEUE_MAX) {
        LOG_EVENT_QUEUE.shift();
      }
      const forceFlush = (options && options.forceFlush === true) ? true : false;
      const shouldFlush = forceFlush || level >= LOG_LEVELS.ERROR || LOG_EVENT_QUEUE.length >= LOG_FLUSH_BATCH_SIZE;
      flushLogQueue_(shouldFlush);
    } catch (error) {
      try {
        // Removed backoff logic - just log the fallback
        logFallback_(normalizedLevel, category, message, String(error));
      } catch (ignore) {
      console.error('[01_UnifiedLogger] Error:', ignore.message, ignore.stack);
    }
    }
  },

  write: function(category, message, levelStr, details, decision) {
    return this.logEvent(category, message, levelStr, details, decision);
  },

  verbose: function(category, message, details) {
    this.logEvent(category, message, 'VERBOSE', details);
  },

  info: function(category, message, details) {
    this.logEvent(category, message, 'INFO', details);
  },

  warn: function(category, message, details) {
    this.logEvent(category, message, 'WARN', details);
  },

  error: function(category, message, error) {
    let details = '';
    if (error) {
      details = error.stack || error.message || String(error);
    }
    this.logEvent(category, message, 'ERROR', details);

    // Phase B (v3.1): Auto-report to PerformanceMonitor (if available)
    if (typeof perfRecordError === 'function') {
      perfRecordError(category, message, error, { source: 'UnifiedLogger' });
    }
  },

  /**
   * Log a debug message (maps to VERBOSE level).
   * Debug logs are for detailed diagnostic information during development.
   * @param {string} category - Functional area
   * @param {string} message - Primary log message
   * @param {Object|string} [details] - Optional context data
   */
  debug: function(category, message, details) {
    // Debug logs map to VERBOSE level (lowest priority)
    // This ensures debug() calls work but can be filtered via log level config
    this.logEvent(category, message, 'VERBOSE', details);
  },


  /**
   * Start a traced operation with automatic correlation ID tracking.
   * Returns a trace object with logging methods that automatically include
   * correlation ID and duration tracking for all related log entries.
   *
   * @param {string} category - Functional area (e.g., 'XeroSync', 'VectorStore')
   * @param {string} operationName - Name of the operation being traced
   * @param {Object} [initialDetails] - Optional initial context data
   * @return {Object} Trace object with methods: info(), warn(), error(), complete(), fail()
   *
   * @example
   * const trace = UnifiedLogger.startTrace('XeroSync', 'syncInventoryItems', {itemCount: 150});
   * trace.info('Starting sync', {phase: 'preparation'});
   * trace.warn('Rate limit approaching', {remaining: 5});
   * trace.complete('Sync successful', {itemsSynced: 150});
   * // All logs will share the same correlation ID for easy filtering
   */
  startTrace: function(category, operationName, initialDetails) {
    const correlationId = this.generateCorrelationId();
    const startTime = new Date().getTime();

    // Removed startup mode logic - always do full trace logging
    // Log trace start
    const startDetails = initialDetails || {};
    startDetails.operation = operationName;
    startDetails.traceEvent = 'START';
    this.logWithCorrelation(category, 'Trace started: ' + operationName, 'INFO', startDetails, correlationId);

    // Return trace object with logging methods
    const self = this;
    const trace = {
      correlationId: correlationId,
      category: category,
      operationName: operationName,
      startTime: startTime,

      /**
       * Log info message within trace with automatic correlation ID and duration
       */
      info: function(message, details) {
        const enrichedDetails = details || {};
        enrichedDetails.operation = operationName;
        enrichedDetails.durationMs = new Date().getTime() - startTime;
        self.logWithCorrelation(category, message, 'INFO', enrichedDetails, correlationId);
      },

      /**
       * Log warning within trace with automatic correlation ID and duration
       */
      warn: function(message, details) {
        const enrichedDetails = details || {};
        enrichedDetails.operation = operationName;
        enrichedDetails.durationMs = new Date().getTime() - startTime;
        self.logWithCorrelation(category, message, 'WARN', enrichedDetails, correlationId);
      },

      /**
       * Log error within trace with automatic correlation ID and duration
       */
      error: function(message, errorOrDetails) {
        const enrichedDetails = {};
        if (errorOrDetails) {
          if (errorOrDetails.stack) {
            enrichedDetails.error = errorOrDetails.stack;
          } else if (errorOrDetails.message) {
            enrichedDetails.error = errorOrDetails.message;
          } else if (typeof errorOrDetails === 'object') {
            for (let key in errorOrDetails) {
              if (errorOrDetails.hasOwnProperty(key)) {
                enrichedDetails[key] = errorOrDetails[key];
              }
            }
          } else {
            enrichedDetails.error = String(errorOrDetails);
          }
        }
        enrichedDetails.operation = operationName;
        enrichedDetails.durationMs = new Date().getTime() - startTime;
        self.logWithCorrelation(category, message, 'ERROR', enrichedDetails, correlationId);
      },

      /**
       * Mark trace as successfully completed
       * @return {number} Total duration in milliseconds
       */
      complete: function(message, details) {
        const enrichedDetails = details || {};
        enrichedDetails.operation = operationName;
        enrichedDetails.traceEvent = 'COMPLETE';
        enrichedDetails.totalDurationMs = new Date().getTime() - startTime;
        self.logWithCorrelation(category, message || 'Trace completed: ' + operationName, 'INFO', enrichedDetails, correlationId);
        return enrichedDetails.totalDurationMs;
      },

      /**
       * Mark trace as failed
       * @return {number} Total duration in milliseconds
       */
      fail: function(message, errorOrDetails) {
        const enrichedDetails = {};
        if (errorOrDetails) {
          if (errorOrDetails.stack) {
            enrichedDetails.error = errorOrDetails.stack;
          } else if (errorOrDetails.message) {
            enrichedDetails.error = errorOrDetails.message;
          } else if (typeof errorOrDetails === 'object') {
            for (let key in errorOrDetails) {
              if (errorOrDetails.hasOwnProperty(key)) {
                enrichedDetails[key] = errorOrDetails[key];
              }
            }
          } else {
            enrichedDetails.error = String(errorOrDetails);
          }
        }
        enrichedDetails.operation = operationName;
        enrichedDetails.traceEvent = 'FAILED';
        enrichedDetails.totalDurationMs = new Date().getTime() - startTime;
        self.logWithCorrelation(category, message || 'Trace failed: ' + operationName, 'ERROR', enrichedDetails, correlationId);
        return enrichedDetails.totalDurationMs;
      }
    };

    return trace;
  },

  prune: function(sheet) {
    try {
      const lastRow = sheet.getLastRow();
      if (lastRow > MAX_LOG_ROWS) {
        const deleteCount = lastRow - MAX_LOG_ROWS;
        if (deleteCount > 0) {
          sheet.deleteRows(2, deleteCount);
        }
      }
    } catch (e) {
      console.error('UnifiedLogger prune failed: ' + e);
    }
  },

  show: function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(UNIFIED_LOG_SHEET_NAME);
    if (sheet) {
      sheet.showSheet();
      ss.setActiveSheet(sheet);
    } else {
      SpreadsheetApp.getUi().alert('No global log exists yet. Run an action to generate logs.');
    }
  },

  /**
   * Write a log entry with correlation ID for request tracking.
   * Automatically enriches details with correlation ID, timestamp, and user.
   * @param {string} category - Functional area
   * @param {string} message - Primary log message
   * @param {string} levelStr - 'VERBOSE', 'INFO', 'WARN', 'ERROR'
   * @param {Object|string} [details] - Optional context data
   * @param {string} [correlationId] - Optional correlation ID (auto-generated if not provided)
   */
  logWithCorrelation: function(category, message, levelStr, details, correlationId) {
    const enrichedDetails = typeof details === 'object' ? details : { message: String(details || '') };

    // Add correlation ID
    enrichedDetails.correlationId = correlationId || this.generateCorrelationId();

    // Add timestamp
    enrichedDetails.timestamp = new Date().toISOString();

    // Add user if available
    try {
      enrichedDetails.user = Session.getActiveUser().getEmail();
    } catch (ignore) {
      enrichedDetails.user = 'system';
    }

    this.logEvent(category, message, levelStr, enrichedDetails);

    // Return correlation ID for caller to use in subsequent related logs
    return enrichedDetails.correlationId;
  },

  /**
   * Determine if a log entry should be recorded based on level and sampling.
   * @param {'VERBOSE'|'INFO'|'WARN'|'ERROR'} levelStr - Log level
   * @param {string} category - Functional area
   * @param {string} message - Log message
   * @return {Object} Decision object with allow:boolean and config
   */
  evaluateLogDecision: function(levelStr, category, message) {
    const normalizedLevel = levelStr && typeof levelStr === 'string' ? levelStr.toUpperCase() : 'INFO';
    const level = LOG_LEVELS[normalizedLevel] !== undefined ? LOG_LEVELS[normalizedLevel] : LOG_LEVELS.INFO;
    return evaluateLogDecision_(level, category + '|' + message);
  }
};

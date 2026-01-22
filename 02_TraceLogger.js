/**
 * TraceLogger – Structured logging helper that harvests payloads, results, and metrics for each major workflow.
 * Relies on UnifiedLogger for persistence. Fails silently when UnifiedLogger is unavailable.
 */
const TraceLogger = {
  MAX_STRING_LENGTH: 1200,
  MAX_ARRAY_SAMPLE: 5,
  MAX_OBJECT_FIELDS: 12,

  /**
   * Log a detailed step with structured payload.
   * @param {string} category
   * @param {string} message
   * @param {*} detail
   * @param {'VERBOSE'|'INFO'|'WARN'|'ERROR'} [level]
   */
  logStep: function(category, message, detail, level) {
    const logLevel = level || 'VERBOSE';
    const normalizedLevel = (logLevel && typeof logLevel === 'string') ? logLevel.toUpperCase() : 'VERBOSE';
    let decision = null;
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) {
      if (typeof UnifiedLogger.getDecision === 'function') {
        decision = UnifiedLogger.getDecision(normalizedLevel, category + '|' + message);
        if (!decision.allow && normalizedLevel !== 'WARN' && normalizedLevel !== 'ERROR') {
          return;
        }
      } else if (typeof UnifiedLogger.shouldLog === 'function' && !UnifiedLogger.shouldLog(normalizedLevel)) {
        return;
      }
    }
    const shouldSerialize = !decision || decision.allow || normalizedLevel === 'WARN' || normalizedLevel === 'ERROR';
    const payload = shouldSerialize ? TraceLogger.safeSerialize(detail, null, 0, TraceLogger.DEFAULT_BUDGET) : detail;
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger.logEvent === 'function') {
      UnifiedLogger.logEvent(category, message, normalizedLevel, payload, decision);
      return;
    }
    // Silent fail when UnifiedLogger unavailable
  },

  logPayload: function(category, label, payload) {
    TraceLogger.logStep(category, 'Payload: ' + label, payload);
  },

  logResult: function(category, label, result) {
    TraceLogger.logStep(category, 'Result: ' + label, result, 'INFO');
  },

  logEntry: function(category, label, detail) {
    TraceLogger.logStep(category, 'Enter: ' + label, detail);
  },

  logExit: function(category, label, detail) {
    TraceLogger.logStep(category, 'Exit: ' + label, detail);
  },

  /**
   * Serialize values safely for logging.
   * @param {*} value
   * @param {Set=} visited
   * @return {*}
   */
  safeSerialize: function(value, visited, depth, budget) {
    visited = visited || new Set();
    depth = typeof depth === 'number' ? depth : 0;
    budget = typeof budget === 'number' ? budget : TraceLogger.DEFAULT_BUDGET;
    if (budget < 0) {
      return '[Truncated:budget]';
    }
    if (depth > TraceLogger.MAX_DEPTH) {
      return '[Truncated:depth]';
    }
    const nextBudget = budget - 1;
    if (value === undefined) {
      return { type: 'undefined' };
    }
    if (value === null) {
      return null;
    }
    if (typeof value === 'string') {
      return TraceLogger.truncateString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (value && typeof value === 'object' && (value instanceof Error || (value.message && value.name))) {
      return {
        name: value.name || 'Error',
        message: TraceLogger.truncateString(value.message || String(value)),
        stack: value.stack ? TraceLogger.truncateString(value.stack) : undefined
      };
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'function') {
      return '[Function]';
    }

    if (visited.has(value)) {
      return '[Circular]';
    }

    if (Array.isArray(value)) {
      visited.add(value);
      return {
        type: 'array',
        count: value.length,
        sample: value
          .slice(0, TraceLogger.MAX_ARRAY_SAMPLE)
          .map(function(item) {
            return TraceLogger.safeSerialize(item, visited, depth + 1, nextBudget);
          })
      };
    }

    if (typeof value === 'object') {
      visited.add(value);
      const keys = Object.keys(value || {});
      const truncated = {};
      for (let i = 0; i < keys.length && i < TraceLogger.MAX_OBJECT_FIELDS; i++) {
        const key = keys[i];
        const lowered = key.toLowerCase();
        try {
          if (lowered.indexOf('token') !== -1 || lowered.indexOf('secret') !== -1 || lowered.indexOf('password') !== -1 || lowered.indexOf('apikey') !== -1 || lowered.indexOf('authorization') !== -1) {
            truncated[key] = '[Redacted]';
          } else {
            truncated[key] = TraceLogger.safeSerialize(value[key], visited, depth + 1, nextBudget);
          }
        } catch (e) {
          truncated[key] = '[Error serializing: ' + (e && e.message ? e.message : String(e)) + ']';
        }
      }
      if (keys.length > TraceLogger.MAX_OBJECT_FIELDS) {
        truncated.__truncatedFields = keys.length - TraceLogger.MAX_OBJECT_FIELDS;
      }
      return truncated;
    }

    return String(value);
  },

  MAX_DEPTH: 4,
  DEFAULT_BUDGET: 2000,

  truncateString: function(text) {
    if (typeof text !== 'string') {
      return text;
    }
    if (text.length <= TraceLogger.MAX_STRING_LENGTH) {
      return text;
    }
    return text.slice(0, TraceLogger.MAX_STRING_LENGTH) + '…';
  }
};

/**
 * Summary:
 * - TraceLogger now wraps UnifiedLogger so every workflow step (payloads, entry/exit points, results, and errors)
 *   is emitted with structured context.  Use `logEntry/logPayload/logResult/logStep` to instrument new modules.
 * - Adjust verbosity via `UNIFIED_LOG_LEVEL` and `UNIFIED_LOG_SAMPLE_RATE` script properties (default WARN with sampled INFO/VERBOSE)
 *   to reduce noise while retaining issue-level tracing.
 * - All logs flow into the `_Global_Log` sheet automatically; no additional setup is required after saving/pushing.
 */

/**
 * Lightweight Performance Monitoring
 *
 * Minimal-overhead performance marker system for tracking startup bottlenecks.
 * Uses simple timestamp tracking with NO I/O operations during marking.
 *
 * Usage:
 *   perfMark('onOpen-start');
 *   // ... do work ...
 *   perfMark('onOpen-end');
 *   perfReport(); // Shows: onOpen-start → onOpen-end: 1234ms
 *
 * Target overhead: <1ms per marker
 */

// In-memory storage for performance markers
let PERF_MARKERS = [];
let PERF_START_TIME = new Date().getTime();

// Phase B (v3.1): Error tracking
let PERF_ERRORS = [];
let PERF_ERROR_CATEGORIES = {}; // {category: count}

/**
 * Mark a performance checkpoint with minimal overhead
 * @param {string} label - Descriptive label for this checkpoint
 * @param {Object} [metadata] - Optional metadata to attach (keep small)
 */
function perfMark(label, metadata) {
  try {
    const now = new Date().getTime();
    PERF_MARKERS.push({
      label: label || 'unnamed',
      timestamp: now,
      relativeMs: now - PERF_START_TIME,
      metadata: metadata || {}
    });
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[PerformanceMonitor] perfMark failed:', error);
  }
}

/**
 * Generate performance report showing time deltas between markers
 * @return {string} Formatted report with timing deltas
 */
function perfReport() {
  try {
    if (!PERF_MARKERS || PERF_MARKERS.length === 0) {
      return '[PerformanceMonitor] No markers recorded';
    }

    let report = '\n=== Performance Report ===\n';
    report += 'Total markers: ' + PERF_MARKERS.length + '\n';
    report += 'Session start: ' + new Date(PERF_START_TIME).toISOString() + '\n\n';

    // Show each marker with delta from previous
    for (let i = 0; i < PERF_MARKERS.length; i++) {
      const marker = PERF_MARKERS[i];
      const relativeTime = marker.relativeMs.toFixed(0);

      let deltaMsg = '';
      if (i > 0) {
        const prevMarker = PERF_MARKERS[i - 1];
        const delta = marker.timestamp - prevMarker.timestamp;
        deltaMsg = ' (+' + delta.toFixed(0) + 'ms from previous)';
      }

      report += '[' + relativeTime.padStart(6) + 'ms] ' + marker.label + deltaMsg;

      // Add metadata if present
      const metaKeys = Object.keys(marker.metadata || {});
      if (metaKeys.length > 0) {
        const metaStr = JSON.stringify(marker.metadata);
        report += ' ' + metaStr;
      }

      report += '\n';
    }

    // Summary statistics
    const totalTime = PERF_MARKERS[PERF_MARKERS.length - 1].relativeMs - PERF_MARKERS[0].relativeMs;
    report += '\nTotal duration: ' + totalTime.toFixed(0) + 'ms\n';

    // Identify slowest delta
    let slowestDelta = 0;
    let slowestSegment = '';
    for (let i = 1; i < PERF_MARKERS.length; i++) {
      const delta = PERF_MARKERS[i].timestamp - PERF_MARKERS[i - 1].timestamp;
      if (delta > slowestDelta) {
        slowestDelta = delta;
        slowestSegment = PERF_MARKERS[i - 1].label + ' → ' + PERF_MARKERS[i].label;
      }
    }
    if (slowestSegment) {
      report += 'Slowest segment: ' + slowestSegment + ' (' + slowestDelta.toFixed(0) + 'ms)\n';
    }

    report += '==========================\n';
    return report;
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[PerformanceMonitor] perfReport failed:', error);
    return '[PerformanceMonitor] Error generating report: ' + error.message;
  }
}

/**
 * Get raw marker data for programmatic analysis
 * @return {Array} Array of marker objects
 */
function perfGetMarkers() {
  return PERF_MARKERS || [];
}

/**
 * Clear all markers and reset timer (useful for testing)
 */
function perfReset() {
  PERF_MARKERS = [];
  PERF_START_TIME = new Date().getTime();
}

/**
 * Log performance report to console
 */
function perfLogReport() {
  UnifiedLogger.verbose('PerformanceMonitor', 'Performance report', { report: perfReport() });
}

/**
 * Get specific marker by label
 * @param {string} label - Marker label to find
 * @return {Object|null} Marker object or null if not found
 */
function perfGetMarker(label) {
  if (!PERF_MARKERS) return null;
  for (let i = 0; i < PERF_MARKERS.length; i++) {
    if (PERF_MARKERS[i].label === label) {
      return PERF_MARKERS[i];
    }
  }
  return null;
}

/**
 * Calculate duration between two markers
 * @param {string} startLabel - Label of start marker
 * @param {string} endLabel - Label of end marker
 * @return {number|null} Duration in milliseconds, or null if markers not found
 */
function perfGetDuration(startLabel, endLabel) {
  const start = perfGetMarker(startLabel);
  const end = perfGetMarker(endLabel);
  if (!start || !end) return null;
  return end.timestamp - start.timestamp;
}

/**
 * Phase B (v3.1): Record an error with categorization
 * @param {string} category - Error category (e.g., 'XERO_API', 'CACHE', 'TIMEOUT')
 * @param {string} message - Error message
 * @param {Error} error - Error object
 * @param {Object} [context] - Additional context
 */
function perfRecordError(category, message, error, context) {
  try {
    const errorRecord = {
      timestamp: new Date(),
      category: category || 'UNKNOWN',
      message: message || 'No message',
      stack: error?.stack || 'No stack',
      context: context || {}
    };

    PERF_ERRORS.push(errorRecord);
    if (PERF_ERRORS.length > 100) PERF_ERRORS.shift(); // Keep last 100

    // Track by category
    PERF_ERROR_CATEGORIES[category] = (PERF_ERROR_CATEGORIES[category] || 0) + 1;
  } catch (e) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[PerformanceMonitor] perfRecordError failed:', e);
  }
}

/**
 * Get recorded errors, optionally filtered by category
 * @param {string} [category] - Optional category to filter by
 * @return {Array} Array of error records
 */
function perfGetErrors(category) {
  if (category) {
    return PERF_ERRORS.filter(function(e) { return e.category === category; });
  }
  return PERF_ERRORS;
}

/**
 * Get error counts by category
 * @return {Object} Category counts
 */
function perfGetErrorCategories() {
  return Object.assign({}, PERF_ERROR_CATEGORIES);
}

/**
 * Clear all recorded errors
 */
function perfClearErrors() {
  PERF_ERRORS = [];
  PERF_ERROR_CATEGORIES = {};
}

/**
 * Phase B (v3.1): Instrument a function with automatic timing and error tracking
 * @param {string} operationName - Name of the operation
 * @param {Function} fn - Function to instrument
 * @param {Object} [context] - Optional context data
 * @return {*} Result of the function
 */
function perfInstrument(operationName, fn, context) {
  const startLabel = operationName + '-start';
  const endLabel = operationName + '-end';

  perfMark(startLabel, context);
  const startTime = Date.now();

  try {
    const result = fn();
    const duration = Date.now() - startTime;
    perfMark(endLabel, { duration: duration, status: 'success', context: context });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    perfMark(endLabel, { duration: duration, status: 'error', context: context });

    // Auto-categorize error
    let category = 'UNKNOWN';
    const msg = error.message || '';
    if (msg.includes('Xero') || operationName.includes('Xero')) category = 'XERO_API';
    else if (msg.includes('Properties') || operationName.includes('Properties')) category = 'PROPERTIES_SERVICE';
    else if (msg.includes('Cache')) category = 'CACHE';
    else if (msg.includes('timeout') || msg.includes('exceeded')) category = 'TIMEOUT';

    perfRecordError(category, error.message, error, { operation: operationName, context: context });
    throw error;
  }
}

/**
 * Phase B (v3.1): Get comprehensive system health report
 * Integrates PerformanceMonitor + ConfigLoadMetrics + PropertiesCache
 * @return {Object} System health report
 */
function perfGetSystemHealth() {
  try {
    const markers = perfGetMarkers();
    const totalOps = markers.length;
    const errorCount = PERF_ERRORS.length;
    const errorRate = totalOps > 0 ? (errorCount / totalOps * 100) : 0;

    // Get ConfigLoadMetrics data (INTEGRATION, not duplication)
    let configMetrics = null;
    if (typeof getConfigLoadMetrics === 'function') {
      try {
        configMetrics = getConfigLoadMetrics();
      } catch (e) {
        UnifiedLogger.warn('PerformanceMonitor', 'Could not get ConfigLoadMetrics', { error: e.message });
      }
    }

    // Get PropertiesCache stats (INTEGRATION)
    let cacheStats = null;
    if (typeof getPropertiesCacheStats === 'function') {
      try {
        cacheStats = getPropertiesCacheStats();
      } catch (e) {
        UnifiedLogger.warn('PerformanceMonitor', 'Could not get PropertiesCache stats', { error: e.message });
      }
    }

    // Assess health
    let health = 'HEALTHY';
    if (errorRate > 10) health = 'DEGRADED';
    else if (errorRate > 5) health = 'WARNING';

    // Check config metrics health
    if (configMetrics && configMetrics.overall) {
      const configFailRate = configMetrics.overall.failureRate || 0;
      if (configFailRate > 0.1) health = 'DEGRADED';
      else if (configFailRate > 0.05) health = 'WARNING';
    }

    return {
      health: health,
      performance: {
        totalOperations: totalOps,
        perfReport: perfReport(),
        slowestSegment: perfGetSlowestSegment_()
      },
      errors: {
        total: errorCount,
        errorRate: errorRate.toFixed(2) + '%',
        byCategory: perfGetErrorCategories(),
        recent: PERF_ERRORS.slice(-5)
      },
      configLoad: configMetrics, // LINKED, not duplicated
      cache: cacheStats, // LINKED, not duplicated
      timestamp: new Date()
    };
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[PerformanceMonitor] perfGetSystemHealth failed:', error);
    return { health: 'ERROR', error: error.message };
  }
}

/**
 * Helper: Get slowest segment from markers
 * @return {Object|null} Slowest segment info
 * @private
 */
function perfGetSlowestSegment_() {
  const markers = PERF_MARKERS || [];
  if (markers.length < 2) return null;

  let slowest = { segment: '', duration: 0 };
  for (let i = 1; i < markers.length; i++) {
    const delta = markers[i].timestamp - markers[i - 1].timestamp;
    if (delta > slowest.duration) {
      slowest = {
        segment: markers[i - 1].label + ' → ' + markers[i].label,
        duration: delta
      };
    }
  }
  return slowest;
}

// Export globally for use across all modules
// Phase B (v3.1) exports

// Add startup marker
perfMark('00_PerformanceMonitor-loaded-v3.1');

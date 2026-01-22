/**
 * ConfigLoadMetrics.js
 * Performance monitoring and metrics tracking for config loading system
 *
 * Tracks:
 * - Load times (sheet access, unwrapping, total)
 * - Success/failure rates
 * - Degraded mode frequency
 * - Cache hit rates
 * - Error patterns
 */

// Metrics storage (in-memory)
const CONFIG_LOAD_METRICS = {
  enabled: true,  // Set to false to disable metrics
  history: [],    // Rolling window of recent loads
  maxHistorySize: 100,  // Keep last 100 loads
  aggregates: {
    totalLoads: 0,
    successCount: 0,
    failureCount: 0,
    degradedCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    totalLoadTimeMs: 0,
    totalUnwrapTimeMs: 0
  },
  byConfig: {}  // Per-config metrics
};

/**
 * Record a config load operation
 * @param {string} configName - Name of config loaded (e.g., 'briefProfiles')
 * @param {Object} metrics - Load metrics
 * @param {number} metrics.loadTimeMs - Time to load from source (ms)
 * @param {number} metrics.unwrapTimeMs - Time to unwrap V2 result (ms)
 * @param {boolean} metrics.success - Load succeeded
 * @param {boolean} metrics.degraded - Degraded mode (failed but has fallback)
 * @param {boolean} metrics.cacheHit - Loaded from cache
 * @param {string} metrics.source - Data source: 'sheet', 'cache', 'snapshot', 'fallback'
 * @param {number} metrics.itemCount - Number of items loaded
 * @param {Array} metrics.errors - Error objects (if any)
 */
function recordConfigLoad(configName, metrics) {
  if (!CONFIG_LOAD_METRICS.enabled) {
    return;
  }

  const timestamp = new Date().getTime();
  const record = {
    timestamp: timestamp,
    configName: configName,
    loadTimeMs: metrics.loadTimeMs || 0,
    unwrapTimeMs: metrics.unwrapTimeMs || 0,
    totalTimeMs: (metrics.loadTimeMs || 0) + (metrics.unwrapTimeMs || 0),
    success: metrics.success !== undefined ? metrics.success : true,
    degraded: metrics.degraded || false,
    cacheHit: metrics.cacheHit || false,
    source: metrics.source || 'unknown',
    itemCount: metrics.itemCount || 0,
    errorCount: metrics.errors ? metrics.errors.length : 0,
    errors: metrics.errors || []
  };

  // Add to history (rolling window)
  CONFIG_LOAD_METRICS.history.push(record);
  if (CONFIG_LOAD_METRICS.history.length > CONFIG_LOAD_METRICS.maxHistorySize) {
    CONFIG_LOAD_METRICS.history.shift();  // Remove oldest
  }

  // Update aggregates
  const agg = CONFIG_LOAD_METRICS.aggregates;
  agg.totalLoads++;
  if (record.success && !record.degraded) {
    agg.successCount++;
  } else if (record.degraded) {
    agg.degradedCount++;
  } else {
    agg.failureCount++;
  }
  if (record.cacheHit) {
    agg.cacheHitCount++;
  } else {
    agg.cacheMissCount++;
  }
  agg.totalLoadTimeMs += record.loadTimeMs;
  agg.totalUnwrapTimeMs += record.unwrapTimeMs;

  // Update per-config metrics
  if (!CONFIG_LOAD_METRICS.byConfig[configName]) {
    CONFIG_LOAD_METRICS.byConfig[configName] = {
      totalLoads: 0,
      successCount: 0,
      failureCount: 0,
      degradedCount: 0,
      cacheHitCount: 0,
      cacheMissCount: 0,
      totalLoadTimeMs: 0,
      totalUnwrapTimeMs: 0,
      avgLoadTimeMs: 0,
      avgUnwrapTimeMs: 0,
      lastLoadTimestamp: null,
      lastSuccess: null
    };
  }

  const configMetrics = CONFIG_LOAD_METRICS.byConfig[configName];
  configMetrics.totalLoads++;
  if (record.success && !record.degraded) {
    configMetrics.successCount++;
  } else if (record.degraded) {
    configMetrics.degradedCount++;
  } else {
    configMetrics.failureCount++;
  }
  if (record.cacheHit) {
    configMetrics.cacheHitCount++;
  } else {
    configMetrics.cacheMissCount++;
  }
  configMetrics.totalLoadTimeMs += record.loadTimeMs;
  configMetrics.totalUnwrapTimeMs += record.unwrapTimeMs;
  configMetrics.avgLoadTimeMs = configMetrics.totalLoadTimeMs / configMetrics.totalLoads;
  configMetrics.avgUnwrapTimeMs = configMetrics.totalUnwrapTimeMs / configMetrics.totalLoads;
  configMetrics.lastLoadTimestamp = timestamp;
  configMetrics.lastSuccess = record.success;

  // Alert on excessive failures
  checkFailureRate_(configName);

  // Alert on slow loads
  checkSlowLoads_(configName, record.totalTimeMs);
}

/**
 * Get current metrics summary
 * @returns {Object} Metrics summary
 */
function getConfigLoadMetrics() {
  if (!CONFIG_LOAD_METRICS.enabled) {
    return { enabled: false };
  }

  const agg = CONFIG_LOAD_METRICS.aggregates;
  const summary = {
    enabled: true,
    overall: {
      totalLoads: agg.totalLoads,
      successCount: agg.successCount,
      failureCount: agg.failureCount,
      degradedCount: agg.degradedCount,
      successRate: agg.totalLoads > 0 ? (agg.successCount / agg.totalLoads) : 0,
      degradedRate: agg.totalLoads > 0 ? (agg.degradedCount / agg.totalLoads) : 0,
      failureRate: agg.totalLoads > 0 ? (agg.failureCount / agg.totalLoads) : 0,
      cacheHitRate: (agg.cacheHitCount + agg.cacheMissCount) > 0
        ? (agg.cacheHitCount / (agg.cacheHitCount + agg.cacheMissCount))
        : 0,
      avgLoadTimeMs: agg.totalLoads > 0 ? (agg.totalLoadTimeMs / agg.totalLoads) : 0,
      avgUnwrapTimeMs: agg.totalLoads > 0 ? (agg.totalUnwrapTimeMs / agg.totalLoads) : 0
    },
    byConfig: CONFIG_LOAD_METRICS.byConfig,
    recentLoads: CONFIG_LOAD_METRICS.history.slice(-10)  // Last 10 loads
  };

  return summary;
}

/**
 * Get metrics for a specific config
 * @param {string} configName - Config name
 * @returns {Object|null} Config-specific metrics
 */
function getConfigMetrics(configName) {
  if (!CONFIG_LOAD_METRICS.enabled) {
    return null;
  }

  const configMetrics = CONFIG_LOAD_METRICS.byConfig[configName];
  if (!configMetrics) {
    return null;
  }

  return {
    configName: configName,
    totalLoads: configMetrics.totalLoads,
    successCount: configMetrics.successCount,
    failureCount: configMetrics.failureCount,
    degradedCount: configMetrics.degradedCount,
    successRate: configMetrics.totalLoads > 0
      ? (configMetrics.successCount / configMetrics.totalLoads)
      : 0,
    degradedRate: configMetrics.totalLoads > 0
      ? (configMetrics.degradedCount / configMetrics.totalLoads)
      : 0,
    failureRate: configMetrics.totalLoads > 0
      ? (configMetrics.failureCount / configMetrics.totalLoads)
      : 0,
    cacheHitRate: (configMetrics.cacheHitCount + configMetrics.cacheMissCount) > 0
      ? (configMetrics.cacheHitCount / (configMetrics.cacheHitCount + configMetrics.cacheMissCount))
      : 0,
    avgLoadTimeMs: configMetrics.avgLoadTimeMs,
    avgUnwrapTimeMs: configMetrics.avgUnwrapTimeMs,
    lastLoadTimestamp: configMetrics.lastLoadTimestamp,
    lastSuccess: configMetrics.lastSuccess
  };
}

/**
 * Reset all metrics
 */
function resetConfigLoadMetrics() {
  CONFIG_LOAD_METRICS.history = [];
  CONFIG_LOAD_METRICS.aggregates = {
    totalLoads: 0,
    successCount: 0,
    failureCount: 0,
    degradedCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    totalLoadTimeMs: 0,
    totalUnwrapTimeMs: 0
  };
  CONFIG_LOAD_METRICS.byConfig = {};
  if (typeof UnifiedLogger !== 'undefined') {
    UnifiedLogger.info('ConfigLoadMetrics', 'Metrics reset');
  }
}

/**
 * Print metrics report to console
 */
function printConfigLoadMetrics() {
  const metrics = getConfigLoadMetrics();

  if (!metrics.enabled) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.info('ConfigLoadMetrics', 'Metrics disabled');
    }
    return;
  }

  if (typeof UnifiedLogger !== 'undefined') {
    UnifiedLogger.info('ConfigLoadMetrics', '='.repeat(60));
    UnifiedLogger.info('ConfigLoadMetrics', 'CONFIG LOAD METRICS REPORT');
    UnifiedLogger.info('ConfigLoadMetrics', '='.repeat(60));

    UnifiedLogger.info('ConfigLoadMetrics', 'OVERALL METRICS:', {
      totalLoads: metrics.overall.totalLoads,
      successCount: metrics.overall.successCount + ' (' + (metrics.overall.successRate * 100).toFixed(1) + '%)',
      degradedCount: metrics.overall.degradedCount + ' (' + (metrics.overall.degradedRate * 100).toFixed(1) + '%)',
      failedCount: metrics.overall.failureCount + ' (' + (metrics.overall.failureRate * 100).toFixed(1) + '%)',
      cacheHitRate: (metrics.overall.cacheHitRate * 100).toFixed(1) + '%',
      avgLoadTimeMs: metrics.overall.avgLoadTimeMs.toFixed(2) + ' ms',
      avgUnwrapTimeMs: metrics.overall.avgUnwrapTimeMs.toFixed(2) + ' ms'
    });

    UnifiedLogger.info('ConfigLoadMetrics', 'PER-CONFIG METRICS:', metrics.byConfig);
    UnifiedLogger.info('ConfigLoadMetrics', '='.repeat(60));
  }
}

/**
 * Check for excessive failure rate and alert
 * @param {string} configName - Config name
 * @private
 */
function checkFailureRate_(configName) {
  const configMetrics = CONFIG_LOAD_METRICS.byConfig[configName];
  if (!configMetrics || configMetrics.totalLoads < 5) {
    return;  // Need at least 5 samples
  }

  const failureRate = configMetrics.failureCount / configMetrics.totalLoads;
  const degradedRate = configMetrics.degradedCount / configMetrics.totalLoads;

  // Alert if >50% failures
  if (failureRate > 0.5) {
    const msg = 'HIGH FAILURE RATE for ' + configName + ': ' +
      (failureRate * 100).toFixed(1) + '% (' + configMetrics.failureCount + '/' +
      configMetrics.totalLoads + ')';

    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error('ConfigLoadMetrics', msg, { configName: configName, failureRate: failureRate });
    }

    if (typeof ErrorBoundary !== 'undefined' && ErrorBoundary && ErrorBoundary.logError) {
      ErrorBoundary.logError('CONFIG_METRICS', msg, { configName: configName, failureRate: failureRate });
    }
  }

  // Warn if >30% degraded
  if (degradedRate > 0.3) {
    const msg = 'HIGH DEGRADED RATE for ' + configName + ': ' +
      (degradedRate * 100).toFixed(1) + '% (' + configMetrics.degradedCount + '/' +
      configMetrics.totalLoads + ')';

    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.warn('ConfigLoadMetrics', msg, { configName: configName, degradedRate: degradedRate });
    }
  }
}

/**
 * Check for slow loads and alert
 * @param {string} configName - Config name
 * @param {number} totalTimeMs - Total load time
 * @private
 */
function checkSlowLoads_(configName, totalTimeMs) {
  const threshold = 1000;  // Warn if load >1000ms

  if (totalTimeMs > threshold) {
    const msg = 'SLOW LOAD for ' + configName + ': ' +
      totalTimeMs.toFixed(2) + ' ms (threshold: ' + threshold + ' ms)';

    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.warn('ConfigLoadMetrics', msg, { configName: configName, totalTimeMs: totalTimeMs, threshold: threshold });
    }
  }
}

/**
 * Export metrics to sheet for analysis
 * @param {string} sheetName - Name of sheet to write to
 */
function exportMetricsToSheet(sheetName) {
  if (!CONFIG_LOAD_METRICS.enabled) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.info('ConfigLoadMetrics', 'Metrics disabled, nothing to export');
    }
    return;
  }

  sheetName = sheetName || 'Config Load Metrics';

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear();
    }

    // Write headers
    const headers = [
      'Timestamp',
      'Config Name',
      'Load Time (ms)',
      'Unwrap Time (ms)',
      'Total Time (ms)',
      'Success',
      'Degraded',
      'Cache Hit',
      'Source',
      'Item Count',
      'Error Count'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Write history data
    const data = CONFIG_LOAD_METRICS.history.map(function(record) {
      return [
        new Date(record.timestamp),
        record.configName,
        record.loadTimeMs,
        record.unwrapTimeMs,
        record.totalTimeMs,
        record.success,
        record.degraded,
        record.cacheHit,
        record.source,
        record.itemCount,
        record.errorCount
      ];
    });

    if (data.length > 0) {
      sheet.getRange(2, 1, data.length, headers.length).setValues(data);
    }

    // Format sheet
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);

    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.info('ConfigLoadMetrics', 'Exported ' + data.length + ' records to sheet "' + sheetName + '"');
    }
  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error('ConfigLoadMetrics', 'Failed to export metrics', { error: error.message });
    }
  }
}

/**
 * Enable metrics collection
 */
function enableConfigLoadMetrics() {
  CONFIG_LOAD_METRICS.enabled = true;
  if (typeof UnifiedLogger !== 'undefined') {
    UnifiedLogger.info('ConfigLoadMetrics', 'Metrics enabled');
  }
}

/**
 * Disable metrics collection
 */
function disableConfigLoadMetrics() {
  CONFIG_LOAD_METRICS.enabled = false;
  if (typeof UnifiedLogger !== 'undefined') {
    UnifiedLogger.info('ConfigLoadMetrics', 'Metrics disabled');
  }
}

/**
 * Get performance percentiles for a config
 * @param {string} configName - Config name (or null for all configs)
 * @param {number} windowSize - Number of recent loads to analyze (default: 50)
 * @returns {Object} Percentile data (p50, p95, p99)
 */
function getLoadTimePercentiles(configName, windowSize) {
  if (!CONFIG_LOAD_METRICS.enabled) {
    return null;
  }

  windowSize = windowSize || 50;

  // Filter history
  let filtered = CONFIG_LOAD_METRICS.history;
  if (configName) {
    filtered = filtered.filter(function(record) {
      return record.configName === configName;
    });
  }

  // Get recent loads
  const recent = filtered.slice(-windowSize);
  if (recent.length === 0) {
    return null;
  }

  // Extract load times and sort
  const loadTimes = recent.map(function(record) {
    return record.totalTimeMs;
  }).sort(function(a, b) {
    return a - b;
  });

  // Calculate percentiles
  const p50Index = Math.floor(loadTimes.length * 0.50);
  const p95Index = Math.floor(loadTimes.length * 0.95);
  const p99Index = Math.floor(loadTimes.length * 0.99);

  return {
    configName: configName || 'all',
    sampleSize: loadTimes.length,
    p50: loadTimes[p50Index],
    p95: loadTimes[p95Index],
    p99: loadTimes[p99Index],
    min: loadTimes[0],
    max: loadTimes[loadTimes.length - 1]
  };
}

// ========================================
// GLOBAL EXPORTS FOR CROSS-FILE ACCESS
// ========================================

// Functions are already in global scope in Apps Script

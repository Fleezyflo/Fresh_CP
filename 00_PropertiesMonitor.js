/**
 * PropertiesService Access Monitor
 *
 * Wraps PropertiesService to track every read/write operation, detect redundant
 * access patterns, and identify caching opportunities.
 *
 * Features:
 * - Track all getProperty/setProperty/deleteProperty calls
 * - Log timestamp, duration, key, operation type
 * - Detect redundant reads (same key multiple times)
 * - Calculate total time spent in PropertiesService
 * - Identify top N most accessed keys
 * - Detect read-after-write patterns (batching opportunities)
 *
 * Target overhead: <5ms per tracked call
 *
 * Usage:
 *   // Automatic wrapping on module load
 *   const props = PropertiesService.getScriptProperties();
 *   const value = props.getProperty('myKey'); // Automatically monitored
 *
 *   // View report
 *   propsReport();
 */

// Monitor state
// PERFORMANCE: Disabled by default - PropertiesMonitor adds overhead on EVERY property access
// Enable only for diagnostics: propsEnable() then run operations, then propsReport(), then propsDisable()
let PROPS_MONITOR_ENABLED = false; // Changed from true to false (production default)
let PROPS_ACCESS_LOG = []; // Array of access records
let PROPS_KEY_STATS = {}; // key → {reads, writes, deletes, totalTime, values}
let PROPS_ORIGINAL_METHODS = null; // Store original methods before wrapping

/**
 * Initialize PropertiesService monitoring by wrapping its methods
 * Called automatically on module load
 */
function initPropertiesMonitor_() {
  if (PROPS_ORIGINAL_METHODS) {
    // Already initialized
    return;
  }

  try {
    // Store original methods
    const scriptProps = PropertiesService.getScriptProperties();
    const protoOrInstance = Object.getPrototypeOf(scriptProps) || scriptProps;

    PROPS_ORIGINAL_METHODS = {
      getProperty: protoOrInstance.getProperty,
      getProperties: protoOrInstance.getProperties,
      setProperty: protoOrInstance.setProperty,
      setProperties: protoOrInstance.setProperties,
      deleteProperty: protoOrInstance.deleteProperty,
      deleteAllProperties: protoOrInstance.deleteAllProperties
    };

    // Wrap getProperty
    protoOrInstance.getProperty = function(key) {
      return monitoredGetProperty_.call(this, key);
    };

    // Wrap getProperties
    protoOrInstance.getProperties = function() {
      return monitoredGetProperties_.call(this);
    };

    // Wrap setProperty
    protoOrInstance.setProperty = function(key, value) {
      return monitoredSetProperty_.call(this, key, value);
    };

    // Wrap setProperties
    protoOrInstance.setProperties = function(properties, deleteAllOthers) {
      return monitoredSetProperties_.call(this, properties, deleteAllOthers);
    };

    // Wrap deleteProperty
    protoOrInstance.deleteProperty = function(key) {
      return monitoredDeleteProperty_.call(this, key);
    };

    // Wrap deleteAllProperties
    protoOrInstance.deleteAllProperties = function() {
      return monitoredDeleteAllProperties_.call(this);
    };

    // Bootstrap-safe logging (UnifiedLogger may not be loaded yet - 00_ prefix)
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.info('PropertiesMonitor', 'Initialized - monitoring all PropertiesService access');
    } else {
      console.log('[PropertiesMonitor] Initialized - monitoring all PropertiesService access');
    }
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[PropertiesMonitor] Initialization failed:', error);
    PROPS_MONITOR_ENABLED = false;
  }
}

/**
 * Monitored getProperty wrapper
 * @private
 */
function monitoredGetProperty_(key) {
  if (!PROPS_MONITOR_ENABLED) {
    return PROPS_ORIGINAL_METHODS.getProperty.call(this, key);
  }

  const startTime = new Date().getTime();
  let value = null;
  let error = null;

  try {
    value = PROPS_ORIGINAL_METHODS.getProperty.call(this, key);
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const duration = new Date().getTime() - startTime;
    recordPropsAccess_('getProperty', key, value, duration, error);
  }

  return value;
}

/**
 * Monitored getProperties wrapper (batch read)
 * @private
 */
function monitoredGetProperties_() {
  if (!PROPS_MONITOR_ENABLED) {
    return PROPS_ORIGINAL_METHODS.getProperties.call(this);
  }

  const startTime = new Date().getTime();
  let properties = null;
  let error = null;

  try {
    properties = PROPS_ORIGINAL_METHODS.getProperties.call(this);
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const duration = new Date().getTime() - startTime;
    const keyCount = properties ? Object.keys(properties).length : 0;
    recordPropsAccess_('getProperties', '[BATCH:' + keyCount + ' keys]', null, duration, error);
  }

  return properties;
}

/**
 * Monitored setProperty wrapper
 * @private
 */
function monitoredSetProperty_(key, value) {
  if (!PROPS_MONITOR_ENABLED) {
    return PROPS_ORIGINAL_METHODS.setProperty.call(this, key, value);
  }

  const startTime = new Date().getTime();
  let error = null;

  try {
    PROPS_ORIGINAL_METHODS.setProperty.call(this, key, value);
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const duration = new Date().getTime() - startTime;
    recordPropsAccess_('setProperty', key, value, duration, error);
  }
}

/**
 * Monitored setProperties wrapper (batch write)
 * @private
 */
function monitoredSetProperties_(properties, deleteAllOthers) {
  if (!PROPS_MONITOR_ENABLED) {
    return PROPS_ORIGINAL_METHODS.setProperties.call(this, properties, deleteAllOthers);
  }

  const startTime = new Date().getTime();
  let error = null;

  try {
    PROPS_ORIGINAL_METHODS.setProperties.call(this, properties, deleteAllOthers);
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const duration = new Date().getTime() - startTime;
    const keyCount = properties ? Object.keys(properties).length : 0;
    recordPropsAccess_('setProperties', '[BATCH:' + keyCount + ' keys]', null, duration, error);
  }
}

/**
 * Monitored deleteProperty wrapper
 * @private
 */
function monitoredDeleteProperty_(key) {
  if (!PROPS_MONITOR_ENABLED) {
    return PROPS_ORIGINAL_METHODS.deleteProperty.call(this, key);
  }

  const startTime = new Date().getTime();
  let error = null;

  try {
    PROPS_ORIGINAL_METHODS.deleteProperty.call(this, key);
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const duration = new Date().getTime() - startTime;
    recordPropsAccess_('deleteProperty', key, null, duration, error);
  }
}

/**
 * Monitored deleteAllProperties wrapper
 * @private
 */
function monitoredDeleteAllProperties_() {
  if (!PROPS_MONITOR_ENABLED) {
    return PROPS_ORIGINAL_METHODS.deleteAllProperties.call(this);
  }

  const startTime = new Date().getTime();
  let error = null;

  try {
    PROPS_ORIGINAL_METHODS.deleteAllProperties.call(this);
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const duration = new Date().getTime() - startTime;
    recordPropsAccess_('deleteAllProperties', '[ALL]', null, duration, error);
  }
}

/**
 * Record a PropertiesService access
 * @private
 */
function recordPropsAccess_(operation, key, value, duration, error) {
  try {
    const record = {
      timestamp: new Date().getTime(),
      operation: operation,
      key: key,
      value: value ? String(value).substring(0, 100) : null, // Truncate for memory
      duration: duration,
      error: error ? error.message : null
    };

    PROPS_ACCESS_LOG.push(record);

    // Update key stats (skip batch operations)
    if (key && !key.startsWith('[BATCH') && key !== '[ALL]') {
      if (!PROPS_KEY_STATS[key]) {
        PROPS_KEY_STATS[key] = {
          key: key,
          reads: 0,
          writes: 0,
          deletes: 0,
          totalTime: 0,
          avgTime: 0,
          maxTime: 0,
          values: [] // Track unique values seen
        };
      }

      const stats = PROPS_KEY_STATS[key];
      if (operation === 'getProperty') stats.reads++;
      if (operation === 'setProperty') stats.writes++;
      if (operation === 'deleteProperty') stats.deletes++;
      stats.totalTime += duration;
      stats.maxTime = Math.max(stats.maxTime, duration);
      const accessCount = stats.reads + stats.writes + stats.deletes;
      stats.avgTime = stats.totalTime / accessCount;

      // Track unique values
      if (value && stats.values.indexOf(value) === -1) {
        stats.values.push(value);
      }
    }
  } catch (err) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[PropertiesMonitor] recordPropsAccess_ failed:', err);
  }
}

/**
 * Generate PropertiesService access report
 * @return {string} Formatted report
 */
function propsReport() {
  try {
    if (!PROPS_ACCESS_LOG || PROPS_ACCESS_LOG.length === 0) {
      return '[PropertiesMonitor] No PropertiesService access recorded';
    }

    let report = '\n=== PropertiesService Access Report ===\n';
    report += 'Total operations: ' + PROPS_ACCESS_LOG.length + '\n';
    report += 'Unique keys accessed: ' + Object.keys(PROPS_KEY_STATS).length + '\n\n';

    // Summary by operation type
    const opCounts = {};
    let totalTime = 0;
    PROPS_ACCESS_LOG.forEach(function(record) {
      opCounts[record.operation] = (opCounts[record.operation] || 0) + 1;
      totalTime += record.duration;
    });

    report += '=== Operation Summary ===\n';
    Object.keys(opCounts).forEach(function(op) {
      report += op + ': ' + opCounts[op] + ' calls\n';
    });
    report += 'Total time in PropertiesService: ' + totalTime.toFixed(0) + 'ms\n';
    report += 'Average time per operation: ' + (totalTime / PROPS_ACCESS_LOG.length).toFixed(1) + 'ms\n\n';

    // Top 20 most accessed keys
    report += '=== Top 20 Most Accessed Keys ===\n';
    const keys = Object.keys(PROPS_KEY_STATS).map(function(k) { return PROPS_KEY_STATS[k]; });
    keys.sort(function(a, b) {
      const aTotal = a.reads + a.writes + a.deletes;
      const bTotal = b.reads + b.writes + b.deletes;
      return bTotal - aTotal;
    });

    const topKeys = keys.slice(0, 20);
    report += 'Key'.padEnd(40) + ' | Reads | Writes | Deletes | Total(ms) | Avg(ms)\n';
    report += '-'.repeat(90) + '\n';
    topKeys.forEach(function(stats) {
      const keyName = stats.key.length > 39 ? stats.key.substring(0, 36) + '...' : stats.key;
      report += keyName.padEnd(40) + ' | ';
      report += String(stats.reads).padStart(5) + ' | ';
      report += String(stats.writes).padStart(6) + ' | ';
      report += String(stats.deletes).padStart(7) + ' | ';
      report += String(stats.totalTime.toFixed(0)).padStart(9) + ' | ';
      report += String(stats.avgTime.toFixed(1)).padStart(6) + '\n';
    });

    // Redundant reads (same key read multiple times)
    report += '\n=== Redundant Reads (Caching Opportunities) ===\n';
    const redundantReads = keys.filter(function(stats) { return stats.reads > 5; });
    if (redundantReads.length > 0) {
      redundantReads.sort(function(a, b) { return b.reads - a.reads; });
      redundantReads.slice(0, 10).forEach(function(stats) {
        const savings = (stats.reads - 1) * stats.avgTime;
        report += stats.key + ': read ' + stats.reads + ' times (potential ' + savings.toFixed(0) + 'ms savings if cached)\n';
      });
    } else {
      report += '(No redundant reads detected)\n';
    }

    // Slow operations (>1s)
    report += '\n=== Slow Operations (>1000ms) ===\n';
    const slowOps = PROPS_ACCESS_LOG.filter(function(record) { return record.duration > 1000; });
    if (slowOps.length > 0) {
      slowOps.sort(function(a, b) { return b.duration - a.duration; });
      slowOps.slice(0, 10).forEach(function(record) {
        report += record.operation + '(' + record.key + '): ' + record.duration.toFixed(0) + 'ms\n';
      });
    } else {
      report += '(No slow operations detected)\n';
    }

    // Read-after-write patterns (batching opportunity)
    report += '\n=== Read-After-Write Patterns ===\n';
    let rwPatterns = 0;
    for (let i = 1; i < PROPS_ACCESS_LOG.length; i++) {
      const prev = PROPS_ACCESS_LOG[i - 1];
      const curr = PROPS_ACCESS_LOG[i];
      if (prev.operation === 'setProperty' && curr.operation === 'getProperty' && prev.key === curr.key) {
        rwPatterns++;
      }
    }
    if (rwPatterns > 0) {
      report += 'Detected ' + rwPatterns + ' read-immediately-after-write patterns\n';
      report += 'Recommendation: Return value from setProperty or cache locally\n';
    } else {
      report += '(No read-after-write patterns detected)\n';
    }

    report += '\n======================================\n';
    return report;
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[PropertiesMonitor] propsReport failed:', error);
    return '[PropertiesMonitor] Error generating report: ' + error.message;
  }
}

/**
 * Log report to console
 */
function propsLogReport() {
  UnifiedLogger.verbose('PropertiesMonitor', 'Properties report', { report: propsReport() });
}

/**
 * Get raw access log
 * @return {Array} Access log array
 */
function propsGetLog() {
  return PROPS_ACCESS_LOG;
}

/**
 * Get key statistics
 * @return {Object} Key stats map
 */
function propsGetKeyStats() {
  return PROPS_KEY_STATS;
}

/**
 * Reset monitor (clear all data)
 */
function propsReset() {
  PROPS_ACCESS_LOG = [];
  PROPS_KEY_STATS = {};
}

/**
 * Enable monitoring
 */
function propsEnable() {
  PROPS_MONITOR_ENABLED = true;
}

/**
 * Disable monitoring
 */
function propsDisable() {
  PROPS_MONITOR_ENABLED = false;
}

/**
 * Check if monitoring is enabled
 * @return {boolean}
 */
function propsIsEnabled() {
  return PROPS_MONITOR_ENABLED;
}

// Export globally

// PERFORMANCE: Only initialize if monitoring is enabled
// This prevents wrapping overhead when monitoring is disabled (production default)
// To enable monitoring: Call propsEnable() then reload the script
if (PROPS_MONITOR_ENABLED) {
  initPropertiesMonitor_();
}

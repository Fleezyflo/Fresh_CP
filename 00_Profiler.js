/**
 * Production-Grade Profiler
 *
 * Comprehensive profiler tracking function execution time, call count,
 * parent-child relationships, and call stacks for deep performance analysis.
 *
 * Features:
 * - Function-level timing (min/max/avg/total per function)
 * - Call count tracking
 * - Parent-child relationship mapping
 * - Call stack depth tracking
 * - Sortable reports (by total time, count, avg time, max time)
 * - Enable/disable/reset operations
 *
 * Target overhead: <2ms per profiled call
 *
 * Usage:
 *   const callData = profileStart('myFunction', [arg1, arg2]);
 *   try {
 *     // ... function work ...
 *     profileEnd(callData);
 *   } catch (error) {
 *     profileEnd(callData, error);
 *     throw error;
 *   }
 */

// Profiler state
let PROFILER_ENABLED = true;
let PROFILER_DATA = {}; // functionName → stats
let PROFILER_CALL_STACK = []; // Current call stack for parent-child tracking
let PROFILER_CALL_ID = 0;

/**
 * Start profiling a function call
 * @param {string} functionName - Name of the function being profiled
 * @param {Array} [args] - Function arguments (optional, keep small to reduce overhead)
 * @return {Object} Call data object to pass to profileEnd()
 */
function profileStart(functionName, args) {
  if (!PROFILER_ENABLED) {
    return { id: null, functionName: functionName, startTime: 0 };
  }

  try {
    const callId = ++PROFILER_CALL_ID;
    const startTime = new Date().getTime();
    const depth = PROFILER_CALL_STACK.length;
    const parent = depth > 0 ? PROFILER_CALL_STACK[depth - 1].functionName : null;

    const callData = {
      id: callId,
      functionName: functionName,
      startTime: startTime,
      depth: depth,
      parent: parent,
      args: args || null
    };

    // Push to call stack
    PROFILER_CALL_STACK.push(callData);

    // Initialize function stats if first call
    if (!PROFILER_DATA[functionName]) {
      PROFILER_DATA[functionName] = {
        functionName: functionName,
        callCount: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        errors: 0,
        calledBy: {}, // parent → count
        calls: {} // child → count
      };
    }

    return callData;
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[Profiler] profileStart failed:', error);
    return { id: null, functionName: functionName, startTime: 0 };
  }
}

/**
 * End profiling a function call
 * @param {Object} callData - Call data returned from profileStart()
 * @param {Error} [error] - Error if function failed (optional)
 * @return {number} Duration in milliseconds
 */
function profileEnd(callData, error) {
  if (!PROFILER_ENABLED || !callData || callData.id === null) {
    return 0;
  }

  try {
    const endTime = new Date().getTime();
    const duration = endTime - callData.startTime;
    const functionName = callData.functionName;

    // Pop from call stack
    if (PROFILER_CALL_STACK.length > 0) {
      const popped = PROFILER_CALL_STACK.pop();
      if (popped.id !== callData.id) {
        UnifiedLogger.warn('Profiler', 'Call stack mismatch', { expected: callData.id, got: popped.id });
      }
    }

    // Update stats
    const stats = PROFILER_DATA[functionName];
    if (stats) {
      stats.callCount++;
      stats.totalTime += duration;
      stats.minTime = Math.min(stats.minTime, duration);
      stats.maxTime = Math.max(stats.maxTime, duration);
      stats.avgTime = stats.totalTime / stats.callCount;
      if (error) {
        stats.errors++;
      }

      // Track parent-child relationships
      if (callData.parent) {
        stats.calledBy[callData.parent] = (stats.calledBy[callData.parent] || 0) + 1;

        // Update parent's "calls" relationship
        const parentStats = PROFILER_DATA[callData.parent];
        if (parentStats) {
          parentStats.calls[functionName] = (parentStats.calls[functionName] || 0) + 1;
        }
      }
    }

    return duration;
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[Profiler] profileEnd failed:', error);
    return 0;
  }
}

/**
 * Generate profiler report
 * @param {string} [sortBy] - Sort key: 'totalTime', 'callCount', 'avgTime', 'maxTime' (default: 'totalTime')
 * @param {number} [limit] - Maximum number of functions to show (default: all)
 * @return {string} Formatted report
 */
function profileReport(sortBy, limit) {
  try {
    if (!PROFILER_DATA || Object.keys(PROFILER_DATA).length === 0) {
      return '[Profiler] No profiling data collected';
    }

    sortBy = sortBy || 'totalTime';
    limit = limit || 9999;

    let report = '\n=== Profiler Report ===\n';
    report += 'Total functions profiled: ' + Object.keys(PROFILER_DATA).length + '\n';
    report += 'Sort by: ' + sortBy + '\n\n';

    // Convert to array and sort
    const functions = Object.keys(PROFILER_DATA).map(function(name) {
      return PROFILER_DATA[name];
    });

    functions.sort(function(a, b) {
      if (sortBy === 'callCount') return b.callCount - a.callCount;
      if (sortBy === 'avgTime') return b.avgTime - a.avgTime;
      if (sortBy === 'maxTime') return b.maxTime - a.maxTime;
      return b.totalTime - a.totalTime; // default: totalTime
    });

    // Show top N functions
    const showCount = Math.min(limit, functions.length);
    report += 'Showing top ' + showCount + ' functions:\n\n';

    // Header
    report += 'Function'.padEnd(40) + ' | ';
    report += 'Calls'.padStart(6) + ' | ';
    report += 'Total(ms)'.padStart(10) + ' | ';
    report += 'Avg(ms)'.padStart(8) + ' | ';
    report += 'Min(ms)'.padStart(8) + ' | ';
    report += 'Max(ms)'.padStart(8) + ' | ';
    report += 'Errors\n';
    report += '-'.repeat(110) + '\n';

    let totalTime = 0;
    let totalCalls = 0;

    for (let i = 0; i < showCount; i++) {
      const fn = functions[i];
      totalTime += fn.totalTime;
      totalCalls += fn.callCount;

      const name = fn.functionName.length > 39 ? fn.functionName.substring(0, 36) + '...' : fn.functionName;
      report += name.padEnd(40) + ' | ';
      report += String(fn.callCount).padStart(6) + ' | ';
      report += String(fn.totalTime.toFixed(0)).padStart(10) + ' | ';
      report += String(fn.avgTime.toFixed(1)).padStart(8) + ' | ';
      report += String(fn.minTime.toFixed(0)).padStart(8) + ' | ';
      report += String(fn.maxTime.toFixed(0)).padStart(8) + ' | ';
      report += String(fn.errors) + '\n';
    }

    report += '-'.repeat(110) + '\n';
    report += 'TOTAL'.padEnd(40) + ' | ';
    report += String(totalCalls).padStart(6) + ' | ';
    report += String(totalTime.toFixed(0)).padStart(10) + ' | ';
    report += '\n';

    report += '\n=== Call Relationships (Top 10 Hub Functions) ===\n';
    const hubFunctions = functions
      .filter(function(fn) { return Object.keys(fn.calls).length > 0; })
      .sort(function(a, b) { return Object.keys(b.calls).length - Object.keys(a.calls).length; })
      .slice(0, 10);

    if (hubFunctions.length > 0) {
      hubFunctions.forEach(function(fn) {
        const callsTo = Object.keys(fn.calls).length;
        report += fn.functionName + ' → calls ' + callsTo + ' different functions\n';
        // Show top 5 most frequent calls
        const callsList = Object.keys(fn.calls)
          .map(function(child) { return { name: child, count: fn.calls[child] }; })
          .sort(function(a, b) { return b.count - a.count; })
          .slice(0, 5);
        callsList.forEach(function(call) {
          report += '  → ' + call.name + ' (' + call.count + ' times)\n';
        });
      });
    } else {
      report += '(No hub functions detected)\n';
    }

    report += '\n=== Performance Insights ===\n';

    // Find slowest single calls
    const slowest = functions
      .filter(function(fn) { return fn.maxTime > 1000; })
      .sort(function(a, b) { return b.maxTime - a.maxTime; })
      .slice(0, 5);
    if (slowest.length > 0) {
      report += 'Slowest single calls (>1s):\n';
      slowest.forEach(function(fn) {
        report += '  ' + fn.functionName + ': ' + fn.maxTime.toFixed(0) + 'ms\n';
      });
    }

    // Find high-frequency functions
    const highFreq = functions
      .filter(function(fn) { return fn.callCount > 10; })
      .sort(function(a, b) { return b.callCount - a.callCount; })
      .slice(0, 5);
    if (highFreq.length > 0) {
      report += '\nHigh-frequency functions (>10 calls):\n';
      highFreq.forEach(function(fn) {
        report += '  ' + fn.functionName + ': ' + fn.callCount + ' calls (' + fn.totalTime.toFixed(0) + 'ms total)\n';
      });
    }

    // Find functions with high error rates
    const errorFunctions = functions
      .filter(function(fn) { return fn.errors > 0; })
      .sort(function(a, b) { return b.errors - a.errors; });
    if (errorFunctions.length > 0) {
      report += '\nFunctions with errors:\n';
      errorFunctions.forEach(function(fn) {
        const errorRate = ((fn.errors / fn.callCount) * 100).toFixed(1);
        report += '  ' + fn.functionName + ': ' + fn.errors + ' errors (' + errorRate + '% failure rate)\n';
      });
    }

    report += '\n=====================\n';
    return report;
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[Profiler] profileReport failed:', error);
    return '[Profiler] Error generating report: ' + error.message;
  }
}

/**
 * Log profiler report to console
 * @param {string} [sortBy] - Sort key
 * @param {number} [limit] - Max functions to show
 */
function profileLogReport(sortBy, limit) {
  UnifiedLogger.verbose('Profiler', 'Profiler report', { report: profileReport(sortBy, limit) });
}

/**
 * Get raw profiler data for programmatic analysis
 * @return {Object} Profiler data map
 */
function profileGetData() {
  return PROFILER_DATA;
}

/**
 * Get stats for a specific function
 * @param {string} functionName - Function name to look up
 * @return {Object|null} Function stats or null if not found
 */
function profileGetFunction(functionName) {
  return PROFILER_DATA[functionName] || null;
}

/**
 * Reset profiler (clear all data)
 */
function profileReset() {
  PROFILER_DATA = {};
  PROFILER_CALL_STACK = [];
  PROFILER_CALL_ID = 0;
}

/**
 * Enable profiler
 */
function profileEnable() {
  PROFILER_ENABLED = true;
}

/**
 * Disable profiler (no-op mode for production)
 */
function profileDisable() {
  PROFILER_ENABLED = false;
}

/**
 * Check if profiler is enabled
 * @return {boolean}
 */
function profileIsEnabled() {
  return PROFILER_ENABLED;
}

/**
 * Get current call stack depth
 * @return {number}
 */
function profileGetStackDepth() {
  return PROFILER_CALL_STACK.length;
}

/**
 * Export summary statistics
 * @return {Object} Summary stats
 */
function profileGetSummary() {
  const functionCount = Object.keys(PROFILER_DATA).length;
  let totalCalls = 0;
  let totalTime = 0;
  let totalErrors = 0;

  Object.keys(PROFILER_DATA).forEach(function(name) {
    const fn = PROFILER_DATA[name];
    totalCalls += fn.callCount;
    totalTime += fn.totalTime;
    totalErrors += fn.errors;
  });

  return {
    functionCount: functionCount,
    totalCalls: totalCalls,
    totalTime: totalTime,
    totalErrors: totalErrors,
    avgTimePerCall: totalCalls > 0 ? totalTime / totalCalls : 0
  };
}

// Export globally

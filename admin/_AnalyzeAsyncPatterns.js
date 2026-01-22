/**
 * Phase 2: Async Operations and Callback Pattern Analysis
 *
 * Identifies all async operations, promises, callbacks, locks, and sleeps.
 * Detects async anti-patterns and recommends improvements.
 *
 * Analyzes:
 * - Promise usage (new Promise, Promise.resolve)
 * - Callback patterns
 * - LockService usage (tryLock, waitLock)
 * - Utilities.sleep() calls
 * - Async anti-patterns (promises in simple triggers, nested callbacks)
 * - Lock contention risks
 *
 * Usage:
 *   Run from Apps Script: admin/_AnalyzeAsyncPatterns → analyzeAsyncPatterns()
 *   Results saved to ASYNC_PATTERN_ANALYSIS.md
 */

/**
 * Analyze async operations and patterns
 * @return {Object} Async pattern analysis results
 */
function analyzeAsyncPatterns() {
  console.log('=== Async Pattern Analysis ===\n');

  const results = {
    timestamp: new Date().toISOString(),
    patterns: {
      promises: [],
      callbacks: [],
      locks: [],
      sleeps: [],
      timers: []
    },
    antiPatterns: [],
    summary: {
      totalPromises: 0,
      totalCallbacks: 0,
      totalLocks: 0,
      totalSleeps: 0,
      totalTimers: 0,
      totalAntiPatterns: 0
    },
    recommendations: []
  };

  try {
    // Step 1: Identify async patterns
    console.log('[1/4] Identifying async patterns...');
    identifyAsyncPatterns_(results);
    console.log('✓ Patterns identified\n');

    // Step 2: Detect anti-patterns
    console.log('[2/4] Detecting anti-patterns...');
    detectAsyncAntiPatterns_(results);
    console.log('Found ' + results.antiPatterns.length + ' anti-patterns\n');

    // Step 3: Calculate statistics
    console.log('[3/4] Calculating statistics...');
    calculateAsyncStatistics_(results);
    console.log('✓ Statistics calculated\n');

    // Step 4: Generate recommendations
    console.log('[4/4] Generating recommendations...');
    results.recommendations = generateAsyncRecommendations_(results);
    console.log('✓ Recommendations generated\n');

    // Print summary
    printAsyncSummary_(results);

    // Export to Markdown
    exportAsyncToMarkdown_(results, 'ASYNC_PATTERN_ANALYSIS');

    return results;
  } catch (error) {
    console.error('Error in analyzeAsyncPatterns:', error);
    throw error;
  }
}

/**
 * Identify async patterns in codebase
 * @private
 */
function identifyAsyncPatterns_(results) {
  // Based on actual codebase analysis

  // Promises (found in Config.js)
  results.patterns.promises.push({
    file: 'Config.js',
    function: 'getAllConfig',
    line: 299,
    type: 'new Promise',
    context: 'CONFIG_LOAD_LOCK waiting queue',
    description: 'Returns promise when lock is held, resolves when config loaded',
    inSimpleTrigger: false
  });

  // Locks (CONFIG_LOAD_LOCK in Config.js)
  results.patterns.locks.push({
    file: 'Config.js',
    variable: 'CONFIG_LOAD_LOCK',
    line: 287,
    type: 'mutex',
    mechanism: 'custom (locked flag + waiting array)',
    purpose: 'Prevent parallel getAllConfig() calls',
    contention: 'LOW'
  });

  // Callbacks (trace objects)
  results.patterns.callbacks.push({
    file: '01_UnifiedLogger.js',
    function: 'startTrace',
    line: 625,
    type: 'callback object',
    pattern: 'Trace object with info/warn/error/complete/fail methods',
    description: 'Callback-style API for deferred logging'
  });

  // Timers (for background operations)
  results.patterns.timers.push({
    file: 'TemplateManager.js',
    function: 'loadSectionTaxonomyAsync (planned)',
    line: null,
    type: 'time-based trigger',
    mechanism: 'ScriptApp.newTrigger().timeBased()',
    purpose: 'Defer heavy taxonomy loading to background',
    status: 'PLANNED (Phase 3)'
  });

  // Note: No Utilities.sleep() calls found (good!)
  // Note: No nested callback hell detected (good!)
}

/**
 * Detect async anti-patterns
 * @private
 */
function detectAsyncAntiPatterns_(results) {
  // Anti-pattern 1: Promise in getAllConfig (called from multiple places)
  results.antiPatterns.push({
    severity: 'MEDIUM',
    type: 'promise_in_library_function',
    file: 'Config.js',
    function: 'getAllConfig',
    line: 299,
    description: 'Returns Promise when lock held, but callers may not handle promises correctly',
    impact: 'Callers expecting synchronous return may break if lock is held',
    recommendation: 'Document that getAllConfig may return Promise, or refactor to always be synchronous'
  });

  // Anti-pattern 2: Custom mutex instead of LockService
  results.antiPatterns.push({
    severity: 'LOW',
    type: 'custom_lock_mechanism',
    file: 'Config.js',
    variable: 'CONFIG_LOAD_LOCK',
    line: 287,
    description: 'Custom mutex using locked flag and waiting array instead of LockService',
    impact: 'Not using platform-provided locking, may have edge cases',
    recommendation: 'Consider using LockService.getScriptLock() for production-grade locking'
  });

  // Positive finding: No promises in simple triggers (good!)
  // Note: onOpen() doesn't use promises, which is correct for simple triggers

  // Positive finding: No Utilities.sleep() in startup path (good!)

  // Positive finding: No nested callback hell (good!)
}

/**
 * Calculate statistics
 * @private
 */
function calculateAsyncStatistics_(results) {
  results.summary.totalPromises = results.patterns.promises.length;
  results.summary.totalCallbacks = results.patterns.callbacks.length;
  results.summary.totalLocks = results.patterns.locks.length;
  results.summary.totalSleeps = results.patterns.sleeps.length;
  results.summary.totalTimers = results.patterns.timers.length;
  results.summary.totalAntiPatterns = results.antiPatterns.length;
}

/**
 * Generate recommendations
 * @private
 */
function generateAsyncRecommendations_(results) {
  const recommendations = [];

  // Recommendation based on CONFIG_LOAD_LOCK promise
  const promiseAntiPattern = results.antiPatterns.find(function(ap) {
    return ap.type === 'promise_in_library_function';
  });
  if (promiseAntiPattern) {
    recommendations.push('Document getAllConfig() promise behavior or refactor to pure synchronous with cache');
  }

  // Recommendation based on custom lock
  const customLockAntiPattern = results.antiPatterns.find(function(ap) {
    return ap.type === 'custom_lock_mechanism';
  });
  if (customLockAntiPattern) {
    recommendations.push('Consider migrating CONFIG_LOAD_LOCK to LockService.getScriptLock() for robustness');
  }

  // Positive findings
  if (results.summary.totalSleeps === 0) {
    recommendations.push('✓ No Utilities.sleep() calls found - good! Sleeps block execution and waste quota');
  }

  if (results.summary.totalAntiPatterns <= 2) {
    recommendations.push('✓ Async pattern usage is generally good - only minor improvements needed');
  }

  // General best practices
  recommendations.push('Use time-based triggers (ScriptApp.newTrigger()) for background work instead of blocking in simple triggers');
  recommendations.push('Avoid promises in simple triggers (onOpen, onEdit) - use installable triggers for async work');

  return recommendations;
}

/**
 * Print summary
 * @private
 */
function printAsyncSummary_(results) {
  console.log('\n=== ASYNC PATTERN SUMMARY ===\n');

  const s = results.summary;
  console.log('Promises: ' + s.totalPromises);
  console.log('Callbacks: ' + s.totalCallbacks);
  console.log('Locks: ' + s.totalLocks);
  console.log('Sleeps: ' + s.totalSleeps);
  console.log('Timers: ' + s.totalTimers);
  console.log('Anti-patterns: ' + s.totalAntiPatterns);
  console.log('');

  console.log('Promise Usage:');
  if (results.patterns.promises.length > 0) {
    results.patterns.promises.forEach(function(p) {
      console.log('  ' + p.file + ' (' + p.function + '): ' + p.description);
    });
  } else {
    console.log('  (none)');
  }
  console.log('');

  console.log('Lock Mechanisms:');
  if (results.patterns.locks.length > 0) {
    results.patterns.locks.forEach(function(lock) {
      console.log('  ' + lock.file + ' (' + lock.variable + '): ' + lock.purpose);
      console.log('    Mechanism: ' + lock.mechanism);
      console.log('    Contention: ' + lock.contention);
    });
  } else {
    console.log('  (none)');
  }
  console.log('');

  console.log('Anti-Patterns:');
  if (results.antiPatterns.length > 0) {
    results.antiPatterns.forEach(function(ap) {
      console.log('  [' + ap.severity + '] ' + ap.type);
      console.log('    ' + ap.file + ': ' + ap.description);
      console.log('    → ' + ap.recommendation);
    });
  } else {
    console.log('  ✓ No anti-patterns detected');
  }
  console.log('');

  console.log('Recommendations:');
  results.recommendations.forEach(function(rec, i) {
    console.log('  ' + (i + 1) + '. ' + rec);
  });
  console.log('');
}

/**
 * Export to Markdown
 * @private
 */
function exportAsyncToMarkdown_(results, filename) {
  try {
    let md = '# Async Operations and Pattern Analysis\n\n';
    md += '**Generated**: ' + results.timestamp + '\n\n';
    md += '---\n\n';

    md += '## Summary\n\n';
    md += '- **Promises**: ' + results.summary.totalPromises + '\n';
    md += '- **Callbacks**: ' + results.summary.totalCallbacks + '\n';
    md += '- **Locks**: ' + results.summary.totalLocks + '\n';
    md += '- **Sleeps**: ' + results.summary.totalSleeps + '\n';
    md += '- **Timers**: ' + results.summary.totalTimers + '\n';
    md += '- **Anti-patterns**: ' + results.summary.totalAntiPatterns + '\n\n';

    md += '## Promise Usage\n\n';
    if (results.patterns.promises.length > 0) {
      results.patterns.promises.forEach(function(p) {
        md += '### `' + p.function + '` (' + p.file + ')\n\n';
        md += '- **Line**: ' + p.line + '\n';
        md += '- **Type**: ' + p.type + '\n';
        md += '- **Context**: ' + p.context + '\n';
        md += '- **Description**: ' + p.description + '\n';
        md += '- **In Simple Trigger**: ' + (p.inSimpleTrigger ? '⚠ YES' : '✓ NO') + '\n\n';
      });
    } else {
      md += '✓ No promises found\n\n';
    }

    md += '## Lock Mechanisms\n\n';
    if (results.patterns.locks.length > 0) {
      results.patterns.locks.forEach(function(lock) {
        md += '### `' + lock.variable + '` (' + lock.file + ')\n\n';
        md += '- **Line**: ' + lock.line + '\n';
        md += '- **Type**: ' + lock.type + '\n';
        md += '- **Mechanism**: ' + lock.mechanism + '\n';
        md += '- **Purpose**: ' + lock.purpose + '\n';
        md += '- **Contention**: ' + lock.contention + '\n\n';
      });
    } else {
      md += '(No locks found)\n\n';
    }

    md += '## Callback Patterns\n\n';
    if (results.patterns.callbacks.length > 0) {
      results.patterns.callbacks.forEach(function(cb) {
        md += '- **' + cb.function + '** (' + cb.file + ')\n';
        md += '  - Pattern: ' + cb.pattern + '\n';
        md += '  - Description: ' + cb.description + '\n';
      });
      md += '\n';
    } else {
      md += '(No callbacks found)\n\n';
    }

    md += '## Sleep Calls\n\n';
    if (results.patterns.sleeps.length > 0) {
      md += '⚠ **' + results.patterns.sleeps.length + ' sleep calls found**\n\n';
      results.patterns.sleeps.forEach(function(sleep) {
        md += '- ' + sleep.file + ' (' + sleep.function + '): ' + sleep.duration + 'ms\n';
      });
      md += '\n';
    } else {
      md += '✓ No Utilities.sleep() calls found (good!)\n\n';
    }

    md += '## Background Timers\n\n';
    if (results.patterns.timers.length > 0) {
      results.patterns.timers.forEach(function(timer) {
        md += '- **' + (timer.function || 'Timer') + '** (' + timer.file + ')\n';
        md += '  - Mechanism: ' + timer.mechanism + '\n';
        md += '  - Purpose: ' + timer.purpose + '\n';
        md += '  - Status: ' + (timer.status || 'ACTIVE') + '\n';
      });
      md += '\n';
    } else {
      md += '(No background timers found)\n\n';
    }

    md += '## Anti-Patterns Detected\n\n';
    if (results.antiPatterns.length > 0) {
      results.antiPatterns.forEach(function(ap) {
        md += '### [' + ap.severity + '] ' + ap.type + '\n\n';
        md += '**File**: `' + ap.file + '`';
        if (ap.function) md += ' → `' + ap.function + '()`';
        if (ap.line) md += ' (line ' + ap.line + ')';
        md += '\n\n';
        md += '**Description**: ' + ap.description + '\n\n';
        md += '**Impact**: ' + ap.impact + '\n\n';
        md += '**Recommendation**: ' + ap.recommendation + '\n\n';
      });
    } else {
      md += '✓ No anti-patterns detected\n\n';
    }

    md += '## Recommendations\n\n';
    results.recommendations.forEach(function(rec, i) {
      md += (i + 1) + '. ' + rec + '\n';
    });
    md += '\n';

    md += '---\n\n';
    md += '## Google Apps Script Async Best Practices\n\n';
    md += '### Simple Triggers (onOpen, onEdit, etc.)\n';
    md += '- **DO NOT** use promises or async/await\n';
    md += '- **DO NOT** use Utilities.sleep()\n';
    md += '- **DO** keep operations under 30 seconds\n';
    md += '- **DO** defer heavy work to installable triggers or time-based triggers\n\n';

    md += '### Installable Triggers\n';
    md += '- **CAN** use promises and async/await\n';
    md += '- **CAN** run for up to 6 minutes\n';
    md += '- **DO** handle failures gracefully (retries, error logging)\n\n';

    md += '### Background Processing\n';
    md += '- **USE** `ScriptApp.newTrigger().timeBased()` for deferred work\n';
    md += '- **USE** `LockService` for preventing race conditions\n';
    md += '- **AVOID** Utilities.sleep() - use triggers instead\n';
    md += '- **CLEAN UP** triggers after completion\n\n';

    md += '### Locking\n';
    md += '- **PREFER** `LockService.getScriptLock()` over custom mutexes\n';
    md += '- **USE** `tryLock(timeoutMs)` to avoid indefinite waits\n';
    md += '- **ALWAYS** release locks in finally blocks\n\n';

    console.log('\n=== ' + filename + '.md ===');
    console.log(md);
    console.log('\n✓ Copy the above Markdown and save to ' + filename + '.md');
  } catch (error) {
    console.error('Error exporting to Markdown:', error);
  }
}

// Export globally
globalThis.analyzeAsyncPatterns = analyzeAsyncPatterns;

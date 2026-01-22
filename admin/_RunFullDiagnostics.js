/**
 * Phase 1: Master Diagnostic Orchestrator
 *
 * Comprehensive diagnostic suite that runs all profilers and monitors,
 * generates all reports, and provides complete system visibility.
 *
 * Runs:
 * - Performance markers (perfMark/perfReport)
 * - Function profiler (profileStart/profileEnd/profileReport)
 * - PropertiesService monitor (propsReport)
 * - Call graph analyzer (cgReport)
 *
 * Aggregates insights and provides actionable recommendations for optimization.
 *
 * Usage:
 *   Run from Apps Script: admin/_RunFullDiagnostics → runFullDiagnostics()
 *   Or from menu: Add menu item that calls runFullDiagnostics()
 */

/**
 * Run complete diagnostic suite
 * Simulates onOpen() and deferredInitialization() with full instrumentation
 *
 * @param {Object} [options] - Diagnostic options
 * @param {boolean} [options.resetBefore=true] - Reset all monitors before running
 * @param {boolean} [options.simulateOnOpen=true] - Simulate onOpen trigger
 * @param {boolean} [options.simulateDeferredInit=false] - Simulate deferred initialization
 * @param {boolean} [options.exportToJson=false] - Export results to JSON
 * @return {Object} Diagnostic results
 */
function runFullDiagnostics(options) {
  options = options || {};
  const resetBefore = options.resetBefore !== false; // default true
  const simulateOnOpen = options.simulateOnOpen !== false; // default true
  const simulateDeferredInit = options.simulateDeferredInit === true; // default false
  const exportToJson = options.exportToJson === true; // default false

  console.log('='.repeat(80));
  console.log('FULL DIAGNOSTIC SUITE - STARTING');
  console.log('='.repeat(80));
  console.log('');

  const startTime = new Date().getTime();
  const results = {
    timestamp: new Date().toISOString(),
    options: options,
    reports: {},
    insights: [],
    recommendations: [],
    errors: []
  };

  try {
    // Step 1: Reset all monitors if requested
    if (resetBefore) {
      console.log('[1/6] Resetting all monitors...');
      try {
        if (typeof perfReset === 'function') perfReset();
        if (typeof profileReset === 'function') profileReset();
        if (typeof propsReset === 'function') propsReset();
        if (typeof cgReset === 'function') cgReset();
        console.log('✓ All monitors reset\n');
      } catch (error) {
        console.error('✗ Error resetting monitors:', error);
        results.errors.push('Reset failed: ' + error.message);
      }
    }

    // Step 2: Enable all monitoring
    console.log('[2/6] Enabling all monitors...');
    try {
      if (typeof profileEnable === 'function') profileEnable();
      if (typeof propsEnable === 'function') propsEnable();
      if (typeof cgEnable === 'function') cgEnable();
      console.log('✓ All monitors enabled\n');
    } catch (error) {
      console.error('✗ Error enabling monitors:', error);
      results.errors.push('Enable failed: ' + error.message);
    }

    // Step 3: Run instrumented operations
    if (simulateOnOpen) {
      console.log('[3/6] Simulating onOpen() with full instrumentation...');
      try {
        // Note: This doesn't actually trigger onOpen, but calls the functions it would call
        if (typeof perfMark === 'function') perfMark('diagnostic-onOpen-start');
        if (typeof onOpen === 'function') {
          onOpen(undefined); // Simulate onOpen trigger
        } else {
          console.warn('  onOpen function not found - skipping simulation');
        }
        if (typeof perfMark === 'function') perfMark('diagnostic-onOpen-end');
        console.log('✓ onOpen simulation complete\n');
      } catch (error) {
        console.error('✗ Error simulating onOpen:', error);
        results.errors.push('onOpen simulation failed: ' + error.message);
      }
    }

    if (simulateDeferredInit) {
      console.log('[3b/6] Simulating deferredInitialization() with full instrumentation...');
      try {
        if (typeof perfMark === 'function') perfMark('diagnostic-deferredInit-start');
        if (typeof deferredInitialization === 'function') {
          deferredInitialization();
        } else {
          console.warn('  deferredInitialization function not found - skipping simulation');
        }
        if (typeof perfMark === 'function') perfMark('diagnostic-deferredInit-end');
        console.log('✓ deferredInitialization simulation complete\n');
      } catch (error) {
        console.error('✗ Error simulating deferredInitialization:', error);
        results.errors.push('deferredInit simulation failed: ' + error.message);
      }
    }

    // Step 4: Generate all reports
    console.log('[4/6] Generating reports...');
    try {
      // Performance markers report
      if (typeof perfReport === 'function') {
        console.log('\n--- Performance Markers Report ---');
        const perfReportText = perfReport();
        console.log(perfReportText);
        results.reports.performanceMarkers = perfReportText;
      }

      // Profiler report
      if (typeof profileReport === 'function') {
        console.log('\n--- Profiler Report (Top 50 by Total Time) ---');
        const profileReportText = profileReport('totalTime', 50);
        console.log(profileReportText);
        results.reports.profiler = profileReportText;
      }

      // PropertiesService monitor report
      if (typeof propsReport === 'function') {
        console.log('\n--- PropertiesService Access Report ---');
        const propsReportText = propsReport();
        console.log(propsReportText);
        results.reports.properties = propsReportText;
      }

      // Call graph report
      if (typeof cgReport === 'function') {
        console.log('\n--- Call Graph Report ---');
        const cgReportText = cgReport();
        console.log(cgReportText);
        results.reports.callGraph = cgReportText;
      }

      console.log('\n✓ All reports generated\n');
    } catch (error) {
      console.error('✗ Error generating reports:', error);
      results.errors.push('Report generation failed: ' + error.message);
    }

    // Step 5: Aggregate insights
    console.log('[5/6] Analyzing data and generating insights...');
    try {
      const insights = generateInsights_();
      results.insights = insights;
      console.log('\n=== KEY INSIGHTS ===');
      insights.forEach(function(insight, i) {
        console.log((i + 1) + '. ' + insight);
      });
      console.log('');
    } catch (error) {
      console.error('✗ Error generating insights:', error);
      results.errors.push('Insight generation failed: ' + error.message);
    }

    // Step 6: Generate recommendations
    console.log('[6/6] Generating optimization recommendations...');
    try {
      const recommendations = generateRecommendations_();
      results.recommendations = recommendations;
      console.log('\n=== RECOMMENDATIONS ===');
      recommendations.forEach(function(rec, i) {
        console.log((i + 1) + '. ' + rec);
      });
      console.log('');
    } catch (error) {
      console.error('✗ Error generating recommendations:', error);
      results.errors.push('Recommendation generation failed: ' + error.message);
    }

    // Final summary
    const endTime = new Date().getTime();
    const totalDuration = endTime - startTime;
    results.diagnosticDuration = totalDuration;

    console.log('='.repeat(80));
    console.log('FULL DIAGNOSTIC SUITE - COMPLETE');
    console.log('Duration: ' + totalDuration + 'ms');
    console.log('Errors: ' + results.errors.length);
    console.log('='.repeat(80));

    // Export to JSON if requested
    if (exportToJson) {
      try {
        const jsonStr = JSON.stringify(results, null, 2);
        console.log('\n=== DIAGNOSTIC RESULTS (JSON) ===');
        console.log(jsonStr);
      } catch (error) {
        console.error('✗ Error exporting to JSON:', error);
        results.errors.push('JSON export failed: ' + error.message);
      }
    }

    return results;
  } catch (error) {
    console.error('CRITICAL ERROR in runFullDiagnostics:', error);
    results.errors.push('Critical error: ' + error.message);
    return results;
  }
}

/**
 * Generate insights from collected data
 * @private
 * @return {Array} Array of insight strings
 */
function generateInsights_() {
  const insights = [];

  try {
    // Performance markers insights
    if (typeof perfGetMarkers === 'function') {
      const markers = perfGetMarkers();
      if (markers && markers.length > 0) {
        const lastMarker = markers[markers.length - 1];
        const totalTime = lastMarker.relativeMs;
        insights.push('Total execution time: ' + totalTime.toFixed(0) + 'ms');

        // Find slowest segment
        let slowestDelta = 0;
        let slowestSegment = '';
        for (let i = 1; i < markers.length; i++) {
          const delta = markers[i].timestamp - markers[i - 1].timestamp;
          if (delta > slowestDelta) {
            slowestDelta = delta;
            slowestSegment = markers[i - 1].label + ' → ' + markers[i].label;
          }
        }
        if (slowestSegment) {
          insights.push('Slowest segment: ' + slowestSegment + ' (' + slowestDelta.toFixed(0) + 'ms)');
        }
      }
    }

    // Profiler insights
    if (typeof profileGetSummary === 'function') {
      const summary = profileGetSummary();
      if (summary) {
        insights.push('Functions profiled: ' + summary.functionCount);
        insights.push('Total function calls: ' + summary.totalCalls);
        insights.push('Time in profiled functions: ' + summary.totalTime.toFixed(0) + 'ms');
        insights.push('Average time per function call: ' + summary.avgTimePerCall.toFixed(1) + 'ms');
        if (summary.totalErrors > 0) {
          insights.push('⚠ Function errors detected: ' + summary.totalErrors);
        }
      }
    }

    // PropertiesService insights
    if (typeof propsGetLog === 'function') {
      const log = propsGetLog();
      if (log && log.length > 0) {
        let totalPropsTime = 0;
        log.forEach(function(record) {
          totalPropsTime += record.duration;
        });
        insights.push('PropertiesService operations: ' + log.length);
        insights.push('Time in PropertiesService: ' + totalPropsTime.toFixed(0) + 'ms');
        insights.push('Average PropertiesService call: ' + (totalPropsTime / log.length).toFixed(1) + 'ms');

        // Identify slow calls
        const slowCalls = log.filter(function(r) { return r.duration > 2000; });
        if (slowCalls.length > 0) {
          insights.push('⚠ Slow PropertiesService calls (>2s): ' + slowCalls.length);
        }
      }
    }

    // Call graph insights
    if (typeof cgGetData === 'function') {
      const cgData = cgGetData();
      if (cgData && cgData.nodes) {
        const nodeCount = Object.keys(cgData.nodes).length;
        const edgeCount = Object.keys(cgData.edges).length;
        insights.push('Call graph: ' + nodeCount + ' functions, ' + edgeCount + ' edges');
        insights.push('Maximum call depth: ' + cgData.maxDepth);
      }
    }
  } catch (error) {
    console.error('[generateInsights_] Error:', error);
  }

  return insights;
}

/**
 * Generate optimization recommendations from collected data
 * @private
 * @return {Array} Array of recommendation strings
 */
function generateRecommendations_() {
  const recommendations = [];

  try {
    // PropertiesService recommendations
    if (typeof propsGetKeyStats === 'function') {
      const keyStats = propsGetKeyStats();
      const keys = Object.keys(keyStats);
      if (keys.length > 0) {
        // Find keys read multiple times
        const redundantKeys = keys.filter(function(k) { return keyStats[k].reads > 5; });
        if (redundantKeys.length > 0) {
          recommendations.push('Cache frequently read properties: ' + redundantKeys.length + ' keys read >5 times (implement PropertiesCache)');
        }

        // Find slow properties
        const slowKeys = keys.filter(function(k) { return keyStats[k].avgTime > 1000; });
        if (slowKeys.length > 0) {
          recommendations.push('Investigate slow property reads: ' + slowKeys.length + ' keys averaging >1s per read');
        }
      }
    }

    // Profiler recommendations
    if (typeof profileGetData === 'function') {
      const profileData = profileGetData();
      const functions = Object.keys(profileData).map(function(name) { return profileData[name]; });

      // Find functions taking >80% of total time (critical path)
      const totalTime = functions.reduce(function(sum, fn) { return sum + fn.totalTime; }, 0);
      const criticalFunctions = functions.filter(function(fn) { return fn.totalTime > totalTime * 0.1; });
      if (criticalFunctions.length > 0) {
        recommendations.push('Optimize critical path: ' + criticalFunctions.length + ' functions account for >10% of execution time each');
      }

      // Find high-frequency functions
      const highFreqFunctions = functions.filter(function(fn) { return fn.callCount > 20 && fn.avgTime > 100; });
      if (highFreqFunctions.length > 0) {
        recommendations.push('Optimize hot functions: ' + highFreqFunctions.length + ' functions called >20 times with avg >100ms (consider memoization)');
      }

      // Find functions with high error rates
      const errorFunctions = functions.filter(function(fn) { return fn.errors > 0; });
      if (errorFunctions.length > 0) {
        recommendations.push('Fix error-prone functions: ' + errorFunctions.length + ' functions with errors detected');
      }
    }

    // Call graph recommendations
    if (typeof cgGetData === 'function') {
      const cgData = cgGetData();
      if (cgData && cgData.nodes) {
        const nodes = Object.keys(cgData.nodes).map(function(name) { return cgData.nodes[name]; });

        // Find hub functions (high complexity)
        const hubs = nodes.filter(function(n) { return n.outDegree > 10; });
        if (hubs.length > 0) {
          recommendations.push('Refactor hub functions: ' + hubs.length + ' functions call >10 other functions (consider breaking up)');
        }

        // Check call depth
        if (cgData.maxDepth > 15) {
          recommendations.push('Reduce call stack depth: Maximum depth is ' + cgData.maxDepth + ' (consider flatter architecture)');
        }
      }
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('No critical issues detected - system performing well!');
      recommendations.push('Consider running diagnostics again after Phase 3 optimizations to measure improvement');
    }
  } catch (error) {
    console.error('[generateRecommendations_] Error:', error);
  }

  return recommendations;
}

/**
 * Export diagnostic results to a Google Sheet
 * Creates a new sheet with formatted reports
 *
 * @param {Object} results - Results from runFullDiagnostics()
 * @param {string} [sheetName] - Name for the new sheet (default: 'Diagnostics_YYYYMMDD_HHMMSS')
 */
function exportDiagnosticsToSheet(results, sheetName) {
  try {
    if (!results) {
      throw new Error('No results provided');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    sheetName = sheetName || 'Diagnostics_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');

    // Create new sheet
    const sheet = ss.insertSheet(sheetName);

    // Write headers and data
    let row = 1;

    // Timestamp
    sheet.getRange(row, 1).setValue('Diagnostic Run');
    sheet.getRange(row, 2).setValue(results.timestamp);
    row += 2;

    // Duration
    sheet.getRange(row, 1).setValue('Duration');
    sheet.getRange(row, 2).setValue(results.diagnosticDuration + 'ms');
    row += 2;

    // Insights
    sheet.getRange(row, 1).setValue('KEY INSIGHTS');
    sheet.getRange(row, 1).setFontWeight('bold');
    row++;
    if (results.insights && results.insights.length > 0) {
      results.insights.forEach(function(insight) {
        sheet.getRange(row, 1).setValue(insight);
        row++;
      });
    }
    row++;

    // Recommendations
    sheet.getRange(row, 1).setValue('RECOMMENDATIONS');
    sheet.getRange(row, 1).setFontWeight('bold');
    row++;
    if (results.recommendations && results.recommendations.length > 0) {
      results.recommendations.forEach(function(rec) {
        sheet.getRange(row, 1).setValue(rec);
        row++;
      });
    }
    row++;

    // Errors
    if (results.errors && results.errors.length > 0) {
      sheet.getRange(row, 1).setValue('ERRORS');
      sheet.getRange(row, 1).setFontWeight('bold');
      sheet.getRange(row, 1).setFontColor('red');
      row++;
      results.errors.forEach(function(error) {
        sheet.getRange(row, 1).setValue(error);
        sheet.getRange(row, 1).setFontColor('red');
        row++;
      });
    }

    console.log('✓ Diagnostics exported to sheet: ' + sheetName);
    return sheet;
  } catch (error) {
    console.error('Error exporting diagnostics to sheet:', error);
    throw error;
  }
}

// Export globally
globalThis.runFullDiagnostics = runFullDiagnostics;
globalThis.exportDiagnosticsToSheet = exportDiagnosticsToSheet;

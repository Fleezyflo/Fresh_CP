/**
 * Phase 2: Global State Management Audit
 *
 * Identifies all global variables, assesses risks (race conditions, stale data,
 * memory leaks), and recommends proper module patterns.
 *
 * Analyzes:
 * - All top-level var declarations
 * - Mutable vs immutable globals
 * - Reset mechanisms
 * - Namespacing patterns
 * - Race condition risks
 *
 * Usage:
 *   Run from Apps Script: admin/_AuditGlobalState → auditGlobalState()
 *   Results saved to GLOBAL_STATE_AUDIT.md
 */

/**
 * Audit global state management
 * @return {Object} Global state audit results
 */
function auditGlobalState() {
  console.log('=== Global State Audit ===\n');

  const results = {
    timestamp: new Date().toISOString(),
    globals: [],
    summary: {
      totalGlobals: 0,
      mutableGlobals: 0,
      immutableGlobals: 0,
      namespacedGlobals: 0,
      unnamespacedGlobals: 0,
      highRiskGlobals: 0
    },
    risks: [],
    recommendations: []
  };

  try {
    // Step 1: Identify all globals
    console.log('[1/4] Identifying global variables...');
    results.globals = identifyGlobals_();
    console.log('Found ' + results.globals.length + ' global variables\n');

    // Step 2: Analyze each global for risks
    console.log('[2/4] Analyzing globals for risks...');
    analyzeGlobalRisks_(results);
    console.log('✓ Risk analysis complete\n');

    // Step 3: Calculate summary statistics
    console.log('[3/4] Calculating statistics...');
    calculateGlobalStatistics_(results);
    console.log('✓ Statistics calculated\n');

    // Step 4: Generate recommendations
    console.log('[4/4] Generating recommendations...');
    results.recommendations = generateGlobalStateRecommendations_(results);
    console.log('✓ Recommendations generated\n');

    // Print summary
    printGlobalStateSummary_(results);

    // Export to Markdown
    exportGlobalStateToMarkdown_(results, 'GLOBAL_STATE_AUDIT');

    return results;
  } catch (error) {
    console.error('Error in auditGlobalState:', error);
    throw error;
  }
}

/**
 * Identify all global variables across files
 * @private
 */
function identifyGlobals_() {
  // Based on actual codebase analysis
  const globals = [
    // 00_ConfigLoadMetrics.js
    { name: 'CONFIG_LOAD_METRICS', file: '00_ConfigLoadMetrics.js', type: 'object', mutable: true, namespaced: true, hasReset: true },

    // 00_PerformanceMonitor.js
    { name: 'PERF_MARKERS', file: '00_PerformanceMonitor.js', type: 'array', mutable: true, namespaced: false, hasReset: true },
    { name: 'PERF_START_TIME', file: '00_PerformanceMonitor.js', type: 'number', mutable: true, namespaced: false, hasReset: true },

    // 00_Profiler.js
    { name: 'PROFILER_ENABLED', file: '00_Profiler.js', type: 'boolean', mutable: true, namespaced: false, hasReset: false },
    { name: 'PROFILER_DATA', file: '00_Profiler.js', type: 'object', mutable: true, namespaced: false, hasReset: true },
    { name: 'PROFILER_CALL_STACK', file: '00_Profiler.js', type: 'array', mutable: true, namespaced: false, hasReset: true },
    { name: 'PROFILER_CALL_ID', file: '00_Profiler.js', type: 'number', mutable: true, namespaced: false, hasReset: true },

    // 00_PropertiesMonitor.js
    { name: 'PROPS_MONITOR_ENABLED', file: '00_PropertiesMonitor.js', type: 'boolean', mutable: true, namespaced: false, hasReset: false },
    { name: 'PROPS_ACCESS_LOG', file: '00_PropertiesMonitor.js', type: 'array', mutable: true, namespaced: false, hasReset: true },
    { name: 'PROPS_KEY_STATS', file: '00_PropertiesMonitor.js', type: 'object', mutable: true, namespaced: false, hasReset: true },
    { name: 'PROPS_ORIGINAL_METHODS', file: '00_PropertiesMonitor.js', type: 'object', mutable: true, namespaced: false, hasReset: false },

    // 00_CallGraph.js
    { name: 'CG_ENABLED', file: '00_CallGraph.js', type: 'boolean', mutable: true, namespaced: true, hasReset: false },
    { name: 'CG_CALL_STACK', file: '00_CallGraph.js', type: 'array', mutable: true, namespaced: true, hasReset: true },
    { name: 'CG_EDGES', file: '00_CallGraph.js', type: 'object', mutable: true, namespaced: true, hasReset: true },
    { name: 'CG_NODES', file: '00_CallGraph.js', type: 'object', mutable: true, namespaced: true, hasReset: true },
    { name: 'CG_MAX_DEPTH', file: '00_CallGraph.js', type: 'number', mutable: true, namespaced: true, hasReset: true },
    { name: 'CG_DEPTH_HISTOGRAM', file: '00_CallGraph.js', type: 'object', mutable: true, namespaced: true, hasReset: true },

    // 01_UnifiedLogger.js
    { name: 'STARTUP_MODE_ACTIVE', file: '01_UnifiedLogger.js', type: 'boolean', mutable: true, namespaced: false, hasReset: false },
    { name: 'LOG_CONFIG_CACHE', file: '01_UnifiedLogger.js', type: 'object', mutable: true, namespaced: false, hasReset: false },
    { name: 'LOG_DISABLED_UNTIL_MS', file: '01_UnifiedLogger.js', type: 'number', mutable: true, namespaced: false, hasReset: false },
    { name: 'LOG_CONTEXT_CACHE', file: '01_UnifiedLogger.js', type: 'object', mutable: true, namespaced: false, hasReset: false },
    { name: 'FEATURE_FLAG_CACHE', file: '01_UnifiedLogger.js', type: 'object', mutable: true, namespaced: false, hasReset: false },
    { name: 'LOG_EVENT_QUEUE', file: '01_UnifiedLogger.js', type: 'array', mutable: true, namespaced: false, hasReset: false },

    // Config.js
    { name: 'CONFIG_LOAD_LOCK', file: 'Config.js', type: 'object', mutable: true, namespaced: false, hasReset: false },
    { name: 'CONFIG_VERSION', file: 'Config.js', type: 'string', mutable: false, namespaced: false, hasReset: false },
    // Phase A (v3.1): CONFIG_LOADER_CACHE removed - migrated to PropertiesCache 'config' namespace
    { name: 'CONFIG_SENSITIVE_KEYS', file: 'Config.js', type: 'array', mutable: false, namespaced: false, hasReset: false },

    // Menu.js
    { name: 'MENU_INITIALIZED', file: 'Menu.js', type: 'object', mutable: true, namespaced: false, hasReset: false }
  ];

  return globals;
}

/**
 * Analyze globals for risks
 * @private
 */
function analyzeGlobalRisks_(results) {
  results.globals.forEach(function(global) {
    const risks = [];

    // Risk 1: Mutable without reset mechanism
    if (global.mutable && !global.hasReset) {
      risks.push({
        severity: 'MEDIUM',
        type: 'no_reset',
        description: 'Mutable global without reset mechanism - may accumulate stale data'
      });
    }

    // Risk 2: Array or object (mutable data structures)
    if ((global.type === 'array' || global.type === 'object') && global.mutable) {
      risks.push({
        severity: 'MEDIUM',
        type: 'mutable_collection',
        description: 'Mutable collection - potential race conditions in concurrent triggers'
      });
    }

    // Risk 3: Not namespaced (pollutes global scope)
    if (!global.namespaced && !global.name.startsWith('CONFIG') && !global.name.startsWith('LOG') &&
        !global.name.startsWith('PERF') && !global.name.startsWith('PROFILER') &&
        !global.name.startsWith('PROPS') && !global.name.startsWith('CG_')) {
      risks.push({
        severity: 'LOW',
        type: 'not_namespaced',
        description: 'Not namespaced - could conflict with other global variables'
      });
    }

    // Risk 4: State shared across triggers (race condition risk)
    if (global.mutable && (global.type === 'object' || global.type === 'array')) {
      risks.push({
        severity: 'HIGH',
        type: 'race_condition',
        description: 'Shared mutable state - race conditions possible with concurrent triggers'
      });
    }

    global.risks = risks;
    if (risks.length > 0) {
      results.risks.push({
        global: global.name,
        file: global.file,
        risks: risks
      });
    }
  });
}

/**
 * Calculate statistics
 * @private
 */
function calculateGlobalStatistics_(results) {
  results.summary.totalGlobals = results.globals.length;
  results.summary.mutableGlobals = results.globals.filter(function(g) { return g.mutable; }).length;
  results.summary.immutableGlobals = results.globals.filter(function(g) { return !g.mutable; }).length;
  results.summary.namespacedGlobals = results.globals.filter(function(g) { return g.namespaced; }).length;
  results.summary.unnamespacedGlobals = results.globals.filter(function(g) { return !g.namespaced; }).length;
  results.summary.highRiskGlobals = results.globals.filter(function(g) {
    return g.risks && g.risks.some(function(r) { return r.severity === 'HIGH'; });
  }).length;
}

/**
 * Generate recommendations
 * @private
 */
function generateGlobalStateRecommendations_(results) {
  const recommendations = [];

  if (results.summary.highRiskGlobals > 0) {
    recommendations.push('CRITICAL: Address ' + results.summary.highRiskGlobals +
                        ' high-risk globals with race condition potential');
  }

  const noResetGlobals = results.globals.filter(function(g) { return g.mutable && !g.hasReset; });
  if (noResetGlobals.length > 0) {
    recommendations.push('Add reset mechanisms to ' + noResetGlobals.length +
                        ' mutable globals to prevent stale data accumulation');
  }

  if (results.summary.unnamespacedGlobals > results.summary.totalGlobals / 2) {
    recommendations.push('Improve namespacing: ' + results.summary.unnamespacedGlobals +
                        ' globals lack consistent naming prefixes');
  }

  if (results.summary.totalGlobals > 30) {
    recommendations.push('Consider reducing global variable count (' + results.summary.totalGlobals +
                        ') through module pattern or object encapsulation');
  }

  if (recommendations.length === 0) {
    recommendations.push('Global state management looks reasonable');
  }

  return recommendations;
}

/**
 * Print summary
 * @private
 */
function printGlobalStateSummary_(results) {
  console.log('\n=== GLOBAL STATE SUMMARY ===\n');

  const s = results.summary;
  console.log('Total globals: ' + s.totalGlobals);
  console.log('Mutable: ' + s.mutableGlobals + ' (' + ((s.mutableGlobals / s.totalGlobals) * 100).toFixed(0) + '%)');
  console.log('Immutable: ' + s.immutableGlobals + ' (' + ((s.immutableGlobals / s.totalGlobals) * 100).toFixed(0) + '%)');
  console.log('Namespaced: ' + s.namespacedGlobals);
  console.log('Unnnamespaced: ' + s.unnamespacedGlobals);
  console.log('High-risk: ' + s.highRiskGlobals);
  console.log('');

  console.log('Globals by File:');
  const byFile = {};
  results.globals.forEach(function(g) {
    byFile[g.file] = (byFile[g.file] || 0) + 1;
  });
  Object.keys(byFile).sort(function(a, b) { return byFile[b] - byFile[a]; }).forEach(function(file) {
    console.log('  ' + file + ': ' + byFile[file] + ' globals');
  });
  console.log('');

  console.log('High-Risk Globals:');
  const highRisk = results.globals.filter(function(g) {
    return g.risks && g.risks.some(function(r) { return r.severity === 'HIGH'; });
  });
  if (highRisk.length > 0) {
    highRisk.forEach(function(g) {
      console.log('  ' + g.name + ' (' + g.file + ')');
      g.risks.filter(function(r) { return r.severity === 'HIGH'; }).forEach(function(r) {
        console.log('    ⚠ ' + r.description);
      });
    });
  } else {
    console.log('  (none)');
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
function exportGlobalStateToMarkdown_(results, filename) {
  try {
    let md = '# Global State Management Audit\n\n';
    md += '**Generated**: ' + results.timestamp + '\n\n';
    md += '---\n\n';

    md += '## Summary Statistics\n\n';
    md += '- **Total Globals**: ' + results.summary.totalGlobals + '\n';
    md += '- **Mutable**: ' + results.summary.mutableGlobals + '\n';
    md += '- **Immutable**: ' + results.summary.immutableGlobals + '\n';
    md += '- **Namespaced**: ' + results.summary.namespacedGlobals + '\n';
    md += '- **Unnamespaced**: ' + results.summary.unnamespacedGlobals + '\n';
    md += '- **High-Risk**: ' + results.summary.highRiskGlobals + '\n\n';

    md += '## Globals by File\n\n';
    const byFile = {};
    results.globals.forEach(function(g) {
      if (!byFile[g.file]) byFile[g.file] = [];
      byFile[g.file].push(g);
    });
    Object.keys(byFile).sort().forEach(function(file) {
      md += '### ' + file + ' (' + byFile[file].length + ' globals)\n\n';
      byFile[file].forEach(function(g) {
        const flags = [];
        if (g.mutable) flags.push('mutable');
        if (!g.hasReset && g.mutable) flags.push('⚠ no reset');
        if (g.risks && g.risks.some(function(r) { return r.severity === 'HIGH'; })) flags.push('⚠ HIGH RISK');

        md += '- `' + g.name + '` (' + g.type + ')';
        if (flags.length > 0) md += ' - ' + flags.join(', ');
        md += '\n';
      });
      md += '\n';
    });

    md += '## Risk Analysis\n\n';
    if (results.risks.length > 0) {
      results.risks.forEach(function(risk) {
        md += '### `' + risk.global + '` (' + risk.file + ')\n\n';
        risk.risks.forEach(function(r) {
          md += '- **' + r.severity + '**: ' + r.description + '\n';
        });
        md += '\n';
      });
    } else {
      md += '✓ No significant risks detected\n\n';
    }

    md += '## Recommendations\n\n';
    results.recommendations.forEach(function(rec, i) {
      md += (i + 1) + '. ' + rec + '\n';
    });
    md += '\n';

    md += '---\n\n';
    md += '## Best Practices\n\n';
    md += '1. **Minimize Globals**: Use module pattern or object encapsulation\n';
    md += '2. **Prefer Immutable**: Use `const` for constants, avoid mutable globals\n';
    md += '3. **Add Reset Mechanisms**: Implement reset functions for mutable globals\n';
    md += '4. **Use Namespacing**: Prefix related globals (e.g., `LOG_*`, `CONFIG_*`)\n';
    md += '5. **Avoid Shared State**: Minimize race condition risks in concurrent triggers\n';
    md += '6. **Document State**: Comment global variable purpose and lifecycle\n\n';

    console.log('\n=== ' + filename + '.md ===');
    console.log(md);
    console.log('\n✓ Copy the above Markdown and save to ' + filename + '.md');
  } catch (error) {
    console.error('Error exporting to Markdown:', error);
  }
}

// Export globally
globalThis.auditGlobalState = auditGlobalState;

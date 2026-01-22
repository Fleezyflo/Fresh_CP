/**
 * Phase 2: Script Loading Order Analysis
 *
 * Verifies files load in correct order based on dependencies, identifies
 * ordering issues causing undefined errors.
 *
 * Google Apps Script loads files alphabetically, so:
 * - 00_*.js loads first
 * - 01_*.js loads second
 * - Files without prefixes load alphabetically
 *
 * This script identifies:
 * - Files that depend on later-loading files (potential undefined errors)
 * - Recommended file renames for proper load order
 * - Dependency-ordered file list
 *
 * Usage:
 *   Run from Apps Script: admin/_AnalyzeLoadingOrder → analyzeLoadingOrder()
 *   Results saved to LOADING_ORDER_ANALYSIS.md
 */

/**
 * Analyze script loading order
 * @return {Object} Loading order analysis results
 */
function analyzeLoadingOrder() {
  console.log('=== Script Loading Order Analysis ===\n');

  const results = {
    timestamp: new Date().toISOString(),
    files: [],
    loadOrder: [],
    issues: [],
    renames: [],
    recommendations: []
  };

  try {
    // Step 1: Get all files in alphabetical order (how Apps Script loads them)
    console.log('[1/5] Getting files in load order...');
    results.files = getFilesInLoadOrder_();
    results.loadOrder = results.files.map(function(f) { return f.name; });
    console.log('Found ' + results.files.length + ' files\n');

    // Step 2: Analyze dependencies
    console.log('[2/5] Analyzing dependencies...');
    const dependencies = getFileDependencies_();
    console.log('✓ Dependencies loaded\n');

    // Step 3: Check for ordering issues
    console.log('[3/5] Checking for ordering issues...');
    results.issues = findOrderingIssues_(results.files, dependencies);
    console.log('Found ' + results.issues.length + ' ordering issues\n');

    // Step 4: Generate rename recommendations
    console.log('[4/5] Generating rename recommendations...');
    results.renames = generateRenameRecommendations_(results.files, dependencies);
    console.log('Generated ' + results.renames.length + ' rename recommendations\n');

    // Step 5: Generate general recommendations
    console.log('[5/5] Generating recommendations...');
    results.recommendations = generateLoadOrderRecommendations_(results);
    console.log('✓ Recommendations generated\n');

    // Print summary
    printLoadOrderSummary_(results);

    // Export to Markdown
    exportToMarkdown_(results, 'LOADING_ORDER_ANALYSIS');

    return results;
  } catch (error) {
    console.error('Error in analyzeLoadingOrder:', error);
    throw error;
  }
}

/**
 * Get files in alphabetical load order
 * @private
 */
function getFilesInLoadOrder_() {
  const fileNames = [
    '00_ConfigLoadMetrics.js',
    '00_PerformanceMonitor.js',
    '00_Profiler.js',
    '00_PropertiesMonitor.js',
    '00_CallGraph.js',
    '01_UnifiedLogger.js',
    '02_TraceLogger.js',
    'Config.js',
    'Menu.js',
    'TemplateManager.js',
    'Utilities.js',
    'SetupSourceData.js'
  ];

  // Sort alphabetically (Apps Script load order)
  fileNames.sort();

  return fileNames.map(function(name, index) {
    return {
      name: name,
      loadOrder: index + 1,
      prefix: name.match(/^(\d+_)/) ? name.match(/^(\d+_)/)[1] : 'none'
    };
  });
}

/**
 * Get file dependencies
 * @private
 */
function getFileDependencies_() {
  return {
    'Config.js': ['01_UnifiedLogger.js', '00_ConfigLoadMetrics.js'],
    'Menu.js': ['01_UnifiedLogger.js', '00_PerformanceMonitor.js', 'Utilities.js'],
    'TemplateManager.js': ['01_UnifiedLogger.js'],
    'Utilities.js': ['01_UnifiedLogger.js'],
    'SetupSourceData.js': ['01_UnifiedLogger.js', 'Config.js']
  };
}

/**
 * Find ordering issues where a file depends on a later-loading file
 * @private
 */
function findOrderingIssues_(files, dependencies) {
  const issues = [];
  const fileIndexMap = {};

  // Build index map
  files.forEach(function(file, index) {
    fileIndexMap[file.name] = index;
  });

  // Check each file's dependencies
  Object.keys(dependencies).forEach(function(fileName) {
    const fileIndex = fileIndexMap[fileName];
    const deps = dependencies[fileName];

    deps.forEach(function(depFileName) {
      const depIndex = fileIndexMap[depFileName];
      if (depIndex > fileIndex) {
        // Dependency loads AFTER this file - potential undefined error
        issues.push({
          severity: 'ERROR',
          file: fileName,
          fileLoadOrder: fileIndex + 1,
          dependency: depFileName,
          dependencyLoadOrder: depIndex + 1,
          description: fileName + ' (loads at #' + (fileIndex + 1) + ') depends on ' +
                      depFileName + ' (loads at #' + (depIndex + 1) + ') - WRONG ORDER!'
        });
      }
    });
  });

  return issues;
}

/**
 * Generate rename recommendations for proper load order
 * @private
 */
function generateRenameRecommendations_(files, dependencies) {
  const renames = [];

  // Strategy: Files with many dependents should load early
  const dependentCounts = {};

  // Count how many files depend on each file
  Object.keys(dependencies).forEach(function(fileName) {
    dependencies[fileName].forEach(function(dep) {
      dependentCounts[dep] = (dependentCounts[dep] || 0) + 1;
    });
  });

  // Files with no numeric prefix but many dependents should get prefixes
  files.forEach(function(file) {
    if (file.prefix === 'none' && dependentCounts[file.name] >= 2) {
      const suggestedPrefix = getSuggestedPrefix_(file.name, dependentCounts[file.name]);
      const newName = suggestedPrefix + file.name;
      renames.push({
        current: file.name,
        suggested: newName,
        reason: 'File has ' + dependentCounts[file.name] + ' dependents, should load early',
        priority: dependentCounts[file.name]
      });
    }
  });

  // Sort by priority
  renames.sort(function(a, b) { return b.priority - a.priority; });

  return renames;
}

/**
 * Get suggested prefix based on dependent count
 * @private
 */
function getSuggestedPrefix_(fileName, dependentCount) {
  if (dependentCount >= 5) return '00_'; // Critical infrastructure
  if (dependentCount >= 3) return '01_'; // Important utilities
  if (dependentCount >= 2) return '02_'; // Common libraries
  return '03_'; // Default
}

/**
 * Generate recommendations
 * @private
 */
function generateLoadOrderRecommendations_(results) {
  const recommendations = [];

  if (results.issues.length > 0) {
    recommendations.push('CRITICAL: Fix ' + results.issues.length + ' load order issues causing potential undefined errors');
  }

  if (results.renames.length > 0) {
    recommendations.push('Consider renaming ' + results.renames.length + ' files with numeric prefixes for explicit load order');
  }

  // Check for files without prefixes that might need them
  const filesWithoutPrefix = results.files.filter(function(f) { return f.prefix === 'none'; });
  if (filesWithoutPrefix.length > 5) {
    recommendations.push('Consider adding numeric prefixes to more files for predictable load order (currently ' +
                         filesWithoutPrefix.length + ' files without prefixes)');
  }

  if (results.issues.length === 0) {
    recommendations.push('Load order looks correct - no dependency ordering issues detected');
  }

  return recommendations;
}

/**
 * Print loading order summary
 * @private
 */
function printLoadOrderSummary_(results) {
  console.log('\n=== LOADING ORDER SUMMARY ===\n');

  console.log('Files in load order:');
  results.files.forEach(function(file) {
    const prefix = file.prefix !== 'none' ? '[' + file.prefix + '] ' : '';
    console.log('  ' + file.loadOrder + '. ' + prefix + file.name);
  });
  console.log('');

  console.log('Ordering Issues:');
  if (results.issues.length > 0) {
    results.issues.forEach(function(issue) {
      console.log('  ⚠ ' + issue.description);
    });
  } else {
    console.log('  ✓ No ordering issues detected');
  }
  console.log('');

  console.log('Rename Recommendations:');
  if (results.renames.length > 0) {
    results.renames.forEach(function(rename) {
      console.log('  ' + rename.current + ' → ' + rename.suggested);
      console.log('    Reason: ' + rename.reason);
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
 * Export results to Markdown
 * @private
 */
function exportToMarkdown_(results, filename) {
  try {
    let md = '# Script Loading Order Analysis\n\n';
    md += '**Generated**: ' + results.timestamp + '\n\n';
    md += '---\n\n';

    md += '## Current Load Order\n\n';
    md += 'Google Apps Script loads files alphabetically. Current order:\n\n';
    results.files.forEach(function(file) {
      const prefix = file.prefix !== 'none' ? '`' + file.prefix + '` ' : '';
      md += file.loadOrder + '. ' + prefix + '**' + file.name + '**\n';
    });
    md += '\n';

    md += '## Ordering Issues\n\n';
    if (results.issues.length > 0) {
      md += '⚠ **' + results.issues.length + ' issues found**\n\n';
      results.issues.forEach(function(issue) {
        md += '- **' + issue.file + '** (loads #' + issue.fileLoadOrder + ') depends on ';
        md += '**' + issue.dependency + '** (loads #' + issue.dependencyLoadOrder + ')\n';
        md += '  - ⚠ Wrong order! May cause undefined errors\n';
      });
    } else {
      md += '✓ No ordering issues detected\n';
    }
    md += '\n';

    md += '## Rename Recommendations\n\n';
    if (results.renames.length > 0) {
      results.renames.forEach(function(rename) {
        md += '- `' + rename.current + '` → `' + rename.suggested + '`\n';
        md += '  - ' + rename.reason + '\n';
      });
    } else {
      md += '(No renames needed)\n';
    }
    md += '\n';

    md += '## Recommendations\n\n';
    results.recommendations.forEach(function(rec, i) {
      md += (i + 1) + '. ' + rec + '\n';
    });
    md += '\n';

    md += '---\n\n';
    md += '## How Google Apps Script Loads Files\n\n';
    md += '1. Files are loaded in **alphabetical order**\n';
    md += '2. Numeric prefixes ensure early loading: `00_` → `01_` → `02_` → ...\n';
    md += '3. Files without prefixes load after all prefixed files, alphabetically\n';
    md += '4. If File A depends on File B, then File B must load BEFORE File A\n\n';

    md += '## Best Practices\n\n';
    md += '- Use `00_` prefix for critical infrastructure (logging, monitoring)\n';
    md += '- Use `01_` prefix for important utilities (config, error handling)\n';
    md += '- Use `02_` prefix for common libraries\n';
    md += '- Files with many dependents should load early\n';
    md += '- Avoid circular dependencies (A depends on B, B depends on A)\n\n';

    console.log('\n=== ' + filename + '.md ===');
    console.log(md);
    console.log('\n✓ Copy the above Markdown and save to ' + filename + '.md');
  } catch (error) {
    console.error('Error exporting to Markdown:', error);
  }
}

// Export globally
globalThis.analyzeLoadingOrder = analyzeLoadingOrder;

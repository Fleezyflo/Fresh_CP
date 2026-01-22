/**
 * Duplicate SKU Detection Module
 * ENH-001: Detects and reports duplicate resource codes (SKUs) at seed time
 * @fileoverview Prevents duplicate SKUs from being seeded into Config: Resource Catalog
 */

/**
 * Detect duplicate SKUs in resource data
 * @param {Array<Array>} resourceRows - Array of resource rows (excluding headers)
 * @param {Object} options - Detection options
 * @return {{hasDuplicates:boolean, duplicates:Array, summary:Object, cleanedRows:Array}}
 */
function detectDuplicateSKUs(resourceRows, options) {
  options = options || {};
  const caseSensitive = options.caseSensitive !== undefined ? options.caseSensitive : false;
  const autoRemove = options.autoRemove !== undefined ? options.autoRemove : false;
  const keepFirst = options.keepFirst !== undefined ? options.keepFirst : true;

  if (!Array.isArray(resourceRows) || resourceRows.length === 0) {
    return {
      hasDuplicates: false,
      duplicates: [],
      summary: { total: 0, unique: 0, duplicateCount: 0 },
      cleanedRows: []
    };
  }

  const seenCodes = {};
  const duplicates = [];
  const cleanedRows = [];
  let duplicateCount = 0;

  resourceRows.forEach(function(row, index) {
    if (!row || !Array.isArray(row)) {
      return;
    }

    const code = row[0] || '';  // Code is column A (index 0)
    if (!code) {
      // Empty code - skip but don't count as duplicate
      if (autoRemove) {
        return;  // Skip empty rows when cleaning
      }
      cleanedRows.push(row);
      return;
    }

    const normalizedCode = caseSensitive ? code.toString().trim() : code.toString().trim().toUpperCase();

    if (seenCodes.hasOwnProperty(normalizedCode)) {
      // Duplicate found
      duplicateCount++;

      const firstOccurrence = seenCodes[normalizedCode];
      duplicates.push({
        code: code,
        normalizedCode: normalizedCode,
        rowIndex: index + 2,  // +2 for header row and 0-index
        firstOccurrenceRow: firstOccurrence.rowIndex,
        name: row[1] || '',
        rate: row[3] || '',
        category: row[4] || ''
      });

      if (!autoRemove || !keepFirst) {
        cleanedRows.push(row);  // Keep duplicates if not auto-removing
      }
      // else: Skip this row (auto-remove duplicate, keep first)
    } else {
      // First occurrence
      seenCodes[normalizedCode] = {
        code: code,
        rowIndex: index + 2,
        row: row
      };

      cleanedRows.push(row);
    }
  });

  return {
    hasDuplicates: duplicates.length > 0,
    duplicates: duplicates,
    summary: {
      total: resourceRows.length,
      unique: Object.keys(seenCodes).length,
      duplicateCount: duplicateCount,
      removedCount: autoRemove ? duplicateCount : 0
    },
    cleanedRows: cleanedRows
  };
}

/**
 * Format duplicate SKU report for logging/display
 * @param {Object} detectionResult - Result from detectDuplicateSKUs()
 * @return {string}
 */
function formatDuplicateSKUReport(detectionResult) {
  if (!detectionResult || !detectionResult.hasDuplicates) {
    return 'No duplicate SKUs detected.';
  }

  const lines = [];
  lines.push('========================================');
  lines.push('DUPLICATE SKU DETECTION REPORT');
  lines.push('========================================');
  lines.push('Total rows: ' + detectionResult.summary.total);
  lines.push('Unique SKUs: ' + detectionResult.summary.unique);
  lines.push('Duplicate entries: ' + detectionResult.summary.duplicateCount);

  if (detectionResult.summary.removedCount > 0) {
    lines.push('Removed: ' + detectionResult.summary.removedCount + ' duplicates');
  }

  lines.push('');
  lines.push('Duplicate SKU Details:');
  lines.push('----------------------------------------');

  detectionResult.duplicates.forEach(function(dup, idx) {
    lines.push((idx + 1) + '. SKU "' + dup.code + '"');
    lines.push('   First occurrence: Row ' + dup.firstOccurrenceRow);
    lines.push('   Duplicate at: Row ' + dup.rowIndex);
    lines.push('   Name: ' + dup.name);
    lines.push('   Rate: ' + dup.rate);
    lines.push('   Category: ' + dup.category);
    lines.push('');
  });

  lines.push('========================================');

  return lines.join('\n');
}

/**
 * Create ConfigLoadResult-style error for duplicate SKUs
 * @param {Object} detectionResult - Result from detectDuplicateSKUs()
 * @return {Object} ConfigLoadResult error object
 */
function createDuplicateSKUError(detectionResult) {
  if (!detectionResult || !detectionResult.hasDuplicates) {
    return null;
  }

  const duplicateCodes = detectionResult.duplicates.map(function(dup) {
    return dup.code;
  }).join(', ');

  const error = {
    code: 'DUPLICATE_SKUS',
    message: 'Duplicate resource codes detected: ' + duplicateCodes.substring(0, 200) + (duplicateCodes.length > 200 ? '...' : ''),
    severity: 'HIGH',
    recoverable: true,
    context: {
      duplicateCount: detectionResult.summary.duplicateCount,
      totalRows: detectionResult.summary.total,
      uniqueCount: detectionResult.summary.unique,
      duplicates: detectionResult.duplicates.map(function(dup) {
        return {
          code: dup.code,
          rowIndex: dup.rowIndex,
          firstOccurrence: dup.firstOccurrenceRow
        };
      })
    }
  };

  return error;
}

/**
 * Log duplicate SKU detection result
 * @param {Object} detectionResult - Result from detectDuplicateSKUs()
 * @param {string} source - Source of detection (e.g., 'ConfigSeeder', 'ResourceCatalog')
 */
function logDuplicateSKUDetection(detectionResult, source) {
  source = source || 'DuplicateSKUDetector';

  if (!detectionResult) {
    return;
  }

  if (!detectionResult.hasDuplicates) {
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.info(source, 'No duplicate SKUs detected', {
          total: detectionResult.summary.total,
          unique: detectionResult.summary.unique
        });
      }
    } catch (ignore) {
      console.error('[DuplicateSKUDetector] Error:', ignore.message, ignore.stack);
    }
    return;
  }

  // Log warning
  try {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.warn(source, 'Duplicate SKUs detected', {
        duplicateCount: detectionResult.summary.duplicateCount,
        total: detectionResult.summary.total,
        unique: detectionResult.summary.unique,
        removedCount: detectionResult.summary.removedCount,
        duplicates: detectionResult.duplicates.slice(0, 10)  // Log first 10
      });
    }
  } catch (ignore) {
      console.error('[DuplicateSKUDetector] Error:', ignore.message, ignore.stack);
    }

  // Display toast notification
  try {
    if (typeof logToast_ === 'function') {
      const message = 'Duplicate SKUs detected: ' + detectionResult.summary.duplicateCount + ' duplicate(s) found';
      logToast_('SKU Validation', message, 8, 'WARN', {
        source: source,
        duplicateCount: detectionResult.summary.duplicateCount
      });
    }
  } catch (ignore) {
      console.error('[DuplicateSKUDetector] Error:', ignore.message, ignore.stack);
    }

  // Log full report to Logger
  try {
    Logger.log(formatDuplicateSKUReport(detectionResult));
  } catch (ignore) {
      console.error('[DuplicateSKUDetector] Error:', ignore.message, ignore.stack);
    }
}

/**
 * Validate resource catalog for duplicates at seed time
 * Integrates with ConfigSeeder seedResourceCatalog_() function
 * @param {Array<Array>} resourceCsv - Resource CSV data including headers
 * @param {Object} options - Validation options
 * @return {{valid:boolean, error:Object, cleanedCsv:Array, report:string}}
 */
function validateResourceCatalogSKUs(resourceCsv, options) {
  options = options || {};
  const autoRemoveDuplicates = options.autoRemoveDuplicates !== undefined ? options.autoRemoveDuplicates : false;
  const failOnDuplicate = options.failOnDuplicate !== undefined ? options.failOnDuplicate : false;

  if (!resourceCsv || resourceCsv.length < 2) {
    return {
      valid: true,
      error: null,
      cleanedCsv: resourceCsv || [],
      report: 'No data to validate'
    };
  }

  const headers = resourceCsv[0];
  const dataRows = resourceCsv.slice(1);

  const detectionResult = detectDuplicateSKUs(dataRows, {
    caseSensitive: false,
    autoRemove: autoRemoveDuplicates,
    keepFirst: true
  });

  logDuplicateSKUDetection(detectionResult, 'ConfigSeeder');

  const report = formatDuplicateSKUReport(detectionResult);

  if (!detectionResult.hasDuplicates) {
    return {
      valid: true,
      error: null,
      cleanedCsv: resourceCsv,
      report: report
    };
  }

  // Duplicates found
  const error = createDuplicateSKUError(detectionResult);

  const cleanedCsv = [headers].concat(detectionResult.cleanedRows);

  return {
    valid: !failOnDuplicate,  // Valid if not failing on duplicates
    error: error,
    cleanedCsv: autoRemoveDuplicates ? cleanedCsv : resourceCsv,
    report: report,
    detectionResult: detectionResult
  };
}

/**
 * Get duplicate SKU detection configuration from script properties
 * @return {Object} Configuration object
 */
function getDuplicateSKUDetectionConfig() {
  const config = {
    enabled: true,  // Default: enabled
    autoRemoveDuplicates: false,  // Default: keep duplicates, just warn
    failOnDuplicate: false,  // Default: warn but continue
    caseSensitive: false  // Default: case-insensitive
  };

  try {
    if (typeof getScriptProperty === 'function') {
      const enabled = getScriptProperty('DUPLICATE_SKU_DETECTION_ENABLED');
      if (enabled !== null && enabled !== undefined) {
        config.enabled = String(enabled).toLowerCase() !== 'false';
      }

      const autoRemove = getScriptProperty('DUPLICATE_SKU_AUTO_REMOVE');
      if (autoRemove !== null && autoRemove !== undefined) {
        config.autoRemoveDuplicates = String(autoRemove).toLowerCase() === 'true';
      }

      const failOn = getScriptProperty('DUPLICATE_SKU_FAIL_ON_DUPLICATE');
      if (failOn !== null && failOn !== undefined) {
        config.failOnDuplicate = String(failOn).toLowerCase() === 'true';
      }

      const caseSensitive = getScriptProperty('DUPLICATE_SKU_CASE_SENSITIVE');
      if (caseSensitive !== null && caseSensitive !== undefined) {
        config.caseSensitive = String(caseSensitive).toLowerCase() === 'true';
      }
    }
  } catch (ignore) {
      console.error('[DuplicateSKUDetector] Error:', ignore.message, ignore.stack);
    }

  return config;
}

/**
 * Export duplicate SKU report to a new sheet
 * @param {Object} detectionResult - Result from detectDuplicateSKUs()
 * @param {Spreadsheet} ss - Spreadsheet to export to
 * @return {string} Name of created sheet
 */
function exportDuplicateSKUReport(detectionResult, ss) {
  if (!detectionResult || !detectionResult.hasDuplicates) {
    return null;
  }

  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  if (!ss) {
    return null;
  }

  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const sheetName = 'Duplicate SKUs ' + timestamp;

  const sheet = ss.insertSheet(sheetName);

  // Write headers
  const headers = ['SKU Code', 'First Occurrence Row', 'Duplicate Row', 'Name', 'Rate', 'Category'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#ff9999');

  // Write duplicate data
  const rows = detectionResult.duplicates.map(function(dup) {
    return [
      dup.code,
      dup.firstOccurrenceRow,
      dup.rowIndex,
      dup.name,
      dup.rate,
      dup.category
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  // Add summary at bottom
  const summaryRow = rows.length + 3;
  sheet.getRange(summaryRow, 1).setValue('SUMMARY');
  sheet.getRange(summaryRow, 1).setFontWeight('bold');
  sheet.getRange(summaryRow + 1, 1).setValue('Total rows:');
  sheet.getRange(summaryRow + 1, 2).setValue(detectionResult.summary.total);
  sheet.getRange(summaryRow + 2, 1).setValue('Unique SKUs:');
  sheet.getRange(summaryRow + 2, 2).setValue(detectionResult.summary.unique);
  sheet.getRange(summaryRow + 3, 1).setValue('Duplicate entries:');
  sheet.getRange(summaryRow + 3, 2).setValue(detectionResult.summary.duplicateCount);

  // Auto-resize columns
  sheet.autoResizeColumns(1, headers.length);

  try {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.info('DuplicateSKUDetector', 'Exported duplicate SKU report', {
        sheetName: sheetName,
        duplicateCount: detectionResult.summary.duplicateCount
      });
    }
  } catch (ignore) {
      console.error('[DuplicateSKUDetector] Error:', ignore.message, ignore.stack);
    }

  return sheetName;
}

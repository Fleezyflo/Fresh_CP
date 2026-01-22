/**
 * Sheet Structure Audit - Diagnostic Tool
 *
 * Purpose: Generate complete snapshot of spreadsheet structure for documentation/analysis
 *
 * Usage:
 * 1. Run auditAllSheets() from Apps Script editor
 * 2. Copy the logged JSON output
 * 3. Provide to Claude for analysis
 */

/**
 * Audit all sheets in the spreadsheet and output structured data
 * @return {Object} Complete sheet structure information
 */
function auditAllSheets() {
  const trace = UnifiedLogger.startTrace('SheetAudit', 'auditAllSheets');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();

    const audit = {
      spreadsheetName: ss.getName(),
      spreadsheetId: ss.getId(),
      totalSheets: sheets.length,
      auditTimestamp: new Date().toISOString(),
      sheets: []
    };

    sheets.forEach(function(sheet) {
      const sheetInfo = auditSingleSheet(sheet);
      audit.sheets.push(sheetInfo);
    });

    // Log the complete audit as JSON
    const jsonOutput = JSON.stringify(audit, null, 2);
    console.log('=== SHEET STRUCTURE AUDIT ===');
    console.log(jsonOutput);
    console.log('=== END AUDIT ===');

    // Also create a summary
    const summary = createAuditSummary(audit);
    console.log('\n=== SUMMARY ===');
    console.log(summary);

    trace.complete('auditAllSheets completed', { sheetCount: sheets.length });
    return audit;

  } catch (error) {
    trace.fail('auditAllSheets failed', error);
    console.error('Audit failed: ' + error.message);
    throw error;
  }
}

/**
 * Audit a single sheet's structure
 * @param {Sheet} sheet
 * @return {Object} Sheet information
 */
function auditSingleSheet(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();

    const sheetInfo = {
      name: sheet.getName(),
      index: sheet.getIndex(),
      isHidden: sheet.isSheetHidden(),
      rowCount: sheet.getMaxRows(),
      columnCount: sheet.getMaxColumns(),
      lastRow: lastRow,
      lastColumn: lastColumn,
      hasData: lastRow > 0,
      headers: [],
      sampleData: [],
      potentialPurpose: null
    };

    // Get headers (row 1)
    if (lastRow > 0 && lastColumn > 0) {
      const headerRange = sheet.getRange(1, 1, 1, lastColumn);
      const headers = headerRange.getValues()[0];
      sheetInfo.headers = headers.map(function(h) {
        return h ? String(h).trim() : '';
      });

      // Get sample data (rows 2-6, max 5 rows)
      const sampleRowCount = Math.min(5, lastRow - 1);
      if (sampleRowCount > 0) {
        const sampleRange = sheet.getRange(2, 1, sampleRowCount, lastColumn);
        const sampleValues = sampleRange.getValues();

        sheetInfo.sampleData = sampleValues.map(function(row, idx) {
          const rowObj = { rowNumber: idx + 2 };
          row.forEach(function(cell, colIdx) {
            const header = sheetInfo.headers[colIdx] || 'Column' + (colIdx + 1);
            rowObj[header] = cell;
          });
          return rowObj;
        });
      }

      // Infer purpose from sheet name and headers
      sheetInfo.potentialPurpose = inferSheetPurpose(sheetInfo);
    }

    return sheetInfo;

  } catch (error) {
    console.error('Error auditing sheet ' + sheet.getName() + ': ' + error.message);
    return {
      name: sheet.getName(),
      error: error.message
    };
  }
}

/**
 * Infer sheet purpose from name and headers
 * @param {Object} sheetInfo
 * @return {string} Inferred purpose
 */
function inferSheetPurpose(sheetInfo) {
  const name = sheetInfo.name.toLowerCase();
  const headers = sheetInfo.headers.map(function(h) {
    return String(h).toLowerCase();
  });

  // Check for common patterns
  if (name.indexOf('config') !== -1 || name.indexOf('setup') !== -1) {
    return 'CONFIGURATION';
  }

  if (name.indexOf('xero') !== -1) {
    if (name.indexOf('ready') !== -1) {
      return 'XERO_OUTPUT';
    }
    return 'XERO_RELATED';
  }

  if (name.indexOf('scope') !== -1 && name.indexOf('buildup') !== -1) {
    return 'SCOPE_SOURCE';
  }

  if (name.indexOf('resource') !== -1 || name.indexOf('rate') !== -1) {
    return 'RESOURCE_SOURCE';
  }

  if (name.indexOf('crew') !== -1) {
    return 'CREW_SOURCE';
  }

  if (name.indexOf('tool') !== -1 || name.indexOf('license') !== -1) {
    return 'TOOL_SOURCE';
  }

  if (name.indexOf('catalog') !== -1) {
    if (headers.indexOf('code') !== -1 && headers.indexOf('rate') !== -1) {
      return 'CATALOG_SOURCE';
    }
    return 'CATALOG';
  }

  if (name.indexOf('proposal') !== -1) {
    return 'PROPOSAL_OUTPUT';
  }

  if (name.indexOf('_') === 0 || name.indexOf('lookup') !== -1) {
    return 'HIDDEN_LOOKUP';
  }

  if (name.indexOf('log') !== -1 || name.indexOf('report') !== -1) {
    return 'LOG_OR_REPORT';
  }

  return 'UNKNOWN';
}

/**
 * Create human-readable summary
 * @param {Object} audit
 * @return {string} Summary text
 */
function createAuditSummary(audit) {
  const lines = [];

  lines.push('Spreadsheet: ' + audit.spreadsheetName);
  lines.push('Total Sheets: ' + audit.totalSheets);
  lines.push('Audit Date: ' + audit.auditTimestamp);
  lines.push('');
  lines.push('Sheet Breakdown by Purpose:');
  lines.push('');

  // Group by purpose
  const byPurpose = {};
  audit.sheets.forEach(function(sheet) {
    const purpose = sheet.potentialPurpose || 'UNKNOWN';
    if (!byPurpose[purpose]) {
      byPurpose[purpose] = [];
    }
    byPurpose[purpose].push(sheet);
  });

  // Sort purposes
  const purposes = Object.keys(byPurpose).sort();

  purposes.forEach(function(purpose) {
    lines.push('## ' + purpose);
    byPurpose[purpose].forEach(function(sheet) {
      const dataStatus = sheet.hasData
        ? (sheet.lastRow + ' rows, ' + sheet.lastColumn + ' cols')
        : 'empty';
      const hidden = sheet.isHidden ? ' [HIDDEN]' : '';
      lines.push('  - ' + sheet.name + hidden + ' (' + dataStatus + ')');

      if (sheet.headers && sheet.headers.length > 0) {
        const headerPreview = sheet.headers.slice(0, 8).join(', ');
        const more = sheet.headers.length > 8 ? '...' : '';
        lines.push('    Headers: ' + headerPreview + more);
      }
    });
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Quick check for which sheets feed into normalization
 * @return {Object} Current source sheet names
 */
function identifyNormalizationSources() {
  const trace = UnifiedLogger.startTrace('SheetAudit', 'identifyNormalizationSources');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();

    const sources = {
      scopeSheets: [],
      resourceSheets: [],
      crewSheets: [],
      toolSheets: [],
      configSheets: [],
      xeroOutputSheets: [],
      otherSheets: []
    };

    sheets.forEach(function(sheet) {
      const name = sheet.getName();
      const nameLower = name.toLowerCase();

      if (name.indexOf('_') === 0) {
        return; // Skip hidden sheets
      }

      if (nameLower.indexOf('scope') !== -1 && nameLower.indexOf('buildup') !== -1) {
        sources.scopeSheets.push(name);
      } else if (nameLower.indexOf('config') !== -1 && nameLower.indexOf('resource') !== -1) {
        sources.resourceSheets.push(name);
      } else if (nameLower.indexOf('resource') !== -1 && nameLower.indexOf('rate') !== -1) {
        sources.resourceSheets.push(name);
      } else if (nameLower.indexOf('crew') !== -1) {
        sources.crewSheets.push(name);
      } else if (nameLower.indexOf('tool') !== -1 || nameLower.indexOf('license') !== -1) {
        sources.toolSheets.push(name);
      } else if (nameLower.indexOf('config') !== -1) {
        sources.configSheets.push(name);
      } else if (nameLower.indexOf('xero') !== -1 && nameLower.indexOf('ready') !== -1) {
        sources.xeroOutputSheets.push(name);
      } else {
        sources.otherSheets.push(name);
      }
    });

    console.log('=== NORMALIZATION SOURCE IDENTIFICATION ===');
    console.log(JSON.stringify(sources, null, 2));

    trace.complete('identifyNormalizationSources completed', sources);
    return sources;

  } catch (error) {
    trace.fail('identifyNormalizationSources failed', error);
    throw error;
  }
}

/**
 * Get NORMALIZE_CONFIG from NormalizeData.js
 * @return {Object} Current configuration
 */
function getCurrentNormalizeConfig() {
  try {
    // Try to read NORMALIZE_CONFIG if it exists
    if (typeof NORMALIZE_CONFIG !== 'undefined') {
      console.log('=== CURRENT NORMALIZE_CONFIG ===');
      console.log(JSON.stringify(NORMALIZE_CONFIG, null, 2));
      return NORMALIZE_CONFIG;
    } else {
      console.log('NORMALIZE_CONFIG not found in global scope');
      return null;
    }
  } catch (error) {
    console.error('Error reading NORMALIZE_CONFIG: ' + error.message);
    return null;
  }
}

/**
 * Master diagnostic - Run everything
 * @return {Object} Complete diagnostic results
 */
function runCompleteDiagnostic() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         FRESH CP - COMPLETE SHEET STRUCTURE DIAGNOSTIC        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const results = {
    timestamp: new Date().toISOString(),
    sheetAudit: null,
    normalizationSources: null,
    normalizeConfig: null
  };

  try {
    console.log('→ Running full sheet audit...\n');
    results.sheetAudit = auditAllSheets();

    console.log('\n→ Identifying normalization sources...\n');
    results.normalizationSources = identifyNormalizationSources();

    console.log('\n→ Reading current NORMALIZE_CONFIG...\n');
    results.normalizeConfig = getCurrentNormalizeConfig();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    DIAGNOSTIC COMPLETE                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('NEXT STEPS:');
    console.log('1. Copy the JSON output above');
    console.log('2. Provide to Claude for analysis');
    console.log('3. Claude will update normalization code to match current sheets');

    return results;

  } catch (error) {
    console.error('Diagnostic failed: ' + error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Scope Buildup Sheet Manager
 * Applies dropdown validation and protective formulas for the Scope Buildups tab.
 */

const SCOPE_LOOKUP_SHEET_NAME = '_SCOPE_LOOKUPS';
const SCOPE_LOOKUP_HEADER = 'ResourceCode';

function getRelativeOffset_(targetKey, baseKey) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'getRelativeOffset_');
  try {
    if (!NORMALIZE_CONFIG || !NORMALIZE_CONFIG.SCOPE_COLUMNS) {
      throw new AppError('CONFIG_MISSING', 'Scope columns not configured');
    }
    const result = NORMALIZE_CONFIG.SCOPE_COLUMNS[targetKey] - NORMALIZE_CONFIG.SCOPE_COLUMNS[baseKey];
    trace.complete('getRelativeOffset_ completed', { targetKey: targetKey, baseKey: baseKey, offset: result });
    return result;
  } catch (error) {
    trace.fail('getRelativeOffset_ failed', error);
    throw error;
  }
}

/**
 * Ensure Scope Buildups has validation and formulas so only hours need manual input.
 * By default this targets the sandbox copy, not the production sheet.
 * @param {(Sheet|string)} [targetSheet] optional sheet or sheet name to operate on
 * @param {{forceLive?:boolean}=} options optional flags (forceLive allows operating on the live sheet)
 * @return {Object} summary of enforced rows
 */
function ensureScopeBuildupValidationsAndFormulas(targetSheet, options) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'ensureScopeBuildupValidationsAndFormulas');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new AppError('SHEET_ACCESS', 'No active spreadsheet available to configure scope buildups.');
    }

    const sheetName = NORMALIZE_CONFIG && NORMALIZE_CONFIG.SOURCE_TABS ? NORMALIZE_CONFIG.SOURCE_TABS.SCOPES : 'Scope Buildups';
    const sandboxName = sheetName + ' Sandbox';
    let scopeSheet = null;
    if (targetSheet) {
      if (typeof targetSheet === 'string') {
        scopeSheet = ss.getSheetByName(targetSheet);
      } else if (typeof targetSheet.getName === 'function') {
        scopeSheet = targetSheet;
      }
    }

    if (!scopeSheet) {
      scopeSheet = ss.getSheetByName(sandboxName);
    }

    if (!scopeSheet) {
      throw new AppError('SHEET_MISSING', 'Scope Buildups Sandbox sheet not found. Run createScopeBuildupSandbox() first to generate a safe copy.');
    }

    if (!scopeSheet) {
      throw new AppError('SHEET_MISSING', 'Scope Buildups sheet not found while applying validations.');
    }

    const forceLive = options && options.forceLive === true;
    if (!forceLive && scopeSheet.getName() === sheetName && (!targetSheet || targetSheet === sheetName)) {
      throw new AppError('SANDBOX_REQUIRED', 'Refusing to modify the live Scope Buildups sheet. Target a sandbox sheet instead.');
    }

    const lookupResult = buildScopeResourceLookup(ss, scopeSheet);
    applyScopeResourceValidation(scopeSheet, lookupResult.range);
    applyScopeSheetFormulas(scopeSheet);

    const result = {
      sheetName: scopeSheet.getName(),
      rows: Math.max(scopeSheet.getLastRow() - 1, 0),
      validationSize: lookupResult.range ? lookupResult.range.getNumRows() : 0
    };
    trace.complete('ensureScopeBuildupValidationsAndFormulas completed', result);
    return result;
  } catch (error) {
    trace.fail('ensureScopeBuildupValidationsAndFormulas failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Ensuring scope buildup validations and formulas',
      correlationId: trace.correlationId
    });
    showErrorToast('Validation Setup Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Create a sandbox copy of the Scope Buildups sheet for safe formula experimentation.
 * The sandbox is regenerated on each call.
 * @return {Object} summary of the sandbox setup
 */
function createScopeBuildupSandbox() {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'createScopeBuildupSandbox');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new AppError('SHEET_ACCESS', 'No active spreadsheet available to create sandbox.');
    }
    const sheetName = NORMALIZE_CONFIG && NORMALIZE_CONFIG.SOURCE_TABS ? NORMALIZE_CONFIG.SOURCE_TABS.SCOPES : 'Scope Buildups';
    const sourceSheet = ss.getSheetByName(sheetName);
    if (!sourceSheet) {
      throw new AppError('SHEET_MISSING', 'Scope Buildups sheet not found while creating sandbox.');
    }

    const sandboxName = sheetName + ' Sandbox';
    const existing = ss.getSheetByName(sandboxName);
    if (existing) {
      ss.deleteSheet(existing);
    }

    const sandbox = sourceSheet.copyTo(ss);
    sandbox.setName(sandboxName);
    sandbox.activate();

    const result = ensureScopeBuildupValidationsAndFormulas(sandbox);
    const finalResult = Object.assign({ sandbox: sandboxName }, result);
    trace.complete('createScopeBuildupSandbox completed', finalResult);
    return finalResult;
  } catch (error) {
    trace.fail('createScopeBuildupSandbox failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Creating scope buildup sandbox',
      correlationId: trace.correlationId
    });
    showErrorToast('Sandbox Creation Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Build or refresh the hidden lookup sheet that powers Scope Buildups validation.
 * @param {Spreadsheet} ss
 * @return {Range|null} range containing the valid resource codes
 */
function buildScopeResourceLookup(ss, scopeSheet) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'buildScopeResourceLookup');
  try {
    const codes = new Set();
    const lookupMap = new Map();
    const nameIndex = new Map();

    const registerEntry = (code, name, rate) => {
      if (!code) {
        return;
      }
      const cleanedName = name ? String(name).trim() : '';
      const numericRate = rate && !isNaN(rate) ? Number(rate) : 0;
      const existing = lookupMap.get(code);
      const resolvedName = cleanedName || (existing ? existing.name : '');
      const resolvedRate = numericRate || (existing ? existing.rate : 0);
      lookupMap.set(code, { code: code, name: resolvedName, rate: resolvedRate });
      if (resolvedName) {
        registerNameIndex(nameIndex, resolvedName, code);
      }
      codes.add(code);
    };

    try {
      if (typeof loadResourceCatalog === 'function') {
        const catalog = loadResourceCatalog();
        const list = catalog && Array.isArray(catalog.list) ? catalog.list : [];
        list.forEach(function(entry) {
          registerEntry(entry.code, entry.name, typeof entry.rate === 'number' ? entry.rate : parseFloat(entry.rate) || 0);
        });
      }
    } catch (error) {
      try { UnifiedLogger.warn('ScopeSheetManager', 'buildScopeResourceLookup catalog load failed', String(error)); } catch (ignore) {
      console.error('[ScopeSheetManager] Error:', ignore.message, ignore.stack);
    }
    }

    const lookupSheet = getOrCreateScopeLookupSheet(ss);
    const sortedCodes = Array.from(codes).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const requiredRows = Math.max(sortedCodes.length + 1, 2);
    ensureScopeLookupRows(lookupSheet, requiredRows);

    const maxRows = lookupSheet.getMaxRows() - 1;
    if (maxRows > 0) {
      lookupSheet.getRange(2, 1, maxRows, 3).clearContent();
    }

    let validationRange = null;
    if (sortedCodes.length > 0) {
      const rows = sortedCodes.map(code => {
        const entry = lookupMap.get(code) || { name: '', rate: '' };
        return [code, entry.name || '', entry.rate || ''];
      });
      lookupSheet.getRange(2, 1, rows.length, 3).setValues(rows);
      validationRange = lookupSheet.getRange(2, 1, rows.length, 1);
    }

    trace.complete('buildScopeResourceLookup completed', { codeCount: codes.size, sortedCount: sortedCodes.length });
    return {
      range: validationRange,
      map: lookupMap,
      nameIndex: nameIndex
    };
  } catch (error) {
    trace.fail('buildScopeResourceLookup failed', error);
    throw error;
  }
}

/**
 * Apply data validation on resource codes so only cataloged resources can be selected.
 * @param {Sheet} scopeSheet
 * @param {Range|null} validationRange
 */
function applyScopeResourceValidation(scopeSheet, validationRange) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'applyScopeResourceValidation');
  try {
    const startRow = 2;
    const totalRows = Math.max(scopeSheet.getMaxRows() - 1, 1);
    const targetRange = scopeSheet.getRange(startRow, NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE + 1, totalRows, 1);

    if (validationRange) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInRange(validationRange, true)
        .setAllowInvalid(false)
        .build();
      targetRange.setDataValidation(rule);
      trace.complete('applyScopeResourceValidation completed - validation applied', { totalRows: totalRows });
    } else {
      targetRange.clearDataValidations();
      trace.complete('applyScopeResourceValidation completed - validation cleared', { totalRows: totalRows });
    }
  } catch (error) {
    trace.fail('applyScopeResourceValidation failed', error);
    throw error;
  }
}

/**
 * Apply formulas that pull resource names, rates, and totals automatically.
 * @param {Sheet} scopeSheet
 */
function applyScopeSheetFormulas(scopeSheet) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'applyScopeSheetFormulas');
  try {
    const firstDataRow = 2;
    const lastRow = scopeSheet.getLastRow();
    const rowsToFill = lastRow - firstDataRow + 1;
    if (rowsToFill <= 0) {
      trace.complete('applyScopeSheetFormulas completed - no rows to fill', { rowsToFill: 0 });
      return;
    }

    const catalogSheetName = 'Config: Resource Catalog';
    const catalogSheetRef = buildSheetReference(catalogSheetName);
    const lookupSheetRef = buildSheetReference(SCOPE_LOOKUP_SHEET_NAME);
    const scopeCodeColumn = NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE + 1;
    const resourceCodeColumn = NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE + 1;
    const lineCostColumn = NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST + 1;

    const resourceNameRange = scopeSheet.getRange(firstDataRow, NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME + 1, rowsToFill, 1);
    resourceNameRange.setFormulaR1C1(
      '=IF(RC[' + getRelativeOffset_('RESOURCE_CODE', 'RESOURCE_NAME') + ']="", "", IFERROR(VLOOKUP(RC[' + getRelativeOffset_('RESOURCE_CODE', 'RESOURCE_NAME') + '], ' + lookupSheetRef + '!C1:C3, 2, FALSE), IFERROR(VLOOKUP(RC[' + getRelativeOffset_('RESOURCE_CODE', 'RESOURCE_NAME') + '], ' + catalogSheetRef + '!C1:C2, 2, FALSE), "")))'
    );

    const rateRange = scopeSheet.getRange(firstDataRow, NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE + 1, rowsToFill, 1);
    rateRange.setFormulaR1C1(
      '=IF(RC[' + getRelativeOffset_('RESOURCE_CODE', 'HOUR_RATE') + ']="", "", IFERROR(VLOOKUP(RC[' + getRelativeOffset_('RESOURCE_CODE', 'HOUR_RATE') + '], ' + lookupSheetRef + '!C1:C3, 3, FALSE), IFERROR(VLOOKUP(RC[' + getRelativeOffset_('RESOURCE_CODE', 'HOUR_RATE') + '], ' + catalogSheetRef + '!C1:C4, 4, FALSE), "")))'
    );
    rateRange.setNumberFormat('#,##0.00');

    const lineCostRangeRef = 'R' + firstDataRow + 'C' + lineCostColumn + ':R' + lastRow + 'C' + lineCostColumn;
    const scopeCodeRangeRef = 'R' + firstDataRow + 'C' + scopeCodeColumn + ':R' + lastRow + 'C' + scopeCodeColumn;
    const resourceCodeRangeRef = 'R' + firstDataRow + 'C' + resourceCodeColumn + ':R' + lastRow + 'C' + resourceCodeColumn;
    const lineCostRange = scopeSheet.getRange(firstDataRow, NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST + 1, rowsToFill, 1);
    lineCostRange.setFormulaR1C1(
      '=IF(RC[' + getRelativeOffset_('HOURS', 'LINE_COST') + ']<>"", ROUND(N(RC[' + getRelativeOffset_('HOURS', 'LINE_COST') + ']) * N(RC[' + getRelativeOffset_('HOUR_RATE', 'LINE_COST') + ']), 2), IF(RC[' + getRelativeOffset_('CODE', 'LINE_COST') + ']<>"", SUMIFS(' + lineCostRangeRef + ', ' + scopeCodeRangeRef + ', RC[' + getRelativeOffset_('CODE', 'LINE_COST') + '], ' + resourceCodeRangeRef + ', "<>"), ""))'
    );
    lineCostRange.setNumberFormat('#,##0.00');

    trace.complete('applyScopeSheetFormulas completed', { rowsToFill: rowsToFill, lastRow: lastRow });
  } catch (error) {
    trace.fail('applyScopeSheetFormulas failed', error);
    throw error;
  }
}

/**
 * Ensure the lookup sheet exists and stays hidden.
 * @param {Spreadsheet} ss
 * @return {Sheet}
 */
function getOrCreateScopeLookupSheet(ss) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'getOrCreateScopeLookupSheet');
  try {
    let lookupSheet = ss.getSheetByName(SCOPE_LOOKUP_SHEET_NAME);
    let created = false;
    if (!lookupSheet) {
      lookupSheet = ss.insertSheet(SCOPE_LOOKUP_SHEET_NAME);
      lookupSheet.hideSheet();
      created = true;
    } else if (!lookupSheet.isSheetHidden()) {
      lookupSheet.hideSheet();
    }

    lookupSheet.getRange(1, 1, 1, 3).setValues([[SCOPE_LOOKUP_HEADER, 'ResourceName', 'ResourceRate']]);
    trace.complete('getOrCreateScopeLookupSheet completed', { sheetName: SCOPE_LOOKUP_SHEET_NAME, created: created });
    return lookupSheet;
  } catch (error) {
    trace.fail('getOrCreateScopeLookupSheet failed', error);
    throw error;
  }
}

/**
 * Ensure the lookup sheet has at least the requested number of rows.
 * @param {Sheet} sheet
 * @param {number} requiredRows
 */
function ensureScopeLookupRows(sheet, requiredRows) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'ensureScopeLookupRows');
  try {
    const current = sheet.getMaxRows();
    if (current < requiredRows) {
      sheet.insertRowsAfter(current, requiredRows - current);
      trace.complete('ensureScopeLookupRows completed - rows added', { current: current, required: requiredRows, added: requiredRows - current });
    } else {
      trace.complete('ensureScopeLookupRows completed - sufficient rows', { current: current, required: requiredRows });
    }
  } catch (error) {
    trace.fail('ensureScopeLookupRows failed', error);
    throw error;
  }
}

function buildSheetReference(name) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'buildSheetReference');
  try {
    const escaped = String(name || '').replace(/'/g, "''");
    const result = '\'' + escaped + '\'';
    trace.complete('buildSheetReference completed', { name: name, result: result });
    return result;
  } catch (error) {
    trace.fail('buildSheetReference failed', error);
    throw error;
  }
}

/**
 * Inspect scope resources for code/name/rate mismatches without modifying data.
 * @param {(Sheet|string)} [targetSheet] optional sheet or sheet name
 * @return {Object} audit summary
 */
function auditScopeBuildupResources(targetSheet) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'auditScopeBuildupResources');
  try {
    const context = resolveScopeSheetForMigration(targetSheet);
    const scopeSheet = context.sheet;
    const lookupInfo = buildScopeResourceLookup(context.ss, scopeSheet);
    const masterMap = lookupInfo.map;
    const nameIndex = lookupInfo.nameIndex;

    const lastRow = scopeSheet.getLastRow();
    const lastColumn = scopeSheet.getLastColumn();
    const rowCount = Math.max(0, lastRow - 1);
    const values = rowCount > 0 ? scopeSheet.getRange(2, 1, rowCount, lastColumn).getValues() : [];
    const issues = {
      sheetName: scopeSheet.getName(),
      totalRows: values.length,
      resourceRows: 0,
      unknownCodes: [],
      nameMismatches: [],
      rateMismatches: []
    };

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const scopeCode = String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE] || '').trim();
      const resourceCodeRaw = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE];
      const resourceCode = normalizeResourceCode(resourceCodeRaw);
      const resourceName = String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME] || '').trim();
      const hourRate = parseFloat(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE]) || 0;
      const note = String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.NOTES] || '').toUpperCase();
      const isTotalRow = (!resourceCode && note.indexOf('TOTAL') !== -1);
      if (!resourceCode || isTotalRow) {
        continue;
      }
      issues.resourceRows++;

      let canonical = masterMap.get(resourceCode);
      if (!canonical && resourceName) {
        const candidateCodes = nameIndex.get(normalizeResourceName(resourceName));
        if (candidateCodes && candidateCodes.length === 1) {
          canonical = masterMap.get(candidateCodes[0]);
        }
      }

      if (!canonical) {
        issues.unknownCodes.push({
          row: i + 2,
          scopeCode: scopeCode,
          resourceCode: resourceCodeRaw,
          resourceName: resourceName
        });
        continue;
      }

      if (canonical.name && resourceName && canonical.name !== resourceName) {
        issues.nameMismatches.push({
          row: i + 2,
          scopeCode: scopeCode,
          resourceCode: canonical.code,
          currentName: resourceName,
          canonicalName: canonical.name
        });
      }

      if (canonical.rate && Math.abs(hourRate - canonical.rate) > 0.001) {
        issues.rateMismatches.push({
          row: i + 2,
          scopeCode: scopeCode,
          resourceCode: canonical.code,
          currentRate: hourRate,
          canonicalRate: canonical.rate
        });
      }
    }

    trace.complete('auditScopeBuildupResources completed', {
      resourceRows: issues.resourceRows,
      unknownCodes: issues.unknownCodes.length,
      nameMismatches: issues.nameMismatches.length,
      rateMismatches: issues.rateMismatches.length
    });
    return issues;
  } catch (error) {
    trace.fail('auditScopeBuildupResources failed', error);
    throw error;
  }
}

/**
 * Normalize scope resource codes/names/rates to the master mapping.
 * @param {(Sheet|string)} [targetSheet] optional sheet or sheet name
 * @return {Object} summary of applied changes
 */
function normalizeScopeResourceCodes(targetSheet) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'normalizeScopeResourceCodes');
  try {
    const context = resolveScopeSheetForMigration(targetSheet);
    const scopeSheet = context.sheet;
    const lookupInfo = buildScopeResourceLookup(context.ss, scopeSheet);
    const masterMap = lookupInfo.map;
    const nameIndex = lookupInfo.nameIndex;

  const firstDataRow = 2;
  const lastRow = scopeSheet.getLastRow();
  if (lastRow < firstDataRow) {
    return {
      sheetName: scopeSheet.getName(),
      resourceRows: 0,
      updatedRows: 0,
      unknownCodes: []
    };
  }

  const lastColumn = scopeSheet.getLastColumn();
  const values = scopeSheet.getRange(firstDataRow, 1, rowCount, lastColumn).getValues();
  const codeRange = scopeSheet.getRange(firstDataRow, NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE + 1, rowCount, 1);
  const nameRange = scopeSheet.getRange(firstDataRow, NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME + 1, rowCount, 1);
  const rateRange = scopeSheet.getRange(firstDataRow, NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE + 1, rowCount, 1);
  const lineRange = scopeSheet.getRange(firstDataRow, NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST + 1, rowCount, 1);

  const codeValues = codeRange.getValues();
  const nameValues = nameRange.getValues();
  const rateValues = rateRange.getValues();
  const lineValues = lineRange.getValues();

  const scopeTotals = new Map();
  const totalRows = new Map();
  const unknown = [];
  let updatedRows = 0;

  for (let i = 0; i < rowCount; i++) {
    const row = values[i + 1];
    const scopeCode = String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE] || '').trim();
    const resourceCodeRaw = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE];
    const resourceName = String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME] || '').trim();
    const hourRateCurrent = parseFloat(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE]) || 0;
    const hours = parseFloat(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOURS]) || 0;
    const note = String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.NOTES] || '').toUpperCase();
    const isTotalRow = (!normalizeResourceCode(resourceCodeRaw) && note.indexOf('TOTAL') !== -1);

    if (isTotalRow) {
      totalRows.set(scopeCode, i);
      continue;
    }

    const normalizedExistingCode = normalizeResourceCode(resourceCodeRaw);
    if (!normalizedExistingCode) {
      continue;
    }

    let canonical = masterMap.get(normalizedExistingCode);
    let canonicalCode = normalizedExistingCode;
    if (!canonical && resourceName) {
      const candidateCodes = nameIndex.get(normalizeResourceName(resourceName));
      if (candidateCodes && candidateCodes.length === 1) {
        canonical = masterMap.get(candidateCodes[0]);
        canonicalCode = candidateCodes[0];
      }
    }

    if (!canonical) {
      unknown.push({
        row: i + firstDataRow,
        scopeCode: scopeCode,
        resourceCode: resourceCodeRaw,
        resourceName: resourceName
      });
      continue;
    }

    let rowUpdated = false;

    if (canonicalCode && canonicalCode !== resourceCodeRaw) {
      codeValues[i][0] = canonicalCode;
      rowUpdated = true;
    }

    if (canonical.name && canonical.name !== resourceName) {
      nameValues[i][0] = canonical.name;
      rowUpdated = true;
    }

    let rateToApply = hourRateCurrent;
    if (canonical.rate && Math.abs(hourRateCurrent - canonical.rate) > 0.001) {
      rateValues[i][0] = canonical.rate;
      rateToApply = canonical.rate;
      rowUpdated = true;
    }

    if (rateToApply && hours) {
      const recalculated = Math.round(hours * rateToApply * 100) / 100;
      lineValues[i][0] = recalculated;
      const currentTotal = scopeTotals.get(scopeCode) || 0;
      scopeTotals.set(scopeCode, currentTotal + recalculated);
      rowUpdated = true;
    }

    if (rowUpdated) {
      updatedRows++;
    }
  }

  totalRows.forEach((rowIndex, scopeCode) => {
    const total = scopeTotals.get(scopeCode);
    if (total !== undefined) {
      lineValues[rowIndex][0] = Math.round(total * 100) / 100;
    }
  });

    codeRange.setValues(codeValues);
    nameRange.setValues(nameValues);
    rateRange.setValues(rateValues);
    lineRange.setValues(lineValues);
    applyScopeResourceValidation(scopeSheet, lookupInfo.range);
    applyScopeSheetFormulas(scopeSheet);

    const result = {
      sheetName: scopeSheet.getName(),
      resourceRows: rowCount,
      updatedRows: updatedRows,
      unknownCodes: unknown
    };
    trace.complete('normalizeScopeResourceCodes completed', result);
    return result;
  } catch (error) {
    trace.fail('normalizeScopeResourceCodes failed', error);
    throw error;
  }
}

function resolveScopeSheetForMigration(targetSheet) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'resolveScopeSheetForMigration');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new AppError('SHEET_ACCESS', 'No active spreadsheet available.');
    }
    const sheetName = NORMALIZE_CONFIG && NORMALIZE_CONFIG.SOURCE_TABS ? NORMALIZE_CONFIG.SOURCE_TABS.SCOPES : 'Scope Buildups';
    const sandboxName = sheetName + ' Sandbox';

    let scopeSheet = null;
    if (targetSheet) {
      if (typeof targetSheet === 'string') {
        scopeSheet = ss.getSheetByName(targetSheet);
      } else if (typeof targetSheet.getName === 'function') {
        scopeSheet = targetSheet;
      }
    }

    if (!scopeSheet) {
      scopeSheet = ss.getSheetByName(sandboxName);
    }

    if (!scopeSheet) {
      throw new AppError('SHEET_MISSING', 'Scope Buildups Sandbox sheet not found. Run createScopeBuildupSandbox() to generate it.');
    }

    const result = {
      ss: ss,
      sheet: scopeSheet
    };
    trace.complete('resolveScopeSheetForMigration completed', { sheetName: scopeSheet.getName() });
    return result;
  } catch (error) {
    trace.fail('resolveScopeSheetForMigration failed', error);
    throw error;
  }
}

function normalizeResourceCode(value) {
  return normalizeString(value, { trim: true }).toUpperCase();
}

function normalizeResourceName(value) {
  return normalizeString(value, { trim: true, collapseWhitespace: true }).toUpperCase();
}

function registerNameIndex(nameIndex, name, code) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'registerNameIndex');
  try {
    const key = normalizeResourceName(name);
    if (!key || !code) {
      trace.complete('registerNameIndex completed - skipped', { key: key, code: code });
      return;
    }
    if (!nameIndex.has(key)) {
      nameIndex.set(key, [code]);
      trace.complete('registerNameIndex completed - new entry', { key: key, code: code });
    } else {
      const arr = nameIndex.get(key);
      if (arr.indexOf(code) === -1) {
        arr.push(code);
        trace.complete('registerNameIndex completed - appended', { key: key, code: code, total: arr.length });
      } else {
        trace.complete('registerNameIndex completed - already exists', { key: key, code: code });
      }
    }
  } catch (error) {
    trace.fail('registerNameIndex failed', error);
    throw error;
  }
}

/**
 * Promote the sandbox sheet to become the live Scope Buildups sheet.
 * @param {(boolean|Object)} confirm pass true or {confirm:true} to acknowledge the replace action
 * @return {Object} summary including backup sheet name
 */
function promoteScopeBuildupSandbox(confirm) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'promoteScopeBuildupSandbox');
  try {
    const confirmed = typeof confirm === 'object' ? !!(confirm && confirm.confirm) : !!confirm;
    if (!confirmed) {
      throw new AppError('PROMOTE_CONFIRM', 'Promotion aborted. Call promoteScopeBuildupSandbox(true) to confirm replacing the live Scope Buildups sheet.');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new AppError('SHEET_ACCESS', 'No active spreadsheet available.');
    }

    const sheetName = NORMALIZE_CONFIG && NORMALIZE_CONFIG.SOURCE_TABS ? NORMALIZE_CONFIG.SOURCE_TABS.SCOPES : 'Scope Buildups';
    const sandboxName = sheetName + ' Sandbox';

    const sandboxSheet = ss.getSheetByName(sandboxName);
    if (!sandboxSheet) {
      throw new AppError('SANDBOX_MISSING', 'Scope Buildups Sandbox not found. Run createScopeBuildupSandbox() first.');
    }

    const liveSheet = ss.getSheetByName(sheetName);
    const targetIndex = liveSheet ? liveSheet.getIndex() : sandboxSheet.getIndex();
    let backupName = null;

    if (liveSheet) {
      backupName = generateUniqueSheetName(ss, sheetName + ' Backup ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmmss'));
      liveSheet.setName(backupName);
    }

    sandboxSheet.setName(sheetName);

    if (sandboxSheet.getIndex() !== targetIndex) {
      ss.setActiveSheet(sandboxSheet);
      ss.moveActiveSheet(targetIndex);
    }

    const result = {
      sheetName: sheetName,
      backupSheetName: backupName,
      promotedAt: new Date().toISOString()
    };
    trace.complete('promoteScopeBuildupSandbox completed', result);
    return result;
  } catch (error) {
    trace.fail('promoteScopeBuildupSandbox failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Promoting scope buildup sandbox',
      correlationId: trace.correlationId
    });
    showErrorToast('Sandbox Promotion Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

function generateUniqueSheetName(ss, baseName) {
  const trace = UnifiedLogger.startTrace('ScopeSheetManager', 'generateUniqueSheetName');
  try {
    let candidate = baseName;
    let suffix = 1;
    while (ss.getSheetByName(candidate)) {
      candidate = baseName + ' (' + suffix + ')';
      suffix++;
    }
    trace.complete('generateUniqueSheetName completed', { baseName: baseName, result: candidate, iterations: suffix - 1 });
    return candidate;
  } catch (error) {
    trace.fail('generateUniqueSheetName failed', error);
    throw error;
  }
}

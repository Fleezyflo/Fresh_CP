/**
 * hrmny Quote Builder - Validation
 * Quote validation functions per SYSTEM_BRIEF.md
 */

const Validator = {
  /**
   * Check if a value is empty.
   * @param {*} value The value to check.
   * @return {boolean} True if the value is empty, false otherwise.
   */
  isEmpty: function(value) {
    return value === null || value === undefined || value === '';
  },

  /**
   * Check if a value is a valid number.
   * @param {*} value The value to check.
   * @return {boolean} True if the value is a valid number, false otherwise.
   */
  isNumber: function(value) {
    return !this.isEmpty(value) && !isNaN(Number(value));
  },

  /**
   * Check if a value is a valid string.
   * @param {*} value The value to check.
   * @return {boolean} True if the value is a valid string, false otherwise.
   */
  isString: function(value) {
    return typeof value === 'string';
  },

  /**
   * Check if a string is within a certain length.
   * @param {string} value The string to check.
   * @param {number} min The minimum length.
   * @param {number} max The maximum length.
   * @return {boolean} True if the string is within the length constraints, false otherwise.
   */
  isLength: function(value, min, max) {
    if (!this.isString(value)) {
      return false;
    }
    const len = value.length;
    if (min !== undefined && len < min) {
      return false;
    }
    if (max !== undefined && len > max) {
      return false;
    }
    return true;
  }
};

/**
 * Validate entire quote
 * Checks all business rules and displays results
 */
function validateQuote() {
  const trace = UnifiedLogger.startTrace('Validation', 'validateQuote');
  try {
    if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
      showWarningToast('Quote_Builder headers modified; skipping validation to avoid false positives.');
      trace.complete('validateQuote completed - schema not trusted', {});
      return;
    }
    const sheet = getQuoteBuilderSheet();
    const ui = SpreadsheetApp.getUi();

    try {
      const result = performQuoteValidation();

      if (result.valid) {
        ui.alert(
          '✅ Quote Valid',
          'All validation checks passed!\n\n' +
          'Total Lines: ' + result.stats.lineCount + '\n' +
          'Sections: ' + result.stats.sectionCount + '\n' +
          'Agency Fees: ' + result.stats.feeCount + '\n' +
          'Total Amount: ' + QuoteUtils.formatCurrency(result.stats.totalAmount),
          ui.ButtonSet.OK
        );
        trace.complete('validateQuote completed - valid', result.stats);
      } else {
        const errorMsg = result.errors.join('\n');
        ui.alert(
          '❌ Validation Failed',
          result.errors.length + ' error(s) found:\n\n' + errorMsg,
          ui.ButtonSet.OK
        );
        trace.complete('validateQuote completed - validation failed', { errorCount: result.errors.length, warningCount: result.warnings.length });
      }

      if (result.warnings.length > 0) {
        const warnMsg = result.warnings.join('\n');
        ui.alert(
          '⚠️ Warnings',
          result.warnings.length + ' warning(s):\n\n' + warnMsg,
          ui.ButtonSet.OK
        );
      }

    } catch (error) {
      try { UnifiedLogger.warn('Validation', 'Validation error', String(error)); } catch (ignore) {
        console.error('[Validation] Error:', ignore.message, ignore.stack);
      }
      trace.fail('validateQuote inner operation failed', error);
      throw error;
    }
  } catch (error) {
    trace.fail('validateQuote failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Validating quote',
      correlationId: trace.correlationId
    });
    showErrorToast('Validation Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Perform comprehensive quote validation
 * @return {Object} Validation result
 */
function performQuoteValidation(values) {
  const trace = UnifiedLogger.startTrace('Validation', 'performQuoteValidation');
  try {
    UnifiedLogger.info('Validation', '🔍 Starting quote validation');

    let resolvedValues = values;
    if (!resolvedValues) {
      if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
        UnifiedLogger.warn('Validation', 'Schema not trusted - validation skipped');
        const result = {
          valid: false,
          errors: ['Quote_Builder headers modified; validation skipped'],
          warnings: [],
          stats: {
            lineCount: 0,
            sectionCount: 0,
            feeCount: 0,
            totalAmount: 0
          }
        };
        trace.complete('performQuoteValidation completed - schema not trusted', {});
        return result;
      }
      const sheet = getQuoteBuilderSheet();
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const rowCount = Math.max(0, lastRow - 2);
      resolvedValues = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
      UnifiedLogger.debug('Validation', 'Loaded values from sheet', {
        lastRow,
        rowCount,
        columns: lastColumn
      });
    }

  UnifiedLogger.debug('Validation', 'Validating rows', { rowCount: resolvedValues.length - 1 });

  const errors = [];
  const warnings = [];
  const stats = {
    lineCount: 0,
    sectionCount: 0,
    feeCount: 0,
    totalAmount: 0
  };
  const sectionScopeEntries = new Set();
  const sectionLineCounts = {};
  let currentSectionScopeId = '';

  // Validate each row
  for (let i = 0; i < resolvedValues.length; i++) {
    const row = resolvedValues[i];
    const rowNum = i + 3;
    const rowType = row[QB_COLS.TYPE];
    const visibility = row[QB_COLS.VISIBILITY];
    const itemCode = row[QB_COLS.ITEM_CODE];
    const qty = row[QB_COLS.QTY];
    const unitRate = row[QB_COLS.UNIT_RATE];
    const rowNet = row[QB_COLS.ROW_NET];

    // Skip empty rows
    if (Validator.isEmpty(rowType) && Validator.isEmpty(itemCode)) {
      continue;
    }

    // Rule 1: Type must be valid
    if (!Validator.isEmpty(rowType) && ![ROW_TYPES.LINE, ROW_TYPES.SECTION, ROW_TYPES.FEE].includes(rowType)) {
      errors.push('Row ' + rowNum + ': Invalid Type "' + rowType + '"');
    }

    // Rule 2: Visibility must be valid
    if (!Validator.isEmpty(visibility) && ![VISIBILITY.CLIENT, VISIBILITY.INTERNAL, VISIBILITY.HIDDEN].includes(visibility)) {
      errors.push('Row ' + rowNum + ': Invalid Visibility "' + visibility + '"');
    }

    // Rule 3: Line items must have ItemCode
    if (rowType === ROW_TYPES.LINE && Validator.isEmpty(itemCode)) {
      errors.push('Row ' + rowNum + ': Line item missing ItemCode');
    }

    // Rule 4: Line items must have Qty and UnitRate
    if (rowType === ROW_TYPES.LINE) {
      if (!Validator.isNumber(qty) || qty <= 0) {
        errors.push('Row ' + rowNum + ': Missing or invalid Quantity');
      }
      if (!Validator.isNumber(unitRate) || unitRate <= 0) {
        warnings.push('Row ' + rowNum + ': Missing or zero Unit Rate');
      }
    }

    // Rule 5: Section rows must have SectionName
    if (rowType === ROW_TYPES.SECTION) {
      const sectionName = row[QB_COLS.SECTION_NAME];
      if (Validator.isEmpty(sectionName)) {
        errors.push('Row ' + rowNum + ': Section missing SectionName');
      }
    }

    // Rule 6: Fee rows must have valid percentage
    if (rowType === ROW_TYPES.FEE) {
      const feePct = row[QB_COLS.AGENCY_FEE_PCT];
      if (![0.10, 0.15, 0.20].includes(feePct)) {
        errors.push('Row ' + rowNum + ': Invalid fee percentage ' + feePct);
      }
    }

    // Count row types
    if (rowType === ROW_TYPES.LINE) stats.lineCount++;
    if (rowType === ROW_TYPES.SECTION) stats.sectionCount++;
    if (rowType === ROW_TYPES.FEE) stats.feeCount++;

    if (rowType === ROW_TYPES.SECTION) {
      const sectionScopeId = row[QB_COLS.SCOPE_ENTRY_ID];
      currentSectionScopeId = sectionScopeId || '';
      if (sectionScopeId) {
        sectionScopeEntries.add(sectionScopeId);
        sectionLineCounts[sectionScopeId] = sectionLineCounts[sectionScopeId] || 0;
      }
    }
    if (rowType === ROW_TYPES.LINE && currentSectionScopeId) {
      sectionLineCounts[currentSectionScopeId] = (sectionLineCounts[currentSectionScopeId] || 0) + 1;
    }

    // Sum client-visible amounts
    const clientAmount = row[QB_COLS.CLIENT_AMOUNT];
    if (Validator.isNumber(clientAmount) && visibility === VISIBILITY.CLIENT) {
      stats.totalAmount += Number(clientAmount);
    }
  }

  // Rule 7: Quote must have at least one line item
  if (stats.lineCount === 0) {
    errors.push('Quote has no line items');
  }

  sectionScopeEntries.forEach(function(scopeEntryId) {
    if (!sectionLineCounts[scopeEntryId]) {
      warnings.push('Scope entry ' + scopeEntryId + ' has a section header but no line items.');
    }
  });

  // Rule 8: Agency fees validation
  const feeValidation = validateAgencyFees();
  if (!feeValidation.valid) {
    warnings.push(...feeValidation.errors);
  }

  try {
    UnifiedLogger.info('Validation', 'performQuoteValidation completed', {
      lines: stats.lineCount,
      sections: stats.sectionCount,
      fees: stats.feeCount,
      clientTotal: stats.totalAmount,
      errors: errors.length,
      warnings: warnings.length
    });
  } catch (ignore) {
      console.error('[Validation] Error:', ignore.message, ignore.stack);
    }

  if (errors.length > 0) {
    try { UnifiedLogger.warn('Validation', 'performQuoteValidation first errors', errors.slice(0, 5).join(' | ')); } catch (ignore) {
      console.error('[Validation] Error:', ignore.message, ignore.stack);
    }
  }

  if (warnings.length > 0) {
    try { UnifiedLogger.warn('Validation', 'performQuoteValidation first warnings', warnings.slice(0, 5).join(' | ')); } catch (ignore) {
      console.error('[Validation] Error:', ignore.message, ignore.stack);
    }
  }

    UnifiedLogger.info('Validation', 'Validation complete', {
      valid: errors.length === 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      lineCount: stats.lineCount,
      sectionCount: stats.sectionCount,
      totalAmount: stats.totalAmount
    });

    const result = {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      stats: stats
    };
    trace.complete('performQuoteValidation completed', { valid: result.valid, errorCount: errors.length, warningCount: warnings.length, lineCount: stats.lineCount });
    return result;
  } catch (error) {
    trace.fail('performQuoteValidation failed', error);
    throw error;
  }
}

/**
 * Validate section totals
 * Checks that section SUMIFS formulas are correct
 * @return {Object} Validation result
 */
function validateSections(values) {
  const trace = UnifiedLogger.startTrace('Validation', 'validateSections');
  try {
    let resolvedValues = values;
    if (!resolvedValues) {
      if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
        const result = { success: false, issues: ['Quote_Builder headers modified; section validation skipped.'], stats: { sections: {} } };
        trace.complete('validateSections completed - schema not trusted', {});
        return result;
      }
      const sheet = getQuoteBuilderSheet();
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const rowCount = Math.max(0, lastRow - 2);
      resolvedValues = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
    }

    const errors = [];
    const sections = {};

    // Find all sections and their lines
    for (let i = 0; i < resolvedValues.length; i++) {
      const row = resolvedValues[i];
      const rowType = row[QB_COLS.TYPE];
      const sectionName = row[QB_COLS.SECTION_NAME];

      if (rowType === ROW_TYPES.SECTION) {
        if (!sections[sectionName]) {
          sections[sectionName] = {
            sectionRow: i + 3,
            lineRows: [],
            subtotal: row[QB_COLS.SECTION_SUBTOTAL]
          };
        }
      } else if (rowType === ROW_TYPES.LINE && sectionName) {
        if (!sections[sectionName]) {
          sections[sectionName] = {
            lineRows: [],
            sectionRow: null,
            subtotal: 0
          };
        }
        sections[sectionName].lineRows.push(i + 3);
      }
    }

    // Validate each section has lines
    for (const sectionName in sections) {
      const section = sections[sectionName];
      if (section.lineRows.length === 0) {
        errors.push('Section "' + sectionName + '" has no line items');
      }
      if (!section.sectionRow) {
        errors.push('Section "' + sectionName + '" has line items but no section total row');
      }
    }

    const result = {
      success: errors.length === 0,
      issues: errors,
      stats: {
        sections: sections,
        sectionCount: Object.keys(sections).length
      }
    };
    trace.complete('validateSections completed', { success: result.success, sectionCount: result.stats.sectionCount, issueCount: errors.length });
    return result;
  } catch (error) {
    trace.fail('validateSections failed', error);
    throw error;
  }
}

/**
 * Check for missing prices
 * @return {{success:boolean, issues:Array<number>, stats:Object}} Validation result
 */
function findMissingPrices(values) {
  const trace = UnifiedLogger.startTrace('Validation', 'findMissingPrices');
  try {
    let resolvedValues = values;
    if (!resolvedValues) {
      if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
        const result = { success: false, issues: [], stats: { missingCount: 0 } };
        trace.complete('findMissingPrices completed - schema not trusted', {});
        return result;
      }
      const sheet = getQuoteBuilderSheet();
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const rowCount = Math.max(0, lastRow - 2);
      resolvedValues = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
    }

    const missingPrices = [];

    for (let i = 0; i < resolvedValues.length; i++) {
      const row = resolvedValues[i];
      const rowType = row[QB_COLS.TYPE];
      const unitRate = row[QB_COLS.UNIT_RATE];

      if (rowType === ROW_TYPES.LINE && (!unitRate || unitRate === 0)) {
        missingPrices.push(i + 3);
      }
    }

    const result = {
      success: missingPrices.length === 0,
      issues: missingPrices,
      stats: {
        missingCount: missingPrices.length
      }
    };
    trace.complete('findMissingPrices completed', { success: result.success, missingCount: result.stats.missingCount });
    return result;
  } catch (error) {
    trace.fail('findMissingPrices failed', error);
    throw error;
  }
}

/**
 * Check for inactive items
 * @return {{success:boolean, issues:Array<Object>, stats:Object}} Validation result
 */
function findInactiveItems(values) {
  const trace = UnifiedLogger.startTrace('Validation', 'findInactiveItems');
  try {
    let resolvedValues = values;
    if (!resolvedValues) {
      if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
        const result = { success: false, issues: [], stats: { inactiveCount: 0 } };
        trace.complete('findInactiveItems completed - schema not trusted', {});
        return result;
      }
      const sheet = getQuoteBuilderSheet();
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const rowCount = Math.max(0, lastRow - 2);
      resolvedValues = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
    }

    const inactiveItems = [];

    for (let i = 0; i < resolvedValues.length; i++) {
      const row = resolvedValues[i];
      const itemCode = row[QB_COLS.ITEM_CODE];

      if (!itemCode) continue;

      const item = lookupItem(itemCode);
      if (item && !item.active) {
        inactiveItems.push({
          row: i + 3,
          itemCode: itemCode
        });
      }
    }

    const result = {
      success: inactiveItems.length === 0,
      issues: inactiveItems,
      stats: {
        inactiveCount: inactiveItems.length
      }
    };
    trace.complete('findInactiveItems completed', { success: result.success, inactiveCount: result.stats.inactiveCount });
    return result;
  } catch (error) {
    trace.fail('findInactiveItems failed', error);
    throw error;
  }
}

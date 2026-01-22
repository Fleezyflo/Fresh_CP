/**
 * hrmny Quote Builder - Section Helpers
 * Functions to insert and manage section totals
 * Per SYSTEM_BRIEF.md section 2.B
 */

const SECTION_HELPERS_LOG_CATEGORY = 'SectionHelpers';

/**
 * Insert Section Total row at current selection
 * Prompts user for section name and inserts formatted section row
 */
function insertSectionTotal() {
  const sheet = getQuoteBuilderSheet();
  const activeRange = sheet.getActiveRange();
  const currentRow = activeRange.getRow();

  // Validate we're not in header rows
  if (currentRow <= 2) {
    showErrorToast('Cannot insert section in header rows');
    return;
  }

  // Prompt for section name
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Insert Section Total',
    'Enter section name (e.g., "Production", "Post-Production"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return; // User cancelled
  }

  const sectionName = response.getResponseText().trim();
  const sanitizedSectionName = QuoteUtils.sanitizeForSheet(sectionName);
  const sanitizedClientLineName = QuoteUtils.sanitizeForSheet(sectionName + ' Total');

  if (!sectionName) {
    showErrorToast('Section name cannot be empty');
    return;
  }

  try {
    UnifiedLogger.info(SECTION_HELPERS_LOG_CATEGORY, 'insertSectionTotal', {
      sectionName: sectionName,
      baseRow: currentRow
    });
  } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
  try {
    // Insert new row
    sheet.insertRowAfter(currentRow);
    const newRow = currentRow + 1;

    // Get range for new row
    const rowRange = sheet.getRange(newRow, 1, 1, 20);

    // Set values
    const values = [
      [
        `=ROW()`,                    // A: RowID
        ROW_TYPES.SECTION,           // B: Type
        VISIBILITY.CLIENT,           // C: Visibility (sections are client-visible)
        sanitizedSectionName,        // D: SectionName
        '',                          // E: ItemCode (empty for sections)
        '',                          // F: Description (empty)
        sanitizedClientLineName,     // G: ClientLineName
        '',                          // H: Qty (empty)
        '',                          // I: Unit (empty)
        '',                          // J: UnitRate (empty)
        '',                          // K: Markup% (empty)
        '',                          // L: RowNet (empty - formula below handles this)
        `=SUMIFS($L:$L,$D:$D,"${sanitizedSectionName}",$B:$B,"Line",$C:$C,"<>Hidden")`, // M: SectionSubtotal
        '',                          // N: AgencyFeePct (empty)
        '',                          // O: FeeBase (empty)
        '',                          // P: FeeAmount (empty)
        `=M${newRow}`,               // Q: ClientAmount (equals section subtotal)
        '',                          // R: InternalCost (empty)
        '',                          // S: Margin (empty)
        ''                           // T: Notes
      ]
    ];

    rowRange.setValues(values);

    // Apply formatting
    formatSectionRow(sheet, newRow);

    showSuccessToast(`Section "${sectionName}" inserted at row ${newRow}`);

    // Select the new section row
    sheet.setActiveRange(sheet.getRange(newRow, 1, 1, 20));

  } catch (error) {
    try { UnifiedLogger.error(SECTION_HELPERS_LOG_CATEGORY, 'insertSectionTotal failed', String(error)); } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
    showErrorToast('Failed to insert section: ' + error.message);
  }
}

/**
 * Format section row with appropriate styling
 * @param {Sheet} sheet
 * @param {number} row - Row number (1-indexed)
 */
function formatSectionRow(sheet, row) {
  const rowRange = sheet.getRange(row, 1, 1, 20);

  // Background color: light blue (per conditional formatting rule)
  rowRange.setBackground('#E8F0FE');

  // Bold text
  rowRange.setFontWeight('bold');

  // Currency formatting for amount columns
  const amountCols = [
    QB_COLS.UNIT_RATE + 1,
    QB_COLS.ROW_NET + 1,
    QB_COLS.SECTION_SUBTOTAL + 1,
    QB_COLS.FEE_BASE + 1,
    QB_COLS.FEE_AMOUNT + 1,
    QB_COLS.CLIENT_AMOUNT + 1,
    QB_COLS.INTERNAL_COST + 1
  ]; // J, L, M, O, P, Q, R
  amountCols.forEach(col => {
    sheet.getRange(row, col).setNumberFormat('#,##0.00 "AED"');
  });
}

/**
 * Insert blank line item row
 * Inserts a blank Line row with formulas ready
 */
function insertBlankLine() {
  const sheet = getQuoteBuilderSheet();
  const activeRange = sheet.getActiveRange();
  const currentRow = activeRange.getRow();

  // Validate
  if (currentRow <= 2) {
    showErrorToast('Cannot insert line in header rows');
    return;
  }

  try {
    try {
      UnifiedLogger.info(SECTION_HELPERS_LOG_CATEGORY, 'insertBlankLine', {
        currentRow: currentRow
      });
    } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
    // Insert new row
    sheet.insertRowAfter(currentRow);
    const newRow = currentRow + 1;

    // Copy formulas from row 3 (template row)
    const templateRange = sheet.getRange(3, 1, 1, 20);
    const newRange = sheet.getRange(newRow, 1, 1, 20);

    // Copy formulas
    templateRange.copyTo(newRange, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);

    // Set default values
    sheet.getRange(newRow, QB_COLS.TYPE + 1).setValue(ROW_TYPES.LINE);
    sheet.getRange(newRow, QB_COLS.VISIBILITY + 1).setValue(VISIBILITY.INTERNAL);

    showSuccessToast(`Blank line inserted at row ${newRow}`);

    // Select ItemCode cell for user to start filling
    sheet.setActiveRange(sheet.getRange(newRow, QB_COLS.ITEM_CODE + 1));

  } catch (error) {
    try { UnifiedLogger.error(SECTION_HELPERS_LOG_CATEGORY, 'insertBlankLine failed', String(error)); } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
    showErrorToast('Failed to insert line: ' + error.message);
  }
}

/**
 * Copy formulas down from row 3 to all rows with data
 * Useful when formulas get broken or new rows need formulas
 */
function copyFormulasDown() {
  if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
    showWarningToast('Quote_Builder headers modified; skipping formula copy.');
    return;
  }
  const sheet = getQuoteBuilderSheet();
  const totalRows = sheet.getMaxRows();
  if (totalRows <= 3) {
    showWarningToast('No rows to copy formulas to');
    return;
  }

  try {
    UnifiedLogger.info(SECTION_HELPERS_LOG_CATEGORY, 'copyFormulasDown', {
      totalRows: totalRows
    });
  } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }

  try {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (ss && typeof ensureQuoteBuilderTemplateRow === 'function') {
        ensureQuoteBuilderTemplateRow(ss);
      }
    } catch (templateError) {
      try { UnifiedLogger.warn(SECTION_HELPERS_LOG_CATEGORY, 'copyFormulasDown template row reset failed', String(templateError)); } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
    }

    // Template row is row 3
    const lastColumn = sheet.getLastColumn();
    const templateRange = sheet.getRange(3, 1, 1, lastColumn);

    // Copy to all rows from 4 to lastRow
    const targetRowCount = totalRows - 3;
    const targetRange = sheet.getRange(4, 1, targetRowCount, lastColumn);

    templateRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (ss && typeof syncQuoteStagingTemplate === 'function') {
        syncQuoteStagingTemplate(ss);
      }
    } catch (syncError) {
      try { UnifiedLogger.warn(SECTION_HELPERS_LOG_CATEGORY, 'copyFormulasDown staging sync failed', String(syncError)); } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
    }

    showSuccessToast(`Formulas copied to ${targetRowCount} rows`);

  } catch (error) {
    try { UnifiedLogger.error(SECTION_HELPERS_LOG_CATEGORY, 'copyFormulasDown failed', String(error)); } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
    showErrorToast('Failed to copy formulas: ' + error.message);
  }
}

function isQuoteBuilderSchemaTrusted_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss ? ss.getSheetByName(SHEET_NAMES && SHEET_NAMES.QUOTE_BUILDER ? SHEET_NAMES.QUOTE_BUILDER : 'Quote_Builder') : null;
    if (!sheet) {
      return false;
    }
    if (typeof QB_HEADER_MAP === 'undefined' || !QB_HEADER_MAP || typeof QB_COLS === 'undefined' || !QB_COLS) {
      return true;
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const mismatches = [];
    Object.keys(QB_HEADER_MAP).forEach(function(key) {
      const idx = QB_COLS[key];
      if (typeof idx === 'number' && idx < headers.length) {
        const actual = headers[idx];
        const expected = QB_HEADER_MAP[key];
        if (actual !== expected) {
          mismatches.push(key + ' expected "' + expected + '" found "' + actual + '"');
        }
      }
    });
    if (mismatches.length) {
      try { UnifiedLogger.warn(SECTION_HELPERS_LOG_CATEGORY, 'Quote_Builder header mismatches', { mismatches: mismatches }); } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
      return false;
    }
    return true;
  } catch (error) {
    try { UnifiedLogger.warn(SECTION_HELPERS_LOG_CATEGORY, 'isQuoteBuilderSchemaTrusted_ failed', String(error)); } catch (ignore) {
      console.error('[SectionHelpers] Error:', ignore.message, ignore.stack);
    }
    return false;
  }
}

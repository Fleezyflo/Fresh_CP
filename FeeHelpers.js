/**
 * hrmny Quote Builder - Fee Helpers
 * Functions to insert agency fees
 * Per SYSTEM_BRIEF.md section 2.D
 */

const FEE_HELPERS_LOG_CATEGORY = 'FeeHelpers';

/**
 * Insert Agency Fee (10%)
 */
function insertAgencyFee10() {
  const trace = UnifiedLogger.startTrace('FeeHelpers', 'insertAgencyFee10');
  try {
    insertAgencyFee(AGENCY_FEES.TEN_PERCENT, '10%');
    trace.complete('insertAgencyFee10 completed', { feePercent: '10%' });
  } catch (error) {
    trace.fail('insertAgencyFee10 failed', error);
    throw error;
  }
}

/**
 * Insert Agency Fee (15%)
 */
function insertAgencyFee15() {
  const trace = UnifiedLogger.startTrace('FeeHelpers', 'insertAgencyFee15');
  try {
    insertAgencyFee(AGENCY_FEES.FIFTEEN_PERCENT, '15%');
    trace.complete('insertAgencyFee15 completed', { feePercent: '15%' });
  } catch (error) {
    trace.fail('insertAgencyFee15 failed', error);
    throw error;
  }
}

/**
 * Insert Agency Fee (20%)
 */
function insertAgencyFee20() {
  const trace = UnifiedLogger.startTrace('FeeHelpers', 'insertAgencyFee20');
  try {
    insertAgencyFee(AGENCY_FEES.TWENTY_PERCENT, '20%');
    trace.complete('insertAgencyFee20 completed', { feePercent: '20%' });
  } catch (error) {
    trace.fail('insertAgencyFee20 failed', error);
    throw error;
  }
}

/**
 * Insert agency fee row at current selection
 * Per SYSTEM_BRIEF.md section 2.D:
 * - Fee = sum of all section totals × percentage
 * - Appears as visible line item
 * - Placed below costs it applies to
 *
 * @param {number} feePercent - Fee percentage (0.10, 0.15, or 0.20)
 * @param {string} feeLabel - Display label (e.g., '15%')
 */
function insertAgencyFee(feePercent, feeLabel) {
  const trace = UnifiedLogger.startTrace('FeeHelpers', 'insertAgencyFee');
  try {
    if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
      showWarningToast('Quote_Builder headers modified; skipping fee insert.');
      trace.complete('insertAgencyFee completed - schema not trusted', {});
      return;
    }
    const sheet = getQuoteBuilderSheet();
    const activeRange = sheet.getActiveRange();
    const currentRow = activeRange.getRow();

    // Validate
    if (currentRow <= 2) {
      showErrorToast('Cannot insert fee in header rows');
      trace.complete('insertAgencyFee completed - invalid row', { currentRow: currentRow });
      return;
    }

    // Determine ItemCode based on percentage
    let itemCode;
    if (feePercent === 0.10) {
      itemCode = 'fee.agency.10--project';
    } else if (feePercent === 0.15) {
      itemCode = 'fee.agency.15--project';
    } else if (feePercent === 0.20) {
      itemCode = 'fee.agency.20--project';
    } else {
      showErrorToast('Invalid fee percentage');
      trace.complete('insertAgencyFee completed - invalid fee percentage', { feePercent: feePercent });
      return;
    }

    try {
      UnifiedLogger.info(FEE_HELPERS_LOG_CATEGORY, 'insertAgencyFee', {
        feePercent: feePercent,
        locationRow: currentRow
      });
    } catch (ignore) {
        console.error('[FeeHelpers] Error:', ignore.message, ignore.stack);
      }

    // Insert new row
    sheet.insertRowAfter(currentRow);
    const newRow = currentRow + 1;

    // Set values
    const values = [
      [
        '=ROW()',                               // A: RowID
        ROW_TYPES.FEE,                          // B: Type
        VISIBILITY.CLIENT,                      // C: Visibility
        'Agency Fee',                           // D: SectionName
        itemCode,                               // E: ItemCode
        'Agency Fee (' + feeLabel + ')',        // F: Description
        'Agency Fee (' + feeLabel + ')',        // G: ClientLineName
        1,                                      // H: Qty
        'Project',                              // I: Unit
        '',                                     // J: UnitRate (empty - calculated in FeeAmount)
        '',                                     // K: Markup%
        '',                                     // L: RowNet (empty)
        '',                                     // M: SectionSubtotal (empty)
        feePercent,                             // N: AgencyFeePct
        '=SUMIF($B$3:B' + (newRow-1) + ',"Section",$M$3:M' + (newRow-1) + ')', // O: FeeBase
        '=O' + newRow + '*N' + newRow,          // P: FeeAmount
        '=P' + newRow,                          // Q: ClientAmount
        '',                                     // R: InternalCost
        '=P' + newRow,                          // S: Margin (fee is pure margin)
        'Auto-generated agency fee'             // T: Notes
      ]
    ];

    const rowRange = sheet.getRange(newRow, 1, 1, 20);
    rowRange.setValues(values);

    // Apply formatting
    formatFeeRow(sheet, newRow);

    showSuccessToast('Agency Fee (' + feeLabel + ') inserted at row ' + newRow);

    // Select the fee row
    sheet.setActiveRange(sheet.getRange(newRow, 1, 1, 20));

    trace.complete('insertAgencyFee completed', { feePercent: feePercent, feeLabel: feeLabel, newRow: newRow });
  } catch (error) {
    trace.fail('insertAgencyFee failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Inserting agency fee',
      correlationId: trace.correlationId
    });
    showErrorToast('Fee Insertion Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Format fee row with appropriate styling
 * @param {Sheet} sheet
 * @param {number} row - Row number (1-indexed)
 */
function formatFeeRow(sheet, row) {
  const trace = UnifiedLogger.startTrace('FeeHelpers', 'formatFeeRow');
  try {
    const rowRange = sheet.getRange(row, 1, 1, 20);

    // Background color: light orange (per conditional formatting)
    rowRange.setBackground('#FCE5CD');

    // Bold text
    rowRange.setFontWeight('bold');

    // Currency formatting
    const amountCols = [
      QB_COLS.UNIT_RATE + 1,
      QB_COLS.ROW_NET + 1,
      QB_COLS.SECTION_SUBTOTAL + 1,
      QB_COLS.FEE_BASE + 1,
      QB_COLS.FEE_AMOUNT + 1,
      QB_COLS.CLIENT_AMOUNT + 1,
      QB_COLS.INTERNAL_COST + 1,
      QB_COLS.MARGIN + 1
    ];
    amountCols.forEach(col => {
      sheet.getRange(row, col).setNumberFormat('#,##0.00 "AED"');
    });

    // Percentage formatting for AgencyFeePct
    sheet.getRange(row, QB_COLS.AGENCY_FEE_PCT + 1).setNumberFormat('0.0%');

    trace.complete('formatFeeRow completed', { row: row });
  } catch (error) {
    trace.fail('formatFeeRow failed', error);
    throw error;
  }
}

/**
 * Validate all agency fees in quote
 * Checks that:
 * - Fee percentages are correct
 * - FeeBase formulas are correct
 * - No duplicate fees
 *
 * @return {Object} Validation result
 */
function validateAgencyFees() {
  const trace = UnifiedLogger.startTrace('FeeHelpers', 'validateAgencyFees');
  try {
    if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
      showWarningToast('Quote_Builder headers modified; skipping fee validation.');
      const result = {
        valid: false,
        errors: ['Schema untrusted; validation skipped'],
        feeRows: []
      };
      trace.complete('validateAgencyFees completed - schema not trusted', result);
      return result;
    }
    const sheet = getQuoteBuilderSheet();
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    const rowCount = Math.max(0, lastRow - 2);
    const values = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];

    try {
      UnifiedLogger.info(FEE_HELPERS_LOG_CATEGORY, 'validateAgencyFees', {
        rows: values.length
      });
    } catch (ignore) {
        console.error('[FeeHelpers] Error:', ignore.message, ignore.stack);
      }
    const errors = [];
    const feeRows = [];

    // Find all fee rows
    for (let i = 0; i < values.length; i++) {
      if (values[i][QB_COLS.TYPE] === ROW_TYPES.FEE) {
        feeRows.push(i + 3);

        const feePct = values[i][QB_COLS.AGENCY_FEE_PCT];
        const feeBase = values[i][QB_COLS.FEE_BASE];
        const feeAmount = values[i][QB_COLS.FEE_AMOUNT];

        // Validate percentage
        if (!Object.values(AGENCY_FEES).includes(feePct)) {
          errors.push('Row ' + (i + 3) + ': Invalid agency fee percentage ' + feePct);
        }

        // Validate FeeBase is not empty
        if (!feeBase) {
          errors.push('Row ' + (i + 3) + ': FeeBase is empty');
        }

        // Validate FeeAmount is calculated
        if (!feeAmount) {
          errors.push('Row ' + (i + 3) + ': FeeAmount is empty');
        }
      }
    }

    // Check for multiple fees (may be intentional, just warn)
    if (feeRows.length > 1) {
      errors.push('Warning: Multiple agency fees found at rows ' + feeRows.join(', '));
    }

    try {
      UnifiedLogger.info(FEE_HELPERS_LOG_CATEGORY, 'validateAgencyFees result', {
        valid: errors.length === 0,
        errors: errors,
        feeRows: feeRows
      });
    } catch (ignore) {
        console.error('[FeeHelpers] Error:', ignore.message, ignore.stack);
      }

    const result = {
      valid: errors.length === 0,
      errors: errors,
      feeRows: feeRows
    };
    trace.complete('validateAgencyFees completed', result);
    return result;
  } catch (error) {
    trace.fail('validateAgencyFees failed', error);
    throw error;
  }
}

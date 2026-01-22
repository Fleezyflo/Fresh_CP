/**
 * hrmny Quote Builder - Document Generator
 * Generate Google Doc proposal from Quote_Builder data
 */

const DOC_LOG_CATEGORY = 'DocGenerator';

/**
 * Generate client-facing proposal document
 * Override from Utilities.gs stub
 */
function generateClientView() {
  const trace = UnifiedLogger.startTrace('DocGenerator', 'generateClientView');
  try {
    if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
      showWarningToast('Quote_Builder headers modified; skipping document generation.');
      trace.complete('generateClientView completed - schema not trusted', {});
      return;
    }
    const sheet = getQuoteBuilderSheet();
    const ui = SpreadsheetApp.getUi();

    try {
    try {
      UnifiedLogger.info(DOC_LOG_CATEGORY, 'generateClientView', {
        activeSheet: sheet ? sheet.getName() : 'unknown',
        timestamp: new Date()
      });
    } catch (ignore) {
      console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
    }
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    const rowCount = Math.max(0, lastRow - 2);
    const values = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
    const quoteData = getClientVisibleData(values);

    if (quoteData.length === 0) {
      showWarningToast('No client-visible items found');
      return;
    }

    try {
      UnifiedLogger.info(DOC_LOG_CATEGORY, 'clientVisibleData', {
        count: quoteData.length,
        sample: quoteData.slice(0, 4)
      });
    } catch (ignore) {
      console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
    }
    // Calculate totals
    const totals = calculateQuoteTotals(values);
    const vatPercent = getConfigValue('VAT_PERCENT');
    const vatAmount = totals.totalClientAmount * vatPercent;
    const grandTotal = totals.totalClientAmount + vatAmount;

    try {
      UnifiedLogger.info(DOC_LOG_CATEGORY, 'quoteTotals', {
        totals: totals,
        vatPercent: vatPercent,
        vatAmount: vatAmount,
        grandTotal: grandTotal
      });
    } catch (ignore) {
      console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
    }
    // Create document
    const docName = 'HRMNY Quote - ' + new Date().toISOString().split('T')[0];
    const doc = DocumentApp.create(docName);
    const body = doc.getBody();

    // Add header
    body.appendParagraph('hrmny')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    body.appendParagraph('Commercial Proposal')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    body.appendParagraph(''); // Spacer

    // Add date
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM dd, yyyy');
    body.appendParagraph('Date: ' + dateStr);
    body.appendParagraph(''); // Spacer

    // Add items table
    const table = body.appendTable();

    // Table header
    const headerRow = table.appendTableRow();
    headerRow.appendTableCell('Description').setWidth(300);
    headerRow.appendTableCell('Quantity').setWidth(80);
    headerRow.appendTableCell('Unit').setWidth(80);
    headerRow.appendTableCell('Amount (AED)').setWidth(120);

    // Format header
    for (let i = 0; i < headerRow.getNumCells(); i++) {
      const cell = headerRow.getCell(i);
      cell.setBackgroundColor('#4A86E8');
      const para = cell.getChild(0).asParagraph();
      para.setForegroundColor('#FFFFFF');
      para.setBold(true);
    }

    // Add data rows
    quoteData.forEach(function(item) {
      const row = table.appendTableRow();
      row.appendTableCell(stripInternalMarker(item.clientLineName || item.description));
      row.appendTableCell(item.qty ? item.qty.toString() : '');
      row.appendTableCell(item.unit || '');
      row.appendTableCell(formatCurrencyForDoc(item.clientAmount));
    });

    // Add totals
    body.appendParagraph(''); // Spacer

    const totalsTable = body.appendTable();
    totalsTable.appendTableRow()
      .appendTableCell('Subtotal:')
      .appendTableCell(formatCurrencyForDoc(totals.totalClientAmount));

    totalsTable.appendTableRow()
      .appendTableCell('VAT (' + (vatPercent * 100).toFixed(0) + '%):')
      .appendTableCell(formatCurrencyForDoc(vatAmount));

    const grandTotalRow = totalsTable.appendTableRow();
    grandTotalRow.appendTableCell('Total:').setBold(true);
    grandTotalRow.appendTableCell(formatCurrencyForDoc(grandTotal)).setBold(true);

    // Add footer
    body.appendParagraph(''); // Spacer
    body.appendParagraph('Thank you for your business!')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    // Save and show URL
    doc.saveAndClose();
    const docUrl = doc.getUrl();

    try {
      UnifiedLogger.info(DOC_LOG_CATEGORY, 'documentCreated', {
        docName: docName,
        docUrl: docUrl,
        totalItems: quoteData.length,
        grandTotal: grandTotal
      });
    } catch (ignore) {
      console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
    }

      ui.alert('Document Created', 'Proposal document created:\n\n' + docUrl, ui.ButtonSet.OK);
      showSuccessToast('Proposal document generated');

      // Log generation
      logQuoteGeneration({
        docUrl: docUrl,
        totalAmount: grandTotal,
        itemCount: quoteData.length
      });

      trace.complete('generateClientView completed', { docName: docName, itemCount: quoteData.length, grandTotal: grandTotal });

    } catch (error) {
      try { UnifiedLogger.error(DOC_LOG_CATEGORY, 'Error generating client view', String(error)); } catch (ignore) {
        console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
      }
      trace.fail('generateClientView inner operation failed', error);
      throw error;
    }
  } catch (error) {
    trace.fail('generateClientView failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Generating client proposal document',
      correlationId: trace.correlationId
    });
    showErrorToast('Document Generation Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Get client-visible data from Quote_Builder
 * @return {Array} Array of client-visible items
 */
function getClientVisibleData(values) {
  const trace = UnifiedLogger.startTrace('DocGenerator', 'getClientVisibleData');
  try {
    let resolvedValues = values;
    if (!resolvedValues) {
      if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
        trace.complete('getClientVisibleData completed - schema not trusted', { count: 0 });
        return [];
      }
      const sheet = getQuoteBuilderSheet();
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const rowCount = Math.max(0, lastRow - 2);
      resolvedValues = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
    }

  const clientData = [];

  for (let i = 0; i < resolvedValues.length; i++) {
    const visibility = resolvedValues[i][QB_COLS.VISIBILITY];
    const clientAmount = resolvedValues[i][QB_COLS.CLIENT_AMOUNT];

    if (visibility !== VISIBILITY.CLIENT || !clientAmount) {
      continue;
    }

    clientData.push({
      sectionName: resolvedValues[i][QB_COLS.SECTION_NAME],
      description: resolvedValues[i][QB_COLS.DESCRIPTION],
      clientLineName: resolvedValues[i][QB_COLS.CLIENT_LINE_NAME],
      qty: resolvedValues[i][QB_COLS.QTY],
      unit: resolvedValues[i][QB_COLS.UNIT],
      clientAmount: resolvedValues[i][QB_COLS.CLIENT_AMOUNT]
    });
  }

    try {
      UnifiedLogger.info(DOC_LOG_CATEGORY, 'clientVisibleItemsExtracted', {
        count: clientData.length,
        sampleRows: clientData.slice(0, 3)
      });
    } catch (ignore) {
        console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
      }

    trace.complete('getClientVisibleData completed', { count: clientData.length });
    return clientData;
  } catch (error) {
    trace.fail('getClientVisibleData failed', error);
    throw error;
  }
}

/**
 * Calculate quote totals
 * @return {Object} Totals object
 */
function calculateQuoteTotals(values) {
  const trace = UnifiedLogger.startTrace('DocGenerator', 'calculateQuoteTotals');
  try {
    let resolvedValues = values;
    if (!resolvedValues) {
      if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
        const result = {
          totalClientAmount: 0,
          totalInternalCost: 0,
          margin: 0,
          lineItemCount: 0,
          sectionCount: 0,
          feeAmount: 0
        };
        trace.complete('calculateQuoteTotals completed - schema not trusted', result);
        return result;
      }
      const sheet = getQuoteBuilderSheet();
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const rowCount = Math.max(0, lastRow - 2);
      resolvedValues = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
    }

  let totalClientAmount = 0;
  let totalInternalCost = 0;
  let lineItemCount = 0;
  let sectionCount = 0;
  let feeAmount = 0;

  for (let i = 0; i < resolvedValues.length; i++) {
    const type = resolvedValues[i][QB_COLS.TYPE];
    const visibility = resolvedValues[i][QB_COLS.VISIBILITY];
    const clientAmount = resolvedValues[i][QB_COLS.CLIENT_AMOUNT];
    const internalCost = resolvedValues[i][QB_COLS.INTERNAL_COST];

    if (visibility === VISIBILITY.HIDDEN) {
      continue;
    }

    if (clientAmount) {
      totalClientAmount += Number(clientAmount);
    }

    if (internalCost) {
      totalInternalCost += Number(internalCost);
    }

    if (type === ROW_TYPES.LINE) lineItemCount++;
    if (type === ROW_TYPES.SECTION) sectionCount++;
    if (type === ROW_TYPES.FEE && clientAmount) {
      feeAmount += Number(clientAmount);
    }
  }

    const totals = {
      totalClientAmount: totalClientAmount,
      totalInternalCost: totalInternalCost,
      margin: totalClientAmount - totalInternalCost,
      lineItemCount: lineItemCount,
      sectionCount: sectionCount,
      feeAmount: feeAmount
    };
    try { UnifiedLogger.info(DOC_LOG_CATEGORY, 'calculateQuoteTotals', totals); } catch (ignore) {
        console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
      }

    trace.complete('calculateQuoteTotals completed', totals);
    return totals;
  } catch (error) {
    trace.fail('calculateQuoteTotals failed', error);
    throw error;
  }
}

/**
 * Format currency for document output
 * @param {number} amount - Amount to format
 * @return {string} Formatted currency
 */
function formatCurrencyForDoc(amount) {
  const trace = UnifiedLogger.startTrace('DocGenerator', 'formatCurrencyForDoc');
  try {
    if (!amount && amount !== 0) {
      trace.complete('formatCurrencyForDoc completed - null amount', { amount: amount, output: '0.00 AED' });
      return '0.00 AED';
    }
    const result = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' AED';
    trace.complete('formatCurrencyForDoc completed', { amount: amount, output: result });
    return result;
  } catch (error) {
    trace.fail('formatCurrencyForDoc failed', error);
    throw error;
  }
}

/**
 * Generate internal view document (full detail)
 * Override from Utilities.gs stub
 */
function generateInternalView() {
  const trace = UnifiedLogger.startTrace('DocGenerator', 'generateInternalView');
  try {
    if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
      showWarningToast('Quote_Builder headers modified; skipping internal document.');
      trace.complete('generateInternalView completed - schema not trusted', {});
      return;
    }
    const sheet = getQuoteBuilderSheet();
    const ui = SpreadsheetApp.getUi();

    try {
    try {
      UnifiedLogger.info(DOC_LOG_CATEGORY, 'generateInternalView', {
        sheet: sheet ? sheet.getName() : 'unknown'
      });
    } catch (ignore) {
      console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
    }
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    const rowCount = Math.max(0, lastRow - 2);
    const values = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];

    try {
      UnifiedLogger.info(DOC_LOG_CATEGORY, 'internalRows', {
        totalRows: values.length,
        nonEmpty: values.filter(row => row && row[QB_COLS.TYPE]).length
      });
    } catch (ignore) {
      console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
    }

    // Create document
    const docName = 'HRMNY Internal Quote - ' + new Date().toISOString().split('T')[0];
    const doc = DocumentApp.create(docName);
    const body = doc.getBody();

    // Add header
    body.appendParagraph('hrmny - Internal Quote Detail')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);

    body.appendParagraph('Generated: ' + new Date().toString());
    body.appendParagraph(''); // Spacer

    // Add full data table
    const table = body.appendTable();

    // Header row
    const headerRow = table.appendTableRow();
    headerRow.appendTableCell('Type');
    headerRow.appendTableCell('Section');
    headerRow.appendTableCell('Item Code');
    headerRow.appendTableCell('Description');
    headerRow.appendTableCell('Qty');
    headerRow.appendTableCell('Rate');
    headerRow.appendTableCell('Net');

    // Data rows (skip header rows)
    for (let i = 0; i < values.length; i++) {
      if (!values[i][QB_COLS.TYPE]) continue;

      const row = table.appendTableRow();
      row.appendTableCell(values[i][QB_COLS.TYPE] || '');
      row.appendTableCell(values[i][QB_COLS.SECTION_NAME] || '');
      row.appendTableCell(values[i][QB_COLS.ITEM_CODE] || '');
      row.appendTableCell(values[i][QB_COLS.DESCRIPTION] || '');
      row.appendTableCell(values[i][QB_COLS.QTY] ? values[i][QB_COLS.QTY].toString() : '');
      row.appendTableCell(values[i][QB_COLS.UNIT_RATE] ? values[i][QB_COLS.UNIT_RATE].toString() : '');
      row.appendTableCell(values[i][QB_COLS.ROW_NET] ? values[i][QB_COLS.ROW_NET].toFixed(2) : '');
    }

    // Add totals
    const totals = calculateQuoteTotals(values);
    body.appendParagraph(''); // Spacer
    body.appendParagraph('Total Client Amount: ' + formatCurrencyForDoc(totals.totalClientAmount)).setBold(true);
    body.appendParagraph('Total Internal Cost: ' + formatCurrencyForDoc(totals.totalInternalCost));
    body.appendParagraph('Margin: ' + formatCurrencyForDoc(totals.margin));

    // Save and show URL
    doc.saveAndClose();
    const docUrl = doc.getUrl();

    try {
      UnifiedLogger.info(DOC_LOG_CATEGORY, 'internalDocument', {
        docUrl: docUrl,
        docName: docName,
        totals: totals
      });
    } catch (ignore) {
      console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
    }

      ui.alert('Internal Document Created', 'Internal quote document created:\n\n' + docUrl, ui.ButtonSet.OK);
      showSuccessToast('Internal document generated');

      trace.complete('generateInternalView completed', { docName: docName, totalClientAmount: totals.totalClientAmount });

    } catch (error) {
      try { UnifiedLogger.error(DOC_LOG_CATEGORY, 'Error generating internal view', String(error)); } catch (ignore) {
        console.error('[DocGenerator] Error:', ignore.message, ignore.stack);
      }
      trace.fail('generateInternalView inner operation failed', error);
      throw error;
    }
  } catch (error) {
    trace.fail('generateInternalView failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Generating internal quote document',
      correlationId: trace.correlationId
    });
    showErrorToast('Internal Document Generation Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Log quote generation event
 * @param {Object} data - Quote generation data
 */
function logQuoteGeneration(data) {
  const trace = UnifiedLogger.startTrace('DocGenerator', 'logQuoteGeneration');
  try {
    UnifiedLogger.logEvent(DOC_LOG_CATEGORY, 'Quote generated', 'INFO', {
      docUrl: data && data.docUrl,
      totalAmount: data && data.totalAmount,
      itemCount: data && data.itemCount,
      user: (function() { try { return Session.getActiveUser().getEmail(); } catch (ignore) { return 'system'; } })()
    });
    const ss = getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('Quote_Log');

    // Create log sheet if it doesn't exist
    if (!logSheet) {
      logSheet = ss.insertSheet('Quote_Log');
      logSheet.hideSheet();

      // Add headers
      logSheet.appendRow([
        'Timestamp',
        'User',
        'Document URL',
        'Total Amount',
        'Item Count',
        'Status'
      ]);
    }

    const timestamp = new Date();
    const user = Session.getActiveUser().getEmail();

    logSheet.appendRow([
      timestamp,
      user,
      data.docUrl || '',
      data.totalAmount || 0,
      data.itemCount || 0,
      'Generated'
    ]);

    trace.complete('logQuoteGeneration completed', { docUrl: data.docUrl, totalAmount: data.totalAmount });

  } catch (error) {
    UnifiedLogger.error(DOC_LOG_CATEGORY, 'Error logging quote generation', error);
    trace.fail('logQuoteGeneration failed', error);
    // Don't throw - logging failures shouldn't break document generation
  }
}

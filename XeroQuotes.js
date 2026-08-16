/**
 * hrmny Quote Builder - Xero Quotes API
 * Create and manage quotes in Xero
 */

const XERO_QUOTES_LOG_CATEGORY = 'XeroQuotes';

/**
 * Export quote to Xero
 * Main function called from menu
 */
function exportToXero() {
  // Add correlation ID tracing
  const trace = UnifiedLogger.startTrace('XeroQuotes', 'exportToXero');

  if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
    SpreadsheetApp.getUi().alert('Quote_Builder headers modified; export skipped.');
    trace.complete('Export skipped - schema not trusted');
    return;
  }
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSnapshot = null; // Config loaded via ConfigurationManager on-demand
  const trackingConfigRaw = getScriptProperty('XERO_VISIBILITY_TRACKING');
  const trackingConfig = trackingConfigRaw ? JSON.parse(trackingConfigRaw) : null;
  const quoteSheet = getQuoteBuilderSheet();
  const lastRow = quoteSheet.getLastRow();
  const lastColumn = quoteSheet.getLastColumn();
  const rowCount = Math.max(0, lastRow - 2);
  const quoteValues = rowCount > 0 ? quoteSheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];

  trace.info('Starting quote export', { rows: quoteValues.length });
  UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'exportToXero start', {
    timestamp: new Date().toISOString(),
    rows: quoteValues.length - 2
  });

  try {
    ensureXeroSyncReadiness_({ xeroReadySheet: ss ? ss.getSheetByName(SHEET_NAMES.XERO_READY) : null });
  } catch (preflightError) {
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'xeroPreflightFailed', preflightError);
    ui.alert(
      'Xero Not Ready',
      (preflightError && preflightError.message) ? preflightError.message : 'Xero preflight failed. Re-authorize and run Normalize Data/Vector Sync before exporting.',
      ui.ButtonSet.OK
    );
    return;
  }
  // Validate quote
  const validation = performQuoteValidation(quoteValues);
  UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'performQuoteValidation', {
    valid: validation.valid,
    errors: validation.errors && validation.errors.slice(0, 5)
  });
  if (!validation.valid) {
    ui.alert(
      'Validation Failed',
      'Please fix the following errors before exporting:\n\n' + validation.errors.slice(0, 5).join('\n'),
      ui.ButtonSet.OK
    );
    return;
  }

  try {
    // Check for existing Quote ID in Config to offer update
    let existingQuoteId = null;
    let updateMode = false;
    try {
      existingQuoteId = ConfigurationManager.get('properties.xero.quoteId');
    } catch (configError) {
      // XERO_QUOTE_ID not configured - will create new quote
    }

    if (existingQuoteId) {
      const response = ui.alert(
        'Existing Quote Detected',
        'This sheet is linked to Xero Quote ' + existingQuoteId + '.\n\nUpdate the existing quote? (No = Create New)',
        ui.ButtonSet.YES_NO_CANCEL
      );
      if (response === ui.Button.CANCEL) return;
      if (response === ui.Button.YES) updateMode = true;
    }

    // Get contact info from caller (expects pre-collected contactData)
    if (!contactData || !contactData.name) {
      throw new AppError('XERO_CONTACT_ERROR', 'Missing contact details');
    }

    // Get or create contact
    const contact = getOrCreateContact(contactData);
    UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'getOrCreateContact', {
      contactId: contact && contact.ContactID,
      contactName: contact && contact.Name
    });

    if (!contact || !contact.ContactID) {
      throw new AppError('XERO_CONTACT_ERROR', 'Failed to get or create contact');
    }

    const validAccounts = getValidAccountCodes_();

    const itemCodes = new Set();
    for (let i = 0; i < quoteValues.length; i++) {
      const row = quoteValues[i];
      const type = row[QB_COLS.TYPE];
      const itemCode = row[QB_COLS.ITEM_CODE];
      if (type === ROW_TYPES.LINE && itemCode) {
        itemCodes.add(itemCode);
      }
    }

    let inventoryMap = {};
    try {
      if (typeof batchCreateItems === 'function') {
        const inventoryResult = batchCreateItems(Array.from(itemCodes).map(function(code) {
          return { itemCode: code, name: code, description: code, unitPrice: 0 };
        }));
        if (inventoryResult && inventoryResult.itemIdMap) {
          inventoryResult.itemIdMap.forEach(function(itemId, code) {
            inventoryMap[code] = itemId;
          });
        }
      }
    } catch (inventoryError) {
      UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'Preflight inventory sync failed', String(inventoryError));
    }

    const quoteData = buildXeroQuote(contact.ContactID, quoteValues, inventoryMap, configSnapshot, trackingConfig, validAccounts);
    UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'buildXeroQuotePayload', {
      totalLineItems: quoteData.LineItems ? quoteData.LineItems.length : 0,
      total: quoteData.Total
    });

    // Create or Update quote in Xero
    let xeroQuote;
    if (updateMode && existingQuoteId) {
      xeroQuote = updateXeroQuote(existingQuoteId, quoteData);
      UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'updateXeroQuote', {
        quoteId: xeroQuote && xeroQuote.QuoteID,
        status: xeroQuote && xeroQuote.Status,
        total: xeroQuote && xeroQuote.Total
      });
    } else {
      xeroQuote = createXeroQuote(quoteData);
      UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'createXeroQuote', {
        quoteId: xeroQuote && xeroQuote.QuoteID,
        status: xeroQuote && xeroQuote.Status,
        total: xeroQuote && xeroQuote.Total
      });
    }

    // Show success
    const quoteUrl = xeroQuote.Href || ('https://go.xero.com/app/quotes/' + xeroQuote.QuoteID);

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
      if (configSheet) {
        writeConfigValue(configSheet, 'QUOTE_NUMBER', xeroQuote.QuoteNumber);
        writeConfigValue(configSheet, 'XERO_QUOTE_ID', xeroQuote.QuoteID);
        writeConfigValue(configSheet, 'XERO_QUOTE_URL', quoteUrl);
        writeConfigValue(configSheet, 'QUOTE_STATUS', xeroQuote.Status);
      }
    } catch (configError) {
      UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'configWriteFailed', String(configError));
    }

    ui.alert(
      'Quote Exported',
      'Quote successfully created in Xero!\n\n' +
      'Quote Number: ' + xeroQuote.QuoteNumber + '\n' +
      'Contact: ' + contact.Name + '\n' +
      'Total: AED ' + quoteData.Total.toFixed(2) + '\n\n' +
      'View in Xero: ' + quoteUrl,
      ui.ButtonSet.OK
    );

    showSuccessToast('Quote exported to Xero');

    // Log the export
    logQuoteGeneration({
      xeroQuoteId: xeroQuote.QuoteID,
      xeroQuoteNumber: xeroQuote.QuoteNumber,
      contactName: contact.Name,
      totalAmount: quoteData.Total
    });

    UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'exportToXero complete', {
      xeroQuoteNumber: xeroQuote.QuoteNumber,
      contactId: contact.ContactID,
      totalAmount: quoteData.Total
    });

  } catch (error) {
    trace.fail('Quote export to Xero failed', error);
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'Error exporting to Xero', error);

    // User-friendly error handling
    showFriendlyError(
      error,
      'Exporting Quote to Xero',
      {
        correlationId: trace.correlationId,
        retryCallback: function() {
          return exportToXero();
        }
      }
    );
  }
}

function validateAccountCode_(code, validAccounts) {
  if (!code) {
    return '200';
  }
  const cleanCode = String(code).trim();
  if (validAccounts && validAccounts.length > 0) {
    const exists = validAccounts.some(function(account) {
      return account && account.Code === cleanCode;
    });
    if (!exists) {
      UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'validateAccountCode_ not found; defaulting to 200', { accountCode: cleanCode });
      return '200';
    }
  }
  return cleanCode;
}

function getValidAccountCodes_() {
  try {
    const response = callXeroAPI('/Accounts', 'GET');
    return response.Accounts || [];
  } catch (e) {
    UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'getValidAccountCodes_ failed', String(e));
    return [];
  }
}

/**
 * Build Xero quote structure from Quote_Builder data
 * @param {string} contactId - Xero contact ID
 * @param {Array<Array>} values - Quote_Builder grid values
 * @param {Object} configSnapshot - Cached config values
 * @param {Object|null} trackingConfig - Parsed tracking config
 * @param {Array} validAccounts - Cached account codes
 * @return {Object} Xero quote object
 */
function buildXeroQuote(contactId, values, inventoryMap, configSnapshot, trackingConfig, validAccounts) {
  const resolvedValues = Array.isArray(values) ? values : [];

  // Load config values from ConfigurationManager
  const vatConfig = ConfigurationManager.get('properties.vat.percent', 0);
  const vatPercent = vatConfig !== undefined && vatConfig !== null && vatConfig !== ''
    ? Number(vatConfig)
    : 0;
  const normalizedVat = isNaN(vatPercent) ? 0 : vatPercent;
  const safeVatPercent = normalizedVat > 1 ? normalizedVat / 100 : normalizedVat;
  const accountCode = ConfigurationManager.get('properties.xero.accountCodeDefault', '200');
  const configTaxType = ConfigurationManager.get('properties.xero.taxType', '');
  const taxType = configTaxType && configTaxType.trim() !== '' ? configTaxType.trim() : null;
  const trackingCategoryId = trackingConfig && trackingConfig.trackingCategoryId;
  const accounts = validAccounts || getValidAccountCodes_();
  const paymentTerms = ConfigurationManager.get('properties.payment.terms', 'Net 30');

  const lineItems = [];
  let subtotalAmount = 0;

  let lineItemsCount = 0;
  let sectionItemsCount = 0;
  let feeItemsCount = 0;
  let customItemsCreated = 0;

  for (let i = 0; i < resolvedValues.length; i++) {
    try {
      const type = resolvedValues[i][QB_COLS.TYPE];
      const visibility = resolvedValues[i][QB_COLS.VISIBILITY];
      const clientAmount = resolvedValues[i][QB_COLS.CLIENT_AMOUNT];
      const hasClientAmount = clientAmount !== undefined && clientAmount !== null && clientAmount !== '';
      const clientAmountNumber = hasClientAmount ? Number(clientAmount) : null;
      const sectionName = resolvedValues[i][QB_COLS.SECTION_NAME];
      const rawDescription = resolvedValues[i][QB_COLS.DESCRIPTION];
      const preserveHtml = shouldPreserveHtmlSnippet(rawDescription);
      const description = rawDescription || '';
      const clientLineName = resolvedValues[i][QB_COLS.CLIENT_LINE_NAME];
      const qtyRaw = resolvedValues[i][QB_COLS.QTY];
      const qtyNumber = qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== '' ? Number(qtyRaw) : NaN;
      const qty = isNaN(qtyNumber) || qtyNumber <= 0 ? 1 : qtyNumber;
      const unitRate = resolvedValues[i][QB_COLS.UNIT_RATE];
      const unitValue = resolvedValues[i][QB_COLS.UNIT];
      let itemCode = resolvedValues[i][QB_COLS.ITEM_CODE];

      if (visibility === VISIBILITY.HIDDEN) {
        continue;
      }

      if (type === ROW_TYPES.LINE) {
        if (!itemCode) {
          try {
            if (typeof findItemCode === 'function') {
              const matchedItem = findItemCode(description, sectionName, clientLineName);
              if (matchedItem && matchedItem.ItemCode) {
                itemCode = matchedItem.ItemCode;
              }
            }
          } catch (error) {
            UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'Error finding ItemCode', {
              row: i + 3,
              error: String(error)
            });
          }
        }

        if (!itemCode && typeof generateCustomItemCode === 'function' && typeof getCategoryFromSection === 'function') {
          try {
            const item = {
              description: description,
              sectionName: sectionName,
              clientLineName: clientLineName,
              unitRate: unitRate
            };
            const category = getCategoryFromSection(sectionName);
            itemCode = generateCustomItemCode(item, category);
          } catch (error) {
            UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'Error generating custom ItemCode', {
              row: i + 3,
              error: String(error)
            });
          }
        }

        const descriptionBase = clientLineName || description;
        let sanitizedDescription;
        if (preserveHtml) {
          sanitizedDescription = stripHtmlForExport(rawDescription);
        } else if (visibility === VISIBILITY.INTERNAL) {
          sanitizedDescription = buildInternalLineSnippet({
            description: description,
            clientLineName: clientLineName,
            qty: qty,
            unit: unitValue
          });
        } else {
          sanitizedDescription = stripInternalMarker(descriptionBase);
        }
        const unitRateNumberRaw = unitRate !== undefined && unitRate !== null && unitRate !== '' ? Number(unitRate) : 0;
        const unitRateNumber = isNaN(unitRateNumberRaw) ? 0 : unitRateNumberRaw;
        const hasClientPrice = clientAmountNumber !== null && !isNaN(clientAmountNumber);
        const priceSubtotal = hasClientPrice ? clientAmountNumber : unitRateNumber * qty;
        const unitAmountForXero = hasClientPrice ? (qty > 0 ? (clientAmountNumber / qty) : clientAmountNumber) : unitRateNumber;
        const lineItem = {
          Description: sanitizedDescription.toString().substring(0, 4000),
          Quantity: qty,
          UnitAmount: isNaN(unitAmountForXero) ? 0 : unitAmountForXero,
          AccountCode: validateAccountCode_(accountCode, accounts)
        };

        if (taxType) {
          lineItem.TaxType = taxType;
        }

        if (itemCode && inventoryMap && inventoryMap[itemCode]) {
          lineItem.ItemCode = itemCode;
          lineItem.ItemID = inventoryMap[itemCode];
        }

        (function attachTrackingForLine() {
          let trackingOptionId = null;
          if (trackingConfig && trackingConfig.options && visibility && trackingConfig.options[visibility]) {
            trackingOptionId = trackingConfig.options[visibility].trackingOptionId;
          }
          lineItem.Tracking = [{
            TrackingCategoryID: trackingCategoryId,
            TrackingOptionID: trackingOptionId,
            Name: 'Visibility',
            Option: visibility || VISIBILITY.CLIENT
          }];
        })();

        lineItems.push(lineItem);
        subtotalAmount += isNaN(priceSubtotal) ? 0 : priceSubtotal;
        lineItemsCount++;
      } else if (type === ROW_TYPES.SECTION) {
        const formattedAmount = typeof QuoteUtils !== 'undefined' && QuoteUtils.formatCurrency
          ? QuoteUtils.formatCurrency(clientAmount || 0).replace(' AED', '')
          : (clientAmount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        let sectionDescription;
        if (description) {
          const baseText = stripInternalMarker(description);
          sectionDescription = visibility === VISIBILITY.INTERNAL
            ? annotateInternalLabel(baseText)
            : baseText;
        } else {
          const sectionLabelBase = clientLineName || sectionName || '';
          const sanitizedSectionLabel = visibility === VISIBILITY.INTERNAL
            ? annotateInternalLabel(stripInternalMarker(sectionLabelBase))
            : stripInternalMarker(sectionLabelBase);
          sectionDescription = sanitizedSectionLabel
            ? sanitizedSectionLabel + ': ' + formattedAmount + ' AED'
            : formattedAmount + ' AED';
        }

        const sectionLineItem = {
          Description: sectionDescription.substring(0, 4000),
          Quantity: 1,
          UnitAmount: 0,
          AccountCode: validateAccountCode_(accountCode, accounts)
        };
        if (taxType) {
          sectionLineItem.TaxType = taxType;
        }
        (function attachTrackingForSection() {
          let trackingOptionId = null;
          if (trackingConfig && trackingConfig.options && visibility && trackingConfig.options[visibility]) {
            trackingOptionId = trackingConfig.options[visibility].trackingOptionId;
          }
          sectionLineItem.Tracking = [{
            TrackingCategoryID: trackingCategoryId,
            TrackingOptionID: trackingOptionId,
            Name: 'Visibility',
            Option: visibility || VISIBILITY.CLIENT
          }];
        })();
        lineItems.push(sectionLineItem);
        sectionItemsCount++;
      } else if (type === ROW_TYPES.FEE) {
        const feeDescriptionBase = clientLineName || description;
        const sanitizedFeeDescription = visibility === VISIBILITY.INTERNAL
          ? annotateInternalLabel(stripInternalMarker(feeDescriptionBase))
          : stripInternalMarker(feeDescriptionBase);
        const feeAmountNumberRaw = clientAmount !== undefined && clientAmount !== null && clientAmount !== '' ? Number(clientAmount) : unitRate;
        const feeAmountNumber = feeAmountNumberRaw !== undefined && !isNaN(feeAmountNumberRaw) ? Number(feeAmountNumberRaw) : 0;
        const feeLineItem = {
          Description: sanitizedFeeDescription.toString().substring(0, 4000),
          Quantity: 1,
          UnitAmount: feeAmountNumber,
          AccountCode: validateAccountCode_(accountCode, accounts)
        };
        if (taxType) {
          feeLineItem.TaxType = taxType;
        }
        (function attachTrackingForFee() {
          let trackingOptionId = null;
          if (trackingConfig && trackingConfig.options && visibility && trackingConfig.options[visibility]) {
            trackingOptionId = trackingConfig.options[visibility].trackingOptionId;
          }
          feeLineItem.Tracking = [{
            TrackingCategoryID: trackingCategoryId,
            TrackingOptionID: trackingOptionId,
            Name: 'Visibility',
            Option: visibility || VISIBILITY.CLIENT
          }];
        })();
        lineItems.push(feeLineItem);
        subtotalAmount += isNaN(feeAmountNumber) ? 0 : feeAmountNumber;
        feeItemsCount++;
      }

    } catch (error) {
      UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'Error processing row', {
        row: i + 3,
        error: String(error)
      });
    }
  }

  UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'buildXeroQuoteStats', {
    lineItems: lineItemsCount,
    sectionItems: sectionItemsCount,
    feeItems: feeItemsCount,
    customItemsCreated: customItemsCreated,
    totalLineItems: lineItems.length
  });

  if (lineItems.length === 0) {
    throw new AppError('XERO_QUOTE_ERROR', 'No items found to export');
  }

  const subtotal = subtotalAmount;
  const taxAmount = subtotal * safeVatPercent;
  const total = subtotal + taxAmount;

  const quote = {
    Contact: {
      ContactID: contactId
    },
    Date: new Date().toISOString().split('T')[0],
    ExpiryDate: calculateDueDate(30),
    Reference: 'HRMNY-' + new Date().getTime(),
    LineItems: lineItems,
    LineAmountTypes: 'Exclusive',
    Status: 'DRAFT',
    SubTotal: subtotal,
    TotalTax: taxAmount,
    Total: total,
    CurrencyCode: 'AED',
    Terms: paymentTerms
  };

  UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'buildXeroQuote complete', {
    lineItems: quote.LineItems.length,
    total: quote.Total,
    subtotal: quote.SubTotal
  });

  return quote;
}

/**
 * Create quote in Xero
 * @param {Object} quoteData - Quote data
 * @return {Object} Created quote
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function createXeroQuote(quoteData) {
  const trace = UnifiedLogger.startTrace('XeroQuotes', 'createXeroQuote');
  try {
  const payload = {
    Quotes: [quoteData]
  };

  try {
    UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'Xero quote payload', payload);
    const response = callXeroAPI('/Quotes', 'PUT', payload);

    if (response.Quotes && response.Quotes.length > 0) {
      const quote = response.Quotes[0];
      UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'Quote created', { quoteId: quote.QuoteID, quoteNumber: quote.QuoteNumber });
      
  trace.complete('createXeroQuote complete');
  return quote;
    }

    throw new AppError('XERO_QUOTE_ERROR', 'No quote returned from Xero');

  } catch (error) {
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'Error creating quote', error);
    throw error;
  }
  } catch (error) {
    trace.fail('createXeroQuote failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'createXeroQuote',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    return { ok: false, error: String(error) };
  }
}
function calculateDueDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * List Xero tax rates and codes in the execution log.
 */
function listXeroTaxTypes() {
  try {
    const response = callXeroAPI('/TaxRates', 'GET');

    if (response && response.TaxRates) {
      UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'Available Xero tax rates', response.TaxRates);
    } else {
      UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'No tax rates returned from Xero');
    }
  } catch (error) {
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'Error retrieving tax types', error);
    throw error;
  }
}

/**
 * Show Xero tax types in a dialog for quick reference.
 */
function showXeroTaxTypesDialog() {
  try {
    const response = callXeroAPI('/TaxRates', 'GET');
    if (!response || !response.TaxRates || response.TaxRates.length === 0) {
      SpreadsheetApp.getUi().alert('No tax rates returned from Xero');
      return;
    }

    const rows = response.TaxRates.map(rate => ({
      name: rate.Name || 'Unnamed',
      taxType: rate.TaxType || 'Unknown',
      rate: rate.DisplayTaxRate !== undefined ? rate.DisplayTaxRate : 'N/A'
    }));

    let html = '<div style="font-family: Arial, sans-serif; padding: 20px; width:420px;">';
    html += '<h2 style="margin-top:0;">Xero Tax Rates</h2>';
    html += '<table style="border-collapse: collapse; width: 100%;">';
    html += '<tr style="background:#f5f5f5;"><th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">Name</th>' +
            '<th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">Tax Type</th>' +
            '<th style="text-align:right; padding:6px; border-bottom:1px solid #ddd;">Rate (%)</th></tr>';

    rows.forEach(row => {
      html += `<tr>` +
              `<td style="padding:6px; border-bottom:1px solid #eee;">${row.name}</td>` +
              `<td style="padding:6px; border-bottom:1px solid #eee;">${row.taxType}</td>` +
              `<td style="padding:6px; border-bottom:1px solid #eee; text-align:right;">${row.rate}</td>` +
              `</tr>`;
    });

    html += '</table>';
    html += '<p style="margin-top:12px; font-size:12px; color:#555;">Use the Tax Type value in Config → XERO_TAX_TYPE.</p>';
    html += '</div>';

    const dialog = HtmlService.createHtmlOutput(html)
      .setWidth(480)
      .setHeight(420);

    SpreadsheetApp.getUi().showModalDialog(dialog, 'Available Xero Tax Rates');
  } catch (error) {
    SpreadsheetApp.getUi().alert('Failed to fetch tax rates: ' + error);
  }
}

/**
 * Get quote from Xero
 * @param {string} quoteId - Xero quote ID
 * @return {Object|null} Quote object
 */
function getXeroQuote(quoteId) {
  try {
    const response = callXeroAPI('/Quotes/' + quoteId, 'GET');

    if (response.Quotes && response.Quotes.length > 0) {
      return response.Quotes[0];
    }

    return null;

  } catch (error) {
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'Error getting quote', error);
    return null;
  }
}

/**
 * Update an existing quote in Xero
 * @param {string} quoteId - Xero quote ID
 * @param {Object} updates - Fields to update
 * @return {Object} Updated quote
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function updateXeroQuote(quoteId, updates) {
  const trace = UnifiedLogger.startTrace('XeroQuotes', 'updateXeroQuote');
  try {
  try {
    // Add QuoteID to the updates
    updates.QuoteID = quoteId;

    const payload = {
      Quotes: [updates]
    };

    const response = callXeroAPI('/Quotes/' + quoteId, 'POST', payload);

    if (response.Quotes && response.Quotes.length > 0) {
      const quote = response.Quotes[0];
      UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'Quote updated', { quoteId: quote.QuoteID, quoteNumber: quote.QuoteNumber });
      
  trace.complete('updateXeroQuote complete');
  return quote;
    }

    throw new AppError('XERO_QUOTE_ERROR', 'No quote returned from Xero');

  } catch (error) {
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'Error updating quote', error);
    throw error;
  }
  } catch (error) {
    trace.fail('updateXeroQuote failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'updateXeroQuote',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    return { ok: false, error: String(error) };
  }
}

/**
 * List quotes from Xero
 * @param {number} limit - Max number to return
 * @return {Array} Array of quotes
 */
function listXeroQuotes(limit) {
  limit = limit || 100;

  try {
    const response = callXeroAPI('/Quotes?page=1', 'GET');

    if (response.Quotes) {
      return response.Quotes.slice(0, limit);
    }

    return [];

  } catch (error) {
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'Error listing quotes', error);
    return [];
  }
}

/**
 * Convert quote to invoice in Xero
 * @param {string} quoteId - Xero quote ID
 * @return {Object} Created invoice
 */
function convertQuoteToInvoice(quoteId) {
  try {
    // Get the quote
    const quote = getXeroQuote(quoteId);

    if (!quote) {
      throw new AppError('XERO_QUOTE_ERROR', 'Quote not found: ' + quoteId);
    }

    // Create invoice from quote
    const invoiceData = {
      Type: quote.Type,
      Contact: quote.Contact,
      Date: new Date().toISOString().split('T')[0],
      DueDate: calculateDueDate(30),
      LineItems: quote.LineItems,
      LineAmountTypes: quote.LineAmountTypes,
      CurrencyCode: quote.CurrencyCode,
      Reference: quote.Reference,
      Status: 'DRAFT'
    };

    const payload = {
      Invoices: [invoiceData]
    };

    const response = callXeroAPI('/Invoices', 'PUT', payload);

    if (response.Invoices && response.Invoices.length > 0) {
      const invoice = response.Invoices[0];
      UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'Invoice created from quote', { invoiceId: invoice.InvoiceID });
      return invoice;
    }

    throw new AppError('XERO_INVOICE_ERROR', 'No invoice returned from Xero');

  } catch (error) {
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'Error converting quote to invoice', error);
    throw error;
  }
}

/**
 * Update quote status
 * @param {string} quoteId - Xero quote ID
 * @param {string} status - New status (DRAFT, SENT, ACCEPTED, DECLINED, INVOICED)
 */
function updateQuoteStatus(quoteId, status) {
  try {
    // Validate parameters
    if (!quoteId || quoteId === 'undefined') {
      throw new AppError('VALIDATION_ERROR', 'Quote ID is required but got: ' + quoteId);
    }

    const validStatuses = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'INVOICED'];

    if (!status) {
      throw new AppError('VALIDATION_ERROR', 'Status is required');
    }

    if (!validStatuses.includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid status "' + status + '". Must be one of: ' + validStatuses.join(', '));
    }

    UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'Updating quote status', {
      quoteId: quoteId,
      status: status
    });

    const payload = {
      Quotes: [{
        QuoteID: quoteId,
        Status: status
      }]
    };

    const response = callXeroAPI('/Quotes/' + quoteId, 'POST', payload);

    if (response.Quotes && response.Quotes.length > 0) {
      UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'Quote status updated', { quoteId: quoteId, status: status });
      return response.Quotes[0];
    }

    throw new AppError('XERO_QUOTE_ERROR', 'Failed to update quote status');

  } catch (error) {
    UnifiedLogger.error(XERO_QUOTES_LOG_CATEGORY, 'Error updating quote status', error);
    throw error;
  }
}

function stripHtmlForExport(text) {
  if (!text) {
    return '';
  }
  let output = String(text);
  output = output.replace(/<\s*br\s*\/?>/gi, '\n');
  output = output.replace(/<\s*\/p\s*>/gi, '\n');
  output = output.replace(/<\s*p\s*>/gi, '\n');
  output = output.replace(/<\s*li\s*>/gi, '- ');
  output = output.replace(/<\s*\/li\s*>/gi, '\n');
  output = output.replace(/<[^>]+>/g, '');
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': '\'',
    '&#x27;': '\'',
    '&#x2F;': '/'
  };
  Object.keys(entities).forEach(function(entity) {
    const replacement = entities[entity];
    output = output.replace(new RegExp(entity, 'g'), replacement);
  });
  return output.replace(/\r\n|\r/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function shouldPreserveHtmlSnippet(rawDescription) {
  if (!rawDescription) {
    return false;
  }
  const value = String(rawDescription);
  return value.indexOf('qb-section-summary') !== -1 ||
    value.indexOf('qb-internal-line') !== -1 ||
    value.indexOf('qb-hidden-in-xero') !== -1;
}

function buildInternalLineSnippet(line) {
  const labelBase = stripInternalMarker(line.clientLineName || line.description || 'Line Item');
  const qtyNumber = Number(line.qty);
  const hasQty = !isNaN(qtyNumber) && qtyNumber !== null;
  const qtyText = hasQty ? qtyNumber : null;
  const unitText = line.unit ? String(line.unit).trim() : '';
  const label = stripHtmlForExport(labelBase) || 'Line Item';
  const unit = stripHtmlForExport(unitText);
  const parts = ['[Internal]'];
  if (qtyText !== null) {
    parts.push(qtyText + ' x – ' + label);
  } else {
    parts.push(label);
  }
  if (unit) {
    const unitDisplay = (hasQty ? qtyNumber : 1) + ' ' + unit;
    parts.push('(' + unitDisplay + ')');
  }
  return parts.join(' ').trim();
}

/**
 * Ensure Xero export/sync operations only run when auth and data are healthy.
 * Validates auth, tenant, normalization integrity, and vector staleness.
 * @throws {AppError} when readiness checks fail
 */
function ensureXeroSyncReadiness_(context) {
  const readinessContext = context || {};
  UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'ensureXeroSyncReadiness start', {
    timestamp: new Date().toISOString()
  });

  const integrationHealth = (typeof ensureXeroIntegrationReady_ === 'function')
    ? ensureXeroIntegrationReady_({ operation: 'export', allowNetworkProbe: true, surfaceToast: true })
    : null;
  const health = typeof getXeroHealthStatus === 'function'
    ? getXeroHealthStatus()
    : { connected: isXeroAuthorized(), message: isXeroAuthorized() ? 'Connected' : 'Not authorized' };
  if (!health || !health.connected) {
    throw new AppError('XERO_AUTH_ERROR', health && health.message ? health.message : 'Xero is not authorized. Run Menu → Xero → Authorize Xero.');
  }
  if (integrationHealth && integrationHealth.backoff && integrationHealth.backoff.active) {
    throw new AppError('XERO_BACKOFF_ACTIVE', 'Xero export paused due to repeated errors. Backoff until ' + new Date(integrationHealth.backoff.until).toLocaleString());
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new AppError('CONFIG_ERROR', 'No active spreadsheet available for Xero export.');
  }

  const xeroReadyName = SHEET_NAMES && SHEET_NAMES.XERO_READY ? SHEET_NAMES.XERO_READY : 'XERO_READY';
  const xeroReadySheet = readinessContext.xeroReadySheet || ss.getSheetByName(xeroReadyName);
  if (!xeroReadySheet || xeroReadySheet.getLastRow() < 2) {
    throw new AppError('XERO_READY_STALE', 'XERO_READY is empty. Run Normalize Data before exporting to Xero.');
  }

  let storedHash = '';
  let storedRows = 0;
  try {
    storedHash = readinessContext.storedHash || getScriptProperty('XERO_READY_HASH') || '';
    storedRows = readinessContext.storedRows || Number(getScriptProperty('XERO_READY_ROW_COUNT')) || 0;
  } catch (propError) {
    UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'xeroReadyPropReadFailed', String(propError));
  }

  const currentRows = xeroReadySheet.getLastRow() - 1;
  if (!storedHash || !storedRows) {
    throw new AppError('XERO_READY_STALE', 'Normalization integrity markers are missing. Run Normalize Data before exporting to Xero.');
  }
  if (storedRows !== currentRows) {
    throw new AppError('XERO_READY_STALE', 'XERO_READY row count changed. Re-run Normalize Data before exporting to Xero.');
  }

  if (typeof computeHash_ === 'function') {
    try {
      const values = xeroReadySheet.getRange(2, 1, currentRows, Math.min(xeroReadySheet.getLastColumn(), 12)).getValues();
      const currentHash = computeHash_(values);
      if (currentHash && storedHash && currentHash !== storedHash) {
        throw new AppError('XERO_READY_STALE', 'XERO_READY data changed since last normalization. Please normalize again before exporting.');
      }
    } catch (hashError) {
      if (hashError && hashError.message && hashError.code) {
        throw hashError;
      }
      UnifiedLogger.warn(XERO_QUOTES_LOG_CATEGORY, 'xeroReadyHashCheckFailed', String(hashError));
    }
  }

  if (typeof getVectorStoreSyncStatus === 'function') {
    const vectorStatus = getVectorStoreSyncStatus();
    if (vectorStatus && vectorStatus.stale) {
      throw new AppError('VECTOR_STORE_STALE', 'Vector store is stale. Run Data Ops → Sync Vector Store before exporting to Xero.');
    }
  }

  if (typeof getVectorIntegrationHealth === 'function') {
    const vectorHealth = getVectorIntegrationHealth({ allowNetworkProbe: false });
    if (vectorHealth.sync && vectorHealth.sync.active) {
      throw new AppError('VECTOR_BACKOFF_ACTIVE', 'Vector sync backoff active until ' + new Date(vectorHealth.sync.until).toLocaleString() + '. Resolve errors before exporting.');
    }
    if (!vectorHealth.ok && vectorHealth.missingProps && vectorHealth.missingProps.length) {
      throw new AppError('VECTOR_CONFIG_MISSING', 'Vector configuration missing: ' + vectorHealth.missingProps.join(', '));
    }
  }

  UnifiedLogger.info(XERO_QUOTES_LOG_CATEGORY, 'ensureXeroSyncReadiness complete', {
    ready: true,
    rows: currentRows,
    hash: storedHash
  });
}

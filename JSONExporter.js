/**
 * hrmny Quote Builder - JSON Exporter
 * Export quote data as structured JSON
 */

const JSON_EXPORT_LOG_CATEGORY = 'JSONExporter';

/**
 * Export quote to JSON format
 * Accessible via menu or direct call
 */
function exportToJSON(options) {
  options = options || {};
  const skipDialog = options && options.silent === true;
  const sheet = getQuoteBuilderSheet();
  let ui = null;
  if (!skipDialog) {
    try {
      ui = SpreadsheetApp.getUi();
    } catch (uiError) {
      try {
        UnifiedLogger.warn(JSON_EXPORT_LOG_CATEGORY, 'exportToJSON: UI unavailable, continuing without dialog', String(uiError));
      } catch (ignore) {
        // Silent fail
      }
      ui = null;
    }
  }

  try {
    try {
      UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'exportToJSON start', { skipDialog: skipDialog, spreadsheet: sheet ? sheet.getName() : 'unknown' });
    } catch (ignore) {
      // Silent fail
    }
    const quoteData = buildQuoteJSON();
    const jsonString = JSON.stringify(quoteData, null, 2);

    if (!skipDialog && ui) {
      const dialog = buildSafeJsonDialog_(jsonString);
      ui.showModalDialog(dialog, 'Quote JSON Export');
      showSuccessToast('Quote exported to JSON');
    }

    try {
      UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'exportToJSON complete', {
        payloadSize: jsonString ? jsonString.length : 0,
        lineItems: (quoteData.lineItems || []).length,
        sections: (quoteData.sections || []).length,
        fees: (quoteData.fees || []).length
      });
    } catch (ignore) {
      // Silent fail
    }

    return jsonString;

  } catch (error) {
    try {
      UnifiedLogger.error(JSON_EXPORT_LOG_CATEGORY, 'Error exporting JSON', error);
    } catch (ignore) {
      // Silent fail
    }
    showErrorToast('Failed to export JSON: ' + error.message);
  }
}

/**
 * Build a safe HtmlOutput dialog that base64-encodes the JSON payload.
 * @param {string} jsonString
 * @return {HtmlOutput}
 */
function buildSafeJsonDialog_(jsonString) {
  const payload = typeof jsonString === 'string' ? jsonString : '';
  let encodedPayload = '';
  try {
    encodedPayload = Utilities.base64Encode(payload, Utilities.Charset.UTF_8);
  } catch (encodeError) {
    try {
      UnifiedLogger.warn(JSON_EXPORT_LOG_CATEGORY, 'buildSafeJsonDialog_ base64 encoding failed, using empty payload', String(encodeError));
    } catch (ignore) {
      // Silent fail
    }
    encodedPayload = Utilities.base64Encode('', Utilities.Charset.UTF_8);
  }
  let htmlOutput;
  try {
    htmlOutput = HtmlService.createHtmlOutputFromFile('ui/json_export_dialog');
  } catch (templateError) {
    try {
      UnifiedLogger.warn(JSON_EXPORT_LOG_CATEGORY, 'buildSafeJsonDialog_ template load failed, using fallback HTML', String(templateError));
    } catch (ignore) {
      // Silent fail
    }
    const fallbackHtml = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<base target="_top">',
      '<meta charset="utf-8">',
      '<style>',
      'body{font-family:Arial,sans-serif;margin:16px;color:#202124;}',
      '.toolbar{margin-bottom:12px;text-align:right;}',
      '.toolbar button{background-color:#1a73e8;border:none;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;}',
      '.json-dump{background-color:#f1f3f4;border:1px solid #dadce0;border-radius:4px;padding:12px;font-family:monospace;font-size:12px;max-height:520px;overflow:auto;white-space:pre-wrap;word-break:break-all;}',
      '.status{font-size:12px;color:#5f6368;margin-bottom:12px;text-align:right;}',
      '</style>',
      '<script>',
      '(function(){',
      '\'use strict\';',
      'function decodePayload(encoded){',
      '  if(!encoded){return \'\';}',
      '  try{',
      '    if(typeof TextDecoder===\'function\'){',
      '      var bin=atob(encoded);',
      '      var arr=new Uint8Array(bin.length);',
      '      for(let i=0;i<bin.length;i++){arr[i]=bin.charCodeAt(i);} ',
      '      return new TextDecoder(\'utf-8\').decode(arr);',
      '    }',
      '  }catch(e){',
      '    console.error(\'fallback json dialog decode failed in TextDecoder\', e);',
      '  }',
      '  try{',
      '    var binary=atob(encoded);',
      '    var percent=[];',
      '    for(let j=0;j<binary.length;j++){',
      '      var hex=binary.charCodeAt(j).toString(16);',
      '      if(hex.length<2){hex=\'0\'+hex;}',
      '      percent.push(\'%\'+hex);',
      '    }',
      '    return decodeURIComponent(percent.join(\'\'));',
      '  }catch(err){',
      '    console.error(\'fallback json dialog base64 decode failed\', err);',
      '    return \'\';',
      '  }',
      '}',
      'function populate(){',
      '  var meta=document.querySelector(\'meta[name="data-json"]\');',
      '  var lenMeta=document.querySelector(\'meta[name="data-length"]\');',
      '  var dump=document.getElementById(\'jsonDump\');',
      '  var status=document.getElementById(\'status\');',
      '  if(!dump||!meta){',
      '    if(status){status.textContent=\'Payload unavailable\';}',
      '    return;',
      '  }',
      '  var encoded=meta.getAttribute(\'content\')||\'\';',
      '  var decoded=decodePayload(encoded);',
      '  dump.textContent = decoded || \'(Empty JSON payload)\';',
      '  if(status){',
      '    var lengthValue=lenMeta?lenMeta.getAttribute(\'content\'):\'\';',
      '    if(!lengthValue && decoded){lengthValue=String(decoded.length);}',
      '    status.textContent=lengthValue?lengthValue+\' characters\':\'Ready\';',
      '  }',
      '}',
      'function fallbackCopy(text){',
      '  try{',
      '    var ta=document.createElement(\'textarea\');',
      '    ta.style.position=\'fixed\';',
      '    ta.style.opacity=\'0\';',
      '    ta.value=text;',
      '    document.body.appendChild(ta);',
      '    ta.select();',
      '    document.execCommand(\'copy\');',
      '    document.body.removeChild(ta);',
      '  }catch(err){',
      '    console.error(\'fallback json dialog fallback copy failed\', err);',
      '  }',
      '}',
      'function copyJson(){',
      '  var dump=document.getElementById(\'jsonDump\');',
      '  var status=document.getElementById(\'status\');',
      '  if(!dump){return;}',
      '  var text=dump.textContent||\'\';',
      '  if(!text){',
      '    if(status){status.textContent=\'Nothing to copy\';}',
      '    return;',
      '  }',
      '  if(navigator.clipboard && typeof navigator.clipboard.writeText===\'function\'){',
      '    navigator.clipboard.writeText(text).then(function(){',
      '      if(status){status.textContent=\'Copied to clipboard\';}',
      '    }).catch(function(){',
      '      fallbackCopy(text);',
      '      if(status){status.textContent=\'Copied to clipboard\';}',
      '    });',
      '  }else{',
      '    fallbackCopy(text);',
      '    if(status){status.textContent=\'Copied to clipboard\';}',
      '  }',
      '}',
      'window.copyJsonDialogPayload = copyJson;',
      'document.addEventListener(\'DOMContentLoaded\', populate);',
      '})();',
      '</script>',
      '</head>',
      '<body>',
      '<div class="status" id="status">Loading…</div>',
      '<div class="toolbar"><button type="button" onclick="copyJsonDialogPayload()">Copy JSON</button></div>',
      '<pre id="jsonDump" class="json-dump"></pre>',
      '</body>',
      '</html>'
    ].join('');
    htmlOutput = HtmlService.createHtmlOutput(fallbackHtml);
  }
  htmlOutput.setWidth(820).setHeight(720);
  htmlOutput.addMetaTag('data-json', encodedPayload);
  htmlOutput.addMetaTag('data-length', String(payload.length));
  return htmlOutput;
}

const SCRIPT_SNIPPET_PATTERN = /<script/i;
let capturedPlanScriptSnippets = [];

function capturePlanScriptSnippets(plan) {
  capturedPlanScriptSnippets = collectPlanScriptSnippets(plan);
  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'planScriptSnippetsCaptured', { planId: plan && plan.metadata && plan.metadata.planId, snippets: capturedPlanScriptSnippets ? capturedPlanScriptSnippets.length : 0 });
  } catch (ignore) {
    // Silent fail
  }
}

function collectPlanScriptSnippets(plan) {
  const snippets = new Set();
  const addValue = function(value) {
    if (!value) {
      return;
    }
    const text = String(value);
    if (!text) {
      return;
    }
    if (SCRIPT_SNIPPET_PATTERN.test(text)) {
      snippets.add(text);
    }
  };
  const addArray = function(collection) {
    if (!Array.isArray(collection)) {
      return;
    }
    collection.forEach(function(value) {
      addValue(value);
    });
  };
  const addEntryMetadata = function(entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    addArray(entry.notes || []);
    addValue(entry.sourceExcerpt);
    addValue(entry.interpretation);
    addValue(entry.scopeLabel);
    addArray(entry.deliverables || []);
    addArray(entry.resources || []);
  };
  const addMetadataEntries = function(metadataKey) {
    if (!plan || !plan.metadata) {
      return;
    }
    const entries = plan.metadata[metadataKey];
    if (!Array.isArray(entries)) {
      return;
    }
    entries.forEach(addEntryMetadata);
  };
  if (plan) {
    addArray(plan.warnings);
    if (plan.sections) {
      plan.sections.forEach(function(section) {
        if (!section) {
          return;
        }
        addValue(section.sectionName);
        addArray(section.sectionWarnings);
        addArray(section.sectionNotes || []);
        if (Array.isArray(section.items)) {
          section.items.forEach(function(item) {
            if (!item) {
              return;
            }
            addValue(item.clientLineName);
            addValue(item.description);
            addArray(item.warnings);
            addArray(item.notes || []);
          });
        }
      });
    }
  }
  addMetadataEntries('contractEntries');
  addMetadataEntries('sectionEntries');
  if (plan && plan.metadata && plan.metadata.scopeMap && Array.isArray(plan.metadata.scopeMap.entries)) {
    plan.metadata.scopeMap.entries.forEach(addEntryMetadata);
  }
  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'collectPlanScriptSnippets', { planName: plan && plan.metadata && plan.metadata.planName, snippetCount: snippets.size });
  } catch (ignore) {
    // Silent fail
  }
  return Array.from(snippets);
}

/**
 * Build complete quote data as JSON object
 * @return {Object} Quote data structure
 */
function buildQuoteJSON(values) {
  if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
    showWarningToast('Quote_Builder headers modified; skipping JSON export.');
    return {};
  }
  const sheet = getQuoteBuilderSheet();
  let resolvedValues = Array.isArray(values) ? values : null;
  if (!resolvedValues) {
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    const rowCount = Math.max(0, lastRow - 2);
    resolvedValues = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
  }

  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'buildQuoteJSON start', { totalRows: resolvedValues.length, sheetName: sheet ? sheet.getName() : 'unknown' });
  } catch (ignore) {
    // Silent fail
  }

  const scriptSnippets = new Set();
  const recordScriptSnippet = function(value) {
    if (value === undefined || value === null) {
      return;
    }
    const text = String(value);
    if (!text) {
      return;
    }
    if (text.toLowerCase().indexOf('<script') !== -1) {
      scriptSnippets.add(text);
    }
  };

  const lineItems = [];
  const sections = [];
  const fees = [];

  for (let i = 0; i < resolvedValues.length; i++) {
    const type = resolvedValues[i][QB_COLS.TYPE];
    const visibility = resolvedValues[i][QB_COLS.VISIBILITY];

    // Skip hidden items from export
    if (visibility === VISIBILITY.HIDDEN) {
      continue;
    }

    const rawNotes = resolvedValues[i][QB_COLS.NOTES];
    recordScriptSnippet(rawNotes);
    const noteMeta = parseScopeMetadataNotes(rawNotes);
    const cleanedDescription = stripInternalMarker(resolvedValues[i][QB_COLS.DESCRIPTION]);
    const cleanedClientLine = stripInternalMarker(resolvedValues[i][QB_COLS.CLIENT_LINE_NAME]);
    const cleanedSectionName = stripInternalMarker(resolvedValues[i][QB_COLS.SECTION_NAME]);

    const item = {
      rowId: resolvedValues[i][QB_COLS.ROW_ID],
      type: type,
      visibility: visibility,
      sectionName: cleanedSectionName,
      itemCode: resolvedValues[i][QB_COLS.ITEM_CODE],
      description: cleanedDescription,
      clientLineName: cleanedClientLine,
      qty: resolvedValues[i][QB_COLS.QTY],
      unit: resolvedValues[i][QB_COLS.UNIT],
      unitRate: resolvedValues[i][QB_COLS.UNIT_RATE],
      markupPct: resolvedValues[i][QB_COLS.MARKUP_PCT],
      rowNet: resolvedValues[i][QB_COLS.ROW_NET],
      clientAmount: resolvedValues[i][QB_COLS.CLIENT_AMOUNT],
      internalCost: resolvedValues[i][QB_COLS.INTERNAL_COST],
      notes: noteMeta.cleanNotes,
      scopeEntryId: noteMeta.scopeEntryId,
      resourcePackages: noteMeta.resourcePackages
    };

    if (type === ROW_TYPES.LINE) {
      lineItems.push(item);
    } else if (type === ROW_TYPES.SECTION) {
      sections.push({
        sectionName: cleanedSectionName,
        subtotal: resolvedValues[i][QB_COLS.SECTION_SUBTOTAL],
        clientAmount: item.clientAmount,
        visibility: visibility,
        scopeEntryId: noteMeta.scopeEntryId,
        notes: noteMeta.cleanNotes
      });
    } else if (type === ROW_TYPES.FEE) {
      fees.push({
        percentage: resolvedValues[i][QB_COLS.AGENCY_FEE_PCT],
        base: resolvedValues[i][QB_COLS.FEE_BASE],
        amount: resolvedValues[i][QB_COLS.FEE_AMOUNT],
        clientAmount: item.clientAmount,
        notes: noteMeta.cleanNotes
      });
    }
  }

  const totals = calculateQuoteTotals(resolvedValues);
  const vatPercent = getConfigValue('VAT_PERCENT');
  if (capturedPlanScriptSnippets && capturedPlanScriptSnippets.length) {
    capturedPlanScriptSnippets.forEach(function(snippet) {
      if (snippet) {
        scriptSnippets.add(snippet);
      }
    });
    capturedPlanScriptSnippets = [];
  }
  const scriptSnippetList = Array.from(scriptSnippets);

  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'buildQuoteJSON summary', { lineItems: lineItems.length, sections: sections.length, fees: fees.length, scriptSnippets: scriptSnippetList.length, totals: totals });
  } catch (ignore) {
    // Silent fail
  }

  const quotePayload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
      spreadsheetName: SpreadsheetApp.getActiveSpreadsheet().getName(),
      exportedBy: Session.getActiveUser().getEmail(),
      version: '1.0',
      scriptSnippets: scriptSnippetList
    },
    lineItems: lineItems,
    sections: sections,
    fees: fees,
    totals: {
      subtotal: totals.totalClientAmount,
      vatPercent: vatPercent,
      vatAmount: totals.totalClientAmount * vatPercent,
      grandTotal: totals.totalClientAmount * (1 + vatPercent),
      internalCost: totals.totalInternalCost,
      margin: totals.margin,
      marginPercent: totals.totalClientAmount > 0 ? (totals.margin / totals.totalClientAmount) : 0
    },
    statistics: {
      lineItemCount: totals.lineItemCount,
      sectionCount: totals.sectionCount,
      feeCount: fees.length
    }
  };

  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'quotePayloadBuilt', { spreadsheet: quotePayload.metadata.spreadsheetName, lineItems: quotePayload.lineItems.length, sections: quotePayload.sections.length, fees: quotePayload.fees.length, totals: quotePayload.totals });
  } catch (ignore) {
    // Silent fail
  }

  return quotePayload;
}

/**
 * Export quote as Xero-compatible JSON
 * Formats data for direct Xero API upload
 * @return {Object} Xero-formatted quote data
 */
function exportToXeroJSON() {
  const quoteData = buildQuoteJSON();
  const vatPercent = getConfigValue('VAT_PERCENT');
  // Visibility Tracking: resolve Script Property once for IDs
  const trackingConfigRaw = getScriptProperty('XERO_VISIBILITY_TRACKING');
  const trackingConfig = trackingConfigRaw ? JSON.parse(trackingConfigRaw) : null;
  const trackingCategoryId = trackingConfig && trackingConfig.trackingCategoryId;

  // Transform to Xero quote format
  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'exportToXeroJSON start', { trackingConfig: trackingConfig && trackingConfig.trackingCategoryId, vatPercent: vatPercent });
  } catch (ignore) {
    // Silent fail
  }

  const xeroQuote = {
    Type: 'ACCREC',
    Contact: {
      Name: 'CLIENT_NAME_PLACEHOLDER' // To be filled
    },
    Date: new Date().toISOString().split('T')[0],
    DueDate: calculateDueDate(30), // 30 days from now
    Reference: 'HRMNY-' + new Date().getTime(),
    Status: 'DRAFT',
    LineAmountTypes: 'Exclusive', // Amounts are exclusive of tax
    LineItems: []
  };

  // Add line items
  quoteData.lineItems.forEach(function(item) {
    if (item.visibility === VISIBILITY.CLIENT && item.clientAmount) {
      let trackingOptionId = null;
      if (trackingConfig && trackingConfig.options && item.visibility && trackingConfig.options[item.visibility]) {
        trackingOptionId = trackingConfig.options[item.visibility].trackingOptionId;
      }
      xeroQuote.LineItems.push({
        Description: stripInternalMarker(item.clientLineName || item.description),
        Quantity: item.qty || 1,
        UnitAmount: item.unitRate || item.clientAmount,
        AccountCode: '200', // Sales revenue account
        TaxType: 'OUTPUT2', // UAE VAT
        LineAmount: item.clientAmount,
        Tracking: [{
          TrackingCategoryID: trackingCategoryId,
          TrackingOptionID: trackingOptionId,
          Name: 'Visibility',
          Option: item.visibility || VISIBILITY.CLIENT
        }]
      });
    }
  });

  // Add sections as line items
  quoteData.sections.forEach(function(section) {
    if (section.clientAmount) {
      let trackingOptionId = null;
      if (trackingConfig && trackingConfig.options && section.visibility && trackingConfig.options[section.visibility]) {
        trackingOptionId = trackingConfig.options[section.visibility].trackingOptionId;
      }
      xeroQuote.LineItems.push({
        Description: stripInternalMarker(section.sectionName) + ' Total',
        Quantity: 1,
        UnitAmount: section.clientAmount,
        AccountCode: '200',
        TaxType: 'OUTPUT2',
        LineAmount: section.clientAmount,
        Tracking: [{
          TrackingCategoryID: trackingCategoryId,
          TrackingOptionID: trackingOptionId,
          Name: 'Visibility',
          Option: section.visibility || VISIBILITY.CLIENT
        }]
      });
    }
  });

  // Add agency fee
  quoteData.fees.forEach(function(fee) {
    if (fee.clientAmount) {
      let trackingOptionId = null;
      // Fees currently have no explicit visibility in buildQuoteJSON; default Option to Client
      xeroQuote.LineItems.push({
        Description: 'Agency Fee (' + (fee.percentage * 100).toFixed(0) + '%)',
        Quantity: 1,
        UnitAmount: fee.amount,
        AccountCode: '200',
        TaxType: 'OUTPUT2',
        LineAmount: fee.clientAmount,
        Tracking: [{
          TrackingCategoryID: trackingCategoryId,
          TrackingOptionID: trackingOptionId,
          Name: 'Visibility',
          Option: VISIBILITY.CLIENT
        }]
      });
    }
  });

  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'xeroQuotePayload', { lineItems: xeroQuote.LineItems.length, vatPercent: vatPercent });
  } catch (ignore) {
    // Silent fail
  }

  return xeroQuote;
}

/**
 * Calculate due date
 * @param {number} days - Days from now
 * @return {string} ISO date string
 */
function calculateDueDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Download JSON as file (creates Drive file)
 * @return {string} File URL
 */
function downloadJSONAsFile() {
  try {
    try {
      UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'downloadJSONAsFile start', { timestamp: new Date().toISOString() });
    } catch (ignore) {
      // Silent fail
    }
    const quoteData = buildQuoteJSON();
    const jsonString = JSON.stringify(quoteData, null, 2);

    // Create file in Google Drive
    const fileName = 'HRMNY-Quote-' + new Date().toISOString().split('T')[0] + '.json';
    const file = DriveApp.createFile(fileName, jsonString, MimeType.PLAIN_TEXT);

    // Move to root or specific folder
    const fileUrl = file.getUrl();

    try {
      UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'downloadedJSONFile', { fileName: fileName, fileUrl: fileUrl, size: jsonString.length });
    } catch (ignore) {
      // Silent fail
    }
    showSuccessToast('JSON file created: ' + fileName);

    return fileUrl;

  } catch (error) {
    try {
      UnifiedLogger.error(JSON_EXPORT_LOG_CATEGORY, 'Error creating JSON file', error);
    } catch (ignore) {
      // Silent fail
    }
    showErrorToast('Failed to create JSON file: ' + error.message);
    return null;
  }
}

/**
 * Export client-visible items only as simple JSON
 * @return {Object} Simplified client data
 */
function exportClientDataJSON() {
  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'exportClientDataJSON start', { timestamp: new Date().toISOString() });
  } catch (ignore) {
    // Silent fail
  }
  const clientData = getClientVisibleData();
  const totals = calculateQuoteTotals();
  const vatPercent = getConfigValue('VAT_PERCENT');

  const payload = {
    quoteDate: new Date().toISOString().split('T')[0],
    items: clientData,
    totals: {
      subtotal: totals.totalClientAmount,
      vat: totals.totalClientAmount * vatPercent,
      total: totals.totalClientAmount * (1 + vatPercent)
    }
  };

  try {
    UnifiedLogger.info(JSON_EXPORT_LOG_CATEGORY, 'exportClientDataJSON complete', payload);
  } catch (ignore) {
    // Silent fail
  }
  return payload;
}

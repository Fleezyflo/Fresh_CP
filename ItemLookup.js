/**
 * hrmny Quote Builder - Item Lookup
 * Functions to lookup items from XERO_READY and auto-populate fields
 */

const ITEM_LOOKUP_LOG_CATEGORY = 'ItemLookup';

let XERO_ITEM_CACHE = null; // Map keyed by uppercased item code

/**
 * Clear the cached XERO_READY lookup in memory and CacheService.
 */
function invalidateXeroLookupCache() {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'invalidateXeroLookupCache');
  try {
    XERO_ITEM_CACHE = null;
    try { UnifiedLogger.info(ITEM_LOOKUP_LOG_CATEGORY, 'invalidateXeroLookupCache', { clearedScriptCache: false }); } catch (ignore) {
      console.error('[ItemLookup] Error:', ignore.message, ignore.stack);
    }
    trace.complete('invalidateXeroLookupCache completed', { clearedScriptCache: false });
  } catch (error) {
    trace.fail('invalidateXeroLookupCache failed', error);
    throw error;
  }
}

/**
 * Build or return the lookup map for XERO_READY rows.
 * Uses CacheService to persist across executions.
 * @return {Map<string, Object>} Map of itemCode → item details
 */
function getXeroLookupCache() {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'getXeroLookupCache');
  try {
    if (XERO_ITEM_CACHE) {
      trace.complete('getXeroLookupCache completed - from cache', { size: XERO_ITEM_CACHE.size });
      return XERO_ITEM_CACHE;
    }

    const map = new Map();
    const sheet = getXeroReadySheet();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
      values.forEach(function(row) {
        const sku = row[XERO_COLS.SKU];
        if (!sku) {
          return;
        }
        const key = String(sku).trim().toUpperCase();
        map.set(key, {
          itemCode: key,
          name: row[XERO_COLS.NAME] || '',
          description: row[XERO_COLS.DESCRIPTION] || '',
          sellPrice: row[XERO_COLS.SELL_PRICE],
          category: row[XERO_COLS.CATEGORY] || '',
          status: row[XERO_COLS.STATUS] || ''
        });
      });
    }

    XERO_ITEM_CACHE = map;
    trace.complete('getXeroLookupCache completed', { source: 'XERO_READY', size: map.size });
    return XERO_ITEM_CACHE;
  } catch (error) {
    trace.fail('getXeroLookupCache failed', error);
    throw error;
  }
}

/**
 * Lookup item details from XERO_READY by SKU/ItemCode.
 * @param {string} itemCode SKU/ItemCode to lookup
 * @return {Object|null} Item data or null if not found
 */
function lookupItem(itemCode) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'lookupItem');
  try {
    if (!itemCode) {
      trace.complete('lookupItem completed - no itemCode', { itemCode: itemCode });
      return null;
    }

    const cache = getXeroLookupCache();
    const key = String(itemCode).trim().toUpperCase();
    const result = cache.has(key) ? cache.get(key) : null;

    if (!result) {
      UnifiedLogger.debug('CatalogLookup', 'Item not found in catalog', { itemCode: key });
      trace.complete('lookupItem completed - not found', { itemCode: key });
    } else {
      trace.complete('lookupItem completed - found', { itemCode: key, itemName: result.name });
    }

    return result;
  } catch (error) {
    trace.fail('lookupItem failed', error);
    throw error;
  }
}

/**
 * Auto-populate row when ItemCode is entered (triggered on edit).
 * @param {Event} e Edit event
 */
function onEdit(e) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'onEdit');
  try {
    const sheet = e.range.getSheet();

    if (sheet.getName() === (SHEET_NAMES && SHEET_NAMES.CONFIG ? SHEET_NAMES.CONFIG : 'Config')) {
      handleConfigSheetEdit_(sheet, e.range);
      trace.complete('onEdit completed - config sheet', {});
      return;
    }

    if (sheet.getName() !== SHEET_NAMES.QUOTE_BUILDER) {
      trace.complete('onEdit completed - not quote builder sheet', { sheetName: sheet.getName() });
      return;
    }

    const row = e.range.getRow();
    const col = e.range.getColumn();

    if (row <= 2 || col !== QB_COLS.ITEM_CODE + 1) {
      trace.complete('onEdit completed - not item code column', { row: row, col: col });
      return;
    }

    const itemCode = typeof e.value !== 'undefined' ? e.value : e.range.getValue();

    if (!itemCode) {
      trace.complete('onEdit completed - empty item code', { row: row });
      return;
    }

    try {
      const item = lookupItem(itemCode);

      if (!item) {
        showWarningToast('Item not found: ' + itemCode);
        trace.complete('onEdit completed - item not found', { itemCode: itemCode, row: row });
        return;
      }

      if (item.active === false) {
        showWarningToast('Warning: ' + itemCode + ' is marked as inactive');
      }

      const updates = [];
      updates.push({ row: row, col: QB_COLS.UNIT + 1, value: item.unit || '' });

      const notesRange = sheet.getRange(row, QB_COLS.NOTES + 1);
      const currentNotes = notesRange.getValue() || '';
      let nextNotes = currentNotes;
      if (item.pricingMode) {
        const pricingNote = 'Pricing: ' + item.pricingMode;
        if (!currentNotes.includes(pricingNote)) {
          nextNotes = currentNotes ? currentNotes + '; ' + pricingNote : pricingNote;
        }
      }
      updates.push({ row: row, col: QB_COLS.NOTES + 1, value: nextNotes });

      QuoteUtils.batchUpdateCells(sheet, updates);
      try { UnifiedLogger.info(ITEM_LOOKUP_LOG_CATEGORY, 'Auto-populated row with item', { row: row, itemCode: itemCode }); } catch (ignore) {
        console.error('[ItemLookup] Error:', ignore.message, ignore.stack);
      }
      trace.complete('onEdit completed - auto-populated', { row: row, itemCode: itemCode, updatesCount: updates.length });
    } catch (error) {
      try { UnifiedLogger.warn(ITEM_LOOKUP_LOG_CATEGORY, 'Error in onEdit', String(error)); } catch (ignore) {
        console.error('[ItemLookup] Error:', ignore.message, ignore.stack);
      }
      trace.fail('onEdit inner operation failed', error);
      throw error;
    }
  } catch (error) {
    trace.fail('onEdit failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Auto-populating item details on edit',
      correlationId: trace.correlationId
    });
    showErrorToast('Auto-Population Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

function handleConfigSheetEdit_(sheet, range) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'handleConfigSheetEdit_');
  try {
    const row = range.getRow();
    if (row <= 1) {
      trace.complete('handleConfigSheetEdit_ completed - header row', { row: row });
      return;
    }
    const key = sheet.getRange(row, 1).getValue();
    if (!key) {
      trace.complete('handleConfigSheetEdit_ completed - no key', { row: row });
      return;
    }
    const value = sheet.getRange(row, 2).getValue();
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (Array.isArray(CONFIG_SENSITIVE_KEYS) && CONFIG_SENSITIVE_KEYS.indexOf(key) !== -1) {
      if (typeof setScriptSecret === 'function') {
        setScriptSecret(key, value);
      } else if (props) {
        const normalizedValue = value === '' || value === null || value === undefined ? null : String(value);
        const currentValue = props.getProperty(key);
        if (normalizedValue === null) {
          if (currentValue !== null) {
            props.deleteProperty(key);
          }
        } else if (currentValue !== normalizedValue) {
          const validation = validatePropertySize(normalizedValue, 9000);
          if (!validation.valid) {
            UnifiedLogger.warn(ITEM_LOOKUP_LOG_CATEGORY, 'Config value too large for property', {
              key: key,
              size: validation.size,
              message: validation.message
            });
            // Skip storing oversized value
          } else {
            props.setProperty(key, normalizedValue);
          }
        }
      }
      sheet.getRange(row, 2).setValue('');
      try { sheet.getRange(row, 2).setNote('Stored in Script Properties (secure)'); } catch (noteError) {
        console.error('[ItemLookup] Error:', noteError.message, noteError.stack);
      }
      trace.complete('handleConfigSheetEdit_ completed - sensitive key', { key: key, row: row });
    } else {
      if (props) {
        const normalizedValue = value === '' || value === null || value === undefined ? null : String(value);
        const currentValue = props.getProperty(key);
        if (normalizedValue === null) {
          if (currentValue !== null) {
            props.deleteProperty(key);
          }
        } else if (currentValue !== normalizedValue) {
          const validation = validatePropertySize(normalizedValue, 9000);
          if (!validation.valid) {
            UnifiedLogger.warn(ITEM_LOOKUP_LOG_CATEGORY, 'Config value too large for property', {
              key: key,
              size: validation.size,
              message: validation.message
            });
            // Skip storing oversized value
          } else {
            props.setProperty(key, normalizedValue);
          }
        }
      }
      trace.complete('handleConfigSheetEdit_ completed - normal key', { key: key, row: row });
    }
  } catch (configEditError) {
    try { UnifiedLogger.warn(ITEM_LOOKUP_LOG_CATEGORY, 'handleConfigSheetEdit_ failed', String(configEditError)); } catch (ignore) {
      console.error('[ItemLookup] Error:', ignore.message, ignore.stack);
    }
    trace.fail('handleConfigSheetEdit_ failed', configEditError);
    throw configEditError;
  }
}

/**
 * Refresh item lookup for all rows.
 * Updates Description, Unit, UnitRate, and Notes for rows with ItemCode.
 */
function refreshItemLookup() {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'refreshItemLookup');
  try {
    const sheet = getQuoteBuilderSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 2) {
      showWarningToast('No data rows to refresh');
      trace.complete('refreshItemLookup completed - no data rows', { lastRow: lastRow });
      return;
    }

    try {
      invalidateXeroLookupCache();
      const updates = [];
      let updatedCount = 0;
      let errorCount = 0;

      for (let row = 3; row <= lastRow; row++) {
        const itemCode = sheet.getRange(row, QB_COLS.ITEM_CODE + 1).getValue();
        if (!itemCode) {
          continue;
        }

        const item = lookupItem(itemCode);
        if (!item) {
          errorCount++;
          try { UnifiedLogger.warn(ITEM_LOOKUP_LOG_CATEGORY, 'Item not found in refresh', { itemCode: itemCode, row: row }); } catch (ignore) {
            console.error('[ItemLookup] Error:', ignore.message, ignore.stack);
          }
          continue;
        }

        updates.push({ row: row, col: QB_COLS.UNIT + 1, value: item.unit || '' });

        const existingNotes = sheet.getRange(row, QB_COLS.NOTES + 1).getValue() || '';
        let refreshedNotes = existingNotes;
        if (item.pricingMode) {
          const pricingNote = 'Pricing: ' + item.pricingMode;
          if (!existingNotes.includes(pricingNote)) {
            refreshedNotes = existingNotes ? existingNotes + '; ' + pricingNote : pricingNote;
          }
        }
        updates.push({ row: row, col: QB_COLS.NOTES + 1, value: refreshedNotes });

        updatedCount++;
      }

      if (updates.length > 0) {
        QuoteUtils.batchUpdateCells(sheet, updates);
      }

      const message =
        'Refreshed ' +
        updatedCount +
        ' items' +
        (errorCount > 0 ? ' (' + errorCount + ' not found)' : '');
      let uiAvailable = true;
      try {
        SpreadsheetApp.getUi();
      } catch (uiError) {
        uiAvailable = false;
      }
      if (uiAvailable) {
        showSuccessToast(message);
      } else {
        try { UnifiedLogger.info(ITEM_LOOKUP_LOG_CATEGORY, 'refreshItemLookupSummary (ui skipped)', { message: message }); } catch (ignore) {
          console.error('[ItemLookup] Error:', ignore.message, ignore.stack);
        }
      }

      try {
        UnifiedLogger.info(ITEM_LOOKUP_LOG_CATEGORY, 'refreshItemLookupSummary', {
          updatedCount: updatedCount,
          missingCount: errorCount,
          totalRows: lastRow - 2
        });
      } catch (ignore) {
        console.error('[ItemLookup] Error:', ignore.message, ignore.stack);
      }
      trace.complete('refreshItemLookup completed', { updatedCount: updatedCount, errorCount: errorCount, totalRows: lastRow - 2 });
    } catch (error) {
      try { UnifiedLogger.warn(ITEM_LOOKUP_LOG_CATEGORY, 'refreshItemLookup failed', String(error)); } catch (ignore) {
        console.error('[ItemLookup] Error:', ignore.message, ignore.stack);
      }
      trace.fail('refreshItemLookup inner operation failed', error);
      throw error;
    }
  } catch (error) {
    trace.fail('refreshItemLookup failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Refreshing item lookups',
      correlationId: trace.correlationId
    });
    showErrorToast('Refresh Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Get all items from XERO_READY.
 * @return {Array<Object>} Item objects
 */
function getAllItems() {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'getAllItems');
  try {
    const cache = getXeroLookupCache();
    const items = [];
    cache.forEach(item => {
      items.push(Object.assign({}, item));
    });
    trace.complete('getAllItems completed', { count: items.length });
    return items;
  } catch (error) {
    trace.fail('getAllItems failed', error);
    throw error;
  }
}

function buildItemFromResource_(entry) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'buildItemFromResource_');
  try {
    if (!entry || !entry.code) {
      trace.complete('buildItemFromResource_ completed - no entry or code', { hasEntry: !!entry, hasCode: entry ? !!entry.code : false });
      return null;
    }
    const itemCode = String(entry.code).trim();
    if (!itemCode) {
      trace.complete('buildItemFromResource_ completed - empty itemCode', { code: entry.code });
      return null;
    }
    const unit = normalizeUnitLabel(entry.unit || 'unit');
    const rate = typeof entry.rate === 'number' ? entry.rate : toNumber(entry.rate);
    const pricingMode = entry.pricingMode || derivePricingMode(entry.category || '');
    const status = (entry.status || '').toString().toLowerCase();
    const result = {
      itemCode: itemCode,
      name: entry.name || itemCode,
      description: entry.description || '',
      sellPrice: rate,
      costPrice: null,
      category: entry.category || '',
      status: entry.status || '',
      accountCode: '',
      purchaseAccount: '',
      itemType: entry.source || 'Resource',
      unit: unit,
      pricingMode: pricingMode,
      dayRateAED: null,
      hourRateAED: null,
      defaultUnitAmountAED: rate,
      active: isActiveStatus(status),
      metadata: entry.metadata || entry.metadataJSON || {}
    };
    trace.complete('buildItemFromResource_ completed', { itemCode: itemCode, itemType: result.itemType });
    return result;
  } catch (error) {
    trace.fail('buildItemFromResource_ failed', error);
    throw error;
  }
}

/**
 * Return a sensible unit string based on ItemCode patterns.
 */
function deriveUnitFromItemCode(itemCode, itemType) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'deriveUnitFromItemCode');
  try {
    if (itemCode && itemCode.indexOf('--') !== -1) {
      const parts = itemCode.split('--');
      const tail = parts[parts.length - 1];
      if (tail) {
        trace.complete('deriveUnitFromItemCode completed - from code pattern', { itemCode: itemCode, unit: tail });
        return tail;
      }
    }

    let result = 'unit';
    if (itemType === 'Crew' || itemType === 'Resource') {
      result = 'day';
    } else if (itemType === 'Scope') {
      result = 'unit';
    } else if (itemType === 'Tool') {
      result = 'license';
    }

    trace.complete('deriveUnitFromItemCode completed - from type', { itemCode: itemCode, itemType: itemType, unit: result });
    return result;
  } catch (error) {
    trace.fail('deriveUnitFromItemCode failed', error);
    throw error;
  }
}

/**
 * Convert a raw unit string into Title Case label.
 */
function normalizeUnitLabel(unit) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'normalizeUnitLabel');
  try {
    if (!unit) {
      trace.complete('normalizeUnitLabel completed - no unit', { input: unit, output: 'Unit' });
      return 'Unit';
    }
    const cleaned = String(unit).replace(/[_-]+/g, ' ').trim().toLowerCase();
    if (!cleaned) {
      trace.complete('normalizeUnitLabel completed - empty after cleaning', { input: unit, output: 'Unit' });
      return 'Unit';
    }
    const result = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    trace.complete('normalizeUnitLabel completed', { input: unit, output: result });
    return result;
  } catch (error) {
    trace.fail('normalizeUnitLabel failed', error);
    throw error;
  }
}

/**
 * Decide pricing mode based on item type (fallback to fixed).
 */
function derivePricingMode(itemType) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'derivePricingMode');
  try {
    const type = (itemType || '').toLowerCase();
    let result = 'fixed';
    if (type === 'crew' || type === 'resource' || type === 'tool') {
      result = 'rate';
    } else if (type === 'scope') {
      result = 'fixed';
    }
    trace.complete('derivePricingMode completed', { itemType: itemType, pricingMode: result });
    return result;
  } catch (error) {
    trace.fail('derivePricingMode failed', error);
    throw error;
  }
}

/**
 * Determine if status indicates the item is active.
 */
function isActiveStatus(status) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'isActiveStatus');
  try {
    if (!status) {
      trace.complete('isActiveStatus completed - no status, defaulting to active', { status: status, result: true });
      return true;
    }
    const normalized = status.toString().toLowerCase();
    const result = normalized === 'active' || normalized === 'true' || normalized === '1';
    trace.complete('isActiveStatus completed', { status: status, normalized: normalized, result: result });
    return result;
  } catch (error) {
    trace.fail('isActiveStatus failed', error);
    throw error;
  }
}

/**
 * Convert value to number (returns 0 for blank, NaN-safe).
 */
function toNumber(value) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'toNumber');
  try {
    if (value === null || value === undefined || value === '') {
      trace.complete('toNumber completed - null/undefined/empty', { input: value, output: 0 });
      return 0;
    }
    if (typeof value === 'number') {
      const result = isNaN(value) ? 0 : value;
      trace.complete('toNumber completed - already number', { input: value, output: result });
      return result;
    }
    const normalized = String(value)
      .replace(/[\u00A0\s]/g, '')
      .replace(/[^0-9.\-]/g, '');
    if (!normalized) {
      trace.complete('toNumber completed - empty after normalization', { input: value, output: 0 });
      return 0;
    }
    const num = Number(normalized);
    const result = isNaN(num) ? 0 : num;
    trace.complete('toNumber completed', { input: value, normalized: normalized, output: result });
    return result;
  } catch (error) {
    trace.fail('toNumber failed', error);
    throw error;
  }
}

/**
 * Suggest a unit rate for the item based on pricing mode.
 * @param {Object} item Parsed item
 * @return {number|null}
 */
function suggestUnitRate(item) {
  const trace = UnifiedLogger.startTrace('ItemLookup', 'suggestUnitRate');
  try {
    if (!item) {
      trace.complete('suggestUnitRate completed - no item', { item: item, rate: null });
      return null;
    }

    // ENH-002: Use cost calculation method if available
    if (typeof getCostCalculationMethod === 'function') {
      const method = getCostCalculationMethod(item);

      if (method === 'day-rate') {
        const rate = item.dayRateAED || item.sellPrice || null;
        trace.complete('suggestUnitRate completed - day-rate', { method: method, rate: rate });
        return rate;
      }
      if (method === 'rate') {
        const rate = item.hourRateAED || item.sellPrice || null;
        trace.complete('suggestUnitRate completed - hourly rate', { method: method, rate: rate });
        return rate;
      }
      if (method === 'fixed') {
        const rate = item.defaultUnitAmountAED || item.sellPrice || null;
        trace.complete('suggestUnitRate completed - fixed', { method: method, rate: rate });
        return rate;
      }
      if (method === 'tiered' || method === 'custom') {
        // For tiered/custom, return base rate (calculation happens elsewhere)
        const rate = item.sellPrice || null;
        trace.complete('suggestUnitRate completed - tiered/custom', { method: method, rate: rate });
        return rate;
      }
    }

    // Legacy fallback
    let rate = null;
    let mode = 'unknown';
    if (item.pricingMode === 'rate') {
      rate = item.dayRateAED || item.hourRateAED || item.sellPrice || null;
      mode = 'rate';
    } else if (item.pricingMode === 'fixed') {
      rate = item.defaultUnitAmountAED || item.sellPrice || null;
      mode = 'fixed';
    } else {
      rate = item.sellPrice || null;
      mode = 'default';
    }
    trace.complete('suggestUnitRate completed - legacy fallback', { pricingMode: item.pricingMode, mode: mode, rate: rate });
    return rate;
  } catch (error) {
    trace.fail('suggestUnitRate failed', error);
    throw error;
  }
}

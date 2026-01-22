/**
 * hrmny Quote Builder - XERO_READY Lookup Module
 * Single source of truth for SKU metadata hydration
 * Load order: 03_ (after 02_TraceLogger, before 05_AISidebar_*)
 */

const XERO_READY_LOOKUP_LOG_CATEGORY = 'XeroReadyLookup';
let XERO_READY_LOOKUP_CACHE = null;

/**
 * Build in-memory Map from XERO_READY sheet for fast SKU lookups
 * @return {Map<string, Object>} Map of SKU → item metadata
 * @private
 */
function buildXeroReadyLookupMap_() {
  const trace = UnifiedLogger.startTrace('XeroReadyLookup', 'buildXeroReadyLookupMap_');
  try {
    const sheet = getXeroReadySheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      trace.complete('buildXeroReadyLookupMap_ completed - empty sheet');
      return new Map();
    }
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    const map = new Map();
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const sku = row[XERO_COLS.SKU];
      if (!sku) {
        continue;
      }
      const key = String(sku).trim().toUpperCase();
      map.set(key, {
        sku: key,
        name: row[XERO_COLS.NAME] || '',
        description: row[XERO_COLS.DESCRIPTION] || '',
        sellPrice: row[XERO_COLS.SELL_PRICE],
        category: row[XERO_COLS.CATEGORY] || '',
        status: row[XERO_COLS.STATUS] || ''
      });
    }
    trace.complete('buildXeroReadyLookupMap_ completed', { count: map.size });
    return map;
  } catch (error) {
    trace.fail('buildXeroReadyLookupMap_ failed', error);
    throw error;
  }
}

/**
 * Lookup single SKU from XERO_READY (lazy cache initialization)
 * @param {string} sku - SKU code to lookup
 * @return {Object|null} Item metadata or null if not found
 */
function lookupXeroReadyItem(sku) {
  const normalized = sku ? String(sku).trim().toUpperCase() : '';
  if (!normalized) {
    return null;
  }
  if (!XERO_READY_LOOKUP_CACHE) {
    XERO_READY_LOOKUP_CACHE = buildXeroReadyLookupMap_();
  }
  return XERO_READY_LOOKUP_CACHE.has(normalized) ? XERO_READY_LOOKUP_CACHE.get(normalized) : null;
}

/**
 * Hydrate array of SKU codes with full metadata from XERO_READY
 * @param {Array<string>} skuList - Array of SKU codes
 * @return {Array<Object>} Array of item metadata objects
 */
function hydrateXeroReadySkus(skuList) {
  const list = Array.isArray(skuList) ? skuList : [];
  return list.map(function(code) {
    const key = code ? String(code).trim().toUpperCase() : '';
    if (!key) {
      return null;
    }
    const item = lookupXeroReadyItem(key);
    if (item) {
      return item;
    }
    return { sku: key, name: 'Unknown SKU', description: '', sellPrice: 0, category: '', status: '', error: 'Not found in XERO_READY' };
  }).filter(function(entry) { return entry; });
}

// Global exports for backward compatibility
try {
  if (typeof globalThis !== 'undefined') {
  }
} catch (error) {
  UnifiedLogger.warn(XERO_READY_LOOKUP_LOG_CATEGORY, 'globalThis check failed (optional)', {
    error: error.message
  });
}

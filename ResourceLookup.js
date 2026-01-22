/**
 * Crew and resource rate lookup helpers.
 */

let RESOURCE_LOOKUP_CACHE = null;

/**
 * Invalidate cached crew/resource lookups.
 */
function invalidateResourceLookupCache() {
  RESOURCE_LOOKUP_CACHE = null;
}

/**
 * Build or return the combined lookup map for MASTER_CATALOG, resource rates, and crew rates.
 * @return {Object<string, Object>}
 */
function getCombinedResourceLookup() {
  if (RESOURCE_LOOKUP_CACHE) {
    return RESOURCE_LOOKUP_CACHE;
  }
  const map = new Map();

  try {
    if (typeof loadResourceCatalog === 'function') {
      const rawCatalog = loadResourceCatalog();
      const catalog = typeof unwrapConfigResult === 'function'
        ? unwrapConfigResult(rawCatalog, { fallbackValue: { list: [], byCode: {} }, configName: 'resourceCatalog', logErrors: true })
        : rawCatalog;
      const list = catalog && Array.isArray(catalog.list)
        ? catalog.list
        : (Array.isArray(catalog) ? catalog : []);
      list.forEach(function(entry) {
        if (!entry || !entry.code) {
          return;
        }
        const code = String(entry.code).trim().toUpperCase();
        if (!code) {
          return;
        }
        map.set(code, {
          itemCode: code,
          name: entry.name || code,
          description: entry.description || '',
          unit: entry.unit || '',
          sellPrice: typeof entry.rate === 'number' ? entry.rate : entry.rate || '',
          category: entry.category || '',
          source: entry.source || 'Resource'
        });
      });
    }
  } catch (error) {
    try { UnifiedLogger.warn('ResourceLookup', 'ConfigLoader catalog load failed', String(error)); } catch (ignore) {
      console.error('[ResourceLookup] Error:', ignore.message, ignore.stack);
    }
  }

  if (typeof getXeroLookupCache === 'function') {
    const itemCache = getXeroLookupCache();
    itemCache.forEach((value, key) => {
      map.set(key.trim().toUpperCase(), Object.assign({}, value));
    });
  }

  RESOURCE_LOOKUP_CACHE = map;
  return map;
}

/**
 * Lookup crew/resource details by code (falls back to catalogue).
 * @param {string} itemCode
 * @return {Object|null}
 */
function lookupCrewResource(itemCode) {
  const key = String(itemCode).trim().toUpperCase();
  if (!key) {
    return null;
  }
  const map = getCombinedResourceLookup();
  const hasEntries = map && typeof map.size === 'number' ? map.size > 0 : false;
  if (!hasEntries) {
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger.warn === 'function') {
      try { UnifiedLogger.warn('ResourceLookup', 'Combined resource lookup is empty', { itemCode: key }); } catch (ignore) {
      console.error('[ResourceLookup] Error:', ignore.message, ignore.stack);
    }
    }
    return null;
  }
  if (map.has(key)) {
    return Object.assign({}, map.get(key));
  }
  return null;
}

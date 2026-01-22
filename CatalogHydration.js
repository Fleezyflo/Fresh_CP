/**
 * Catalog Hydration Utilities
 *
 * Purpose: Lazy hydration of catalog metadata from XERO_READY sheet
 *
 * Problem Solved:
 * - vectorCandidates[] stored full catalogItem objects = 90KB state bloat
 * - PropertiesService 9KB limit = JSON truncation errors
 * - Stale catalog metadata in cached states
 *
 * Solution:
 * - Remove catalogItem from state storage
 * - Hydrate on-demand from XERO_READY (single source of truth)
 * - Backward compatible with existing states
 *
 * Load Order: 00_ prefix ensures loading before AISidebar modules
 */

/**
 * Hydrate catalog item metadata from XERO_READY sheet
 *
 * @param {string} sku - SKU code to hydrate
 * @returns {Object|null} Catalog item with metadata or null if not found
 *
 * @example
 * const item = hydrateCatalogItem('STR-001');
 * // Returns: { sku: 'STR-001', name: 'Strategic Planning', sellPrice: 5000, ... }
 */
function hydrateCatalogItem(sku) {
  if (!sku || typeof sku !== 'string') {
    return null;
  }

  try {
    // Use existing safeLookupItem() - already reads from XERO_READY
    // This is the single source of truth for catalog metadata
    const item = safeLookupItem(sku);

    if (!item) {
      // SKU not found in catalog (may have been deleted)
      UnifiedLogger.verbose('CatalogHydration', 'SKU not found in catalog', {
        sku: sku
      });
      return null;
    }

    return item;

  } catch (error) {
    UnifiedLogger.warn('CatalogHydration', 'Failed to hydrate catalog item', {
      sku: sku,
      error: String(error)
    });
    return null;
  }
}

/**
 * Hydrate single candidate object (backward compatible)
 *
 * Handles both old states (with catalogItem) and new states (without)
 *
 * @param {Object} candidate - Candidate object (with or without catalogItem)
 * @returns {Object} Candidate with catalogItem populated
 *
 * @example
 * // Old state (has catalogItem already)
 * const old = { sku: 'STR-001', catalogItem: {...} };
 * hydrateCandidate(old); // Returns as-is (no lookup)
 *
 * // New state (no catalogItem)
 * const new = { sku: 'STR-001', vectorScore: 0.95 };
 * hydrateCandidate(new); // Hydrates from XERO_READY
 */
function hydrateCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  // BACKWARD COMPATIBLE: If already has catalogItem, return as-is
  // This handles old states without expensive re-lookup
  if (candidate.catalogItem) {
    return candidate;
  }

  // NEW STATE: Hydrate catalogItem from XERO_READY on-demand
  const catalogItem = hydrateCatalogItem(candidate.sku);

  // Return candidate with catalogItem populated
  // If catalogItem is null (SKU not found), that's OK - graceful degradation
  return Object.assign({}, candidate, {
    catalogItem: catalogItem
  });
}

/**
 * Hydrate array of candidates (convenience wrapper)
 *
 * @param {Array<Object>} candidates - Array of candidate objects
 * @returns {Array<Object>} Array with all candidates hydrated
 *
 * @example
 * const candidates = [
 *   { sku: 'STR-001', vectorScore: 0.95 },
 *   { sku: 'DEV-042', vectorScore: 0.87 }
 * ];
 * const hydrated = hydrateCandidateArray(candidates);
 * // Each item now has catalogItem populated
 */
function hydrateCandidateArray(candidates) {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.map(hydrateCandidate).filter(Boolean);
}

/**
 * Strip catalogItem from candidate (for state storage)
 *
 * Used to clean old states before saving - removes bloat
 *
 * @param {Object} candidate - Candidate object (may have catalogItem)
 * @returns {Object} Candidate without catalogItem field
 */
function stripCatalogItem(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return candidate;
  }

  // Create shallow copy without catalogItem
  const stripped = Object.assign({}, candidate);
  delete stripped.catalogItem;

  return stripped;
}

/**
 * Strip catalogItem from array of candidates
 *
 * @param {Array<Object>} candidates - Array of candidate objects
 * @returns {Array<Object>} Array without catalogItem fields
 */
function stripCatalogItemArray(candidates) {
  if (!Array.isArray(candidates)) {
    return candidates;
  }

  return candidates.map(stripCatalogItem);
}

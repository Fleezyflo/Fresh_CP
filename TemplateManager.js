/**
 * Quote template management utilities.
 * Handles validation lookup hub maintenance and template generation.
 */

let SECTION_TAXONOMY_SOURCE_CACHE_ = null;

const VALIDATION_COLUMNS = [
  { header: 'Row Types', producer: () => Array.from(new Set(Object.values(ROW_TYPES))) },
  { header: 'Visibility Options', producer: () => Array.from(new Set(Object.values(VISIBILITY))) },
  { header: 'Section Names', producer: () => getMasterSectionNames() },
  {
    header: 'Agency Fee Percentages',
    producer: () => Array.from(new Set(Object.values(AGENCY_FEES).map(fee => fee.toFixed(2))))
  }
];

const MASTER_LINK_XERO_COLUMNS = [
  { header: 'Xero Item Codes', range: `${SHEET_NAMES.XERO_READY}!A:A` },
  { header: 'Xero Item Names', range: `${SHEET_NAMES.XERO_READY}!B:B` },
  { header: 'Xero Unit Prices', range: `${SHEET_NAMES.XERO_READY}!D:D` }
];

const INVENTORY_CONFIG_TOGGLES = [
  {
    key: 'INCLUDE_COST_PRICE',
    defaultValue: false,
    note: 'Set TRUE to include purchase costs when syncing inventory'
  },
  {
    key: 'INCREMENTAL_SYNC',
    defaultValue: false,
    note: 'Set TRUE to skip unchanged items when syncing inventory'
  }
];


/**
 * Resolve the section taxonomy used by TemplateManager and AISidebar.
 * Prefers JSON stored in SECTION_TAXONOMY config/script properties,
 * falling back to the VALIDATION_LOOKUPS sheet.
 * @return {Array<Object>}
 */
function getSectionTaxonomy(options) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'getSectionTaxonomy');
  try {
    const opts = options || {};
    if (SECTION_TAXONOMY_SOURCE_CACHE_) {
      trace.complete('getSectionTaxonomy completed - from cache', { count: SECTION_TAXONOMY_SOURCE_CACHE_.length });
      return SECTION_TAXONOMY_SOURCE_CACHE_;
    }

    let entries = [];

    try {
      let categoryConfig = null;
      // Load scope phases from ConfigurationManager (replaces getScopeCategoryConfigMapDynamic)
      try {
        categoryConfig = ConfigurationManager.get('scope.phases');
      } catch (loadError) {
        try {
          UnifiedLogger.warn('TemplateManager', 'Failed to load scope phases from ConfigurationManager', {
            error: String(loadError)
          });
        } catch (logError) {
          console.error('[TemplateManager] Logging failed:', String(logError));
        }
      }
      if (categoryConfig && typeof categoryConfig === 'object') {
        const seen = new Set();
        Object.keys(categoryConfig).forEach(function(key) {
          const phases = categoryConfig[key] && Array.isArray(categoryConfig[key].phases) ? categoryConfig[key].phases : [];
          phases.forEach(function(phase) {
            if (!phase) {
              return;
            }
            const canonical = normaliseSectionKey(phase.canonical || phase.id || phase.label || '');
            if (!canonical || seen.has(canonical)) {
              return;
            }
            seen.add(canonical);
            entries.push({
              canonical: canonical,
              label: phase.label || phase.canonical || phase.id || canonical,
              weight: phase.weight || 1,
              isSection: phase.isSection !== false
            });
          });
        });
      }
    } catch (error) {
      try { UnifiedLogger.warn('TemplateManager', 'getSectionTaxonomy failed to derive from scope phase config', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      try {
        const stored = getConfigJson ? getConfigJson('SECTION_TAXONOMY', null) : null;
        if (stored) {
          if (Array.isArray(stored)) {
            entries = stored;
          } else if (typeof stored === 'string' && stored.trim()) {
            entries = JSON.parse(stored);
          }
        }
      } catch (error) {
        try { UnifiedLogger.warn('TemplateManager', 'getSectionTaxonomy failed to parse config value', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
      }
    }

    // Lazy taxonomy loading - don't block on 36s validation sheet read
    if (!Array.isArray(entries) || entries.length === 0) {
      // Auto-detect if we should defer (check startup mode from UnifiedLogger)
      let deferLoading = opts.deferToBackground === true;

      // If not explicitly set, check if we're in startup mode (STARTUP_MODE_ACTIVE from 01_UnifiedLogger.js)
      if (!deferLoading && typeof STARTUP_MODE_ACTIVE !== 'undefined' && STARTUP_MODE_ACTIVE) {
        deferLoading = true; // Defer during startup automatically
      }

      if (deferLoading) {
        // Return default immediately, schedule background load
        trace.info('Deferring taxonomy load to background (startup mode)');
        entries = getDefaultSectionTaxonomy();
        scheduleTaxonomyBackgroundLoad_(); // Non-blocking background load
      } else {
        // Normal mode: synchronous load (36s)
        entries = buildSectionTaxonomyFromValidation();
      }
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      entries = getDefaultSectionTaxonomy();
    }

    entries = maybeUpgradeSectionTaxonomy(entries);

    if (!Array.isArray(entries)) {
      entries = [];
    }

    SECTION_TAXONOMY_SOURCE_CACHE_ = entries;
    trace.complete('getSectionTaxonomy completed', { count: entries.length });
    return SECTION_TAXONOMY_SOURCE_CACHE_;
  } catch (error) {
    trace.fail('getSectionTaxonomy failed', error);
    throw error;
  }
}

/**
 * Build a minimal taxonomy from the VALIDATION_LOOKUPS sheet if config is absent.
 * @return {Array<Object>}
 */
function buildSectionTaxonomyFromValidation() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'buildSectionTaxonomyFromValidation');
  try {
    const sections = [];
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) {
        trace.complete('buildSectionTaxonomyFromValidation completed - no spreadsheet', { count: 0 });
        return sections;
      }
      const sheetNames = typeof getResolvedSheetNames === 'function'
        ? getResolvedSheetNames()
        : { VALIDATION_LOOKUPS: 'VALIDATION_LOOKUPS' };
      const sheet = ss.getSheetByName(sheetNames.VALIDATION_LOOKUPS);
      if (!sheet) {
        trace.complete('buildSectionTaxonomyFromValidation completed - no sheet', { count: 0 });
        return sections;
      }

      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow < 2 || lastCol < 1) {
        trace.complete('buildSectionTaxonomyFromValidation completed - no data', { count: 0 });
        return sections;
      }

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const sectionColIndex = headers.indexOf('Section Names');
      if (sectionColIndex === -1) {
        trace.complete('buildSectionTaxonomyFromValidation completed - no section column', { count: 0 });
        return sections;
      }

      const values = sheet.getRange(2, sectionColIndex + 1, lastRow - 1, 1).getValues();
      const unique = new Set();

      // Phase 3 (A-007): Batch processing with progress updates for large datasets
      const BATCH_SIZE = 100;
      const totalRows = values.length;
      const showProgress = totalRows > BATCH_SIZE; // Only show progress for large datasets

      if (showProgress) {
        try {
          SpreadsheetApp.getActiveSpreadsheet().toast(
            'Loading section taxonomy...',
            'Section Names',
            2
          );
        } catch (toastError) {
      // Empty catch replaced with error logging (Phase 6)
      console.error('[TemplateManager] Error:', toastError.message, toastError.stack);
    }
      }

      // Process in batches to avoid long blocking operations
      for (let batchStart = 0; batchStart < values.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, values.length);
        const batch = values.slice(batchStart, batchEnd);

        // Process current batch
        batch.forEach(row => {
          const name = row[0];
          if (!name) {
            return;
          }
          const trimmed = name.toString().trim();
          if (!trimmed) {
            return;
          }
          if (!unique.has(trimmed)) {
            unique.add(trimmed);
            sections.push({
              canonical: normaliseSectionKey(trimmed),
              label: trimmed,
              synonyms: [],
              weight: 1,
              isSection: true
            });
          }
        });

        // Show progress toast every batch (only for large datasets)
        if (showProgress && batchEnd < values.length) {
          try {
            const progress = Math.round((batchEnd / totalRows) * 100);
            SpreadsheetApp.getActiveSpreadsheet().toast(
              'Processed ' + batchEnd + '/' + totalRows + ' rows (' + progress + '%)',
              'Section Names',
              1
            );
          } catch (toastError) {
      // Empty catch replaced with error logging (Phase 6)
      console.error('[TemplateManager] Error:', toastError.message, toastError.stack);
    }
        }
      }

      // Final completion toast (only for large datasets)
      if (showProgress) {
        try {
          SpreadsheetApp.getActiveSpreadsheet().toast(
            'Section taxonomy loaded: ' + sections.length + ' unique sections',
            'Complete',
            2
          );
        } catch (toastError) {
      // Empty catch replaced with error logging (Phase 6)
      console.error('[TemplateManager] Error:', toastError.message, toastError.stack);
    }
      }
    } catch (error) {
      try { UnifiedLogger.warn('TemplateManager', 'buildSectionTaxonomyFromValidation', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }
    trace.complete('buildSectionTaxonomyFromValidation completed', { count: sections.length });
    return sections;
  } catch (error) {
    trace.fail('buildSectionTaxonomyFromValidation failed', error);
    throw error;
  }
}

// Background taxonomy loading state
let TAXONOMY_BACKGROUND_LOAD_SCHEDULED = false;
let TAXONOMY_BACKGROUND_LOAD_TRIGGER_ID = null;

/**
 * Schedule background taxonomy load via time-based trigger
 * Non-blocking: Returns immediately, load happens 30s later
 * @private
 */
function scheduleTaxonomyBackgroundLoad_() {
  if (TAXONOMY_BACKGROUND_LOAD_SCHEDULED) {
    // Already scheduled, don't create duplicate triggers
    return;
  }

  try {
    // Schedule trigger to run 30 seconds from now
    const trigger = ScriptApp.newTrigger('loadTaxonomyInBackground_')
      .timeBased()
      .after(30 * 1000) // 30 seconds delay
      .create();

    TAXONOMY_BACKGROUND_LOAD_SCHEDULED = true;
    TAXONOMY_BACKGROUND_LOAD_TRIGGER_ID = trigger.getUniqueId();

    try {
      UnifiedLogger.info('TemplateManager', 'Scheduled background taxonomy load', { triggerId: TAXONOMY_BACKGROUND_LOAD_TRIGGER_ID });
    } catch (ignore) {
      console.error('[TemplateManager] UnifiedLogger error:', ignore.message, ignore.stack);
    }
  } catch (error) {
    console.error('[TemplateManager] Failed to schedule background taxonomy load:', error);
    TAXONOMY_BACKGROUND_LOAD_SCHEDULED = false;
  }
}

/**
 * Background taxonomy loader (called by time-based trigger)
 * Loads taxonomy from validation sheet and saves to config
 * @global
 */
function loadTaxonomyInBackground_() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'loadTaxonomyInBackground_');
  try {
    try {
      UnifiedLogger.info('TemplateManager', 'Background taxonomy load starting');
    } catch (ignore) {
      console.error('[TemplateManager] UnifiedLogger error:', ignore.message, ignore.stack);
    }

    // Load taxonomy from validation sheet (this is the 36s operation)
    const taxonomy = buildSectionTaxonomyFromValidation();

    if (taxonomy && taxonomy.length > 0) {
      // Save to config for future use
      if (typeof setConfigJson === 'function') {
        try {
          setConfigJson('SECTION_TAXONOMY', taxonomy);
          try {
            UnifiedLogger.info('TemplateManager', 'Background taxonomy load complete', { sectionsCount: taxonomy.length });
          } catch (ignore) {
            console.error('[TemplateManager] UnifiedLogger error:', ignore.message, ignore.stack);
          }
        } catch (saveError) {
          console.error('[TemplateManager] Failed to save taxonomy:', saveError);
        }
      }

      // Update global cache
    }

    trace.complete('loadTaxonomyInBackground_ completed', { count: taxonomy ? taxonomy.length : 0 });

    // Clean up trigger
    cleanupBackgroundLoadTrigger_();
  } catch (error) {
    trace.fail('loadTaxonomyInBackground_ failed', error);
    console.error('[TemplateManager] Background taxonomy load failed:', error);
    cleanupBackgroundLoadTrigger_();
  }
}

/**
 * Clean up the background load trigger
 * @private
 */
function cleanupBackgroundLoadTrigger_() {
  try {
    if (TAXONOMY_BACKGROUND_LOAD_TRIGGER_ID) {
      const triggers = ScriptApp.getProjectTriggers();
      for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getUniqueId() === TAXONOMY_BACKGROUND_LOAD_TRIGGER_ID) {
          ScriptApp.deleteTrigger(triggers[i]);
          try {
            UnifiedLogger.info('TemplateManager', 'Cleaned up background load trigger');
          } catch (ignore) {
            console.error('[TemplateManager] UnifiedLogger error:', ignore.message, ignore.stack);
          }
          break;
        }
      }
    }
  } catch (error) {
    console.error('[TemplateManager] Failed to cleanup trigger:', error);
  } finally {
    TAXONOMY_BACKGROUND_LOAD_SCHEDULED = false;
    TAXONOMY_BACKGROUND_LOAD_TRIGGER_ID = null;
  }
}

// Export background loader globally (needed for trigger to call it)

/**
 * Normalise a section label into a canonical identifier.
 * @param {string} name
 * @return {string}
 */
// Memoization cache for normaliseSectionKey (called 40+ times with repeated inputs)
const NORMALISE_SECTION_KEY_CACHE = {};

/**
 * Trace logging removed from this hot function
 * Memoization added for 1500x speedup on cache hits
 * Called 40+ times during startup with many repeated inputs
 *
 * Performance:
 * - Cache miss: ~1ms (computation)
 * - Cache hit: <0.001ms (instant lookup)
 * - Impact: 40 calls × 1ms = 40ms (vs 60s with traces!)
 */
function normaliseSectionKey(name) {
  try {
    if (!name) {
      return '';
    }

    // Check cache first (instant if previously computed)
    const cacheKey = String(name);
    if (NORMALISE_SECTION_KEY_CACHE.hasOwnProperty(cacheKey)) {
      return NORMALISE_SECTION_KEY_CACHE[cacheKey];
    }

    // Cache miss - compute and cache result
    const result = name
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    NORMALISE_SECTION_KEY_CACHE[cacheKey] = result;
    return result;
  } catch (error) {
    // Log critical errors to console (errors still visible without full trace overhead)
    console.error('[TemplateManager][normaliseSectionKey] Error:', error);
    throw error;
  }
}

// Resolution cache for resolveWorkflowCanonical (called 10+ times with repeated inputs)
let RESOLVE_WORKFLOW_CACHE = {};

/**
 * Resolve a workflow taxonomy key into its canonical identifier.
 * Falls back to normaliseSectionKey when no mapper exists.
 *
 * Trace logging removed + result caching for instant repeated lookups
 * Called 10+ times during startup, each trace added 1-6s overhead
 *
 * Performance:
 * - Cache miss: ~1-2ms (mapper + normalization)
 * - Cache hit: <0.001ms (instant lookup)
 *
 * @param {string} value
 * @return {string}
 */
function resolveWorkflowCanonical(value) {
  try {
    if (!RESOLVE_WORKFLOW_CACHE || typeof RESOLVE_WORKFLOW_CACHE !== 'object') {
      RESOLVE_WORKFLOW_CACHE = {};
    }
    // Check cache first
    if (value && RESOLVE_WORKFLOW_CACHE.hasOwnProperty(value)) {
      return RESOLVE_WORKFLOW_CACHE[value];
    }

    const mapper = (typeof mapWorkflowCanonical === 'function')
      ? mapWorkflowCanonical
      : null;
    const legacyMap = getWorkflowLegacyCanonicalMap();

    let result;

    try {
      if (mapper) {
        const resolved = mapper(value) || mapper(normaliseSectionKey(value));
        if (resolved) {
          result = resolved;
          RESOLVE_WORKFLOW_CACHE[value] = result;
          return result;
        }
      }
    } catch (error) {
      try { UnifiedLogger.warn('TemplateManager', 'resolveWorkflowCanonical mapper failed', String(error)); } catch (ignore) {
        console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
      }
    }

    const normalized = normaliseSectionKey(value);
    if (normalized && legacyMap[normalized]) {
      result = legacyMap[normalized];
    } else {
      result = normalized;
    }

    // Cache result
    RESOLVE_WORKFLOW_CACHE[value] = result;
    return result;
  } catch (error) {
    console.error('[TemplateManager][resolveWorkflowCanonical] Error:', error);
    // Fallback to normalized value
    const fallback = normaliseSectionKey(value);
    RESOLVE_WORKFLOW_CACHE[value] = fallback;
    return fallback;
  }
}

/**
 * Phase A (v3.1): Workflow legacy map caching using PropertiesCache namespace
 *
 * ROOT FIX: Cache legacy map using enhanced PropertiesCache with 'workflows' namespace
 *
 * Performance impact:
 * - BEFORE: Map loaded on EVERY resolveWorkflowCanonical() call
 *   10 calls: 10 × 12s = 120s (map loaded 10 times)
 * - AFTER: Map loaded ONCE, cached for 1 hour with namespace isolation
 *   10 calls: 0.2s + 9×0.01s = ~0.3s (map loaded once, cached)
 * - Improvement: 400x faster
 */
function getWorkflowLegacyCanonicalMap() {
  try {
    // PropertiesCache has been deprecated - loading directly from globalThis
    // TODO: Consider using ConfigurationManager for caching
    let legacyMap = null;

    // Load from globalThis
    if (typeof WORKFLOW_LEGACY_CANONICAL_MAP !== 'undefined' && WORKFLOW_LEGACY_CANONICAL_MAP) {
      legacyMap = WORKFLOW_LEGACY_CANONICAL_MAP;
    } else {
      legacyMap = {};
    }

    return legacyMap;
  } catch (error) {
    console.error('[TemplateManager][getWorkflowLegacyCanonicalMap] Error:', error);
    throw error;
  }
}

function cloneWorkflowSectionTaxonomy() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'cloneWorkflowSectionTaxonomy');
  try {
    let workflowTaxonomy = typeof WORKFLOW_SECTION_TAXONOMY !== "undefined" && Array.isArray(WORKFLOW_SECTION_TAXONOMY)
      ? WORKFLOW_SECTION_TAXONOMY
      : [];
    if (!workflowTaxonomy.length && typeof WORKFLOW_TAXONOMY_MAP !== 'undefined' && typeof WORKFLOW_TAXONOMY_MAP === 'object') {
      workflowTaxonomy = Object.keys(WORKFLOW_TAXONOMY_MAP).map(function(key) {
        return WORKFLOW_TAXONOMY_MAP[key];
      });
    }
    if (!Array.isArray(workflowTaxonomy) || workflowTaxonomy.length === 0) {
      trace.complete('cloneWorkflowSectionTaxonomy completed - empty', { count: 0 });
      return [];
    }
    const legacyMap = getWorkflowLegacyCanonicalMap();
    const taxonomy = workflowTaxonomy.filter(entry => entry);
    const result = taxonomy.map(entry => {
      const canonicalSlug = normaliseSectionKey(entry.canonical);
      const base = {
        canonical: canonicalSlug,
        label: entry.label,
        weight: entry.weight !== undefined ? entry.weight : 1,
        isSection: entry.isSection !== false,
        synonyms: Array.isArray(entry.synonyms) ? entry.synonyms.slice() : [],
        taxonomyVersion: typeof WORKFLOW_SECTION_TAXONOMY_VERSION === 'string'
          ? WORKFLOW_SECTION_TAXONOMY_VERSION
          : 'unversioned'
      };
      Object.entries(legacyMap || {}).forEach(([legacyKey, mappedCanonical]) => {
        if (mappedCanonical === base.canonical) {
          if (base.synonyms.indexOf(legacyKey) === -1) {
            base.synonyms.push(legacyKey);
          }
          const friendly = legacyKey.replace(/-/g, ' ').trim();
          if (friendly && base.synonyms.indexOf(friendly) === -1) {
            base.synonyms.push(friendly);
          }
        }
      });
      if (legacyMap && legacyMap[canonicalSlug]) {
        base.legacy = canonicalSlug;
        base.canonical = legacyMap[canonicalSlug];
      }
      return base;
    });
    trace.complete('cloneWorkflowSectionTaxonomy completed', { count: result.length });
    return result;
  } catch (error) {
    trace.fail('cloneWorkflowSectionTaxonomy failed', error);
    throw error;
  }
}

function maybeUpgradeSectionTaxonomy(entries) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'maybeUpgradeSectionTaxonomy');
  try {
    const baseMap = new Map(cloneWorkflowSectionTaxonomy().map(entry => {
      return [entry.canonical, Object.assign({}, entry, { synonyms: entry.synonyms ? entry.synonyms.slice() : [] })];
    }));

    if (Array.isArray(entries)) {
      entries.forEach(entry => {
        if (!entry) {
          return;
        }
        const sourceKey = entry.canonical || entry.label;
        const canonical = resolveWorkflowCanonical(sourceKey);
        if (!canonical || !baseMap.has(canonical)) {
          return;
        }
        const target = baseMap.get(canonical);
        const synonyms = new Set(target.synonyms);
        if (Array.isArray(entry.synonyms)) {
          entry.synonyms.forEach(value => {
            const trimmed = value && value.toString().trim();
            if (trimmed) {
              synonyms.add(trimmed);
            }
          });
        }
        if (entry.label && entry.label !== target.label) {
          synonyms.add(entry.label.toString().trim());
        }
        if (entry.weight !== undefined && !isNaN(entry.weight)) {
          target.weight = Number(entry.weight);
        }
        target.synonyms = filterTruthy(Array.from(synonyms));
      });
    }

    const upgraded = Array.from(baseMap.values());
    if (upgraded.length === 0 && Array.isArray(entries)) {
      const result = entries.map(function(entry) {
        if (!entry) {
          return null;
        }
        const canonical = resolveWorkflowCanonical(entry.canonical || entry.label) || normaliseSectionKey(entry.label || entry.canonical || '');
        if (!canonical) {
          return null;
        }
        return {
          canonical: canonical,
          label: entry.label || entry.canonical || canonical,
          weight: entry.weight !== undefined && !isNaN(entry.weight) ? Number(entry.weight) : 1,
          isSection: entry.isSection !== false,
          synonyms: Array.isArray(entry.synonyms) ? entry.synonyms.slice() : []
        };
      });
      const filteredResult = filterTruthy(result);
      trace.complete('maybeUpgradeSectionTaxonomy completed - fallback', { count: filteredResult.length });
      return filteredResult;
    }

    trace.complete('maybeUpgradeSectionTaxonomy completed', { count: upgraded.length });
    return upgraded;
  } catch (error) {
    trace.fail('maybeUpgradeSectionTaxonomy failed', error);
    throw error;
  }
}

/**
 * Provide a safe default taxonomy when no data exists.
 * @return {Array<Object>}
 */
function getDefaultSectionTaxonomy() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'getDefaultSectionTaxonomy');
  try {
    const result = cloneWorkflowSectionTaxonomy();
    trace.complete('getDefaultSectionTaxonomy completed', { count: result.length });
    return result;
  } catch (error) {
    trace.fail('getDefaultSectionTaxonomy failed', error);
    throw error;
  }
}

/**
 * Return canonical section names used in dropdowns.
 * @return {Array<string>}
 */
function getMasterSectionNames() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'getMasterSectionNames');
  try {
    const result = getSectionTaxonomy()
      .filter(entry => entry.isSection)
      .map(entry => entry.label);
    trace.complete('getMasterSectionNames completed', { count: result.length });
    return result;
  } catch (error) {
    trace.fail('getMasterSectionNames failed', error);
    try { UnifiedLogger.warn('TemplateManager', 'getMasterSectionNames', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    return [];
  }
}

/**
 * Refresh the master validation lookup sheet.
 * @return {Object} Stats about the refresh
 */
function refreshValidationLookups() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'refreshValidationLookups');
  try {
    const sheet = ensureValidationLookupSheet();

    let maxValues = 0;
    let sectionNamesForConfig = null;

    VALIDATION_COLUMNS.forEach((column, index) => {
      const columnIndex = index + 1;
      let values = column.producer();

      if (!Array.isArray(values)) {
        values = [];
      }

      values = values
        .map(value => (value !== undefined && value !== null ? value.toString().trim() : ''))
        .filter(value => value.length > 0);

      if (column.header === 'Section Names') {
        sectionNamesForConfig = values.slice();
      }

      if (values.length === 0) {
        try { UnifiedLogger.warn('TemplateManager', `refreshValidationLookups producer returned no values`, { header: column.header }); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
      } else {
        try { UnifiedLogger.info('TemplateManager', 'refreshValidationLookups', { header: column.header, values: values }); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
      }

      maxValues = Math.max(maxValues, values.length);

      ensureMinimumRows(sheet, values.length + 1);

      if (values.length > 0) {
        const data = values.map(value => [value]);
        const columnRange = sheet.getRange(2, columnIndex, values.length, 1);
        columnRange.clearContent();
        columnRange.setValues(data);
        const extraRows = sheet.getMaxRows() - (values.length + 1);
        if (extraRows > 0) {
          sheet.getRange(values.length + 2, columnIndex, extraRows, 1).clearContent();
        }
      }
    });

    try { UnifiedLogger.info('TemplateManager', 'Validation lookups refreshed', { columns: VALIDATION_COLUMNS.length, maxRows: maxValues }); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }

    if (sectionNamesForConfig && sectionNamesForConfig.length > 0) {
      try {
        const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CONFIG);
        writeConfigValue(configSheet, 'SECTION_TAXONOMY', JSON.stringify(sectionNamesForConfig));
      } catch (configError) {
        try { UnifiedLogger.warn('TemplateManager', 'Failed to update SECTION_TAXONOMY config', String(configError)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
      }
    }

    try {
      ensureQuoteBuilderTemplateRow(SpreadsheetApp.getActiveSpreadsheet());
    } catch (formulaError) {
      try { UnifiedLogger.warn('TemplateManager', 'ensureQuoteBuilderTemplateRow failed in master', String(formulaError)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }

    try {
      applyMasterValidations();
    } catch (error) {
      try { UnifiedLogger.warn('TemplateManager', 'applyMasterValidations failed', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }

    try {
      ensureInventorySyncConfig(SpreadsheetApp.getActiveSpreadsheet());
    } catch (configError) {
      try { UnifiedLogger.warn('TemplateManager', 'ensureInventorySyncConfig failed', String(configError)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }

    const result = {
      columns: VALIDATION_COLUMNS.length,
      maxValues: maxValues
    };
    trace.complete('refreshValidationLookups completed', result);
    return result;
  } catch (error) {
    trace.fail('refreshValidationLookups failed', error);
    throw error;
  }
}

/**
 * Ensure the validation lookup sheet exists and is formatted.
 * @return {Sheet} The prepared lookup sheet
 */
function ensureValidationLookupSheet() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'ensureValidationLookupSheet');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAMES.VALIDATION_LOOKUPS);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAMES.VALIDATION_LOOKUPS);
    }

    const headers = VALIDATION_COLUMNS.map(column => column.header);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#f1f3f4');

    sheet.setFrozenRows(1);
    ensureMinimumRows(sheet, 2);

    trace.complete('ensureValidationLookupSheet completed', { sheetName: SHEET_NAMES.VALIDATION_LOOKUPS, headerCount: headers.length });
    return sheet;
  } catch (error) {
    trace.fail('ensureValidationLookupSheet failed', error);
    throw error;
  }
}

/**
 * Create a new quote template spreadsheet based on the configured base file.
 */
function createQuoteTemplate() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'createQuoteTemplate');
  try {
    refreshValidationLookups();

    const ui = SpreadsheetApp.getUi();
    const namePrompt = ui.prompt(
      'Create Quote Template',
      'Enter a name for the new quote template spreadsheet:',
      ui.ButtonSet.OK_CANCEL
    );

    if (namePrompt.getSelectedButton() !== ui.Button.OK) {
      showWarningToast('Template creation cancelled');
      trace.complete('createQuoteTemplate cancelled by user', {});
      return;
    }

    const templateName = namePrompt.getResponseText().trim();
    if (!templateName) {
      showErrorToast('Template name is required');
      trace.complete('createQuoteTemplate failed - no name', {});
      return;
    }

    try {
      ensureQuoteBuilderTemplateRow(SpreadsheetApp.getActiveSpreadsheet());
    } catch (error) {
      try { UnifiedLogger.warn('TemplateManager', 'ensureQuoteBuilderTemplateRow (master) failed before copy', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }

    try {
      ensureInventorySyncConfig(SpreadsheetApp.getActiveSpreadsheet());
    } catch (configError) {
      try { UnifiedLogger.warn('TemplateManager', 'ensureInventorySyncConfig (master) failed before copy', String(configError)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }

    let destinationFolder = null;
    const folderId = getScriptProperty(SCRIPT_PROPERTY_KEYS.TEMPLATE_FOLDER);
    try {
      if (folderId) {
        destinationFolder = DriveApp.getFolderById(folderId);
      } else {
        const masterFile = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
        const parents = masterFile.getParents();
        destinationFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
      }
    } catch (error) {
      throw new AppError('TEMPLATE_FOLDER_ERROR', `Unable to resolve template destination folder: ${error.message}`);
    }

    const masterFile = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
    const copy = masterFile.makeCopy(templateName, destinationFolder);
    const newSpreadsheetId = copy.getId();

    initializeQuoteTemplate(newSpreadsheetId);

    showSuccessToast(`Template created. Open it now and click "Allow access" on the _MasterLinks tab. ${copy.getUrl()}`);
    try { UnifiedLogger.info('TemplateManager', 'Quote template created', { templateName: templateName, spreadsheetId: newSpreadsheetId }); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    trace.complete('createQuoteTemplate completed', { templateName: templateName, spreadsheetId: newSpreadsheetId });
  } catch (error) {
    trace.fail('createQuoteTemplate failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Creating quote template',
      correlationId: trace.correlationId
    });
    showErrorToast('Template Creation Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Perform all post-copy setup steps on a new template spreadsheet.
 * @param {string} spreadsheetId
 */
function initializeQuoteTemplate(spreadsheetId) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'initializeQuoteTemplate');
  try {
    const masterId = SpreadsheetApp.getActive().getId();
    const newSs = SpreadsheetApp.openById(spreadsheetId);

    removeUnexpectedSheets(newSs);
    ensureTemplateSheetsPresent(newSs);
    ensureInventorySyncConfig(newSs);
    resetQuoteBuilderSheet(newSs);

    seedMasterLinkSheet(newSs, masterId);
    applyTemplateValidations(newSs);
    try {
      ensureQuoteBuilderTemplateRow(newSs);
    } catch (formulaError) {
      try { UnifiedLogger.warn('TemplateManager', 'Failed to set template row formulas in new template', String(formulaError)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }
    copyTemplateFormulas(newSs);
    resetTemplateConfig(newSs);

    SpreadsheetApp.flush();
    trace.complete('initializeQuoteTemplate completed', { spreadsheetId: spreadsheetId });
  } catch (error) {
    trace.fail('initializeQuoteTemplate failed', error);
    throw error;
  }
}

/**
 * Remove any sheets that are not part of the quote template core.
 * @param {Spreadsheet} ss
 */
function removeUnexpectedSheets(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'removeUnexpectedSheets');
  try {
    const allowed = new Set([
      SHEET_NAMES.CONFIG,
      SHEET_NAMES.QUOTE_BUILDER,
      SHEET_NAMES.CLIENT_VIEW,
      SHEET_NAMES.INTERNAL_VIEW
    ]);

    let removedCount = 0;
    ss.getSheets().forEach(sheet => {
      if (!allowed.has(sheet.getName())) {
        ss.deleteSheet(sheet);
        removedCount++;
      }
    });

    trace.complete('removeUnexpectedSheets completed', { removedCount: removedCount });
  } catch (error) {
    trace.fail('removeUnexpectedSheets failed', error);
    throw error;
  }
}

/**
 * Clear data and reset template row in Quote_Builder tab.
 * @param {Spreadsheet} ss
 */
function resetQuoteBuilderSheet(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'resetQuoteBuilderSheet');
  try {
    const qbSheet = ss.getSheetByName(SHEET_NAMES.QUOTE_BUILDER);
    if (!qbSheet) {
      throw new AppError('SHEET_MISSING', 'Quote_Builder sheet missing while resetting');
    }

    // Clear template row manual-entry columns
    qbSheet.getRangeList(['B3', 'C3', 'D3', 'F3', 'G3', 'H3', 'I3', 'K3', 'N3', 'O3', 'P3', 'Q3', 'R3', 'S3', 'T3', 'U3']).clearContent();

    const scopeEntryColumn = QB_COLS.SCOPE_ENTRY_ID + 1;
    if (qbSheet.getLastColumn() < scopeEntryColumn) {
      qbSheet.insertColumnAfter(QB_COLS.NOTES + 1);
    }
    const headerRow = 2;
    const headerCell = qbSheet.getRange(headerRow, scopeEntryColumn);
    if (!headerCell.getValue()) {
      headerCell.setValue('ScopeEntryId');
    }

    // Clear data rows (leave row 3 as template)
    const lastColumn = qbSheet.getLastColumn();
    if (qbSheet.getMaxRows() > 3) {
      qbSheet.getRange(4, 1, qbSheet.getMaxRows() - 3, lastColumn).clearContent();
      qbSheet.getRange(4, 1, qbSheet.getMaxRows() - 3, lastColumn).clearDataValidations();
    }

    trace.complete('resetQuoteBuilderSheet completed', { maxRows: qbSheet.getMaxRows(), lastColumn: lastColumn });
  } catch (error) {
    trace.fail('resetQuoteBuilderSheet failed', error);
    throw error;
  }
}

/**
 * Ensure essential template sheets exist.
 * @param {Spreadsheet} ss
 */
function ensureTemplateSheetsPresent(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'ensureTemplateSheetsPresent');
  try {
    const required = [
      SHEET_NAMES.CONFIG,
      SHEET_NAMES.QUOTE_BUILDER,
      SHEET_NAMES.CLIENT_VIEW,
      SHEET_NAMES.INTERNAL_VIEW
    ];

    required.forEach(name => {
      if (!ss.getSheetByName(name)) {
        throw new AppError('SHEET_MISSING', `Template spreadsheet missing required sheet: ${name}`);
      }
    });

    trace.complete('ensureTemplateSheetsPresent completed', { requiredCount: required.length });
  } catch (error) {
    trace.fail('ensureTemplateSheetsPresent failed', error);
    throw error;
  }
}

/**
 * Seed hidden master link sheet with IMPORTRANGE formulas.
 * @param {Spreadsheet} ss
 * @param {string} masterId
 */
function seedMasterLinkSheet(ss, masterId) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'seedMasterLinkSheet');
  try {
    const sheetName = '_MasterLinks';
    let sheet = ss.getSheetByName(sheetName);

    if (sheet) {
      sheet.clear();
      sheet.clearFormats();
    } else {
      sheet = ss.insertSheet(sheetName);
    }

    const headers = VALIDATION_COLUMNS.map(column => column.header);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#e8f0fe');

    let totalColumns = headers.length;

    VALIDATION_COLUMNS.forEach((column, index) => {
      const columnIndex = index + 1;
      const columnLetter = QuoteUtils.columnIndexToLetter(columnIndex - 1);
      const formula = `=ARRAYFORMULA(IMPORTRANGE("${masterId}", "${SHEET_NAMES.VALIDATION_LOOKUPS}!${columnLetter}:${columnLetter}"))`;
      sheet.getRange(2, columnIndex).setValue(formula);
    });

    MASTER_LINK_XERO_COLUMNS.forEach((column, index) => {
      const columnIndex = headers.length + index + 1;
      sheet.getRange(1, columnIndex).setValue(column.header);
      const formula = `=ARRAYFORMULA(IMPORTRANGE("${masterId}", "${column.range}"))`;
      sheet.getRange(2, columnIndex).setValue(formula);
      totalColumns = columnIndex;
    });

    ensureMinimumRows(sheet, 1000);

    sheet.setFrozenRows(1);
    sheet.showSheet();
    sheet.setTabColor('#fbbc04');
    sheet.getRange('A1').setNote('Allow access when prompted. After approval you can hide this sheet.');

    trace.complete('seedMasterLinkSheet completed', { masterId: masterId, totalColumns: totalColumns });
    return totalColumns;
  } catch (error) {
    trace.fail('seedMasterLinkSheet failed', error);
    throw error;
  }
}

/**
 * Apply quote builder & config data validations using the master link sheet.
 * @param {Spreadsheet} ss
 */
function applyTemplateValidations(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'applyTemplateValidations');
  try {
    const qbSheet = ss.getSheetByName(SHEET_NAMES.QUOTE_BUILDER);
    const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
    const linkSheet = ss.getSheetByName('_MasterLinks');

    if (!qbSheet || !configSheet || !linkSheet) {
      throw new AppError('VALIDATION_SETUP_FAILED', 'Template validation setup failed: required sheet missing');
    }

    const totalRows = Math.max(linkSheet.getMaxRows() - 1, 1);
    const validationColumnCount = VALIDATION_COLUMNS.length;

    const validations = [
      { range: qbSheet.getRange('B3:B1000'), linkRange: linkSheet.getRange(2, 1, totalRows, 1), allowInvalid: false },
      { range: qbSheet.getRange('C3:C1000'), linkRange: linkSheet.getRange(2, 2, totalRows, 1), allowInvalid: false },
      { range: qbSheet.getRange('D3:D1000'), linkRange: linkSheet.getRange(2, 3, totalRows, 1), allowInvalid: true },
      { range: qbSheet.getRange('E3:E1000'), linkRange: linkSheet.getRange(2, validationColumnCount + 1, totalRows, 1), allowInvalid: false },
      { range: qbSheet.getRange('N3:N1000'), linkRange: linkSheet.getRange(2, 4, totalRows, 1), allowInvalid: true },
      { range: configSheet.getRange('B19:B21'), linkRange: linkSheet.getRange(2, 4, totalRows, 1), allowInvalid: true }
    ];

    validations.forEach(({ range, linkRange, allowInvalid }) => {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInRange(linkRange, true)
        .setAllowInvalid(!!allowInvalid)
        .build();

      range.setDataValidation(rule);
    });

    qbSheet.getRange('F3:F1000').clearDataValidations();
    qbSheet.getRange('J3:J1000').clearDataValidations();

    applyStagingValidations(ss);
    trace.complete('applyTemplateValidations completed', { validationCount: validations.length });
  } catch (error) {
    trace.fail('applyTemplateValidations failed', error);
    throw error;
  }
}


/**
 * Apply validation rules in the master spreadsheet using the lookup sheet.
 */
function applyMasterValidations() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'applyMasterValidations');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lookupSheet = ss.getSheetByName(SHEET_NAMES.VALIDATION_LOOKUPS);
    const qbSheet = ss.getSheetByName(SHEET_NAMES.QUOTE_BUILDER);
    const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
    const xeroSheet = ss.getSheetByName(SHEET_NAMES.XERO_READY);

    if (!lookupSheet || !qbSheet || !configSheet) {
      throw new AppError('VALIDATION_SETUP_FAILED', 'applyMasterValidations: required sheet missing');
    }

    const totalRows = Math.max(lookupSheet.getLastRow() - 1, 1);

    const masterValidations = [
      { range: qbSheet.getRange('B3:B1000'), column: 1, allowInvalid: false },
      { range: qbSheet.getRange('C3:C1000'), column: 2, allowInvalid: false },
      { range: qbSheet.getRange('D3:D1000'), column: 3, allowInvalid: true },
      { range: qbSheet.getRange('N3:N1000'), column: 4, allowInvalid: true },
      { range: configSheet.getRange('B19:B21'), column: 4, allowInvalid: true }
    ];

    masterValidations.forEach(({ range, column, allowInvalid }) => {
      const valueRange = lookupSheet.getRange(2, column, totalRows, 1);
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInRange(valueRange, true)
        .setAllowInvalid(!!allowInvalid)
        .build();

      range.setDataValidation(rule);
    });

    if (xeroSheet) {
      const lastRow = xeroSheet.getLastRow();
      if (lastRow > 1) {
        const itemCodeRange = xeroSheet.getRange(2, XERO_COLS.SKU + 1, lastRow - 1, 1);
        const skuRule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(itemCodeRange, true)
          .setAllowInvalid(false)
          .build();
        qbSheet.getRange('E3:E1000').setDataValidation(skuRule);
        qbSheet.getRange('F3:F1000').clearDataValidations();
      } else {
        try { UnifiedLogger.info('TemplateManager', 'applyMasterValidations: XERO_READY has no data rows to build SKU validation'); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
      }
    } else {
      try { UnifiedLogger.info('TemplateManager', 'applyMasterValidations: XERO_READY sheet not found, skipping SKU validation'); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    }

    applyStagingValidations(ss);
    trace.complete('applyMasterValidations completed', { masterValidationCount: masterValidations.length, hasXeroSheet: !!xeroSheet });
  } catch (error) {
    trace.fail('applyMasterValidations failed', error);
    throw error;
  }
}

/**
 * Copy template formulas from row 3 down the working range.
 * @param {Spreadsheet} ss
 */
function copyTemplateFormulas(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'copyTemplateFormulas');
  try {
    const qbSheet = ss.getSheetByName(SHEET_NAMES.QUOTE_BUILDER);
    const lastColumn = qbSheet.getLastColumn();
    const totalRows = qbSheet.getMaxRows();

    if (totalRows <= 3) {
      trace.complete('copyTemplateFormulas completed - not enough rows', { totalRows: totalRows });
      return;
    }

    const source = qbSheet.getRange(3, 1, 1, lastColumn);
    const targetRowCount = totalRows - 3;
    const target = qbSheet.getRange(4, 1, targetRowCount, lastColumn);
    source.copyTo(target, { contentsOnly: false });

    syncQuoteStagingTemplate(ss);
    trace.complete('copyTemplateFormulas completed', { totalRows: totalRows, lastColumn: lastColumn, targetRowCount: targetRowCount });
  } catch (error) {
    trace.fail('copyTemplateFormulas failed', error);
    throw error;
  }
}

function applyStagingValidations(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'applyStagingValidations');
  try {
    const stagingSheet = getQuoteStagingSheet();
    if (!stagingSheet) {
      try { UnifiedLogger.info('TemplateManager', 'applyStagingValidations: staging sheet not available'); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
      trace.complete('applyStagingValidations completed - no staging sheet', {});
      return;
    }
    const xeroSheet = ss.getSheetByName(SHEET_NAMES.XERO_READY);
    if (xeroSheet) {
      const lastRow = xeroSheet.getLastRow();
      if (lastRow > 1) {
        const itemCodeRange = xeroSheet.getRange(2, XERO_COLS.SKU + 1, lastRow - 1, 1);
        const skuRule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(itemCodeRange, true)
          .setAllowInvalid(false)
          .build();
        stagingSheet.getRange('E3:E1000').setDataValidation(skuRule);
      }
    }
    stagingSheet.getRange('F3:F1000').clearDataValidations();
    stagingSheet.getRange('J3:J1000').clearDataValidations();
    trace.complete('applyStagingValidations completed', { hasXeroSheet: !!xeroSheet });
  } catch (error) {
    trace.fail('applyStagingValidations failed', error);
    try { UnifiedLogger.warn('TemplateManager', 'applyStagingValidations failed', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
  }
}

function syncQuoteStagingTemplate(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'syncQuoteStagingTemplate');
  try {
    const stagingSheet = getQuoteStagingSheet();
    if (!stagingSheet) {
      try { UnifiedLogger.info('TemplateManager', 'syncQuoteStagingTemplate: staging sheet unavailable'); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
      trace.complete('syncQuoteStagingTemplate completed - no staging sheet', {});
      return;
    }
    const qbSheet = ss.getSheetByName(SHEET_NAMES.QUOTE_BUILDER);
    if (!qbSheet) {
      trace.complete('syncQuoteStagingTemplate completed - no quote builder', {});
      return;
    }
    const lastColumn = qbSheet.getLastColumn();
    const templateRange = qbSheet.getRange(3, 1, 1, lastColumn);
    templateRange.copyTo(stagingSheet.getRange(3, 1, 1, lastColumn), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    const dataRows = Math.max(stagingSheet.getMaxRows() - 3, 0);
    if (dataRows > 0) {
      stagingSheet.getRange(4, 1, dataRows, lastColumn).clearContent();
    }
    applyStagingValidations(ss);
    trace.complete('syncQuoteStagingTemplate completed', { lastColumn: lastColumn, dataRows: dataRows });
  } catch (error) {
    trace.fail('syncQuoteStagingTemplate failed', error);
    try { UnifiedLogger.warn('TemplateManager', 'syncQuoteStagingTemplate failed', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
  }
}

/**
 * Reset Config tab values to blank/default for new template.
 * @param {Spreadsheet} ss
 */
function resetTemplateConfig(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'resetTemplateConfig');
  try {
    const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
    if (!configSheet) {
      throw new AppError('SHEET_MISSING', 'Config sheet missing in template');
    }

    const clearKeys = [
      'PROJECT_NAME',
      'CLIENT_NAME',
      'QUOTE_NUMBER',
      'PROJECT_DESCRIPTION',
      'QUOTED_BY',
      'XERO_QUOTE_ID',
      'XERO_QUOTE_URL',
      'QUOTE_STATUS'
    ];

    clearKeys.forEach(key => setConfigValueByKey(configSheet, key, null));
    setConfigValueByKey(configSheet, 'QUOTE_DATE', '=TODAY()');
    setConfigValueByKey(configSheet, 'QUOTE_VALID_UNTIL', '=TODAY()+30');
    INVENTORY_CONFIG_TOGGLES.forEach(toggle => {
      try {
        setConfigValueByKey(configSheet, toggle.key, toggle.defaultValue);
      } catch (e) {
        try { UnifiedLogger.warn('TemplateManager', 'resetTemplateConfig: unable to set toggle', { key: toggle.key, error: String(e) }); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
      }
    });

    trace.complete('resetTemplateConfig completed', { clearedKeys: clearKeys.length, toggles: INVENTORY_CONFIG_TOGGLES.length });
  } catch (error) {
    trace.fail('resetTemplateConfig failed', error);
    throw error;
  }
}

/**
 * Ensure sheet has at least the required number of rows.
 * @param {Sheet} sheet
 * @param {number} requiredRows
 */
function ensureMinimumRows(sheet, requiredRows) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'ensureMinimumRows');
  try {
    const current = sheet.getMaxRows();
    if (current < requiredRows) {
      sheet.insertRowsAfter(current, requiredRows - current);
      trace.complete('ensureMinimumRows completed - rows added', { current: current, required: requiredRows, added: requiredRows - current });
    } else {
      trace.complete('ensureMinimumRows completed - sufficient rows', { current: current, required: requiredRows });
    }
  } catch (error) {
    trace.fail('ensureMinimumRows failed', error);
    throw error;
  }
}

/**
 * Ensure Quote_Builder row 3 formulas align with XERO_READY/_MasterLinks lookups.
 * @param {Spreadsheet} ss
 */
function ensureQuoteBuilderTemplateRow(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'ensureQuoteBuilderTemplateRow');
  try {
    const qbSheet = ss.getSheetByName(SHEET_NAMES.QUOTE_BUILDER);
    if (!qbSheet) {
      throw new AppError('SHEET_MISSING', 'Quote_Builder sheet missing while ensuring template row');
    }

    const hasMasterLinks = ss.getSheetByName('_MasterLinks') !== null;
    const hasLocalXero = ss.getSheetByName(SHEET_NAMES.XERO_READY) !== null;

    let descriptionFormula;
    if (hasLocalXero && hasMasterLinks) {
      descriptionFormula = '=IF($E3="","",IFERROR(INDEX(XERO_READY!$C:$C, MATCH($E3, XERO_READY!$A:$A, 0)),IFERROR(INDEX(_MasterLinks!$F$2:$F, MATCH($E3, _MasterLinks!$E$2:$E, 0)),"")))';
    } else if (hasLocalXero) {
      descriptionFormula = '=IF($E3="","",IFERROR(INDEX(XERO_READY!$C:$C, MATCH($E3, XERO_READY!$A:$A, 0)),""))';
    } else if (hasMasterLinks) {
      descriptionFormula = '=IF($E3="","",IFERROR(INDEX(_MasterLinks!$F$2:$F, MATCH($E3, _MasterLinks!$E$2:$E, 0)),""))';
    } else {
      descriptionFormula = '=IF($E3="","")';
    }

    let unitRateFormula;
    if (hasLocalXero && hasMasterLinks) {
      unitRateFormula = '=IF(ISBLANK(E3),"",IFERROR(INDEX(XERO_READY!$D:$D, MATCH(E3, XERO_READY!$A:$A, 0)),IFERROR(INDEX(_MasterLinks!$G$2:$G, MATCH(E3, _MasterLinks!$E$2:$E, 0)),"")))';
    } else if (hasLocalXero) {
      unitRateFormula = '=IF(ISBLANK(E3),"",IFERROR(INDEX(XERO_READY!$D:$D, MATCH(E3, XERO_READY!$A:$A, 0)),""))';
    } else if (hasMasterLinks) {
      unitRateFormula = '=IF(ISBLANK(E3),"",IFERROR(INDEX(_MasterLinks!$G$2:$G, MATCH(E3, _MasterLinks!$E$2:$E, 0)),""))';
    } else {
      unitRateFormula = '=IF(ISBLANK(E3),"","")';
    }

    qbSheet.getRange('F3').setFormula(descriptionFormula);
    qbSheet.getRange('J3').setFormula(unitRateFormula);

    qbSheet.getRange('L3').setFormula('=IF(OR(B3="Section",B3="Fee",ISBLANK(H3),ISBLANK(J3)),"",H3*J3*(1+IF(ISBLANK(K3),0,K3)))');
    qbSheet.getRange('M3').setFormula('=IF(B3="Section",SUMIFS($L:$L,$D:$D,D3,$B:$B,"Line",$C:$C,"<>Hidden"),"")');
    qbSheet.getRange('O3').setFormula('=IF(B3="Fee",SUMIF($B$3:B2,"Section",$M$3:M2),"")');
    qbSheet.getRange('P3').setFormula('=IF(B3="Fee",O3*N3,"")');
    qbSheet.getRange('Q3').setFormula('=IF(C3="Hidden","",IF(B3="Section",M3,IF(B3="Fee",P3,IF(C3="Client",L3,""))))');
    qbSheet.getRange('R3').setFormula('=IF(B3="Line",L3,"")');
    qbSheet.getRange('S3').setFormula('=IF(B3="Fee",P3,"")');

    syncQuoteStagingTemplate(ss);

    syncQuoteStagingTemplate(ss);
    trace.complete('ensureQuoteBuilderTemplateRow completed', { hasMasterLinks: hasMasterLinks, hasLocalXero: hasLocalXero });
  } catch (error) {
    trace.fail('ensureQuoteBuilderTemplateRow failed', error);
    throw error;
  }
}

/**
 * Ensure inventory sync toggles exist in Config sheet.
 * @param {Spreadsheet} ss
 */
function ensureInventorySyncConfig(ss) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'ensureInventorySyncConfig');
  try {
    const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
    if (!configSheet) {
      throw new AppError('SHEET_MISSING', 'Config sheet not found while ensuring inventory sync toggles');
    }

    const lastRow = configSheet.getLastRow();
    const data = configSheet.getRange(1, 1, lastRow, 3).getValues();
    let quoteSettingsRow = data.findIndex(row => row[0] === 'Quote Settings');
    if (quoteSettingsRow === -1) {
      quoteSettingsRow = lastRow - 1;
    }

    let insertRow = quoteSettingsRow + 2; // start two rows below quote settings header

    INVENTORY_CONFIG_TOGGLES.forEach(toggle => {
      const currentData = configSheet.getRange(1, 1, configSheet.getLastRow(), 3).getValues();
      let rowIndex = currentData.findIndex(row => row[0] === toggle.key);

      if (rowIndex === -1) {
        if (insertRow > configSheet.getLastRow() + 1) {
          insertRow = configSheet.getLastRow() + 1;
        }
        configSheet.insertRows(insertRow);
        rowIndex = insertRow - 1;
      } else {
        insertRow = rowIndex + 2;
      }

      const keyCell = configSheet.getRange(rowIndex + 1, 1);
      const valueCell = configSheet.getRange(rowIndex + 1, 2);
      const noteCell = configSheet.getRange(rowIndex + 1, 3);

      keyCell.clearDataValidations();
      valueCell.clearDataValidations();
      noteCell.clearDataValidations();

      keyCell.setValue(toggle.key);

      if (valueCell.isBlank()) {
        valueCell.setValue(toggle.defaultValue);
      }

      noteCell.setValue(toggle.note);
    });

    trace.complete('ensureInventorySyncConfig completed', { toggleCount: INVENTORY_CONFIG_TOGGLES.length });
  } catch (error) {
    trace.fail('ensureInventorySyncConfig failed', error);
    throw error;
  }
}

/**
 * Set Config sheet value by key.
 * @param {Sheet} configSheet
 * @param {string} key
 * @param {string|null} value
 */
function setConfigValueByKey(configSheet, key, value) {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'setConfigValueByKey');
  try {
    const lastRow = configSheet.getLastRow();
    if (lastRow === 0) {
      throw new AppError('CONFIG_ERROR', 'Config sheet is empty');
    }

    const values = configSheet.getRange(1, 1, lastRow, 2).getValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === key) {
        const cell = configSheet.getRange(i + 1, 2);
        if (value === null || value === '') {
          cell.clearContent();
        } else if (typeof value === 'string' && value.startsWith('=')) {
          cell.setFormula(value);
        } else {
          cell.setValue(value);
        }
        trace.complete('setConfigValueByKey completed', { key: key, valueType: typeof value });
        return;
      }
    }

    throw new AppError('CONFIG_ERROR', `Config key not found: ${key}`);
  } catch (error) {
    trace.fail('setConfigValueByKey failed', error);
    throw error;
  }
}

function runQuoteBuilderRestoreWorkflow() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'runQuoteBuilderRestoreWorkflow');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const report = [];

    try {
      const stats = refreshValidationLookups();
      report.push(`Validation hub refreshed (${stats.columns} columns)`);
    } catch (error) {
      throw new AppError('VALIDATION_ERROR', 'Validation refresh failed: ' + error.message);
    }

    try {
      ensureQuoteBuilderTemplateRow(ss);
      report.push('Template row formulas reset');
    } catch (error) {
      throw new AppError('TEMPLATE_ERROR', 'Template row reset failed: ' + error.message);
    }

    try {
      applyMasterValidations();
      report.push('Data validation rules applied');
    } catch (error) {
      throw new AppError('VALIDATION_ERROR', 'Validation rules failed: ' + error.message);
    }

    try {
      copyTemplateFormulas(ss);
      report.push('Template formulas copied to sheet capacity');
    } catch (error) {
      throw new AppError('FORMULA_ERROR', 'Formula propagation failed: ' + error.message);
    }

    try {
      copyFormulasDown();
      report.push('Row formulas replicated');
    } catch (error) {
      throw new AppError('FORMULA_ERROR', 'Row formula copy failed: ' + error.message);
    }

    trace.complete('runQuoteBuilderRestoreWorkflow completed', { stepsCompleted: report.length });
    return report;
  } catch (error) {
    trace.fail('runQuoteBuilderRestoreWorkflow failed', error);
    throw error;
  }
}

function restoreQuoteBuilderIntegrity() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'restoreQuoteBuilderIntegrity');
  try {
    if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
      showWarningToast('Quote_Builder sheet customized; skipping auto-restore to avoid overwriting user changes.');
      trace.complete('restoreQuoteBuilderIntegrity cancelled - customized sheet', {});
      return;
    }
    const report = runQuoteBuilderRestoreWorkflow();
    showSuccessToast(report.join('\n'));
    trace.complete('restoreQuoteBuilderIntegrity completed', { stepsCompleted: report.length });
  } catch (error) {
    trace.fail('restoreQuoteBuilderIntegrity failed', error);
    try { UnifiedLogger.warn('TemplateManager', 'restoreQuoteBuilderIntegrity failed', String(error)); } catch (ignore) {
      console.error('[TemplateManager] Error:', ignore.message, ignore.stack);
    }
    const userError = createUserFriendlyError(error, {
      operation: 'Restoring Quote Builder integrity',
      correlationId: trace.correlationId
    });
    showErrorToast('Restore Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

/**
 * Backwards compatible repair command.
 */
function repairQuoteBuilder() {
  const trace = UnifiedLogger.startTrace('TemplateManager', 'repairQuoteBuilder');
  try {
    restoreQuoteBuilderIntegrity();
    trace.complete('repairQuoteBuilder completed', {});
  } catch (error) {
    trace.fail('repairQuoteBuilder failed', error);
    throw error;
  }
}

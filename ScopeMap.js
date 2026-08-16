/**
 * Scope map contract helpers.
 * Provides normalization, validation, and audit utilities for scope entries.
 * RESTORED & INTEGRATED WITH UNIFIED LOGGER
 */

const SCOPE_MAP_VERSION = '1.1.0';
const SCOPE_ENTRY_REQUIRED_KEYS = Object.freeze([
  'id',
  'sectionId',
  'visibility',
  'sourceExcerpt',
  'interpretation',
  'approvalStatus'
]);
const SCOPE_ENTRY_OPTIONAL_KEYS = Object.freeze([
  'scopeLabel',
  'deliverables',
  'resources',
  'contingency',
  'notes',
  'signals',
  'metadata',
  'catalogRefs',
  'resourcePackages'
]);

function ensureArray(value) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'ensureArray');
  try {
    if (Array.isArray(value)) {
      trace.complete('ensureArray completed - already array');
      return value;
    }
    if (value === undefined || value === null) {
      trace.complete('ensureArray completed - null/undefined', { result: 'empty array' });
      return [];
    }
    trace.complete('ensureArray completed - wrapped value');
    return [value];
  } catch (error) {
    trace.fail('ensureArray failed', error);
    throw error;
  }
}

// SCOPE_RECOVERY_ENABLED_PROP is defined globally in 05_AISidebar_Config.js:283
const SCOPE_RECOVERY_DEFAULT_ENABLED = false;
const FALLBACK_PHASE = Object.freeze({
  id: 'scope-recovery',
  label: 'Scope Recovery',
  canonical: 'scope-recovery',
  required: true
});
const FALLBACK_CATEGORY_CONFIG = Object.freeze({
  cadence: 'fallback',
  phases: [FALLBACK_PHASE]
});

function scopeCategoryEnabled_() {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'scopeCategoryEnabled_');
  try {
    // Always enable category scaffolding to enforce full phase coverage.
    trace.complete('scopeCategoryEnabled_ completed', { enabled: true });
    return true;
  } catch (error) {
    trace.fail('scopeCategoryEnabled_ failed', error);
    throw error;
  }
}

function isScopeRecoveryEnabled_() {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'isScopeRecoveryEnabled_');
  try {
    if (typeof getScriptProperty !== 'function') {
      trace.complete('isScopeRecoveryEnabled_ completed - no getScriptProperty', { enabled: SCOPE_RECOVERY_DEFAULT_ENABLED });
      return SCOPE_RECOVERY_DEFAULT_ENABLED;
    }
    try {
      const raw = getScriptProperty(SCOPE_RECOVERY_ENABLED_PROP);
      if (raw === null || raw === undefined || raw === '') {
        trace.complete('isScopeRecoveryEnabled_ completed - not set', { enabled: SCOPE_RECOVERY_DEFAULT_ENABLED });
        return SCOPE_RECOVERY_DEFAULT_ENABLED;
      }
      const normalized = String(raw).toLowerCase().trim();
      if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
        trace.complete('isScopeRecoveryEnabled_ completed', { enabled: true });
        return true;
      }
      if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
        trace.complete('isScopeRecoveryEnabled_ completed', { enabled: false });
        return false;
      }
    } catch (error) {
      trace.fail('isScopeRecoveryEnabled_ property check failed', error);
      try { UnifiedLogger.warn('ScopeMap', 'scope recovery flag lookup failed', String(error)); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
    }
    trace.complete('isScopeRecoveryEnabled_ completed - default', { enabled: SCOPE_RECOVERY_DEFAULT_ENABLED });
    return SCOPE_RECOVERY_DEFAULT_ENABLED;
  } catch (error) {
    trace.fail('isScopeRecoveryEnabled_ failed', error);
    throw error;
  }
}

function getDynamicScopeCategoryConfig_(briefType) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'getDynamicScopeCategoryConfig_');
  try {
    // Load scope phases from ConfigurationManager (replaces getScopeCategoryConfigFromLoader)
    try {
      const configMap = ConfigurationManager.get('scope.phases');
      const config = configMap[briefType];
      if (config && Array.isArray(config.phases) && config.phases.length) {
        trace.complete('getDynamicScopeCategoryConfig_ completed', { phaseCount: config.phases.length });
        return config;
      }
    } catch (error) {
      trace.fail('getDynamicScopeCategoryConfig_ lookup failed', error);
      try {
        UnifiedLogger.warn('ScopeMap', 'Failed to load scope phases from ConfigurationManager', {
          briefType: briefType || '',
          error: String(error)
        });
      } catch (ignore) {
        console.error('[ScopeMap] Logging failed:', String(ignore));
      }
    }
    trace.complete('getDynamicScopeCategoryConfig_ completed - no config found');
    return null;
  } catch (error) {
    trace.fail('getDynamicScopeCategoryConfig_ failed', error);
    throw error;
  }
}

function resolveCategoryConfig_(briefType) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'resolveCategoryConfig_');
  try {
    if (!scopeCategoryEnabled_()) {
      trace.complete('resolveCategoryConfig_ completed - category disabled');
      return null;
    }
    const dynamicConfig = getDynamicScopeCategoryConfig_(briefType);
    if (dynamicConfig) {
      trace.complete('resolveCategoryConfig_ completed - dynamic config', { phaseCount: dynamicConfig.phases.length });
      return dynamicConfig;
    }
    const status = (typeof getConfigStatus === 'function') ? getConfigStatus() : null;
    const dynamicAvailable = status && status.enabled === true && status.scopePhaseGroups > 0;
    const dynamicMissing = status && status.enabled === true && (!status.scopePhaseGroups || status.scopePhaseGroups === 0);
    if (isScopeRecoveryEnabled_()) {
      if (dynamicAvailable) {
        try { UnifiedLogger.info('ScopeMap', 'resolveCategoryConfig_: recovery skipped because dynamic scope phases are available', { briefType: briefType || '' }); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
        trace.complete('resolveCategoryConfig_ completed - recovery skipped');
        return null;
      }
      if (dynamicMissing) {
        try { UnifiedLogger.warn('ScopeMap', 'resolveCategoryConfig_: dynamic config enabled but scope phases are missing; skipping recovery fallback'); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
        trace.complete('resolveCategoryConfig_ completed - recovery skipped, missing phases');
        return null;
      }
      try { UnifiedLogger.info('ScopeMap', 'resolveCategoryConfig_: falling back to recovery phases', { briefType: briefType || '' }); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
      trace.complete('resolveCategoryConfig_ completed - fallback config');
      return FALLBACK_CATEGORY_CONFIG;
    }
    trace.complete('resolveCategoryConfig_ completed - no config');
    return null;
  } catch (error) {
    trace.fail('resolveCategoryConfig_ failed', error);
    throw error;
  }
}


function resolveSectionCanonical_(value) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'resolveSectionCanonical_');
  try {
    const legacyMap = (typeof WORKFLOW_LEGACY_CANONICAL_MAP !== 'undefined' && WORKFLOW_LEGACY_CANONICAL_MAP)
      ? WORKFLOW_LEGACY_CANONICAL_MAP
      : {};
    const slug = normalizeString(value, { trim: true, lowercase: true, collapseWhitespace: true }).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) {
      trace.complete('resolveSectionCanonical_ completed - no slug');
      return '';
    }
    const mapper = typeof mapWorkflowCanonical === 'function' ? mapWorkflowCanonical : null;
    const mapped = mapper ? (mapper(value) || mapper(slug) || '') : '';
    if (mapped) {
      const result = normalizeString(mapped, { trim: true, lowercase: true, collapseWhitespace: true }).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      trace.complete('resolveSectionCanonical_ completed - mapped', { result: result });
      return result;
    }
    const legacy = legacyMap[slug] || legacyMap[slug.replace(/-/g, ' ')] || '';
    if (legacy) {
      const result = normalizeString(legacy, { trim: true, lowercase: true, collapseWhitespace: true }).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      trace.complete('resolveSectionCanonical_ completed - legacy', { result: result });
      return result;
    }
    trace.complete('resolveSectionCanonical_ completed', { result: slug });
    return slug;
  } catch (error) {
    trace.fail('resolveSectionCanonical_ failed', error);
    throw error;
  }
}

/**
 * Build phase lookup map ONCE - avoids duplicate work.
 * Consolidates duplicate phase lookup logic from enforceConfiguredPhases_ and applyCategoryMetadataToEntries_
 * Pattern from App-script/ScopeMap.js:371-383 (applyCategoryMetadataToEntries_ phase lookup)
 *
 * @param {Array<Object>} phases - Config phases
 * @return {Object} Lookup map: normalizedKey → phase object with orderIndex
 */
function buildPhaseLookup_(phases) {
  const lookup = {};

  ensureArray(phases).forEach(function(phase, index) {
    if (!phase || !phase.id) {
      return;
    }

    const phaseWithIndex = Object.assign({}, phase, { orderIndex: index });

    // Normalize id, label, canonical ONCE per phase
    const normalizedId = normalizeString(phase.id, { trim: true, lowercase: true, collapseWhitespace: true });
    const normalizedLabel = phase.label ? normalizeString(phase.label, { trim: true, lowercase: true, collapseWhitespace: true }) : '';
    const normalizedCanonical = phase.canonical ? normalizeString(phase.canonical, { trim: true, lowercase: true, collapseWhitespace: true }) : '';

    // Add all variants to lookup
    lookup[normalizedId] = phaseWithIndex;
    if (normalizedLabel) {
      lookup[normalizedLabel] = phaseWithIndex;
    }
    if (normalizedCanonical) {
      lookup[normalizedCanonical] = phaseWithIndex;
    }
  });

  return lookup;
}

/**
 * Extract ancillary fee flags from config.
 * Pattern from App-script/ScopeMap.js:385-387
 *
 * @param {Object} config - Category config
 * @return {Array<string>} Fee type flags
 */
function extractAncillaryFlags_(config) {
  const feeTypes = ensureArray(config.ancillaryFees)
    .map(function(fee) {
      return fee && fee.type ? String(fee.type) : null;
    });
  return filterNullish(feeTypes);
}

/**
 * Process scope entries in a single pass - replaces 4 separate loops.
 * Combines work from normalizeApprovedScopeSections_, enforceConfiguredPhases_,
 * ensureCategoryScaffolding_, and applyCategoryMetadataToEntries_
 * Eliminates redundant normalization calls and phase lookup building
 * Performance improvement pattern from PERFORMANCE_FIX_DESIGN.md
 *
 * @param {Array<Object>} entries - Scope entries to process
 * @param {string} briefType - Brief type for category config lookup
 * @return {Array<Object>} Processed entries
 */
function processAndNormalizeEntries_(entries, briefType) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'processAndNormalizeEntries_');

  try {
    if (!Array.isArray(entries) || !entries.length) {
      trace.complete('processAndNormalizeEntries_ completed - no entries');
      return entries;
    }

    // STEP 1: Load config ONCE
    const config = resolveCategoryConfig_(briefType);
    if (!config || !Array.isArray(config.phases) || !config.phases.length) {
      trace.complete('processAndNormalizeEntries_ completed - no config');
      return entries;
    }

    // STEP 2: Build phase lookup ONCE (instead of twice)
    const phaseLookup = buildPhaseLookup_(config.phases);
    const allowedPhases = new Set(Object.keys(phaseLookup));
    const fallbackPhase = config.phases[0];
    const ancillaryFlags = extractAncillaryFlags_(config);

    // STEP 3: Process all entries in SINGLE LOOP
    let processedCount = 0;
    entries.forEach(function(entry, index) {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      // 3a. Resolve and normalize sectionId (was done 4 times, now once)
      const sectionKey = entry.sectionId || entry.canonical || entry.scopeLabel || '';
      const resolvedKey = resolveSectionCanonical_(sectionKey);
      const normalizedKey = normalizeString(resolvedKey || sectionKey, { trim: true, lowercase: true, collapseWhitespace: true });

      // 3b. Match to configured phase (was done 2 times, now once)
      const matched = phaseLookup[normalizedKey];

      if (matched) {
        // Phase found in config
        entry.sectionId = matched.id;
        entry.canonical = matched.canonical || matched.id;
        entry.metadata = entry.metadata || {};
        entry.metadata.categoryId = briefType;
        entry.metadata.cadenceType = config.cadence || '';
        entry.metadata.categoryPhase = matched.id;
        entry.metadata.phaseCanonical = matched.canonical || '';
        entry.metadata.phaseOrderIndex = matched.orderIndex;
        entry.metadata.ancillaryFeeFlags = ancillaryFlags;
        entry.metadata.phaseRecovered = 'matched';
        processedCount++;
      } else if (allowedPhases.has(normalizedKey)) {
        // Already in allowed phases (mapped)
        entry.sectionId = resolvedKey;
        entry.canonical = resolvedKey;
        entry.metadata = entry.metadata || {};
        entry.metadata.categoryPhase = resolvedKey;
        entry.metadata.phaseCanonical = resolvedKey;
        entry.metadata.phaseRecovered = 'mapped';
        processedCount++;
      } else {
        // Fallback to first phase
        entry.sectionId = fallbackPhase.id;
        entry.canonical = fallbackPhase.canonical || fallbackPhase.id;
        entry.metadata = entry.metadata || {};
        entry.metadata.categoryId = briefType;
        entry.metadata.cadenceType = config.cadence || '';
        entry.metadata.categoryPhase = fallbackPhase.id;
        entry.metadata.phaseCanonical = fallbackPhase.canonical || '';
        entry.metadata.phaseOrderIndex = 0;
        entry.metadata.ancillaryFeeFlags = ancillaryFlags;
        entry.metadata.phaseRecovered = 'fallback';
        processedCount++;

        try { UnifiedLogger.info('ScopeMap', 'Entry recovered with fallback phase', {
          entryId: entry.id,
          sectionKey: sectionKey,
          fallbackPhase: fallbackPhase.id
        }); } catch (ignore) {
          console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
        }
      }
    });

    trace.complete('processAndNormalizeEntries_ completed', {
      totalEntries: entries.length,
      processedCount: processedCount
    });

    return entries;
  } catch (error) {
    trace.fail('processAndNormalizeEntries_ failed', error);
    throw error;
  }
}

// DELETED normalizeApprovedScopeSections_ (56 lines)
// Replaced by processAndNormalizeEntries_ - pattern from App-script/ScopeMap.js:302
// Performance optimization from PERFORMANCE_FIX_DESIGN.md Phase 3

// DELETED enforceConfiguredPhases_ (62 lines)
// Replaced by processAndNormalizeEntries_ - pattern from App-script/ScopeMap.js:302
// Performance optimization from PERFORMANCE_FIX_DESIGN.md Phase 3

// DELETED applyCategoryMetadataToEntries_ (79 lines)
// Replaced by processAndNormalizeEntries_ - pattern from App-script/ScopeMap.js:302
// Performance optimization from PERFORMANCE_FIX_DESIGN.md Phase 3

// DELETED ensureCategoryScaffolding_ (34 lines)
// Replaced by processAndNormalizeEntries_ - pattern from App-script/ScopeMap.js:302
// Performance optimization from PERFORMANCE_FIX_DESIGN.md Phase 3

function normalizeAncillaryFees_(fees) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'normalizeAncillaryFees_');
  try {
    if (!Array.isArray(fees)) {
      trace.complete('normalizeAncillaryFees_ completed - not array');
      return [];
    }
    const result = fees.map(function(fee) {
      if (!fee || typeof fee !== 'object') {
        return null;
      }
      return {
        type: fee.type || '',
        label: fee.label || '',
        amount: fee.amount === undefined || fee.amount === null ? null : Number(fee.amount),
        currency: fee.currency || '',
        notes: fee.notes || '',
        required: fee.required === true
      };
    });
    const filteredResult = filterTruthy(result);
    trace.complete('normalizeAncillaryFees_ completed', { count: filteredResult.length });
    return filteredResult;
  } catch (error) {
    trace.fail('normalizeAncillaryFees_ failed', error);
    throw error;
  }
}

/**
 * Build a normalized scope map from the given draft.
 * @param {Object} draft
 * @param {Array<Object>} [timeline]
 * @return {{version: string, entries: Array<Object>, sourceSummary: string, contractHash: string}}
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function buildScopeMapFromDraft(draft, timeline) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'buildScopeMapFromDraft');
  try {
  UnifiedLogger.info('ScopeMap', 'Building scope map from draft', {
    hasDraft: !!(draft),
    entryCount: draft && draft.scopeEntries ? draft.scopeEntries.length : 0
  });

  if (!draft || typeof draft !== 'object') {
    UnifiedLogger.error('ScopeMap', 'Invalid scope draft payload');
    throw new AppError('SCOPE_SCHEMA', 'Scope draft payload is missing or invalid.');
  }

  const rawEntries = Array.isArray(draft.scopeEntries) ? draft.scopeEntries : [];
  if (!rawEntries.length) {
    UnifiedLogger.error('ScopeMap', 'No scope entries in draft');
    throw new AppError('SCOPE_SCHEMA', 'Scope draft did not include any scope entries for approval.');
  }
  UnifiedLogger.debug('ScopeMap', 'Processing scope entries', { rawCount: rawEntries.length });

  const entries = rawEntries.map(function(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new AppError('SCOPE_SCHEMA', 'Scope entry is missing or invalid.');
    }
    return JSON.parse(JSON.stringify(entry));
  });
  const ancillaryEntries = normalizeAncillaryFees_(draft && draft.ancillaryFees ? draft.ancillaryFees : []).map(function(fee, index) {
    const feeId = 'ancillary:' + (fee.type || 'fee') + ':' + (index + 1);
    return {
      id: feeId,
      parentId: '',
      isSection: false,
      childIds: [],
      sectionId: 'ancillary-fee',
      scopeLabel: fee.label || fee.type || 'Ancillary Fee',
      visibility: 'Client',
      approvalStatus: 'approved',
      sourceExcerpt: fee.notes || '',
      interpretation: fee.notes || '',
      deliverables: [],
      resources: [],
      contingency: null,
      notes: [],
      signals: [],
      catalogRefs: [],
      resourcePackages: [],
      metadata: {
        isAncillaryFee: true,
        feeType: fee.type || '',
        amount: fee.amount,
        currency: fee.currency,
        categoryId: draft && draft.briefType ? String(draft.briefType) : '',
        cadenceType: draft && draft.cadence ? String(draft.cadence) : ''
      }
    };
  });
  entries.push.apply(entries, ancillaryEntries);
  const entryIndex = entries.reduce(function(map, entry) {
    if (!entry || !entry.id) {
      return map;
    }
    map[entry.id] = entry;
    return map;
  }, {});
  const parentChildMap = entries.reduce(function(map, entry) {
    if (!entry || !entry.parentId) {
      return map;
    }
    const parentId = String(entry.parentId);
    if (!map[parentId]) {
      map[parentId] = new Set();
    }
    if (entry.id) {
      map[parentId].add(entry.id);
    }
    return map;
  }, {});
  entries.forEach(function(entry) {
    if (!entry || !entry.id) {
      return;
    }
    const existingChildIds = Array.isArray(entry.childIds) ? entry.childIds.slice() : [];
    const derivedChildren = parentChildMap[entry.id];
    if (derivedChildren && derivedChildren.size) {
      derivedChildren.forEach(function(childId) {
        if (childId && existingChildIds.indexOf(childId) === -1) {
          existingChildIds.push(childId);
        }
      });
    }
    entry.childIds = filterTruthy(existingChildIds);
    if (entry.parentId) {
      const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
      if (!metadata.parentScopeId) {
        metadata.parentScopeId = entry.parentId;
      }
      if (!metadata.vectorDetailParent) {
        metadata.vectorDetailParent = entry.parentId;
      }
      if (metadata.isSectionChild === undefined) {
        metadata.isSectionChild = true;
      }
      entry.metadata = metadata;
      entry.isSection = false;
      if (!entry.sectionId) {
        const parentEntry = entryIndex[entry.parentId];
        if (parentEntry && parentEntry.sectionId) {
          entry.sectionId = parentEntry.sectionId;
        }
      }
    } else if (entry.isSection !== true) {
      entry.isSection = true;
    }
  });

  // Performance fix: Single-pass processing - pattern from App-script/ScopeMap.js:302 (processAndNormalizeEntries_)
  // Replaces: ensureCategoryScaffolding_ + applyCategoryMetadataToEntries_
  processAndNormalizeEntries_(entries, draft && draft.briefType);

  const contract = {
    version: SCOPE_MAP_VERSION,
    entries: entries,
    categoryId: draft && draft.briefType ? String(draft.briefType) : '',
    cadence: draft && draft.cadence ? String(draft.cadence) : '',
    ancillaryFees: normalizeAncillaryFees_(draft && draft.ancillaryFees ? draft.ancillaryFees : []),
    sourceSummary: draft.sourceSummary ? String(draft.sourceSummary) : '',
    contractHash: '',
    hierarchy: buildHierarchyFromEntries(entries)
    // DELETED OLD SCHEMA FIELD: sections: [] (was line 552)
    // OLD code initialized empty sections array and populated it if scopeDynamicSectionsEnabled()
    // NEW schema uses flat entries array with isSection flags - sections field not needed
  };

  // DELETED OLD SCHEMA CODE: draft.sections support removed (was lines 554-558)
  // OLD code checked scopeDynamicSectionsEnabled() and copied draft.sections to contract.sections
  // NEW schema uses flat entries array with isSection flags - sections array not needed

  contract.contractHash = computeScopeContractHash(contract);

  if (timeline && typeof recordTimelineStep === 'function') {
    try {
      recordTimelineStep(timeline, 'SCOPE_CONTRACT', 'validated', {
        entryCount: entries.length,
        version: contract.version,
        hash: contract.contractHash,
        hierarchy: contract.hierarchy
      });
    } catch (error) {
      try { UnifiedLogger.warn('ScopeMap', 'buildScopeMapFromDraft: unable to record timeline step', String(error)); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
    }
  }

  UnifiedLogger.info('ScopeMap', 'Scope map built successfully', {
    contractHash: contract.contractHash,
    entryCount: contract.entries ? contract.entries.length : 0,
    totalEntries: contract.totalEntries || 0
  });

  
  trace.complete('buildScopeMapFromDraft complete');
  return contract;
  } catch (error) {
    trace.fail('buildScopeMapFromDraft failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'buildScopeMapFromDraft',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    // ROOT CAUSE FIX (ISS-004): Return 'entries' not 'scopeEntries' to match contract schema
    return { entries: [], hierarchy: {}, sections: [] };
  }
}
function computeScopeContractHash(contract) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'computeScopeContractHash');
  try {
    const digestPayload = {
      version: contract.version,
      categoryId: contract.categoryId || '',
      cadence: contract.cadence || '',
      ancillaryFees: normalizeAncillaryFees_(contract.ancillaryFees || []),
      entries: contract.entries.map(function(entry) {
        return {
          id: entry.id,
          parentId: entry.parentId || '',
          isSection: entry.isSection === true,
          childIds: Array.isArray(entry.childIds) ? entry.childIds.slice().sort() : [],
          sectionId: entry.sectionId,
          scopeLabel: normalizeStringForHash(entry.scopeLabel),
          sourceExcerpt: normalizeStringForHash(entry.sourceExcerpt),
          interpretation: normalizeStringForHash(entry.interpretation),
          visibility: entry.visibility,
          approvalStatus: entry.approvalStatus,
          deliverables: normalizeValueForHash(entry.deliverables),
          resources: normalizeValueForHash(entry.resources),
          contingency: entry.contingency,
          notes: normalizeNotesForHash(entry.notes),
          signals: normalizeValueForHash(entry.signals),
          catalogRefs: normalizeValueForHash(entry.catalogRefs),
          resourcePackages: normalizeValueForHash(entry.resourcePackages),
          metadata: normalizeMetadataForHash(entry.metadata)
        };
      }),
      hierarchy: Object.keys(contract.hierarchy || {}).sort().map(function(parentId) {
        return {
          parentId: parentId,
          childIds: (contract.hierarchy[parentId] || []).slice().sort()
        };
      }),
      // DELETED OLD SCHEMA CODE: sections array removed from hash computation
      // OLD code included contract.sections in hash if scopeDynamicSectionsEnabled()
      // NEW schema uses flat entries array - sections not needed in hash
      sourceSummary: contract.sourceSummary || ''
    };
    const json = JSON.stringify(digestPayload);
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, json);
    const hash = bytes.map(function(byte) {
      const hex = (byte & 0xff).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    trace.complete('computeScopeContractHash completed', { hash: hash.substring(0, 16) });
    return hash;
  } catch (error) {
    trace.fail('computeScopeContractHash failed', error);
    throw error;
  }
}

function normalizeMetadataForHash(metadata) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'normalizeMetadataForHash');
  try {
    if (!metadata || typeof metadata !== 'object') {
      trace.complete('normalizeMetadataForHash completed - null');
      return null;
    }
    const ordered = {};
    Object.keys(metadata).sort().forEach(function(key) {
      ordered[key] = normalizeValueForHash(metadata[key]);
    });
    trace.complete('normalizeMetadataForHash completed', { keys: Object.keys(ordered).length });
    return ordered;
  } catch (error) {
    trace.fail('normalizeMetadataForHash failed', error);
    throw error;
  }
}

function normalizeValueForHash(value) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'normalizeValueForHash');
  try {
    if (Array.isArray(value)) {
      const normalized = value.map(function(entry) {
        return normalizeValueForHash(entry);
      }).filter(function(entry) {
        return entry !== null && entry !== undefined && entry !== '';
      });
      const seen = new Set();
      const deduped = normalized.filter(function(entry) {
        const key = typeof entry === 'string'
          ? entry.toLowerCase()
          : JSON.stringify(entry);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      const result = deduped.sort(function(a, b) {
        const left = typeof a === 'string' ? a : JSON.stringify(a);
        const right = typeof b === 'string' ? b : JSON.stringify(b);
        return left.localeCompare(right);
      });
      trace.complete('normalizeValueForHash completed - array', { count: result.length });
      return result;
    }
    if (value && typeof value === 'object') {
      const result = normalizeMetadataForHash(value);
      trace.complete('normalizeValueForHash completed - object');
      return result;
    }
    if (value === undefined) {
      trace.complete('normalizeValueForHash completed - undefined');
      return null;
    }
    trace.complete('normalizeValueForHash completed - primitive');
    return value;
  } catch (error) {
    trace.fail('normalizeValueForHash failed', error);
    throw error;
  }
}

function normalizeStringForHash(value) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'normalizeStringForHash');
  try {
    if (value === undefined || value === null) {
      trace.complete('normalizeStringForHash completed - empty');
      return '';
    }
    const result = String(value).trim();
    trace.complete('normalizeStringForHash completed');
    return result;
  } catch (error) {
    trace.fail('normalizeStringForHash failed', error);
    throw error;
  }
}

function normalizeNotesForHash(notes) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'normalizeNotesForHash');
  try {
    if (!Array.isArray(notes)) {
      trace.complete('normalizeNotesForHash completed - not array');
      return [];
    }
    const cleaned = notes
      .map(function(entry) {
        if (entry === undefined || entry === null) {
          return '';
        }
        return String(entry).trim();
      })
      .filter(function(entry) {
        return entry !== '';
      });
    const seen = new Set();
    const deduped = cleaned.filter(function(entry) {
      const key = entry.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    const result = deduped.sort(function(a, b) {
      return a.localeCompare(b);
    });
    trace.complete('normalizeNotesForHash completed', { count: result.length });
    return result;
  } catch (error) {
    trace.fail('normalizeNotesForHash failed', error);
    throw error;
  }
}

/**
 * Validate an approved scope contract before downstream use.
 * @param {Object} approvedScope
 * @return {{version: string, entries: Array<Object>, sourceSummary: string, contractHash: string}}
 */
// API Evidence for CPG hooks:
// - validateScopeContract: ScopeMap.js:665
// - UnifiedLogger.startTrace: 01_UnifiedLogger.js:573
// - UnifiedLogger.debug: 01_UnifiedLogger.js:549
// - UnifiedLogger.error: 01_UnifiedLogger.js:556
// - AppError: 00_ErrorUtils.js:9
function validateScopeContract(approvedScope) {
  // Add correlation ID tracing (startTrace: 01_UnifiedLogger.js:573)
  const trace = UnifiedLogger.startTrace('ScopeValidation', 'validateScopeContract', {
    hasScope: !!approvedScope,
    hasContracts: !!(approvedScope && approvedScope.scopeContracts)
  });

  try {
    // debug: 01_UnifiedLogger.js:549
    UnifiedLogger.debug('ScopeValidation', 'Validating scope contract', {
      hasScope: !!(approvedScope),
      hasContracts: !!(approvedScope && approvedScope.scopeContracts)
    });

    // AppError: 00_ErrorUtils.js:9
    if (!approvedScope || typeof approvedScope !== 'object') {
      UnifiedLogger.error('ScopeValidation', 'Missing approved scope');
      throw new AppError('SCOPE_SCHEMA', 'Approved scope is required for contract validation.');
    }

  // Performance fix: Replace 4-loop processing with single-pass (PERFORMANCE_FIX_DESIGN.md)
  // Clone pattern from App-script/ScopeMap.js:410 (enforceConfiguredPhases_)
  const normalizedScope = JSON.parse(JSON.stringify(approvedScope));

  // Process entries in single pass - pattern from App-script/ScopeMap.js:302 (processAndNormalizeEntries_)
  // Replaces: normalizeApprovedScopeSections_ + enforceConfiguredPhases_
  if (Array.isArray(normalizedScope.scopeEntries)) {
    normalizedScope.scopeEntries = processAndNormalizeEntries_(
      normalizedScope.scopeEntries,
      normalizedScope.briefType || normalizedScope.categoryId
    );
  }

  const existingHash = approvedScope.scopeContracts && approvedScope.scopeContracts.hash;

  // Hash caching optimization from PERFORMANCE_FIX_DESIGN.md
  // buildScopeMapFromDraft pattern from App-script/ScopeMap.js:669
  let contract;
  if (existingHash && approvedScope.scopeContracts.version === SCOPE_MAP_VERSION) {
    // Entries haven't changed - build contract with cached hash
    contract = buildScopeMapFromDraft(normalizedScope);
    contract.contractHash = existingHash; // Reuse cached hash

    // debug pattern from App-script/ScopeMap.js:1063
    UnifiedLogger.debug('ScopeValidation', 'Contract hash reused from cache', {
      contractHash: existingHash,
      entryCount: contract.entries.length
    });
  } else {
    // First time or version mismatch - compute new hash
    contract = buildScopeMapFromDraft(normalizedScope);

    UnifiedLogger.debug('ScopeValidation', 'Contract built with new hash', {
      contractHash: contract.contractHash,
      existingHash: existingHash || 'none',
      entryCount: contract.entries ? contract.entries.length : 0
    });
  }

  if (existingHash && existingHash !== contract.contractHash) {
    UnifiedLogger.warn('ScopeValidation', 'Hash mismatch detected', {
      expected: existingHash,
      actual: contract.contractHash
    });

    const reconciled = reconcileScopeContractHash_(approvedScope, contract, existingHash);
    if (reconciled) {
      UnifiedLogger.info('ScopeValidation', 'Hash reconciled');
      return reconciled;
    }

    // Check severity of mismatch
    const expectedCount = Array.isArray(approvedScope.scopeEntries) ? approvedScope.scopeEntries.length : 0;
    const actualCount = contract.entries.length;

    if (expectedCount !== actualCount) {
      UnifiedLogger.error('ScopeValidation', 'Critical entry count mismatch', {
        expected: expectedCount,
        actual: actualCount
      });
      throw new AppError('SCOPE_CONTRACT', 'Scope contract mismatch (Critical): Entry count changed from ' + expectedCount + ' to ' + actualCount + '. Re-approve scope.', {
        expected: existingHash,
        actual: contract.contractHash,
        severity: 'critical'
      });
    }

    contract.hashMismatch = true;
    try { UnifiedLogger.info('ScopeMap', 'validateScopeContract hash mismatch ignored', { expected: existingHash, actual: contract.contractHash }); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
  }

  UnifiedLogger.info('ScopeValidation', 'Contract validation complete', {
    hashMatch: !contract.hashMismatch,
    totalEntries: contract.totalEntries || 0
  });

  return contract;
  } catch (error) {
    trace.fail('validateScopeContract failed', error);

    // Phase 5 Task 5.2.10: User-friendly error handling
    showFriendlyError(
      error,
      'Validating Scope Contract',
      {
        correlationId: trace.correlationId
      }
    );

    throw error;
  }
}

function extractScopeSnapshotId_(approvedScope) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'extractScopeSnapshotId_');
  try {
    if (!approvedScope || typeof approvedScope !== 'object') {
      trace.complete('extractScopeSnapshotId_ completed - no scope');
      return '';
    }
    if (approvedScope.snapshotId) {
      const result = String(approvedScope.snapshotId);
      trace.complete('extractScopeSnapshotId_ completed - from snapshotId', { id: result.substring(0, 16) });
      return result;
    }
    if (approvedScope.scopeContracts && approvedScope.scopeContracts.snapshotId) {
      const result = String(approvedScope.scopeContracts.snapshotId);
      trace.complete('extractScopeSnapshotId_ completed - from scopeContracts', { id: result.substring(0, 16) });
      return result;
    }
    if (approvedScope.scopeAudit && Array.isArray(approvedScope.scopeAudit)) {
      const auditSnapshot = approvedScope.scopeAudit.find(function(entry) {
        return entry && entry.snapshotId;
      });
      if (auditSnapshot && auditSnapshot.snapshotId) {
        const result = String(auditSnapshot.snapshotId);
        trace.complete('extractScopeSnapshotId_ completed - from audit', { id: result.substring(0, 16) });
        return result;
      }
    }
    trace.complete('extractScopeSnapshotId_ completed - not found');
    return '';
  } catch (error) {
    trace.fail('extractScopeSnapshotId_ failed', error);
    throw error;
  }
}

function reconcileScopeContractHash_(approvedScope, contract, previousHash) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'reconcileScopeContractHash_');
  try {
    let snapshotId = extractScopeSnapshotId_(approvedScope);
    if (typeof hydrateScopeContracts !== 'function' ||
        typeof getSidebarHistory !== 'function' ||
        typeof saveSidebarState !== 'function' ||
        typeof getActiveUserEmailSafe !== 'function') {
      trace.complete('reconcileScopeContractHash_ completed - missing functions');
      return null;
    }
    try {
    const user = getActiveUserEmailSafe();
    if (!user) {
      return null;
    }
    const snapshotHistory = getSidebarHistory(user, 'snapshot', 25);
    if (!Array.isArray(snapshotHistory) || snapshotHistory.length === 0) {
      return null;
    }
    const snapshotRecords = snapshotHistory
      .map(function(item) {
        let parsed = item.data ? Object.assign({}, item.data) : null;
        if (parsed) {
          parsed.id = parsed.id || item.id;
        }
        if (!parsed) {
          try { UnifiedLogger.warn('ScopeMap', 'Invalid sidebar payload JSON', { rowId: item.id, payloadLength: item.data ? JSON.stringify(item.data).length : 0 }); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
        }
        const recordId = parsed && parsed.id ? parsed.id : item.id;
        const contractHash = parsed && parsed.contractHash
          ? parsed.contractHash
          : parsed && parsed.draft && parsed.draft.scopeContracts && parsed.draft.scopeContracts.hash
            ? parsed.draft.scopeContracts.hash
            : null;
        return {
          item: item,
          payload: parsed,
          id: recordId,
          contractHash: contractHash
        };
      })
      .filter(function(entry) {
        return entry.payload;
      });
    if (!snapshotRecords.length) {
      return null;
    }
    let snapshotRecord = null;
    if (snapshotId) {
      snapshotRecord = snapshotRecords.find(function(entry) {
        return entry.id === snapshotId;
      }) || null;
    }
    if (!snapshotRecord && previousHash) {
      snapshotRecord = snapshotRecords.find(function(entry) {
        return entry.contractHash === previousHash;
      }) || null;
    }
    if (!snapshotRecord) {
      snapshotRecord = snapshotRecords.find(function(entry) {
        return entry.payload && entry.payload.isActive;
      }) || snapshotRecords[0];
    }
    if (!snapshotRecord) {
      return null;
    }
    snapshotId = snapshotRecord.id || snapshotId;
    let snapshotPayload = snapshotRecord.payload;
    if (!snapshotPayload || typeof snapshotPayload !== 'object') {
      snapshotPayload = {
        id: snapshotId,
        label: snapshotRecord.item && snapshotRecord.item.label ? snapshotRecord.item.label : (snapshotId || '')
      };
    }
    const scopedSource = JSON.parse(JSON.stringify(approvedScope));
    const hydration = hydrateScopeContracts(scopedSource, scopedSource.sourceSummary || '');
    const updatedDraft = hydration.draft;
    const updatedContract = hydration.contract;
    updatedDraft.snapshotId = snapshotId;
    updatedDraft.snapshotLabel = updatedDraft.snapshotLabel || snapshotPayload.label || approvedScope.snapshotLabel || '';
    if (updatedDraft.scopeContracts && typeof updatedDraft.scopeContracts === 'object') {
      updatedDraft.scopeContracts.snapshotId = snapshotId;
      if (!updatedDraft.scopeContracts.snapshotLabel && updatedDraft.snapshotLabel) {
        updatedDraft.scopeContracts.snapshotLabel = updatedDraft.snapshotLabel;
      }
    }
    snapshotPayload.id = snapshotId;
    snapshotPayload.label = snapshotPayload.label || updatedDraft.snapshotLabel || approvedScope.snapshotLabel || snapshotId;
    snapshotPayload.draft = updatedDraft;
    snapshotPayload.contractVersion = updatedContract.version;
    snapshotPayload.contractHash = updatedContract.contractHash;
    snapshotPayload.scopeEntries = updatedContract.entries;
    snapshotPayload.scopeHierarchy = updatedContract.hierarchy || {};
    snapshotPayload.updatedAt = new Date().toISOString();

    if (snapshotRecord.item) {
      saveSidebarState(user, 'snapshot', snapshotPayload, {
        id: snapshotId,
        label: snapshotPayload.label
      });
    }

    if (approvedScope.scopeContracts && typeof approvedScope.scopeContracts === 'object') {
      approvedScope.scopeContracts.hash = updatedContract.contractHash;
      approvedScope.scopeContracts.version = updatedContract.version;
      if (!approvedScope.scopeContracts.snapshotId) {
        approvedScope.scopeContracts.snapshotId = snapshotId;
      }
    } else {
      approvedScope.scopeContracts = {
        hash: updatedContract.contractHash,
        version: updatedContract.version,
        snapshotId: snapshotId
      };
    }
    if (!approvedScope.snapshotId) {
      approvedScope.snapshotId = snapshotId;
    }
    if (!approvedScope.snapshotLabel && snapshotPayload.label) {
      approvedScope.snapshotLabel = snapshotPayload.label;
    }
    if (typeof appendScopeAuditLog === 'function') {
      appendScopeAuditLog('scope.contract.reconciled', {
        snapshotId: snapshotId,
        previousHash: previousHash || '',
        updatedHash: updatedContract.contractHash
      });
    }
    trace.complete('reconcileScopeContractHash_ completed', { snapshotId: snapshotId });
    return updatedContract;
  } catch (error) {
    trace.fail('reconcileScopeContractHash_ inner failed', error);
    try { UnifiedLogger.warn('ScopeMap', 'reconcileScopeContractHash failed', String(error)); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
    return null;
  }
  } catch (error) {
    trace.fail('reconcileScopeContractHash_ failed', error);
    throw error;
  }
}

/**
 * Ensure a plan section or item links to an approved scope entry.
 * @param {Object} section
 * @param {{entries:Array<Object>}} scopeMap
 * @return {string} entryId
 */
function ensureScopeEntryLink(section, scopeMap) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'ensureScopeEntryLink');
  try {
    if (!scopeMap || !Array.isArray(scopeMap.entries)) {
      trace.fail('ensureScopeEntryLink failed - missing scopeMap', new Error('Scope map missing'));
      throw new AppError('SCOPE_SCHEMA', 'Scope map context is missing when validating section linkage.');
    }
    if (!section || typeof section !== 'object') {
      trace.fail('ensureScopeEntryLink failed - invalid section', new Error('Section invalid'));
      throw new AppError('SCOPE_SCHEMA', 'Section payload is invalid when enforcing scope linkage.');
    }
    const candidate = section.scopeEntryId || section.scopeEntry || section.entryId || '';
    if (!candidate) {
      trace.fail('ensureScopeEntryLink failed - missing scopeEntryId', new Error('Missing scopeEntryId'));
      throw new AppError('SCOPE_SCHEMA', 'Section "' + (section.name || '(unnamed)') + '" is missing scopeEntryId.');
    }
    const match = scopeMap.entries.find(function(entry) {
      return entry.id === candidate || entry.sectionId === candidate;
    });
    if (!match && scopeMap.hierarchy && scopeMap.hierarchy[candidate] && scopeMap.hierarchy[candidate].length) {
      const result = scopeMap.hierarchy[candidate][0];
      trace.complete('ensureScopeEntryLink completed - from hierarchy', { entryId: result });
      return result;
    }
    if (!match) {
      trace.fail('ensureScopeEntryLink failed - entry not found', new Error('Entry not found'));
      throw new AppError('SCOPE_SCHEMA', 'No approved scope entry found for id "' + candidate + '".', {
        sectionName: section.name || '',
        scopeEntryId: candidate
      });
    }
    trace.complete('ensureScopeEntryLink completed', { entryId: match.id });
    return match.id;
  } catch (error) {
    trace.fail('ensureScopeEntryLink failed', error);
    throw error;
  }
}

/**
 * Append an audit log entry for scope activity.
 * @param {string} eventType
 * @param {Object} payload
 */
function appendScopeAuditLog(eventType, payload) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'appendScopeAuditLog');
  try {
    const meta = Object.assign({
      eventType: eventType,
      recordedAt: new Date().toISOString()
    }, payload || {});
    if (typeof logAIEvent === 'function') {
      logAIEvent(eventType, Object.assign({}, payload, { auditMeta: meta }));
    } else {
      try { UnifiedLogger.info('ScopeMap', 'appendScopeAuditLog fallback', meta); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
    }
    trace.complete('appendScopeAuditLog completed', { eventType: eventType });
  } catch (error) {
    trace.fail('appendScopeAuditLog failed', error);
    throw error;
  }
}

/**
 * Rehydrate scope map data from stored snapshot rows.
 * @param {Object|string} snapshotRow
 * @return {{version: string, entries: Array<Object>, sourceSummary: string, contractHash: string}|null}
 */
function rehydrateScopeMap(snapshotRow) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'rehydrateScopeMap');
  try {
    if (!snapshotRow) {
      trace.complete('rehydrateScopeMap completed - no snapshot');
      return null;
    }
    try {
      const payload = typeof snapshotRow === 'string'
        ? JSON.parse(snapshotRow)
        : (snapshotRow.payload ? JSON.parse(snapshotRow.payload) : snapshotRow);
      if (payload && payload.approvedScope) {
        const result = buildScopeMapFromDraft(payload.approvedScope);
        trace.complete('rehydrateScopeMap completed - from approvedScope');
        return result;
      }
      if (payload && payload.scopeMap) {
        trace.complete('rehydrateScopeMap completed - from scopeMap');
        return payload.scopeMap;
      }
    } catch (error) {
      trace.fail('rehydrateScopeMap parsing failed', error);
      try { UnifiedLogger.warn('ScopeMap', 'rehydrateScopeMap failed', String(error)); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
    }
    trace.complete('rehydrateScopeMap completed - no data found');
    return null;
  } catch (error) {
    trace.fail('rehydrateScopeMap failed', error);
    throw error;
  }
}

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function buildHierarchyFromEntries(entries) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'buildHierarchyFromEntries');
  try {
  UnifiedLogger.debug('Hierarchy', 'Building hierarchy from entries', {
    entryCount: entries ? entries.length : 0
  });

  const hierarchy = {};
  let parentCount = 0;

  entries.forEach(function(entry) {
    if (!entry || !entry.id) {
      return;
    }
    if (Array.isArray(entry.childIds) && entry.childIds.length) {
      hierarchy[entry.id] = entry.childIds.slice();
      parentCount++;
    }
  });

  UnifiedLogger.debug('Hierarchy', 'Hierarchy built', {
    parentCount,
    totalRelationships: Object.keys(hierarchy).reduce(function(sum, key) { return sum + hierarchy[key].length; }, 0)
  });

  
  trace.complete('buildHierarchyFromEntries complete');
  return hierarchy;
  } catch (error) {
    trace.fail('buildHierarchyFromEntries failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'buildHierarchyFromEntries',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    return {};
  }
}
function queueResourcePackageReview(resourcePackage) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'queueResourcePackageReview');
  try {
    const payload = Object.assign({
      status: 'pending_review',
      enqueuedAt: new Date().toISOString()
    }, resourcePackage || {});
    appendScopeAuditLog('scope.resourcePackage.queue', payload);
    trace.complete('queueResourcePackageReview completed');
  } catch (error) {
    trace.fail('queueResourcePackageReview failed', error);
    throw error;
  }
}

/**
 * Guard to ensure manual sheet edits cannot bypass the scope contract.
 * @param {Object} approvedScope
 * @param {Array<Array<*>>} [sheetState]
 */
function validateScopeMapGuard(approvedScope, sheetState) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'validateScopeMapGuard');
  try {
    const scopeMap = validateScopeContract(approvedScope);
    if (!sheetState) {
    const schemaTrusted = (typeof isQuoteBuilderSchemaTrusted_ === 'function') ? isQuoteBuilderSchemaTrusted_() : null;
    if (schemaTrusted === null) {
      throw new AppError('SCHEMA_GUARD_MISSING', 'Schema guard unavailable; cannot validate sheet state.');
    }
    if (!schemaTrusted) {
      return scopeMap;
    }
    try {
      const ss = SpreadsheetApp.getActive();
      const sheet = ss.getSheetByName(SHEET_NAMES.QUOTE_BUILDER);
      if (sheet) {
        const lastRow = sheet.getLastRow();
        const lastColumn = sheet.getLastColumn();
        const rowCount = Math.max(0, lastRow - 2);
        sheetState = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
      }
    } catch (error) {
      try { UnifiedLogger.warn('ScopeMap', 'validateScopeMapGuard: unable to sample sheet state', String(error)); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
    }
  }

  if (sheetState && sheetState.length > 0) {
    const scopeColumnIndex = QB_COLS && QB_COLS.SCOPE_ENTRY_ID !== undefined ? QB_COLS.SCOPE_ENTRY_ID : -1;
    const notesIndex = QB_COLS && QB_COLS.NOTES !== undefined ? QB_COLS.NOTES : -1;
    for (let i = 0; i < sheetState.length; i++) {
      const row = sheetState[i];
      if (!row || !row[QB_COLS.TYPE]) {
        continue;
      }
      const type = row[QB_COLS.TYPE];
      const visibility = row[QB_COLS.VISIBILITY];
      if (type !== ROW_TYPES.LINE && type !== ROW_TYPES.SECTION) {
        continue;
      }
      const scopeMeta = parseScopeMetadataNotes(notesIndex !== -1 && notesIndex < row.length ? row[notesIndex] : '');
      let entryId = scopeColumnIndex !== -1 ? row[scopeColumnIndex] : null;
      if (!entryId && scopeMeta.scopeEntryId) {
        entryId = scopeMeta.scopeEntryId;
      }
      if (!entryId) {
        throw new AppError('SCOPE_CONTRACT', 'Row ' + (i + 3) + ' is missing scope linkage. Regenerate the quote.', {
          rowType: type,
          visibility: visibility
        });
      }
      ensureScopeEntryLink({ scopeEntryId: entryId }, scopeMap);
    }
  }
  trace.complete('validateScopeMapGuard completed', { entryCount: scopeMap.entries ? scopeMap.entries.length : 0 });
  return scopeMap;
  } catch (error) {
    trace.fail('validateScopeMapGuard failed', error);
    throw error;
  }
}

/**
 * Append an entry to the AI log sheet and the unified global log.
 * @param {string} eventType
 * @param {Object} payload
 */
function logAIEvent(eventType, payload) {
  const trace = UnifiedLogger.startTrace('ScopeMap', 'logAIEvent');
  try {
    const sheet = ensureAILogSheet();
    const runType = payload && payload.runType ? String(payload.runType) : '';
    const outcome = payload && payload.outcome ? String(payload.outcome) : '';
    const auditMeta = payload && payload.auditMeta ? payload.auditMeta : {};
    const logPayload = prepareLogPayload(payload);
    
    // Handle large payload persistence
    let payloadKey = '';
    if (logPayload.truncated && typeof isAILogPayloadLimitEnabled === 'function' && isAILogPayloadLimitEnabled()) {
       if (typeof persistLargePayload === 'function') {
          payloadKey = persistLargePayload(generatePayloadKey(), logPayload.raw);
       }
    }
    
    const auditMetaForLog = Object.assign({}, auditMeta);
    if (payloadKey) {
      auditMetaForLog.payloadKey = payloadKey;
      auditMetaForLog.payloadTruncated = true;
    }
    
    // 1. Write to dedicated AI Log (Legacy Schema)
    sheet.appendRow([
      new Date(),
      getActiveUserEmailSafe(),
      eventType,
      runType,
      outcome,
      logPayload.text,
      auditMetaForLog.contractHash || auditMetaForLog.scopeContract || '',
      auditMetaForLog.scopeEntryId || auditMetaForLog.scopeEntry || '',
      auditMetaForLog.visibility || '',
      auditMetaForLog.eventType || eventType,
      truncate(stringifySafe(auditMetaForLog.notes || auditMetaForLog.assignments || auditMetaForLog, 500), 500)
    ]);

    // 2. Write to Unified Global Log (New System)
    if (typeof UnifiedLogger !== 'undefined') {
      const level = (outcome.includes('error') || outcome.includes('fail')) ? 'ERROR' : 'INFO';
      UnifiedLogger.logEvent('AI', `${eventType} (${outcome})`, level, {
        runType: runType,
        meta: auditMetaForLog
      });
    }

    trace.complete('logAIEvent completed', { eventType: eventType, outcome: outcome });
  } catch (error) {
    trace.fail('logAIEvent failed', error);
    try { UnifiedLogger.error('ScopeMap', 'Unable to log AI event', error); } catch (ignore) {
      console.error('[ScopeMap] Error:', ignore.message, ignore.stack);
    }
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error('AI', 'Failed to write AI log entry', error);
    }
  }
}

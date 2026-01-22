/**
 * AISidebar Config Module
 *
 * Responsibilities:
 * - Constants and configuration values (AI limits, property names, schemas)
 * - Schema definitions for AI responses (catalog mapper, section summary, scope draft)
 * - Config property getters (brief profiles, scope categories, boolean properties)
 * - Workflow taxonomy loading and management
 * - Section taxonomy and category management
 * - Client context configuration (industry, region, expectations, risks, constraints)
 *
 * Dependencies: Config.js, ConfigLoader.js, UnifiedLogger.js, Utilities (Google Apps Script)
 * Used by: All other AISidebar modules (Phase, Workflow, Data, Processing, UI)
 *
 * Load Order: 05_ prefix ensures loading before other AISidebar modules
 *
 * Note: All functions are globally accessible in Google Apps Script.
 * Rate limiting: All OpenAI API calls are rate-limited via RateLimiter.js
 *
 * Phase-related functions have been extracted to 05_AISidebar_Phase.js (Plan 03-02)
 */

/**
 * Note: Visibility tracking IDs (XERO_VISIBILITY_TRACKING) are managed via Script Properties.
 * The sidebar persists per-line Visibility only; IDs are applied in Xero exporters.
 */

const AI_STOP_WORDS = new Set([
  'with', 'from', 'this', 'that', 'have', 'will', 'your', 'project', 'client', 'brief',
  'scope', 'quote', 'every', 'their', 'they', 'them', 'need', 'needs', 'about', 'into',
  'after', 'before', 'deliverable', 'deliverables', 'including', 'company', 'agency',
  'services', 'service', 'budget', 'please', 'provide', 'prepare', 'for', 'each', 'were',
  'been', 'should', 'could', 'would', 'there', 'where', 'when', 'what', 'which', 'while'
]);
const AI_MAX_PDF_FILES = 3;
const AI_MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15 MB safety limit
const PROMPT_ID_PROP = 'OPENAI_PROMPT_ID';
const LEGACY_ASSISTANT_ID_PROP = 'OPENAI_ASSISTANT_ID';
const VECTOR_STORE_ID_PROP = 'OPENAI_VECTOR_STORE_ID';
const ASSISTANT_MODEL_PROP = 'OPENAI_ASSISTANT_MODEL';
const FEATURE_VECTOR_DIAGNOSTICS_PROP = 'FEATURE_VECTOR_DIAGNOSTICS';
const READINESS_USAGE_PROP = 'READINESS_USAGE_METRICS';

// Legacy Logger shim removed; use UnifiedLogger directly.

const EMBEDDING_MODEL_PROP = 'LLM_EMBEDDING_MODEL';
const VECTOR_DIAGNOSTICS_ENABLED = (function() {
  let enabled = true;
  if (typeof getScriptProperty === 'function') {
    try {
      const rawFlag = getScriptProperty(FEATURE_VECTOR_DIAGNOSTICS_PROP);
      if (isNonEmptyString(String(rawFlag))) {
        const normalized = String(rawFlag).trim().toLowerCase();
        if (normalized === 'false' || normalized === '0' || normalized === 'no') {
          enabled = false;
        }
      }
    } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'vector diagnostics flag read failed', String(error)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
    }
  }
  return enabled;
})();
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';
const DEFAULT_EMBEDDING_DIMENSION = 3072;
const COMMERCIAL_FIT_HEADERS = Object.freeze([
  'SnapshotId',
  'ScopeEntryId',
  'Canonical',
  'Archetype',
  'ChosenSku',
  'Qty',
  'Unit',
  'UnitRate',
  'ScoreJSON',
  'QtySource',
  'VectorCandidatesJSON',
  'WarningsJSON',
  'NotesJSON',
  'ManualOverride',
  'ParentScopeId',
  'BundleKey',
  'QuantityContextJSON',
  'UnitRateContextJSON',
  'EntryContextJSON',
  'SelectedSkusJSON',
  'QuantityProfileJSON',
  'SectionMatchScore'
]);

const COMMERCIAL_FIT_CONSOLE_HEADERS = Object.freeze([
  'SnapshotId',
  'Section',
  'ScopeEntryId',
  'ScopeLabel',
  'Canonical',
  'DetectedSection',
  'ChosenSKU',
  'Qty',
  'Unit',
  'QuantitySource',
  'Evidence',
  'Score',
  'Warnings',
  'Alternates',
  'Notes',
  'LastUpdated'
]);
const CATALOG_MAPPER_RESPONSE_SCHEMA = Object.freeze({
  name: 'catalog_mapper_payload',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      responseType: {
        type: 'string',
        enum: ['commercialFit', 'catalogMatches']
      },
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            scopeEntryId: { type: ['string', 'null'] },
            sku: { type: ['string', 'null'] },
            primarySku: { type: ['string', 'null'] },
            chosenSku: { type: ['string', 'null'] },
            alternates: {
              type: 'array',
              items: { type: ['string', 'null'] },
              maxItems: 5
            },
            notes: {
              type: 'array',
              items: { type: ['string', 'null'] },
              maxItems: 5
            },
            warnings: {
              type: 'array',
              items: { type: ['string', 'null'] },
              maxItems: 5
            },
            score: { type: ['number', 'string', 'null'] },
            confidence: { type: ['number', 'string', 'null'] },
            justification: { type: ['string', 'null'] },
            rationale: { type: ['string', 'null'] }
          },
          required: [
            'scopeEntryId',
            'sku',
            'primarySku',
            'chosenSku',
            'alternates',
            'notes',
            'warnings',
            'score',
            'confidence',
            'justification',
            'rationale'
          ],
          additionalProperties: false
        }
      },
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string' },
            confidence: { type: 'number' },
            rationale: { type: 'string' }
          },
          required: ['sku', 'confidence', 'rationale'],
          additionalProperties: false
        },
        maxItems: 12
      }
    },
    required: ['responseType', 'entries', 'matches'],
    additionalProperties: false
  }
});

function getCatalogMapperResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: CATALOG_MAPPER_RESPONSE_SCHEMA
  };
}

const SECTION_SUMMARY_RESPONSE_SCHEMA = Object.freeze({
  name: 'section_summary_payload',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summaries: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            sectionKey: { type: 'string' },
            summary: { type: 'string', maxLength: 600 }
          },
          required: ['sectionKey', 'summary'],
          additionalProperties: false
        }
      }
    },
    required: ['summaries'],
    additionalProperties: false
  }
});

function getSectionSummaryResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: SECTION_SUMMARY_RESPONSE_SCHEMA
  };
}

const BRIEF_TYPE_DEFAULT = 'smm-retainer';
const BRIEF_TYPE_PROFILES = Object.freeze({});

function getBriefProfile(briefType) {
  try {
    // Get all profiles from ConfigurationManager (via getBriefTypeProfiles)
    const allProfiles = getBriefTypeProfiles();

    if (allProfiles && allProfiles[briefType]) {
      return allProfiles[briefType];
    }

    // Profile not found - log warning and return minimal fallback
    try {
      UnifiedLogger.warn('AISidebar', 'Brief profile not found, using fallback', {
        briefType: briefType,
        availableTypes: Object.keys(allProfiles || {})
      });
    } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }

  } catch (error) {
    // ConfigurationManager.get() failed - log and use fallback
    try {
      UnifiedLogger.error('AISidebar', 'getBriefProfile lookup failed, using fallback', {
        briefType: briefType,
        error: String(error)
      });
    } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
  }

  // Return minimal fallback profile to prevent crashes
  // This allows the system to continue working while brief profiles are being configured
  try {
    UnifiedLogger.info('AISidebar', 'Using fallback brief profile', {
      briefType: briefType
    });
  } catch (ignore) {
    // UnifiedLogger unavailable during bootstrap
  }

  return {
    briefType: briefType,
    label: briefType.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }),
    sections: [],
    signatureCues: [],
    defaultPhases: []
  };
}

const SCOPE_CATEGORY_ENABLED_PROP = 'SCOPE_CATEGORY_ENABLED';
const SCOPE_CATEGORY_DEFAULT_ENABLED = true;  // Default is TRUE - scope categories are enabled by default

const SCOPE_RECOVERY_ENABLED_PROP = 'SCOPE_RECOVERY_ENABLED';

function getScopeRecoveryEnabledPropName() {
  return SCOPE_RECOVERY_ENABLED_PROP;
}

function isScopeCategoryEnabled() {
  try {
    const flag = typeof getScriptProperty === 'function'
      ? getScriptProperty(SCOPE_CATEGORY_ENABLED_PROP)
      : null;
    if (flag === null || typeof flag === 'undefined') {
      return !!SCOPE_CATEGORY_DEFAULT_ENABLED;
    }
    return String(flag).toLowerCase() === 'true';
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'SCOPE_CATEGORY_ENABLED lookup failed', String(error)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
    return !!SCOPE_CATEGORY_DEFAULT_ENABLED;
  }
}

function isScopeRecoveryEnabled() {
  return getBooleanScriptProperty(getScopeRecoveryEnabledPropName(), false);
}

function getBooleanScriptProperty(key, fallbackValue) {
  if (!key) {
    return typeof fallbackValue === 'boolean' ? fallbackValue : !!fallbackValue;
  }
  try {
    const raw = typeof getScriptProperty === 'function'
      ? getScriptProperty(key)
      : null;
    if (raw === null || raw === undefined || raw === '') {
      return typeof fallbackValue === 'boolean' ? fallbackValue : !!fallbackValue;
    }
    const normalized = String(raw).toLowerCase().trim();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    return typeof fallbackValue === 'boolean' ? fallbackValue : !!fallbackValue;
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'Boolean script property lookup failed', { key: key, error: String(error) }); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
    return typeof fallbackValue === 'boolean' ? fallbackValue : !!fallbackValue;
  }
}

function getCommercialFitHashKey() {
  const userEmail = getActiveUserEmailSafe();
  const normalized = (userEmail || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_');
  return COMMERCIAL_FIT_STATE_HASH_PROP_PREFIX + normalized;
}

function computeCommercialFitEntriesHash(entries, vectorLimit) {
  const normalizedEntries = (Array.isArray(entries) ? entries : []).map(function(entry) {
    const vectorCandidates = Array.isArray(entry.vectorCandidates) ? entry.vectorCandidates.slice(0, vectorLimit) : [];
    return {
      id: entry && entry.scopeEntryId ? entry.scopeEntryId : '',
      sku: entry && entry.chosenSku ? entry.chosenSku : '',
      qty: entry && entry.quantityContext && entry.quantityContext.qty !== undefined ? entry.quantityContext.qty : null,
      vector: vectorCandidates.map(function(candidate) {
        return {
          sku: candidate && candidate.sku ? candidate.sku : '',
          score: candidate && candidate.vectorScore !== undefined ? candidate.vectorScore : null
        };
      })
    };
  });
  const json = JSON.stringify(normalizedEntries);
  const digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json);
  return digestBytes.map(function(byte) {
    const hex = (byte & 0xff).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function getCommercialFitVectorPersistLimit() {
  if (typeof getScriptProperty !== 'function') {
    return COMMERCIAL_FIT_VECTOR_PERSIST_DEFAULT;
  }
  const raw = getScriptProperty(COMMERCIAL_FIT_VECTOR_PERSIST_LIMIT_PROP);
  const parsed = parseInt(raw, 10);
  if (isNumeric(parsed) && parsed > 0) {
    return parsed;
  }
  return COMMERCIAL_FIT_VECTOR_PERSIST_DEFAULT;
}

function isCommercialFitAssistantFallbackEnabled() {
  return false;
}
function getScopeCategoryConfigMap() {
  try {
    // Load scope phases array from ConfigurationManager
    const phasesArray = ConfigurationManager.get('scope.phases');

    if (!phasesArray || !Array.isArray(phasesArray) || phasesArray.length === 0) {
      const message = 'Scope phase config is missing. Populate Config: Scope Phases.';
      if (typeof AppError !== 'undefined') {
        throw new AppError('CONFIG_SCHEMA', message);
      }
      throw new Error(message);
    }

    // Transform array into map grouped by briefType
    // Input: [{briefType: 'smm-retainer', phaseId: '...', ...}, ...]
    // Output: {'smm-retainer': {phases: [...]}, 'pr-retainer': {phases: [...]}, ...}
    const configMap = {};
    phasesArray.forEach(function(phase) {
      if (!phase || !phase.briefType) {
        return; // Skip invalid entries
      }
      const briefType = phase.briefType;
      if (!configMap[briefType]) {
        configMap[briefType] = { phases: [] };
      }
      configMap[briefType].phases.push(phase);
    });

    if (Object.keys(configMap).length === 0) {
      const message = 'Scope phase config is empty. Populate Config: Scope Phases.';
      if (typeof AppError !== 'undefined') {
        throw new AppError('CONFIG_SCHEMA', message);
      }
      throw new Error(message);
    }

    return configMap;
  } catch (error) {
    // If ConfigurationManager throws, log and re-throw
    try {
      UnifiedLogger.error('AISidebar', 'Failed to load scope phases from ConfigurationManager', {
        error: String(error)
      });
    } catch (logError) {
      // UnifiedLogger unavailable during bootstrap
    }
    throw error;
  }
}

function getScopeCategoryConfig(briefType) {
  if (!isScopeCategoryEnabled()) {
    return null;
  }
  const type = briefType || BRIEF_TYPE_DEFAULT;
  const config = getScopeCategoryConfigMap();
  return config[type] || null;
}

function getScopeCategoryUiData() {
  let configMap = {};
  const hashes = {};

  // Load config - must not throw to prevent UI from breaking
  try {
    configMap = getScopeCategoryConfigMap();
  } catch (error) {
    try {
      UnifiedLogger.error('AISidebar', 'getScopeCategoryUiData failed to load config - returning empty', {
        error: String(error),
        stack: error.stack
      });
    } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
    // Return empty config instead of throwing - UI will show appropriate message
    configMap = {};
  }

  // Compute hash for each brief type's phase configuration
  try {
    if (configMap && typeof configMap === 'object') {
      Object.keys(configMap).forEach(function(briefType) {
        const config = configMap[briefType];
        if (config && typeof config === 'object') {
          // Compute MD5 hash of the phase configuration
          if (typeof Utilities !== 'undefined' && Utilities && Utilities.computeDigest) {
            const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(config));
            hashes[briefType] = digest.map(function(byte) {
              return ('0' + (byte & 0xff).toString(16)).slice(-2);
            }).join('');
          } else {
            // Fallback if Utilities unavailable
            hashes[briefType] = String(new Date().getTime());
          }
        }
      });
    }
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'getScopeCategoryUiData hash computation failed', String(error)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
  }

  return {
    enabled: isScopeCategoryEnabled(),
    config: configMap,
    hashes: hashes,
    extractionFlags: {
      scopeCategoryEnabled: isScopeCategoryEnabled()
    }
  };
}


function getBriefTypeProfiles() {
  try {
    // Load brief profiles array from ConfigurationManager
    const profilesArray = ConfigurationManager.get('brief.profiles');

    if (!profilesArray || !Array.isArray(profilesArray) || profilesArray.length === 0) {
      const message = 'Brief profiles are missing. Populate Config: Brief Profiles.';
      if (typeof AppError !== 'undefined') {
        throw new AppError('CONFIG_SCHEMA', message);
      }
      throw new Error(message);
    }

    // Transform array into map indexed by briefType
    // Input: [{briefType: 'smm-retainer', label: 'Smm Retainer', sectionOrderCSV: '...', ...}, ...]
    // Output: {'smm-retainer': {label: 'Smm Retainer', sectionOrder: [...], ...}, 'pr-retainer': {...}, ...}
    const profilesMap = {};
    profilesArray.forEach(function(profile) {
      if (!profile || !profile.briefType) {
        return; // Skip invalid entries
      }
      const briefType = profile.briefType;

      // Parse CSV fields into arrays for UI consumption
      const parsedProfile = {
        briefType: briefType,
        label: profile.label || briefType,
        nudge: profile.nudge || '',
        sectionOrder: parseCsvField_(profile.sectionOrderCSV),
        optionalSections: parseCsvField_(profile.optionalSectionsCSV),
        catalogPrefixes: parseCsvField_(profile.catalogPrefixesCSV),
        signatureCues: parseCsvField_(profile.signatureCuesCSV),
        fallback: profile.fallback,
        active: profile.active,
        priority: profile.priority
      };

      profilesMap[briefType] = parsedProfile;
    });

    if (Object.keys(profilesMap).length === 0) {
      UnifiedLogger.warn('AISidebar', 'getBriefTypeProfiles returning empty profiles');
    }

    return profilesMap;
  } catch (error) {
    // If ConfigurationManager throws, log and re-throw
    try {
      UnifiedLogger.error('AISidebar', 'Failed to load brief profiles from ConfigurationManager', {
        error: String(error)
      });
    } catch (logError) {
      // UnifiedLogger unavailable during bootstrap
    }
    throw error;
  }
}

/**
 * Parse CSV field into array
 * @private
 * @param {string} csvValue - Comma-separated string
 * @returns {Array<string>} Parsed array
 */
function parseCsvField_(csvValue) {
  if (!csvValue || typeof csvValue !== 'string') {
    return [];
  }
  const trimmed = csvValue.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(',').map(function(item) {
    return item.trim();
  }).filter(function(item) {
    return item.length > 0;
  });
}

const COMMERCIAL_FIT_STATE_HASH_PROP_PREFIX = 'COMMERCIAL_FIT_STATE_HASH_';
const COMMERCIAL_FIT_VECTOR_PERSIST_LIMIT_PROP = 'COMMERCIAL_FIT_VECTOR_PERSIST_LIMIT';
const COMMERCIAL_FIT_VECTOR_PERSIST_DEFAULT = 10;
const COMMERCIAL_FIT_ASSISTANT_FALLBACK_PROP = 'COMMERCIAL_FIT_ASSISTANT_FALLBACK';
const COMMERCIAL_FIT_ASSISTANT_FALLBACK_DEFAULT = true;

const CATALOG_PROMPT_ID = (function() {
  if (typeof resolvePromptId_ === 'function') {
    try {
      const resolved = resolvePromptId_();
      if (resolved) {
        return resolved;
      }
    } catch (error) {
      try { UnifiedLogger.warn('AISidebar', 'CATALOG_PROMPT_ID resolution failed', String(error)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
    }
  }
  if (typeof getScriptProperty === 'function') {
    try {
      const scriptPrompt = getScriptProperty(PROMPT_ID_PROP);
      if (isNonEmptyString(String(scriptPrompt))) {
        return String(scriptPrompt).trim();
      }
    } catch (error) {
      try { UnifiedLogger.warn('AISidebar', 'CATALOG_PROMPT_ID fallback property lookup failed', String(error)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
    }
  }
  return '';
})();

const VECTOR_STORE_ID = (function() {
  if (typeof resolveVectorStoreId_ === 'function') {
    try {
      const resolved = resolveVectorStoreId_();
      if (isNonEmptyString(String(resolved))) {
        return String(resolved).trim();
      }
    } catch (error) {
      try { UnifiedLogger.warn('AISidebar', 'VECTOR_STORE_ID resolution failed', String(error)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
    }
  }
  try {
    return requireSecret(VECTOR_STORE_ID_PROP);
  } catch (secretError) {
    try { UnifiedLogger.error('AISidebar', 'VECTOR_STORE_ID requireSecret failed', String(secretError)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
  }
  return '';
})();

const ASSISTANT_MODEL = (function() {
  const fallback = 'gpt-4o-2024-08-06';
  if (typeof getScriptProperty === 'function') {
    try {
      const prop = getScriptProperty(ASSISTANT_MODEL_PROP);
      if (isNonEmptyString(String(prop))) {
        return String(prop).trim();
      }
    } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'ASSISTANT_MODEL property lookup failed', String(error)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
    }
  }
  return fallback || 'gpt-4o-mini';
})();

let SECTION_TAXONOMY_CACHE = null;
let SCENARIO_PROMPT_CACHE = null;

const fallbackWorkflowTaxonomy = (typeof getFallbackWorkflowTaxonomy === 'function'
  ? getFallbackWorkflowTaxonomy()
  : [
      { canonical: 'strategy-account', label: 'Strategy & Account', weight: 3, isSection: true },
      { canonical: 'asset-development', label: 'Asset Development', weight: 3, isSection: true },
      { canonical: 'pre-production', label: 'Pre-Production', weight: 2, isSection: true },
      { canonical: 'production', label: 'Production', weight: 2, isSection: true },
      { canonical: 'post-production', label: 'Post-Production', weight: 2, isSection: true },
      { canonical: 'distribution-community', label: 'Distribution & Community', weight: 1, isSection: true },
      { canonical: 'pr-influence-activation', label: 'PR & Influence Activation', weight: 1, isSection: true },
      { canonical: 'measurement-optimization', label: 'Measurement & Optimization', weight: 1, isSection: true },
      { canonical: 'retainers-governance', label: 'Retainers & Governance', weight: 1, isSection: true }
    ]);

// Lazy loading pattern from App-script/00_WorkflowTaxonomy.js:206 (avoid triggering getters during bootstrap)
let _workflowTaxonomyMap = null;
let _workflowPhaseOrder = null;
// DELETED: _workflowRequiredQuestionRules variable - Plan 12-10
// Questions are NO LONGER part of system per user directive

function getWorkflowTaxonomyMap() {
  if (!_workflowTaxonomyMap) {
    // Guard pattern from App-script/ConfigLoader.js:1191 (CONFIG_TABS may not exist during bootstrap)
    const hasConfigTabs = typeof CONFIG_TABS !== 'undefined' && CONFIG_TABS;
    _workflowTaxonomyMap = (hasConfigTabs && typeof WORKFLOW_TAXONOMY_MAP !== 'undefined' && WORKFLOW_TAXONOMY_MAP && Object.keys(WORKFLOW_TAXONOMY_MAP).length)
      ? WORKFLOW_TAXONOMY_MAP
      : fallbackWorkflowTaxonomy.reduce((map, entry) => {
          map[entry.canonical] = entry;
          return map;
        }, {});
  }
  return _workflowTaxonomyMap;
}

function getWorkflowPhaseOrder() {
  if (!_workflowPhaseOrder) {
    const hasConfigTabs = typeof CONFIG_TABS !== 'undefined' && CONFIG_TABS;
    _workflowPhaseOrder = (hasConfigTabs && typeof WORKFLOW_PHASE_ORDER !== 'undefined' && Array.isArray(WORKFLOW_PHASE_ORDER) && WORKFLOW_PHASE_ORDER.length)
      ? WORKFLOW_PHASE_ORDER.slice()
      : Object.keys(getWorkflowTaxonomyMap());
  }
  return _workflowPhaseOrder;
}

// DELETED: getWorkflowRequiredQuestionRules() function - Plan 12-10
// Questions are NO LONGER part of system per user directive
// Previously: Lines 693-701 (9 lines) - lazy-loaded WORKFLOW_REQUIRED_QUESTION_RULES

// Add Object.defineProperty getters for backward compatibility (pattern from App-script/00_WorkflowTaxonomy.js:481)
Object.defineProperty(globalThis, 'workflowTaxonomyMap', {
  get: function() { return getWorkflowTaxonomyMap(); },
  configurable: true
});
Object.defineProperty(globalThis, 'workflowPhaseOrder', {
  get: function() { return getWorkflowPhaseOrder(); },
  configurable: true
});
// DELETED: workflowRequiredQuestionRules global property export - Plan 12-10
// Questions are NO LONGER part of system per user directive
// Previously: Lines 706-709 (4 lines) - global getter for question rules

const TAXONOMY_MISSING_LOG = new Set();
// DELETED OLD LINE EXPANSION CONSTANTS (was lines 733-734):
// - FEATURE_SCOPE_LINE_EXPANSION = 'FEATURE_SCOPE_LINE_EXPANSION'
// - FEATURE_SCOPE_LINE_EXPANSION_DEFAULT = false
// Related to deleted applyScopeLineExpansion system - no longer needed

// mapWorkflowCanonical is provided globally by 00_WorkflowTaxonomy.js

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function loadSectionTaxonomy() {
  const trace = UnifiedLogger.startTrace('AISidebar', 'loadSectionTaxonomy');

  try {
    if (SECTION_TAXONOMY_CACHE) {
      trace.complete('Section taxonomy cached', { cached: true });
      return SECTION_TAXONOMY_CACHE;
    }
  const rawSections = typeof getSectionTaxonomy === 'function'
    ? getSectionTaxonomy()
    : [];
  const source = Array.isArray(rawSections) && rawSections.length ? rawSections : fallbackWorkflowTaxonomy;
  const sections = source
    .filter(entry => entry && entry.canonical)
    .map(entry => {
      const canonical = entry.canonical;
      const base = workflowTaxonomyMap[canonical] || {};
      return {
        canonical: canonical,
        label: entry.label || base.label || canonical,
        weight: Number(entry.weight || base.weight || 1),
        isSection: entry.isSection !== false
      };
    });
  const weightMap = sections.reduce((map, entry) => {
    map[entry.canonical] = entry.weight || 1;
    return map;
  }, {});
  SECTION_TAXONOMY_CACHE = {
    sections: sections,
    weightMap: weightMap
  };

  trace.complete('Section taxonomy loaded', {
    sectionCount: sections.length
  });

  return SECTION_TAXONOMY_CACHE;

  } catch (error) {
    trace.fail('Section taxonomy load failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'loading section taxonomy',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    // Return empty fallback
    return {
      sections: [],
      weightMap: {}
    };
  }
}

// Lazy loading pattern from App-script/00_WorkflowTaxonomy.js:206 (avoid CONFIG_TABS bootstrap issues)
let _sectionTaxonomyMeta = null;
let _aiMandatoryCategories = null;
let _canonicalCategoryLabels = null;

function getSectionTaxonomyMeta() {
  if (!_sectionTaxonomyMeta) {
    _sectionTaxonomyMeta = loadSectionTaxonomy();
  }
  return _sectionTaxonomyMeta;
}

function getAiMandatoryCategories() {
  if (!_aiMandatoryCategories) {
    _aiMandatoryCategories = getSectionTaxonomyMeta().sections;
  }
  return _aiMandatoryCategories;
}

function getCanonicalCategoryLabels() {
  if (!_canonicalCategoryLabels) {
    _canonicalCategoryLabels = getAiMandatoryCategories().reduce((map, cat) => {
      map[cat.canonical] = cat.label;
      return map;
    }, {});
  }
  // Enrichment pattern from App-script/AISidebar.js:1141
  enrichCanonicalCategoryLabels();
  return _canonicalCategoryLabels;
}

// Maintain compatibility with existing code (pattern from App-script/00_WorkflowTaxonomy.js:482)
Object.defineProperty(globalThis, 'SECTION_TAXONOMY_META', {
  get: function() { return getSectionTaxonomyMeta(); },
  configurable: true
});
Object.defineProperty(globalThis, 'AI_MANDATORY_CATEGORIES', {
  get: function() { return getAiMandatoryCategories(); },
  configurable: true
});
Object.defineProperty(globalThis, 'CANONICAL_CATEGORY_LABELS', {
  get: function() { return getCanonicalCategoryLabels(); },
  configurable: true
});

// Lazy loading pattern from App-script/00_WorkflowTaxonomy.js:206 (avoid triggering getters during bootstrap)
let _mandatoryCategorySet = null;
let _tokenWeights = null;
let _canonicalLabelsEnriched = false;

function getMandatoryCategorySet() {
  if (!_mandatoryCategorySet) {
    const phaseOrder = getWorkflowPhaseOrder();
    const aiCategories = getAiMandatoryCategories();
    _mandatoryCategorySet = new Set(
      phaseOrder.length ? phaseOrder : aiCategories.map(cat => cat.canonical)
    );
  }
  return _mandatoryCategorySet;
}

function getTokenWeights() {
  if (!_tokenWeights) {
    const taxonomyMeta = getSectionTaxonomyMeta();
    _tokenWeights = Object.assign({}, taxonomyMeta.weightMap);
  }
  return _tokenWeights;
}

function enrichCanonicalCategoryLabels() {
  if (_canonicalLabelsEnriched) {
    return;
  }
  _canonicalLabelsEnriched = true;

  const phaseOrder = getWorkflowPhaseOrder();
  const taxonomyMap = getWorkflowTaxonomyMap();
  const labels = getCanonicalCategoryLabels();

  phaseOrder.forEach(canonical => {
    if (taxonomyMap[canonical] && !labels[canonical]) {
      labels[canonical] = taxonomyMap[canonical].label;
    }
  });
}

// Add Object.defineProperty getters for backward compatibility (pattern from App-script/00_WorkflowTaxonomy.js:482)
Object.defineProperty(globalThis, 'MANDATORY_CATEGORY_SET', {
  get: function() { return getMandatoryCategorySet(); },
  configurable: true
});
Object.defineProperty(globalThis, 'TOKEN_WEIGHTS', {
  get: function() { return getTokenWeights(); },
  configurable: true
});

const USAGE_RIGHTS_REGION_MAP = {
  mena: ['mena', 'middle east', 'gcc+'],
  gcc: ['gcc', 'g.c.c', 'gulf'],
  global: ['global', 'worldwide', 'intl', 'international'],
  uae: ['uae', 'dubai', 'abu dhabi'],
  regional: ['regional'],
  default: ['local', 'domestic']
};

const USAGE_RIGHTS_REGION_LABELS = {
  mena: 'MENA',
  gcc: 'GCC',
  global: 'Global',
  uae: 'UAE',
  regional: 'Regional',
  default: 'Local'
};

const USAGE_RIGHTS_MIN_BASE_MONTHS = 12;

const LLM_MAX_ARRAY_ITEMS = 20;
const LLM_MAX_STRING_LENGTH = 320;
const LLM_DEFAULT_INPUT_COST_PER_1K = 0.005; // USD
const LLM_DEFAULT_OUTPUT_COST_PER_1K = 0.015; // USD
const LLM_SCOPE_RESPONSE_TOKENS_DEFAULT = 2600;
const LLM_SCOPE_DRAFT_RESPONSE_TOKENS = 12000;
const LLM_QUOTE_RESPONSE_TOKENS_DEFAULT = 2600;

const EMBEDDING_MAX_CHARS = 6000;
const EMBEDDING_MAX_SEGMENTS = 10;

const TALENT_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['count', 'requirements', 'notes'],
  properties: {
    count: { type: ['number', 'null'] },
    requirements: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' }
  }
};

const CREW_EQUIPMENT_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requirements', 'notes'],
  properties: {
    requirements: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' }
  }
};

// Refactored 2026-01-10: Dual schema system (CONTRACT_20260110_190200 Phase 2)
// Pattern from App-script/AISidebar.js:1092 (schema definitions)

/**
 * Simple 8-field schema for validating LLM output BEFORE normalization.
 * Used in invokeLLMChat responseFormat parameter.
 * LLM returns this simple structure, then normalizeScopeDraftToFinalStructure enriches to 22 fields.
 */
const SCOPE_DRAFT_LLM_SCHEMA = Object.freeze({
  name: 'ScopeDraftLLM',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['projectName', 'briefType', 'scopeEntries', 'warnings', 'assumptions'],
    properties: {
      projectName: { type: 'string' },
      briefType: { type: 'string' },
      scopeEntries: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'canonical', 'isSection', 'deliverables', 'notes', 'signals', 'resources', 'sourceExcerpt'],
          properties: {
            label: { type: 'string' },
            canonical: { type: 'string' },
            isSection: { type: 'boolean' },
            deliverables: { type: 'array', items: { type: 'string' } },
            notes: { type: 'array', items: { type: 'string' } },
            signals: { type: 'array', items: { type: 'string' } },
            resources: {
              anyOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } }
              ]
            },
            sourceExcerpt: { type: 'string' }
          }
        }
      },
      warnings: { type: 'array', items: { type: 'string' } },
      assumptions: { type: 'array', items: { type: 'string' } }
    }
  }
});

/**
 * Complete 22-field schema for validating final draft AFTER normalization.
 * Contains all required fields including id, sectionId, parentId, childIds, metadata.
 * Used for validation after normalizeScopeDraftToFinalStructure processes LLM output.
 */
const SCOPE_DRAFT_PROPERTIES = Object.freeze({
  projectName: { type: 'string' },
  clientName: { type: 'string' },
  mediaType: { type: 'array', items: { type: 'string' } },
  shootDays: { type: ['number', 'null'] },
  deliverables: { type: 'array', items: { type: 'string' } },
  locations: { type: 'array', items: { type: 'string' } },
  services: { type: 'array', items: { type: 'string' } },
  retainers: { type: 'array', items: { type: 'string' } },
  campaigns: {
    type: 'array',
    additionalProperties: false,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'dates', 'events', 'objectives', 'targetAudiences', 'channels'],
      properties: {
        name: { type: 'string' },
        dates: { type: 'array', items: { type: 'string' } },
        events: { type: 'array', items: { type: 'string' } },
        objectives: { type: 'array', items: { type: 'string' } },
        targetAudiences: { type: 'array', items: { type: 'string' } },
        channels: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  channels: { type: 'array', items: { type: 'string' } },
  talent: {
    anyOf: [
      { type: 'array', items: TALENT_ENTRY_SCHEMA },
      TALENT_ENTRY_SCHEMA,
      { type: 'null' }
    ]
  },
  crew: {
    anyOf: [
      { type: 'array', items: CREW_EQUIPMENT_ENTRY_SCHEMA },
      CREW_EQUIPMENT_ENTRY_SCHEMA,
      { type: 'null' }
    ]
  },
  equipment: {
    anyOf: [
      { type: 'array', items: CREW_EQUIPMENT_ENTRY_SCHEMA },
      CREW_EQUIPMENT_ENTRY_SCHEMA,
      { type: 'null' }
    ]
  },
  usage: {
    type: 'object',
    additionalProperties: false,
    required: ['durationMonths', 'region', 'notes'],
    properties: {
      durationMonths: { type: ['number', 'null'] },
      region: { type: ['string', 'null'] },
      notes: { type: 'array', items: { type: 'string' } }
    }
  },
  budget: {
    type: 'object',
    additionalProperties: false,
    required: ['target', 'currency', 'notes'],
    properties: {
      target: { type: ['number', 'null'] },
      currency: { type: ['string', 'null'] },
      notes: { type: 'array', items: { type: 'string' } }
    }
  },
  schedule: {
    type: 'object',
    additionalProperties: false,
    required: ['keyDates', 'notes'],
    properties: {
      keyDates: { type: 'array', items: { type: 'string' } },
      notes: { type: 'array', items: { type: 'string' } }
    }
  },
  reporting: {
    type: 'object',
    additionalProperties: false,
    required: ['cadence', 'metrics', 'notes'],
    properties: {
      cadence: { type: ['string', 'null'] },
      metrics: { type: 'array', items: { type: 'string' } },
      notes: { type: 'array', items: { type: 'string' } }
    }
  },
  warnings: { type: 'array', items: { type: 'string' } },
  questions: { type: 'array', items: { type: 'string' } },
  assumptions: { type: 'array', items: { type: 'string' } },
  requiredQuestions: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'question', 'field', 'required'],
      properties: {
        id: { type: 'string' },
        question: { type: 'string' },
        field: { type: 'string' },
        required: { type: ['boolean', 'null'] }
      }
    }
  },
  requiredAnswers: {
    type: 'object',
    additionalProperties: { type: 'string' }
  },
  scopeEntries: {
    type: 'array',
    minItems: 1,
    items: {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'sectionId',
        'scopeLabel',
        'visibility',
        'approvalStatus',
        'sourceExcerpt',
        'interpretation',
        'deliverables',
        'resources',
        'contingency',
        'notes',
        'signals',
        'canonical',
        'isSection',
        'parentId',
        'childIds',
        'metadata',
        'quantitySignals',
        'scenarioHighlights',
        'usageSummary',
        'catalogRefs',
        'resourcePackages'
      ],
      properties: {
        id: { type: 'string' },
        sectionId: { type: 'string' },
        scopeLabel: { type: 'string' },
        visibility: { type: 'string' },
        approvalStatus: { type: 'string' },
        sourceExcerpt: { type: 'string' },
        interpretation: { type: 'string' },
        deliverables: { type: 'array', items: { type: 'string' } },
        resources: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['role', 'hours', 'rate', 'internal'],
            properties: {
              role: { type: 'string' },
              hours: { type: ['number', 'null'] },
              rate: { type: ['number', 'null'] },
              internal: { type: ['boolean', 'null'] }
            }
          }
        },
        contingency: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['type', 'amount'],
          properties: {
            type: { type: ['string', 'null'] },
            amount: { type: ['number', 'null'] }
          }
        },
        notes: { type: 'array', items: { type: 'string' } },
        signals: { type: 'array', items: { type: 'string' } },
        canonical: { type: 'string' },
        isSection: { type: 'boolean' },
        parentId: { type: 'string' },
        childIds: { type: 'array', items: { type: 'string' } },
        metadata: {
          type: 'object',
          additionalProperties: false,
          required: ['parentScopeId', 'sectionParentId', 'vectorDetailParent', 'isSectionChild', 'detailSource', 'phaseRecovered'],
          properties: {
            bundleKey: { type: 'string' },  // Deprecated but kept for backward compatibility
            parentScopeId: { type: 'string' },
            sectionParentId: { type: 'string' },
            vectorDetailParent: { type: 'string' },
            isSectionChild: { type: 'boolean' },
            detailSource: { type: 'string' },
            phaseRecovered: { type: 'string' }
          }
        },
        quantitySignals: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'value', 'unit', 'source', 'primary', 'evidence'],
            properties: {
              type: { type: 'string' },
              label: { type: 'string' },
              value: { type: ['number', 'null'] },
              unit: { type: 'string' },
              source: { type: 'string' },
              primary: { type: 'boolean' },
              evidence: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        scenarioHighlights: { type: 'array', items: { type: 'string' } },
        usageSummary: {
          type: 'object',
          additionalProperties: false,
          required: ['durationMonths', 'region', 'notes'],
          properties: {
            durationMonths: { type: ['number', 'null'] },
            region: { type: ['string', 'null'] },
            notes: { type: 'array', items: { type: 'string' } }
          }
        },
        catalogRefs: { type: 'array', items: { type: 'string' } },
        resourcePackages: { type: 'array', items: { type: 'string' } }
      }
    }
  }
});

const SCOPE_DRAFT_REQUIRED_KEYS = Object.keys(SCOPE_DRAFT_PROPERTIES).filter(key => key !== 'requiredAnswers');

const SCOPE_DRAFT_JSON_SCHEMA = {
  name: 'ScopeDraft',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: SCOPE_DRAFT_REQUIRED_KEYS,
    properties: SCOPE_DRAFT_PROPERTIES
  }
};

const CLIENT_CONTEXT_DEFAULT_PERSONA = 'hrmny managing director safeguarding margin, contingency, and delivery quality across creative, production, social, PR, and experiential programmes.';
const CLIENT_CONTEXT_MAX_SIGNALS = 4;

const CLIENT_INDUSTRY_KEYWORDS = [
  { label: 'Financial Services', keywords: ['bank', 'banking', 'fintech', 'finance', 'investment', 'lending', 'credit', 'insurance', 'wealth'] },
  { label: 'Government & Public Sector', keywords: ['ministry', 'department', 'authority', 'council', 'government', 'municipality'] },
  { label: 'Hospitality & Tourism', keywords: ['hotel', 'resort', 'tourism', 'destination', 'visitor', 'hospitality', 'travel'] },
  { label: 'Retail & Consumer', keywords: ['retail', 'mall', 'store', 'shopper', 'ecommerce', 'fashion', 'luxury', 'boutique'] },
  { label: 'Technology & Telecom', keywords: ['technology', 'software', 'platform', 'telecom', 'ai', 'cloud', 'startup', 'app'] },
  { label: 'Healthcare & Wellness', keywords: ['hospital', 'clinic', 'pharma', 'medical', 'patient', 'wellness', 'healthcare'] },
  { label: 'Education & Culture', keywords: ['school', 'university', 'education', 'academy', 'training', 'museum', 'cultural'] },
  { label: 'Automotive & Mobility', keywords: ['automotive', 'vehicle', 'motorsport', 'mobility', 'transport', 'car', 'rideshare'] },
  { label: 'Energy & Sustainability', keywords: ['energy', 'solar', 'sustainab', 'utility', 'oil', 'gas', 'net zero'] },
  { label: 'Entertainment & Sports', keywords: ['entertainment', 'festival', 'concert', 'sport', 'league', 'fan', 'broadcast'] }
];

const CLIENT_REGION_KEYWORDS = [
  { label: 'United Arab Emirates', keywords: ['uae', 'dubai', 'abu dhabi', 'sharjah', 'ras al khaimah', 'umm al quwain', 'ajman', 'fujairah'] },
  { label: 'Saudi Arabia', keywords: ['saudi', 'ksa', 'riyadh', 'jeddah', 'neom', 'diriyah'] },
  { label: 'Qatar', keywords: ['qatar', 'doha', 'msheireb', 'lusail'] },
  { label: 'Kuwait', keywords: ['kuwait'] },
  { label: 'Bahrain', keywords: ['bahrain', 'manama'] },
  { label: 'Oman', keywords: ['oman', 'muscat'] },
  { label: 'Regional (GCC/MENA)', keywords: ['gcc', 'gulf', 'mena', 'middle east'] },
  { label: 'Global', keywords: ['global', 'international', 'worldwide', 'intl'] }
];

const CLIENT_EXPECTATION_KEYWORDS = [
  { label: 'Weekend or after-hours coverage expected', keywords: ['weekend', 'after-hour', 'after hours', 'afterhours', 'overnight', '24/7', 'night shift', 'late-night', 'late night'] },
  { label: 'Multilingual delivery required (Arabic + English)', keywords: ['arabic', 'bilingual', 'multilingual', 'translation', 'dual language'] },
  { label: 'VIP or leadership visibility required', keywords: ['vip', 'minister', 'ceo', 'board', 'royal', 'protocol', 'executive'] },
  { label: 'Live broadcast or streaming component', keywords: ['livestream', 'live stream', 'broadcast', 'simulcast', 'live feed', 'live coverage'] },
  { label: 'Retail or nationwide activation cadence', keywords: ['retail rollout', 'store activation', 'mall tour', 'pop-up', 'roadshow'] }
];

const CLIENT_RISK_KEYWORDS = [
  { label: 'Compressed timeline / urgent turnaround', keywords: ['urgent', 'immediate', '48 hour', '48-hour', 'rush', 'asap', 'tight timeline', 'fast-track', 'fast track', 'accelerated'] },
  { label: 'Regulatory or compliance scrutiny', keywords: ['regulation', 'regulated', 'compliance', 'audit', 'approval', 'governance', 'licence', 'license'] },
  { label: 'Budget sensitivity flagged by client', keywords: ['cost-sensitive', 'tight budget', 'limited budget', 'budget cap', 'cost control'] },
  { label: 'High security clearance or restricted access', keywords: ['security clearance', 'restricted', 'secure site', 'access control', 'confidential'] }
];

const CLIENT_CONSTRAINT_KEYWORDS = [
  { label: 'Travel or Accommodation Required', keywords: ['travel', 'flight', 'hotel', 'accommodation', 'visa', 'per diem', 'fly'] },
  { label: 'Specific Vendor/Partner Mandate', keywords: ['use vendor', 'preferred partner', 'specific agency', 'mandatory supplier'] },
  { label: 'Technology/Tool Constraint', keywords: ['must use', 'specific software', 'tool requirement', 'platform constraint', 'hosting requirement'] },
  { label: 'Legal or Exclusivity Constraint', keywords: ['exclusivity', 'conflict check', 'non-compete', 'nda', 'intellectual property rights'] },
  { label: 'Hard Budget Cap', keywords: ['budget cap', 'maximum spend', 'not to exceed', 'fixed fee', 'capped at'] }
];

const QUESTION_FIELD_PATH_MAP = {
  project_name: ['projectName'],
  client_objectives: ['assumptions'],
  client_name: ['clientName'],
  project_objectives: ['assumptions'],
  creative_deliverables: ['deliverables'],
  deliverables: ['deliverables'],
  preprod_milestones: ['schedule.keyDates', 'schedule.notes'],
  shoot_days: ['shootDays', 'usage.notes'],
  talent_requirements: ['talent.requirements', 'talent.notes'],
  talent_count: ['talent.count'],
  post_delivery_expectations: ['deliverables'],
  usage_duration: ['usage.durationMonths'],
  usage_region: ['usage.region'],
  reporting_cadence: ['reporting.cadence'],
  reporting_metrics: ['reporting.metrics'],
  reporting_notes: ['reporting.notes'],
  retainer_hours: ['retainers'],
  campaign_channels: ['channels'],
  schedule_keydates: ['schedule.keyDates'],
  schedule_notes: ['schedule.notes'],
  budget_target: ['budget.target'],
  budget_currency: ['budget.currency'],
  assumptions: ['assumptions'],
  warnings: ['warnings']
};

const QUESTION_TEXT_KEYWORD_RULES = [
  { regex: /(shoot|production|activation)[^a-z0-9]+day/i, tokens: ['shoot_days'] },
  { regex: /(number|count)\s+of\s+(talent|models|crew)/i, tokens: ['talent_count', 'talent_requirements'] },
  { regex: /(usage|license|licence|rights).*(duration|term|month|year)/i, tokens: ['usage_duration'] },
  { regex: /(usage|license|licence|rights).*(region|territor|geo|market)/i, tokens: ['usage_region'] },
  { regex: /(reporting|performance).*(cadence|frequency|schedule)/i, tokens: ['reporting_cadence'] },
  { regex: /(reporting|performance).*(metric|kpi|analysis|dashboard)/i, tokens: ['reporting_metrics'] },
  { regex: /(budget|capex|spend).*(target|amount|cap)/i, tokens: ['budget_target'] },
  { regex: /(deliverable|output|asset)/i, tokens: ['deliverables'] },
  { regex: /(campaign|channel)/i, tokens: ['campaign_channels'] },
  { regex: /(retainer|ongoing).*(hour|allocation)/i, tokens: ['retainer_hours'] },
  { regex: /(schedule|timeline|key date|milestone)/i, tokens: ['schedule_keydates', 'schedule_notes'] },
  { regex: /(client|project)\s+name/i, tokens: ['project_name', 'client_name'] }
];

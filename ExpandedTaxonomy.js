// DELETED: getExpandedTaxonomyData() function (3291 lines)
// This hardcoded taxonomy is NO LONGER USED
// ALL phase data now comes from Config: Scope Phases sheet (single source of truth)
// ConfigSeeder NO LONGER seeds from hardcoded data
// If you need to repopulate Config: Scope Phases, import from CSV or manual entry

// Helper variables and functions that used EXPANDED_TAXONOMY need to call the function now.

let BRIEF_TYPE_TAXONOMY_MAP = null;

function getBriefTypeTaxonomyMap() {
  if (BRIEF_TYPE_TAXONOMY_MAP) return BRIEF_TYPE_TAXONOMY_MAP;

  // Load from Config: Scope Phases sheet via ConfigurationManager
  let scopePhases = [];
  try {
    if (typeof ConfigurationManager !== 'undefined' && ConfigurationManager.get) {
      scopePhases = ConfigurationManager.get('scope.phases') || [];
    }
  } catch (error) {
    console.error('[ExpandedTaxonomy] Failed to load scope.phases from ConfigurationManager:', error);
  }

  // If sheet has data, use it
  if (Array.isArray(scopePhases) && scopePhases.length > 0) {
    const map = {};
    scopePhases.forEach(function(phase) {
      if (!phase || !phase.briefType || !phase.canonical) {
        return;
      }
      const briefType = phase.briefType;
      const canonical = phase.canonical;

      if (!map[briefType]) {
        map[briefType] = {};
      }

      // Parse taxonomyHintJSON to get full taxonomy data
      let taxonomyData = {};
      if (phase.taxonomyHintJSON) {
        try {
          taxonomyData = typeof phase.taxonomyHintJSON === 'string'
            ? JSON.parse(phase.taxonomyHintJSON)
            : phase.taxonomyHintJSON;
        } catch (parseError) {
          console.error('[ExpandedTaxonomy] Failed to parse taxonomyHintJSON for', canonical, parseError);
        }
      }

      map[briefType][canonical] = {
        canonical: canonical,
        name: phase.label || canonical,
        code: taxonomyData.code || '',
        purpose: taxonomyData.purpose || '',
        key_deliverables_examples: taxonomyData.keyDeliverables || [],
        positive_signals: taxonomyData.signals || [],
        keywords: taxonomyData.keywords || []
      };
    });

    BRIEF_TYPE_TAXONOMY_MAP = map;
    return BRIEF_TYPE_TAXONOMY_MAP;
  }

  // If sheet is empty, return empty map - user must seed Config: Scope Phases first
  console.error('[ExpandedTaxonomy] Config: Scope Phases sheet is empty. Run Menu > Seed Config to populate.');
  BRIEF_TYPE_TAXONOMY_MAP = {};
  return BRIEF_TYPE_TAXONOMY_MAP;
}

const FEATURE_ENHANCED_TAXONOMY_SIGNALS_PROP = 'FEATURE_ENHANCED_TAXONOMY_SIGNALS';
const FEATURE_ENHANCED_TAXONOMY_SIGNALS_DEFAULT = true;

function getBriefTypePhaseTaxonomy(briefType) {
  const map = getBriefTypeTaxonomyMap();
  let phases = map[briefType] || {};
  try {
    if (typeof isConfigDynamicEnabled === 'function'
      && typeof getPhaseTaxonomyOverridesDynamic === 'function'
      && isConfigDynamicEnabled()) {
      const overrides = getPhaseTaxonomyOverridesDynamic();
      const typeOverrides = overrides && overrides[briefType];
      if (typeOverrides && typeof typeOverrides === 'object') {
        phases = Object.assign({}, phases);
        Object.keys(typeOverrides).forEach(function(key) {
          phases[key] = Object.assign({}, phases[key] || {}, typeOverrides[key]);
        });
      }
    }
  } catch (error) {
    try { UnifiedLogger.warn('ExpandedTaxonomy', 'getBriefTypePhaseTaxonomy dynamic override failed', String(error)); } catch (ignore) {
      console.error('[ExpandedTaxonomy] Error:', ignore.message, ignore.stack);
    }
  }
  return phases;
}

function getPhaseTaxonomyEntry(briefType, canonical) {
  const phases = getBriefTypePhaseTaxonomy(briefType);
  return phases && typeof phases === 'object' ? phases[canonical] : null;
}

function isEnhancedTaxonomyEnabled() {
  if (typeof getScriptProperty !== 'function') {
    return FEATURE_ENHANCED_TAXONOMY_SIGNALS_DEFAULT;
  }
  try {
    const raw = getScriptProperty(FEATURE_ENHANCED_TAXONOMY_SIGNALS_PROP);
    if (raw === null || raw === undefined || raw === '') {
      return FEATURE_ENHANCED_TAXONOMY_SIGNALS_DEFAULT;
    }
    const normalized = String(raw).toLowerCase().trim();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    return FEATURE_ENHANCED_TAXONOMY_SIGNALS_DEFAULT;
  } catch (error) {
    try { UnifiedLogger.warn('ExpandedTaxonomy', 'isEnhancedTaxonomyEnabled failed', String(error)); } catch (ignore) {
      console.error('[ExpandedTaxonomy] Error:', ignore.message, ignore.stack);
    }
    return FEATURE_ENHANCED_TAXONOMY_SIGNALS_DEFAULT;
  }
}

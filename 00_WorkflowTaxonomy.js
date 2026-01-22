/**
 * Workflow taxonomy bootstrap.
 * Defines hrmny's end-to-end delivery phases plus compatibility helpers so all
 * modules (AISidebar, TemplateManager, ScopeMap) share a single source of truth.
 * This file is prefixed with 00_ so it loads before dependent scripts.
 */
(function bootstrapWorkflowTaxonomy(global) {
  if (!global) {
    return;
  }

  const BASE_VERSION = '2025-11-01';

  const BASE_TAXONOMY = [];

  // DELETED: LEGACY_CANONICAL_MAP removed (2026-01-17, Plan 12-02)
  // All OLD canonical IDs have been migrated to NEW canonical IDs
  // Use NEW IDs: strategy-account, asset-development, pre-production, production, post-production, distribution-community

  function normalizeKey(value) {
    if (!value && value !== 0) {
      return '';
    }
    return value
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeSlug(value) {
    const normalized = normalizeKey(value);
    if (!normalized) {
      return '';
    }
    return normalized.replace(/\s+/g, '-');
  }

  function registerSynonym(lookup, canonical, value) {
    if (!canonical || !value) {
      return;
    }
    const normalized = normalizeKey(value);
    if (!normalized) {
      return;
    }
    lookup[normalized] = canonical;
    lookup[normalized.replace(/\s+/g, '-')] = canonical;
  }

  function buildWorkflowTaxonomy() {
    const taxonomy = (() => {
      let config = null;
      try {
        // Load scope phases from ConfigurationManager (replaces getScopeCategoryConfigMapDynamic)
        // Bootstrap-safe: ConfigurationManager may not be loaded yet (00_ prefix loads before ConfigurationManager.js)
        if (typeof ConfigurationManager !== 'undefined' && ConfigurationManager.get) {
          try {
            config = ConfigurationManager.get('scope.phases');
          } catch (configError) {
            // Fallback logging (UnifiedLogger may fail in error states)
            console.error('[00_WorkflowTaxonomy] Failed to load scope phases:', configError);
          }
        }
      } catch (error) {
        // Fallback logging (UnifiedLogger may fail in error states)
        console.error('[00_WorkflowTaxonomy] Dynamic config load failed:', error);
      }
      const hasConfig = config && typeof config === 'object' && Object.keys(config).some(function(key) {
        const phases = config[key] && config[key].phases;
        return Array.isArray(phases) && phases.length > 0;
      });
      if (!hasConfig) {
        return [];
      }
      const collected = [];
      if (config && typeof config === 'object') {
        const seen = new Set();
        Object.keys(config).forEach(function(key) {
          const phases = config[key] && Array.isArray(config[key].phases) ? config[key].phases : [];
          phases.forEach(function(phase) {
            if (!phase) {
              return;
            }
            const canonicalRaw = phase.canonical || phase.id || phase.label;
            if (!canonicalRaw) {
              return;
            }
            const canonical = normalizeSlug(canonicalRaw);
            if (!canonical || seen.has(canonical)) {
              return;
            }
            seen.add(canonical);
            collected.push({
              canonical: canonical,
              label: phase.label || phase.canonical || phase.id || canonical,
              weight: phase.weight !== undefined ? phase.weight : 1,
              isSection: phase.isSection !== false,
              synonyms: Array.isArray(phase.synonyms) ? phase.synonyms.slice() : []
            });
          });
        });
      }
      return collected;
    })();

    const synonymLookup = {};

    taxonomy.forEach(entry => {
      const synonyms = new Set(entry.synonyms);
      synonyms.add(entry.label);
      synonyms.add(entry.label.replace(/&/g, 'and'));
      synonyms.add(entry.canonical);
      synonyms.add(entry.canonical.replace(/-/g, ' '));
      // DELETED: LEGACY_CANONICAL_MAP synonym registration removed (Plan 12-02)
      entry.synonyms = Array.from(new Set(Array.from(synonyms).map(value => value.toString().trim()).filter(Boolean)));
      entry.synonyms.forEach(value => registerSynonym(synonymLookup, entry.canonical, value));
    });

    // DELETED: LEGACY_CANONICAL_MAP synonym registration removed (Plan 12-02)

    return { taxonomy, synonymLookup };
  }

  function createCanonicalResolver(canonicalSet, lookup) {
    return function resolveCanonical(value) {
      if (value === undefined || value === null) {
        return '';
      }
      const normalized = normalizeKey(value);
      const slug = normalizeSlug(value);
      if (!normalized && !slug) {
        return '';
      }
      // Prefer slug-based matching because configured phases use dashed canonicals.
      if (canonicalSet.has(normalized)) {
        return normalized;
      }
      if (canonicalSet.has(slug)) {
        return slug;
      }
      if (lookup[normalized]) {
        return lookup[normalized];
      }
      if (lookup[slug]) {
        return lookup[slug];
      }
      // DELETED: LEGACY_CANONICAL_MAP fallback removed (Plan 12-02)
      return '';
    };
  }

  // Lazy initialization state
  let _initialized = false;
  let _taxonomy = null;
  let _taxonomyMap = null;
  let _phaseOrder = null;
  let _synonymLookup = null;
  let _canonicalResolver = null;
  let _requiredQuestionRules = null;

  function ensureInitialized() {
    if (_initialized) {
      return;
    }
    _initialized = true;

    const { taxonomy, synonymLookup } = buildWorkflowTaxonomy();
    const canonicalSet = new Set(taxonomy.map(entry => entry.canonical));

    // Pattern from App-script/ConfigLoader.js:1540 - CONFIG_LOADER_CACHE removed in v3.1
    try {
      let categoryConfig = null;
      // Load scope phases from ConfigurationManager (replaces getScopeCategoryConfigMapDynamic)
      // Bootstrap-safe: ConfigurationManager may not be loaded yet (00_ prefix loads before ConfigurationManager.js)
      if (typeof ConfigurationManager !== 'undefined' && ConfigurationManager.get) {
        try {
          categoryConfig = ConfigurationManager.get('scope.phases');
        } catch (categoryError) {
          // Fallback logging (UnifiedLogger may fail in error states)
          console.error('[00_WorkflowTaxonomy] Failed to load scope phases:', categoryError);
        }
      }
      if (categoryConfig && typeof categoryConfig === 'object') {
        Object.keys(categoryConfig).forEach(function(key) {
          const phases = categoryConfig[key] && categoryConfig[key].phases;
          if (!Array.isArray(phases)) {
            return;
          }
          phases.forEach(function(phase) {
            if (!phase) {
              return;
            }
            [phase.canonical, phase.id, phase.label].forEach(function(value) {
              const normalized = normalizeKey(value);
              const slug = normalizeSlug(value);
              const canonical = slug || normalized;
              if (!canonical) {
                return;
              }
              canonicalSet.add(canonical);
              canonicalSet.add(slug);
              if (normalized) {
                canonicalSet.add(normalized);
              }
              registerSynonym(synonymLookup, canonical, canonical);
            });
          });
        });
      }
    } catch (phaseSyncError) {
      // Fallback logging (UnifiedLogger may fail in error states)
      console.error('[00_WorkflowTaxonomy] Workflow taxonomy phase merge failed:', phaseSyncError);
    }

    const phaseOrder = taxonomy.map(entry => entry.canonical);
    const canonicalResolver = createCanonicalResolver(canonicalSet, synonymLookup);
    const taxonomyMap = taxonomy.reduce((map, entry) => {
      map[entry.canonical] = Object.assign({}, entry, { taxonomyVersion: BASE_VERSION });
      return map;
    }, {});

    _taxonomy = taxonomy;
    _taxonomyMap = taxonomyMap;
    _phaseOrder = phaseOrder;
    _synonymLookup = synonymLookup;
    _canonicalResolver = canonicalResolver;

    // DELETED: WORKFLOW_REQUIRED_QUESTION_RULES hardcoded array (67 lines) - Plan 12-10
    // Questions are NO LONGER part of system per user directive
    _requiredQuestionRules = [];
  }

  // Lazy initialization pattern from App-script/01_CatalogBundles.js:429 (check-and-init on first access)
  global.WORKFLOW_SECTION_TAXONOMY_VERSION = BASE_VERSION;
  // DELETED: global.WORKFLOW_LEGACY_CANONICAL_MAP export removed (Plan 12-02)

  // Lazy-loaded computed globals - initialize on first access
  Object.defineProperty(global, 'WORKFLOW_SECTION_TAXONOMY', {
    get: function() {
      ensureInitialized();
      return _taxonomy.map(function(entry) {
        return Object.assign({}, entry, { taxonomyVersion: BASE_VERSION });
      });
    },
    configurable: true
  });

  Object.defineProperty(global, 'WORKFLOW_TAXONOMY_MAP', {
    get: function() {
      ensureInitialized();
      return _taxonomyMap;
    },
    configurable: true
  });

  Object.defineProperty(global, 'WORKFLOW_PHASE_ORDER', {
    get: function() {
      ensureInitialized();
      return _phaseOrder;
    },
    configurable: true
  });

  Object.defineProperty(global, 'WORKFLOW_SYNONYM_LOOKUP', {
    get: function() {
      ensureInitialized();
      return _synonymLookup;
    },
    configurable: true
  });

  // DELETED: WORKFLOW_REQUIRED_QUESTION_RULES global property - Plan 12-10
  // Questions are NO LONGER part of system per user directive

  Object.defineProperty(global, 'mapWorkflowCanonical', {
    get: function() {
      ensureInitialized();
      return _canonicalResolver;
    },
    configurable: true
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * Regression test harness for the AI Quote Builder.
 * Each case in apps-script/regression_cases exercises extract → approve → generate.
 */

const REGRESSION_CASE_PATHS = [
  'regression_cases/smm_retainer_core',
  'regression_cases/campaign_launch_core',
  'regression_cases/pr_influencer_core',
  'regression_cases/event_coverage_core',
  'regression_cases/film_production_core',
  'regression_cases/content_sprint_core',
  'regression_cases/strategy_retainer_core',
  'regression_cases/formula_injection_guard',
  'regression_cases/smm_retainer_category.json.html',
  'regression_cases/campaign_category.json.html',
  'regression_cases/pr_influencer_brief_type.json.html',
  'regression_cases/pr_retainer_phase_coverage.json.html',
  'regression_cases/multi_sku_totals.json.html',
  'regression_cases/commercial_fit_vector_checks.json',
  'regression_cases/dynamic_config_health.json',
  'regression_cases/integrity_hash_change.json',
  'regression_cases/seed_header_protection.json',
  'regression_cases/config_schema_guard.json',
  'regression_cases/config_snapshot_stale.json',
  'regression_cases/csv_import_guard.json',
  'regression_cases/cache_invalidation_paths.json',
  'regression_cases/vector_preflight_gate.json',
  'regression_cases/xero_precheck_gate.json'
];

// DELETED OLD LINE EXPANSION CONSTANT (was line 32):
// const FEATURE_SCOPE_LINE_EXPANSION_PROP = 'FEATURE_SCOPE_LINE_EXPANSION';
// Related to deleted applyScopeLineExpansion system - no longer needed
const REGRESSION_SETUP_PROPS = {
  scopeExtraction: 'REGRESSION_OFFLINE_SCOPE_EXTRACTION',
  sectionSummaries: 'REGRESSION_OFFLINE_SECTION_SUMMARIES'
};
const REGRESSION_FORCE_OFFLINE_MODE_PROP = 'REGRESSION_FORCE_OFFLINE_MODE';

function regressionLog_(level, message, detail) {
  const normalized = (level || 'INFO').toUpperCase();
  try {
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger[normalized.toLowerCase()] === 'function') {
      UnifiedLogger[normalized.toLowerCase()]('Regression', message, detail || null);
      return;
    }
  } catch (logError) {
    // Fallback if logger fails
    console.error('Regression logging failed:', String(logError));
  }
}
/**
 * Read a boolean script property with defaults.
 * @param {string} key
 * @param {boolean} fallback
 * @return {boolean}
 */
function getRegressionBoolProperty(key, fallback) {
  if (typeof getScriptProperty !== 'function') {
    return !!fallback;
  }
  const value = getScriptProperty(key);
  if (value === null || value === undefined || value === '') {
    return !!fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return !!fallback;
}

function getRegressionLLMOfflineSettings() {
  return {
    scopeExtraction: getRegressionBoolProperty(REGRESSION_SETUP_PROPS.scopeExtraction, true),
    sectionSummaries: getRegressionBoolProperty(REGRESSION_SETUP_PROPS.sectionSummaries, true)
  };
}

function getRegressionForceOfflineMode() {
  regressionLog_('INFO', 'Regression force-offline mode', { enabled: false });
  return false;
}

function setRegressionForceOfflineMode(enabled) {
  try {
    const desired = (arguments.length === 0) ? true : !!enabled;
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      props.setProperty(REGRESSION_FORCE_OFFLINE_MODE_PROP, desired ? 'true' : 'false');
    }
    regressionLog_('INFO', 'setRegressionForceOfflineMode executed', { enabled: desired });
    return { ok: true, enabled: desired };
  } catch (error) {
    regressionLog_('WARN', 'setRegressionForceOfflineMode failed', String(error));
    return { ok: false, message: '' + error };
  }
}

function setRegressionLLMOfflineProperties(settings) {
  if (!settings || typeof settings !== 'object') {
    return { ok: false, message: 'Missing settings' };
  }
  const updates = {};
  if (settings.scopeExtraction !== undefined) {
    updates[REGRESSION_SETUP_PROPS.scopeExtraction] = settings.scopeExtraction ? 'true' : 'false';
  }
  if (settings.sectionSummaries !== undefined) {
    updates[REGRESSION_SETUP_PROPS.sectionSummaries] = settings.sectionSummaries ? 'true' : 'false';
  }
  // DELETED OLD LINE EXPANSION PROPERTY SETTING (was lines 113-115):
  // if (settings.scopeLineExpansion !== undefined) {
  //   updates[FEATURE_SCOPE_LINE_EXPANSION_PROP] = settings.scopeLineExpansion ? 'true' : 'false';
  // }
  if (!Object.keys(updates).length) {
    return { ok: false, message: 'No properties to update' };
  }
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      props.setProperties(updates);
    }
    return { ok: true, properties: updates };
  } catch (error) {
    regressionLog_('WARN', 'setRegressionLLMOfflineProperties failed', String(error));
    return { ok: false, message: '' + error };
  }
}

function enableRegressionLLMOfflineMode() {
  return setRegressionLLMOfflineProperties({
    scopeExtraction: true,
    sectionSummaries: true,
    scopeLineExpansion: false
  });
}

function loadRegressionCase(path) {
  try {
    const content = readRegressionCaseContent(path);
    if (!content) {
      throw new AppError('REGRESSION_LOAD', 'Regression case content empty for ' + path);
    }
    const parsed = JSON.parse(content);
    if (parsed && parsed.id && parsed.brief) {
      return parsed;
    }
    regressionLog_('WARN', 'Regression case parsed but missing id/brief', { path: path });
  } catch (error) {
    regressionLog_('WARN', 'loadRegressionCase failed', { path: path, error: (error && error.message ? error.message : error) });
  }
  return null;
}

function readRegressionCaseContent(path) {
  const normalizedJsonPath = path.replace(/\.json$/i, '');
  const normalizedHtmlPath = path.replace(/\.html$/i, '');
  const isJsonPath = /\.json$/i.test(path);

  const htmlCandidates = [];
  const addUnique = function(container, value) {
    if (!value || container.indexOf(value) !== -1) {
      return;
    }
    container.push(value);
  };

  addUnique(htmlCandidates, path);
  addUnique(htmlCandidates, normalizedJsonPath);
  if (normalizedHtmlPath !== path && normalizedHtmlPath !== normalizedJsonPath) {
    addUnique(htmlCandidates, normalizedHtmlPath);
  }
  if (isJsonPath) {
    addUnique(htmlCandidates, path + '.html');
    addUnique(htmlCandidates, normalizedJsonPath + '.html');
  }

  for (let i = 0; i < htmlCandidates.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(htmlCandidates[i]).getContent();
    } catch (htmlError) {
      // Continue to next attempt.
    }
  }

  const driveCandidates = [];
  htmlCandidates.forEach(function(candidate) {
    addUnique(driveCandidates, candidate);
  });

  const baseName = path.split('/').pop();
  addUnique(driveCandidates, baseName);
  const baseWithoutExt = baseName.replace(/\.(json|html)$/i, '');
  addUnique(driveCandidates, baseWithoutExt);

  for (let i = 0; i < driveCandidates.length; i++) {
    const driveContent = readProjectFileFromDrive(driveCandidates[i]);
    if (driveContent) {
      return driveContent;
    }
  }

  throw new AppError('REGRESSION_LOAD', 'Unable to load regression content for ' + path);
}

function readProjectFileFromDrive(name) {
  if (!name) {
    return null;
  }
  try {
    const files = DriveApp.getFilesByName(name);
    if (!files.hasNext()) {
      return null;
    }
    return files.next().getBlob().getDataAsString();
  } catch (driveError) {
    regressionLog_('WARN', 'Failed to load regression case via Drive', { name: name, error: (driveError && driveError.message ? driveError.message : driveError) });
  }
  return null;
}

function buildStubLookupEntries(plan) {
  const entries = new Map();
  if (!plan || !Array.isArray(plan.sections)) {
    return entries;
  }
  const normalizeKey = function(value) {
    if (!value && value !== 0) {
      return '';
    }
    if (typeof normalizeSku === 'function') {
      return normalizeSku(value);
    }
    return String(value).trim().toUpperCase();
  };
  plan.sections.forEach(function(section) {
    (section.items || []).forEach(function(item) {
      if (!item || !item.sku) {
        return;
      }
      const key = normalizeKey(item.sku);
      if (!key) {
        return;
      }
      if (!entries.has(key)) {
        entries.set(key, {
          itemCode: item.sku,
          sku: item.sku,
          itemType: 'service'
        });
      }
    });
  });
  return entries;
}

function runWithTemporaryLookupOverride(plan, callback) {
  const lookupEntries = buildStubLookupEntries(plan);
  if (!lookupEntries.size || typeof callback !== 'function' || typeof lookupItem !== 'function') {
    callback && callback();
    return;
  }
  const normalizeKey = function(value) {
    if (!value && value !== 0) {
      return '';
    }
    if (typeof normalizeSku === 'function') {
      return normalizeSku(value);
    }
    return String(value).trim().toUpperCase();
  };
  const originalLookupItem = lookupItem;
  const overriddenLookup = function(itemCode) {
    const key = normalizeKey(itemCode);
    if (key && lookupEntries.has(key)) {
      return lookupEntries.get(key);
    }
    return originalLookupItem ? originalLookupItem(itemCode) : null;
  };
  try {
    lookupItem = overriddenLookup;
    callback();
  } finally {
    lookupItem = originalLookupItem;
  }
}

function buildFallbackLineItems(section, sectionIndex, approvedMap) {
  const baseScopeId = section.scopeEntryId || section.canonical || ('section-' + sectionIndex);
  const sourceEntry = approvedMap.get(baseScopeId) || {};
  const bundleItems = buildBundleLineItems(section, sectionIndex);
  if (bundleItems.length) {
    return bundleItems;
  }
  const deliverables = Array.isArray(sourceEntry.deliverables) && sourceEntry.deliverables.length
    ? sourceEntry.deliverables.slice(0, 2)
    : [];
  const descriptions = deliverables.length ? deliverables : ['Scoped deliverables for this phase.'];
  return descriptions.map(function(description, idx) {
    const atomicId = baseScopeId + '__line-' + sectionIndex + '-' + idx;
    const skuBase = String(baseScopeId || 'SIM').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
    return {
      scopeEntryId: atomicId,
      description: description,
      clientLineName: description,
      qty: 1,
      unit: 'Each',
      sku: skuBase + '-' + (idx + 1),
      visibility: section.visibility || (typeof VISIBILITY !== 'undefined' ? VISIBILITY.CLIENT : 'Client'),
      warnings: [],
      unitRate: 0
    };
  });
}

function buildBundleLineItems(section, sectionIndex) {
  if (!section || !section.canonical) {
    return [];
  }
  const canonical = String(section.canonical).trim().toLowerCase();
  const normalized = canonical.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) {
    return [];
  }
  const matches = [];
  Object.keys(CATALOG_BUNDLE_MAP || {}).forEach(function(key) {
    const parts = String(key || '').split('/');
    if (!parts.length) {
      return;
    }
    const keyCanonical = parts[0];
    const normalizedKey = String(keyCanonical || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (normalizedKey !== normalized) {
      return;
    }
    const bundleEntries = CATALOG_BUNDLE_MAP[key];
    if (!Array.isArray(bundleEntries)) {
      return;
    }
    bundleEntries.forEach(function(bundleEntry, entryIdx) {
      if (!bundleEntry || !bundleEntry.sku) {
        return;
      }
      const atomicId = (section.scopeEntryId || section.canonical || ('section-' + sectionIndex)) + '__bundle-' + entryIdx;
      const safeItem = typeof safeLookupItem === 'function' ? safeLookupItem(bundleEntry.sku) : null;
      const description = safeItem
        ? (safeItem.description || safeItem.name || bundleEntry.notes || bundleEntry.sku)
        : (bundleEntry.notes || bundleEntry.sku);
      const clientLineName = safeItem
        ? (safeItem.name || safeItem.itemCode || description)
        : description;
      const rate = safeItem && typeof safeItem.sellPrice === 'number'
        ? safeItem.sellPrice
        : 0;
      matches.push({
        scopeEntryId: atomicId,
        description: description,
        clientLineName: clientLineName,
        qty: 1,
        unit: safeItem && safeItem.unit ? safeItem.unit : 'Each',
        sku: bundleEntry.sku,
        visibility: section.visibility || (typeof VISIBILITY !== 'undefined' ? VISIBILITY.CLIENT : 'Client'),
        warnings: [],
        unitRate: rate,
        metadata: {
          bundleKey: key,
          primaryBundle: bundleEntry.primary === true
        }
      });
    });
  });
  return matches;
}

function runWithValidationCleared(callback) {
  if (typeof callback === 'function') {
    callback();
  }
}

function deepClone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function buildScopeDraftStubFromApprovedScope(approvedScope) {
  if (!approvedScope || !Array.isArray(approvedScope.scopeEntries) || !approvedScope.scopeEntries.length) {
    return null;
  }
  const cloneArray = function(collection) {
    if (!Array.isArray(collection)) {
      return [];
    }
    return collection.map(function(entry) {
      return deepClone(entry);
    });
  };
  const sanitizeEntry = function(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    return {
      id: entry.id || '',
      sectionId: entry.sectionId || '',
      scopeLabel: entry.scopeLabel || entry.sectionId || '',
      interpretation: entry.interpretation || '',
      sourceExcerpt: entry.sourceExcerpt || '',
      deliverables: cloneArray(entry.deliverables),
      resources: cloneArray(entry.resources),
      notes: cloneArray(entry.notes),
      metadata: entry.metadata ? deepClone(entry.metadata) : {},
      visibility: entry.visibility || 'Client',
      approvalStatus: entry.approvalStatus || 'approved',
      signals: cloneArray(entry.signals),
      requiredQuestions: [],
      warnings: []
    };
  };
  const scopeEntries = approvedScope.scopeEntries.map(sanitizeEntry).filter(Boolean);
  if (!scopeEntries.length) {
    return null;
  }
  return {
    projectName: approvedScope.projectName || '',
    clientName: approvedScope.clientName || '',
    briefType: approvedScope.briefType || '',
    deliverables: cloneArray(approvedScope.deliverables),
    locations: cloneArray(approvedScope.locations),
    services: [],
    retainers: [],
    campaigns: [],
    channels: [],
    talent: deepClone(approvedScope.talent) || { count: 0, requirements: [], notes: '' },
    crew: { requirements: [], notes: '' },
    equipment: { requirements: [], notes: '' },
    usage: deepClone(approvedScope.usage) || {},
    budget: deepClone(approvedScope.budget) || {},
    schedule: deepClone(approvedScope.schedule) || {},
    reporting: deepClone(approvedScope.reporting) || {},
    warnings: [],
    questions: [],
    assumptions: [],
    requiredQuestions: [],
    requiredAnswers: deepClone(approvedScope.requiredAnswers) || {},
    scopeEntries: scopeEntries,
    sourceSummary: approvedScope.sourceSummary || 'Simulated draft derived from approved scope.'
  };
}

function applyStubPlanOverrides(generation, testCase, draft) {
  const planSource = testCase.plan && typeof testCase.plan === 'object'
    ? JSON.parse(JSON.stringify(testCase.plan))
    : (generation.plan && typeof generation.plan === 'object' ? JSON.parse(JSON.stringify(generation.plan)) : { sections: [] });
  planSource.metadata = planSource.metadata || {};
  planSource.metadata.scopeMap = planSource.metadata.scopeMap || {};
  const scopeMapEntries = Array.isArray(planSource.metadata.scopeMap.entries)
    ? planSource.metadata.scopeMap.entries.slice()
    : [];
  const entryIndex = new Map();
  scopeMapEntries.forEach(function(entry) {
    if (entry && entry.id) {
      entryIndex.set(entry.id, Object.assign({}, entry));
    }
  });
  const approvedEntries = Array.isArray(draft && draft.scopeEntries) ? draft.scopeEntries : [];
  const approvedMap = new Map();
  approvedEntries.forEach(function(entry) {
    if (entry && entry.id) {
      approvedMap.set(entry.id, entry);
      if (!entryIndex.has(entry.id)) {
        entryIndex.set(entry.id, Object.assign({}, entry));
      } else {
        entryIndex.set(entry.id, Object.assign({}, entryIndex.get(entry.id), entry));
      }
    }
  });

  const sanitize = typeof sanitizeSheetText === 'function'
    ? sanitizeSheetText
    : function(value) {
      return value === undefined || value === null ? '' : String(value);
    };
  const ensureCatalogSku = function(rawSku) {
    const fallbackSku = 'SMM-GOV-001';
    if (!rawSku) {
      return fallbackSku;
    }
    if (typeof safeLookupItem === 'function') {
      try {
        const match = safeLookupItem(rawSku);
        if (match) {
          return rawSku;
        }
      } catch (lookupError) {
        regressionLog_('WARN', 'safeLookupItem failed', { sku: rawSku, error: lookupError && lookupError.message ? lookupError.message : lookupError });
      }
    }
    return rawSku;
  };
  planSource.sections = Array.isArray(planSource.sections) ? planSource.sections : [];
  planSource.sections.forEach(function(section, sectionIndex) {
    if (!section || typeof section !== 'object') {
      return;
    }
    section.sectionName = sanitize(section.sectionName || section.scopeEntryId || section.canonical || 'Section');
    section.canonical = section.canonical || section.sectionName || '';
    section.childIds = [];
    section.items = Array.isArray(section.items) ? section.items : [];
    if (!section.items.length) {
      section.items = buildFallbackLineItems(section, sectionIndex, approvedMap);
    }
    section.items.forEach(function(item, itemIndex) {
      if (!item || typeof item !== 'object') {
        return;
      }
      item.description = sanitize(item.description || item.clientLineName || '');
      item.clientLineName = sanitize(item.clientLineName || item.description || '');
      if (item.qty === undefined || item.qty === null) {
        item.qty = item.quantityContext && item.quantityContext.qty !== undefined ? item.quantityContext.qty : 1;
      }
      item.unit = sanitize(item.unit || (item.quantityContext && item.quantityContext.unit) || '');
      const baseScopeId = item.scopeEntryId || section.scopeEntryId || ('section-' + sectionIndex);
      const atomicId = baseScopeId + '__line-' + sectionIndex + '-' + itemIndex;
      item.scopeEntryId = atomicId;
      item.sku = ensureCatalogSku(item.sku);
      section.childIds.push(atomicId);
      const parentEntry = approvedMap.get(baseScopeId) || entryIndex.get(baseScopeId);
      const metadata = parentEntry && parentEntry.metadata ? Object.assign({}, parentEntry.metadata) : {};
      if (metadata && !metadata.categoryPhase && parentEntry && parentEntry.metadata && parentEntry.metadata.categoryPhase) {
        metadata.categoryPhase = parentEntry.metadata.categoryPhase;
      }
      if (!entryIndex.has(atomicId)) {
        entryIndex.set(atomicId, {
          id: atomicId,
          sectionId: baseScopeId,
          canonical: parentEntry ? (parentEntry.canonical || parentEntry.sectionId) : section.canonical,
          metadata: metadata
        });
      }
    });
    const sectionId = section.scopeEntryId || section.canonical || ('section-' + sectionIndex);
    if (!entryIndex.has(sectionId)) {
      const approvedSection = approvedMap.get(sectionId);
      entryIndex.set(sectionId, {
        id: sectionId,
        sectionId: sectionId,
        canonical: section.canonical || section.sectionName || (approvedSection && approvedSection.canonical) || '',
        childIds: section.childIds.slice(),
        metadata: approvedSection && approvedSection.metadata ? Object.assign({}, approvedSection.metadata) : {}
      });
    } else {
      const existing = entryIndex.get(sectionId);
      existing.childIds = Array.isArray(existing.childIds) ? existing.childIds.concat(section.childIds) : section.childIds.slice();
    }
  });
  planSource.metadata.scopeMap.entries = Array.from(entryIndex.values());
  planSource.metadata.categoryId = planSource.metadata.categoryId || (testCase.expectations && testCase.expectations.categoryId) || testCase.briefType || '';
  planSource.metadata.scopeMap.contractHash = planSource.metadata.scopeMap.contractHash || (planSource.scopeContracts && planSource.scopeContracts.hash) || '';
  const commercialFitEntries = Array.isArray((testCase.commercialFit && testCase.commercialFit.entries) || planSource.metadata.commercialFit && planSource.metadata.commercialFit.entries)
    ? ((testCase.commercialFit && testCase.commercialFit.entries) || (planSource.metadata.commercialFit && planSource.metadata.commercialFit.entries))
    : [];
  const skuFixes = typeof ensureCommercialFitSkusExist === 'function'
    ? ensureCommercialFitSkusExist(commercialFitEntries)
    : [];
  if (skuFixes && skuFixes.length) {
    planSource.warnings = ensureArray(planSource.warnings || []);
    skuFixes.forEach(function(fix) {
      planSource.warnings.push('Regression plan SKU fix: replaced ' + fix.original + ' with ' + fix.replacement + ' for scopeEntryId ' + (fix.scopeEntryId || '(unknown)') + '.');
    });
  }
  planSource.metadata.commercialFit = {
    entries: commercialFitEntries.map(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const safeEntry = Object.assign({}, entry);
      if (!safeEntry.quantityContext) {
        const selected = Array.isArray(safeEntry.selectedSkus) ? safeEntry.selectedSkus[0] : null;
        safeEntry.quantityContext = {
          qty: selected && selected.qty !== undefined ? selected.qty : (safeEntry.qty !== undefined ? safeEntry.qty : 1),
          unit: selected && selected.unit ? selected.unit : (safeEntry.unit || '')
        };
      }
      if (!Array.isArray(safeEntry.selectedSkus)) {
        safeEntry.selectedSkus = [];
      }
      return safeEntry;
    }).filter(Boolean)
  };
  generation.plan = planSource;
  return planSource;
}

function loadRegressionCases() {
  const cases = [];
  REGRESSION_CASE_PATHS.forEach(function(path) {
    const testCase = loadRegressionCase(path);
    if (testCase) {
      cases.push(testCase);
    } else {
      regressionLog_('WARN', 'Regression case not found or invalid', { path: path });
    }
  });
  return cases;
}

function assertConfigLoaderHealth() {
  if (typeof loadBriefProfiles !== 'function' || typeof loadScopePhases !== 'function') {
    throw new AppError('CONFIG_SCHEMA', 'Config loaders are unavailable. Confirm ConfigLoader.js is deployed.');
  }
  const profiles = loadBriefProfiles();
  const phases = loadScopePhases();
  if (!profiles || !Object.keys(profiles).length) {
    throw new AppError('CONFIG_SCHEMA', 'No brief profiles loaded. Seed Config: Brief Profiles.');
  }
  if (!phases || !Object.keys(phases).length) {
    throw new AppError('CONFIG_SCHEMA', 'No scope phases loaded. Seed Config: Scope Phases.');
  }
}

function runRegressionBriefs() {
  const start = new Date();
  assertConfigLoaderHealth();
  mutationScopeNarrativeShouldInvalidateHash();
  regressionPermissionsPreflightCheck();
  const cases = loadRegressionCases();
  const results = [];
  const sheet = SpreadsheetApp.getActive();
  const isHeadless = !sheet;
  const forceOfflineMode = getRegressionForceOfflineMode();
  const offlineSettings = getRegressionLLMOfflineSettings();
  try {
    if (typeof getConfigStatus === 'function') {
      const status = getConfigStatus();
      regressionLog_('INFO', 'Config status', status);
    }
  } catch (statusError) {
    regressionLog_('WARN', 'Unable to log config status', String(statusError));
  }

  cases.forEach(function(testCase, index) {
    const summary = {
      id: testCase.id || ('case_' + index),
      outcome: 'passed',
      warnings: 0,
      errors: 0,
      validationErrors: 0,
      validationWarnings: 0
    };
    regressionLog_('INFO', 'Starting regression case', { id: summary.id });
    try {
      const briefType = testCase.briefType || testCase.expectations && testCase.expectations.briefType || 'smm-retainer';
      let draft;
      const requiresExtraction = testCase.forceScopeExtraction === true || !testCase.approvedScope;
      if (!requiresExtraction && testCase.approvedScope && typeof testCase.approvedScope === 'object') {
        draft = JSON.parse(JSON.stringify(testCase.approvedScope));
        if (!Array.isArray(draft.scopeEntries) || draft.scopeEntries.length === 0) {
          throw new AppError('REGRESSION_SCOPE', 'Stub approved scope missing scopeEntries for case ' + summary.id);
        }
      } else {
        const answers = Array.isArray(testCase.answers) ? testCase.answers : [];
        if (typeof extractScopeDraft !== 'function') {
          throw new AppError('REGRESSION_SETUP', 'extractScopeDraft is not available in this context');
        }
        const stubScopeDraft = testCase.scopeDraftStub || testCase.scopeDraft || buildScopeDraftStubFromApprovedScope(testCase.approvedScope) || null;
        const simulateExtractionFlag = forceOfflineMode || (typeof testCase.simulateScopeExtraction === 'boolean'
          ? testCase.simulateScopeExtraction
          : offlineSettings.scopeExtraction);
        const extractOpts = {
          briefText: testCase.brief,
          briefType: briefType,
          fileIds: [],
          answers: answers
        };
        if (simulateExtractionFlag) {
          if (!stubScopeDraft) {
            throw new AppError('REGRESSION_SCOPE', 'Scope extraction stub missing for case ' + summary.id);
          }
          extractOpts.simulateLLM = true;
          extractOpts.llmStub = deepClone(stubScopeDraft);
        }
        const extract = extractScopeDraft(extractOpts);
        if (!extract || !extract.success) {
          throw new AppError('REGRESSION_SCOPE', 'Scope extraction failed for case ' + summary.id);
        }
        draft = JSON.parse(JSON.stringify(extract.draft || {}));
      }
      if (!Array.isArray(draft.scopeEntries) || draft.scopeEntries.length === 0) {
        throw new AppError('REGRESSION_SCOPE', 'Scope draft missing scopeEntries for case ' + summary.id);
      }
      summary.scopeEntries = draft.scopeEntries.length;

      const primaryEntry = draft.scopeEntries[0];
      if (testCase.maliciousScopeLabel && primaryEntry) {
        primaryEntry.scopeLabel = testCase.maliciousScopeLabel;
        primaryEntry.label = testCase.maliciousScopeLabel;
      }
      if (primaryEntry) {
        const notes = Array.isArray(primaryEntry.notes) ? primaryEntry.notes.slice() : [];
        const maliciousNotes = [];
        if (testCase.maliciousScopeNote) {
          maliciousNotes.push(testCase.maliciousScopeNote);
        }
        if (Array.isArray(testCase.maliciousScopeNotes)) {
          testCase.maliciousScopeNotes.forEach(function(note) {
            if (note) {
              maliciousNotes.push(note);
            }
          });
        }
        if (testCase.maliciousScriptNote) {
          maliciousNotes.push(testCase.maliciousScriptNote);
        }
        if (maliciousNotes.length) {
          for (let idx = maliciousNotes.length - 1; idx >= 0; idx--) {
            notes.unshift(maliciousNotes[idx]);
          }
          primaryEntry.notes = notes;
        }
      }

      if (testCase.requiredAnswers && typeof testCase.requiredAnswers === 'object') {
        draft.requiredAnswers = Object.assign({}, draft.requiredAnswers || {}, testCase.requiredAnswers);
      }

      if (!isHeadless && typeof recordScopeApproval === 'function') {
        recordScopeApproval({
          approvedScope: draft,
          briefText: testCase.brief,
          fileIds: [],
          snapshotLabel: 'Regression - ' + summary.id
        });
      }

      if (typeof generateQuoteFromApprovedScope !== 'function') {
        throw new AppError('REGRESSION_SETUP', 'generateQuoteFromApprovedScope is not available in this context');
      }
      const generation = generateQuoteFromApprovedScope({
        briefText: testCase.brief,
        briefType: briefType,
        fileIds: [],
        approvedScope: draft,
        requiredAnswers: draft.requiredAnswers || {},
        allowIncomplete: true
      });

      if (Array.isArray(testCase.vectorDiagnostics)) {
        generation.vectorDiagnostics = JSON.parse(JSON.stringify(testCase.vectorDiagnostics));
      }
      if (testCase.vectorHitMap && typeof testCase.vectorHitMap === 'object') {
        generation.vectorHitMap = JSON.parse(JSON.stringify(testCase.vectorHitMap));
      }
      if (testCase.vectorDiagnosticsEnabled !== undefined) {
        generation.vectorDiagnosticsEnabled = !!testCase.vectorDiagnosticsEnabled;
      }

      const plan = applyStubPlanOverrides(generation, testCase, draft);
      if (!isHeadless && typeof populateQuoteBuilderFromPlan === 'function' && plan && plan.metadata && plan.metadata.scopeMap) {
        runWithTemporaryLookupOverride(plan, function() {
          try {
            runWithValidationCleared(function() {
              const simulateSectionSummariesFlag = forceOfflineMode || (typeof testCase.simulateSectionSummaries === 'boolean'
                ? testCase.simulateSectionSummaries
                : offlineSettings.sectionSummaries);
              populateQuoteBuilderFromPlan(plan, plan.metadata.scopeMap, {
                simulateSectionSummaries: simulateSectionSummariesFlag,
                skipItemValidation: true
              });
            });
          } catch (populateError) {
            regressionLog_('WARN', 'populateQuoteBuilderFromPlan failed', { caseId: summary.id, error: '' + populateError });
          }
        });
      }
      runRegressionExports(plan, generation, testCase, summary);
      assertCommercialFitVectorHealth(plan, summary.id);
      assertCommercialFitVectorHitMap(plan, generation, summary.id);

      summary.validationErrors = generation.validation && generation.validation.errors ? generation.validation.errors.length : 0;
      summary.validationWarnings = generation.validation && generation.validation.warnings ? generation.validation.warnings.length : 0;
      summary.summaryGenerated = !!(generation.summaryHtml || generation.summary);

      validateRegressionExpectations(testCase, generation, summary);

      if (!isHeadless && typeof resetQuoteBuilderSheet === 'function') {
        try {
          resetQuoteBuilderSheet(sheet);
        } catch (resetError) {
          regressionLog_('WARN', 'resetQuoteBuilderSheet failed after regression case', { caseId: summary.id, error: '' + resetError });
        }
      }
      try { UnifiedLogger.info('Regression', 'Case passed', { caseId: summary.id, validationErrors: summary.validationErrors, validationWarnings: summary.validationWarnings }); } catch (logError) {
        // Fallback if logger fails
        console.error('Regression logging failed:', String(logError));
      }
    } catch (error) {
      summary.outcome = 'failed';
      summary.error = '' + error;
      summary.stack = error && error.stack ? truncate(error.stack, 500) : '';
      try { UnifiedLogger.warn('Regression', 'Case failed', { caseId: summary.id, error: summary.error }); } catch (logError) {
        // Fallback if logger fails
        console.error('Regression logging failed:', String(logError));
      }
    }
    results.push(summary);
  });

  const durationMs = new Date().getTime() - start.getTime();
  const anyFailures = results.some(function(result) { return result.outcome === 'failed'; });
  try { UnifiedLogger.info('Regression', 'Completed run', { durationMs: durationMs, failures: anyFailures }); } catch (logError) {
    // Fallback if logger fails
    console.error('Regression logging failed:', String(logError));
  }
  try {
    logAIEvent('regression.run', {
      runType: 'regression',
      outcome: anyFailures ? 'failed' : 'passed',
      durationMs: durationMs,
      caseCount: results.length,
      cases: results
    });
  } catch (logError) {
    try { UnifiedLogger.warn('Regression', 'regression.run logging failed', String(logError)); } catch (logError) {
      // Fallback if logger fails
      console.error('Regression logging failed:', String(logError));
    }
  }
  return {
    success: !anyFailures,
    durationMs: durationMs,
    cases: results
  };
}

function validateRegressionExpectations(testCase, generation, summary) {
  const expectations = testCase.expectations || {};
  const maxValidationErrors = expectations.maxValidationErrors !== undefined ? expectations.maxValidationErrors : 0;
  if (summary.validationErrors > maxValidationErrors) {
    throw new AppError('REGRESSION_PLAN', 'Validation errors exceeded allowed maximum (' + summary.validationErrors + ' > ' + maxValidationErrors + ') for case ' + summary.id);
  }
  const maxValidationWarnings = expectations.maxValidationWarnings !== undefined ? expectations.maxValidationWarnings : 8;
  if (summary.validationWarnings > maxValidationWarnings) {
    throw new AppError('REGRESSION_PLAN', 'Validation warnings exceeded allowed maximum (' + summary.validationWarnings + ' > ' + maxValidationWarnings + ') for case ' + summary.id);
  }

  const plan = generation && generation.plan ? generation.plan : {};
  const sections = Array.isArray(plan.sections) ? plan.sections : [];
  if (expectations.minSections && sections.length < expectations.minSections) {
    throw new AppError('REGRESSION_PLAN', 'Plan returned fewer sections (' + sections.length + ') than expected minimum (' + expectations.minSections + ') for case ' + summary.id);
  }
  if (expectations.requiredSections && expectations.requiredSections.length) {
    const sectionNames = new Set(sections.map(function(section) { return section.sectionName || section.canonical || ''; }).filter(Boolean));
    expectations.requiredSections.forEach(function(required) {
      if (!sectionNames.has(required)) {
        throw new AppError('REGRESSION_PLAN', 'Expected section "' + required + '" not found for case ' + summary.id);
      }
    });
  }
  if (expectations.sectionLineCounts) {
    const lineCounts = {};
    sections.forEach(function(section) {
      const key = section.sectionName || section.canonical || '';
      if (!key) {
        return;
      }
      lineCounts[key] = (section.items || []).length;
    });
    Object.keys(expectations.sectionLineCounts).forEach(function(sectionName) {
      const requiredCount = expectations.sectionLineCounts[sectionName];
      const actualCount = lineCounts[sectionName] || 0;
      if (actualCount < requiredCount) {
        throw new AppError('REGRESSION_PLAN', 'Section "' + sectionName + '" returned ' + actualCount + ' line item(s); expected at least ' + requiredCount + ' for case ' + summary.id);
      }
    });
  }
  if (expectations.requireSkus) {
    sections.forEach(function(section) {
      (section.items || []).forEach(function(item) {
        if (!item.sku || !String(item.sku).trim()) {
          throw new AppError('REGRESSION_PLAN', 'Line item missing SKU in section "' + (section.sectionName || section.canonical || '') + '" for case ' + summary.id);
        }
      });
    });
  }
  if (expectations.rejectFormulaPrefixes) {
    const violations = [];
    const flagIfFormula = function(value, label) {
      if (value === undefined || value === null) {
        return;
      }
      const text = String(value);
      if (!text) {
        return;
      }
      const first = text.charAt(0);
      if (first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\n' || first === '\r') {
        violations.push(label + '="' + text.substring(0, 40) + '"');
      }
    };
    sections.forEach(function(section, sectionIndex) {
      flagIfFormula(section.sectionName, 'section[' + sectionIndex + '].sectionName');
      flagIfFormula(section.canonical, 'section[' + sectionIndex + '].canonical');
      flagIfFormula((section.sectionWarnings || []).join('; '), 'section[' + sectionIndex + '].sectionWarnings');
      (section.items || []).forEach(function(item, itemIndex) {
        flagIfFormula(item.description, 'section[' + sectionIndex + '].items[' + itemIndex + '].description');
        flagIfFormula(item.clientLineName, 'section[' + sectionIndex + '].items[' + itemIndex + '].clientLineName');
        flagIfFormula(item.unit, 'section[' + sectionIndex + '].items[' + itemIndex + '].unit');
        flagIfFormula((item.warnings || []).join('; '), 'section[' + sectionIndex + '].items[' + itemIndex + '].warnings');
      });
    });
    (plan.fees || []).forEach(function(fee, feeIndex) {
      flagIfFormula(fee.label, 'fee[' + feeIndex + '].label');
    });
    if (violations.length) {
      throw new AppError('REGRESSION_PLAN', 'Formula-like prefix detected in plan output: ' + violations.join(', ') + ' for case ' + summary.id);
    }
  }
  if (expectations.expectJsonLiteral) {
    if (typeof exportToJSON === 'function') {
      let jsonOutput;
      try {
        jsonOutput = exportToJSON({ silent: true });
      } catch (jsonError) {
        throw new AppError('REGRESSION_JSON', 'exportToJSON threw an error for case ' + summary.id + ': ' + jsonError);
      }
      const literal = expectations.expectJsonLiteral;
      let containsLiteral = false;
      if (typeof jsonOutput === 'string') {
        try {
          const parsed = JSON.parse(jsonOutput);
          const snippets = parsed && parsed.metadata && Array.isArray(parsed.metadata.scriptSnippets)
            ? parsed.metadata.scriptSnippets
            : [];
          if (snippets.length) {
            containsLiteral = snippets.some(function(snippet) {
              return snippet && snippet.indexOf(literal) !== -1;
            });
          }
        } catch (parseError) {
          // ignore parse errors; fallback to raw string search
        }
        if (!containsLiteral && jsonOutput.indexOf(literal) !== -1) {
          containsLiteral = true;
        }
      }
      if (!containsLiteral) {
        throw new AppError('REGRESSION_JSON', 'exportToJSON output missing expected literal "' + expectations.expectJsonLiteral + '" for case ' + summary.id);
      }
      try { UnifiedLogger.info('Regression', 'exportToJSON literal preserved', { caseId: summary.id }); } catch (logError) {
        // Fallback if logger fails
        console.error('Regression logging failed:', String(logError));
      }
    } else {
      try { UnifiedLogger.warn('Regression', 'exportToJSON unavailable; skipping JSON literal expectation', { caseId: summary.id }); } catch (logError) {
        // Fallback if logger fails
        console.error('Regression logging failed:', String(logError));
      }
    }
  }
  if (expectations.requireAtomicLineItems) {
    sections.forEach(function(section) {
      (section.items || []).forEach(function(item) {
        const scopeEntryId = item && item.scopeEntryId ? String(item.scopeEntryId) : '';
        if (!scopeEntryId || scopeEntryId.indexOf('__') === -1) {
          throw new AppError('REGRESSION_PLAN', 'Line item in section "' + (section.sectionName || section.canonical || '') + '" does not reference an atomic scope entry for case ' + summary.id);
        }
      });
    });
  }
  if (expectations.requireChildCoverage) {
    sections.forEach(function(section) {
      const sectionName = section.sectionName || section.canonical || '';
      const childIds = Array.isArray(section.childIds) ? section.childIds.filter(Boolean) : [];
      if (!childIds.length) {
        throw new AppError('REGRESSION_PLAN', 'Section "' + sectionName + '" missing child scope mapping for case ' + summary.id);
      }
      const itemScopes = new Set((section.items || []).map(function(item) {
        return item && item.scopeEntryId ? String(item.scopeEntryId) : '';
      }).filter(Boolean));
      childIds.forEach(function(childId) {
        if (!itemScopes.has(childId)) {
          throw new AppError('REGRESSION_PLAN', 'Section "' + sectionName + '" missing line item for child scope ' + childId + ' in case ' + summary.id);
        }
      });
    });
  }
  if (expectations.requiredCanonicals && expectations.requiredCanonicals.length) {
    const planMetadata = plan.metadata || {};
    const scopeMap = planMetadata.scopeMap || {};
    const contractEntries = Array.isArray(scopeMap.entries) ? scopeMap.entries : [];
    const canonicals = new Set(contractEntries.map(function(entry) { return entry.canonical || entry.sectionId || ''; }).filter(Boolean));
    expectations.requiredCanonicals.forEach(function(required) {
      if (!canonicals.has(required)) {
        throw new AppError('REGRESSION_PLAN', 'Scope map missing canonical "' + required + '" for case ' + summary.id);
      }
    });
  }
  if (expectations.categoryId) {
    const planCategory = plan.metadata && plan.metadata.categoryId ? plan.metadata.categoryId : (plan.briefType || null);
    if (planCategory !== expectations.categoryId) {
      throw new AppError('REGRESSION_PLAN', 'Plan categoryId mismatch for case ' + summary.id + ' (' + (planCategory || '(none)') + ' vs expected ' + expectations.categoryId + ')');
    }
  }
  if (expectations.requireCategoryPhase === true) {
    const entries = plan.metadata && plan.metadata.scopeMap && Array.isArray(plan.metadata.scopeMap.entries)
      ? plan.metadata.scopeMap.entries
      : [];
    entries.forEach(function(entry) {
      const hasPhase = entry && entry.metadata && entry.metadata.categoryPhase;
      if (!hasPhase) {
        throw new AppError('REGRESSION_PLAN', 'Category phase missing on scope entry ' + (entry && entry.id ? entry.id : '(unknown)') + ' for case ' + summary.id);
      }
    });
  }
  if (expectations.requireAncillaryFees === true) {
    const fees = plan.metadata && plan.metadata.scopeMap && Array.isArray(plan.metadata.scopeMap.ancillaryFees)
      ? plan.metadata.scopeMap.ancillaryFees
      : [];
    if (!fees.length) {
      throw new AppError('REGRESSION_PLAN', 'Ancillary fees missing for case ' + summary.id);
    }
    const planHasAncillarySection = Array.isArray(plan.sections) && plan.sections.some(function(section) {
      return section && section.sectionName === 'Ancillary Fees';
    });
    if (!planHasAncillarySection) {
      throw new AppError('REGRESSION_PLAN', 'Ancillary Fees section missing from plan for case ' + summary.id);
    }
  }
  assertConfigStatusExpectation(plan, expectations.configStatus, summary.id);
  assertHealthCheckExpectations(plan, expectations.requiredHealthChecks, summary.id);
  assertCacheInvalidationExpectation(plan, expectations.expectedCacheInvalidations, summary.id);
  assertVectorPreflightStatus(plan, expectations.expectVectorPreflight, summary.id);
  assertXeroPrecheckStatus(plan, expectations.expectXeroStatus, summary.id);
  if (expectations.summaryVectorAttributes) {
    const html = generation && generation.summaryHtml ? String(generation.summaryHtml || '') : '';
    if (!html || html.indexOf('data-scope-entry-id') === -1) {
      throw new AppError('REGRESSION_SUMMARY', 'Summary HTML missing vector attributes for case ' + summary.id);
    }
  }
  const vectorDiagnostics = Array.isArray(generation.vectorDiagnostics) ? generation.vectorDiagnostics : [];
  const vectorHitMap = generation.vectorHitMap && typeof generation.vectorHitMap === 'object' ? generation.vectorHitMap : {};
  const vectorDiagnosticsEnabled = generation.vectorDiagnosticsEnabled !== false;
  if (expectations.vectorDiagnostics) {
    const diagExpectation = expectations.vectorDiagnostics;
    if (diagExpectation.minEntries !== undefined && vectorDiagnostics.length < diagExpectation.minEntries) {
      throw new AppError('REGRESSION_VECTOR', 'Vector diagnostics entries (' + vectorDiagnostics.length + ') below expected minimum (' + diagExpectation.minEntries + ') for case ' + summary.id);
    }
    if (Array.isArray(diagExpectation.types) && diagExpectation.types.length) {
      const matches = diagExpectation.types.some(function(expectedType) {
        return vectorDiagnostics.some(function(issue) {
          return issue && issue.type === expectedType;
        });
      });
      if (!matches) {
        throw new AppError('REGRESSION_VECTOR', 'Vector diagnostics did not include expected types [' + diagExpectation.types.join(', ') + '] for case ' + summary.id);
      }
    }
    if (diagExpectation.messageContains) {
      const contains = vectorDiagnostics.some(function(issue) {
        return issue && issue.message && issue.message.indexOf(diagExpectation.messageContains) !== -1;
      });
      if (!contains) {
        throw new AppError('REGRESSION_VECTOR', 'Vector diagnostics missing message containing "' + diagExpectation.messageContains + '" for case ' + summary.id);
      }
    }
  }
  if (expectations.vectorHitMap) {
    const hitMapExpectation = expectations.vectorHitMap;
    const availableKeys = Object.keys(vectorHitMap || {});
    if (hitMapExpectation.minEntries !== undefined && availableKeys.length < hitMapExpectation.minEntries) {
      throw new AppError('REGRESSION_VECTOR', 'Vector hit map entries (' + availableKeys.length + ') below expected minimum (' + hitMapExpectation.minEntries + ') for case ' + summary.id);
    }
    if (Array.isArray(hitMapExpectation.requiredKeys) && hitMapExpectation.requiredKeys.length) {
      hitMapExpectation.requiredKeys.forEach(function(requiredKey) {
        if (availableKeys.indexOf(requiredKey) === -1) {
          throw new AppError('REGRESSION_VECTOR', 'Vector hit map missing required entry key "' + requiredKey + '" for case ' + summary.id);
        }
      });
    }
  }
  if (expectations.vectorDiagnosticsEnabled !== undefined) {
    if (vectorDiagnosticsEnabled !== !!expectations.vectorDiagnosticsEnabled) {
      throw new AppError('REGRESSION_VECTOR', 'Vector diagnostics enabled flag mismatch for case ' + summary.id + ' (actual=' + vectorDiagnosticsEnabled + ' expected=' + (!!expectations.vectorDiagnosticsEnabled) + ')');
    }
  }
  if (expectations.commercialFit && expectations.commercialFit.length) {
    const metadata = plan.metadata || {};
    const fitEntries = metadata.commercialFit && Array.isArray(metadata.commercialFit.entries)
      ? metadata.commercialFit.entries
      : [];
    const fitIndex = new Map();
    fitEntries.forEach(function(entry) {
      if (entry && entry.scopeEntryId) {
        fitIndex.set(entry.scopeEntryId, entry);
      }
    });
    expectations.commercialFit.forEach(function(expected) {
      const entry = expected && expected.scopeEntryId ? fitIndex.get(expected.scopeEntryId) : null;
      if (!entry) {
        throw new AppError('REGRESSION_PLAN', 'Commercial fit missing scopeEntryId "' + (expected.scopeEntryId || '(unspecified)') + '" for case ' + summary.id);
      }
      if (expected.chosenSku && entry.chosenSku !== expected.chosenSku) {
        throw new AppError('REGRESSION_PLAN', 'Commercial fit SKU mismatch for ' + expected.scopeEntryId + ' (' + entry.chosenSku + ' vs expected ' + expected.chosenSku + ') in case ' + summary.id);
      }
      if (expected.qty !== undefined) {
        const qty = entry.quantityContext && entry.quantityContext.qty !== undefined ? entry.quantityContext.qty : null;
        if (qty !== expected.qty) {
          throw new AppError('REGRESSION_PLAN', 'Commercial fit qty mismatch for ' + expected.scopeEntryId + ' (' + qty + ' vs expected ' + expected.qty + ') in case ' + summary.id);
        }
      }
      const expectedSelected = expected.selectedSkus || expected.additionalSkus || [];
      if (expectedSelected && expectedSelected.length) {
        const selectedList = Array.isArray(entry.selectedSkus)
          ? entry.selectedSkus
          : (Array.isArray(entry.additionalSkus) ? entry.additionalSkus : []);
        expectedSelected.forEach(function(childExpectation, idx) {
          const childId = childExpectation && (childExpectation.skuId || childExpectation.childSkuId)
            ? (childExpectation.skuId || childExpectation.childSkuId)
            : (entry.scopeEntryId + '__sku-' + (idx + 1));
          const childEntry = childId
            ? selectedList.find(function(child) {
                return child && (child.skuId === childId || child.childSkuId === childId);
              })
            : null;
          if (!childEntry) {
            throw new AppError('REGRESSION_PLAN', 'Commercial fit child SKU missing for ' + (childId || '(unspecified)') + ' in case ' + summary.id);
          }
          if (childExpectation.sku && childEntry.sku !== childExpectation.sku) {
            throw new AppError('REGRESSION_PLAN', 'Child SKU mismatch for ' + childId + ' (' + childEntry.sku + ' vs expected ' + childExpectation.sku + ') in case ' + summary.id);
          }
          if (childExpectation.qty !== undefined) {
            const childQty = childEntry.quantityContext && childEntry.quantityContext.qty !== undefined
              ? childEntry.quantityContext.qty
              : (childEntry.qty !== undefined ? childEntry.qty : null);
            if (childQty !== childExpectation.qty) {
              throw new AppError('REGRESSION_PLAN', 'Child qty mismatch for ' + childId + ' (' + childQty + ' vs expected ' + childExpectation.qty + ') in case ' + summary.id);
            }
          }
        });
      }
    });
  }

  const commercialFitMeta = plan.metadata && plan.metadata.commercialFit;
  const commercialFitMap = plan.metadata && plan.metadata.commercialFitMap;
  if (commercialFitMeta && Array.isArray(commercialFitMeta.entries) && commercialFitMeta.entries.length) {
    if (!commercialFitMap || typeof commercialFitMap !== 'object') {
      throw new AppError('REGRESSION_PLAN', 'Commercial fit metadata map missing for case ' + summary.id);
    }
    commercialFitMeta.entries.forEach(function(entry) {
      const scopeEntryId = entry && entry.scopeEntryId ? entry.scopeEntryId : '(unknown)';
      const mapEntry = entry && entry.scopeEntryId ? commercialFitMap[entry.scopeEntryId] : null;
      if (!mapEntry) {
        throw new AppError('REGRESSION_PLAN', 'Commercial fit metadata map missing entry for ' + scopeEntryId + ' in case ' + summary.id);
      }
      const mapQuantity = mapEntry.quantityContext || {};
      if (mapQuantity.qty === undefined || mapQuantity.qty === null) {
        throw new AppError('REGRESSION_PLAN', 'Commercial fit map entry missing quantity for ' + scopeEntryId + ' in case ' + summary.id);
      }
    });
  }

  if (commercialFitMeta && Array.isArray(commercialFitMeta.entries) && commercialFitMeta.entries.length) {
    commercialFitMeta.entries.forEach(function(entry) {
      if (!entry || !entry.quantityContext) {
        throw new AppError('REGRESSION_PLAN', 'Commercial fit entry missing quantity context for ' + (entry && entry.scopeEntryId ? entry.scopeEntryId : '(unknown scope)') + ' in case ' + summary.id);
      }
      if (!entry.quantityProfile || entry.quantityProfile.qty === undefined || entry.quantityProfile.qty === null) {
        throw new AppError('REGRESSION_PLAN', 'Commercial fit entry missing quantity profile for ' + (entry && entry.scopeEntryId ? entry.scopeEntryId : '(unknown scope)') + ' in case ' + summary.id);
      }
      if (entry.sectionMatchScore === undefined || entry.sectionMatchScore === null) {
        throw new AppError('REGRESSION_PLAN', 'Commercial fit entry missing section match score for ' + (entry && entry.scopeEntryId ? entry.scopeEntryId : '(unknown scope)') + ' in case ' + summary.id);
      }
      if (!Array.isArray(entry.selectedSkus)) {
        throw new AppError('REGRESSION_PLAN', 'Commercial fit entry missing selectedSkus array for ' + (entry.scopeEntryId || '(unknown scope)') + ' in case ' + summary.id);
      }
    });
  }
  assertCommercialFitNotes(plan, summary.id);
}

function assertConfigStatusExpectation(plan, expectation, caseId) {
  if (!expectation) {
    return;
  }
  const configStatus = plan && plan.metadata ? plan.metadata.configStatus : null;
  if (!configStatus) {
    throw new AppError('REGRESSION_CONFIG', 'Config status missing from plan metadata for case ' + caseId);
  }
  if (expectation.enabled !== undefined && !!configStatus.enabled !== !!expectation.enabled) {
    throw new AppError('REGRESSION_CONFIG', 'Config status enabled flag mismatch for case ' + caseId);
  }
  if (expectation.snapshotFresh !== undefined && !!configStatus.snapshotFresh !== !!expectation.snapshotFresh) {
    throw new AppError('REGRESSION_CONFIG', 'Config snapshot freshness mismatch for case ' + caseId + ' (actual=' + (!!configStatus.snapshotFresh) + ' expected=' + (!!expectation.snapshotFresh) + ')');
  }
  if (expectation.schemaValid !== undefined && !!configStatus.schemaValid !== !!expectation.schemaValid) {
    throw new AppError('REGRESSION_CONFIG', 'Config schema validation flag mismatch for case ' + caseId + ' (actual=' + (!!configStatus.schemaValid) + ' expected=' + (!!expectation.schemaValid) + ')');
  }
  if (expectation.minSnapshotAgeMinutes !== undefined) {
    const age = Number(configStatus.snapshotAgeMinutes || 0);
    if (isNaN(age) || age < expectation.minSnapshotAgeMinutes) {
      throw new AppError('REGRESSION_CONFIG', 'Config snapshot age (' + age + 'm) below expected minimum (' + expectation.minSnapshotAgeMinutes + 'm) for case ' + caseId);
    }
  }
  if (expectation.snapshotTtlMinutes !== undefined) {
    const ttl = Number(configStatus.snapshotTtlMinutes || configStatus.snapshotTtl || 0);
    if (!isNaN(ttl) && ttl !== expectation.snapshotTtlMinutes) {
      throw new AppError('REGRESSION_CONFIG', 'Config snapshot TTL mismatch for case ' + caseId + ' (actual=' + ttl + ' expected=' + expectation.snapshotTtlMinutes + ')');
    }
  }
  if (Array.isArray(expectation.requiredMissingTabs) && expectation.requiredMissingTabs.length) {
    const missing = Array.isArray(configStatus.missingTabs) ? configStatus.missingTabs : [];
    expectation.requiredMissingTabs.forEach(function(tab) {
      if (missing.indexOf(tab) === -1) {
        throw new AppError('REGRESSION_CONFIG', 'Expected missing config tab "' + tab + '" not reported for case ' + caseId);
      }
    });
  }
}

function assertHealthCheckExpectations(plan, expectations, caseId) {
  if (!expectations || !expectations.length) {
    return;
  }
  const healthChecks = plan && plan.metadata && Array.isArray(plan.metadata.healthChecks)
    ? plan.metadata.healthChecks
    : [];
  expectations.forEach(function(required) {
    if (!required || !required.key && !required.id) {
      return;
    }
    const key = required.key || required.id;
    const match = healthChecks.find(function(entry) {
      const entryKey = entry && (entry.key || entry.id || entry.name);
      return entryKey === key;
    });
    if (!match) {
      throw new AppError('REGRESSION_PLAN', 'Health check "' + key + '" missing from plan metadata for case ' + caseId);
    }
    if (required.status && match.status !== required.status) {
      throw new AppError('REGRESSION_PLAN', 'Health check "' + key + '" status mismatch (' + (match.status || 'unset') + ' vs ' + required.status + ') for case ' + caseId);
    }
    if (required.severity && match.severity !== required.severity) {
      throw new AppError('REGRESSION_PLAN', 'Health check "' + key + '" severity mismatch (' + (match.severity || 'unset') + ' vs ' + required.severity + ') for case ' + caseId);
    }
    if (required.minFailures !== undefined) {
      const failureCount = Number(match.rejectedRows || match.failures || match.count || 0);
      if (isNaN(failureCount) || failureCount < required.minFailures) {
        throw new AppError('REGRESSION_PLAN', 'Health check "' + key + '" failures (' + failureCount + ') below expected minimum (' + required.minFailures + ') for case ' + caseId);
      }
    }
  });
}

function assertCacheInvalidationExpectation(plan, expectation, caseId) {
  if (!expectation) {
    return;
  }
  const paths = plan && plan.metadata && Array.isArray(plan.metadata.cacheInvalidationPaths)
    ? plan.metadata.cacheInvalidationPaths
    : [];
  if (expectation.minCount !== undefined && paths.length < expectation.minCount) {
    throw new AppError('REGRESSION_PLAN', 'Cache invalidation paths (' + paths.length + ') below expected minimum (' + expectation.minCount + ') for case ' + caseId);
  }
  if (Array.isArray(expectation.requiredPaths) && expectation.requiredPaths.length) {
    expectation.requiredPaths.forEach(function(path) {
      if (paths.indexOf(path) === -1) {
        throw new AppError('REGRESSION_PLAN', 'Cache invalidation path "' + path + '" missing for case ' + caseId);
      }
    });
  }
}

function assertVectorPreflightStatus(plan, expectation, caseId) {
  if (!expectation) {
    return;
  }
  const metadata = plan && plan.metadata ? plan.metadata : {};
  const vectorStatus = metadata.vectorStatus || {};
  const healthChecks = Array.isArray(metadata.healthChecks) ? metadata.healthChecks : [];
  const fallback = healthChecks.find(function(entry) {
    const key = entry && (entry.key || entry.id || entry.name);
    return key === 'vectorPreflight';
  }) || {};
  const status = vectorStatus.preflight || vectorStatus.status || fallback.status;
  if (expectation.status && status !== expectation.status) {
    throw new AppError('REGRESSION_VECTOR', 'Vector preflight status mismatch for case ' + caseId + ' (' + (status || 'unset') + ' vs ' + expectation.status + ')');
  }
  if (expectation.missingCredentials === true) {
    const missing = vectorStatus.missingCredentials === true || fallback.missingCredentials === true;
    if (!missing) {
      throw new AppError('REGRESSION_VECTOR', 'Vector preflight missingCredentials flag not set for case ' + caseId);
    }
  }
}

function assertXeroPrecheckStatus(plan, expectation, caseId) {
  if (!expectation) {
    return;
  }
  const metadata = plan && plan.metadata ? plan.metadata : {};
  const xeroStatus = metadata.xeroStatus || {};
  const healthChecks = Array.isArray(metadata.healthChecks) ? metadata.healthChecks : [];
  const fallback = healthChecks.find(function(entry) {
    const key = entry && (entry.key || entry.id || entry.name);
    return key === 'xeroPrecheck';
  }) || {};
  const ready = xeroStatus.ready !== undefined ? !!xeroStatus.ready : (fallback.status === 'ready');
  if (expectation.ready !== undefined && ready !== !!expectation.ready) {
    throw new AppError('REGRESSION_XERO', 'Xero precheck readiness mismatch for case ' + caseId + ' (actual=' + ready + ' expected=' + (!!expectation.ready) + ')');
  }
  if (expectation.reasonContains) {
    const reason = xeroStatus.reason || fallback.reason || '';
    if (String(reason).indexOf(expectation.reasonContains) === -1) {
      throw new AppError('REGRESSION_XERO', 'Xero precheck reason missing fragment "' + expectation.reasonContains + '" for case ' + caseId);
    }
  }
}

function assertCommercialFitVectorHealth(plan, caseId) {
  if (!plan || typeof plan !== 'object') {
    return;
  }
  const metadata = plan.metadata || {};
  const commercialFit = metadata.commercialFit || {};
  const entries = Array.isArray(commercialFit.entries) ? commercialFit.entries : [];
  if (!entries.length) {
    return;
  }
  const maxCandidates = typeof VECTOR_SEARCH_MAX_RESULTS === 'number'
    ? VECTOR_SEARCH_MAX_RESULTS
    : 10;
  const seenScopeEntries = new Set();
  entries.forEach(function(entry) {
    if (!entry) {
      return;
    }
    const scopeEntryId = entry.scopeEntryId || '';
    if (scopeEntryId) {
      if (seenScopeEntries.has(scopeEntryId)) {
        throw new AppError('REGRESSION_VECTOR', 'Duplicate commercial fit entry for ' + scopeEntryId + ' in case ' + caseId);
      }
      seenScopeEntries.add(scopeEntryId);
    }
    const vectorCandidates = Array.isArray(entry.vectorCandidates) ? entry.vectorCandidates : [];
    if (vectorCandidates.length > maxCandidates) {
      throw new AppError('REGRESSION_VECTOR', 'Vector candidate count for ' + (scopeEntryId || '(unknown)') + ' exceeds limit (' + vectorCandidates.length + ' > ' + maxCandidates + ') for case ' + caseId);
    }
    if (!entry.displayName || !String(entry.displayName).trim()) {
      throw new AppError('REGRESSION_VECTOR', 'Commercial fit entry ' + (scopeEntryId || '(unknown)') + ' missing displayName for case ' + caseId);
    }
    const qty = entry.quantityContext && entry.quantityContext.qty !== undefined && entry.quantityContext.qty !== null
      ? Number(entry.quantityContext.qty)
      : null;
    if (qty === null || isNaN(qty)) {
      throw new AppError('REGRESSION_VECTOR', 'Commercial fit entry ' + (scopeEntryId || '(unknown)') + ' missing quantity after render for case ' + caseId);
    }
  });
}

function assertCommercialFitVectorHitMap(plan, generation, caseId) {
  if (!plan || typeof plan !== 'object' || !generation || typeof generation !== 'object') {
    return;
  }
  const metadata = plan.metadata || {};
  const commercialFit = metadata.commercialFit || {};
  const entries = Array.isArray(commercialFit.entries) ? commercialFit.entries : [];
  if (!entries.length) {
    return;
  }
  const vectorHitMap = generation.vectorHitMap && typeof generation.vectorHitMap === 'object' ? generation.vectorHitMap : {};
  const maxCandidates = typeof VECTOR_SEARCH_MAX_RESULTS === 'number'
    ? VECTOR_SEARCH_MAX_RESULTS
    : 10;
  entries.forEach(function(entry) {
    if (!entry || !entry.scopeEntryId) {
      return;
    }
    const hits = Array.isArray(vectorHitMap[entry.scopeEntryId]) ? vectorHitMap[entry.scopeEntryId] : [];
    if (!hits.length) {
      throw new AppError('REGRESSION_VECTOR', 'Vector hit map missing hits for ' + entry.scopeEntryId + ' in case ' + caseId);
    }
    if (hits.length > maxCandidates) {
      throw new AppError('REGRESSION_VECTOR', 'Vector hit map reported ' + hits.length + ' hits for ' + entry.scopeEntryId + ' which exceeds limit (' + maxCandidates + ') in case ' + caseId);
    }
  });
}

function assertCommercialFitNotes(plan, caseId) {
  if (!plan || !plan.metadata) {
    return;
  }
  const commercialFit = plan.metadata.commercialFit || {};
  const entries = Array.isArray(commercialFit.entries) ? commercialFit.entries : [];
  if (!entries.length) {
    return;
  }
  entries.forEach(function(entry) {
    if (!entry) {
      return;
    }
    if (!Array.isArray(entry.notes)) {
      throw new AppError('REGRESSION_PLAN', 'Commercial fit entry ' + (entry.scopeEntryId || '(unknown)') + ' missing notes array for case ' + caseId);
    }
    if (!Array.isArray(entry.warnings)) {
      throw new AppError('REGRESSION_PLAN', 'Commercial fit entry ' + (entry.scopeEntryId || '(unknown)') + ' missing warnings array for case ' + caseId);
    }
  });
}

function runRegressionExports(plan, generation, testCase, summary) {
  if (!plan || typeof plan !== 'object') {
    return;
  }
  const validation = generation && generation.validation ? generation.validation : {};
  let summaryHtml = '';
  if (typeof buildPlanSummaryHtml === 'function') {
    try {
      summaryHtml = buildPlanSummaryHtml(plan, validation) || '';
    } catch (summaryError) {
      try { UnifiedLogger.warn('Regression', 'buildPlanSummaryHtml failed', { caseId: testCase.id || summary.id, error: String(summaryError) }); } catch (logError) {
        // Fallback if logger fails
        console.error('Regression logging failed:', String(logError));
      }
    }
  }
  let jsonOutput = '';
  if (typeof exportToJSON === 'function') {
    try {
      jsonOutput = exportToJSON({ silent: true }) || '';
    } catch (jsonError) {
      try { UnifiedLogger.warn('Regression', 'exportToJSON failed', { caseId: testCase.id || summary.id, error: String(jsonError) }); } catch (logError) {
        // Fallback if logger fails
        console.error('Regression logging failed:', String(logError));
      }
    }
  } else {
    try { UnifiedLogger.warn('Regression', 'exportToJSON unavailable; skipping JSON export', { caseId: testCase.id || summary.id }); } catch (logError) {
      // Fallback if logger fails
      console.error('Regression logging failed:', String(logError));
    }
  }
  try {
    logAIEvent('regression.export', {
      runType: 'regression',
      caseId: testCase.id || summary.id,
      sections: plan.sections ? plan.sections.length : 0,
      validationErrors: validation.errors ? validation.errors.length : 0,
      validationWarnings: validation.warnings ? validation.warnings.length : 0,
      exportLength: jsonOutput ? jsonOutput.length : 0
    });
  } catch (logError) {
    try { UnifiedLogger.warn('Regression', 'regression.export logging failed', String(logError)); } catch (logError) {
      // Fallback if logger fails
      console.error('Regression logging failed:', String(logError));
    }
  }
  if (testCase.id === 'formula_injection_guard') {
    const containsFormulaPrefix = function(value) {
      if (!value) {
        return false;
      }
      const cleaned = String(value).replace(/<[^>]+>/g, ' ');
      return /(^|\s)[=+@]/.test(cleaned);
    };
    if (containsFormulaPrefix(summaryHtml) || containsFormulaPrefix(jsonOutput)) {
      throw new AppError('REGRESSION_SANITIZE', 'Sanitized output still contains formula-like prefixes for case ' + (testCase.id || summary.id));
    }
  }
}

function regressionPermissionsPreflightCheck() {
  if (typeof ensurePermissionPreflightForTest !== 'function') {
    try { UnifiedLogger.warn('Regression', 'Permission preflight helper unavailable; skipping check'); } catch (logError) {
      // Fallback if logger fails
      console.error('Regression logging failed:', String(logError));
    }
    return;
  }
  const result = ensurePermissionPreflightForTest();
  if (!result || !Array.isArray(result.missingScopes)) {
    throw new AppError('REGRESSION_PERMISSIONS', 'Permission preflight result invalid');
  }
  try { UnifiedLogger.info('Regression', 'Permission preflight', { missingScopes: result.missingScopes, onChangeMissing: result.onChangeMissing, onOpenMissing: result.onOpenMissing }); } catch (logError) {
    // Fallback if logger fails
    console.error('Regression logging failed:', String(logError));
  }
}

function mutationScopeNarrativeShouldInvalidateHash() {
  const draft = {
    briefType: 'smm-retainer',
    scopeEntries: [{
      id: 'scope-sec-1',
      sectionId: 'scope-sec-1',
      scopeLabel: 'Original Scope',
      visibility: 'Client',
      approvalStatus: 'approved',
      interpretation: 'Cover on-site shoot with post support.',
      sourceExcerpt: 'Client requested video coverage for launch event.',
      deliverables: ['Event film'],
      resources: [{ role: 'Director', hours: 8 }],
      notes: ['Primary narrative'],
      metadata: { risk: 'medium' }
    }],
    sourceSummary: 'Baseline draft for hash regression.'
  };
  const baselineContract = buildScopeMapFromDraft(draft);
  const approvedSnapshot = JSON.parse(JSON.stringify(draft));
  approvedSnapshot.scopeContracts = {
    hash: baselineContract.contractHash
  };
  const tampered = JSON.parse(JSON.stringify(approvedSnapshot));
  const entry = tampered.scopeEntries[0];
  entry.scopeLabel = 'Original Scope (retainer expansion)';
  entry.sourceExcerpt = 'Client requested extended retainer coverage plus launch recap.';
  entry.interpretation = 'Cover on-site shoot with post support plus extended retainer.';
  const currentNotes = Array.isArray(entry.notes) ? entry.notes.slice() : [];
  currentNotes.push('Narrative shift: retainer extension described.');
  entry.notes = currentNotes;
  const currentDeliverables = Array.isArray(entry.deliverables) ? entry.deliverables.slice() : [];
  currentDeliverables.push('Expanded retainer planning session');
  entry.deliverables = currentDeliverables;
  entry.metadata = Object.assign({}, entry.metadata, {
    narrativeAudit: 'interpretation_plus_notes_and_deliverable'
  });
  const mutatedContract = buildScopeMapFromDraft(tampered);
  if (mutatedContract.contractHash === baselineContract.contractHash) {
    throw new AppError('REGRESSION_HASH', 'Narrative mutation did not change the contract hash (hash=%s).', baselineContract.contractHash);
  }
  const envRoot = typeof globalThis !== 'undefined' ? globalThis : this;
  const originals = {
    hydrate: typeof envRoot.hydrateScopeContracts === 'function' ? envRoot.hydrateScopeContracts : null,
    loadRows: typeof envRoot.loadUserSidebarStateRows === 'function' ? envRoot.loadUserSidebarStateRows : null,
    upsert: typeof envRoot.upsertUserSidebarStateRow === 'function' ? envRoot.upsertUserSidebarStateRow : null,
    currentUser: typeof envRoot.getActiveUserEmailSafe === 'function' ? envRoot.getActiveUserEmailSafe : null
  };
  ['hydrate', 'loadRows', 'upsert', 'currentUser'].forEach(function(key) {
    if (originals[key]) {
      envRoot[key === 'hydrate' ? 'hydrateScopeContracts'
        : key === 'loadRows' ? 'loadUserSidebarStateRows'
        : key === 'upsert' ? 'upsertUserSidebarStateRow'
        : 'getActiveUserEmailSafe'] = null;
    }
  });
  let mismatchDetected = false;
  try {
    validateScopeContract(tampered);
  } catch (error) {
    if (error instanceof AppError && error.code === 'SCOPE_CONTRACT') {
      mismatchDetected = true;
    } else {
      throw error;
    }
  } finally {
    if (originals.hydrate) {
      envRoot.hydrateScopeContracts = originals.hydrate;
    }
    if (originals.loadRows) {
      envRoot.loadUserSidebarStateRows = originals.loadRows;
    }
    if (originals.upsert) {
      envRoot.upsertUserSidebarStateRow = originals.upsert;
    }
    if (originals.currentUser) {
      envRoot.getActiveUserEmailSafe = originals.currentUser;
    }
  }
  if (!mismatchDetected) {
    throw new AppError(
      'REGRESSION_HASH',
      'Narrative tampering changed the hash (baseline=%s mutated=%s) but validateScopeContract did not reject it.',
      baselineContract.contractHash,
      mutatedContract.contractHash
    );
  }
}

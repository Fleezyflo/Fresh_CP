/**
 * AISidebar Processing Module
 *
 * Responsibilities:
 * - OpenAI API integration (LLM context, completions, assistants)
 * - Catalog mapping and matching (vector search, SKU alignment)
 * - Commercial fit processing (scoring, review, quantity resolution)
 * - Scope processing (synthesis, hydration, contracts)
 * - Brief processing pipeline orchestration
 *
 * Dependencies:
 * - 05_AISidebar_Config.js (constants, brief profiles, schemas)
 * - 05_AISidebar_Phase.js (phase guidance)
 * - 05_AISidebar_Workflow.js (signal processing)
 * - 05_AISidebar_Data.js (normalization, validation)
 * - VectorSearch.js (vector store operations)
 * - RateLimiter.js (OpenAI rate limiting)
 * - UnifiedLogger.js (logging)
 *
 * Used by: UI module (sidebar actions, sheet operations)
 *
 * Load Order: 05_ prefix ensures loading after Config, Phase, Workflow, Data modules
 *
 * Extracted from monolithic AISidebar.js (Phase 3 Plan 5)
 */

// Module logging category for UnifiedLogger
const LOG_CATEGORY_AISIDEBAR = 'AISidebar';

// ================================================================================
// SECTION 1: LLM CONTEXT & OPENAI INTEGRATION
// ================================================================================

function buildLLMContext(combinedText, extractedFiles, approvedScope, options) {
  const trace = UnifiedLogger.startTrace('AISidebar', 'buildLLMContext', { hasText: !!combinedText, hasScope: !!approvedScope });
  try {
  // Removed noise: context building start log

  const contextOptions = options || {};
  const mode = contextOptions.mode || 'plan';
  let persona = contextOptions.persona || contextOptions.personaOverride || null;

  let defaultCurrency = 'AED';
  let taxTypeDefault = '';
  try {
    defaultCurrency = getConfigValue('DEFAULT_CURRENCY');
  } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
  try {
    taxTypeDefault = getConfigValue('XERO_TAX_TYPE');
  } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }

  const briefType = contextOptions.briefType || BRIEF_TYPE_DEFAULT;
  // Removed noise: brief type debug log

  const briefProfile = getBriefProfile(briefType);
  // Removed noise: brief profile debug log

  const catalogKeywordHints = getCatalogHints(combinedText);
  const briefCatalogPrefixes = Array.isArray(briefProfile.catalogPrefixes)
    ? briefProfile.catalogPrefixes.slice()
    : [];
  const prioritizeCatalogHints = function(list) {
    if (!Array.isArray(list) || list.length === 0) {
      return [];
    }
    return list.slice().sort(function(a, b) {
      const aSku = a && a.sku ? String(a.sku) : '';
      const bSku = b && b.sku ? String(b.sku) : '';
      const aMatch = briefCatalogPrefixes.some(function(prefix) {
        return aSku.startsWith(prefix);
      });
      const bMatch = briefCatalogPrefixes.some(function(prefix) {
        return bSku.startsWith(prefix);
      });
      if (aMatch === bMatch) {
        return 0;
      }
      return aMatch ? -1 : 1;
    });
  };
  const prioritizedCatalogHints = prioritizeCatalogHints((catalogKeywordHints || []).slice(0, 12));

  const vectorScoreFloor = (function() {
    if (typeof VECTOR_SEARCH_SCORE_FLOOR === 'number' && !isNaN(VECTOR_SEARCH_SCORE_FLOOR)) {
      return Math.max(0, Number(VECTOR_SEARCH_SCORE_FLOOR));
    }
    return 0.42;
  })();
  let vectorSearchEnvelope = { hitsByEntry: {}, errors: [] };

  const context = {
    mode: mode,
    persona: persona,
    briefText: combinedText,
    catalogContext: prioritizedCatalogHints,
    defaults: {
      currency: defaultCurrency,
      taxType: taxTypeDefault,
      sections: Array.isArray(briefProfile.sectionOrder) ? briefProfile.sectionOrder.slice() : []
    },
    categoryHighlights: getCategoryHighlights(),
    pdfSummaries: Array.isArray(extractedFiles) ? extractedFiles.map(file => ({
      fileId: file.fileId,
      fileName: file.fileName,
      length: file.text.length,
      text: file.text || ''
    })) : []
  };
  context.briefType = briefType;
  context.briefProfile = briefProfile;
  context.sectionPriority = Array.isArray(briefProfile.sectionOrder) ? briefProfile.sectionOrder.slice() : [];
  context.optionalSections = Array.isArray(briefProfile.optionalSections) ? briefProfile.optionalSections.slice() : [];
  context.signatureCues = Array.isArray(briefProfile.signatureCues) ? briefProfile.signatureCues.slice() : [];
  if (typeof getConfigStatus === 'function') {
    try {
      context.configStatus = getConfigStatus();
    } catch (statusError) {
    try { UnifiedLogger.warn('AISidebar', 'buildLLMContext getConfigStatus failed', String(statusError)); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
    }
  }
  context.recoveryMode = isScopeRecoveryEnabled();

  const overridesInput = contextOptions.clientContext || contextOptions.clientOverrides || {};
  const manualNotes = contextOptions.clientNotes || contextOptions.manualNotes || '';
  const mapperNotesInput = contextOptions.mapperNotes || '';
  const answers = Array.isArray(contextOptions.answers)
    ? contextOptions.answers.slice(0, CLIENT_CONTEXT_MAX_SIGNALS)
    : [];
  context.answers = answers;

  if (approvedScope) {
    context.approvedScope = approvedScope;
    context.scopeMap = contextOptions && contextOptions.scopeMap
      ? contextOptions.scopeMap
      : validateScopeContract(approvedScope);
    logScopeEntrySummary('ScopeMapEntries', (context.scopeMap && Array.isArray(context.scopeMap.entries)) ? context.scopeMap.entries : []);
  }

  // FIX: Use ORIGINAL approvedScope.scopeEntries for flattening
  // context.scopeMap.entries may have corrupted scopeLabel values from validation transforms
  // approvedScope.scopeEntries has the ORIGINAL scopeLabel from LLM (line item labels, not section labels)
  const vectorSearchTargets = approvedScope && Array.isArray(approvedScope.scopeEntries) && approvedScope.scopeEntries.length
    ? approvedScope.scopeEntries.slice()
    : (context.scopeMap && Array.isArray(context.scopeMap.entries) && context.scopeMap.entries.length
      ? context.scopeMap.entries.slice()
      : []);
  const vectorSearchLineItems = vectorSearchTargets.filter(entry => entry && entry.isSection !== true);

  const flattenedDeliverableEntries = [];
  vectorSearchLineItems.forEach(function(entry) {
    if (!entry || !entry.id) return;

    // Removed noise: diagnostic logging for first 3 parent entries

    // FIX: If no deliverables, DON'T push parent entry (it may have section scopeLabel)
    // Skip entries with no deliverables - they shouldn't be in commercial fit
    if (!Array.isArray(entry.deliverables) || entry.deliverables.length === 0) {
      return;
    }
    entry.deliverables.forEach(function(deliverableText, deliverableIndex) {
      const effectiveDeliverableText = (deliverableText || '').trim();

      // Skip empty deliverables - don't fall back to parent scopeLabel (which may be section label)
      if (!effectiveDeliverableText) {
        return;
      }

      const deliverableEntry = {
        id: entry.id + '__deliverable_' + deliverableIndex,
        parentEntryId: entry.id,
        deliverableIndex: deliverableIndex,
        canonical: entry.canonical,
        sectionId: entry.sectionId,
        scopeLabel: effectiveDeliverableText,
        displayName: effectiveDeliverableText,
        deliverables: [effectiveDeliverableText],
        signals: Array.isArray(entry.signals) ? entry.signals.slice() : [],
        notes: entry.notes || '',
        interpretation: entry.interpretation || '',
        isSection: false,
        parentId: entry.parentId,
        metadata: Object.assign({}, entry.metadata || {}, {
          isDeliverableEntry: true,
          parentScopeEntry: entry,
          deliverableIndex: deliverableIndex
        })
      };

      // Removed noise: diagnostic logging for first 3 flattened entries

      flattenedDeliverableEntries.push(deliverableEntry);
    });
  });

  const vectorSearchPayload = flattenedDeliverableEntries.length ? flattenedDeliverableEntries : vectorSearchTargets;

  if (vectorSearchPayload.length) {
    const preflight = getVectorPreflightStatus_();

    if (preflight && preflight.preflight === 'blocked') {
      vectorSearchEnvelope = {
        hitsByEntry: {},
        errors: [{
          entryId: '',
          vectorDetailParent: '',
          type: 'preflight',
          statusCode: 401,
          message: 'Vector credentials missing; preflight blocked',
          hitCount: 0,
          query: ''
        }]
      };
    } else if (typeof vectorSearchScopeEntries_ === 'function') {
      try {
        // Catalog prefix filtering pattern from App-script/AISidebar.js:4524-4526
        vectorSearchEnvelope = vectorSearchScopeEntries_(vectorSearchPayload, {
          limit: typeof VECTOR_SEARCH_MAX_RESULTS === 'number' && VECTOR_SEARCH_MAX_RESULTS > 0 ? VECTOR_SEARCH_MAX_RESULTS : 8,
          minScore: vectorScoreFloor,
          catalogPrefixes: briefCatalogPrefixes
        }) || vectorSearchEnvelope;
      } catch (vectorError) {
        const bootstrapMessage = 'Vector search failed: ' +
          (vectorError && vectorError.message ? vectorError.message : (vectorError || 'Unknown error'));
        vectorSearchEnvelope = {
          hitsByEntry: {},
          errors: [{
            entryId: '',
            vectorDetailParent: '',
            type: 'bootstrap',
            statusCode: vectorError && vectorError.statusCode ? Number(vectorError.statusCode) : null,
            message: bootstrapMessage,
            hitCount: 0,
            query: ''
          }]
        };
      }
    } else {
      vectorSearchEnvelope = {
        hitsByEntry: {},
        errors: [{
          entryId: '',
          vectorDetailParent: '',
          type: 'bootstrap',
          statusCode: null,
          message: 'Vector search helper unavailable. Ensure VectorSearch.js is deployed.',
          hitCount: 0,
          query: ''
        }]
      };
    }
  }

  context.catalogSignals = {
    keyword: catalogKeywordHints,
    vector: vectorSearchEnvelope.hitsByEntry
  };
  context.vectorSearchDiagnosticsEnabled = VECTOR_DIAGNOSTICS_ENABLED;
  context.vectorSearchDiagnostics = VECTOR_DIAGNOSTICS_ENABLED
    ? (vectorSearchEnvelope.errors || [])
    : [];

  context.flattenedContractEntries = flattenedDeliverableEntries.length ? flattenedDeliverableEntries : context.contractEntries;

  const scopeSignals = typeof inferSignalConfidence === 'function'
    ? inferSignalConfidence(approvedScope)
    : [];
  const contentSignals = inferWorkflowSignalsFromContent({
    briefText: combinedText,
    reviewerNotes: manualNotes,
    pdfSummaries: extractedFiles,
    answers: answers,
    briefType: context.briefType
  });
  const mergedSignals = mergeWorkflowSignalLists(scopeSignals, contentSignals);
  const requiredCategories = new Set(
    mergedSignals
      .map(function(entry) { return entry && entry.canonical; })
      .filter(Boolean)
  );
  if (Array.isArray(contextOptions.requiredCategories)) {
    contextOptions.requiredCategories.forEach(function(value) {
      const resolved = typeof mapWorkflowCanonical === 'function'
        ? (mapWorkflowCanonical(value) || value)
        : value;
      if (resolved) {
        requiredCategories.add(resolved);
      }
    });
  }
  if (requiredCategories.size === 0) {
    const phaseOrder = Array.isArray(workflowPhaseOrder) ? workflowPhaseOrder : [];
    phaseOrder.slice(0, Math.min(3, phaseOrder.length)).forEach(function(canonical) {
      if (canonical) {
        requiredCategories.add(canonical);
      }
    });
  }
  context.requiredCategories = Array.from(requiredCategories);
  context.promptSnippets = loadScenarioPrompts(context.requiredCategories);
  context.clientContext = buildClientContextPayload(combinedText, approvedScope, {
    overrides: overridesInput || null,
    manualNotes: manualNotes || '',
    answers: context.answers
  });
  context.signalLayers = {
    derived: mergedSignals,
    computed: contentSignals,
    approved: scopeSignals,
    automated: {
      industries: context.clientContext.industries,
      regions: context.clientContext.regions,
      expectations: context.clientContext.expectations,
      riskFlags: context.clientContext.riskFlags
    },
    overrides: overridesInput || {}
  };

    try {
      logAIEvent('vector.search.bootstrap', {
        runType: 'commercial-fit',
        outcome: 'complete',
        hitsEvaluated: Object.keys(vectorSearchEnvelope.hitsByEntry || {}).length,
        entriesRequested: vectorSearchPayload.length,
        errorCount: (vectorSearchEnvelope.errors || []).length
      });
  } catch (vectorLogError) {
    try { UnifiedLogger.warn('AISidebar', 'vector.search.bootstrap logging failed', String(vectorLogError)); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
  }

  const approvedEntries = Array.isArray(approvedScope && approvedScope.scopeEntries)
    ? approvedScope.scopeEntries.slice()
    : [];
  const scopeHierarchy = context.scopeMap && context.scopeMap.hierarchy ? context.scopeMap.hierarchy : {};
  const scopeEntrySource = context.scopeMap && Array.isArray(context.scopeMap.entries) && context.scopeMap.entries.length
    ? context.scopeMap.entries.slice()
    : approvedEntries.slice();
  logScopeEntrySummary('ScopeEntrySource', scopeEntrySource);
  const toSafeNumber = value => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
  };
  const QUANTITY_SIGNAL_DEFINITIONS = {
    talentCount: { label: 'Talent / models', unit: 'Talent' },
    crewCount: { label: 'Crew headcount', unit: 'Crew' },
    usageDurationMonths: { label: 'Usage duration', unit: 'Month' },
    shootDays: { label: 'Shoot days', unit: 'Day' },
    studioDays: { label: 'Studio days', unit: 'Day' },
    looksCount: { label: 'Looks / outfits', unit: 'Look' },
    deliverableImages: { label: 'Image deliverables', unit: 'Image' },
    deliverableVideos: { label: 'Video deliverables', unit: 'Video' },
    deliverablePosts: { label: 'Content deliverables', unit: 'Asset' }
  };
  function deriveContractEntrySignals(entry, canonical, approvedScope, options) {
    const answers = Array.isArray(options && options.answers) ? options.answers : [];
    const canonicalSlug = canonical
      ? (typeof mapWorkflowCanonical === 'function'
          ? (mapWorkflowCanonical(canonical) || canonical)
          : canonical)
      : '';
    const signalsByType = {};
    const scenarioNotes = [];
    const usageNotes = [];
    const deliverableTotals = {};
    const uniquePush = function(collection, value) {
      if (!value) {
        return;
      }
      if (collection.indexOf(value) === -1) {
        collection.push(value);
      }
    };
    const addScenarioNote = function(note) {
      if (!note) {
        return;
      }
      uniquePush(scenarioNotes, truncate(String(note), 140));
    };
    const textSegments = [];
    const appendSegment = function(text, source) {
      if (!text) {
        return;
      }
      const value = String(text).trim();
      if (!value) {
        return;
      }
      textSegments.push({
        text: value,
        source: source || 'scope'
      });
    };
    appendSegment(entry.label || entry.scopeLabel, 'label');
    (Array.isArray(entry.deliverables) ? entry.deliverables : []).forEach(function(item) {
      appendSegment(item, 'deliverable');
    });
    (Array.isArray(entry.notes) ? entry.notes : []).forEach(function(note) {
      appendSegment(note, 'note');
    });
    (Array.isArray(entry.signals) ? entry.signals : []).forEach(function(signal) {
      appendSegment(signal, 'signal');
    });
    (Array.isArray(entry.resources) ? entry.resources : []).forEach(function(resource) {
      if (!resource) {
        return;
      }
      const parts = [];
      if (resource.role) {
        parts.push(resource.role);
      }
      if (resource.hours !== null && resource.hours !== undefined) {
        parts.push(resource.hours + 'h');
      } else if (resource.metadata && resource.metadata.rawHours) {
        parts.push(resource.metadata.rawHours);
      }
      if (resource.rate !== null && resource.rate !== undefined) {
        parts.push(resource.rate + ' rate');
      } else if (resource.metadata && resource.metadata.rawRate) {
        parts.push(resource.metadata.rawRate);
      }
      appendSegment(parts.join(' · '), 'resource');
      if (resource.metadata && resource.metadata.notes) {
        appendSegment(resource.metadata.notes, 'resource-note');
      }
    });
    answers.forEach(function(answer) {
      if (!answer) {
        return;
      }
      const combined = (answer.question ? answer.question + ': ' : '') + (answer.answer || '');
      appendSegment(combined, 'answer');
    });
    if (approvedScope) {
      if (approvedScope.projectName) {
        addScenarioNote('Project: ' + truncate(approvedScope.projectName, 80));
      }
      if (Array.isArray(approvedScope.locations)) {
        approvedScope.locations.slice(0, 4).forEach(function(location) {
          appendSegment('Location: ' + location, 'location');
          addScenarioNote('Location: ' + truncate(location, 80));
        });
      }
      if (approvedScope.talent && approvedScope.talent.requirements) {
        appendSegment(approvedScope.talent.requirements, 'talent-notes');
      }
      if (approvedScope.usage && approvedScope.usage.notes) {
        appendSegment(approvedScope.usage.notes, 'usage-note');
      }
    }

    const recordSignal = function(type, value, meta) {
      if (value === null || value === undefined || value === '') {
        return;
      }
      const numeric = Number(value);
      if (!isFinite(numeric)) {
        return;
      }
      const definition = QUANTITY_SIGNAL_DEFINITIONS[type];
      if (!definition) {
        return;
      }
      const baseLabel = definition.label || type;
      const baseUnit = definition.unit || '';
      const label = meta && meta.label ? meta.label : baseLabel;
      const unit = meta && meta.unit ? meta.unit : baseUnit;
      const source = meta && meta.source ? meta.source : 'derived';
      const evidence = meta && meta.evidence ? truncate(meta.evidence, 140) : '';
      const existing = signalsByType[type];
      if (!existing || numeric > existing.value) {
        signalsByType[type] = {
          type: type,
          value: numeric,
          label: label,
          unit: unit,
          source: source,
          evidence: evidence ? [evidence] : []
        };
      } else if (existing && evidence) {
        const evidenceList = existing.evidence || [];
        if (evidenceList.indexOf(evidence) === -1 && evidenceList.length < 4) {
          evidenceList.push(evidence);
        }
        existing.evidence = evidenceList;
      }
    };

    const recordDeliverable = function(type, value, meta) {
      recordSignal(type, value, meta);
      const key = type.replace(/^deliverable/i, '').toLowerCase();
      deliverableTotals[key] = Math.max(deliverableTotals[key] || 0, Number(value));
    };

    textSegments.forEach(function(segment) {
      if (!segment || !segment.text) {
        return;
      }
      const text = segment.text;
      const source = segment.source || 'scope';
      const evidence = truncate(text, 160);
      let match;

      const talentRegex = /(\d+(?:\.\d+)?)\s*(?:models?|talent|cast|actors?|extras?)/gi;
      while ((match = talentRegex.exec(text)) !== null) {
        recordSignal('talentCount', match[1], { source: source, evidence: evidence });
      }

      const crewRegex = /(\d+(?:\.\d+)?)\s*(?:crew|team|staff|assistants?)/gi;
      while ((match = crewRegex.exec(text)) !== null) {
        recordSignal('crewCount', match[1], { source: source, evidence: evidence });
      }

      const shootRegex = /(\d+(?:\.\d+)?)\s*[- ]?(?:day|days)\s*(?:shoot|filming|production|on[- ]?set|location)/gi;
      while ((match = shootRegex.exec(text)) !== null) {
        recordSignal('shootDays', match[1], { source: source, evidence: evidence });
      }

      const studioRegex = /(\d+(?:\.\d+)?)\s*[- ]?(?:day|days)\s*(?:studio|stage|soundstage)/gi;
      while ((match = studioRegex.exec(text)) !== null) {
        recordSignal('studioDays', match[1], { source: source, evidence: evidence });
      }

      const usageMonthRegex = /(\d+(?:\.\d+)?)\s*[- ]?(?:month|months|mo)\b/gi;
      while ((match = usageMonthRegex.exec(text)) !== null) {
        recordSignal('usageDurationMonths', match[1], { source: source, evidence: evidence, unit: 'Month' });
        uniquePush(usageNotes, evidence);
      }

      const usageYearRegex = /(\d+(?:\.\d+)?)\s*[- ]?(?:year|years|yr|yrs)\b/gi;
      while ((match = usageYearRegex.exec(text)) !== null) {
        const months = Number(match[1]) * 12;
        recordSignal('usageDurationMonths', months, { source: source, evidence: evidence, unit: 'Month' });
        uniquePush(usageNotes, evidence);
      }

      const imageRegex = /(\d+(?:\.\d+)?)\s*(?:images?|photos?|stills?|shots?)/gi;
      while ((match = imageRegex.exec(text)) !== null) {
        recordDeliverable('deliverableImages', match[1], { source: source, evidence: evidence });
      }

      const videoRegex = /(\d+(?:\.\d+)?)\s*(?:videos?|films?|edits?|cuts?)/gi;
      while ((match = videoRegex.exec(text)) !== null) {
        recordDeliverable('deliverableVideos', match[1], { source: source, evidence: evidence });
      }

      const postRegex = /(\d+(?:\.\d+)?)\s*(?:posts?|assets?|deliverables?)/gi;
      while ((match = postRegex.exec(text)) !== null) {
        recordDeliverable('deliverablePosts', match[1], { source: source, evidence: evidence });
      }

      const looksRegex = /(\d+(?:\.\d+)?)\s*(?:looks?|outfits?|wardrobe)/gi;
      while ((match = looksRegex.exec(text)) !== null) {
        recordSignal('looksCount', match[1], { source: source, evidence: evidence });
      }

      const lower = text.toLowerCase();
      if (lower.indexOf('usage') !== -1) {
        uniquePush(usageNotes, evidence);
      }
      if (lower.indexOf('studio') !== -1) {
        addScenarioNote('Studio requirement: ' + evidence);
      }
    });

    if (approvedScope) {
      if (approvedScope.talent && approvedScope.talent.count) {
        recordSignal('talentCount', approvedScope.talent.count, {
          source: 'approved-scope',
          evidence: 'Approved talent count'
        });
      }
      if (approvedScope.usage && approvedScope.usage.durationMonths) {
        recordSignal('usageDurationMonths', approvedScope.usage.durationMonths, {
          source: 'approved-scope',
          evidence: 'Approved usage duration',
          unit: 'Month'
        });
      }
      if (approvedScope.shootDays) {
        recordSignal('shootDays', approvedScope.shootDays, {
          source: 'approved-scope',
          evidence: 'Approved shoot days'
        });
      }
    }

    let signals = Object.keys(signalsByType).map(function(key) {
      return signalsByType[key];
    });
    signals.sort(function(a, b) {
      return (b.value || 0) - (a.value || 0);
    });
    signals = signals.map(function(entry) {
      const payload = {
        type: entry.type,
        label: entry.label,
        value: Number(entry.value),
        unit: entry.unit || '',
        source: entry.source || 'derived'
      };
      if (Array.isArray(entry.evidence) && entry.evidence.length) {
        payload.evidence = entry.evidence.slice(0, 3);
      }
      return payload;
    });

    const highlights = [];
    signals.slice(0, 6).forEach(function(signal) {
      if (signal.value === null || signal.value === undefined) {
        return;
      }
      highlights.push(signal.value + ' x ' + signal.label);
    });

    const usageSummary = {
      durationMonths: null,
      region: '',
      notes: usageNotes.slice(0, 5)
    };
    const usageSignal = signals.find(function(signal) { return signal.type === 'usageDurationMonths'; });
    if (usageSignal && usageSignal.value) {
      usageSummary.durationMonths = Number(usageSignal.value);
    }
    if (approvedScope && approvedScope.usage && approvedScope.usage.region) {
      usageSummary.region = approvedScope.usage.region;
      addScenarioNote('Usage region: ' + truncate(approvedScope.usage.region, 80));
    }

    const signalLookup = signals.reduce(function(map, signal) {
      if (signal && signal.type) {
        map[signal.type] = signal;
      }
      return map;
    }, {});
    // DELETED: archetype inference call (2026-01-18, Plan 12-06)
    // archetype no longer needed - was only used by deleted bundle map and SKU_QUANTITY_FALLBACKS
    return {
      // archetype: REMOVED (Plan 12-06)
      quantitySignals: signals.slice(0, 6),
      scenarioHighlights: highlights,
      usageSummary: usageSummary,
      deliverableTotals: deliverableTotals,
      scenarioNotes: scenarioNotes.slice(0, 8),
      signalLookup: signalLookup
    };
  }
  let sectionEntries = scopeEntrySource.filter(function(entry) {
    return entry && entry.isSection;
  });
  let atomicEntries = scopeEntrySource.filter(function(entry) {
    return entry && entry.parentId && !entry.isSection;
  });
  const usingScopeHierarchy = sectionEntries.length > 0 && atomicEntries.length > 0;

  if (!usingScopeHierarchy && approvedEntries.length) {
    sectionEntries = approvedEntries.filter(function(entry) {
      return entry && entry.isSection;
    });
    atomicEntries = approvedEntries.filter(function(entry) {
      return entry && entry.parentId && !entry.isSection;
    });
  }

  const contractSourceEntries = atomicEntries.length
    ? atomicEntries
    : approvedEntries.filter(function(entry) {
        return entry && !entry.isSection;
      });

  if (sectionEntries.length === 0 && approvedScope && Array.isArray(approvedScope.scopeEntries)) {
    const sectionsById = {};
    approvedScope.scopeEntries.forEach(function(entry) {
      if (!entry || !entry.sectionId) {
        return;
      }
      const sectionId = entry.sectionId;
      if (!sectionsById[sectionId]) {
        sectionsById[sectionId] = {
          id: sectionId,
          sectionId: sectionId,
          canonical: entry.canonical || sectionId,
          scopeLabel: entry.scopeLabel || sectionId,
          visibility: entry.visibility || VISIBILITY.CLIENT,
          notes: [],
          childIds: []
        };
      }
      if (entry.id) {
        sectionsById[sectionId].childIds.push(entry.id);
      }
    });
    const fallbackSections = Object.keys(sectionsById).map(function(sectionId) {
      const section = sectionsById[sectionId];
      section.isSection = true;
      return section;
    });
    if (fallbackSections.length) {
      sectionEntries = fallbackSections;
    }
  }

  approvedEntries.forEach(function(entry) {
    if (!entry) {
      return;
    }
    if (!entry.parentId && entry.sectionId) {
      entry.parentId = entry.sectionId;
    }
  });

  context.sectionEntries = sectionEntries;
  context.sectionHierarchy = scopeHierarchy;
  context.sectionMap = sectionEntries.reduce(function(map, entry) {
    if (!entry || !entry.id) {
      return map;
    }
    const childIds = Array.isArray(entry.childIds) && entry.childIds.length
      ? entry.childIds.slice()
      : (scopeHierarchy && scopeHierarchy[entry.id] ? scopeHierarchy[entry.id].slice() : []);
    map[entry.id] = {
      id: entry.id,
      canonical: entry.sectionId || entry.canonical || '',
      scopeLabel: entry.scopeLabel || '',
      visibility: entry.visibility || VISIBILITY.CLIENT,
      notes: Array.isArray(entry.notes) ? entry.notes.slice(0, 3) : [],
      childIds: childIds
    };
    return map;
  }, {});

  context.contractEntries = contractSourceEntries
    .filter(function(entry) { return entry && entry.id; })
    .map(function(entry) {
      try {
        return deepClone(entry);
      } catch (error) {
        return Object.assign({}, entry);
      }
    });
  logScopeEntrySummary('ContractEntries', context.contractEntries);

  context.commercialFit = {
    entries: [],
    snapshotId: Utilities.getUuid()
  };
  context.catalogSignals.entryMatches = [];
  try {
    // Use flattenedContractEntries to match vector search payload structure (App-script/AISidebar.js:4301)
    context.commercialFit.entries = buildCommercialFitEntries(context.flattenedContractEntries || context.contractEntries, {
      context: context,
      catalogHints: context.catalogContext,
      briefType: briefType,
      scopeMap: context.scopeMap,
      answers: answers,
      clientNotes: manualNotes,
      mapperNotes: mapperNotesInput,
      snapshotId: context.commercialFit.snapshotId,
      existingEntries: contextOptions.existingEntries
    });
  } catch (fitError) {
    try { UnifiedLogger.warn('AISidebar', 'buildCommercialFitEntries failed', String(fitError)); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
    context.commercialFit.entries = [];
  }
  saveCommercialFitState(context.commercialFit.snapshotId, context.commercialFit.entries);

  let targetMarginPct = 0.35;
  try {
    const configured = getConfigValue('TARGET_MARGIN_PCT');
    if (configured !== undefined && configured !== null && configured !== '') {
      const parsed = Number(configured);
      if (!isNaN(parsed) && parsed > 0 && parsed < 1) {
        targetMarginPct = parsed;
      } else if (!isNaN(parsed) && parsed > 1) {
        targetMarginPct = parsed / 100;
      }
    }
  } catch (ignored) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignored.message, stack: ignored.stack });
    }

  const pendingApprovals = approvedEntries
    .filter(entry => String(entry.approvalStatus || '').toLowerCase() !== 'approved')
    .map(entry => entry.id || '')
    .filter(Boolean);

  context.commercialConstraints = {
    targetMarginPct: targetMarginPct,
    budgetTarget: approvedScope && approvedScope.budget ? toSafeNumber(approvedScope.budget.target) : null,
    usage: approvedScope && approvedScope.usage ? {
      durationMonths: toSafeNumber(approvedScope.usage.durationMonths),
      region: approvedScope.usage.region || ''
    } : null,
    approvalsPending: pendingApprovals,
    requiredCanonicals: context.requiredCategories,
    warnings: Array.isArray(approvedScope && approvedScope.warnings) ? approvedScope.warnings.slice(0, 10) : [],
    questions: Array.isArray(approvedScope && approvedScope.questions) ? approvedScope.questions.slice(0, 10) : []
  };

  if (!persona) {
    if (mode === 'scope-draft') {
      persona = 'analyst';
    } else if (context.contractEntries && context.contractEntries.length > 0) {
      persona = 'managing-director';
    } else {
      persona = 'proposal-author';
    }
  }
  context.persona = persona;

  if (mode === 'scope-draft') {
    context.schema = SCOPE_DRAFT_JSON_SCHEMA;
    context.maxTokens = LLM_SCOPE_DRAFT_RESPONSE_TOKENS;
  }

  // Removed noise: context built successfully log

  
  trace.complete('buildLLMContext complete');
  return context;
  } catch (error) {
    trace.fail('buildLLMContext failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'buildLLMContext',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    return { briefType: "unknown", catalogSignals: {}, signalLayers: {} };
  }
}

function coerceLLMResponseStructure(context, payload) {
  const trace = UnifiedLogger.startTrace('AISidebar', 'coerceLLMResponseStructure', { hasPayload: !!(payload && typeof payload === 'object') });
  try {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const mode = context && context.mode ? context.mode : 'plan';

  const clipString = value => {
    if (value === undefined || value === null) {
      return '';
    }
    if (Array.isArray(value)) {
      const flattened = value
        .map(entry => clipString(entry))
        .filter(Boolean)
        .join('; ');
      return clipString(flattened);
    }
    if (typeof value === 'object') {
      const objectValues = Object.values(value)
        .map(entry => clipString(entry))
        .filter(Boolean);
      if (objectValues.length > 0) {
        return clipString(objectValues.join('; '));
      }
      try {
        return clipString(JSON.stringify(value));
      } catch (err) {
        return '';
      }
    }
    let text = String(value);
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > LLM_MAX_STRING_LENGTH) {
      return text.substring(0, LLM_MAX_STRING_LENGTH - 1) + '…';
    }
    return text;
  };

  const toStringArray = value => {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value
        .map(entry => clipString(entry))
        .filter(entry => entry.length > 0)
        .slice(0, LLM_MAX_ARRAY_ITEMS);
    }
    if (typeof value === 'object') {
      return Object.keys(value)
        .map(key => {
          const entry = value[key];
          if (entry === undefined || entry === null) {
            return '';
          }
          if (typeof entry === 'string' || typeof entry === 'number') {
            return `${key}: ${clipString(entry)}`;
          }
          return `${key}: ${clipString(JSON.stringify(entry))}`;
        })
        .filter(entry => entry.length > 0)
        .slice(0, LLM_MAX_ARRAY_ITEMS);
    }
    return [clipString(value)];
  };

  const capObject = (object, allowedKeys) => {
    if (!object || typeof object !== 'object') {
      return {};
    }
    const capped = {};
    allowedKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        capped[key] = object[key];
      }
    });
    return capped;
  };

  if (payload.retainters && !payload.retainers) {
    payload.retainers = payload.retainters;
    delete payload.retainters;
  }

  if (mode === 'scope-draft') {
    const draft = Object.assign({}, payload);
    const originalScopeEntries = Array.isArray(draft.scopeEntries)
      ? draft.scopeEntries.slice(0, LLM_MAX_ARRAY_ITEMS)
      : [];
    if (draft.retainters && !draft.retainers) {
      draft.retainers = draft.retainters;
      delete draft.retainters;
    }

    const answeredLookup = {
      byQuestion: Object.create(null),
      byId: Object.create(null)
    };

    const registerAnswered = function(store, key, value) {
      const normalizedKey = sanitizeText(key).toLowerCase();
      if (!normalizedKey) {
        return;
      }
      const normalizedValue = sanitizeText(value);
      if (!normalizedValue) {
        return;
      }
      store[normalizedKey] = normalizedValue;
    };

    const answerList = Array.isArray(context && context.answers) ? context.answers : [];
    answerList.forEach(function(entry) {
      if (!entry) {
        return;
      }
      if (entry.question !== undefined) {
        registerAnswered(answeredLookup.byQuestion, entry.question, entry.answer);
      }
      if (entry.id !== undefined) {
        registerAnswered(answeredLookup.byId, entry.id, entry.answer);
      }
    });
    if (draft.requiredAnswers && typeof draft.requiredAnswers === 'object') {
      Object.keys(draft.requiredAnswers).forEach(function(key) {
        registerAnswered(answeredLookup.byId, key, draft.requiredAnswers[key]);
      });
    }

    const toNotesArray = value => toStringArray(value).slice(0, 12);

    draft.projectName = clipString(draft.projectName);
    draft.clientName = clipString(draft.clientName);
    draft.mediaType = toNotesArray(draft.mediaType);
    draft.deliverables = toNotesArray(draft.deliverables);
    draft.locations = toNotesArray(draft.locations);
    draft.services = toNotesArray(draft.services);
    draft.retainers = toNotesArray(draft.retainers);
    draft.campaigns = Array.isArray(draft.campaigns) ? draft.campaigns.slice(0, 6) : [];
    draft.channels = toNotesArray(draft.channels);
    draft.talent = draft.talent && typeof draft.talent === 'object'
      ? {
          count: draft.talent.count !== undefined ? Number(draft.talent.count) : 0,
          requirements: toNotesArray(draft.talent.requirements),
          notes: clipString(draft.talent.notes || '')
        }
      : { count: 0, requirements: [], notes: '' };
    draft.crew = draft.crew && typeof draft.crew === 'object'
      ? {
          requirements: toNotesArray(draft.crew.requirements),
          notes: clipString(draft.crew.notes || '')
        }
      : { requirements: [], notes: '' };
    draft.equipment = draft.equipment && typeof draft.equipment === 'object'
      ? {
          requirements: toNotesArray(draft.equipment.requirements),
          notes: clipString(draft.equipment.notes || '')
        }
      : { requirements: [], notes: '' };
    draft.usage = draft.usage && typeof draft.usage === 'object'
      ? {
          durationMonths: draft.usage.durationMonths !== undefined ? Number(draft.usage.durationMonths) : null,
          region: clipString(draft.usage.region || ''),
          notes: clipString(draft.usage.notes || '')
        }
      : { durationMonths: null, region: '', notes: '' };
    draft.budget = draft.budget && typeof draft.budget === 'object'
      ? {
          target: draft.budget.target !== undefined ? Number(draft.budget.target) : null,
          currency: clipString(draft.budget.currency || ''),
          notes: clipString(draft.budget.notes || '')
        }
      : { target: null, currency: '', notes: '' };
    draft.schedule = draft.schedule && typeof draft.schedule === 'object'
      ? {
          keyDates: toNotesArray(draft.schedule.keyDates),
          notes: clipString(draft.schedule.notes || '')
        }
      : { keyDates: [], notes: '' };
    draft.reporting = draft.reporting && typeof draft.reporting === 'object'
      ? {
          cadence: clipString(draft.reporting.cadence || ''),
          metrics: toNotesArray(draft.reporting.metrics),
          notes: clipString(draft.reporting.notes || '')
        }
      : { cadence: '', metrics: [], notes: '' };
    draft.warnings = toNotesArray(draft.warnings);
    const rawQuestions = Array.isArray(draft.questions)
      ? draft.questions.slice(0, LLM_MAX_ARRAY_ITEMS)
      : [];
    const rawRequiredQuestions = Array.isArray(draft.requiredQuestions)
      ? draft.requiredQuestions.slice(0, LLM_MAX_ARRAY_ITEMS)
      : [];
    const sanitizeQuestionList = function(list, includeRuleFallbacks, scopeEntries) {
      const cleaned = [];
      const seen = new Set();
      const placeholderPattern = /^q\d{1,2}$/i;
      const scopedEntries = Array.isArray(scopeEntries) ? scopeEntries : [];
      const resolvePathValue = function(source, path) {
        if (!source || !path) {
          return undefined;
        }
        let current = source;
        const segments = path.split('.');
        for (let i = 0; i < segments.length; i++) {
          if (current === undefined || current === null) {
            return undefined;
          }
          const key = segments[i];
          if (!Object.prototype.hasOwnProperty.call(current, key)) {
            return undefined;
          }
          current = current[key];
        }
        if (Array.isArray(current)) {
          return current.filter(function(entry) {
            if (entry === undefined || entry === null) {
              return false;
            }
            if (typeof entry === 'string') {
              return entry.trim().length > 0;
            }
            if (typeof entry === 'object') {
              return Object.keys(entry).length > 0;
            }
            return true;
          });
        }
        return current;
      };
      const hasMeaningfulValue = function(value) {
        if (value === undefined || value === null) {
          return false;
        }
        if (typeof value === 'number') {
          return !isNaN(value) && value !== 0;
        }
        if (typeof value === 'string') {
          return value.trim().length > 0;
        }
        if (Array.isArray(value)) {
          return value.length > 0;
        }
        if (typeof value === 'object') {
          return Object.keys(value).length > 0;
        }
        return true;
      };
      const collectFieldTokens = function(entry) {
        const tokens = new Set();
        const pushToken = function(token) {
          const normalized = sanitizeText(token).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
          if (normalized) {
            tokens.add(normalized);
          }
        };
        if (entry.id) {
          pushToken(entry.id);
        }
        if (entry.field) {
          pushToken(entry.field);
        }
        if (Array.isArray(entry.fields)) {
          entry.fields.forEach(pushToken);
        }
        if (entry.canonical) {
          pushToken(entry.canonical);
        }
        return tokens;
      };
      const resolveFieldPaths = function(entry) {
        const paths = new Set();
        const tokens = collectFieldTokens(entry);
        tokens.forEach(function(token) {
          if (QUESTION_FIELD_PATH_MAP[token]) {
            QUESTION_FIELD_PATH_MAP[token].forEach(function(path) {
              paths.add(path);
            });
          } else if (token.indexOf('.') !== -1) {
            paths.add(token.replace(/_/g, '.'));
          }
        });
        if (entry.fields && entry.fields.length) {
          entry.fields.forEach(function(path) {
            paths.add(path);
          });
        }
        if (entry.field) {
          paths.add(entry.field);
        }
        return Array.from(paths);
      };
      const questionAlreadySatisfied = function(entry) {
        const fieldPaths = resolveFieldPaths(entry);
        if (fieldPaths.length === 0) {
          return false;
        }
        for (let i = 0; i < fieldPaths.length; i++) {
          const path = fieldPaths[i];
          const value = resolvePathValue(draft, path);
          if (hasMeaningfulValue(value)) {
            return true;
          }
        }
        return false;
      };
      const pushQuestion = function(entry, defaultSource) {
        if (!entry && entry !== 0) {
          return;
        }
        let questionText = '';
        let questionId = '';
        let questionFields = [];
        let questionReason = '';
        let questionType = '';
        let questionSource = defaultSource || '';
        let questionCanonical = '';
        if (typeof entry === 'string' || typeof entry === 'number') {
          questionText = String(entry);
        } else if (typeof entry === 'object') {
          questionText = entry.question || entry.text || entry.prompt || entry.label || entry.title || '';
          questionId = entry.id || entry.key || entry.field || '';
          if (entry.field) {
            questionFields = [entry.field];
          }
          if (Array.isArray(entry.fields) && entry.fields.length) {
            questionFields = filterTruthy(entry.fields.slice(0, 6).map(sanitizeText));
          }
          questionReason = entry.reason || entry.notes || entry.hint || '';
          questionType = entry.type || '';
          questionSource = entry.source || defaultSource || '';
          questionCanonical = entry.canonical || entry.sectionId || '';
        } else {
          return;
        }
        const normalizedQuestion = sanitizeText(questionText).replace(/\s+/g, ' ');
        if (!normalizedQuestion || placeholderPattern.test(normalizedQuestion)) {
          return;
        }
        if (normalizedQuestion.replace(/[^a-z0-9]+/gi, '').length < 4) {
          return;
        }
        let normalizedId = sanitizeText(questionId);
        if (!normalizedId && questionFields.length > 0) {
          normalizedId = sanitizeText(questionFields[0]);
        }
        if (!normalizedId) {
          normalizedId = slugifyIdentifier(normalizedQuestion, 'req', cleaned.length + 1);
        }
        normalizedId = normalizedId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!normalizedId) {
          normalizedId = slugifyIdentifier(normalizedQuestion, 'req', cleaned.length + 1);
        }
        const dedupeKey = normalizedId + '::' + normalizedQuestion.toLowerCase();
        if (seen.has(dedupeKey)) {
          return;
        }
        seen.add(dedupeKey);
        const whyNeeded = sanitizeText((entry && (entry.whyNeeded || entry.reason)) || questionReason || '');
        const impacts = Array.isArray(entry && entry.impacts)
          ? entry.impacts.filter(Boolean).map(function(token) {
              return sanitizeText(token).toLowerCase();
            })
          : [];
        const questionEntry = {
          id: normalizedId,
          question: truncate(normalizedQuestion, 220)
        };
        if (!whyNeeded.trim() || impacts.length === 0) {
          return;
        }
        questionEntry.whyNeeded = truncate(whyNeeded.trim(), 200);
        questionEntry.impacts = impacts.slice(0, 3);
        if (questionFields.length > 0) {
          questionEntry.fields = questionFields;
          questionEntry.field = questionFields[0];
        }
        if (questionType) {
          questionEntry.type = sanitizeText(questionType);
        }
        if (questionCanonical) {
          questionEntry.canonical = sanitizeText(questionCanonical);
        }
        if (questionSource) {
          questionEntry.source = sanitizeText(questionSource);
        }
        questionEntry.fields = Array.isArray(questionEntry.fields) ? questionEntry.fields : [];
        questionEntry.field = questionEntry.fields.length > 0 ? questionEntry.fields[0] : questionEntry.field || '';
        QUESTION_TEXT_KEYWORD_RULES.forEach(function(rule) {
          if (rule && rule.regex && rule.regex.test(normalizedQuestion)) {
            (rule.tokens || []).forEach(function(token) {
              const normalizedToken = sanitizeText(token).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
              if (normalizedToken && questionEntry.fields.indexOf(normalizedToken) === -1) {
                questionEntry.fields.push(normalizedToken);
              }
            });
          }
        });
        if (questionEntry.fields.length > 0 && !questionEntry.field) {
          questionEntry.field = questionEntry.fields[0];
        }
        if (questionAlreadySatisfied(questionEntry)) {
          return;
        }
        const normalizedQuestionKey = normalizedQuestion.toLowerCase();
        const answeredByQuestion = answeredLookup.byQuestion[normalizedQuestionKey];
        const answeredById = answeredLookup.byId[normalizedId];
        if (!includeRuleFallbacks && ((answeredByQuestion && answeredByQuestion.trim().length > 0) ||
          (answeredById && answeredById.trim().length > 0))) {
          return;
        }
        cleaned.push(questionEntry);
      };

      list.forEach(function(entry) {
        pushQuestion(entry, includeRuleFallbacks ? 'reviewer' : 'llm');
      });

      // DELETED: includeRuleFallbacks block using workflowRequiredQuestionRules - Plan 12-10
      // Questions are NO LONGER part of system per user directive
      // Previously: Lines 1273-1304 (31 lines) - generated questions from hardcoded rules

      return cleaned.slice(0, 3);
    };
    draft.assumptions = toNotesArray(draft.assumptions);
    draft.requiredAnswers = draft.requiredAnswers && typeof draft.requiredAnswers === 'object'
      ? draft.requiredAnswers
      : {};

    // NEW SCHEMA: Use originalScopeEntries directly (flat array with isSection flags)
    // DELETED OLD SCHEMA CODE: Lines 1327-1349 previously converted NEW → OLD → NEW, corrupting line item interpretation
    draft.scopeEntries = originalScopeEntries.length
      ? originalScopeEntries.slice(0, LLM_MAX_ARRAY_ITEMS)
      : [];

    // DELETED OLD LINE EXPANSION LOGIC: Lines 1334-1398 (was 65 lines)
    // OLD behavior: Derived synthetic child line items from section deliverables
    // Functions deleted: shouldExpandScopeLines(), deriveScopeDetailLines(), buildScopeDetailChildId(), buildScopeDetailEntry()
    // NEW schema: LLM returns explicit line items in flat scopeEntries array - no expansion needed
    draft.scopeEntries = Array.isArray(draft.scopeEntries)
      ? draft.scopeEntries.slice(0, LLM_MAX_ARRAY_ITEMS)
      : [];
    draft.questions = sanitizeQuestionList(rawQuestions, false, draft.scopeEntries);
    draft.requiredQuestions = sanitizeQuestionList(rawRequiredQuestions, true, draft.scopeEntries);
    draft.sourceSummary = clipString(draft.sourceSummary || '');
    if (context && context.briefType) {
      draft.briefType = context.briefType;
    } else if (!draft.briefType) {
      draft.briefType = BRIEF_TYPE_DEFAULT;
    }
    return draft;
  }

  const allowedPlanKeys = [
    'status', 'projectName', 'clientName', 'currency', 'taxType',
    'sections', 'fees', 'warnings', 'assumptions', 'usage',
    'services', 'retainers', 'campaigns', 'channels', 'reporting',
    'questions'
  ];
  const plan = capObject(payload, allowedPlanKeys);
  plan.projectName = clipString(plan.projectName);
  plan.clientName = clipString(plan.clientName);
  plan.currency = clipString(plan.currency);
  plan.taxType = clipString(plan.taxType);
  plan.warnings = toStringArray(plan.warnings);
  plan.assumptions = toStringArray(plan.assumptions);
  plan.questions = toStringArray(plan.questions);
  plan.services = toStringArray(plan.services);
  plan.retainers = toStringArray(plan.retainers);
  plan.campaigns = Array.isArray(plan.campaigns) ? plan.campaigns.slice(0, 8) : [];
  plan.channels = toStringArray(plan.channels);
  plan.sections = Array.isArray(plan.sections) ? plan.sections.slice(0, LLM_MAX_ARRAY_ITEMS) : [];
  plan.fees = Array.isArray(plan.fees) ? plan.fees.slice(0, LLM_MAX_ARRAY_ITEMS) : [];
  if (plan.reporting && typeof plan.reporting === 'object') {
    plan.reporting = {
      cadence: clipString(plan.reporting.cadence || ''),
      metrics: toStringArray(plan.reporting.metrics),
      notes: clipString(plan.reporting.notes || '')
    };
  }
  if (plan.usage && typeof plan.usage === 'object') {
    plan.usage = {
      durationMonths: plan.usage.durationMonths !== undefined ? Number(plan.usage.durationMonths) : null,
      region: clipString(plan.usage.region || ''),
      notes: clipString(plan.usage.notes || '')
    };
  }
  
  trace.complete('coerceLLMResponseStructure complete');
  return plan;
  } catch (error) {
    trace.fail('coerceLLMResponseStructure failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'coerceLLMResponseStructure',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    return payload;
  }
}

function buildCommercialFitIndex(entries) {
  const map = {};
  (entries || []).forEach(function(entry) {
    if (entry && entry.scopeEntryId) {
      map[entry.scopeEntryId] = entry;
    }
  });
  return map;
}

function runCommercialFitReview(context) {
  if (!context || !context.commercialFit || !Array.isArray(context.commercialFit.entries) || context.commercialFit.entries.length === 0) {
    return;
  }
  const fitEntries = context.commercialFit.entries;
  const summaryLines = fitEntries.map(function(entry) {
    if (!entry) {
      return null;
    }
    const quantityContext = entry.quantityContext || {};
    const qtyText = quantityContext.qty !== undefined && quantityContext.qty !== null ? quantityContext.qty : '?';
    const unitText = quantityContext.unit || 'Unit';
    const warningText = (entry.warnings && entry.warnings.length) ? entry.warnings.join('; ') : 'none';
    return [
      'ScopeEntryId: ' + (entry.scopeEntryId || ''),
      'Canonical: ' + (entry.canonical || ''),
      // 'Archetype: REMOVED (Plan 12-06)
      'SKU: ' + (entry.chosenSku || ''),
      'Quantity: ' + qtyText + ' ' + unitText,
      'Warnings: ' + warningText
    ].join('\n');
  }).filter(Boolean).join('\n\n');

  const messages = [
    {
      role: 'system',
      content: 'You are hrmny\'s commercial QA reviewer. Review each entry, do not change SKUs or quantities, and return any additional notes or warnings.'
    },
    {
      role: 'user',
      content: summaryLines + '\n\nRespond with JSON matching {"entries":[{"scopeEntryId":"","notes":[],"warnings":[]}]}'
    }
  ];

  let reviewResult = null;
  try {
    reviewResult = invokeLLMChat(messages, {
      runType: 'commercial-fit-review',
      eventType: 'commercial.fit.review',
      modelProperty: 'LLM_PLAN_MODEL',
      maxTokens: 800
    });
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'runCommercialFitReview invoke failed', String(error)); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
    return;
  }

  if (!reviewResult || !reviewResult.output) {
    return;
  }

  const parsed = safeJsonParse(reviewResult.output, null);
  if (parsed) {
    mergeCommercialFitReview(context.commercialFit.entries, parsed);
    logAIEvent('commercial.fit.review', {
      snapshotId: context.commercialFit.snapshotId,
      review: parsed
    });
  } else {
    try { UnifiedLogger.warn('AISidebar', 'runCommercialFitReview parse failed', { error: String(error), raw: truncate(reviewResult.output || '', 500) }); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
  }
}

function mergeCommercialFitReview(entries, reviewPayload) {
  if (!Array.isArray(entries) || !reviewPayload || !Array.isArray(reviewPayload.entries)) {
    return;
  }
  const index = buildCommercialFitIndex(entries);
  reviewPayload.entries.forEach(function(entry) {
    if (!entry || !entry.scopeEntryId) {
      return;
    }
    const target = index[entry.scopeEntryId];
    if (!target) {
      return;
    }
    if (!Array.isArray(target.notes)) {
      target.notes = [];
    }
    if (!Array.isArray(target.warnings)) {
      target.warnings = [];
    }
    if (Array.isArray(entry.notes)) {
      entry.notes.forEach(function(note) {
        if (note && target.notes.indexOf(note) === -1) {
          target.notes.push(note);
        }
      });
    }
    if (Array.isArray(entry.warnings)) {
      entry.warnings.forEach(function(warning) {
        if (warning && target.warnings.indexOf(warning) === -1) {
          target.warnings.push(warning);
        }
      });
    }
  });
}

function buildCommercialFitSummary(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '(no commercial fit data available)';
  }
  const lines = entries.map(function(entry) {
    if (!entry || !entry.scopeEntryId || !entry.chosenSku) {
      return null;
    }
    const quantityContext = entry.quantityContext || {};
    const qtyText = quantityContext.qty !== undefined && quantityContext.qty !== null ? quantityContext.qty : '?';
    const unitText = quantityContext.unit || 'Unit';
    const score = entry.scoreBreakdown && entry.scoreBreakdown.total !== undefined ? entry.scoreBreakdown.total.toFixed(2) : 'n/a';
    return entry.scopeEntryId + ': ' + entry.chosenSku + ' — qty ' + qtyText + ' ' + unitText + ' (score ' + score + ')';
  }).filter(Boolean);
  return lines.length ? lines.join('\n') : '(no commercial fit data available)';
}

function buildCommercialFitQuantityProfile(entryOrContext) {
  if (!entryOrContext || typeof entryOrContext !== 'object') {
    return null;
  }
  const quantityContext = entryOrContext.quantityContext || entryOrContext;
  if (!quantityContext || typeof quantityContext !== 'object') {
    return null;
  }
  const qtyValue = quantityContext.qty;
  const qty = qtyValue !== undefined && qtyValue !== null ? Number(qtyValue) : null;
  const profile = {
    qty: qty !== null && !Number.isNaN(qty) ? qty : null,
    unit: quantityContext.unit || '',
    source: quantityContext.source || '',
    warnings: Array.isArray(quantityContext.warnings)
      ? quantityContext.warnings.slice(0, 3)
      : []
  };
  if (Array.isArray(quantityContext.evidence) && quantityContext.evidence.length) {
    profile.evidence = quantityContext.evidence.slice(0, 3);
  }
  return profile;
}

function serializeCommercialFitEvidence(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const fragments = [];
  const profile = entry.quantityProfile || entry.quantityContext;
  if (profile) {
    const qty = profile.qty !== undefined && profile.qty !== null ? profile.qty : null;
    const unit = profile.unit || '';
    const source = profile.source || '';
    if (qty !== null && qty !== undefined) {
      fragments.push('qty ' + qty + (unit ? ' ' + unit : ''));
    }
    if (source) {
      fragments.push('source: ' + source);
    }
    if (Array.isArray(profile.evidence) && profile.evidence.length) {
      fragments.push('evidence: ' + profile.evidence.slice(0, 2).join('; '));
    }
  }
  if (Array.isArray(entry.vectorCandidates) && entry.vectorCandidates.length) {
    entry.vectorCandidates.slice(0, 2).forEach(function(candidate) {
      if (candidate && candidate.snippet) {
        fragments.push(truncate(candidate.snippet, 60));
      }
    });
  }
  if (Array.isArray(entry.notes) && entry.notes.length) {
    fragments.push('notes: ' + entry.notes.slice(0, 2).join('; '));
  }
  return fragments.filter(Boolean).join(' | ');
}

function rebuildCommercialFitSnapshot(request) {
  // Add correlation ID tracing
  const trace = UnifiedLogger.startTrace('AISidebar', 'rebuildCommercialFitSnapshot', {
    hasRequest: !!request
  });

  try {
    const sidebarState = getAIQuoteSidebarState();
    const approvedScope = extractLatestApprovedScopeFromState(sidebarState);
    if (!approvedScope) {
      trace.info('No approved scope found - returning empty snapshot');
      const emptySnapshot = {
        snapshotId: Utilities.getUuid(),
        entries: []
      };
      trace.complete('Empty snapshot created', { snapshotId: emptySnapshot.snapshotId });
      return emptySnapshot;
    }

    trace.info('Approved scope extracted', { scopeId: approvedScope.id || 'unknown' });

    const scopeMap = validateScopeContract(approvedScope);
    trace.info('Scope contract validated', { entriesCount: scopeMap ? scopeMap.length : 0 });

    const previousState = getCommercialFitState();
    const context = buildLLMContext('', [], approvedScope, {
      mode: 'plan',
      persona: 'proposal-author',
      answers: [],
      clientNotes: '',
      mapperNotes: '',
      scopeMap: scopeMap,
      existingEntries: (previousState && previousState.ok && Array.isArray(previousState.entries)) ? previousState.entries : []
    });

    trace.info('LLM context built', { existingEntriesCount: context.existingEntries ? context.existingEntries.length : 0 });

    runCommercialFitReview(context);
    trace.info('Commercial fit review completed');

    saveCommercialFitState(context.commercialFit.snapshotId, context.commercialFit.entries);
    trace.info('Commercial fit state saved', {
      snapshotId: context.commercialFit.snapshotId,
      entriesCount: context.commercialFit.entries.length
    });

    const snapshot = {
      snapshotId: context.commercialFit.snapshotId,
      entries: context.commercialFit.entries,
      vectorMatchPagerEnabled: typeof isVectorMatchPagerEnabled === 'function'
        ? isVectorMatchPagerEnabled()
        : true
    };

    if (context.vectorSearchDiagnostics && context.vectorSearchDiagnostics.length) {
      snapshot.vectorErrors = context.vectorSearchDiagnostics.slice(0, 10);
      if (!snapshot.warning) {
        snapshot.warning = 'Vector search reported ' + context.vectorSearchDiagnostics.length + ' issue(s). Review results before approval.';
      }
      trace.warn('Vector search diagnostics found', { issueCount: context.vectorSearchDiagnostics.length });
    }

    trace.complete('Commercial fit snapshot rebuilt', {
      snapshotId: snapshot.snapshotId,
      entriesCount: snapshot.entries.length,
      hasVectorErrors: !!snapshot.vectorErrors
    });

    return snapshot;

  } catch (error) {
    trace.fail('Commercial fit snapshot rebuild failed', error);

    // Phase 5 Task 5.2.3: User-friendly error handling
    showFriendlyError(
      error,
      'Rebuilding Commercial Fit Snapshot',
      {
        correlationId: trace.correlationId,
        retryCallback: function() {
          return rebuildCommercialFitSnapshot(request);
        }
      }
    );

    throw error;
  }
}

function retryRebuildCommercialFitSnapshot() {
  try {
    const snapshot = rebuildCommercialFitSnapshot(null);
    showSuccessToast('Snapshot Rebuilt', 'Commercial fit snapshot rebuilt successfully.');
    return snapshot;
  } catch (error) {
    showErrorToast('Retry Failed', 'Unable to rebuild snapshot after retry. Please contact support.');
  }
}

function ensureCommercialFitSkusExist(entries) {
  const fixes = [];
  if (!Array.isArray(entries)) {
    return fixes;
  }
  entries.forEach(function(entry) {
    if (!entry) {
      return;
    }
    const originalSku = normalizeSku(entry.chosenSku || '');
    if (!originalSku) {
      return;
    }
    if (safeLookupItem(originalSku)) {
      return;
    }
    const findValidCandidate = function(candidate) {
      if (!candidate) {
        return '';
      }
      const normalizedCandidate = normalizeSku(candidate.sku || candidate.scopeCode || '');
      if (!normalizedCandidate) {
        return '';
      }
      return safeLookupItem(normalizedCandidate) ? normalizedCandidate : '';
    };
    const fallback = Array.isArray(entry.vectorCandidates)
      ? entry.vectorCandidates.map(function(candidate) {
          const normalized = findValidCandidate(candidate);
          if (!normalized) return null;

          // Hydrate if needed (backward compatible)
          const hydrated = hydrateCandidate(candidate);
          const description = (hydrated && hydrated.catalogItem && hydrated.catalogItem.description) ||
                             (candidate && candidate.description) || '';

          return {
            sku: normalized,
            description: description,
            qty: candidate && candidate.qty,
            unit: candidate && candidate.unit
          };
        }).filter(Boolean)[0]
      : null;
    if (!fallback) {
      return;
    }
    entry.chosenSku = fallback.sku;
    if (Array.isArray(entry.selectedSkus) && entry.selectedSkus.length) {
      entry.selectedSkus[0] = Object.assign({}, entry.selectedSkus[0], {
        sku: fallback.sku,
        skuId: fallback.sku ? fallback.sku.toLowerCase() : (entry.selectedSkus[0].skuId || ''),
        description: entry.selectedSkus[0].description || fallback.description || ''
      });
    } else {
      entry.selectedSkus = [
        {
          sku: fallback.sku,
          skuId: fallback.sku ? fallback.sku.toLowerCase() : '',
          qty: fallback.qty !== undefined ? fallback.qty : '',
          unit: fallback.unit || '',
          description: fallback.description || ''
        }
      ];
    }
    fixes.push({
      scopeEntryId: entry.scopeEntryId || '',
      original: originalSku,
      replacement: fallback.sku
    });
    // Removed noise: SKU replacement logging
    try { /* removed log */ } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
  });
  return fixes;
}

function seedPlanWithLockedSkus(plan, commercialFitEntries) {
  if (!plan || !Array.isArray(plan.sections) || !Array.isArray(commercialFitEntries)) {
    return;
  }
  const skuFixes = ensureCommercialFitSkusExist(commercialFitEntries);
  if (skuFixes.length) {
    plan.warnings = ensureArray(plan.warnings);
    skuFixes.forEach(function(fix) {
      plan.warnings.push('Replaced missing catalog SKU ' + fix.original + ' with ' + fix.replacement + ' for scopeEntryId ' + (fix.scopeEntryId || '(unknown)') + '.');
    });
  }
  const entryIndex = {};
  commercialFitEntries.forEach(function(entry) {
    if (entry && entry.scopeEntryId) {
      entryIndex[entry.scopeEntryId] = entry;
    }
  });
  plan.sections.forEach(function(section) {
    (section.items || []).forEach(function(item) {
      if (!item || typeof item !== 'object') {
        return;
      }
      const scopeEntryId = item.scopeEntryId || item.scopeEntry || '';
      if (!scopeEntryId || !entryIndex[scopeEntryId]) {
        return;
      }
      const fitEntry = entryIndex[scopeEntryId];
      if (!fitEntry.chosenSku) {
        return;
      }
      item.sku = fitEntry.chosenSku;
      const quantityContext = fitEntry.quantityContext || {};
      if (quantityContext.qty !== undefined && quantityContext.qty !== null) {
        item.qty = quantityContext.qty;
      } else {
        item.qty = null;
      }
      if (quantityContext.unit) {
        item.unit = quantityContext.unit;
      }
      if (!Array.isArray(item.catalogNotes)) {
        item.catalogNotes = [];
      }
      const lockNote = 'Commercial fit locked: ' + fitEntry.chosenSku;
      if (item.catalogNotes.indexOf(lockNote) === -1) {
        item.catalogNotes.push(lockNote);
      }
      if (fitEntry.sectionParentId) {
        item.sectionParentId = fitEntry.sectionParentId;
        if (!item.metadata || typeof item.metadata !== 'object') {
          item.metadata = item.metadata || {};
        }
        item.metadata.parentScopeId = fitEntry.sectionParentId;
      }
    });
  });
}

function buildLockedSkuPrompt(fitEntries) {
  if (!Array.isArray(fitEntries) || fitEntries.length === 0) {
    return '(no locked SKUs available)';
  }
  const lines = [];
  fitEntries.forEach(function(entry) {
    if (!entry || !entry.scopeEntryId || !entry.chosenSku) {
      return;
    }
    const alternates = (entry.candidatePool || []).slice(1, 3).map(function(candidate) {
      return candidate && candidate.sku ? candidate.sku : null;
    }).filter(Boolean);
    const parts = [entry.scopeEntryId + ': ' + entry.chosenSku];
    // DELETED: archetype logging (Plan 12-06) - archetype no longer exists
    if (alternates.length) {
      parts.push('alternates=' + alternates.join('/'));
    }
    lines.push(parts.join(' | '));
  });
  return lines.length ? lines.join('\n') : '(no locked SKUs available)';
}

function buildLockedSkuLog(fitEntries) {
  if (!Array.isArray(fitEntries)) {
    return [];
  }
  return fitEntries.map(function(entry) {
    const ranked = Array.isArray(entry && entry.candidatePool) ? entry.candidatePool : [];
    return {
      scopeEntryId: entry ? entry.scopeEntryId : '',
      // archetype: REMOVED (Plan 12-06)
      primary: entry ? entry.chosenSku : null,
      alternates: filterTruthy(ranked.slice(1, 3).map(function(candidate) { return candidate.sku; })),
      parentScopeId: entry ? (entry.sectionParentId || entry.parentScopeId || '') : ''
    };
  });
}

function buildCommercialFitEntries(contractEntries, options) {
  UnifiedLogger.info('CommercialFit', 'Building commercial fit entries', {
    contractEntryCount: contractEntries ? contractEntries.length : 0,
    hasOptions: !!(options)
  });

  const settings = options || {};
  const contextRef = settings && typeof settings.context === 'object' ? settings.context : null;
  const briefTypeLabel = settings.briefType || BRIEF_TYPE_DEFAULT;
  const snapshotId = settings.snapshotId || '';
  const hintsProvided = settings && Array.isArray(settings.hints) ? settings.hints.length : 0;

  UnifiedLogger.debug('CommercialFit', 'Settings parsed', {
    briefType: briefTypeLabel,
    snapshotId,
    hints: hintsProvided
  });

  const existingEntryMap = (settings.existingEntries || []).reduce(function(map, item) {
    if (item && item.scopeEntryId) {
      map[item.scopeEntryId] = item;
    }
    return map;
  }, {});

  const scopeEntries = Array.isArray(contractEntries)
    ? contractEntries.filter(entry => entry && entry.isSection !== true)
    : [];
  logScopeEntrySummary('CommercialFitInput', scopeEntries);
  if (!scopeEntries.length) {
    UnifiedLogger.warn('CommercialFit', 'No scope entries to process');
    return [];
  }
  UnifiedLogger.debug('CommercialFit', 'Scope entries filtered', { count: scopeEntries.length });

  const vectorHitMap = contextRef && contextRef.catalogSignals && contextRef.catalogSignals.vector
    ? contextRef.catalogSignals.vector
    : {};
  const resolveVectorHitsForEntry = function(entry) {
    if (!entry || !entry.id) {
      return [];
    }
    const keys = [];
    const entryKey = String(entry.id || '').trim();
    if (entryKey) {
      keys.push(entryKey);
    }
    const detailParentKey = entry.metadata && entry.metadata.vectorDetailParent
      ? String(entry.metadata.vectorDetailParent).trim()
      : '';
    if (detailParentKey && keys.indexOf(detailParentKey) === -1) {
      keys.push(detailParentKey);
    }
    const parentKey = entry.parentId ? String(entry.parentId).trim() : '';
    if (parentKey && keys.indexOf(parentKey) === -1) {
      keys.push(parentKey);
    }
    for (let i = 0; i < keys.length; i++) {
      const hits = vectorHitMap[keys[i]];
      if (Array.isArray(hits) && hits.length) {
        return hits;
      }
    }
    return [];
  };
  const catalogHints = contextRef && Array.isArray(contextRef.catalogContext)
    ? contextRef.catalogContext.slice(0, 12)
    : [];
  try {
    logAIEvent('commercial.fit.contract_entries', {
      runType: 'commercial-fit',
      outcome: 'ready',
      payload: {
        snapshotId: snapshotId,
        entryCount: scopeEntries.length,
        vectorMapped: Object.keys(vectorHitMap).length,
        hintsProvided: hintsProvided
      }
    });
  } catch (contractLogError) {
    try { UnifiedLogger.warn('AISidebar', 'buildCommercialFitEntries contract logging failed', String(contractLogError)); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
  }

  // Load catalog prefixes ONCE and build lookup index
  const prefixIndex = buildPrefixLookupIndex_();

  const entries = [];
  scopeEntries.forEach(function(entry) {
    if (!entry || !entry.id) {
      return;
    }

    const canonical = entry.canonical || entry.sectionId || '';
    const parentScopeId = entry.parentId || (entry.metadata && entry.metadata.parentScopeId) || '';
    // DELETED: archetype inference (2026-01-18, Plan 12-06)
    // archetype no longer needed - was only used by deleted bundle map and SKU_QUANTITY_FALLBACKS

    const rawVectorHits = resolveVectorHitsForEntry(entry);
    const fallbackScopeName = resolveScopeEntryLabelForVector(entry);
    let vectorCandidates = rawVectorHits.map(function(hit) {
      if (!hit) {
        return null;
      }
      const candidateSku = normalizeSku(hit.scopeCode || hit.sku || '');
      if (!candidateSku) {
        return null;
      }
      // Hydrate temporarily for rate decoration (not stored in candidate)
      const catalogItemForRate = safeLookupItem(candidateSku);
      const vectorScore = hit.score !== undefined && hit.score !== null ? Number(hit.score) : null;
      const decoratedRate = resolveCandidateRateFromHit_(hit, catalogItemForRate);
      return {
        sku: candidateSku,
        // catalogItem: REMOVED - will be hydrated on-demand when needed
        vectorScore: !isNaN(vectorScore) ? vectorScore : null,
        scopeCode: hit.scopeCode || candidateSku,
        scopeName: hit.scopeName || fallbackScopeName || '',
        snippet: hit.snippet || '',
        attributes: hit.attributes || {},
        rate: decoratedRate,
        source: 'vector'
      };
    }).filter(Boolean);

    if (contextRef && contextRef.catalogSignals && Array.isArray(contextRef.catalogSignals.entryMatches)) {
      contextRef.catalogSignals.entryMatches.push({
        entryId: entry.id || '',
        matchCount: vectorCandidates.length,
        topSku: vectorCandidates.length ? vectorCandidates[0].sku : '',
        topScore: vectorCandidates.length && vectorCandidates[0].vectorScore !== null ? vectorCandidates[0].vectorScore : null
      });
    }

    if (!vectorCandidates.length) {
      const hintCandidates = buildHintCandidates_(catalogHints);
      if (hintCandidates.length) {
        vectorCandidates = hintCandidates;
      }
    }

    // Bundle fallback removed - vector search is the only source
    // If vector search fails, candidatePool will be empty

    // Filter candidates by phase hint using pre-loaded index
    const phaseFilteredCandidates = filterCandidatesByPhaseHint_(
      vectorCandidates,
      canonical,
      briefTypeLabel,  // ✅ CORRECT - defined at line 2008 from settings.briefType
      prefixIndex
    );

    const candidatePool = phaseFilteredCandidates.map(function(candidate) {
      // Hydrate catalogItem on-demand (backward compatible)
      const hydrated = hydrateCandidate(candidate);

      return {
        sku: candidate.sku,
        catalogItem: hydrated ? hydrated.catalogItem : null,
        vectorScore: candidate.vectorScore,
        unitSpan: candidate.unitSpan || (candidate.attributes && candidate.attributes.unitSpan) || null,
        source: candidate.source || (candidate.attributes && candidate.attributes.source) || '',
        rationale: candidate.snippet || '',
        rate: candidate.rate !== undefined && candidate.rate !== null ? Number(candidate.rate) : null
      };
    });

    const fitEntry = {
      scopeEntryId: entry.id,
      sectionParentId: parentScopeId,
      canonical: canonical,
      // archetype: REMOVED (Plan 12-06) - only used by deleted bundle map and SKU_QUANTITY_FALLBACKS
      entry: entry,
      catalogItem: candidatePool.length ? candidatePool[0].catalogItem : null,
      signals: entry.signalLookup || {},
      candidatePool: candidatePool,
      chosenSku: '',
      scoreBreakdown: null,
      quantityContext: null,
      unitRateContext: null,
      warnings: [],
      notes: [],
      vectorCandidates: vectorCandidates,
      quantityProfile: null,
      sectionMatchScore: null
    };

    const existing = existingEntryMap[entry.id] || findBestFallbackMatch_(entry, settings.existingEntries);
    if (existing) {
      if (existing.chosenSku) fitEntry.chosenSku = existing.chosenSku;
      if (existing.manualOverride) fitEntry.manualOverride = existing.manualOverride;
      if (existing.quantityContext) fitEntry.quantityContext = deepClone(existing.quantityContext);
      if (existing.unitRateContext) fitEntry.unitRateContext = deepClone(existing.unitRateContext);
      if (Array.isArray(existing.notes) && existing.notes.length) fitEntry.notes = existing.notes.slice();
      if (Array.isArray(existing.vectorSelections) && existing.vectorSelections.length) fitEntry.vectorSelections = deepClone(existing.vectorSelections);

      // Hydrate if needed (backward compatible)
      if (existing.catalogItem) {
        fitEntry.catalogItem = existing.catalogItem;
      } else if (existing.candidatePool && existing.candidatePool[0]) {
        const hydratedExisting = hydrateCandidate(existing.candidatePool[0]);
        if (hydratedExisting && hydratedExisting.catalogItem) {
          fitEntry.catalogItem = hydratedExisting.catalogItem;
        }
      }
    }

    if (candidatePool.length) {
      const primaryCandidate = candidatePool.find(function(candidate) {
        const hydrated = hydrateCandidate(candidate);
        return hydrated && hydrated.catalogItem;
      }) || candidatePool[0];
      if (primaryCandidate && primaryCandidate.sku) {
        if (!fitEntry.chosenSku) {
          fitEntry.chosenSku = primaryCandidate.sku;
          const hydrated = hydrateCandidate(primaryCandidate);
          fitEntry.catalogItem = (hydrated && hydrated.catalogItem) || fitEntry.catalogItem;
        }
      }
    }

    const warningAccumulator = [];
    const noteAccumulator = [];

    if (!vectorCandidates.length) {
      warningAccumulator.push('Vector search returned no matches; assign manually.');
      if (hintsProvided) {
        warningAccumulator.push('Review catalog hints to complete mapping.');
      }
    }
    if (!fitEntry.chosenSku) {
      warningAccumulator.push('Vector search pending manual approval.');
    }
    if (fitEntry.chosenSku && (!fitEntry.catalogItem || !fitEntry.catalogItem.name)) {
      warningAccumulator.push('Catalog lookup failed for SKU ' + fitEntry.chosenSku + '. Verify the code or map manually.');
    }
    if (vectorCandidates.length && vectorCandidates[0].snippet) {
      noteAccumulator.push(truncate(vectorCandidates[0].snippet, 200));
    }

    const topScore = vectorCandidates.length ? vectorCandidates[0].vectorScore : null;
    if (topScore !== null && topScore !== undefined && !isNaN(topScore)) {
      fitEntry.scoreBreakdown = { total: Number(topScore) };
    }

    fitEntry.warnings = warningAccumulator.filter(function(message, idx, arr) {
      return message && arr.indexOf(message) === idx;
    });
    fitEntry.notes = noteAccumulator.filter(function(message, idx, arr) {
      return message && arr.indexOf(message) === idx;
    });
    // Track vector misses so callers can surface a manual review requirement.
    if (!vectorCandidates.length) {
      fitEntry.manualReviewRequired = true;
    } else if (Object.prototype.hasOwnProperty.call(fitEntry, 'manualReviewRequired')) {
      delete fitEntry.manualReviewRequired;
    }

    applyQuantityResolutionToEntry(fitEntry);
    applyVectorMatchDefaults_(fitEntry, candidatePool);
    fitEntry.quantityProfile = buildCommercialFitQuantityProfile(fitEntry);
    const sectionScoreComputed = (fitEntry.sectionMatchScore !== null && fitEntry.sectionMatchScore !== undefined)
      ? Number(fitEntry.sectionMatchScore)
      : (fitEntry.scoreBreakdown && fitEntry.scoreBreakdown.total !== undefined && fitEntry.scoreBreakdown.total !== null
        ? Number(fitEntry.scoreBreakdown.total)
        : null);
    fitEntry.sectionMatchScore = (sectionScoreComputed !== null && !isNaN(sectionScoreComputed))
      ? sectionScoreComputed
      : null;
    entries.push(fitEntry);
  });

  try {
    logAIEvent('commercial.fit.generate', {
      snapshotId: snapshotId,
      entryCount: entries.length,
      hintsProvided: hintsProvided
    });
  } catch (logError) {
    UnifiedLogger.info('buildCommercialFitEntries logging failed: ' + logError);
  }

  UnifiedLogger.info('CommercialFit', 'Commercial fit entries built', {
    entryCount: entries.length,
    resolvedCount: entries.filter(function(e) { return e.chosenSku; }).length,
    unresolvedCount: entries.filter(function(e) { return !e.chosenSku; }).length
  });

  return entries;
}

function buildCommercialFitPersistContext(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  try {
    const context = {};
    if (entry.entry) {
      const e = entry.entry;

      // DIAGNOSTIC: Log what we're actually storing
      if (e.id && e.id.includes('__deliverable_')) {
        try {
          UnifiedLogger.info('[DIAGNOSTIC-PERSIST]', {
            id: e.id,
            scopeLabel: e.scopeLabel,
            displayName: e.displayName,
            sectionId: e.sectionId,
            canonical: e.canonical
          });
        } catch (logErr) { /* ignore */ }
      }

      context.scopeEntry = {
        id: e.id,
        scopeLabel: e.scopeLabel,
        description: e.description,
        sectionId: e.sectionId,
        displayName: e.displayName
      };
    }
    if (entry.signals) {
      context.signalLookup = entry.signals;
    } else if (entry.entry && entry.entry.signalLookup) {
      context.signalLookup = entry.entry.signalLookup;
    }
    // DELETED: archetype assignment (Plan 12-06) - archetype no longer exists
    // For fitEntry, catalogItem should already be hydrated
    // But if loading old state, hydrate on access
    if (entry.catalogItem) {
      context.catalogItem = entry.catalogItem;
    } else if (entry.candidatePool && entry.candidatePool[0]) {
      const hydrated = hydrateCandidate(entry.candidatePool[0]);
      if (hydrated && hydrated.catalogItem) {
        context.catalogItem = hydrated.catalogItem;
      }
    }
    if (entry.quantityContext) {
      context.quantityContext = entry.quantityContext;
    }
    if (entry.unitRateContext) {
      context.unitRateContext = entry.unitRateContext;
    }
    if (Array.isArray(entry.vectorCandidates)) {
      context.vectorCandidates = entry.vectorCandidates
        .slice(0, 10)
        .map(function(candidate) {
          if (!candidate) {
            return null;
          }
          const persisted = {
            sku: candidate.sku || candidate.scopeCode || '',
            source: candidate.source || '',
            vectorScore: candidate.vectorScore !== undefined && candidate.vectorScore !== null
              ? Number(candidate.vectorScore)
              : null
          };
          if (candidate.scopeName) {
            persisted.scopeName = String(candidate.scopeName);
          }
          if (candidate.rate !== undefined && candidate.rate !== null) {
            const coerced = coerceCatalogNumber(candidate.rate);
            if (coerced !== null) {
              persisted.rate = coerced;
            }
          }
          if (candidate.rationale) {
            persisted.rationale = truncate(candidate.rationale, 200);
          } else if (candidate.snippet) {
            persisted.rationale = truncate(candidate.snippet, 200);
          }
          return persisted;
        })
        .filter(Boolean);
    }
    return Object.keys(context).length ? context : null;
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'buildCommercialFitPersistContext failed', String(error)); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
    return null;
  }
}

function deriveCommercialFitDescription(entry) {
  if (!entry) {
    return '';
  }
  const fragments = [];
  function pushText(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        fragments.push(trimmed);
      }
    }
  }
  pushText(entry.description);
  if (entry.catalogItem) {
    pushText(entry.catalogItem.description);
  }
  if (entry.entryContext) {
    pushText(entry.entryContext.description);
    if (entry.entryContext.catalogItem) {
      pushText(entry.entryContext.catalogItem.description);
    }
    if (entry.entryContext.scopeEntry) {
      pushText(entry.entryContext.scopeEntry.description);
    }
  }
  if (Array.isArray(entry.vectorCandidates)) {
    entry.vectorCandidates.forEach(function(candidate) {
      if (!candidate) {
        return;
      }
      const hydrated = hydrateCandidate(candidate);
      if (hydrated && hydrated.catalogItem) {
        pushText(hydrated.catalogItem.description);
      }
      pushText(candidate.snippet);
    });
  }
  if (!fragments.length && Array.isArray(entry.notes) && entry.notes.length) {
    pushText(entry.notes.join(' '));
  }
  if (fragments.length) {
    return truncate(fragments[0], 220);
  }
  return '';
}

function resolveScopeEntryLabelForVector(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const candidates = [];
  if (entry.entry && typeof entry.entry === 'object') {
    candidates.push(entry.entry.scopeLabel, entry.entry.description, entry.entry.name);
  }
  if (entry.entryContext && typeof entry.entryContext === 'object') {
    const context = entry.entryContext;
    if (context.scopeEntry && typeof context.scopeEntry === 'object') {
      candidates.push(context.scopeEntry.scopeLabel, context.scopeEntry.description);
    }
    candidates.push(context.description);
  }
  if (entry.scopeEntry && typeof entry.scopeEntry === 'object') {
    candidates.push(entry.scopeEntry.scopeLabel, entry.scopeEntry.description, entry.scopeEntry.name);
  }
  candidates.push(entry.scopeLabel, entry.scopeEntryName, entry.scopeEntryId, entry.canonical, entry.name);
  for (let i = 0; i < candidates.length; i++) {
    const value = candidates[i];
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function resolveCandidateRateFromHit_(hit, catalogItem) {
  if (catalogItem) {
    const extracted = extractCatalogUnitRate(catalogItem);
    if (extracted && extracted.value !== null && extracted.value !== undefined) {
      return extracted.value;
    }
  }
  return resolveVectorHitAttributeRate_(hit && hit.attributes);
}

function resolveVectorHitAttributeRate_(attributes) {
  if (!attributes || typeof attributes !== 'object') {
    return null;
  }
  const candidateKeys = ['sellPrice', 'defaultUnitAmount', 'unitRate', 'price', 'listPrice', 'dayRateAED', 'hourRateAED'];
  for (let i = 0; i < candidateKeys.length; i++) {
    const key = candidateKeys[i];
    if (!Object.prototype.hasOwnProperty.call(attributes, key)) {
      continue;
    }
    const value = coerceCatalogNumber(attributes[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function applyVectorMatchDefaults_(fitEntry, candidatePool) {
  if (!fitEntry || !Array.isArray(candidatePool) || !candidatePool.length) {
    return;
  }
  const pagerEnabled = typeof isVectorMatchPagerEnabled === 'function'
    ? isVectorMatchPagerEnabled()
    : true;
  if (!pagerEnabled) {
    return;
  }
  if (!fitEntry.quantityContext) {
    fitEntry.quantityContext = {};
  }
  let qtyDefaulted = false;
  if (fitEntry.quantityContext.qty === undefined || fitEntry.quantityContext.qty === null) {
    fitEntry.quantityContext.qty = 1;
    fitEntry.quantityContext.source = fitEntry.quantityContext.source || 'vector-default';
    qtyDefaulted = true;
  }
  const primaryCandidate = candidatePool[0];
  if (!fitEntry.unitRateContext) {
    fitEntry.unitRateContext = {};
  }
  let rateValue = fitEntry.unitRateContext.value !== undefined && fitEntry.unitRateContext.value !== null
    ? Number(fitEntry.unitRateContext.value)
    : null;
  let rateSource = '';
  let rateDefaulted = false;
  if ((rateValue === null || rateValue === undefined) && primaryCandidate) {
    if (primaryCandidate.catalogItem) {
      const extracted = extractCatalogUnitRate(primaryCandidate.catalogItem);
      if (extracted && extracted.value !== null && extracted.value !== undefined) {
        rateValue = Number(extracted.value);
        rateSource = 'catalog';
      }
    }
    if ((rateValue === null || rateValue === undefined) && primaryCandidate.rate !== undefined && primaryCandidate.rate !== null) {
      rateValue = coerceCatalogNumber(primaryCandidate.rate);
      rateSource = rateSource || 'vector-attr';
    }
  }
  if (rateValue !== null && rateValue !== undefined && !isNaN(rateValue)) {
    fitEntry.unitRateContext.value = rateValue;
    fitEntry.unitRateContext.source = fitEntry.unitRateContext.source || (rateSource || 'vector-default');
    rateDefaulted = true;
  }
  if ((qtyDefaulted || rateDefaulted) && typeof logAIEvent === 'function') {
    try {
      logAIEvent('commercial.fit.vector.defaults', {
        entryId: fitEntry.scopeEntryId || '',
        qtyDefaulted: qtyDefaulted,
        rateDefaulted: rateDefaulted,
        rateSource: rateSource || fitEntry.unitRateContext.source || '',
        candidateCount: candidatePool.length
      });
    } catch (logError) {
      try { UnifiedLogger.warn('AISidebar', 'commercial.fit.vector defaults log failed', String(logError)); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
    }
  }
}

function requestAssistantCommercialFitSuggestion_(scopeEntry, catalogHints, briefTypeLabel, snapshotId) {
  if (!scopeEntry || typeof invokeCatalogAssistant !== 'function') {
    return null;
  }
  const payload = {
    scopeEntries: [scopeEntry],
    catalogHints: Array.isArray(catalogHints) ? catalogHints.slice(0, 12) : []
  };
  const instructions = [
    "You are hrmny's commercial catalog mapper.",
    'The JSON payload contains "scopeEntries" (array) and "catalogHints" (array).',
    'For each scope entry, identify the best-fit SKU using the hrmny catalog file_search tool.',
    'Always prefer catalog lookups over fabrication. If retrieval fails, leave sku empty and include a warning explaining the gap.',
    'The payload includes catalogHints[]; treat each hint as a candidate SKU or keyword for file_search queries.',
    'Call file_search for every scope entry and choose the closest SKU even if only partially aligned.',
    'Return structured JSON that matches the catalog mapper schema (responseType, entries[], matches[]).',
    'Populate responseType as "commercialFit" and leave matches[] empty—the caller will backfill alternates.'
  ].join('\n');
  try {
    const llmResult = invokeCatalogAssistant(JSON.stringify(payload, null, 2), {
      runType: 'commercial-fit',
      eventType: 'commercial.fit.fallback',
      responseFormat: getCatalogMapperResponseFormat(),
      instructions: instructions,
      metadata: {
        snapshotId: snapshotId || '',
        briefType: briefTypeLabel || '',
        fallback: 'true'
      }
    });
    const parsed = tryParseJsonResponse(llmResult.output);
    if (parsed && Array.isArray(parsed.entries) && parsed.entries.length) {
      return parsed.entries[0];
    }
  } catch (error) {
    UnifiedLogger.info('requestAssistantCommercialFitSuggestion_ failed: ' + error);
  }
  return null;
}

/**
 * Normalize phase canonical name (trim, lowercase)
 * Validates against known standard phases and logs warnings for non-standard values
 * @private
 */
function normalizePhaseCanonical_(phaseName) {
  if (!phaseName) {
    return '';
  }

  const normalized = String(phaseName).trim().toLowerCase();

  // Standard canonical phases (9 total)
  const STANDARD_PHASES = [
    'strategy-account',
    'planning-architecture',
    'asset-development',
    'pre-production',
    'production',
    'post-production',
    'distribution-community',
    'measurement-reporting',
    'deliverable-management'
  ];

  // Log warning if phase doesn't match standards (helps catch typos)
  if (normalized && STANDARD_PHASES.indexOf(normalized) === -1) {
    UnifiedLogger.verbose('CommercialFit', 'Non-standard phase canonical detected', {
      original: phaseName,
      normalized: normalized
    });
  }

  return normalized;
}

/**
 * Build prefix lookup index from Config: Catalog Prefixes
 * Loads sheet once and creates map: {briefType: {prefix: {category, phaseHint}}}
 */
function buildPrefixLookupIndex_() {
  const index = {};

  try {
    if (typeof SheetConfigLoader === 'undefined' || typeof SheetConfigLoader.load !== 'function') {
      return index;
    }

    const catalogPrefixes = SheetConfigLoader.load('catalogPrefixes');
    if (!Array.isArray(catalogPrefixes)) {
      return index;
    }

    catalogPrefixes.forEach(function(row) {
      if (!row || !row.prefix || row.active === false) {
        return;
      }

      // Option A (strict): Skip rows without briefType
      // Sheet data has briefType for all rows (verified)
      // No '*' wildcard fallback - no defensive coding for imaginary cases
      if (!row.briefType) {
        return;
      }

      const briefType = row.briefType; // No fallback
      if (!index[briefType]) {
        index[briefType] = {};
      }

      index[briefType][row.prefix] = {
        category: row.prefixCategory || null,
        phaseHint: row.categoryPhaseHint || null
      };
    });
  } catch (error) {
    UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'buildPrefixLookupIndex_ failed', { error: error.message, stack: error.stack });
    UnifiedLogger.warn('CommercialFit', 'Failed to build prefix lookup index - phase filtering disabled', {
      error: String(error)
    });
  }

  // Warn if index is empty (no data loaded)
  if (Object.keys(index).length === 0) {
    UnifiedLogger.warn('CommercialFit', 'Prefix lookup index is empty - phase filtering will not work', {});
  }

  return index;
}

/**
 * Filter candidates by phase hint using pre-built index
 * Returns filtered array of candidates that match the current phase
 */
function filterCandidatesByPhaseHint_(candidates, canonical, briefType, prefixIndex) {
  if (!Array.isArray(candidates) || !canonical || !prefixIndex) {
    if (Array.isArray(candidates) && candidates.length > 0 && !prefixIndex) {
      UnifiedLogger.verbose('CommercialFit', 'Phase filtering skipped - no prefix index', {
        candidateCount: candidates.length
      });
    }
    return candidates;
  }

  return candidates.filter(function(candidate) {
    if (!candidate.sku) {
      return true; // Keep if no SKU
    }

    // Extract prefix from SKU
    // Assumes format: PREFIX-NUMBER (e.g., "STR-001", "DEV-042")
    // Handles multi-dash SKUs: "STR-SUB-001" → "STR-"
    // Note: SKUs without dashes won't match any prefix
    const prefix = candidate.sku.split('-')[0] + '-';

    // Option A (strict): Lookup metadata by briefType only (no wildcard fallback)
    let metadata = null;
    if (briefType && prefixIndex[briefType] && prefixIndex[briefType][prefix]) {
      metadata = prefixIndex[briefType][prefix];
    }

    if (!metadata || !metadata.phaseHint) {
      return true; // Keep if no phase hint
    }

    // Normalize current phase
    const normalizedCanonical = normalizePhaseCanonical_(canonical);

    // Parse and normalize allowed phases
    const allowedPhases = metadata.phaseHint.split(',').map(function(p) {
      return normalizePhaseCanonical_(p);
    });

    // Compare normalized values
    return allowedPhases.indexOf(normalizedCanonical) !== -1;
  });
}

function buildHintCandidates_(catalogHints) {
  if (!Array.isArray(catalogHints) || !catalogHints.length) {
    return [];
  }
  return catalogHints.map(function(hint) {
    if (!hint || !hint.sku) {
      return null;
    }
    const normalizedSku = normalizeSku(hint.sku);
    if (!normalizedSku) {
      return null;
    }
    const catalogItem = safeLookupItem(normalizedSku);
    if (!catalogItem) {
      return null;
    }
    return {
      sku: normalizedSku,
      catalogItem: catalogItem,
      vectorScore: null,
      scopeCode: normalizedSku,
      scopeName: hint.name || '',
      snippet: hint.description ? truncate(hint.description, 200) : '',
      attributes: {
        source: 'hint',
        hintScore: hint.score !== undefined ? hint.score : null
      },
      source: 'hint'
    };
  }).filter(Boolean);
}


function buildFallbackCommercialFitEntry_(entry, reason) {
  const fallbackReason = reason ? String(reason) : 'No SKU available; assign manually.';
  if (!entry || !entry.id) {
    return {
      scopeEntryId: '',
      sectionParentId: '',
      canonical: '',
      // archetype: REMOVED (Plan 12-06)
      entry: entry,
      catalogItem: null,
      signals: {},
      candidatePool: [],
      chosenSku: '',
      scoreBreakdown: null,
      quantityContext: null,
      unitRateContext: null,
      warnings: [fallbackReason],
      notes: []
    };
  }

  const canonical = entry.canonical || entry.sectionId || '';
  const parentScopeId = entry.parentId || (entry.metadata && entry.metadata.parentScopeId) || '';
  // DELETED: archetype extraction (Plan 12-06) - no longer needed

  return {
    scopeEntryId: entry.id,
    sectionParentId: parentScopeId,
    canonical: canonical,
    // archetype: REMOVED (Plan 12-06) - only used by deleted bundle map and SKU_QUANTITY_FALLBACKS
    entry: entry,
    catalogItem: null,
    signals: entry.signalLookup || {},
    candidatePool: [],
    chosenSku: '',
    scoreBreakdown: null,
    quantityContext: null,
    unitRateContext: null,
    warnings: [fallbackReason],
    notes: []
  };
}

function getVectorStoreId_() {
  if (typeof resolveVectorStoreId_ !== 'function') {
    return '';
  }
  if (typeof ensureVectorIntegrationReady_ === 'function') {
    ensureVectorIntegrationReady_({ operation: 'search', allowNetworkProbe: true });
  }
  return String(resolveVectorStoreId_() || '').trim();
}

function fetchAssistantCatalogMatches_(promptText, topK) {
  const query = String(promptText || '').trim();
  if (!query) {
    return [];
  }

  const limit = Math.min(Math.max(topK || 6, 1), 12);
  const instructions = [
    "You are hrmny's catalog retrieval assistant.",
    'Use the hrmny catalog file_search tool to retrieve the most relevant SKUs for the provided query.',
    'Return JSON that conforms to the catalog mapper schema: responseType, entries[], matches[].',
    'Set responseType to "catalogMatches", leave entries[] empty, and populate matches[] with the strongest SKUs (max 12).',
    'If nothing relevant is found, return matches[] as an empty array without fabricating SKUs.'
  ].join('\n');

  let llmResult;
  try {
    llmResult = invokeCatalogAssistant(JSON.stringify({ query: query, maxResults: limit }), {
      runType: 'catalog-search',
      eventType: 'catalog.match.search',
      responseFormat: getCatalogMapperResponseFormat(),
      instructions: instructions,
      metadata: {
        maxResults: limit
      }
    });
  } catch (error) {
    UnifiedLogger.info('fetchAssistantCatalogMatches_ invoke failed: ' + error);
    return [];
  }

  let parsed;
  try {
    parsed = tryParseJsonResponse(llmResult.output);
  } catch (error) {
    UnifiedLogger.info('fetchAssistantCatalogMatches_ parse failed: ' + error);
    parsed = null;
  }

  if (!parsed || !Array.isArray(parsed.matches)) {
    return [];
  }

  return parsed.matches.slice(0, limit).map(function(match) {
    if (!match || !match.sku) {
      return null;
    }
    const sku = normalizeSku(match.sku);
    if (!sku) {
      return null;
    }
    const catalogItem = safeLookupItem(sku);
    const confidence = Number(match.confidence);
    return {
      sku: sku,
      name: catalogItem && catalogItem.name ? catalogItem.name : '',
      description: catalogItem && catalogItem.description ? catalogItem.description : '',
      sellPrice: catalogItem && catalogItem.sellPrice !== undefined ? catalogItem.sellPrice : '',
      score: !isNaN(confidence) ? confidence : null,
      rationale: truncate(match.rationale || '', 200),
      source: 'assistant'
    };
  }).filter(Boolean);
}

function getCatalogMatchesForEntry(entryOrId, queryText, options) {
  const query = String(queryText || '').trim();
  if (!query) {
    return [];
  }
  const topK = options && options.topK ? Number(options.topK) : 6;
  const matches = fetchAssistantCatalogMatches_(query, topK);
  try {
    logAIEvent('catalog.match', {
      runType: 'catalog-search',
      entryId: entryOrId && entryOrId.id ? entryOrId.id : (entryOrId || ''),
      matchCount: matches.length,
      topSku: matches.length ? matches[0].sku : '',
      topScore: matches.length ? matches[0].score : null,
      briefType: options && options.briefType ? options.briefType : 'unknown',
      queryPreview: truncate(query, 200)
    });
  } catch (error) {
    UnifiedLogger.info('getCatalogMatchesForEntry logging failed: ' + error);
  }
  return matches;
}

function applyQuantityResolutionToEntry(fitEntry) {
  if (!fitEntry || !fitEntry.chosenSku || typeof resolveSkuQuantity !== 'function') {
    return;
  }
  const chosen = fitEntry.candidatePool.find(function(candidate) {
    return candidate && candidate.sku === fitEntry.chosenSku;
  });
  if (!chosen) {
    return;
  }
  const resolved = resolveSkuQuantity({
    scopeEntry: fitEntry.entry,
    skuMeta: {
      sku: chosen.sku,
      unitSpan: chosen.unitSpan || {}
      // archetype: REMOVED (Plan 12-06)
    },
    // archetype: REMOVED (Plan 12-06) - no longer needed after SKU_QUANTITY_FALLBACKS deletion
    signalLookup: fitEntry.signals || {},
    catalogItem: chosen.catalogItem
  });
  fitEntry.quantityContext = resolved;
  if (resolved && resolved.warnings) {
    fitEntry.warnings = fitEntry.warnings.concat(resolved.warnings);
  }

  fitEntry.unitRateContext = determineUnitRate(chosen.catalogItem);
}

function determineUnitRate(catalogItem) {
  if (!catalogItem) {
    return null;
  }
  let resolvedValue = null;
  let source = '';
  if (typeof suggestUnitRate === 'function') {
    const suggested = suggestUnitRate(catalogItem);
    const coercedSuggested = coerceCatalogNumber(suggested);
    if (coercedSuggested !== null) {
      resolvedValue = coercedSuggested;
      source = 'suggestUnitRate';
    }
  }
  if (resolvedValue === null) {
    const extracted = extractCatalogUnitRate(catalogItem);
    if (extracted) {
      resolvedValue = extracted.value;
      source = extracted.source;
    }
  }
  if (resolvedValue === null) {
    return null;
  }
  return { value: resolvedValue, source: source || 'catalog' };
}

function isValidVectorSku(value) {
  if (!value) {
    return false;
  }
  return VECTOR_SKU_PATTERN.test(String(value).trim().toUpperCase());
}

function enforceCatalogSkuAlignment(plan, contractEntries, options) {
  UnifiedLogger.info('SKU Alignment', 'Enforcing catalog SKU alignment', {
    sectionCount: plan && plan.sections ? plan.sections.length : 0,
    contractEntryCount: contractEntries ? contractEntries.length : 0
  });

  const alignmentWarnings = [];
  if (!plan || !Array.isArray(plan.sections)) {
    UnifiedLogger.warn('SKU Alignment', 'No plan sections to align');
    return alignmentWarnings;
  }

  const commercialFitEntries = Array.isArray(options && options.commercialFitEntries)
    ? options.commercialFitEntries
    : buildCommercialFitEntries(contractEntries, null);
  UnifiedLogger.debug('SKU Alignment', 'Commercial fit entries prepared', {
    entryCount: commercialFitEntries.length
  });

  const commercialFitIndex = buildCommercialFitIndex(commercialFitEntries);
  UnifiedLogger.debug('SKU Alignment', 'Commercial fit index built', {
    indexSize: Object.keys(commercialFitIndex).length
  });

  const catalogCache = {};
  const getCatalogItem = function(sku) {
    if (!sku) {
      return null;
    }
    const key = String(sku).trim().toUpperCase();
    if (!key) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(catalogCache, key)) {
      return catalogCache[key];
    }
    let item = null;
    try {
      if (typeof lookupItem === 'function') {
        item = lookupItem(key);
      }
    } catch (lookupError) {
      UnifiedLogger.info('enforceCatalogSkuAlignment lookup failed for ' + key + ': ' + lookupError);
    }
    catalogCache[key] = item;
    return item;
  };
  const applyCatalogDetails = function(item) {
    if (!item || !item.sku) {
      return;
    }
    const catalogItem = getCatalogItem(item.sku);
    if (!catalogItem) {
      return;
    }
    if (!item.description) {
      item.description = catalogItem.description || item.description || '';
    }
    if (!item.clientLineName) {
      item.clientLineName = catalogItem.name || item.description || item.sku;
    }
    if (!item.unit) {
      item.unit = catalogItem.unit || item.unit || 'Unit';
    }
    const needsRate = item.unitRate === undefined || item.unitRate === null || Number(item.unitRate) === 0;
    if (needsRate) {
      let suggestedRate = null;
      if (typeof suggestUnitRate === 'function') {
        suggestedRate = suggestUnitRate(catalogItem);
      } else if (typeof catalogItem.defaultUnitAmountAED === 'number') {
        suggestedRate = catalogItem.defaultUnitAmountAED;
      } else if (typeof catalogItem.sellPrice === 'number') {
        suggestedRate = catalogItem.sellPrice;
      }
      if (suggestedRate !== null && !isNaN(suggestedRate)) {
        item.unitRate = suggestedRate;
      }
    }
  };
  const ensureWarning = function(item, message) {
    if (!message) {
      return;
    }
    const warnings = ensureArray(item.warnings);
    if (warnings.indexOf(message) === -1) {
      warnings.push(message);
    }
    item.warnings = warnings;
  };
  const addCatalogNote = function(item, note) {
    if (!note) {
      return;
    }
    if (!Array.isArray(item.catalogNotes)) {
      item.catalogNotes = [];
    }
    if (item.catalogNotes.indexOf(note) === -1) {
      item.catalogNotes.push(note);
    }
  };

  plan.sections.forEach(function(section) {
    (section.items || []).forEach(function(item) {
      if (!item || typeof item !== 'object') {
        return;
      }
      const scopeEntryId = item.scopeEntryId || item.scopeEntry || '';
      const fitEntry = commercialFitIndex[scopeEntryId];

      if (!fitEntry || !fitEntry.chosenSku) {
        ensureWarning(item, 'No commercial fit SKU available. Operator must assign manually.');
        alignmentWarnings.push('Commercial fit missing for scopeEntryId ' + (scopeEntryId || '(unknown)') + '.');
        return;
      }

      item.sku = fitEntry.chosenSku;
      item.catalogConfidence = fitEntry.scoreBreakdown && fitEntry.scoreBreakdown.total !== undefined
        ? fitEntry.scoreBreakdown.total
        : null;

      applyCatalogDetails(item);

      const quantityContext = fitEntry.quantityContext || {};
      if (quantityContext.qty !== undefined && quantityContext.qty !== null) {
        item.qty = quantityContext.qty;
      }
      if (quantityContext.unit) {
        item.unit = quantityContext.unit;
      }
      if (fitEntry.unitRateContext && fitEntry.unitRateContext.value !== undefined && fitEntry.unitRateContext.value !== null) {
        item.unitRate = fitEntry.unitRateContext.value;
      }

      addCatalogNote(item, 'Score: ' + JSON.stringify(fitEntry.scoreBreakdown || {}));
      if (quantityContext.source) {
        addCatalogNote(item, 'Quantity source: ' + quantityContext.source);
      }
      fitEntry.warnings.forEach(function(message) {
        ensureWarning(item, message);
      });
      alignmentWarnings.push('Commercial fit applied to scopeEntryId ' + scopeEntryId + ' with SKU ' + fitEntry.chosenSku + '.');

      if (!item.clientLineName) {
        item.clientLineName = item.description || item.sku || item.clientLineName || '';
      }
      if (!item.visibility) {
        item.visibility = (typeof VISIBILITY !== 'undefined' && VISIBILITY && VISIBILITY.INTERNAL) ? VISIBILITY.INTERNAL : 'Internal';
      }
    });
  });

  UnifiedLogger.info('SKU Alignment', 'Alignment complete', {
    warningCount: alignmentWarnings.length
  });

  return alignmentWarnings;
}

function invokeCatalogAssistant(userContent, options) {
  // Add correlation ID tracing
  const trace = UnifiedLogger.startTrace('AISidebar', 'invokeCatalogAssistant', {
    hasUserContent: !!userContent,
    hasOptions: !!options
  });

  try {
    const payloadOptions = options || {};
    const apiKey = getScriptProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw new AppError('LLM_CONFIG', 'OPENAI_API_KEY is not configured.');
  }
  const baseEndpoint = getScriptProperty('LLM_ASSISTANT_ENDPOINT') || 'https://api.openai.com/v1';
  const vectorStoreId = getVectorStoreId_();
  const promptId = CATALOG_PROMPT_ID;

  const endpoint = baseEndpoint.replace(/\/+$/, '') + '/responses';
  const model = payloadOptions && payloadOptions.model ? String(payloadOptions.model) : ASSISTANT_MODEL;

  // PHASE 2: Rate limit enforcement
  try {
    enforceRateLimit(SERVICE_OPENAI_COMPLETION, {
      operationName: 'invokeCatalogAssistant',
      operationDetails: {
        model: model,
        hasUserContent: !!userContent
      }
    });
  } catch (error) {
    if (error.code === 'RATE_LIMIT') {
      UnifiedLogger.warn('AI', 'Completion rate limit reached', {
        model: model,
        resetInSeconds: error.resetTimeSeconds
      });

      const err = new Error(
        'AI assistant rate limit reached. Please wait ' +
        Math.ceil(error.resetTimeSeconds) + ' seconds and try again.\n\n' +
        'Tip: Consider reducing scope complexity or waiting between operations.'
      );
      err.code = 'RATE_LIMIT';
      err.resetTimeSeconds = error.resetTimeSeconds;
      throw err;
    }
    throw error;
  }

  const userItem = {
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: String(userContent || '')
      }
    ]
  };
  const responsePayload = {
    input: [userItem],
    model: model
  };
  if (payloadOptions && payloadOptions.instructions) {
    responsePayload.instructions = String(payloadOptions.instructions);
  }
  if (payloadOptions.temperature !== undefined) {
    responsePayload.temperature = payloadOptions.temperature;
  }
  const mergedMetadata = (payloadOptions && typeof payloadOptions.metadata === 'object')
    ? Object.assign({}, payloadOptions.metadata)
    : (payloadOptions && payloadOptions.metadata ? { meta: payloadOptions.metadata } : {});
  if (typeof getConfigStatus === 'function') {
    try {
      mergedMetadata.configStatus = getConfigStatus();
    } catch (metaError) {
      UnifiedLogger.info('invokeCatalogAssistant: getConfigStatus failed: ' + metaError);
    }
  }
  if (mergedMetadata.fallback !== undefined && mergedMetadata.fallback !== null) {
    mergedMetadata.fallback = String(mergedMetadata.fallback);
  }
  if (Object.keys(mergedMetadata).length) {
    responsePayload.metadata = mergedMetadata;
  }
  if (payloadOptions.maxTokens !== undefined && payloadOptions.maxTokens !== null) {
    responsePayload.max_output_tokens = payloadOptions.maxTokens;
  }
  if (promptId && !responsePayload.prompt) {
    responsePayload.prompt = { id: promptId };
  }
  let vectorStoreIds = [];
  if (payloadOptions && payloadOptions.toolResources && payloadOptions.toolResources.file_search) {
    const ids = payloadOptions.toolResources.file_search.vector_store_ids;
    if (ids && ids.length) {
      vectorStoreIds = ensureArray(ids).filter(Boolean);
    }
  }
  if (!vectorStoreIds.length && payloadOptions && Array.isArray(payloadOptions.tools)) {
    payloadOptions.tools.forEach(function(tool) {
      if (!tool || tool.type !== 'file_search') {
        return;
      }
      if (tool.vector_store_ids && tool.vector_store_ids.length) {
        vectorStoreIds = ensureArray(tool.vector_store_ids).filter(Boolean);
      } else if (tool.file_search && tool.file_search.vector_store_ids && tool.file_search.vector_store_ids.length) {
        vectorStoreIds = ensureArray(tool.file_search.vector_store_ids).filter(Boolean);
      }
    });
  }
  if (!vectorStoreIds.length && vectorStoreId) {
    vectorStoreIds = [vectorStoreId];
  }
  if (payloadOptions && payloadOptions.tools) {
    const sanitizedTools = [];
    payloadOptions.tools.forEach(function(tool) {
      if (!tool) {
        return;
      }
      const toolCopy = Object.assign({}, tool);
      if (toolCopy.type === 'file_search') {
        let ids = [];
        if (toolCopy.vector_store_ids && toolCopy.vector_store_ids.length) {
          ids = ensureArray(toolCopy.vector_store_ids).filter(Boolean);
        } else if (toolCopy.file_search && toolCopy.file_search.vector_store_ids && toolCopy.file_search.vector_store_ids.length) {
          ids = ensureArray(toolCopy.file_search.vector_store_ids).filter(Boolean);
        } else if (vectorStoreIds.length) {
          ids = vectorStoreIds.slice();
        }
        if (ids.length) {
          toolCopy.vector_store_ids = ids;
        }
        if (toolCopy.file_search) {
          delete toolCopy.file_search;
        }
      }
      sanitizedTools.push(toolCopy);
    });
    responsePayload.tools = sanitizedTools;
  } else if (vectorStoreIds.length) {
    responsePayload.tools = [{
      type: 'file_search',
      vector_store_ids: vectorStoreIds.slice()
    }];
  }
  if (payloadOptions.responseFormat) {
    responsePayload.text = buildResponsesTextConfig(payloadOptions.responseFormat, 'catalog_mapper_payload');
  }

  const headers = {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json'
  };

  const requestLogPayload = {
    promptId: promptId || '',
    model: model,
    vectorStoreId: vectorStoreId || '',
    responseFormat: payloadOptions.responseFormat || {},
    metadata: payloadOptions.metadata || {},
    tools: responsePayload.tools || [],
    toolVectorStoreIds: vectorStoreIds
  };
  const eventType = payloadOptions.eventType || 'assistant.request';
  try {
    logAIEvent(eventType, {
      runType: payloadOptions.runType || 'assistant',
      outcome: 'request',
      payload: requestLogPayload,
      promptPreview: truncate(String(userContent || ''), 4000)
    });
  } catch (logError) {
    UnifiedLogger.info('invokeCatalogAssistant request logging failed: ' + logError);
  }

  const fetchOptions = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(responsePayload)
  };

  const httpResponse = UrlFetchApp.fetch(endpoint, fetchOptions);
  const statusCode = httpResponse.getResponseCode();
  const bodyText = httpResponse.getContentText();
  if (statusCode >= 300) {
    try {
      logAIEvent(eventType, {
        runType: payloadOptions.runType || 'assistant',
        outcome: 'http_error_' + statusCode,
        payload: {
          statusCode: statusCode,
          response: truncate(bodyText, 400)
        }
      });
    } catch (logError) {
      UnifiedLogger.info('invokeCatalogAssistant failure logging failed: ' + logError);
    }
    const safeBody = truncate(bodyText, 400);
    if (statusCode === 429) throw new AppError('ASSISTANT_QUOTA', 'AI quota exceeded. Please check your OpenAI usage limits.', { statusCode, response: safeBody });
    if (statusCode === 401) throw new AppError('ASSISTANT_AUTH', 'AI authentication failed. Check your API key.', { statusCode, response: safeBody });
    if (statusCode >= 500) throw new AppError('ASSISTANT_SERVER', 'OpenAI server error. Please try again later.', { statusCode, response: safeBody });
    throw new AppError('ASSISTANT_HTTP', 'Assistant request failed (' + statusCode + '): ' + safeBody);
  }

  const parsedResponse = safeJsonParse(bodyText, null);
  if (!parsedResponse) {
    throw new AppError('ASSISTANT_JSON', 'Unable to parse assistant response JSON.', 'Invalid JSON');
  }

  if (parsedResponse.status && parsedResponse.status !== 'completed') {
    try {
      logAIEvent(eventType, {
        runType: payloadOptions.runType || 'assistant',
        outcome: 'run_' + parsedResponse.status,
        payload: {
          assistantResponseId: parsedResponse.id || '',
          error: parsedResponse.error || null
        }
      });
    } catch (logError) {
      UnifiedLogger.info('invokeCatalogAssistant failure logging failed: ' + logError);
    }
    throw new AppError('ASSISTANT_RUN', 'Assistant response incomplete.', {
      status: parsedResponse.status,
      error: parsedResponse.error || null
    });
  }

  const output = extractResponseOutputText(parsedResponse);

  try {
    logAIEvent(eventType, {
      runType: payloadOptions.runType || 'assistant',
      outcome: 'completed',
      payload: {
        assistantResponseId: parsedResponse.id || '',
        usage: parsedResponse.usage || null,
        model: parsedResponse.model || model
      }
    });
  } catch (logError) {
    UnifiedLogger.info('invokeCatalogAssistant completion logging failed: ' + logError);
  }

    trace.complete('invokeCatalogAssistant completed successfully');

  return {
    output: output,
    usage: parsedResponse.usage || null,
    model: parsedResponse.model || null
  };
  } catch (error) {
    trace.fail('invokeCatalogAssistant failed', error);

    // Phase 5 Task 5.2.9: User-friendly error handling
    showFriendlyError(
      error,
      'Invoking Catalog Assistant',
      {
        correlationId: trace.correlationId
        // Note: Retry may not be appropriate for LLM calls - user should check input
      }
    );

    throw error;
  }
}

function getCatalogHints(briefText, limit) {
  const text = String(briefText || '').toLowerCase();
  if (!text) {
    return [];
  }
  let terms = text.split(/[^a-z0-9]+/).filter(term => term && term.length > 2);
  if (terms.length === 0) {
    return [];
  }
  terms = Array.from(new Set(terms));
  const maxResults = limit || 8;
  let rows;
  try {
    const sheet = getXeroReadySheet();
    rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), sheet.getLastColumn()).getValues();
  } catch (error) {
    UnifiedLogger.info('getCatalogHints: unable to read XERO_READY sheet: ' + error);
    return [];
  }
  if (!rows || rows.length === 0) {
    return [];
  }
  const hints = [];
  rows.forEach(function(row) {
    const sku = row[XERO_COLS.SKU] || '';
    const name = row[XERO_COLS.NAME] || '';
    const description = row[XERO_COLS.DESCRIPTION] || '';
    const catalogText = (name + ' ' + description).toLowerCase();
    let score = 0;
    terms.forEach(function(term) {
      if (catalogText.indexOf(term) !== -1) {
        score += 1;
      }
    });
    if (score > 0) {
      hints.push({
        sku: sku,
        name: name,
        description: description,
        sellPrice: row[XERO_COLS.SELL_PRICE],
        score: score
      });
    }
  });
  hints.sort(function(a, b) {
    if (b.score === a.score) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    }
    return b.score - a.score;
  });
  return hints.slice(0, maxResults);
}

function buildCatalogQueryForEntry(entry, answers, mapperNotes) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const parts = [];
  if (entry.scopeLabel) {
    parts.push('Scope Label: ' + sanitizeText(entry.scopeLabel));
  }
  if (Array.isArray(entry.deliverables) && entry.deliverables.length) {
    parts.push('Deliverables: ' + sanitizeText(entry.deliverables.join('; ')));
  }
  if (Array.isArray(entry.notes) && entry.notes.length) {
    parts.push('Notes: ' + sanitizeText(entry.notes.join('; ')));
  }
  if (Array.isArray(entry.resources) && entry.resources.length) {
    const resourceLines = entry.resources.map(function(resource) {
      if (!resource) {
        return '';
      }
      const segments = [];
      if (resource.role) {
        segments.push(resource.role);
      }
      if (resource.hours !== null && resource.hours !== undefined && !isNaN(Number(resource.hours))) {
        segments.push(Number(resource.hours) + 'h');
      } else if (resource.metadata && resource.metadata.rawHours) {
        segments.push(resource.metadata.rawHours);
      }
      if (resource.rate !== null && resource.rate !== undefined && !isNaN(Number(resource.rate))) {
        segments.push('AED ' + Number(resource.rate));
      } else if (resource.metadata && resource.metadata.rawRate) {
        segments.push(resource.metadata.rawRate);
      }
      if (segments.length === 0 && resource.metadata && resource.metadata.notes) {
        segments.push(resource.metadata.notes);
      }
      return segments.join(' · ');
    }).filter(Boolean);
    if (resourceLines.length) {
      parts.push('Resources: ' + sanitizeText(resourceLines.join('; ')));
    }
  }
  if (Array.isArray(entry.signals) && entry.signals.length) {
    parts.push('Signals: ' + sanitizeText(entry.signals.join(', ')));
  }
  if (Array.isArray(answers) && answers.length) {
    const answerLines = answers
      .filter(function(answer) {
        return answer && answer.answer;
      })
      .map(function(answer) {
        const prefix = answer.question ? sanitizeText(answer.question) + ': ' : '';
        return prefix + sanitizeText(answer.answer);
      });
    if (answerLines.length) {
      parts.push('Answered Questions: ' + answerLines.join(' | '));
    }
  }
  if (mapperNotes) {
    parts.push('Mapper Notes: ' + sanitizeText(mapperNotes));
  }
  const query = parts.join('\n').trim();
  return truncate(query, 1200);
}

function getVectorPreflightStatus_() {
  const apiKey = getScriptProperty('OPENAI_API_KEY');
  const vectorId = getScriptProperty('OPENAI_VECTOR_STORE_ID');
  const reachable = !!apiKey && !!vectorId;
  const missingCredentials = !apiKey || !vectorId;
  return {
    preflight: reachable ? 'ready' : 'blocked',
    missingCredentials: missingCredentials,
    reachable: reachable
  };
}

function addVectorPreflightStatus_(plan, context) {
  if (!plan || !plan.metadata) {
    return;
  }
  const vectorStatus = getVectorPreflightStatus_();
  plan.metadata.vectorStatus = Object.assign({}, plan.metadata.vectorStatus || {}, vectorStatus);
  const healthChecks = ensureArray(plan.metadata.healthChecks);
  if (vectorStatus.preflight === 'blocked') {
    healthChecks.push({
      key: 'vectorPreflight',
      status: 'blocked',
      severity: 'error',
      missingCredentials: vectorStatus.missingCredentials,
      reason: 'Vector credentials missing'
    });
    plan.metadata.healthChecks = healthChecks;
    const diagEntry = {
      entryId: '',
      type: 'preflight',
      statusCode: 401,
      message: 'Vector credentials missing; preflight blocked',
      hitCount: 0,
      query: ''
    };
    plan.vectorDiagnostics = ensureArray(plan.vectorDiagnostics || []);
    plan.vectorDiagnostics.push(diagEntry);
    plan.vectorDiagnosticsEnabled = plan.vectorDiagnosticsEnabled !== false;
    if (context) {
      context.vectorSearchDiagnostics = ensureArray(context.vectorSearchDiagnostics || []);
      context.vectorSearchDiagnostics.push(diagEntry);
      context.vectorSearchDiagnosticsEnabled = context.vectorSearchDiagnosticsEnabled !== false;
    }
  } else {
    plan.metadata.healthChecks = healthChecks;
  }
}

function listCatalogItems(request) {
  try {
    if (typeof getAllItems !== 'function') {
      return { ok: false, error: 'Catalog not initialized.' };
    }
    const options = request || {};
    const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 200);
    const offset = Math.max(Number(options.offset) || 0, 0);
    const query = (options.query || '').toString().trim().toLowerCase();
    const items = getAllItems();
    let filtered = items;
    if (query) {
      filtered = items.filter(function(item) {
        if (!item) {
          return false;
        }
        const haystack = [
          item.itemCode,
          item.name,
          item.description,
          item.category,
          item.itemType
        ].map(function(value) {
          return value ? value.toString().toLowerCase() : '';
        });
        return haystack.some(function(text) {
          return text && text.indexOf(query) !== -1;
        });
      });
    }
    filtered.sort(function(a, b) {
      const left = (a && a.itemCode) ? a.itemCode : '';
      const right = (b && b.itemCode) ? b.itemCode : '';
      return left.localeCompare(right);
    });
    const slice = filtered.slice(offset, offset + limit);
    const safeSlice = slice.map(function(item) {
      return {
        itemCode: item && item.itemCode ? item.itemCode : '',
        name: item && item.name ? item.name : '',
        description: item && item.description ? item.description : '',
        sellPrice: item && isFinite(item.sellPrice) ? Number(item.sellPrice) : null,
        unit: item && item.unit ? item.unit : '',
        itemType: item && item.itemType ? item.itemType : '',
        active: item ? item.active !== false : false
      };
    });
    const nextOffset = offset + slice.length < filtered.length ? offset + slice.length : null;
    return {
      ok: true,
      items: safeSlice,
      total: filtered.length,
      nextOffset: nextOffset
    };
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'listCatalogItems error', String(error)); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_AISIDEBAR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
    return { ok: false, error: String(error) };
  }
}

function extractCatalogUnitRate(catalogItem) {
  if (!catalogItem || typeof catalogItem !== 'object') {
    return null;
  }
  const candidateKeys = [
    'unitRate',
    'defaultUnitAmountAED',
    'dayRateAED',
    'hourRateAED',
    'sellPrice',
    'salesUnitPrice',
    'defaultUnitAmount',
    'defaultUnitPrice',
    'price',
    'listPrice'
  ];
  for (let i = 0; i < candidateKeys.length; i++) {
    const key = candidateKeys[i];
    if (!Object.prototype.hasOwnProperty.call(catalogItem, key)) {
      continue;
    }
    const value = coerceCatalogNumber(catalogItem[key]);
    if (value !== null) {
      return {
        value: value,
        source: 'catalog:' + key
      };
    }
  }
  return null;
}

// DELETED: inferScopeArchetype() function (2026-01-18, Plan 12-06)
// Was 158 lines of hardcoded keyword matching for archetype inference
// Archetype was ONLY used by:
//   1. Bundle map (Plan 12-03) - uses {canonical}/{archetype} keys - DELETED
//   2. SKU_QUANTITY_FALLBACKS (Plan 12-05) - uses archetype to pick function - DELETED
// Both systems removed, so archetype layer is no longer needed
// LLM now uses Config: Scope Phases (synonymsCSV, keywords, purpose) for work type classification

// DELETED: keywordMatch() helper function (2026-01-18, Plan 12-06)
// Was only used by inferScopeArchetype() - no longer needed

function buildSectionNarrative(entry) {
  if (!entry) {
    return '';
  }
  const parts = [];
  if (entry.label) {
    parts.push(entry.label);
  } else if (entry.scopeLabel) {
    parts.push(entry.scopeLabel);
  }
  if (Array.isArray(entry.scenarioHighlights) && entry.scenarioHighlights.length) {
    parts.push(entry.scenarioHighlights.slice(0, 2).join('; '));
  }
  if (entry.usageSummary && entry.usageSummary.durationMonths) {
    const region = entry.usageSummary.region ? ' in ' + entry.usageSummary.region : '';
    parts.push(entry.usageSummary.durationMonths + ' month usage' + region);
  }
  if ((!parts.length || parts.length === 1) && Array.isArray(entry.deliverables) && entry.deliverables.length) {
    parts.push(entry.deliverables.slice(0, 2).join('; '));
  }
  if (!parts.length && Array.isArray(entry.scenarioNotes) && entry.scenarioNotes.length) {
    parts.push(entry.scenarioNotes[0]);
  }
  const narrative = parts.filter(Boolean).join(' — ');
  return narrative || ('Scope coverage for ' + (entry.label || entry.scopeLabel || entry.canonical || 'scope entry'));
}

function hydrateScopeContracts(draft, sourceText, timeline) {
  if (!draft || typeof draft !== 'object') {
    return { draft: draft, contract: null };
  }
  if (sourceText && !draft.sourceSummary) {
    draft.sourceSummary = truncate(String(sourceText), 900);
  }
  const normalizedBriefType = draft.briefType ? String(draft.briefType).trim() : '';
  const normalizedCategoryId = draft.categoryId ? String(draft.categoryId).trim() : '';
  const resolvedBriefType = normalizedBriefType || normalizedCategoryId;
  if (resolvedBriefType) {
    draft.briefType = resolvedBriefType;
  }
  if (normalizedCategoryId) {
    draft.categoryId = normalizedCategoryId;
  } else if (resolvedBriefType) {
    draft.categoryId = resolvedBriefType;
  }
  try {
    const contract = buildScopeMapFromDraft(draft, timeline);
    draft.scopeEntries = contract.entries;
    const existingContracts = draft.scopeContracts && typeof draft.scopeContracts === 'object'
      ? Object.assign({}, draft.scopeContracts)
      : {};
    if (!existingContracts.snapshotId && draft.snapshotId) {
      existingContracts.snapshotId = draft.snapshotId;
    }
    if (!existingContracts.snapshotLabel && draft.snapshotLabel) {
      existingContracts.snapshotLabel = draft.snapshotLabel;
    }
    draft.scopeContracts = Object.assign({}, existingContracts, {
      version: contract.version,
      hash: contract.contractHash
    });
    draft.scopeAudit = Array.isArray(draft.scopeAudit) ? draft.scopeAudit : [];
    draft.scopeAudit.push({
      action: 'contract.build',
      at: new Date().toISOString(),
      hash: contract.contractHash,
      entries: contract.entries.length
    });
    return { draft: draft, contract: contract };
  } catch (error) {
    if (error instanceof AppError && error.code === 'SCOPE_CONTRACT') {
      throw new AIUserError('SCOPE_CONTRACT', 'Scope contract hash mismatch detected. Re-approve the scope draft before generating a quote.', 'Open the Scope Console, re-approve the draft, then retry generation.', error.details || {});
    }
    throw error;
  }
}

// DELETED OLD SCHEMA FUNCTION: synthesizeScopeEntriesFromDraft (was lines 3959-3971)
// This function converted OLD nested schema (draft.sections) to scopeEntries
// NEW schema uses flat scopeEntries array directly from LLM - no conversion needed

// DELETED OLD SCHEMA FUNCTION: buildScopeEntriesFromSections (was lines 3973-4150)
// This function processed OLD nested schema (sections with items arrays)
// Deleted because line 4082 copied section.interpretation to line items, causing bug
// NEW schema uses normalizeScopeDraftToFinalStructure instead (processes flat scopeEntries array)

function normalizeScopeDraftToFinalStructure(simpleDraft) {
  const simpleEntries = Array.isArray(simpleDraft.scopeEntries) ? simpleDraft.scopeEntries : [];
  if (!simpleEntries.length) {
    throw new AppError('SCOPE_SCHEMA', 'No scope entries provided by LLM');
  }

  const finalEntries = [];
  const usedIds = new Set();
  let currentSection = null;
  let sectionLineItemCount = 0;

  simpleEntries.forEach(function(simple, index) {
    const isSection = Boolean(simple.isSection);
    const canonical = String(simple.canonical || '');
    const label = truncate(String(simple.label || 'Untitled ' + (index + 1)), 120);

    // DIAGNOSTIC: Log first 5 entries to verify LLM labels
    if (index < 5) {
      try {
        UnifiedLogger.info('[NORMALIZE-DIAGNOSTIC]', {
          index: index,
          isSection: isSection,
          canonical: canonical,
          label: label,
          rawLabel: simple.label,
          deliverables: Array.isArray(simple.deliverables) ? simple.deliverables.length : 0
        });
      } catch (logErr) { /* ignore */ }
    }

    // Generate unique ID
    let id;
    if (isSection) {
      // Section ID: use canonical or slugified label
      id = canonical || slugify(label);
      currentSection = {
        id: id,
        canonical: canonical,
        childIds: [],
        entry: null
      };
      sectionLineItemCount = 0;
    } else {
      // Line item ID: {sectionId}-line-{count}
      if (!currentSection) {
        // No section defined yet, create default section
        const defaultId = 'default-section';
        currentSection = {
          id: defaultId,
          canonical: canonical || 'discovery-strategic-alignment',
          childIds: [],
          entry: null
        };
        // Insert default section entry
        const defaultSection = createEmptyScopeEntry();
        defaultSection.id = defaultId;
        defaultSection.sectionId = defaultId;
        defaultSection.scopeLabel = 'Default Section';
        defaultSection.isSection = true;
        defaultSection.canonical = currentSection.canonical;
        defaultSection.visibility = 'Client';
        defaultSection.approvalStatus = 'pending';
        defaultSection.sourceExcerpt = buildScopeEntryExcerptFromDraft(simpleDraft);
        defaultSection.interpretation = buildScopeEntryInterpretationFromDraft(simpleDraft);
        defaultSection.parentId = '';
        defaultSection.childIds = [];
        defaultSection.metadata = {
          parentScopeId: '',
          sectionParentId: '',
          vectorDetailParent: '',
          isSectionChild: false,
          detailSource: 'auto-generated',
          phaseRecovered: ''
        };
        currentSection.entry = defaultSection;
        finalEntries.push(defaultSection);
        usedIds.add(defaultId);
      }
      sectionLineItemCount++;
      id = currentSection.id + '-line-' + sectionLineItemCount;
    }

    // Ensure ID uniqueness
    let uniqueId = id;
    let suffix = 1;
    while (usedIds.has(uniqueId)) {
      suffix++;
      uniqueId = id + '_' + suffix;
    }
    usedIds.add(uniqueId);

    // Build final entry with all 22 fields
    const finalEntry = createEmptyScopeEntry();

    // IDs and relationships
    finalEntry.id = uniqueId;
    finalEntry.sectionId = isSection ? uniqueId : currentSection.id;
    finalEntry.parentId = isSection ? '' : currentSection.id;
    finalEntry.childIds = isSection ? [] : [];
    finalEntry.isSection = isSection;

    // Content from LLM (8 simple fields)
    finalEntry.scopeLabel = label;
    finalEntry.displayName = label;
    finalEntry.canonical = canonical;
    finalEntry.sourceExcerpt = truncate(String(simple.sourceExcerpt || ''), 120);
    finalEntry.interpretation = truncate(String(simple.label || ''), 120);
    finalEntry.deliverables = selectNonEmptyStrings(simple.deliverables, 10);
    finalEntry.notes = selectNonEmptyStrings(simple.notes, 8);
    finalEntry.signals = selectNonEmptyStrings(simple.signals, 6);

    // Normalize resources (string or array → array of objects)
    finalEntry.resources = normalizeResources(simple.resources);

    // Defaults for fields LLM doesn't provide (14 additional fields)
    finalEntry.visibility = 'Client';
    finalEntry.approvalStatus = 'pending';
    finalEntry.contingency = null;
    finalEntry.quantitySignals = [];
    finalEntry.scenarioHighlights = [];
    finalEntry.usageSummary = { durationMonths: null, region: null, notes: [] };
    finalEntry.catalogRefs = [];
    finalEntry.resourcePackages = [];

    // Metadata injection (structure differs for sections vs line items)
    finalEntry.metadata = {
      parentScopeId: isSection ? '' : currentSection.id,
      sectionParentId: isSection ? '' : currentSection.id,
      vectorDetailParent: isSection ? '' : currentSection.id,
      isSectionChild: !isSection,
      detailSource: 'llm-normalized',
      phaseRecovered: ''
    };

    // Track section for child ID building
    if (isSection) {
      currentSection.entry = finalEntry;
    } else {
      // Add this line item to section's childIds
      if (currentSection && currentSection.entry) {
        currentSection.entry.childIds.push(uniqueId);
      }
    }

    finalEntries.push(finalEntry);
  });

  // Validate canonical phases and log warnings
  const approvedPhases = getScopePhaseCanonicals(simpleDraft.briefType);
  if (approvedPhases && approvedPhases.length) {
    finalEntries.forEach(function(entry) {
      if (entry.canonical && approvedPhases.indexOf(entry.canonical) === -1) {
        UnifiedLogger.warn('AISidebar', 'Non-standard canonical phase detected', {
          canonical: entry.canonical,
          label: entry.scopeLabel,
          approvedPhases: approvedPhases
        });
      }
    });
  }

  return {
    projectName: truncate(String(simpleDraft.projectName || ''), 120),
    briefType: simpleDraft.briefType,
    scopeEntries: finalEntries,
    warnings: selectNonEmptyStrings(simpleDraft.warnings, 12),
    questions: selectNonEmptyStrings(simpleDraft.questions, 12),
    assumptions: selectNonEmptyStrings(simpleDraft.assumptions, 12)
  };
}

// DELETED OLD SCHEMA FUNCTION: buildFallbackScopeEntryFromDraft (was lines 4110-4161)
// This function was NEVER CALLED - dead code that created fallback scope entry from draft
// Called buildFallbackResourcesFromDraft and buildFallbackSignalsFromDraft (also deleted as dead code)

// DELETED OLD LINE EXPANSION FUNCTION: applyScopeLineExpansion (was lines 4056-4173, 117 lines)
// Applied line expansion to derive synthetic child entries from section deliverables
// Called deleted functions: deriveScopeDetailLines, buildScopeDetailChildId, buildScopeDetailEntry
// Never called anywhere in codebase - dead code from OLD line expansion system
// NEW schema: LLM returns explicit line items in flat scopeEntries array - no expansion needed

// DELETED OLD LINE EXPANSION FUNCTION: deriveScopeDetailLines (was lines 4233-4304)
// Derived synthetic detail lines from section deliverables/notes/resources/signals
// Part of OLD line expansion logic - NEW schema has explicit line items from LLM

// DELETED OLD LINE EXPANSION FUNCTION: buildScopeDetailChildId (was lines 4306-4324)
// Generated child IDs for synthetic line items derived from section details
// Part of OLD line expansion logic - NEW schema has explicit IDs from LLM

// DELETED OLD LINE EXPANSION FUNCTION: buildScopeDetailEntry (was lines 4326-4365, remainder lines 4187-4208)
// Built synthetic child entry from parent section and detail line
// Part of OLD line expansion logic - NEW schema has explicit entries from LLM

function buildScopeEntryExcerptFromDraft(draft) {
  if (!draft || typeof draft !== 'object') {
    return 'Scope summary auto-generated from the brief.';
  }
  if (draft.sourceSummary && String(draft.sourceSummary).trim()) {
    return truncate(String(draft.sourceSummary).trim(), 600);
  }
  const parts = [];
  const deliverables = selectNonEmptyStrings(draft.deliverables, 4);
  if (deliverables.length) {
    parts.push('Deliverables: ' + deliverables.join(', '));
  }
  const services = selectNonEmptyStrings(draft.services, 4);
  if (services.length) {
    parts.push('Services: ' + services.join(', '));
  }
  const assumptions = selectNonEmptyStrings(draft.assumptions, 2);
  if (assumptions.length) {
    parts.push('Assumptions: ' + assumptions.join('; '));
  }
  if (draft.schedule && draft.schedule.notes) {
    parts.push('Schedule: ' + truncate(String(draft.schedule.notes).trim(), 120));
  }
  return truncate(parts.length ? parts.join(' | ') : 'Scope summary auto-generated from the brief.', 600);
}

function buildScopeEntryInterpretationFromDraft(draft) {
  if (!draft || typeof draft !== 'object') {
    return 'Auto-generated scope interpretation pending mapper review.';
  }
  const parts = [];
  const services = selectNonEmptyStrings(draft.services, 5);
  if (services.length) {
    parts.push('Services: ' + services.join(', '));
  }
  const deliverables = selectNonEmptyStrings(draft.deliverables, 5);
  if (deliverables.length) {
    parts.push('Deliverables: ' + deliverables.join(', '));
  }
  if (draft.talent && draft.talent.count) {
    parts.push('Talent: ' + draft.talent.count);
  }
  if (draft.talent && draft.talent.notes) {
    parts.push('Talent Notes: ' + truncate(String(draft.talent.notes).trim(), 120));
  }
  if (draft.usage && draft.usage.durationMonths) {
    parts.push('Usage: ' + draft.usage.durationMonths + ' months');
  }
  if (draft.usage && draft.usage.region) {
    parts.push('Usage Region: ' + String(draft.usage.region).trim());
  }
  const campaigns = selectNonEmptyStrings(draft.campaigns, 3);
  if (campaigns.length) {
    parts.push('Campaigns: ' + campaigns.join(', '));
  }
  const retainers = selectNonEmptyStrings(draft.retainers, 3);
  if (retainers.length) {
    parts.push('Retainers: ' + retainers.join(', '));
  }
  const warnings = selectNonEmptyStrings(draft.warnings, 2);
  if (warnings.length) {
    parts.push('Risks: ' + warnings.join('; '));
  }
  return truncate(parts.length ? parts.join(' | ') : 'Auto-generated scope interpretation pending mapper review.', 600);
}

// DELETED OLD SCHEMA FUNCTION: buildFallbackResourcesFromDraft (was lines 4481-4520)
// Only called by deleted buildFallbackScopeEntryFromDraft function - dead code

// DELETED OLD SCHEMA FUNCTION: buildFallbackSignalsFromDraft (was lines 4522-4555)
// Only called by deleted buildFallbackScopeEntryFromDraft function - dead code

// DELETED OLD SCHEMA FUNCTION: buildSectionsFromScopeEntries (was lines 4757-4792)
// This function converted NEW schema (flat scopeEntries) back to OLD schema (nested sections)
// Was called by coerceLLMResponseStructure line 1331 to create draft.sections from scopeEntries
// Deletion removes the NEW → OLD conversion that triggered OLD → NEW reconversion corrupting data

// DELETED OLD SCHEMA HELPER FUNCTIONS (was lines 4562-4584)
// buildSynthesizedResources - Only used by deleted buildScopeEntriesFromSections function
// ensureUniqueScopeId - Only used by deleted buildScopeEntriesFromSections function
// These were part of OLD nested schema processing - no longer needed

function buildQuantityMapFromScope(approvedScope, plan) {
  const map = {
    talentCount: 0,
    shootDays: 0,
    usageDurationMonths: 0,
    usageRegion: '',
    deliverables: {},
    deliverablesUsed: {},
    services: {},
    servicesUsed: {},
    retainers: Array.isArray(approvedScope && approvedScope.retainers) ? approvedScope.retainers.length : 0,
    campaigns: Array.isArray(approvedScope && approvedScope.campaigns) ? approvedScope.campaigns.length : 0,
    metrics: Array.isArray(approvedScope && approvedScope.reporting && approvedScope.reporting.metrics) ? approvedScope.reporting.metrics : []
  };

  if (!approvedScope) {
    return map;
  }

  map.talentCount = approvedScope.talent && approvedScope.talent.count ? parseInt(approvedScope.talent.count, 10) || 0 : 0;
  map.shootDays = approvedScope.shootDays ? parseFloat(approvedScope.shootDays) || 0 : 0;
  map.usageDurationMonths = approvedScope.usage && approvedScope.usage.durationMonths ? parseInt(approvedScope.usage.durationMonths, 10) || 0 : 0;
  map.usageRegion = approvedScope.usage && approvedScope.usage.region ? approvedScope.usage.region : '';

  const recordDeliverable = (key, count) => {
    if (!key) return;
    const normalizedKey = key.toLowerCase();
    map.deliverables[normalizedKey] = Math.max(map.deliverables[normalizedKey] || 0, count);
  };

  const extractNumbers = (text) => {
    const matches = (text || '').match(/(\d+[\d,\.]*)/g);
    if (!matches) return [];
    return matches.map(token => parseFloat(token.replace(/,/g, ''))).filter(value => !isNaN(value));
  };

  const deliverables = Array.isArray(approvedScope.deliverables) ? approvedScope.deliverables : [];
  deliverables.forEach(entry => {
    const lower = entry.toLowerCase();
    const numbers = extractNumbers(entry);
    const qty = numbers.length > 0 ? numbers[0] : 0;
    if (/photo|image/.test(lower) && qty) {
      recordDeliverable('photos', qty);
    } else if (/video/.test(lower) && qty) {
      recordDeliverable('videos', qty);
    } else if (/post|content/.test(lower) && qty) {
      recordDeliverable('posts', qty);
    } else if (qty) {
      recordDeliverable(lower, qty);
    }
  });

  const services = Array.isArray(approvedScope.services) ? approvedScope.services : [];
  services.forEach(entry => {
    const lower = (entry && entry.name ? entry.name : entry).toLowerCase();
    const numbers = extractNumbers(entry && entry.name ? entry.name : entry);
    if (/retainer|monthly|ongoing/.test(lower)) {
      map.services.retainer = Math.max(map.services.retainer || 0, numbers[0] || 1);
    }
    if (/campaign/.test(lower)) {
      map.services.campaign = Math.max(map.services.campaign || 0, numbers[0] || 1);
    }
  });

  return map;
}

function determineQuantityForItem(item, sku, sectionName, quantityMap, assignments) {
  if (!quantityMap) {
    return toNumber(item.qty, 0) || 1;
  }

  const name = (item.description || item.clientLineName || item.displayName || '').toLowerCase();
  const sectionLower = (sectionName || '').toLowerCase();
  const skuLower = (sku || '').toLowerCase();

  const recordAssignment = (qty, reason) => {
    if (!assignments || qty === undefined) return;
    assignments.push({
      sku: sku || '(unknown)',
      description: item.description || item.clientLineName || '(unknown)',
      quantity: qty,
      reason: reason
    });
  };

  const isTalentRelated = /(talent|model|casting|wardrobe|hair|makeup|stylist|hmua)/.test(name) || /^tal-/.test(skuLower);
  const isUsageRelated = /(usage|rights|license|licence)/.test(name) || /^rgt-/.test(skuLower);

  if (quantityMap.talentCount && (isTalentRelated || isUsageRelated)) {
    recordAssignment(quantityMap.talentCount, isUsageRelated ? 'usage-per-talent' : 'talentCount');
    return quantityMap.talentCount;
  }

  if (quantityMap.shootDays) {
    if (/studio|stage|shoot/.test(name) || /^flm-/.test(skuLower)) {
      const packageDays = extractPackageDays(item.description || item.clientLineName || '');
      const qty = packageDays > 0 ? Math.ceil(quantityMap.shootDays / packageDays) : quantityMap.shootDays;
      recordAssignment(qty, 'shootDays');
      return qty;
    }
    if (/equipment|lighting|gear/.test(name) || /^eqp-/.test(skuLower)) {
      const qty = Math.max(1, Math.ceil(quantityMap.shootDays));
      recordAssignment(qty, 'shootDays');
      return qty;
    }
  }

  const deliverableMatches = Object.keys(quantityMap.deliverables || {}).filter(key => name.indexOf(key) !== -1 || sectionLower.indexOf(key) !== -1);
  if (deliverableMatches.length > 0) {
    const key = deliverableMatches[0];
    const qty = quantityMap.deliverables[key];
    if (quantityMap.deliverablesUsed) {
      quantityMap.deliverablesUsed[key] = true;
    }
    recordAssignment(qty, 'deliverable:' + key);
    return qty;
  }

  if ((/retainer|monthly|ongoing/.test(name) || /retainer/.test(sectionLower)) && quantityMap.services.retainer) {
    if (quantityMap.servicesUsed) {
      quantityMap.servicesUsed.retainer = true;
    }
    recordAssignment(quantityMap.services.retainer, 'services:retainer');
    return quantityMap.services.retainer;
  }

  if ((/campaign/.test(name) || /campaign/.test(sectionLower)) && quantityMap.services.campaign) {
    if (quantityMap.servicesUsed) {
      quantityMap.servicesUsed.campaign = true;
    }
    recordAssignment(quantityMap.services.campaign, 'services:campaign');
    return quantityMap.services.campaign;
  }

  if (/retainer/.test(name) && quantityMap.retainers) {
    recordAssignment(quantityMap.retainers, 'approvedRetainers');
    return quantityMap.retainers;
  }

  if (/campaign/.test(name) && quantityMap.campaigns) {
    recordAssignment(quantityMap.campaigns, 'approvedCampaigns');
    return quantityMap.campaigns;
  }

  const fallback = toNumber(item.qty, 0);
  if (fallback && fallback > 0) {
    return fallback;
  }

  recordAssignment(1, 'default');
  return 1;
}

function deriveBulletUnitLabel(item) {
  const type = (item && item.itemType ? String(item.itemType) : '').toLowerCase();
  if (type === 'crew' || type === 'resource') {
    return 'Day';
  }
  if (type === 'scope') {
    return 'Unit';
  }
  const fallback = item && item.unit ? String(item.unit).trim() : '';
  return fallback || 'Unit';
}

function enforceApprovedScope(plan, approvedScope) {
  if (!plan || !approvedScope) {
    return;
  }

  plan.metadata = plan.metadata || {};
  const scopeMap = plan.metadata.scopeMap || buildScopeMapFromDraft(approvedScope);
  plan.metadata.scopeMap = scopeMap;
  plan.metadata.scopeContractHash = scopeMap.contractHash;
  const requiredCategories = Array.from(inferCategorySignals(approvedScope));
  plan.metadata.requiredCategories = requiredCategories;
  plan.metadata.approvedScope = approvedScope;
  plan.metadata.quantities = buildQuantityMapFromScope(approvedScope, plan);
  plan.metadata.scopeAssignments = [];

  const scopeEntryIndex = new Map();
  scopeMap.entries.forEach(entry => scopeEntryIndex.set(entry.id, entry));
  const enrichedEntries = Array.isArray(plan.metadata.contractEntries) ? plan.metadata.contractEntries : [];
  const enrichedIndex = new Map();
  enrichedEntries.forEach(function(entry) {
    if (entry && entry.id) {
      enrichedIndex.set(entry.id, entry);
    }
  });

  plan.projectName = plan.projectName || approvedScope.projectName || '';
  plan.clientName = plan.clientName || approvedScope.clientName || '';

  if (!Array.isArray(plan.warnings)) {
    plan.warnings = [];
  }
  if (!Array.isArray(plan.assumptions)) {
    plan.assumptions = [];
  }

  if (!plan.sections || plan.sections.length === 0) {
    const fallbackSections = buildFallbackSectionsFromScope(approvedScope, requiredCategories);
    if (fallbackSections.length > 0) {
      plan.sections = fallbackSections;
      plan.warnings.push('Generated placeholder sections from the approved scope because the AI plan omitted them. Review and adjust before exporting.');
    }
  }

  if (!plan.sections || plan.sections.length === 0) {
    throw new AIUserError('SCOPE_MISSING', 'The plan did not include any sections to cover the approved scope.', 'Adjust the brief or re-run scope extraction with more detail.');
  }

  plan.sections.forEach(section => {
    if (!section || typeof section !== 'object') {
      return;
    }
    const scopeEntryId = ensureScopeEntryLink(section, scopeMap);
    const scopeEntry = scopeEntryIndex.get(scopeEntryId);
    const enrichedEntry = enrichedIndex.get(scopeEntryId);
    section.scopeEntryId = scopeEntryId;
    if (scopeEntry) {
      if (section.visibility && section.visibility !== scopeEntry.visibility) {
        plan.warnings.push(`Section "${section.name || section.scopeEntryId}" visibility adjusted to ${scopeEntry.visibility} to match approved scope.`);
      }
      section.visibility = scopeEntry.visibility;
      plan.metadata.scopeAssignments.push({
        section: section.name || '(unnamed)',
        scopeEntryId: scopeEntryId,
        visibility: scopeEntry.visibility
      });
    }

    if (Array.isArray(section.items)) {
      section.items = section.items.map(item => {
        if (!item || typeof item !== 'object') {
          return item;
        }
        item.scopeEntryId = item.scopeEntryId || item.scopeEntry || item.entryId || scopeEntryId;
        ensureScopeEntryLink({ scopeEntryId: item.scopeEntryId }, scopeMap);
        if (scopeEntry && item.visibility && item.visibility !== scopeEntry.visibility) {
          plan.warnings.push(`Line item "${item.description || item.clientLineName || item.scopeEntryId}" visibility adjusted to ${scopeEntry.visibility} to align with scope entry ${scopeEntryId}.`);
          item.visibility = scopeEntry.visibility;
        }
        return item;
      });
    }

    const normalized = normalizeSectionLabel(section.name);
    section.name = normalized.label;
    section.sectionCanonical = normalized.canonical;
    if (!normalized.canonical) {
      plan.warnings.push(`Section "${section.name || '(unnamed)'}" is not mapped to standard categories; consider updating the brief or catalog.`);
    }
    if (enrichedEntry) {
      if (!section.justification) {
        section.justification = buildSectionNarrative(enrichedEntry);
      }
      if (!section.description) {
        section.description = buildSectionNarrative(enrichedEntry);
      }
    }
  });

  const requiredDeliverables = Array.isArray(approvedScope.deliverables) ? approvedScope.deliverables : [];
  if (requiredDeliverables.length > 0 && plan.sections.length < requiredDeliverables.length) {
    plan.warnings.push('Plan contains fewer sections than approved deliverables. Review deliverable mapping.');
  }

  const approvedTalent = approvedScope.talent && approvedScope.talent.count ? approvedScope.talent.count : 0;
  if (approvedTalent > 0) {
    const inferredTalent = inferTalentCountFromPlan(plan);
    if (inferredTalent < approvedTalent) {
      plan.warnings.push(`Plan references ${inferredTalent} talent count but approved scope requires ${approvedTalent}.`);
    }
  }

  const approvedUsageMonths = approvedScope.usage && approvedScope.usage.durationMonths ? approvedScope.usage.durationMonths : 0;
  if (approvedUsageMonths > 0) {
    const planUsageMonths = plan.usage && plan.usage.durationMonths ? plan.usage.durationMonths : 0;
    if (planUsageMonths > 0 && planUsageMonths < approvedUsageMonths) {
      plan.warnings.push(`Usage duration in plan (${planUsageMonths} months) shorter than approved requirement (${approvedUsageMonths} months).`);
    }
  }

  const approvedRetainers = Array.isArray(approvedScope.retainers) ? approvedScope.retainers.length : 0;
  if (approvedRetainers > 0) {
    const planRetainers = Array.isArray(plan.retainers) ? plan.retainers.length : 0;
    if (planRetainers < approvedRetainers) {
      plan.warnings.push(`Plan includes ${planRetainers} retainers but approved scope requires ${approvedRetainers}.`);
    }
  }

  const approvedCampaigns = Array.isArray(approvedScope.campaigns) ? approvedScope.campaigns.length : 0;
  if (approvedCampaigns > 0) {
    const planCampaigns = Array.isArray(plan.campaigns) ? plan.campaigns.length : 0;
    if (planCampaigns < approvedCampaigns) {
      plan.warnings.push(`Plan includes ${planCampaigns} campaigns but approved scope requires ${approvedCampaigns}.`);
    }
  }

  if (requiredCategories.length > 0 && Array.isArray(plan.sections)) {
    plan.sections.forEach(section => {
      const canonical = section && section.sectionCanonical ? section.sectionCanonical : getCanonicalCategoryFromName(section && section.name);
      if (canonical && requiredCategories.indexOf(canonical) === -1) {
        const label = section && section.name ? section.name : '(unnamed section)';
        plan.warnings.push(`Section "${label}" is outside the approved scope signals and may need review.`);
      }
    });
  }
}



// ================================================================================
// GLOBAL EXPORTS (Backward Compatibility)
// ================================================================================

if (typeof globalThis !== 'undefined') {
}

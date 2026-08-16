/**
 * AISidebar UI Module
 *
 * Responsibilities:
 * - Sidebar display (showAISidebar, showHTML)
 * - HTML generation and templates
 * - User interaction handlers (button clicks, form submissions)
 * - Progress updates and status messages
 * - UI state management (sidebar state sheet operations)
 * - Sheet operations (read/write to AISidebar State, Commercial Fit State)
 * - Quote export functions (populateQuoteBuilderFromPlan, exportQuoteToXero)
 *
 * Dependencies:
 * - 05_AISidebar_Config.js (constants, schemas, config getters)
 * - 05_AISidebar_Phase.js (phase guidance)
 * - 05_AISidebar_Workflow.js (signal processing)
 * - 05_AISidebar_Data.js (normalization, validation)
 * - 05_AISidebar_Processing.js (AI/OpenAI integration, catalog mapping)
 * - UnifiedLogger.js (logging)
 *
 * Entry Points:
 * - showAISidebar() - Main entry point called from Menu.js
 *
 * Load Order: 05_ prefix ensures loading after all dependency modules
 *
 * Extracted from monolithic AISidebar.js (Phase 3 Plan 6 - Final module)
 *
 * NOTE: Configuration moved to 05_AISidebar_Config.js (Plan 03-01)
 * NOTE: Phase management moved to 05_AISidebar_Phase.js (Plan 03-02)
 * NOTE: Workflow processing moved to 05_AISidebar_Workflow.js (Plan 03-03)
 * NOTE: Data utilities moved to 05_AISidebar_Data.js (Plan 03-04)
 * NOTE: AI processing moved to 05_AISidebar_Processing.js (Plan 03-05)
 *
 * Note: Visibility tracking IDs (XERO_VISIBILITY_TRACKING) are managed via Script Properties.
 * The sidebar persists per-line Visibility only; IDs are applied in Xero exporters.
 */

// ================================================================================
// MAIN ENTRY POINT
// ================================================================================

/**
 * Shows the AI Quote Builder sidebar.
 * Main entry point called from Menu.js.
 */
function showAISidebar() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('ui/ai_quote_sidebar')
      .setTitle('AI Quote Assistant')
      .setWidth(680);

    SpreadsheetApp.getUi().showSidebar(html);

    UnifiedLogger.info('AISidebar', 'AI sidebar opened', { timestamp: new Date().toISOString() });
  } catch (error) {
    UnifiedLogger.error('AISidebar', 'Failed to open AI sidebar', { error: String(error) });
    SpreadsheetApp.getUi().alert('Error opening AI sidebar: ' + error.message);
  }
}

// ================================================================================
// TIMELINE AND STATE MANAGEMENT
// ================================================================================

/**
 * Push a structured step entry into a run timeline array.
 * @param {Array<Object>} timeline
 * @param {string} step
 * @param {string} status
 * @param {Object} [meta]
 */
function recordTimelineStep(timeline, step, status, meta) {
  try {
    timeline.push({
      step: step,
      status: status,
      meta: meta || {},
      at: new Date().toISOString()
    });
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'recordTimelineStep failed', String(error)); } catch (ignore) {}
  }
}

const EMPTY_SCOPE_DRAFT = Object.freeze({
  projectName: '',
  clientName: '',
  mediaType: '',
  shootDays: 0,
  deliverables: [],
  locations: [],
  talent: {
    count: 0,
    requirements: [],
    notes: ''
  },
  crew: {
    requirements: [],
    notes: ''
  },
  equipment: {
    requirements: [],
    notes: ''
  },
  services: [],
  retainers: [],
  campaigns: [],
  channels: [],
  usage: {
    durationMonths: 0,
    region: '',
    notes: ''
  },
  budget: {
    target: null,
    currency: '',
    notes: ''
  },
  schedule: {
    keyDates: [],
    notes: ''
  },
  reporting: {
    cadence: '',
    metrics: [],
    notes: ''
  },
  assumptions: [],
  warnings: [],
  questions: [],
  requiredQuestions: [],
  requiredAnswers: {},
  scopeEntries: [],
  scopeContracts: {
    version: '',
    hash: ''
  },
  scopeAudit: [],
  sourceSummary: ''
});

function createEmptyScopeDraft() {
  return deepClone(EMPTY_SCOPE_DRAFT);
}

function normalizeSidebarDraftState(rawState) {
  const baseState = rawState && typeof rawState === 'object'
    ? rawState
    : {};
  let draftSource = baseState && baseState.draft && typeof baseState.draft === 'object'
    ? baseState.draft
    : baseState;
  if (!draftSource || typeof draftSource !== 'object' || Object.keys(draftSource).length === 0) {
    draftSource = createEmptyScopeDraft();
  }
  let sanitizedDraft;
  try {
    sanitizedDraft = coerceLLMResponseStructure({ mode: 'scope-draft' }, deepClone(draftSource));
  } catch (error) {
    try {
      sanitizedDraft = coerceLLMResponseStructure({ mode: 'scope-draft' }, draftSource);
    } catch (fallbackError) {
      try { UnifiedLogger.warn('AISidebar', 'normalizeSidebarDraftState failed to sanitize draft', String(fallbackError)); } catch (ignore) {}
      sanitizedDraft = coerceLLMResponseStructure({ mode: 'scope-draft' }, createEmptyScopeDraft());
    }
  }
  const normalized = {
    draft: sanitizedDraft
  };
  const derivedBriefType = baseState.briefType || (draftSource && draftSource.briefType);
  normalized.briefType = derivedBriefType
    ? String(derivedBriefType).trim() || BRIEF_TYPE_DEFAULT
    : BRIEF_TYPE_DEFAULT;
  sanitizedDraft.briefType = normalized.briefType;
  const normalizedCategoryId = sanitizedDraft.categoryId
    ? String(sanitizedDraft.categoryId).trim()
    : '';
  sanitizedDraft.categoryId = normalizedCategoryId || normalized.briefType;
  normalized.categoryId = sanitizedDraft.categoryId;
  if (baseState.briefText !== undefined && baseState.briefText !== null) {
    normalized.briefText = truncate(String(baseState.briefText), 4000);
  }
  normalized.mapperNotes = baseState.mapperNotes !== undefined && baseState.mapperNotes !== null
    ? truncate(String(baseState.mapperNotes), 4000)
    : '';
  normalized.commercialNotes = baseState.commercialNotes !== undefined && baseState.commercialNotes !== null
    ? truncate(String(baseState.commercialNotes), 4000)
    : '';
  normalized.quoteNotes = baseState.quoteNotes !== undefined && baseState.quoteNotes !== null
    ? truncate(String(baseState.quoteNotes), 4000)
    : '';
  normalized.commercialFitSnapshotId = baseState.commercialFitSnapshotId !== undefined && baseState.commercialFitSnapshotId !== null
    ? String(baseState.commercialFitSnapshotId).trim()
    : '';
  normalized.commercialFitApproved = baseState.commercialFitApproved === true;
  const normalizeFileDescriptor = function(file) {
    if (!file) {
      return null;
    }
    const id = String(file.id || file.fileId || '').trim();
    if (!id) {
      return null;
    }
    const nameValue = file.name !== undefined && file.name !== null
      ? truncate(String(file.name), 160)
      : '';
    return {
      id: id,
      name: nameValue
    };
  };
  if (Array.isArray(baseState.files)) {
    normalized.files = filterTruthy(baseState.files.map(normalizeFileDescriptor))
      .slice(0, AI_MAX_PDF_FILES);
  } else if (Array.isArray(baseState.fileIds)) {
    normalized.files = filterTruthy(baseState.fileIds.map(function(id) {
        id = String(id || '').trim();
        if (!id) {
          return null;
        }
        return {
          id: id,
          name: ''
        };
      }))
      .slice(0, AI_MAX_PDF_FILES);
  } else {
    normalized.files = [];
  }
  return normalized;
}

function createEmptyScopeEntry() {
  const user = getActiveUserEmailSafe ? getActiveUserEmailSafe() : 'UNKNOWN_USER';
  const timestamp = new Date().toISOString();
  return {
    id: '',
    sectionId: '',
    scopeLabel: '',
    visibility: VISIBILITY.CLIENT,
    sourceExcerpt: '',
    interpretation: '',
    approvalStatus: 'pending',
    deliverables: [],
    resources: [],
    contingency: {
      type: '',
      amount: 0
    },
    notes: [],
    signals: [],
    metadata: {
      createdAt: timestamp,
      createdBy: user,
      updatedAt: timestamp,
      updatedBy: user
    }
  };
}

/**
 * Refactored 2026-01-10: Single-pass normalization (CONTRACT_20260110_190200 Phase 3)
 * Pattern from App-script/AISidebar.js:2688 (scope entry generation)
 *
 * Converts simple 8-field LLM output to complete 22-field structure in one pass.
 * Replaces complex 5-function transformation pipeline with single normalization function.
 *
 * @param {Object} simpleDraft - Draft with scopeEntries containing 8-field simple entries
 * @return {Object} - Draft with scopeEntries containing complete 22-field entries
 */
/**
 * Helper: Normalize resources from string/array to array of resource objects
 * Pattern from App-script/AISidebar.js:2769 (resource synthesis)
 */
// DELETED OLD SCHEMA FUNCTION: generatePreviewFromDraft (was lines 280-329)
// DEPRECATED 2026-01-10 - Part of OLD 5-stage transformation pipeline
// NEVER CALLED - dead code kept for "backward compatibility" but nothing uses it
// OLD flow: LLM nested → buildScopeEntriesFromSections → transforms
// NEW flow: LLM flat → normalizeScopeDraftToFinalStructure → done

function logScopeEntrySummary(stage, entries) {
  try {
    const list = Array.isArray(entries) ? entries : [];
    const count = list.length;
    const sample = list.slice(0, 6).map(formatEntryForLog).join(' ; ');
    const truncatedSample = truncateForLog(sample || '<no sample>');
    UnifiedLogger.info('AISidebar', '[ScopeAudit][' + stage + '] count=' + count + '; sample=' + truncatedSample);
  } catch (ignore) {}
}

// DELETED OLD LINE EXPANSION FUNCTIONS (was lines 297-352):
// - shouldExpandScopeLines() - Feature flag check for line expansion
// - setScopeLineExpansionFlag() - Set line expansion property
// - enableScopeLineExpansion() - Enable line expansion
// - disableScopeLineExpansion() - Disable line expansion
// All related to deleted applyScopeLineExpansion system - no longer needed
// NEW schema: LLM returns explicit line items in flat scopeEntries array

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function extractLatestApprovedScopeFromState(sidebarState) {
  if (!sidebarState || !Array.isArray(sidebarState.snapshots) || sidebarState.snapshots.length === 0) {
    return null;
  }
  const snapshots = sidebarState.snapshots;
  const activeSnapshot = snapshots.find(function(entry) {
    return entry && entry.isActive;
  }) || snapshots[0];
  if (!activeSnapshot) {
    return null;
  }
  const draft = activeSnapshot.draft || (activeSnapshot.payload && activeSnapshot.payload.draft);
  if (!draft) {
    return null;
  }
  let enriched;
  try {
    enriched = deepClone(draft);
  } catch (error) {
    if (draft && typeof draft === 'object') {
      enriched = Object.assign({}, draft);
    } else {
      return draft;
    }
  }
  if (enriched && typeof enriched === 'object') {
    const snapshotId = activeSnapshot.id || enriched.snapshotId || '';
    if (snapshotId) {
      enriched.snapshotId = snapshotId;
    }
    if (!enriched.snapshotLabel && activeSnapshot.label) {
      enriched.snapshotLabel = activeSnapshot.label;
    }
    const scopedContracts = enriched.scopeContracts && typeof enriched.scopeContracts === 'object'
      ? Object.assign({}, enriched.scopeContracts)
      : {};
    if (!scopedContracts.hash && activeSnapshot.contractHash) {
      scopedContracts.hash = activeSnapshot.contractHash;
    }
    if (!scopedContracts.version && activeSnapshot.contractVersion) {
      scopedContracts.version = activeSnapshot.contractVersion;
    }
    if (!scopedContracts.snapshotId && snapshotId) {
      scopedContracts.snapshotId = snapshotId;
    }
    if (!scopedContracts.snapshotLabel && enriched.snapshotLabel) {
      scopedContracts.snapshotLabel = enriched.snapshotLabel;
    }
    enriched.scopeContracts = scopedContracts;
    if (!enriched.scopeHierarchy && activeSnapshot.scopeHierarchy) {
      try {
        enriched.scopeHierarchy = deepClone(activeSnapshot.scopeHierarchy);
      } catch (ignored) {
        enriched.scopeHierarchy = activeSnapshot.scopeHierarchy;
      }
    }
  }
  logScopeEntrySummary('ApprovedScopeEntries', enriched && Array.isArray(enriched.scopeEntries) ? enriched.scopeEntries : []);
  return enriched;
}

// Retry function for rebuildCommercialFitSnapshot
function ensureCommercialFitStateSchema_(sheet) {
  if (!sheet) {
    return;
  }
  const headers = COMMERCIAL_FIT_HEADERS;
  const maxColumns = sheet.getMaxColumns();
  if (maxColumns < headers.length) {
    sheet.insertColumns(maxColumns + 1, headers.length - maxColumns);
  }
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const currentHeaders = headerRange.getValues()[0];
  let needsRewrite = currentHeaders.length !== headers.length;
  if (!needsRewrite) {
    for (let i = 0; i < headers.length; i++) {
      if (currentHeaders[i] !== headers[i]) {
        needsRewrite = true;
        break;
      }
    }
  }
  if (needsRewrite) {
    headerRange.setValues([headers]);
  }
}

function compressAndEncode_(text) {
  if (!text) {
    return '';
  }
  try {
    const blob = Utilities.newBlob(text);
    const zipped = Utilities.gzip(blob);
    const base64 = Utilities.base64Encode(zipped.getBytes());
    return 'GZIP:' + base64;
  } catch (e) {
    try { UnifiedLogger.warn('AISidebar', 'Compression failed', String(e)); } catch (ignore) {}
    return text;
  }
}

function decodeAndDecompress_(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  if (text.indexOf('GZIP:') !== 0) {
    return text;
  }
  try {
    const base64 = text.substring(5);
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, 'application/x-gzip');
    const unzipped = Utilities.ungzip(blob);
    return unzipped.getDataAsString();
  } catch (e) {
    try { UnifiedLogger.warn('AISidebar', 'Decompression failed', String(e)); } catch (ignore) {}
    return text;
  }
}

function safeJsonCell_(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value || null);
  if (json.length > 49000) {
    const compressed = compressAndEncode_(json);
    if (compressed.length <= 49000) {
      return sanitizeSheetText(compressed);
    }
    return sanitizeSheetText(JSON.stringify({ truncated: true, reason: 'SIZE_LIMIT_EXCEEDED' }));
  }
  return sanitizeSheetText(json);
}

/**
 * Helper function to get the commercial fit state sheet
 * Consolidates duplicate code that appears 10 times in the file
 * @returns {{sheet: Sheet, error: string|null}}
 */
function getCommercialFitStateSheet() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) {
    return { sheet: null, error: 'NO_SPREADSHEET' };
  }
  const sheet = ss.getSheetByName('_COMMERCIAL_FIT_STATE');
  if (!sheet) {
    return { sheet: null, error: 'STATE_NOT_FOUND' };
  }
  return { sheet: sheet, error: null };
}

/**
 * Get commercial fit state sheet with full validation and data
 * Consolidates 12-line pattern that appears 4+ times
 * @returns {Object} Result with sheet, headers, data range, or error
 */
function getValidatedCommercialFitData() {
  const sheetResult = getCommercialFitStateSheet();
  if (sheetResult.error) {
    return { ok: false, error: sheetResult.error };
  }
  const sheet = sheetResult.sheet;
  const { lastRow, lastColumn } = validateSheetAndGetDimensions(sheet);
  if (lastRow <= 1 || lastColumn === 0) {
    return { ok: false, error: 'STATE_EMPTY' };
  }
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
  return {
    ok: true,
    sheet: sheet,
    headers: headers,
    dataRange: dataRange,
    rows: dataRange.getValues(),
    lastRow: lastRow,
    lastColumn: lastColumn
  };
}

/**
 * Validate sheet schema and get dimensions
 * Consolidates pattern that appears 10+ times
 */
function validateSheetAndGetDimensions(sheet) {
  const { lastRow, lastColumn } = validateSheetAndGetDimensions(sheet);
  return { lastRow, lastColumn, valid: lastRow > 1 && lastColumn > 0 };
}

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function saveCommercialFitState(snapshotId, entries) {
  const trace = UnifiedLogger.startTrace('AISidebar', 'saveCommercialFitState', { snapshotId: snapshotId, entryCount: Array.isArray(entries) ? entries.length : 0 });
  
  if (!snapshotId) {
    trace.fail('Save commercial fit state failed', new Error('Missing snapshotId'));
    return;
  }
  const vectorLimit = getCommercialFitVectorPersistLimit();
  const entriesHash = computeCommercialFitEntriesHash(entries, vectorLimit);
  const props = PropertiesService.getUserProperties();
  const hashKey = getCommercialFitHashKey();
  const previousHash = props.getProperty(hashKey);
  if (previousHash && entriesHash && previousHash === entriesHash) {
    try {
      logAIEvent('commercial.fit.state', {
        runType: 'commercial-fit',
        outcome: 'skipped',
        reason: 'hash-match',
        snapshotId: snapshotId
      });
    } catch (logError) {
      try { UnifiedLogger.warn('AISidebar', 'commercial.fit.state log skipped failed', String(logError)); } catch (ignore) {}
    }
    return;
  }
  try {
    const ss = SpreadsheetApp.getActive();
    if (!ss) {
      return;
    }
    let sheet = ss.getSheetByName('_COMMERCIAL_FIT_STATE');
    const headers = COMMERCIAL_FIT_HEADERS;
    if (!sheet) {
      sheet = ss.insertSheet('_COMMERCIAL_FIT_STATE');
      sheet.hideSheet();
    }
    ensureCommercialFitStateSchema_(sheet);
    const lastRow = sheet.getLastRow();
    const selectedIdx = headers.indexOf('SelectedSkusJSON');
    const persistedSelections = {};
    if (selectedIdx !== -1 && lastRow > 1) {
      const persistedRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
      const persistedValues = persistedRange.getValues();
      persistedValues.forEach(function(row) {
        const entryId = row[1];
        if (entryId) {
          persistedSelections[String(entryId)] = row[selectedIdx];
        }
      });
    }
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    }
    const rows = (entries || []).map(function(entry) {
      const quantityContext = entry && entry.quantityContext ? entry.quantityContext : {};
      const warningsText = JSON.stringify(entry && entry.warnings ? entry.warnings : []);
      const notesText = JSON.stringify(entry && entry.notes ? entry.notes : []);
      const scoreText = JSON.stringify(entry && entry.scoreBreakdown ? entry.scoreBreakdown : {});
      const vectorCandidates = entry && Array.isArray(entry.vectorCandidates)
        ? entry.vectorCandidates.slice(0, vectorLimit)
        : [];
      const vectorCandidatesText = JSON.stringify(vectorCandidates);
      const unitRateContext = entry && entry.unitRateContext ? entry.unitRateContext : null;
      const entryContext = buildCommercialFitPersistContext(entry);
      const scopeEntryId = sanitizeSheetText(entry ? entry.scopeEntryId : '');
      const canonical = sanitizeSheetText(entry ? entry.canonical : '');
      const archetype = sanitizeSheetText(entry ? entry.archetype : '');
      const chosenSku = sanitizeSheetText(entry ? entry.chosenSku : '');
      const qtySource = sanitizeSheetText(quantityContext && quantityContext.source ? quantityContext.source : '');
      const unitValue = quantityContext && quantityContext.unit ? sanitizeSheetText(quantityContext.unit) : '';
      const vectorJson = safeJsonCell_(vectorCandidatesText);
      const warningJson = safeJsonCell_(warningsText);
      const notesJson = safeJsonCell_(notesText);
      const bundleKey = sanitizeSheetText(entry ? (entry.bundleKey || '') : '');
      const parentScopeId = sanitizeSheetText(entry ? (entry.sectionParentId || entry.parentScopeId || '') : '');
      const vectorSelectionArray = Array.isArray(entry && entry.vectorSelections) && entry.vectorSelections.length
        ? entry.vectorSelections
        : null;
      const persistedSelection = scopeEntryId && persistedSelections[scopeEntryId] ? String(persistedSelections[scopeEntryId]) : '';
      const selectedSkusJson = sanitizeSheetText(
        vectorSelectionArray
          ? JSON.stringify(vectorSelectionArray)
          : (persistedSelection || '[]')
      );
      const quantityProfileObj = entry && entry.quantityProfile ? entry.quantityProfile : null;
      const quantityProfileJson = safeJsonCell_(quantityProfileObj);
      const sectionMatchRaw = entry && entry.sectionMatchScore !== undefined && entry.sectionMatchScore !== null
        ? Number(entry.sectionMatchScore)
        : null;
      const sectionMatchScoreValue = sectionMatchRaw !== null && !isNaN(sectionMatchRaw)
        ? sectionMatchRaw
        : '';
      return [
        sanitizeSheetText(snapshotId),
        scopeEntryId,
        canonical,
        archetype,
        chosenSku,
        quantityContext && quantityContext.qty !== undefined && quantityContext.qty !== null ? quantityContext.qty : '',
        unitValue,
        entry && entry.unitRateContext ? entry.unitRateContext.value : '',
        safeJsonCell_(scoreText),
        qtySource,
        vectorJson,
        warningJson,
        notesJson,
        entry && entry.manualOverride ? 'TRUE' : 'FALSE',
        parentScopeId,
        bundleKey,
        safeJsonCell_(quantityContext),
        safeJsonCell_(unitRateContext),
        safeJsonCell_(entryContext),
        selectedSkusJson,
        quantityProfileJson,
        sectionMatchScoreValue
      ];
    });
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    props.setProperty(hashKey, entriesHash);
    props.setProperty(hashKey + '_snapshot', snapshotId);
    try {
      logAIEvent('commercial.fit.state', {
        runType: 'commercial-fit',
        outcome: 'persisted',
        snapshotId: snapshotId,
        entryCount: entries.length,
        vectorLimit: vectorLimit
      });
    } catch (logError) {
      try { UnifiedLogger.warn('AISidebar', 'commercial.fit.state log failed', String(logError)); } catch (ignore) {}
    }
    try {
      writeCommercialFitConsoleSheet(snapshotId, entries);
    } catch (consoleError) {
      try { UnifiedLogger.warn('AISidebar', 'commercial.fit.console sheet write failed', String(consoleError)); } catch (ignore) {}
          trace.complete('Commercial fit state saved', { entryCount: entries.length });
    }
  } catch (error) {
    trace.fail('Commercial fit state save failed', error);
    try { UnifiedLogger.warn('AISidebar', 'saveCommercialFitState failed', String(error)); } catch (ignore) {}
  }
}

function ensureCommercialFitConsoleSchema_(sheet) {
  if (!sheet) {
    return;
  }
  const headers = COMMERCIAL_FIT_CONSOLE_HEADERS;
  const maxColumns = sheet.getMaxColumns();
  if (maxColumns < headers.length) {
    sheet.insertColumnsAfter(maxColumns, headers.length - maxColumns);
  }
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const currentHeaders = headerRange.getValues()[0] || [];
  let needsRewrite = currentHeaders.length !== headers.length;
  if (!needsRewrite) {
    for (let i = 0; i < headers.length; i++) {
      if (currentHeaders[i] !== headers[i]) {
        needsRewrite = true;
        break;
      }
    }
  }
  if (needsRewrite) {
    headerRange.setValues([headers]);
  }
  sheet.setFrozenRows(1);
  headerRange.setFontWeight('bold');
}

function getCommercialFitConsoleColor(score) {
  const normalized = score !== undefined && score !== null
    ? Number(score)
    : null;
  if (normalized !== null && !isNaN(normalized)) {
    if (normalized > 0.75) {
      return '#dff0dc';
    }
    if (normalized >= 0.4) {
      return '#fff4cc';
    }
    return '#fde0dd';
  }
  return '#ffffff';
}

function writeCommercialFitConsoleSheet(snapshotId, entries) {
  if (!snapshotId) {
    return;
  }
  try {
    const ss = SpreadsheetApp.getActive();
    if (!ss) {
      return;
    }
    let sheet = ss.getSheetByName('_COMMERCIAL_FIT_CONSOLE');
    if (!sheet) {
      sheet = ss.insertSheet('_COMMERCIAL_FIT_CONSOLE');
      sheet.hideSheet();
    }
    ensureCommercialFitConsoleSchema_(sheet);
    const headers = COMMERCIAL_FIT_CONSOLE_HEADERS;
    const sortedEntries = (Array.isArray(entries) ? entries.slice() : []).sort(function(a, b) {
      const aSection = (a && (a.sectionParentId || a.canonical || '')) || '';
      const bSection = (b && (b.sectionParentId || b.canonical || '')) || '';
      if (aSection < bSection) {
        return -1;
      }
      if (aSection > bSection) {
        return 1;
      }
      const aId = (a && a.scopeEntryId) || '';
      const bId = (b && b.scopeEntryId) || '';
      if (aId < bId) {
        return -1;
      }
      if (aId > bId) {
        return 1;
      }
      return 0;
    });
    const rows = sortedEntries.map(function(entry) {
      const sectionLabel = entry && (entry.sectionParentId || entry.canonical) ? (entry.sectionParentId || entry.canonical) : '';
      const detectedSection = entry && entry.canonical ? entry.canonical : '';
      const scopeLabel = entry && entry.entry && entry.entry.scopeLabel
        ? entry.entry.scopeLabel
        : (entry && entry.scopeEntryId ? entry.scopeEntryId : '');
      const chosenSku = sanitizeSheetText(entry && entry.chosenSku ? entry.chosenSku : '');
      const quantityContext = entry && entry.quantityContext ? entry.quantityContext : {};
      const qtyValue = quantityContext.qty !== undefined && quantityContext.qty !== null ? quantityContext.qty : '';
      const unitValue = quantityContext.unit || '';
      const quantitySource = quantityContext.source || '';
      const scoreValue = entry && entry.sectionMatchScore !== undefined && entry.sectionMatchScore !== null
        ? Number(entry.sectionMatchScore)
        : (entry && entry.scoreBreakdown && entry.scoreBreakdown.total !== undefined && entry.scoreBreakdown.total !== null
          ? Number(entry.scoreBreakdown.total)
          : '');
      const evidence = serializeCommercialFitEvidence(entry);
      const warningsText = Array.isArray(entry.warnings) ? entry.warnings.join('; ') : '';
      const notesText = Array.isArray(entry.notes) ? entry.notes.join('; ') : '';
      const alternates = Array.isArray(entry.candidatePool)
        ? filterTruthy(entry.candidatePool.slice(1, 4).map(function(candidate) {
          return candidate && candidate.sku ? candidate.sku : '';
        })).join(', ')
        : '';
      return [
        sanitizeSheetText(snapshotId),
        sanitizeSheetText(sectionLabel),
        sanitizeSheetText(entry && entry.scopeEntryId ? entry.scopeEntryId : ''),
        sanitizeSheetText(scopeLabel),
        sanitizeSheetText(entry && entry.canonical ? entry.canonical : ''),
        sanitizeSheetText(detectedSection),
        chosenSku,
        qtyValue,
        unitValue,
        sanitizeSheetText(quantitySource),
        sanitizeSheetText(evidence),
        scoreValue !== '' && scoreValue !== null && !isNaN(scoreValue) ? scoreValue : '',
        sanitizeSheetText(warningsText),
        sanitizeSheetText(alternates),
        sanitizeSheetText(notesText),
        new Date().toISOString()
      ];
    });
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).clearContent();
    }
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      const backgroundRows = rows.map(function(row, idx) {
        const entry = sortedEntries[idx];
        const color = getCommercialFitConsoleColor(entry && entry.sectionMatchScore);
        const bgRow = [];
        for (let i = 0; i < headers.length; i++) {
          bgRow.push(color);
        }
        return bgRow;
      });
      sheet.getRange(2, 1, rows.length, headers.length).setBackgrounds(backgroundRows);
      sheet.autoResizeColumns(1, headers.length);
      sheet.setColumnWidth(11, 260);
    }
    const filterRange = sheet.getRange(1, 1, Math.max(rows.length + 1, 1), headers.length);
    const existingFilter = sheet.getFilter();
    if (existingFilter) {
      existingFilter.remove();
    }
    if (rows.length) {
      filterRange.createFilter();
    }
  } catch (error) {
    UnifiedLogger.info('writeCommercialFitConsoleSheet failed: ' + error);
  }
}

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function getCommercialFitState() {
  const trace = UnifiedLogger.startTrace('AISidebar', 'getCommercialFitState');
    try {
    const sheetResult = getCommercialFitStateSheet();
    if (sheetResult.error === 'NO_SPREADSHEET') {
      return { ok: false, reason: sheetResult.error };
    }
    const sheet = sheetResult.sheet;
    if (!sheet) {
      return { ok: true, snapshotId: null, entries: [] };
    }
    const dims = validateSheetAndGetDimensions(sheet);
    const { lastRow, lastColumn } = dims;
    if (!dims.valid) {
      return { ok: true, snapshotId: null, entries: [] };
    }
    // Note: _COMMERCIAL_FIT_STATE uses internal headers defined in COMMERCIAL_FIT_HEADERS, validated by ensureCommercialFitStateSchema_
    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    const headers = values[0];
    const rows = values.slice(1).filter(function(row) {
      return row.some(function(cell) { return cell !== ''; });
    });
    const parentIdx = headers.indexOf('ParentScopeId');
    const bundleIdx = headers.indexOf('BundleKey');
    const vectorIdx = headers.indexOf('VectorCandidatesJSON');
    const warningsIdx = headers.indexOf('WarningsJSON');
    const notesIdx = headers.indexOf('NotesJSON');
    const manualIdx = headers.indexOf('ManualOverride');
    const qtySourceIdx = headers.indexOf('QtySource');
    const scoreIdx = headers.indexOf('ScoreJSON');
    const quantityContextIdx = headers.indexOf('QuantityContextJSON');
    const unitRateContextIdx = headers.indexOf('UnitRateContextJSON');
    const entryContextIdx = headers.indexOf('EntryContextJSON');
    const quantityProfileIdx = headers.indexOf('QuantityProfileJSON');
    const sectionMatchIdx = headers.indexOf('SectionMatchScore');
    const selectedSkusIdx = headers.indexOf('SelectedSkusJSON');
    const parsedEntries = [];
    rows.forEach(function(row, rowIndex) {
      try {
      const qtyCell = row[5];
      const unitCell = row[6];
      const rateCell = row[7];
      const qtyNumber = qtyCell === '' || qtyCell === null ? null : Number(qtyCell);
      const normalizedQty = qtyNumber !== null && !isNaN(qtyNumber) ? qtyNumber : null;
      const unitText = unitCell !== undefined && unitCell !== null ? String(unitCell) : '';
      const rateNumber = rateCell === '' || rateCell === null ? null : Number(rateCell);
      const normalizedRate = rateNumber !== null && !isNaN(rateNumber) ? rateNumber : null;
      const qtySource = qtySourceIdx !== -1 ? String(row[qtySourceIdx] || '') : '';
      const quantityContextRaw = quantityContextIdx !== -1 ? parseJsonSafe(row[quantityContextIdx], null) : null;
      const unitRateContextRaw = unitRateContextIdx !== -1 ? parseJsonSafe(row[unitRateContextIdx], null) : null;
      const entryContext = entryContextIdx !== -1 ? parseJsonSafe(row[entryContextIdx], null) : null;
      const selectedSkusRaw = selectedSkusIdx !== -1 ? parseJsonSafe(row[selectedSkusIdx], []) : [];
      const scopeEntry = entryContext && typeof entryContext === 'object'
        ? (entryContext.scopeEntry || entryContext.entry || null)
        : null;
      const catalogItem = entryContext && typeof entryContext === 'object' && entryContext.catalogItem
        ? entryContext.catalogItem
        : null;
      let entryDescription = '';
      if (entryContext && typeof entryContext === 'object' && entryContext.description) {
        entryDescription = String(entryContext.description).trim();
      }
      if (!entryDescription && scopeEntry && typeof scopeEntry === 'object') {
        entryDescription = [
          scopeEntry.description,
          scopeEntry.scopeLabel,
          scopeEntry.name
        ].find(function(value) {
          return value && String(value).trim();
        }) || '';
        if (entryDescription) {
          entryDescription = String(entryDescription).trim();
        }
      }
      let entryDisplayName = '';
      if (entryContext && typeof entryContext === 'object') {
        const contextScope = entryContext.scopeEntry || entryContext.entry;
        if (contextScope && typeof contextScope === 'object' && contextScope.displayName) {
          entryDisplayName = String(contextScope.displayName).trim();
        }
      }
      if (!entryDisplayName && scopeEntry && scopeEntry.displayName) {
        entryDisplayName = String(scopeEntry.displayName).trim();
      }
      let vectorCandidates = parseJsonSafe(vectorIdx !== -1 ? row[vectorIdx] : '[]', []);
      if ((!Array.isArray(vectorCandidates) || !vectorCandidates.length) &&
          entryContext &&
          Array.isArray(entryContext.vectorCandidates) &&
          entryContext.vectorCandidates.length) {
        vectorCandidates = entryContext.vectorCandidates;
      }
      if (Array.isArray(vectorCandidates) && vectorCandidates.length) {
        vectorCandidates = vectorCandidates.map(function(candidate) {
          if (!candidate) {
            return null;
          }
          const normalizedSku = normalizeSku(candidate.sku || candidate.scopeCode || '');
          if (!normalizedSku) {
            return null;
          }
          const resolved = Object.assign({}, candidate, {
            sku: normalizedSku,
            scopeCode: candidate.scopeCode || normalizedSku
          });
          resolved.manual = candidate.manual === true;
          if (resolved.vectorScore === undefined && resolved.score !== undefined && resolved.score !== null) {
            const parsedScore = Number(resolved.score);
            resolved.vectorScore = isNaN(parsedScore) ? null : parsedScore;
          } else if (resolved.vectorScore !== undefined && resolved.vectorScore !== null) {
            const parsedScore = Number(resolved.vectorScore);
            resolved.vectorScore = isNaN(parsedScore) ? null : parsedScore;
          }
          if (!resolved.catalogItem) {
            resolved.catalogItem = safeLookupItem(normalizedSku);
          }
          if (!resolved.scopeName && scopeEntry && typeof scopeEntry === 'object') {
            resolved.scopeName = scopeEntry.scopeLabel || scopeEntry.name || scopeEntry.description || '';
          }
          if ((resolved.rate === undefined || resolved.rate === null) && candidate.rate !== undefined && candidate.rate !== null) {
            const persistedRate = coerceCatalogNumber(candidate.rate);
            if (persistedRate !== null) {
              resolved.rate = persistedRate;
            }
          }
          if (!resolved.snippet && resolved.rationale) {
            resolved.snippet = resolved.rationale;
          }
          return resolved;
        });
        vectorCandidates = filterTruthy(vectorCandidates);
      }
      const quantityContext = normalizeQuantityContext(quantityContextRaw, normalizedQty, unitText, qtySource);
      const unitRateContext = normalizeUnitRateContext(unitRateContextRaw, normalizedRate);
      let effectiveQty = normalizedQty;
      if ((effectiveQty === null || effectiveQty === undefined) && quantityContext && quantityContext.qty !== undefined && quantityContext.qty !== null) {
        const ctxQty = Number(quantityContext.qty);
        effectiveQty = isNaN(ctxQty) ? null : ctxQty;
      }
      let effectiveUnit = unitText;
      if ((!effectiveUnit || effectiveUnit === '') && quantityContext && quantityContext.unit) {
        effectiveUnit = quantityContext.unit;
      }
      if (effectiveUnit !== undefined && effectiveUnit !== null) {
        effectiveUnit = String(effectiveUnit);
      } else {
        effectiveUnit = '';
      }
      let effectiveRate = normalizedRate;
      if ((effectiveRate === null || effectiveRate === undefined) && unitRateContext && unitRateContext.value !== undefined && unitRateContext.value !== null) {
        const ctxRate = Number(unitRateContext.value);
        effectiveRate = isNaN(ctxRate) ? null : ctxRate;
      }
      const sectionMatchValue = sectionMatchIdx !== -1 ? row[sectionMatchIdx] : null;
      const parsedSectionMatch = sectionMatchValue !== null && sectionMatchValue !== '' && sectionMatchValue !== undefined
        ? Number(sectionMatchValue)
        : null;
      const sectionMatchScore = parsedSectionMatch !== null && !isNaN(parsedSectionMatch) ? parsedSectionMatch : null;
      parsedEntries.push({
        snapshotId: row[0],
        scopeEntryId: row[1],
        canonical: row[2],
        archetype: row[3],
        chosenSku: row[4],
        displayName: entryDisplayName,
        qty: effectiveQty,
        unit: effectiveUnit,
        unitRate: effectiveRate,
        score: parseJsonSafe(scoreIdx !== -1 ? row[scoreIdx] : '{}', {}),
        qtySource: qtySource,
        vectorCandidates: vectorCandidates,
        warnings: parseJsonSafe(warningsIdx !== -1 ? row[warningsIdx] : '[]', []),
        notes: parseJsonSafe(notesIdx !== -1 ? row[notesIdx] : '[]', []),
        manualOverride: manualIdx !== -1 ? String(row[manualIdx] || '').toUpperCase() === 'TRUE' : false,
        sectionParentId: parentIdx !== -1 ? row[parentIdx] : '',
        parentScopeId: parentIdx !== -1 ? row[parentIdx] : '',
        bundleKey: bundleIdx !== -1 ? row[bundleIdx] : '',
        quantityContext: quantityContext,
        unitRateContext: unitRateContext,
        entryContext: entryContext,
        entry: scopeEntry,
        catalogItem: catalogItem,
        description: entryDescription,
        selectedSkusRaw: selectedSkusRaw,
        quantityProfile: parseJsonSafe(quantityProfileIdx !== -1 ? row[quantityProfileIdx] : 'null', null),
        sectionMatchScore: sectionMatchScore
      });
      } catch (rowError) {
        UnifiedLogger.info('getCommercialFitState skipped malformed row ' + (rowIndex + 2) + ': ' + rowError);
      }
    });
    const entries = parsedEntries.filter(function(entry) {
      return entry && entry.scopeEntryId && entry.canonical;
    });
    entries.forEach(function(entry) {
      if (!entry) {
        return;
      }
      const selectedSkusRaw = entry.selectedSkusRaw && Array.isArray(entry.selectedSkusRaw)
        ? entry.selectedSkusRaw
        : [];
      const parsedSelections = parseSelectedSkuList_(selectedSkusRaw, entry.scopeEntryId || '');
      entry.vectorSelections = parsedSelections;
      entry.selectedSkus = Array.isArray(parsedSelections)
        ? parsedSelections.map(function(selection) {
          return selection ? Object.assign({}, selection) : null;
        }).filter(Boolean)
        : [];
      delete entry.selectedSkusRaw;
    });
    const snapshotId = entries.length ? entries[0].snapshotId : null;
    const vectorErrors = filterTruthy(entries.filter(function(entry) {
      return !entry.vectorCandidates || entry.vectorCandidates.length === 0;
    }).map(function(entry) {
      return entry.scopeEntryId || '';
    }));
    const autoRefreshRecommended = entries.length > 0 && vectorErrors.length === entries.length;
    trace.complete('Commercial fit state retrieved', { entryCount: entries.length });
    return {
      ok: true,
      snapshotId: snapshotId,
      headers: headers,
      entries: entries,
      vectorErrors: vectorErrors,
      autoRefreshRecommended: autoRefreshRecommended,
      vectorMatchPagerEnabled: typeof isVectorMatchPagerEnabled === 'function'
        ? isVectorMatchPagerEnabled()
        : true
    };
  } catch (error) {
    trace.fail('Commercial fit state retrieval failed', error);
    UnifiedLogger.info('getCommercialFitState error: ' + error);
    return { ok: false, error: String(error) };
  }
}

function flushCommercialFitStateWrites_() {
  // Ensure pending _COMMERCIAL_FIT_STATE writes are committed before re-reading.
  SpreadsheetApp.flush();
}

function locateCommercialFitRow(scopeEntryId) {
  const id = scopeEntryId ? String(scopeEntryId) : '';
  if (!id) {
    return null;
  }
  const ss = SpreadsheetApp.getActive();
  if (!ss) {
    return null;
  }
  const sheet = ss.getSheetByName('_COMMERCIAL_FIT_STATE');
  if (!sheet) {
    return null;
  }
  const { lastRow, lastColumn } = validateSheetAndGetDimensions(sheet);
  if (lastRow <= 1 || lastColumn === 0) {
    return null;
  }
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const index = rows.findIndex(row => row[1] === id);
  if (index === -1) {
    return null;
  }
  return {
    sheet: sheet,
    headers: headers,
    row: rows[index],
    rowIndex: index,
    lastColumn: lastColumn
  };
}

function applyCommercialFitEdits(edits) {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, reason: 'NO_EDITS' };
  }
  try {
    const sheetResult = getCommercialFitStateSheet();
    if (sheetResult.error === 'NO_SPREADSHEET') {
      return { ok: false, reason: sheetResult.error };
    }
    const sheet = sheetResult.sheet;
    if (!sheet) {
      return { ok: false, reason: 'STATE_NOT_FOUND' };
    }
    const dims = validateSheetAndGetDimensions(sheet);
    const { lastRow, lastColumn } = dims;
    if (!dims.valid) {
      return { ok: false, reason: 'STATE_EMPTY' };
    }
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const skuIdx = headers.indexOf('ChosenSku');
    const qtyIdx = headers.indexOf('Qty');
    const unitIdx = headers.indexOf('Unit');
    const unitRateIdx = headers.indexOf('UnitRate');
    const warningsIdx = headers.indexOf('WarningsJSON');
    const notesIdx = headers.indexOf('NotesJSON');
    const manualIdx = headers.indexOf('ManualOverride');
    const qtySourceIdx = headers.indexOf('QtySource');
    const quantityContextIdx = headers.indexOf('QuantityContextJSON');
    const unitRateContextIdx = headers.indexOf('UnitRateContextJSON');
    const entryContextIdx = headers.indexOf('EntryContextJSON');
    const bodyRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const SCOPE_ID_COL_IDX = 1;
    const rows = bodyRange.getValues();
    const index = new Map();
    rows.forEach(function(row, idx) {
      const key = row[SCOPE_ID_COL_IDX];
      if (key) {
        index.set(key, { row: row, rowIndex: idx });
      }
    });
    const snapshotId = rows.length ? rows[0][0] : '';
    const updated = [];

    edits.forEach(function(edit) {
      if (!edit || !edit.scopeEntryId) {
        return;
      }
      const entry = index.get(edit.scopeEntryId);
      if (!entry) {
        return;
      }
      const row = entry.row;
      const updates = edit.updates || {};
      const existingWarnings = warningsIdx !== -1 ? parseJsonSafe(row[warningsIdx], []) : [];
      let warningsList = Array.isArray(existingWarnings) ? existingWarnings.slice() : [];
      let quantityContextObj = quantityContextIdx !== -1 ? parseJsonSafe(row[quantityContextIdx], null) : null;
      let unitRateContextObj = unitRateContextIdx !== -1 ? parseJsonSafe(row[unitRateContextIdx], null) : null;
      let entryContextObj = entryContextIdx !== -1 ? parseJsonSafe(row[entryContextIdx], null) : null;
      if (!quantityContextObj || typeof quantityContextObj !== 'object') {
        const qtyValue = qtyIdx !== -1 ? row[qtyIdx] : null;
        const qtyNumber = qtyValue === '' || qtyValue === null ? null : Number(qtyValue);
        quantityContextObj = {
          qty: qtyNumber !== null && !isNaN(qtyNumber) ? qtyNumber : null,
          unit: unitIdx !== -1 ? String(row[unitIdx] || '') : '',
          source: qtySourceIdx !== -1 ? String(row[qtySourceIdx] || '') : '',
          warnings: []
        };
      }
      if (!unitRateContextObj || typeof unitRateContextObj !== 'object') {
        const rateValue = unitRateIdx !== -1 ? row[unitRateIdx] : null;
        const rateNumber = rateValue === '' || rateValue === null ? null : Number(rateValue);
        unitRateContextObj = rateNumber !== null && !isNaN(rateNumber)
          ? { value: rateNumber, source: 'manual' }
          : null;
      }
      if (!entryContextObj || typeof entryContextObj !== 'object') {
        entryContextObj = {};
      }
      if (updates.displayName !== undefined) {
        const normalizedDisplayName = updates.displayName ? String(updates.displayName).trim() : '';
        if (!entryContextObj.scopeEntry || typeof entryContextObj.scopeEntry !== 'object') {
          entryContextObj.scopeEntry = {};
        }
        entryContextObj.scopeEntry.displayName = normalizedDisplayName;
        if (!entryContextObj.entry || typeof entryContextObj.entry !== 'object') {
          entryContextObj.entry = {};
        }
        entryContextObj.entry.displayName = normalizedDisplayName;
      }
      let catalogItem = entryContextObj.catalogItem || null;
      const scopeEntry = entryContextObj.scopeEntry || entryContextObj.entry || null;
      const signalLookup = entryContextObj.signalLookup || (scopeEntry && scopeEntry.signalLookup) || {};
      // DELETED: archetype extraction (Plan 12-06) - no longer used

      if (updates.sku !== undefined) {
        const normalizedSku = normalizeSku(updates.sku);
        if (skuIdx !== -1) {
          row[skuIdx] = sanitizeSheetText(normalizedSku);
        }
        catalogItem = normalizedSku ? safeLookupItem(normalizedSku) : null;
        let resolvedQuantity = null;
        if (normalizedSku && typeof resolveSkuQuantity === 'function') {
          try {
            resolvedQuantity = resolveSkuQuantity({
              scopeEntry: scopeEntry,
              skuMeta: { sku: normalizedSku }, // archetype: REMOVED (Plan 12-06)
              // archetype: REMOVED (Plan 12-06) - no longer needed
              signalLookup: signalLookup || {},
              catalogItem: catalogItem
            });
          } catch (quantityError) {
            UnifiedLogger.info('resolveSkuQuantity failed for ' + normalizedSku + ': ' + quantityError);
          }
        }
        if (resolvedQuantity) {
          const resolvedQty = resolvedQuantity.qty !== undefined && resolvedQuantity.qty !== null && !isNaN(Number(resolvedQuantity.qty))
            ? Number(resolvedQuantity.qty)
            : null;
          if (qtyIdx !== -1) {
            row[qtyIdx] = resolvedQty !== null ? resolvedQty : '';
          }
          quantityContextObj.qty = resolvedQty;
          const resolvedUnit = resolvedQuantity.unit || (catalogItem && catalogItem.unit) || quantityContextObj.unit || '';
          if (unitIdx !== -1) {
            row[unitIdx] = sanitizeSheetText(resolvedUnit);
          }
          quantityContextObj.unit = resolvedUnit;
          quantityContextObj.source = resolvedQuantity.source || '';
          quantityContextObj.warnings = Array.isArray(resolvedQuantity.warnings) ? resolvedQuantity.warnings.slice() : [];
          warningsList = mergeUniqueMessages(warningsList, quantityContextObj.warnings);
          if (qtySourceIdx !== -1) {
            row[qtySourceIdx] = sanitizeSheetText(quantityContextObj.source || '');
          }
        } else {
          if (catalogItem && catalogItem.unit && unitIdx !== -1) {
            row[unitIdx] = sanitizeSheetText(catalogItem.unit);
          }
          if (catalogItem && catalogItem.unit) {
            quantityContextObj.unit = catalogItem.unit;
          }
        }
        if (catalogItem) {
          let resolvedRateContext = null;
          try {
            resolvedRateContext = determineUnitRate(catalogItem);
          } catch (rateError) {
            UnifiedLogger.info('determineUnitRate failed for ' + (catalogItem.itemCode || normalizedSku) + ': ' + rateError);
          }
          const autoRateValue = coerceCatalogNumber(resolvedRateContext && resolvedRateContext.value);
          if (autoRateValue !== null) {
            if (unitRateIdx !== -1) {
              row[unitRateIdx] = autoRateValue;
            }
            unitRateContextObj = Object.assign({}, resolvedRateContext || {}, { value: autoRateValue });
          } else {
            const existingRate = coerceCatalogNumber(unitRateContextObj && unitRateContextObj.value);
            if (existingRate !== null) {
              if (unitRateIdx !== -1) {
                row[unitRateIdx] = existingRate;
              }
              unitRateContextObj = Object.assign({}, unitRateContextObj || {}, { value: existingRate });
            } else if (unitRateIdx !== -1) {
              row[unitRateIdx] = '';
            }
          }
        }
        entryContextObj.catalogItem = catalogItem;
        if (!entryContextObj.signalLookup && signalLookup) {
          entryContextObj.signalLookup = signalLookup;
        }
        if (!entryContextObj.scopeEntry && scopeEntry) {
          entryContextObj.scopeEntry = scopeEntry;
        }
        if (!entryContextObj.archetype && archetype) {
          entryContextObj.archetype = archetype;
        }
      }

      if (updates.qty !== undefined) {
        const qtyValue = updates.qty === null ? null : Number(updates.qty);
        const resolvedQty = qtyValue !== null && !isNaN(qtyValue) ? qtyValue : null;
        if (qtyIdx !== -1) {
          row[qtyIdx] = resolvedQty !== null ? resolvedQty : '';
        }
        if (!quantityContextObj) {
          quantityContextObj = { qty: null, unit: '', source: '', warnings: [] };
        }
        quantityContextObj.qty = resolvedQty;
        if (!quantityContextObj.source) {
          quantityContextObj.source = 'manual';
        }
      }

      if (updates.unit !== undefined) {
        if (unitIdx !== -1) {
          row[unitIdx] = sanitizeSheetText(updates.unit);
        }
        if (!quantityContextObj) {
          quantityContextObj = { qty: null, unit: '', source: '', warnings: [] };
        }
        quantityContextObj.unit = updates.unit || '';
        if (!quantityContextObj.source) {
          quantityContextObj.source = 'manual';
        }
      }

      if (updates.unitRate !== undefined) {
        const resolvedRate = coerceCatalogNumber(updates.unitRate);
        if (unitRateIdx !== -1) {
          row[unitRateIdx] = resolvedRate !== null ? resolvedRate : '';
        }
        const nextContext = unitRateContextObj && typeof unitRateContextObj === 'object' ? unitRateContextObj : {};
        nextContext.value = resolvedRate;
        nextContext.source = 'manual';
        unitRateContextObj = resolvedRate !== null ? nextContext : null;
      }

      if (edit.warnings !== undefined) {
        warningsList = Array.isArray(edit.warnings) ? edit.warnings.slice() : [];
      }
      if (warningsIdx !== -1) {
        row[warningsIdx] = sanitizeSheetText(JSON.stringify(warningsList));
      }
      if (edit.notes !== undefined && notesIdx !== -1) {
        row[notesIdx] = sanitizeSheetText(JSON.stringify(edit.notes || []));
      }
      if (quantityContextObj && qtySourceIdx !== -1) {
        row[qtySourceIdx] = sanitizeSheetText(quantityContextObj.source || '');
      }
      if (quantityContextIdx !== -1) {
        row[quantityContextIdx] = safeJsonCell_(quantityContextObj || null);
      }
      if (unitRateContextIdx !== -1) {
        row[unitRateContextIdx] = safeJsonCell_(unitRateContextObj || null);
      }
      if (entryContextObj) {
        entryContextObj.quantityContext = quantityContextObj || null;
        entryContextObj.unitRateContext = unitRateContextObj || null;
      }
      if (entryContextIdx !== -1) {
        row[entryContextIdx] = safeJsonCell_(entryContextObj || null);
      }
      if (manualIdx !== -1) {
        row[manualIdx] = 'TRUE';
      }
      if (quantityProfileIdx !== -1) {
        const profileValue = buildCommercialFitQuantityProfile({ quantityContext: quantityContextObj });
        row[quantityProfileIdx] = safeJsonCell_(profileValue || null);
      }
      updated.push(edit.scopeEntryId);
    });

    if (rows.length) {
      bodyRange.setValues(rows);
      flushCommercialFitStateWrites_();
    }

    if (updated.length) {
      try {
        logAIEvent('commercial.fit.edit', {
          snapshotId: snapshotId,
          updated: updated
        });
      } catch (logError) {
        UnifiedLogger.info('commercial.fit.edit logging failed: ' + logError);
      }
    }

    const state = getCommercialFitState();
    if (state && state.ok !== false) {
      state.updated = updated;
      try {
        writeCommercialFitConsoleSheet(state.snapshotId, state.entries);
      } catch (consoleError) {
      try { UnifiedLogger.warn('AISidebar', 'writeCommercialFitConsoleSheet failed', String(consoleError)); } catch (ignore) {}
      }
      return state;
    }
    return Object.assign({ ok: false, updated: updated }, state || {});
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'applyCommercialFitEdits error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

function addCommercialFitSkuVariant(request) {
  const payload = request || {};
  const scopeEntryId = payload.scopeEntryId ? String(payload.scopeEntryId) : '';
  if (!scopeEntryId) {
    return { ok: false, error: 'SCOPE_ENTRY_ID_REQUIRED' };
  }
  const rowInfo = locateCommercialFitRow(scopeEntryId);
  if (!rowInfo) {
    return { ok: false, error: 'ENTRY_NOT_FOUND' };
  }
  const selectedIdx = rowInfo.headers.indexOf('SelectedSkusJSON');
  if (selectedIdx === -1) {
    return { ok: false, error: 'SELECTED_SKUS_COLUMN_MISSING' };
  }
  const parsedSkus = parseJsonSafe(rowInfo.row[selectedIdx], []);
  const selectedSkus = Array.isArray(parsedSkus) ? parsedSkus : [];
  const nextIndex = (selectedSkus.length || 0) + 1;
  const childId = scopeEntryId + '__sku-' + nextIndex;
  const newVariant = {
    sku: '',
    skuId: childId,
    childSkuId: childId,
    displayName: '',
    quantityContext: {
      qty: null,
      unit: '',
      source: 'manual',
      warnings: []
    },
    unitRate: null,
    notes: []
  };
  selectedSkus.push(newVariant);
  rowInfo.row[selectedIdx] = sanitizeSheetText(JSON.stringify(selectedSkus));
  rowInfo.sheet.getRange(rowInfo.rowIndex + 2, 1, 1, rowInfo.lastColumn).setValues([rowInfo.row]);
  flushCommercialFitStateWrites_();
  return getCommercialFitState();
}

function addCommercialFitVectorCandidate(request) {
  const payload = request || {};
  const scopeEntryId = payload.scopeEntryId ? String(payload.scopeEntryId) : '';
  const skuValue = payload.sku ? payload.sku : '';
  const normalizedSku = normalizeSku(skuValue);
  if (!scopeEntryId || !normalizedSku || !isValidVectorSku(normalizedSku)) {
    return { ok: false, error: 'SCOPE_ENTRY_AND_SKU_REQUIRED' };
  }
  const rowInfo = locateCommercialFitRow(scopeEntryId);
  if (!rowInfo) {
    return { ok: false, error: 'ENTRY_NOT_FOUND' };
  }
  const vectorIdx = rowInfo.headers.indexOf('VectorCandidatesJSON');
  if (vectorIdx === -1) {
    return { ok: false, error: 'VECTOR_COLUMN_MISSING' };
  }
  let vectorCandidates = parseJsonSafe(rowInfo.row[vectorIdx], []);
  if (!Array.isArray(vectorCandidates)) {
    vectorCandidates = [];
  }
  const existingIndex = vectorCandidates.findIndex(function(candidate) {
    if (!candidate) {
      return false;
    }
    const candidateSku = normalizeSku(candidate.sku || candidate.scopeCode || '');
    return candidateSku && candidateSku === normalizedSku;
  });
  if (existingIndex !== -1) {
    vectorCandidates.splice(existingIndex, 1);
  }
  const candidate = {
    sku: normalizedSku,
    scopeCode: normalizedSku,
    scopeName: '',
    manual: true
  };
  const scopeName = payload.scopeName ? String(payload.scopeName).trim() : '';
  if (scopeName) {
    candidate.scopeName = scopeName;
  }
  const snippet = payload.snippet ? String(payload.snippet).trim() : '';
  if (snippet) {
    candidate.snippet = snippet;
  }
  const catalogItem = safeLookupItem(normalizedSku);
  if (catalogItem) {
    candidate.catalogItem = catalogItem;
  }
  candidate.manual = true;
  vectorCandidates.unshift(candidate);
  rowInfo.row[vectorIdx] = sanitizeSheetText(JSON.stringify(vectorCandidates));
  rowInfo.sheet.getRange(rowInfo.rowIndex + 2, 1, 1, rowInfo.lastColumn).setValues([rowInfo.row]);
  flushCommercialFitStateWrites_();
  return getCommercialFitState();
}

function updateCommercialFitSkuVariant(request) {
  const payload = request || {};
  const scopeEntryId = payload.scopeEntryId ? String(payload.scopeEntryId) : '';
  const childSkuId = payload.childSkuId ? String(payload.childSkuId) : '';
  const patch = payload.patch || {};
  if (!scopeEntryId || !childSkuId) {
    return { ok: false, error: 'SCOPE_ENTRY_OR_CHILD_ID_REQUIRED' };
  }
  const rowInfo = locateCommercialFitRow(scopeEntryId);
  if (!rowInfo) {
    return { ok: false, error: 'ENTRY_NOT_FOUND' };
  }
  const selectedIdx = rowInfo.headers.indexOf('SelectedSkusJSON');
  if (selectedIdx === -1) {
    return { ok: false, error: 'SELECTED_SKUS_COLUMN_MISSING' };
  }
  const rawSelected = parseJsonSafe(rowInfo.row[selectedIdx], []);
  const selectedSkus = Array.isArray(rawSelected) ? rawSelected : [];
  const target = selectedSkus.find(function(entry) {
    if (!entry) {
      return false;
    }
    return (entry.childSkuId && entry.childSkuId === childSkuId) || (entry.skuId && entry.skuId === childSkuId);
  });
  if (!target) {
    return { ok: false, error: 'SKU_VARIANT_NOT_FOUND' };
  }
  if (patch.sku !== undefined) {
    const normalized = patch.sku ? String(patch.sku).trim().toUpperCase() : '';
    target.sku = normalized;
    target.skuId = target.skuId || childSkuId;
    target.childSkuId = target.childSkuId || childSkuId;
  }
  if (patch.qty !== undefined) {
    const numericQty = patch.qty === null ? null : Number(patch.qty);
    target.quantityContext = target.quantityContext || { qty: null, unit: '', source: 'manual', warnings: [] };
    target.quantityContext.qty = numericQty !== null && !isNaN(numericQty) ? numericQty : null;
    target.qty = numericQty !== null && !isNaN(numericQty) ? numericQty : null;
  }
  if (patch.unit !== undefined) {
    const normalizedUnit = patch.unit ? String(patch.unit).trim() : '';
    target.quantityContext = target.quantityContext || { qty: null, unit: '', source: 'manual', warnings: [] };
    target.quantityContext.unit = normalizedUnit;
    target.unit = normalizedUnit;
  }
  if (patch.unitRate !== undefined) {
    const numericRate = patch.unitRate === null ? null : Number(patch.unitRate);
    target.unitRate = numericRate !== null && !isNaN(numericRate) ? numericRate : null;
  }
  if (patch.displayName !== undefined) {
    target.displayName = patch.displayName ? String(patch.displayName).trim() : '';
  }
  rowInfo.row[selectedIdx] = sanitizeSheetText(JSON.stringify(selectedSkus));
  rowInfo.sheet.getRange(rowInfo.rowIndex + 2, 1, 1, rowInfo.lastColumn).setValues([rowInfo.row]);
  flushCommercialFitStateWrites_();
  return getCommercialFitState();
}

function removeCommercialFitSkuVariant(request) {
  const payload = request || {};
  const scopeEntryId = payload.scopeEntryId ? String(payload.scopeEntryId) : '';
  const childSkuId = payload.childSkuId ? String(payload.childSkuId) : '';
  if (!scopeEntryId || !childSkuId) {
    return { ok: false, error: 'SCOPE_ENTRY_OR_CHILD_ID_REQUIRED' };
  }
  const rowInfo = locateCommercialFitRow(scopeEntryId);
  if (!rowInfo) {
    return { ok: false, error: 'ENTRY_NOT_FOUND' };
  }
  const selectedIdx = rowInfo.headers.indexOf('SelectedSkusJSON');
  if (selectedIdx === -1) {
    return { ok: false, error: 'SELECTED_SKUS_COLUMN_MISSING' };
  }
  const rawSelected = parseJsonSafe(rowInfo.row[selectedIdx], []);
  const selectedSkus = Array.isArray(rawSelected) ? rawSelected : [];
  const filtered = selectedSkus.filter(function(entry) {
    if (!entry) {
      return true;
    }
    return !((entry.childSkuId && entry.childSkuId === childSkuId) || (entry.skuId && entry.skuId === childSkuId));
  });
  if (filtered.length === selectedSkus.length) {
    return { ok: false, error: 'SKU_VARIANT_NOT_FOUND' };
  }
  rowInfo.row[selectedIdx] = sanitizeSheetText(JSON.stringify(filtered));
  rowInfo.sheet.getRange(rowInfo.rowIndex + 2, 1, 1, rowInfo.lastColumn).setValues([rowInfo.row]);
  flushCommercialFitStateWrites_();
  return getCommercialFitState();
}

function syncCommercialFitSelections(request) {
  if (!request || !request.scopeEntryId) {
    return { ok: false, reason: 'SCOPE_ENTRY_ID_REQUIRED' };
  }
  try {
    const sheetResult = getCommercialFitStateSheet();
    if (sheetResult.error === 'NO_SPREADSHEET') {
      return { ok: false, reason: sheetResult.error };
    }
    const sheet = sheetResult.sheet;
    if (!sheet) {
      return { ok: false, reason: 'STATE_NOT_FOUND' };
    }
    const dims = validateSheetAndGetDimensions(sheet);
    const { lastRow, lastColumn } = dims;
    if (!dims.valid) {
      return { ok: false, reason: 'STATE_EMPTY' };
    }
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const selectedIdx = headers.indexOf('SelectedSkusJSON');
    const bodyRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const rows = bodyRange.getValues();
    const index = new Map();
    rows.forEach(function(row, idx) {
      const key = row[1];
      if (key) {
        index.set(key, { row: row, rowIndex: idx });
      }
    });
    const entry = index.get(request.scopeEntryId);
    if (!entry) {
      return { ok: false, reason: 'SCOPE_ENTRY_NOT_FOUND' };
    }
    const sanitizedSelections = sanitizeSelectedSkuPayload_(request.selections || []);
    if (selectedIdx !== -1) {
      entry.row[selectedIdx] = sanitizeSheetText(JSON.stringify(sanitizedSelections));
    }
    rows[entry.rowIndex] = entry.row;
    if (rows.length) {
      bodyRange.setValues(rows);
      flushCommercialFitStateWrites_();
    }
    try {
      logAIEvent('commercial.fit.selection', {
        scopeEntryId: request.scopeEntryId,
        selectedCount: sanitizedSelections.length
      });
    } catch (logError) {
      try { UnifiedLogger.warn('AISidebar', 'commercial.fit.selection logging failed', String(logError)); } catch (ignore) {}
    }
    const state = getCommercialFitState();
    if (state && state.ok !== false) {
      state.updated = [request.scopeEntryId];
      return state;
    }
    return Object.assign({ ok: false, updated: [request.scopeEntryId] }, state || {});
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'syncCommercialFitSelections error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

function openCommercialFitConsoleSheet() {
  try {
    const ss = SpreadsheetApp.getActive();
    if (!ss) {
      return { ok: false, error: 'NO_SPREADSHEET' };
    }
    let sheet = ss.getSheetByName('_COMMERCIAL_FIT_CONSOLE');
    if (!sheet) {
      sheet = ss.insertSheet('_COMMERCIAL_FIT_CONSOLE');
      ensureCommercialFitConsoleSchema_(sheet);
      sheet.hideSheet();
    }
    sheet.activate();
    return { ok: true };
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'openCommercialFitConsoleSheet error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

function createCommercialFitEntry(request) {
  const payload = request || {};
  const label = payload.scopeLabel ? String(payload.scopeLabel).trim() : '';
  if (!label) {
    return { ok: false, error: 'Scope label is required.' };
  }
  try {
    const sheetResult = getCommercialFitStateSheet();
    if (sheetResult.error) {
      return { ok: false, error: sheetResult.error };
    }
    const sheet = sheetResult.sheet;
    ensureCommercialFitStateSchema_(sheet);
    const lastColumn = sheet.getLastColumn();
    if (!lastColumn) {
      return { ok: false, error: 'STATE_NOT_INITIALIZED' };
    }
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const rowTemplate = new Array(headers.length).fill('');
    const snapshotId = payload.snapshotId || inferSnapshotId(sheet);
    const scopeEntryId = payload.scopeEntryId ? String(payload.scopeEntryId) : ('MANUAL_' + Date.now());
    const qtyValue = payload.qty !== undefined ? coerceCatalogNumber(payload.qty) : null;
    const rateValue = payload.rate !== undefined ? coerceCatalogNumber(payload.rate) : null;
    const quantityContext = {
      qty: qtyValue,
      unit: payload.unit ? String(payload.unit).trim() : '',
      source: 'manual',
      warnings: []
    };
    const entryContext = {
      manualEntry: true,
      scopeEntry: {
        scopeLabel: label,
        description: payload.description ? String(payload.description).trim() : '',
        manualEntry: true
      }
    };
    if (payload.parentScopeId) {
      entryContext.parentScopeId = payload.parentScopeId;
    }
    const setValue = function(header, value) {
      const idx = headers.indexOf(header);
      if (idx !== -1) {
        rowTemplate[idx] = sanitizeSheetText(value);
      }
    };
    setValue('SnapshotId', snapshotId || '');
    setValue('ScopeEntryId', scopeEntryId);
    setValue('Canonical', label);
    setValue('Archetype', payload.archetype || 'Manual');
    setValue('ChosenSku', payload.sku ? String(payload.sku).trim().toUpperCase() : '');
    setValue('Qty', quantityContext.qty !== null ? quantityContext.qty : '');
    setValue('Unit', quantityContext.unit || '');
    setValue('UnitRate', rateValue !== null ? rateValue : '');
    setValue('ScoreJSON', '{}');
    setValue('QtySource', quantityContext.source);
    setValue('VectorCandidatesJSON', '[]');
    setValue('WarningsJSON', '[]');
    setValue('NotesJSON', '[]');
    setValue('ManualOverride', 'TRUE');
    setValue('ParentScopeId', payload.parentScopeId ? String(payload.parentScopeId) : '');
    setValue('BundleKey', '');
    setValue('QuantityContextJSON', JSON.stringify(quantityContext));
    setValue('UnitRateContextJSON', JSON.stringify(rateValue !== null ? { value: rateValue, source: 'manual' } : null));
    setValue('EntryContextJSON', JSON.stringify(entryContext));
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowTemplate]);
    flushCommercialFitStateWrites_();
    return getCommercialFitState();
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'createCommercialFitEntry error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

function duplicateCommercialFitEntry(request) {
  const payload = request || {};
  const sourceScopeEntryId = payload.scopeEntryId ? String(payload.scopeEntryId) : '';
  if (!sourceScopeEntryId) {
    return { ok: false, error: 'Scope entry id required.' };
  }
  try {
    const result = getValidatedCommercialFitData();
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    const { sheet, headers, dataRange, rows, lastRow, lastColumn } = result;
    const index = rows.findIndex(row => row[1] === sourceScopeEntryId);
    if (index === -1) {
      return { ok: false, error: 'ENTRY_NOT_FOUND' };
    }
    const baseRow = rows[index].slice();
    const newRow = baseRow.slice();
    const newScopeEntryId = payload.newScopeEntryId ? String(payload.newScopeEntryId) : ('LINE_' + Utilities.getUuid());
    const vectorIdx = headers.indexOf('VectorCandidatesJSON');
    const canonicalIdx = headers.indexOf('Canonical');
    const canonicalValue = canonicalIdx !== -1 ? (baseRow[canonicalIdx] || '') : '';
    const titleCandidate = payload.scopeLabel && payload.scopeLabel.trim() ? payload.scopeLabel.trim() : (canonicalValue ? String(canonicalValue).trim() : '');
    const scopeLabel = titleCandidate || newScopeEntryId;
    const copyVectors = payload.copyVectorCandidates !== false;
    const setValue = function(header, value) {
      const idx = headers.indexOf(header);
      if (idx !== -1) {
        newRow[idx] = sanitizeSheetText(value);
      }
    };
    setValue('ScopeEntryId', newScopeEntryId);
    setValue('Canonical', scopeLabel);
    setValue('ChosenSku', '');
    setValue('Qty', '');
    setValue('Unit', '');
    setValue('UnitRate', '');
    setValue('QtySource', 'manual');
    setValue('WarningsJSON', '[]');
    setValue('NotesJSON', '[]');
    setValue('ManualOverride', 'TRUE');
    setValue('ParentScopeId', sourceScopeEntryId);
    if (vectorIdx !== -1) {
      const vectorSource = baseRow[vectorIdx] || '[]';
      newRow[vectorIdx] = sanitizeSheetText(copyVectors ? vectorSource : '[]');
    }
    const quantityContextIdx = headers.indexOf('QuantityContextJSON');
    if (quantityContextIdx !== -1) {
      newRow[quantityContextIdx] = sanitizeSheetText(JSON.stringify({
        qty: null,
        unit: '',
        source: 'manual',
        warnings: []
      }));
    }
    const unitRateContextIdx = headers.indexOf('UnitRateContextJSON');
    if (unitRateContextIdx !== -1) {
      newRow[unitRateContextIdx] = sanitizeSheetText(JSON.stringify(null));
    }
    const entryContextIdx = headers.indexOf('EntryContextJSON');
    if (entryContextIdx !== -1) {
      const entryContext = parseJsonSafe(newRow[entryContextIdx], {}) || {};
      entryContext.manualEntry = true;
      if (!entryContext.scopeEntry || typeof entryContext.scopeEntry !== 'object') {
        entryContext.scopeEntry = {};
      }
      entryContext.scopeEntry.manualEntry = true;
      entryContext.scopeEntry.scopeLabel = scopeLabel;
      newRow[entryContextIdx] = sanitizeSheetText(JSON.stringify(entryContext));
    }
    sheet.getRange(lastRow + 1, 1, 1, lastColumn).setValues([newRow]);
    flushCommercialFitStateWrites_();
    return getCommercialFitState();
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'duplicateCommercialFitEntry error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

function removeCommercialFitEntry(request) {
  const payload = request || {};
  const scopeEntryId = payload.scopeEntryId ? String(payload.scopeEntryId) : '';
  if (!scopeEntryId) {
    return { ok: false, error: 'Scope entry id required.' };
  }
  try {
    const sheetResult = getCommercialFitStateSheet();
    if (sheetResult.error) {
      return { ok: false, error: sheetResult.error };
    }
    const sheet = sheetResult.sheet;
    const dims = validateSheetAndGetDimensions(sheet);
    const { lastRow, lastColumn } = dims;
    if (!dims.valid) {
      return { ok: false, error: 'STATE_EMPTY' };
    }
    const range = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const rows = range.getValues();
    const filtered = rows.filter(row => String(row[1] || '') !== scopeEntryId);
    if (filtered.length === rows.length) {
      return { ok: false, error: 'ENTRY_NOT_FOUND' };
    }
    range.clearContent();
    if (filtered.length) {
      sheet.getRange(2, 1, filtered.length, lastColumn).setValues(filtered);
    }
    flushCommercialFitStateWrites_();
    return getCommercialFitState();
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'removeCommercialFitEntry error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

function reorderCommercialFitEntries(request) {
  const payload = request || {};
  const sequence = Array.isArray(payload.sequence) ? payload.sequence : [];
  if (!sequence.length) {
    return { ok: false, error: 'NO_SEQUENCE' };
  }
  try {
    const sheetResult = getCommercialFitStateSheet();
    if (sheetResult.error) {
      return { ok: false, error: sheetResult.error };
    }
    const sheet = sheetResult.sheet;
    const dims = validateSheetAndGetDimensions(sheet);
    const { lastRow, lastColumn } = dims;
    if (!dims.valid) {
      return { ok: false, error: 'STATE_EMPTY' };
    }
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const idIdx = headers.indexOf('ScopeEntryId');
    if (idIdx === -1) {
      return { ok: false, error: 'MISSING_SCOPE_ID' };
    }
    const parentIdx = headers.indexOf('ParentScopeId');
    const entryContextIdx = headers.indexOf('EntryContextJSON');
    const manualIdx = headers.indexOf('ManualOverride');
    const vectorIdx = headers.indexOf('VectorCandidatesJSON');
    const qtySourceIdx = headers.indexOf('QtySource');
    const quantityContextIdx = headers.indexOf('QuantityContextJSON');
    const unitRateContextIdx = headers.indexOf('UnitRateContextJSON');
    const qtyIdx = headers.indexOf('Qty');
    const unitIdx = headers.indexOf('Unit');
    const unitRateIdx = headers.indexOf('UnitRate');
    const bodyRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const rows = bodyRange.getValues();
    const rowMap = new Map();
    rows.forEach(row => {
      const scopeId = String(row[idIdx] || '');
      if (scopeId) {
        rowMap.set(scopeId, row.slice());
      }
    });

    const orderedRows = [];
    sequence.forEach(item => {
      if (!item || !item.scopeEntryId) {
        return;
      }
      const scopeId = String(item.scopeEntryId);
      if (!rowMap.has(scopeId)) {
        return;
      }
      const row = rowMap.get(scopeId);
      const parentId = item.parentScopeId ? String(item.parentScopeId) : '';
      if (parentIdx !== -1) {
        row[parentIdx] = sanitizeSheetText(parentId);
      }
      let context = entryContextIdx !== -1 ? parseJsonSafe(row[entryContextIdx], null) || {} : null;
      if (context) {
        if (parentId) {
          context.parentScopeId = parentId;
          if (context.scopeEntry && typeof context.scopeEntry === 'object') {
            context.scopeEntry.parentScopeId = parentId;
          }
        } else {
          if (context && typeof context === 'object' && Object.prototype.hasOwnProperty.call(context, 'parentScopeId')) {
            delete context.parentScopeId;
          }
          if (context && context.scopeEntry && typeof context.scopeEntry === 'object' && Object.prototype.hasOwnProperty.call(context.scopeEntry, 'parentScopeId')) {
            delete context.scopeEntry.parentScopeId;
          }
        }
      }
      if (manualIdx !== -1) {
        const existingManual = String(row[manualIdx] || '').toUpperCase() === 'TRUE';
        const qtySource = qtySourceIdx !== -1 ? String(row[qtySourceIdx] || '').toLowerCase() : '';
        let hasVectorCandidates = false;
        if (vectorIdx !== -1) {
          try {
            const parsedVectors = parseJsonSafe(row[vectorIdx], []);
            hasVectorCandidates = Array.isArray(parsedVectors) && parsedVectors.length > 0;
          } catch (vectorParseError) {
            hasVectorCandidates = false;
          }
        }
        const isManualEntry = context && context.scopeEntry && context.scopeEntry.manualEntry === true;
        const manualFlag = existingManual && (isManualEntry || qtySource === 'manual' || !hasVectorCandidates);
        row[manualIdx] = manualFlag ? 'TRUE' : '';
        if (context) {
          if (manualFlag) {
            if (!context.scopeEntry || typeof context.scopeEntry !== 'object') {
              context.scopeEntry = {};
            }
            context.scopeEntry.manualEntry = true;
          } else if (context.scopeEntry && Object.prototype.hasOwnProperty.call(context.scopeEntry, 'manualEntry')) {
            delete context.scopeEntry.manualEntry;
          }
        }
      }
      if (entryContextIdx !== -1 && context) {
        row[entryContextIdx] = sanitizeSheetText(JSON.stringify(context));
      }
      if (quantityContextIdx !== -1) {
        const quantityContextObj = parseJsonSafe(row[quantityContextIdx], null);
        if (quantityContextObj && typeof quantityContextObj === 'object') {
          const qtyValue = quantityContextObj.qty !== undefined && quantityContextObj.qty !== null ? Number(quantityContextObj.qty) : null;
          if (qtyIdx !== -1 && (row[qtyIdx] === '' || row[qtyIdx] === null) && qtyValue !== null && !isNaN(qtyValue)) {
            row[qtyIdx] = qtyValue;
          }
          if (unitIdx !== -1 && (row[unitIdx] === '' || row[unitIdx] === null) && quantityContextObj.unit) {
            row[unitIdx] = sanitizeSheetText(quantityContextObj.unit);
          }
          if (qtySourceIdx !== -1 && (row[qtySourceIdx] === '' || row[qtySourceIdx] === null) && quantityContextObj.source) {
            row[qtySourceIdx] = sanitizeSheetText(quantityContextObj.source);
          }
        }
      }
      if (unitRateContextIdx !== -1) {
        let unitRateContextObj = parseJsonSafe(row[unitRateContextIdx], null);
        if (unitRateContextObj && typeof unitRateContextObj === 'object') {
          const rateValue = unitRateContextObj.value !== undefined && unitRateContextObj.value !== null ? Number(unitRateContextObj.value) : null;
          if (unitRateIdx !== -1 && (row[unitRateIdx] === '' || row[unitRateIdx] === null) && rateValue !== null && !isNaN(rateValue)) {
            row[unitRateIdx] = rateValue;
          }
        } else if (unitRateIdx !== -1 && row[unitRateIdx] !== '' && row[unitRateIdx] !== null) {
          const numericRate = Number(row[unitRateIdx]);
          if (!isNaN(numericRate)) {
            unitRateContextObj = { value: numericRate, source: qtySourceIdx !== -1 ? (row[qtySourceIdx] || '') : 'manual' };
            row[unitRateContextIdx] = sanitizeSheetText(JSON.stringify(unitRateContextObj));
          }
        }
      }
      orderedRows.push(row);
      rowMap.delete(scopeId);
    });

    rowMap.forEach(row => orderedRows.push(row));

    bodyRange.clearContent();
    if (orderedRows.length) {
      sheet.getRange(2, 1, orderedRows.length, lastColumn).setValues(orderedRows);
    }
    const leftover = rows.length - orderedRows.length;
    if (leftover > 0) {
      const clearStart = 2 + orderedRows.length;
      sheet.getRange(clearStart, 1, leftover, lastColumn).clearContent();
    }

    flushCommercialFitStateWrites_();

    try {
      logAIEvent('commercial.fit.reorder', {
        updated: sequence.length,
        order: filterNullish(sequence.map(item => item && item.scopeEntryId ? item.scopeEntryId : null))
      });
    } catch (logError) {
      try { UnifiedLogger.warn('AISidebar', 'commercial.fit.reorder logging failed', String(logError)); } catch (ignore) {}
    }

    return getCommercialFitState();
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'reorderCommercialFitEntries error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

function updateCommercialFitMeta(request) {
  const payload = request || {};
  const scopeEntryId = payload.scopeEntryId ? String(payload.scopeEntryId) : '';
  if (!scopeEntryId) {
    return { ok: false, error: 'Scope entry id required.' };
  }
  try {
    const sheetResult = getCommercialFitStateSheet();
    if (sheetResult.error) {
      return { ok: false, error: sheetResult.error };
    }
    const sheet = sheetResult.sheet;
    const dims = validateSheetAndGetDimensions(sheet);
    const { lastRow, lastColumn } = dims;
    if (!dims.valid) {
      return { ok: false, error: 'STATE_EMPTY' };
    }
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const bodyRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const rows = bodyRange.getValues();
    const index = rows.findIndex(row => row[1] === scopeEntryId);
    if (index === -1) {
      return { ok: false, error: 'ENTRY_NOT_FOUND' };
    }
    const row = rows[index];
    const setValue = function(header, value) {
      const idx = headers.indexOf(header);
      if (idx !== -1) {
        row[idx] = sanitizeSheetText(value);
      }
    };
    const newLabel = payload.scopeLabel !== undefined ? String(payload.scopeLabel).trim() : null;
    const newDescription = payload.description !== undefined ? String(payload.description).trim() : null;
    if (newLabel) {
      setValue('Canonical', newLabel);
    }
    const entryContextIdx = headers.indexOf('EntryContextJSON');
    if (entryContextIdx !== -1) {
      const entryContext = parseJsonSafe(row[entryContextIdx], {}) || {};
      if (!entryContext.scopeEntry) {
        entryContext.scopeEntry = {};
      }
      if (newLabel) {
        entryContext.scopeEntry.scopeLabel = newLabel;
      }
      if (newDescription !== null) {
        entryContext.scopeEntry.description = newDescription;
      }
      row[entryContextIdx] = sanitizeSheetText(JSON.stringify(entryContext));
    }
    sheet.getRange(index + 2, 1, 1, lastColumn).setValues([row]);
    flushCommercialFitStateWrites_();
    return getCommercialFitState();
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'updateCommercialFitMeta error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

function inferSnapshotId(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const snapshot = sheet.getRange(2, 1).getValue();
    if (snapshot) {
      return snapshot;
    }
  }
  return Utilities.getUuid();
}
function refreshCommercialFitState(request) {
  try {
    const snapshot = rebuildCommercialFitSnapshot(request || {});
    return {
      ok: true,
      snapshotId: snapshot.snapshotId,
      entries: snapshot.entries,
      vectorErrors: snapshot.vectorErrors,
      requiresReapproval: true,
      warning: snapshot.warning,
      vectorMatchPagerEnabled: snapshot.vectorMatchPagerEnabled
    };
  } catch (error) {
    try { UnifiedLogger.warn('AISidebar', 'refreshCommercialFitState error', String(error)); } catch (ignore) {}
    return { ok: false, error: String(error) };
  }
}

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function findBestFallbackMatch_(entry, pool) {
  if (!entry || !Array.isArray(pool) || pool.length === 0) {
    return null;
  }
  // Heuristic: Match by exact Label + Section
  // If IDs changed (slug generation), the Label usually triggered it, but maybe Section stayed same.
  // Or Label stayed same but Section changed.
  
  const entryLabel = (entry.scopeLabel || entry.name || '').trim().toLowerCase();
  // entry.sectionId might be an ID like 'section-1'. We prefer canonical or label if available.
  
  // 1. Try exact label match (assuming ID changed due to something else like parent ID change)
  let match = pool.find(item => {
      const itemLabel = (item.entry && item.entry.scopeLabel ? item.entry.scopeLabel : (item.scopeName || ''));
      return String(itemLabel).trim().toLowerCase() === entryLabel;
  });
  if (match) return match;
  
  // 2. Try similarity if label changed slightly (e.g. typo fix)
  // This is expensive to do properly in JS without a library, so we'll stick to a simple containment check
  match = pool.find(item => {
      const itemLabel = (item.entry && item.entry.scopeLabel ? item.entry.scopeLabel : (item.scopeName || '')).toLowerCase();
      // Check if one contains the other (e.g. "Video Edit" vs "Video Editing")
      return (itemLabel.includes(entryLabel) || entryLabel.includes(itemLabel)) && 
             itemLabel.length > 5 && entryLabel.length > 5;
  });
  return match || null;
}

try {
  if (typeof globalThis !== 'undefined') {
  }
} catch (ignored) {
      // UnifiedLogger unavailable during bootstrap
    }

const VECTOR_SKU_PATTERN = /^[A-Z0-9\-_/\.]+$/;

function safeLookupItem(sku) {
  const normalized = normalizeSku(sku);
  if (!normalized || typeof lookupItem !== 'function') {
    return null;
  }
  try {
    return lookupItem(normalized);
  } catch (error) {
    UnifiedLogger.info('safeLookupItem failed for ' + normalized + ': ' + error);
    return null;
  }
}

function objectHasContent(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.keys(value).length > 0;
}

/**
 * Build the scope-draft prompt for the LLM.
 * @param {Object} context
 * @param {string=} overrideUserContent
 * @return {Array<Object>}
 */
function buildScopeDraftPrompt(context, overrideUserContent) {
  const evidenceInstruction = (context.answers && context.answers.length)
    ? 'Review the brief, attachments, and the provided human answers to determine the actual scopes of work the agency must cover.'
    : 'Review the brief and attachments to determine the actual scopes of work the agency must cover.';

  const summaries = (context.pdfSummaries || []).map(function(file) {
    const textSnippet = file && file.text
      ? truncate(String(file.text).replace(/\s+/g, ' ').trim(), 800)
      : '(no text extracted)';
    return '- ' + file.fileName + ' (' + (file.length || 0) + ' chars)\n  ' + textSnippet;
  });
  const answers = Array.isArray(context.answers) ? context.answers : [];
  const scopeClientSignalsText = formatClientContextForPrompt(context.clientContext);
  const briefProfile = context.briefProfile || getBriefProfile(BRIEF_TYPE_DEFAULT);
  const briefSectionOrder = Array.isArray(context.sectionPriority) && context.sectionPriority.length
    ? context.sectionPriority.join(', ')
    : 'Discovery & Strategic Alignment, Concept & Creative Development, Production & Live Execution';
  const briefNudge = 'Brief Type: ' + briefProfile.label + '. ' + briefProfile.nudge;
  const phaseCanonicals = getScopePhaseCanonicals(context.briefType);
  const canonicalPhaseInstruction = phaseCanonicals.length
    ? 'If possible, set the `canonical` field on each section to one of these phase IDs: ' + phaseCanonicals.join(', ') + '.'
    : 'This brief type has no configured canonical phase IDs; describe each section clearly.';
  const phaseGuidanceText = buildPhaseGuidanceForPrompt(context.briefType);
  const phaseDefinitionsBlock = buildPhaseDefinitionsBlock(context);

  // Refactored 2026-01-10: Flat array example with 8 fields (CONTRACT_20260110_190200 Phase 1 D1.3)
  // Updated 2026-01-18: Added explicit line item label distinction to prevent section label reuse
  // Pattern from App-script/AISidebar.js:8483 (example structure for LLM)
  const scopeSectionBlueprint = [
    'Example structure (FLAT array with 8 fields per entry):',
    '{',
    '  "projectName": "Atlas 6m campaign",',
    '  "briefType": "campaign",',
    '  "scopeEntries": [',
    '    {',
    '      "label": "Asset Development",  // Section label: phase/category name',
    '      "canonical": "asset-development",',
    '      "isSection": true,',
    '      "deliverables": ["Hero film concept", "Messaging pillars"],',
    '      "notes": ["Translate brand KPIs into story cues"],',
    '      "signals": ["strategy", "creative"],',
    '      "resources": "Creative Director, Strategy Director",',
    '      "sourceExcerpt": "Brief mentions hero film concept with messaging framework"',
    '    },',
    '    {',
    '      "label": "Hero film story and messaging",  // Line item label: UNIQUE, specific deliverable (NOT "Asset Development")',
    '      "canonical": "asset-development",',
    '      "isSection": false,',
    '      "deliverables": ["Concept deck", "Execution brief"],',
    '      "notes": ["Includes client workshop and validation"],',
    '      "signals": ["storytelling", "messaging"],',
    '      "resources": "Editor, Creative Producer",',
    '      "sourceExcerpt": "Define hero film story with usage guardrails"',
    '    }',
    '  ],',
    '  "warnings": ["Usage rights duration pending confirmation"],',
    '  "assumptions": ["Client owns theme music rights"]',
    '}'
  ].join('\n');

  const primaryConstraints = [
    'Primary constraints:',
    '- Anti-Blob constraint: keep `description` and `notes` concise (≤15 words), split deliverables that contain “and” into separate items, and emit one item per distinct deliverable.',
    '- Phase coverage rule: ensure each detected canonical phase (especially Measurement, Distribution, and Deliverable Management) has an explicit section and at least one supporting item.'
  ];
  const evidenceRules = [
    'Evidence rules:',
    '- Capture counts, deliverables, usage, budget hints, warnings, and approvals implied by the brief and attachments on either the section or item level.',
    '- Cite supporting evidence in `deliverables`, `resources`, `notes`, or `signals` so each line is traceable.',
    '- Operationalize constraints: If the brief mentions specific vendors, travel requirements, or mandated tools, create explicit resource lines for them (e.g. "Travel Allowance", "Vendor: X") or add them to `assumptions`, do not hide them in `notes`.',
    '- Do not invent numbers; leave numeric estimates null or empty and surface the gap with warnings (not questions).',
    '- Keep arrays to at most 12 entries and trim strings to 120 characters.',
    '- Treat synonyms or related phrases as valid evidence for each canonical—e.g., activation/storyboard language for Production / Capture, coverage metrics for Measurement, asset ops or versioning for Deliverable Management, and planning language for Strategy.'
  ];
  // Refactored 2026-01-10: Simplified to request flat array (CONTRACT_20260110_190200 Phase 1)
  // Pattern from App-script/AISidebar.js:8530 (structure rules for LLM output)
  const structureRules = [
    'Structure rules:',
    '- Return a FLAT array in `scopeEntries` field (NOT nested sections with items arrays).',
    '- Each entry is standalone: sections have `isSection: true`, line items have `isSection: false`.',
    '- Ordering rule: List section entry first, then all its line items, then next section entry, then its line items, etc.',
    '- Each entry requires exactly 8 fields: `label` (string, max 120 chars), `canonical` (phase ID from approved list), `isSection` (boolean), `deliverables` (array, max 10 items), `notes` (array, max 8 items), `signals` (array, max 6 items), `resources` (string or array), `sourceExcerpt` (string, max 120 chars quoting brief).',
    '- CRITICAL: Line items (isSection: false) MUST have UNIQUE labels describing the specific deliverable work (e.g. "Annual social media strategy document", "Monthly content calendars"). NEVER reuse the parent section\'s label for line items. Each line item represents a distinct deliverable or activity.',
    '- Keep descriptions focused on the work being done and avoid bundling unrelated deliverables into the same item.'
  ];
  const systemPromptLines = [
    'You are hrmny\'s scope analyst persona. ' + evidenceInstruction,
    briefNudge,
    'This extraction follows the ' + briefProfile.label + ' taxonomy; emphasise its deliverables and signals.',
    canonicalPhaseInstruction,
    phaseGuidanceText ? 'Phase guidance for this brief:\n' + phaseGuidanceText : '',
    phaseDefinitionsBlock ? phaseDefinitionsBlock : '',
    'Only create sections and items when the inputs provide supporting evidence (deliverables, obligations, timelines, resources, or client requirements). Interpret synonyms or implied actions as valid evidence so long as the text reflects a billable activity and references timing/ownership.',
    'After confirming each evidenced scope, categorise it into the matching sections from this brief profile: ' + briefSectionOrder + '. When possible, set the `canonical` to one of the configured phase IDs.',
    'Return only the FLAT array JSON described above; omit any extra narrative or schema explanation.',
    ...primaryConstraints,
    ...evidenceRules,
    ...structureRules,
    'Respond only with the structured JSON that follows the blueprint provided above.'
  ];
  systemPromptLines.push(scopeSectionBlueprint);
  const systemPrompt = systemPromptLines.join('\n');

  const userSections = [];
  userSections.push('### Brief\n' + (context.briefText || '(no manual brief provided)'));
  if (Array.isArray(context.signatureCues) && context.signatureCues.length) {
    userSections.push('### Signature Cues\n- ' + context.signatureCues.join('\n- '));
  }
  userSections.push('### Attached PDF Summaries\n' + (summaries.length > 0 ? summaries.join('\n') : '(no PDFs attached)'));
  userSections.push(answers.length > 0
    ? '### Human Answers\n' + answers.map(function(entry) {
        return 'Q: ' + entry.question + '\nA: ' + entry.answer;
      }).join('\n')
    : '### Human Answers\n(none)');
  userSections.push(scopeClientSignalsText ? '### Client Signals\n' + scopeClientSignalsText : '### Client Signals\n(none)');
  const mandatoryEvidenceSection = buildMandatoryEvidenceSection(context);
  if (mandatoryEvidenceSection) {
    userSections.push(mandatoryEvidenceSection);
  }

  const userPrompt = overrideUserContent ? overrideUserContent : userSections.join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
}

/**
 * Build the commercial plan prompt for the LLM.
 * @param {Object} context
 * @param {string=} overrideUserContent
 * @return {Array<Object>}
 */
function buildPlanPrompt(context, overrideUserContent) {
  const personaRole = context.persona || 'proposal-author';
  const personaPrompts = {
    'proposal-author': "You are hrmny's proposal author persona. Translate the approved scope into a commercially resilient quote plan that stays within contract, preserves margin, and reads professionally.",
    'managing-director': "You are hrmny's commercial controller. Convert each approved scope entry into a client-ready structure that protects margin, surfaces risks, and rejects the plan if contractual coverage is missing.",
    'analyst': "You are hrmny's scope analyst persona. Focus on translating the approved scope map into auditable quote instructions."
  };

  const clientSignalsText = formatClientContextForPrompt(context.clientContext);
  const briefProfile = context.briefProfile || getBriefProfile(BRIEF_TYPE_DEFAULT);
  const briefNudge = 'Brief Type: ' + briefProfile.label + '. ' + briefProfile.nudge;
  const briefType = context.briefType || BRIEF_TYPE_DEFAULT;
  const phaseGuidanceText = buildPhaseGuidanceForPrompt(briefType);

  const catalogHints = context.catalogContext || [];
  const catalogSection = catalogHints.length > 0
    ? truncate(catalogHints.map(function(item) {
        const sku = item && item.sku ? item.sku : '(no sku)';
        const name = item && item.name ? item.name : '(no name)';
        const price = item && item.sellPrice !== undefined && item.sellPrice !== null && item.sellPrice !== ''
          ? ' (AED ' + item.sellPrice + ')'
          : '';
        const description = item && item.description ? item.description : '';
        return sku + ': ' + name + price + ' - ' + description.slice(0, 120);
      }).join('\n'), 2000)
    : '(catalog hints unavailable)';

  const derivedSignals = (context.signalLayers && Array.isArray(context.signalLayers.derived))
    ? context.signalLayers.derived.slice(0, 8)
    : [];
  const derivedSignalLines = derivedSignals.map(function(entry) {
    const evidence = Array.isArray(entry.evidence) && entry.evidence.length > 0
      ? entry.evidence.slice(0, 2).map(function(e) { return truncate(e, 80); }).join('; ')
      : 'No evidence recorded';
    return '- ' + entry.canonical + ' (score ' + (entry.score || 0).toFixed(2) + '): ' + evidence;
  });
  const automatedContext = context.signalLayers && context.signalLayers.automated ? context.signalLayers.automated : {};
  const overridesContext = context.signalLayers && context.signalLayers.overrides ? context.signalLayers.overrides : {};
  const automatedLines = [];
  if (Array.isArray(automatedContext.industries) && automatedContext.industries.length > 0) {
    automatedLines.push('Industries: ' + automatedContext.industries.map(formatSignalEntry).join('; '));
  }
  if (Array.isArray(automatedContext.regions) && automatedContext.regions.length > 0) {
    automatedLines.push('Regions: ' + automatedContext.regions.map(formatSignalEntry).join('; '));
  }
  if (Array.isArray(automatedContext.expectations) && automatedContext.expectations.length > 0) {
    automatedLines.push('Expectations: ' + automatedContext.expectations.map(formatSignalEntry).join('; '));
  }
  if (Array.isArray(automatedContext.riskFlags) && automatedContext.riskFlags.length > 0) {
    automatedLines.push('Risk Flags: ' + automatedContext.riskFlags.map(formatSignalEntry).join('; '));
  }
  const overridesText = Object.keys(overridesContext || {}).length > 0
    ? truncate(JSON.stringify(overridesContext, null, 2), 800)
    : '(no manual overrides)';
  const signalLayerSection = [
    'Derived Scope Signals:',
    derivedSignalLines.length > 0 ? derivedSignalLines.join('\n') : '- None detected.',
    '',
    'Automated Client Signals:',
    automatedLines.length > 0 ? automatedLines.join('\n') : '- None detected.',
    '',
    'Reviewer Overrides:',
    overridesText
  ].join('\n');

  const contractEntriesSummary = Array.isArray(context.contractEntries) ? context.contractEntries : [];
  const contractEntriesText = contractEntriesSummary.length > 0
    ? truncate(JSON.stringify(contractEntriesSummary, null, 2), 4500)
    : '[]';
  const quantitySignalsLines = (contractEntriesSummary || []).map(function(entry) {
    if (!entry) {
      return '';
    }
    const entryId = entry.id || entry.label || entry.scopeLabel || entry.canonical || 'scope-entry';
    const signals = Array.isArray(entry.quantitySignals) ? entry.quantitySignals : [];
    if (!signals.length) {
      return '';
    }
    const parts = filterTruthy(signals.slice(0, 4).map(function(signal) {
      if (!signal) {
        return '';
      }
      const valueText = signal.value !== undefined && signal.value !== null
        ? signal.value + (signal.unit ? ' ' + signal.unit : '')
        : '';
      const primaryMarker = signal.primary ? '*' : '';
      return (primaryMarker + valueText).trim() + (signal.label ? ' (' + signal.label + ')' : '');
    }));
    if (!parts.length) {
      return '';
    }
    return entryId + ': ' + parts.join('; ');
  });
  const filteredSignalsLines = filterTruthy(quantitySignalsLines);
  const quantitySignalsText = filteredSignalsLines.length
    ? filteredSignalsLines.join('\n')
    : '(no quantity signals detected)';
  const scenarioHighlightLines = (contractEntriesSummary || []).map(function(entry) {
    if (!entry) {
      return '';
    }
    const entryId = entry.id || entry.label || entry.canonical || 'scope-entry';
    const highlights = Array.isArray(entry.scenarioHighlights) ? entry.scenarioHighlights : [];
    if (!highlights.length) {
      return '';
    }
    return entryId + ': ' + highlights.slice(0, 3).join('; ');
  });
  const filteredHighlightLines = filterTruthy(scenarioHighlightLines);
  const scenarioHighlightsText = filteredHighlightLines.length
    ? filteredHighlightLines.join('\n')
    : '(no scenario highlights detected)';
  const lockedSkuText = buildLockedSkuPrompt(context.commercialFit && context.commercialFit.entries);
  const commercialConstraintsText = truncate(JSON.stringify(context.commercialConstraints || {}, null, 2), 2000);

  const expectedSections = Array.isArray(briefProfile.sectionOrder) && briefProfile.sectionOrder.length
    ? briefProfile.sectionOrder
    : context.defaults.sections;
  const defaultsSectionLines = [
    'Currency: ' + context.defaults.currency,
    'TaxType: ' + (context.defaults.taxType || 'unspecified'),
    'Expected Sections: ' + expectedSections.join(', ')
  ];
  if (Array.isArray(context.optionalSections) && context.optionalSections.length) {
    defaultsSectionLines.push('Optional Sections: ' + context.optionalSections.join(', '));
  }
  const defaultsSection = defaultsSectionLines.join('\n');

  const outputBlueprint = [
    '{',
    '  "status": "ok",',
    '  "projectName": "",',
    '  "clientName": "",',
    '  "currency": "",',
    '  "taxType": "",',
    '  "sections": [',
    '    {',
    '      "sectionName": "",',
    '      "scopeEntryId": "",',
    '      "canonical": "",',
    '      "justification": "",',
    '      "items": [',
    '        {',
    '          "scopeEntryId": "",',
    '          "description": "",',
    '          "qty": 0,',
    '          "unit": "",',
    '          "unitRate": 0,',
    '          "clientAmount": 0,',
    '          "internalCost": null,',
    '          "sku": null,',
    '          "visibility": "Client",',
    '          "warnings": []',
    '        }',
    '      ],',
    '      "sectionWarnings": [],',
    '      "marginSummary": ""',
    '    }',
    '  ],',
    '  "fees": [],',
    '  "warnings": [],',
    '  "assumptions": []',
    '}'
  ].join('\n');

  const systemPromptParts = [
    personaPrompts[personaRole] || personaPrompts['proposal-author'],
    briefNudge,
    'Always query the hrmny catalog vector store retrieval before selecting SKUs; never guess or fabricate catalog codes.',
    'Respect the approved commercial-fit matches: produce exactly one line item per scope entry using its locked SKU, section, quantity, unit, and visibility. If no SKU is locked, leave it null and add a warning—never invent or drop scope.',
    'You will receive structured JSON inputs: `contractEntries` (approved scope summary), `commercialConstraints`, `catalogHints`, `clientSignals`, and global defaults.',
    'Never invent scope or SKUs; set qty/unitRate to null and add a warning when data is missing.',
    'Create a commercial plan that maps each approved scope entry to sections and items without inventing new scope.',
    'Group sections by canonical (workflow phase). Each section MUST relate to a single canonical; do not merge unrelated phases.',
    'For every entry in `contractEntries`, produce one or more items in the matching section. Always set `items[].scopeEntryId` to the source entry id.',
    'Use quantities, hours, and rates from the approved entry resources. Compute `clientAmount = qty × unitRate`. If you cannot determine rate or quantity, leave the numeric field null and add a warning.',
    'Consult `contractEntries[].quantitySignals`, `scenarioHighlights`, and `usageSummary` to align each line item to real scope counts (models, usage months, studio days, etc.).',
    'If a resource is flagged internal, treat its rate as internal cost; otherwise assume internalCost is null unless data is provided.',
    'Reference the target margin in `commercialConstraints.targetMarginPct` and summarise variance in `marginSummary` for each section.',
    'If `commercialConstraints.approvalsPending` contains an entry id, add a section warning and include it in top-level warnings.',
    'Use the hrmny catalog retrieval tools to map each scope entry to a catalog SKU. Prefer retrieval results and cross-check against `catalogHints`; if nothing relevant is returned, leave `sku` null and add a warning.',
    'Respect the `Locked SKUs` guidance for each scope entry. Do not replace or remove these SKU selections.',
    'Populate `justification` with a single sentence citing the scope entry id and key deliverables or resources.',
    'If contractual coverage is missing or risks require escalation, return {"status": "rejected", "reasons": []} instead of sections.',
    'Limit arrays to 10 entries and keep strings ≤120 characters. Escape newlines as \\n and double quotes as \\".',
    'Return strict JSON matching the provided blueprint—no Markdown, comments, or narrative.'
  ];
  if (phaseGuidanceText) {
    systemPromptParts.push('Phase guidance for this brief:\n' + phaseGuidanceText);
  }
  if (personaRole === 'managing-director') {
    systemPromptParts.push('You are accountable for commercial integrity. Reject the plan if mandatory approvals are missing or target margin cannot be met.');
  }
  const systemPrompt = systemPromptParts.join('\n');
  const commercialFitSummary = buildCommercialFitSummary(context.commercialFit && context.commercialFit.entries);

  const userPromptParts = overrideUserContent ? [overrideUserContent] : [
    '### Defaults',
    defaultsSection,
    '',
    '### Approved Entries (contract summary)',
    contractEntriesText,
    '',
    '### Scope Quantity Signals (* marks primary)',
    quantitySignalsText,
    '',
    '### Scenario Highlights',
    scenarioHighlightsText,
    '',
    '### Commercial Fit Snapshot',
    commercialFitSummary,
    '',
    '### Locked SKUs',
    lockedSkuText,
    '',
    '### Commercial Constraints',
    commercialConstraintsText,
    '',
    '### Catalog Hints',
    catalogSection,
    '',
    '### Client Signals',
    clientSignalsText ? clientSignalsText : '(no client signals provided)',
    '',
    '### Signal Layers',
    signalLayerSection,
    '',
    '### Output Blueprint (strict schema)',
    outputBlueprint,
    '',
    '### Brief',
    context.briefText || '(no manual brief provided)'
  ];

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPromptParts.join('\n') }
  ];
}

/**
 * Provide Drive Picker credentials for the sidebar.
 * @return {{token: string, developerKey: (string|null)}}
 */
function launchDrivePicker() {
  let developerKey = '';
  try {
    developerKey = requireSecret('GOOGLE_PICKER_KEY');
  } catch (secretError) {
    UnifiedLogger.info('launchDrivePicker: GOOGLE_PICKER_KEY missing or not set in Script Properties: ' + secretError);
  }
  const developerKeyPresent = !!(developerKey && String(developerKey).trim());
  developerKey = developerKeyPresent ? String(developerKey).trim() : '';
  if (!developerKeyPresent) {
    UnifiedLogger.info('launchDrivePicker: continuing without Drive Picker developer key.');
  }

  // Touch Drive to ensure the OAuth token includes Drive scopes.
  try {
    DriveApp.getRootFolder();
  } catch (driveError) {
    UnifiedLogger.info('launchDrivePicker: Drive scope check failed: ' + driveError);
  }

  let token;
  try {
    token = ScriptApp.getOAuthToken();
  } catch (error) {
    throw new AppError('PICKER_AUTH', 'Unable to acquire OAuth token for Drive Picker.', 'Reopen the sidebar or re-authorize the script.');
  }

  if (!token) {
    throw new AppError('PICKER_AUTH', 'OAuth token missing for Drive Picker.', 'Reopen the sidebar or re-authorize the script.');
  }

  let projectNumber = '';
  try {
    projectNumber = ScriptApp.getProjectNumber ? String(ScriptApp.getProjectNumber()) : '';
  } catch (error) {
    UnifiedLogger.info('launchDrivePicker: unable to read project number: ' + error);
  }

  try {
    logAIEvent('picker.launch', {
      runType: 'picker',
      outcome: 'requested',
      auditMeta: {
        projectNumber: projectNumber || '',
        developerKeyPresent: developerKeyPresent
      }
    });
  } catch (logError) {
    UnifiedLogger.info('launchDrivePicker: logAIEvent failed: ' + logError);
  }

  return {
    token: token,
    developerKey: developerKeyPresent ? developerKey : null,
    appId: projectNumber || ''
  };
}

function buildRepairPrompt(rawContent, parseError, context, details) {
  const mode = context && context.mode ? context.mode : 'plan';
  let schemaHint = 'projectName, clientName, currency, taxType, sections[], fees[], retainers[], campaigns[], warnings[], assumptions[]';
  if (mode === 'scope-draft') {
    schemaHint = 'projectName, clientName, mediaType, deliverables[], locations[], services[], retainers[], campaigns[], channels[], talent{count,requirements[],notes}, usage{durationMonths,region,notes}, shootDays, budget{target,currency,notes}, schedule{keyDates[],notes}, reporting{cadence,metrics[],notes}, warnings[], questions[]';
  }
  const truncatedContent = rawContent ? truncate(rawContent, 1000) : '';
  const errorText = (parseError || '').toString();
  const schemaViolation = errorText.indexOf('__SCOPE_SCHEMA__') !== -1;
  const cleanedError = schemaViolation ? errorText.replace('__SCOPE_SCHEMA__:', '').trim() : errorText;
  const errorLabel = schemaViolation ? 'Schema violation' : 'Parsing error';
  const detailLine = schemaViolation ? 'Violation details: ' + cleanedError : '';
  let schemaContext = '';
  if (schemaViolation && context && context.schema) {
    schemaContext = '\nSchema (trimmed):\n' + truncate(JSON.stringify(context.schema), 1800) + '\nEnsure scopeEntries is present and contains at least one object.';
  }
  const attemptLines = details && Array.isArray(details.attempts) && details.attempts.length
    ? ['Parse attempts (trimmed):'].concat(
        details.attempts.map(function(attempt, index) {
          const trimmed = truncate(attempt, 600);
          return (index + 1) + '. ' + (trimmed || '(empty attempt)');
        })
      )
    : [];
  const payloadKeyLine = details && details.payloadKey
    ? 'Reference log payload key: ' + details.payloadKey
    : '';
  return [
    'The previous response could not be parsed as JSON or violated required schema rules.',
    errorLabel + ': ' + cleanedError,
    detailLine,
    payloadKeyLine,
    'Original content (truncated to 1000 chars):',
    truncatedContent,
    '',
    attemptLines.join('\n'),
    '',
    schemaContext,
    'Please return only valid JSON matching the required schema (' + schemaHint + ').'
  ];
  return filterTruthy(parts).join('\n');
}

function captureJsonRepairContext(rawText, attempts, payloadKey) {
  const trimmedAttempts = Array.isArray(attempts)
    ? attempts.slice(0, 6).map(function(entry) {
        return typeof entry === 'string' ? entry : '';
      })
    : [];
  return {
    attempts: trimmedAttempts,
    payloadKey: payloadKey || '',
    raw: truncate(rawText, 1600)
  };
}

/**
 * Normalize and validate plan object.
 * @param {Object} plan
 * @return {Object}
 */
/**
 * Build placeholder sections when the plan omits coverage.
 * @param {Object} approvedScope
 * @param {Array<string>} requiredCategories
 * @return {Array<Object>}
 */
function buildFallbackSectionsFromScope(approvedScope, requiredCategories) {
  const sections = [];
  const seenLabels = new Set();
  const maxSections = Math.min(LLM_MAX_ARRAY_ITEMS, 8);

  const addSection = label => {
    if (!label || sections.length >= maxSections) {
      return;
    }
    const safeLabel = String(label).trim();
    if (!safeLabel) {
      return;
    }
    const normalized = normalizeSectionLabel(safeLabel);
    const labelKey = (normalized.label || safeLabel).toLowerCase();
    if (seenLabels.has(labelKey)) {
      return;
    }
    seenLabels.add(labelKey);
    sections.push({
      name: normalized.label || safeLabel,
      visibility: 'Client',
      items: []
    });
  };

  if (Array.isArray(requiredCategories) && requiredCategories.length > 0) {
    AI_MANDATORY_CATEGORIES.forEach(cat => {
      if (cat && requiredCategories.indexOf(cat.canonical) !== -1) {
        addSection(cat.label);
      }
    });
  }

  if (sections.length === 0) {
    const deliverables = Array.isArray(approvedScope && approvedScope.deliverables) ? approvedScope.deliverables : [];
    deliverables.slice(0, maxSections).forEach((entry, index) => {
      let label = '';
      if (typeof entry === 'string') {
        label = entry;
      } else if (entry && typeof entry === 'object') {
        label = entry.name || entry.title || entry.type || '';
      }
      if (!label) {
        label = `Deliverable ${index + 1}`;
      }
      addSection(label);
    });
  }

  if (sections.length === 0) {
    const services = Array.isArray(approvedScope && approvedScope.services) ? approvedScope.services : [];
    services.slice(0, maxSections).forEach(service => addSection(service));
  }

  if (sections.length === 0) {
    addSection('Scope Overview');
  }

  return sections;
}

/**
 * Ensure the AI plan respects the approved scope, adding warnings or throwing if mismatched.
 * @param {Object} plan
 * @param {Object} approvedScope
 */
function inferTalentCountFromPlan(plan) {
  if (!plan || !Array.isArray(plan.sections)) {
    return 0;
  }
  let total = 0;
  plan.sections.forEach(section => {
    (section.items || []).forEach(item => {
      const qty = toNumber(item.qty, 0);
      const name = (item.description || item.clientLineName || '').toLowerCase();
      if (qty > 0 && /talent|model/.test(name)) {
        total += qty;
      }
    });
  });
  return total;
}

function extractPackageDays(text) {
  const match = (text || '').match(/(\d+(?:\.\d+)?)\s*(day|days|dy)/i);
  if (!match) {
    return 0;
  }
  const value = parseFloat(match[1]);
  return isNaN(value) ? 0 : value;
}

/**
 * Truncate a string for logging purposes.
 * @param {string} value
 * @param {number} max
 * @return {string}
 */
const AI_LOG_PAYLOAD_MAX_CHARS = 9000;
const AI_LOG_PAYLOAD_CHUNK_SIZE = 8000;
const AI_LOG_PAYLOAD_MAX_CHUNKS = 8;
const AI_LOG_PAYLOAD_KEY_PREFIX = 'LLM_PAYLOAD_';
const AI_LOG_PAYLOAD_LIMIT_ENABLED_PROP = 'LLM_LOG_PAYLOAD_LIMIT_ENABLED';

// Note: Using shared truncate() from 00_StringUtils.js

/**
 * Safely resolve the active user's email, even in headless contexts.
 * @return {string}
 */
function getActiveUserEmailSafe() {
  try {
    const user = Session.getActiveUser();
    if (user && typeof user.getEmail === 'function') {
      const email = user.getEmail();
      if (email && email.indexOf('@') !== -1) {
        return email;
      }
    }
  } catch (error) {
    UnifiedLogger.info('getActiveUserEmailSafe: ' + error);
  }

  try {
    const props = PropertiesService.getUserProperties();
    const fallback = props ? props.getProperty('DEFAULT_USER_EMAIL') : '';
    if (fallback) {
      return fallback;
    }
  } catch (propError) {
    UnifiedLogger.info('getActiveUserEmailSafe (properties): ' + propError);
  }

  return 'unknown@local';
}

const SIDEBAR_STATE_PAYLOAD_TRUNCATION_MARKER = '…';

function parseSidebarStatePayload(rawPayload) {
  if (!rawPayload) {
    return null;
  }
  const payloadText = String(rawPayload).trim();

  // Skip empty or whitespace-only payloads (common in 1000+ row sheets)
  if (!payloadText || payloadText.length === 0) {
    return null;
  }

  // Skip truncated payloads
  if (payloadText.indexOf(SIDEBAR_STATE_PAYLOAD_TRUNCATION_MARKER) !== -1) {
    return null;
  }

  let lastError = '';
  const tryParse = function(text) {
    const result = safeJsonParse(text, null);
    if (result === null) {
      lastError = 'JSON parse failed';
    }
    return result;
  };

  const parsedDirect = tryParse(payloadText);
  if (parsedDirect) {
    return parsedDirect;
  }

  const trimmed = payloadText.trim();
  if (trimmed && trimmed !== payloadText) {
    const parsedTrimmed = tryParse(trimmed);
    if (parsedTrimmed) {
      return parsedTrimmed;
    }
  }

  const lastBrace = payloadText.lastIndexOf('}');
  const lastBracket = payloadText.lastIndexOf(']');
  const cutoff = Math.max(lastBrace, lastBracket);
  if (cutoff > 0) {
    const candidate = payloadText.substring(0, cutoff + 1).trimEnd();
    const parsedCandidate = tryParse(candidate);
    if (parsedCandidate) {
      return parsedCandidate;
    }
  }

  const positionMatch = /position (\d+)/.exec(lastError);
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    if (!Number.isNaN(position) && position > 0 && position < payloadText.length) {
      const truncated = payloadText.substring(0, position).trimEnd();
      const parsedTruncated = tryParse(truncated);
      if (parsedTruncated) {
        return parsedTruncated;
      }
    }
  }

  const firstObject = payloadText.indexOf('{');
  const firstArray = payloadText.indexOf('[');
  const start = Math.min(firstObject === -1 ? payloadText.length : firstObject, firstArray === -1 ? payloadText.length : firstArray);
  if (start > 0 && start < payloadText.length) {
    const fromStart = payloadText.substring(start).trim();
    const parsedFromStart = tryParse(fromStart);
    if (parsedFromStart) {
      return parsedFromStart;
    }
  }

  if (lastError) {
    UnifiedLogger.info('parseSidebarStatePayload failed: ' + lastError);
  }
  return null;
}

function isAILogPayloadLimitEnabled() {
  return getBooleanScriptProperty(AI_LOG_PAYLOAD_LIMIT_ENABLED_PROP, true);
}

function generatePayloadKey() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).substring(2, 8);
  return AI_LOG_PAYLOAD_KEY_PREFIX + timestamp + '_' + random;
}

function persistLargePayload(baseKey, text) {
  if (!baseKey || !text) {
    return '';
  }
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    const chunkCount = Math.min(Math.ceil(text.length / AI_LOG_PAYLOAD_CHUNK_SIZE), AI_LOG_PAYLOAD_MAX_CHUNKS);
    let cursor = 0;
    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = text.substring(cursor, cursor + AI_LOG_PAYLOAD_CHUNK_SIZE);
      const validation = validatePropertySize(chunk, 9000);
      if (!validation.valid) {
        UnifiedLogger.warn('PropertyWrite', 'Chunk payload too large', {
          baseKey: baseKey,
          chunkIndex: index,
          size: validation.size,
          message: validation.message
        });
        // Skip this chunk to prevent truncation
        cursor += AI_LOG_PAYLOAD_CHUNK_SIZE;
        continue;
      }
      props.setProperty(baseKey + '_' + index, chunk);
      cursor += AI_LOG_PAYLOAD_CHUNK_SIZE;
    }
    props.setProperty(baseKey + '_chunks', String(chunkCount));
    return baseKey;
  } catch (error) {
    UnifiedLogger.info('persistLargePayload failed: ' + error);
    return '';
  }
}

const SIDEBAR_STATE_COLUMNS = [
  'Id',
  'User',
  'Type',
  'Label',
  'Payload',
  'PayloadPart2',
  'PayloadPart3',
  'PayloadPart4',
  'PayloadPart5',
  'PayloadPart6',
  'PayloadPart7',
  'PayloadPart8',
  'PayloadPart9',
  'PayloadPart10',
  'Timestamp'
];
const SIDEBAR_STATE_COLUMN_COUNT = SIDEBAR_STATE_COLUMNS.length;
const SIDEBAR_STATE_PAYLOAD_START_INDEX = 4;
const SIDEBAR_STATE_PAYLOAD_COLUMN_COUNT = SIDEBAR_STATE_COLUMN_COUNT - SIDEBAR_STATE_PAYLOAD_START_INDEX - 1;
const SIDEBAR_STATE_PAYLOAD_MAX_CHARS = 45000;

function prepareLogPayload(payload) {
  let raw = '{}';
  try {
    raw = JSON.stringify(payload || {});
  } catch (error) {
    raw = '{"error":"Unable to stringify payload."}';
  }
  const truncated = raw.length > AI_LOG_PAYLOAD_MAX_CHARS;
  let text;
  if (truncated) {
    text = truncate(raw, AI_LOG_PAYLOAD_MAX_CHARS, SIDEBAR_STATE_PAYLOAD_TRUNCATION_MARKER);
  } else {
    text = raw;
  }
  return { raw: raw, text: text, truncated: truncated };
}

/**
 * Append an entry to the AI log sheet.
 * @param {string} eventType
 * @param {Object} payload
 */
function logAIEvent(eventType, payload) {
  try {
    const sheet = ensureAILogSheet();
    const runType = payload && payload.runType ? String(payload.runType) : '';
    const outcome = payload && payload.outcome ? String(payload.outcome) : '';
    const auditMeta = payload && payload.auditMeta ? payload.auditMeta : {};
    const logPayload = prepareLogPayload(payload);
    let payloadKey = '';
    if (logPayload.truncated && isAILogPayloadLimitEnabled()) {
      payloadKey = persistLargePayload(generatePayloadKey(), logPayload.raw);
    }
    const auditMetaForLog = Object.assign({}, auditMeta);
    if (payloadKey) {
      auditMetaForLog.payloadKey = payloadKey;
      auditMetaForLog.payloadTruncated = true;
    }
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
  } catch (error) {
    UnifiedLogger.info('Unable to log AI event: ' + error);
  }
}

/**
 * Ensure the AI log sheet exists.
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function ensureAILogSheet() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName('_AI_LOG');
  const headers = ['Timestamp', 'User', 'Event', 'RunType', 'Outcome', 'Payload', 'ScopeContract', 'ScopeEntryId', 'Visibility', 'Action', 'Notes'];
  if (!sheet) {
    sheet = ss.insertSheet('_AI_LOG');
    sheet.hideSheet();
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function ensureAISidebarStateSheet() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName('_AI_STATE');
  if (!sheet) {
    sheet = ss.insertSheet('_AI_STATE');
    sheet.hideSheet();
  }
  if (sheet.getMaxColumns() < SIDEBAR_STATE_COLUMN_COUNT) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), SIDEBAR_STATE_COLUMN_COUNT - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, SIDEBAR_STATE_COLUMN_COUNT).setValues([SIDEBAR_STATE_COLUMNS]);
  return sheet;
}

function splitSidebarStatePayloadText(payload) {
  const rawText = payload !== undefined && payload !== null ? String(payload) : '';
  const chunks = [];
  let cursor = 0;
  while (cursor < rawText.length && chunks.length < SIDEBAR_STATE_PAYLOAD_COLUMN_COUNT) {
    chunks.push(rawText.substring(cursor, cursor + SIDEBAR_STATE_PAYLOAD_MAX_CHARS));
    cursor += SIDEBAR_STATE_PAYLOAD_MAX_CHARS;
  }
  if (cursor < rawText.length) {
    const previewLength = Math.max(0, (SIDEBAR_STATE_PAYLOAD_MAX_CHARS * SIDEBAR_STATE_PAYLOAD_COLUMN_COUNT) - 120);
    const preview = rawText.substring(0, previewLength);
    const truncatedPayload = JSON.stringify({
      truncated: true,
      preview: preview,
      warning: 'payload too large'
    });
    chunks.length = 0;
    cursor = 0;
    while (cursor < truncatedPayload.length && chunks.length < SIDEBAR_STATE_PAYLOAD_COLUMN_COUNT) {
      chunks.push(truncatedPayload.substring(cursor, cursor + SIDEBAR_STATE_PAYLOAD_MAX_CHARS));
      cursor += SIDEBAR_STATE_PAYLOAD_MAX_CHARS;
    }
  }
  while (chunks.length < SIDEBAR_STATE_PAYLOAD_COLUMN_COUNT) {
    chunks.push('');
  }
  return chunks.slice(0, SIDEBAR_STATE_PAYLOAD_COLUMN_COUNT);
}

function combineSidebarStatePayloadFromRow(row) {
  if (!Array.isArray(row)) {
    return '';
  }
  const fragments = [];
  const end = Math.min(row.length, SIDEBAR_STATE_PAYLOAD_START_INDEX + SIDEBAR_STATE_PAYLOAD_COLUMN_COUNT);
  for (let idx = SIDEBAR_STATE_PAYLOAD_START_INDEX; idx < end; idx += 1) {
    const cellValue = row[idx];
    if (cellValue === undefined || cellValue === null) {
      continue;
    }
    const text = String(cellValue);
    if (text.length) {
      fragments.push(text);
    }
  }
  return fragments.join('');
}

function buildSidebarStateRowValues(entry) {
  const payloadChunks = splitSidebarStatePayloadText(entry.payload || '');
  const values = [
    entry.id,
    entry.user,
    entry.type || '',
    entry.label || ''
  ];
  for (let idx = 0; idx < SIDEBAR_STATE_PAYLOAD_COLUMN_COUNT; idx += 1) {
    values.push(payloadChunks[idx] || '');
  }
  values.push(entry.timestamp || new Date().toISOString());
  return values;
}

function loadReadinessUsageMetrics_() {
  const raw = getScriptProperty(READINESS_USAGE_PROP);
  if (!raw) {
    return null;
  }
  const parsed = safeJsonParse(raw, null);
  if (parsed && typeof parsed === 'object') {
    return parsed;
  }
  return null;
}

// Pattern from App-script/AISidebar.js:10005 (only return latest snapshot)
function loadUserSidebarStateRows(userEmail, maxRows) {
  if (!userEmail) {
    return [];
  }
  const sheet = ensureAISidebarStateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return [];
  }

  // PERFORMANCE FIX: Limit rows loaded to prevent parsing 1000+ rows
  // Most users only need recent snapshots/drafts (50 is plenty!)
  const rowLimit = maxRows || 50;  // Default: load last 50 rows max
  const startRow = Math.max(2, lastRow - rowLimit + 1);
  const rowCount = lastRow - startRow + 1;

  const data = sheet.getRange(startRow, 1, rowCount, SIDEBAR_STATE_COLUMN_COUNT).getValues();
  const userRows = data
    .filter(row => row[1] === userEmail)
    .map(row => ({
      id: row[0],
      type: row[2],
      label: row[3],
      payload: combineSidebarStatePayloadFromRow(row),
      timestamp: row[SIDEBAR_STATE_COLUMN_COUNT - 1]
    }));

  // Sort by timestamp DESC
  if (userRows.length === 0) {
    return [];
  }
  userRows.sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;  // DESC order
  });
  return userRows;
}

function upsertUserSidebarStateRow(entry) {
  if (!entry || !entry.id || !entry.user) {
    return;
  }
  const sheet = ensureAISidebarStateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    if (entry.type === 'draftState' || entry.type === 'draft') {
      try {
        const parsedPayload = JSON.parse(entry.payload);
        saveUserDraftBackup_(parsedPayload);
      } catch (backupError) {
        UnifiedLogger.info('upsertUserSidebarStateRow: backup failed: ' + backupError);
      }
    }
    const range = sheet.getRange(2, 1, lastRow - 1, SIDEBAR_STATE_COLUMN_COUNT);
    const values = range.getValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === entry.id && values[i][1] === entry.user) {
        const rowValues = buildSidebarStateRowValues(entry);
        sheet.getRange(i + 2, 1, 1, SIDEBAR_STATE_COLUMN_COUNT).setValues([rowValues]);
        return;
      }
    }
  }
  sheet.appendRow(buildSidebarStateRowValues(entry));
}

function stringifySafe(payload, maxLength) {
  try {
    const text = JSON.stringify(payload || {});
    if (!maxLength || text.length <= maxLength) {
      return text;
    }
    const previewLength = Math.max(0, maxLength - 40);
    const preview = text.substring(0, previewLength);
    return JSON.stringify({
      truncated: true,
      preview: preview
    });
  } catch (error) {
    return '{"error":"Unable to stringify payload"}';
  }
}

function saveUserDraftBackup_(draftState) {
  try {
    const props = PropertiesService.getUserProperties();
    if (!props) return;
    const json = JSON.stringify(draftState);
    const CHUNK_SIZE = 8500;
    if (json.length < CHUNK_SIZE) {
      const validation = validatePropertySize(json, 9000);
      if (!validation.valid) {
        UnifiedLogger.warn('PropertyWrite', 'Draft state payload too large', {
          key: 'BACKUP_DRAFT_STATE',
          size: validation.size,
          message: validation.message
        });
        return;
      }
      props.setProperty('BACKUP_DRAFT_STATE', json);
      props.deleteProperty('BACKUP_DRAFT_STATE_CHUNKS');
    } else {
      const chunks = Math.ceil(json.length / CHUNK_SIZE);
      if (chunks > 12) return;
      for (let i = 0; i < chunks; i++) {
        const chunk = json.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const validation = validatePropertySize(chunk, 9000);
        if (!validation.valid) {
          UnifiedLogger.warn('PropertyWrite', 'Draft state chunk too large', {
            key: 'BACKUP_DRAFT_STATE_' + i,
            chunkIndex: i,
            size: validation.size,
            message: validation.message
          });
          continue; // Skip oversized chunk
        }
        props.setProperty('BACKUP_DRAFT_STATE_' + i, chunk);
      }
      props.setProperty('BACKUP_DRAFT_STATE_CHUNKS', String(chunks));
      props.setProperty('BACKUP_DRAFT_STATE', 'CHUNKED');
    }
  } catch (e) {
    UnifiedLogger.info('saveUserDraftBackup_: ' + e);
  }
}

function loadUserDraftBackup_() {
  try {
    const props = PropertiesService.getUserProperties();
    const main = props.getProperty('BACKUP_DRAFT_STATE');
    if (!main) return null;
    if (main !== 'CHUNKED') return JSON.parse(main);
    const chunks = parseInt(props.getProperty('BACKUP_DRAFT_STATE_CHUNKS') || '0', 10);
    let json = '';
    for (let i = 0; i < chunks; i++) {
      json += props.getProperty('BACKUP_DRAFT_STATE_' + i) || '';
    }
    return JSON.parse(json);
  } catch (e) {
    UnifiedLogger.info('loadUserDraftBackup_: ' + e);
    return null;
  }
}

function getConfiguredModel(options, fallbackKey) {
  const override = options && options.model;
  if (override) {
    return override;
  }
  const fallbackProp = fallbackKey ? getScriptProperty(fallbackKey) : null;
  if (fallbackProp) {
    return fallbackProp;
  }
  const defaultModel = getScriptProperty('LLM_MODEL');
  return defaultModel || 'gpt-4.1-mini';
}

function invokeLLMChat(messages, options) {
  const payloadOptions = options || {};
  const apiKey = getScriptProperty('LLM_API_KEY') || getScriptProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw new AppError('LLM_CONFIG', 'LLM_API_KEY or OPENAI_API_KEY is not configured.');
  }
  let endpoint = getScriptProperty('LLM_API_ENDPOINT') || 'https://api.openai.com/v1/responses';
  endpoint = String(endpoint || '').trim() || 'https://api.openai.com/v1/responses';
  if (/\/chat\/completions(?:\/)?$/i.test(endpoint)) {
    endpoint = endpoint.replace(/\/chat\/completions(?:\/)?$/i, '/responses');
  }
  const model = getConfiguredModel(payloadOptions, payloadOptions.modelProperty);
  const inputItems = convertMessagesToResponseInputItems(messages);

  // PHASE 2: Rate limit enforcement
  try {
    enforceRateLimit(SERVICE_OPENAI_COMPLETION, {
      operationName: 'invokeLLMChat',
      operationDetails: {
        model: model,
        messageCount: messages ? messages.length : 0
      }
    });
  } catch (error) {
    if (error.code === 'RATE_LIMIT') {
      UnifiedLogger.warn('AI', 'LLM rate limit reached', {
        model: model,
        resetInSeconds: error.resetTimeSeconds
      });

      const err = new Error(
        'LLM rate limit reached. Please wait ' +
        Math.ceil(error.resetTimeSeconds) + ' seconds and try again.'
      );
      err.code = 'RATE_LIMIT';
      err.resetTimeSeconds = error.resetTimeSeconds;
      throw err;
    }
    throw error;
  }

  const requestPayload = {
    model: model,
    temperature: payloadOptions.temperature === undefined ? 0 : payloadOptions.temperature,
    max_output_tokens: payloadOptions.maxTokens || 3200
  };
  if (inputItems.length) {
    requestPayload.input = inputItems;
  }
  if (payloadOptions.instructions) {
    requestPayload.instructions = String(payloadOptions.instructions);
  }
  if (payloadOptions.metadata) {
    requestPayload.metadata = payloadOptions.metadata;
  }
  let textConfig = null;
  if (payloadOptions.responseFormat) {
    textConfig = buildResponsesTextConfig(payloadOptions.responseFormat, 'llm_structured_payload');
  } else if (payloadOptions.forceJson === false) {
    textConfig = null;
  } else {
    textConfig = { format: { type: 'json_object' } };
  }
  if (textConfig) {
    requestPayload.text = textConfig;
  }

  const fetchOptions = {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(requestPayload)
  };

  const eventType = payloadOptions.eventType || 'llm.request';

  try {
    logAIEvent(eventType, {
      runType: payloadOptions.runType || 'general',
      outcome: 'request',
      payload: {
        model: model,
        maxTokens: requestPayload.max_output_tokens,
        temperature: requestPayload.temperature,
        endpoint: endpoint
      },
      messages: messages
    });
  } catch (logError) {
    UnifiedLogger.info('invokeLLMChat request logging failed: ' + logError);
  }

  const response = UrlFetchApp.fetch(endpoint, fetchOptions);
  const statusCode = response.getResponseCode();
  const bodyText = response.getContentText();
  if (statusCode >= 300) {
    try {
      logAIEvent(eventType, {
        runType: payloadOptions.runType || 'general',
        outcome: 'http_error_' + statusCode,
        payload: {
          status: statusCode,
          bodyPreview: truncate(bodyText, 800)
        }
      });
    } catch (logError) {
      UnifiedLogger.info('invokeLLMChat error logging failed: ' + logError);
    }
    const safeBody = truncate(bodyText, 400);
    if (statusCode === 429) throw new AppError('LLM_QUOTA', 'AI quota exceeded. Please check your OpenAI usage limits.', { statusCode, response: safeBody });
    if (statusCode === 401) throw new AppError('LLM_AUTH', 'AI authentication failed. Check your API key.', { statusCode, response: safeBody });
    if (statusCode >= 500) throw new AppError('LLM_SERVER', 'OpenAI server error. Please try again later.', { statusCode, response: safeBody });
    throw new AppError('LLM_HTTP', 'LLM request failed (' + statusCode + '): ' + safeBody);
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch (parseError) {
    throw new AppError('LLM_JSON', 'Unable to parse LLM response JSON.', { raw: truncate(bodyText, 800) });
  }

  const output = extractResponseOutputText(parsed);
  const runStatus = parsed && parsed.status ? parsed.status : '';

  if (runStatus && runStatus !== 'completed') {
    try {
      logAIEvent(eventType, {
        runType: payloadOptions.runType || 'general',
        outcome: 'run_' + runStatus,
        payload: {
          responseId: parsed.id || '',
          error: parsed.error || null
        }
      });
    } catch (logError) {
      UnifiedLogger.info('invokeLLMChat status logging failed: ' + logError);
    }
    if (!output) {
      throw new AppError('LLM_RUN', 'LLM response incomplete.', {
        status: runStatus,
        error: parsed.error || null,
        partialOutput: output || '',
        rawResponse: bodyText,
        rawResponsePreview: truncate(bodyText, 800)
      });
    }
  }

  if (!output) {
    try {
      logAIEvent(eventType, {
        runType: payloadOptions.runType || 'general',
        outcome: 'missing_output',
        payload: truncate(bodyText, 800)
      });
    } catch (logError) {
      UnifiedLogger.info('invokeLLMChat missing output logging failed: ' + logError);
    }
    throw new AppError('LLM_RESPONSE', 'LLM response missing output.', {
      status: runStatus || 'unknown',
      rawResponse: bodyText,
      rawResponsePreview: truncate(bodyText, 800)
    });
  }

  const usage = parsed && parsed.usage ? parsed.usage : null;
  const completionOutcome = runStatus && runStatus !== 'completed' ? 'partial_output' : 'completed';
  try {
    logAIEvent(eventType, {
      runType: payloadOptions.runType || 'general',
      outcome: completionOutcome,
      payload: {
        responseId: parsed.id || '',
        usage: usage,
        status: runStatus || 'completed'
      }
    });
  } catch (logError) {
    UnifiedLogger.info('invokeLLMChat completion logging failed: ' + logError);
  }

  return {
    raw: bodyText,
    output: output,
    usage: usage,
    model: parsed && parsed.model ? parsed.model : model
  };
}

function invokeLLMChatWithRunRecovery(messages, options) {
  try {
    return invokeLLMChat(messages, options);
  } catch (error) {
    if (error && error.code === 'LLM_RUN') {
      const fallbackOutput = resolveLLMRunPartialOutput(error && error.details);
      if (fallbackOutput) {
        const details = (error && error.details) || {};
        return {
          raw: details.rawResponse || '',
          output: fallbackOutput,
          usage: null,
          model: null,
          status: details.status || 'incomplete'
        };
      }
    }
    throw error;
  }
}

function buildResponsesTextConfig(formatSource, fallbackName) {
  if (!formatSource) {
    return null;
  }
  const source = formatSource || {};
  const formatType = source.type || 'json_schema';
  const textConfig = {
    format: {
      type: formatType
    }
  };
  if (formatType === 'json_schema') {
    const schemaContainer = source.json_schema || source.schema || {};
    const schemaObject = schemaContainer && Object.prototype.hasOwnProperty.call(schemaContainer, 'schema')
      ? schemaContainer.schema
      : schemaContainer;
    const schemaName = schemaContainer && Object.prototype.hasOwnProperty.call(schemaContainer, 'name')
      ? schemaContainer.name
      : (source.name || fallbackName || 'structured_payload');
    if (schemaName) {
      textConfig.format.name = String(schemaName);
    }
    const strictFlag = Object.prototype.hasOwnProperty.call(schemaContainer, 'strict')
      ? schemaContainer.strict
      : source.strict;
    if (strictFlag !== undefined) {
      textConfig.format.strict = !!strictFlag;
    }
    const schemaDescription = schemaContainer && Object.prototype.hasOwnProperty.call(schemaContainer, 'description')
      ? schemaContainer.description
      : source.description;
    if (schemaDescription) {
      textConfig.format.description = String(schemaDescription);
    }
    if (!schemaObject) {
      throw new AppError('LLM_SCHEMA', 'Structured output schema is missing for assistant request.');
    }
    try {
      textConfig.format.schema = deepClone(schemaObject);
    } catch (error) {
      textConfig.format.schema = schemaObject;
    }
  }
  return textConfig;
}

function convertMessagesToResponseInputItems(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return [];
  }
  return messages.map(function(message) {
    const role = message && message.role ? String(message.role) : 'user';
    const contentItems = [];
    const content = message && Object.prototype.hasOwnProperty.call(message, 'content')
      ? message.content
      : '';
    if (Array.isArray(content)) {
      content.forEach(function(part) {
        if (part === undefined || part === null) {
          return;
        }
        if (typeof part === 'string') {
          contentItems.push({
            type: 'input_text',
            text: String(part)
          });
          return;
        }
        if (typeof part === 'object') {
          if (part.type === 'input_text' && part.text !== undefined) {
            contentItems.push({
              type: 'input_text',
              text: String(part.text)
            });
            return;
          }
          if (part.type === 'text' && part.text && part.text.value !== undefined) {
            contentItems.push({
              type: 'input_text',
              text: String(part.text.value)
            });
            return;
          }
          if (part.type === 'output_text' && part.text !== undefined) {
            contentItems.push({
              type: 'input_text',
              text: String(part.text)
            });
            return;
          }
          if (part.text !== undefined) {
            contentItems.push({
              type: 'input_text',
              text: String(part.text)
            });
            return;
          }
          if (part.value !== undefined) {
            contentItems.push({
              type: 'input_text',
              text: String(part.value)
            });
          }
        }
      });
    } else if (content !== undefined && content !== null) {
      contentItems.push({
        type: 'input_text',
        text: String(content)
      });
    }
    if (!contentItems.length && message && message.text !== undefined) {
      contentItems.push({
        type: 'input_text',
        text: String(message.text)
      });
    }
    if (!contentItems.length) {
      contentItems.push({
        type: 'input_text',
        text: ''
      });
    }
    return {
      role: role,
      content: contentItems
    };
  });
}

function extractResponseOutputText(responsePayload) {
  if (!responsePayload) {
    return '';
  }
  const segments = [];
  if (Array.isArray(responsePayload.output)) {
    responsePayload.output.forEach(function(item) {
      if (!item) {
        return;
      }
      if (item.type === 'message' && Array.isArray(item.content)) {
        item.content.forEach(function(part) {
          if (!part) {
            return;
          }
          if (part.type === 'output_json' && part.output_json !== undefined) {
            try {
              segments.push(JSON.stringify(part.output_json));
            } catch (ignored) {
              segments.push(String(part.output_json));
            }
          } else if (part.type === 'output_text' && part.text !== undefined) {
            segments.push(String(part.text));
          } else if (part.type === 'text' && part.text && part.text.value !== undefined) {
            segments.push(String(part.text.value));
          }
        });
      } else if (item.type === 'output_text' && item.text !== undefined) {
        segments.push(String(item.text));
      }
    });
  }
  if (!segments.length && responsePayload.output_text !== undefined && responsePayload.output_text !== null) {
    segments.push(String(responsePayload.output_text));
  }
  return segments.length ? segments.join('\n') : '';
}

function resolveLLMRunPartialOutput(details) {
  if (!details || typeof details !== 'object') {
    return '';
  }
  if (typeof details.partialOutput === 'string' && details.partialOutput) {
    return details.partialOutput;
  }
  if (typeof details.rawResponse === 'string' && details.rawResponse) {
    try {
      const parsed = JSON.parse(details.rawResponse);
      const fallback = extractResponseOutputText(parsed);
      if (fallback) {
        return fallback;
      }
    } catch (ignored) {
      // Empty catch replaced with error logging (Phase 6)
      // UnifiedLogger unavailable during bootstrap
    }
  }
  return '';
}

function tryParseJsonResponse(rawText, context, options) {
  if (!rawText) {
    throw new AppError('LLM_JSON', 'LLM response was empty.');
  }
  const attempts = [];
  const payloadKey = options && options.payloadKey ? options.payloadKey : '';
  attempts.push(rawText);

  // Try quoting unquoted keys if rawText is a string
  if (typeof rawText === 'string') {
    let fallback = quoteUnquotedKeys(rawText);
    let iterations = 0;
    while (fallback && fallback !== attempts[attempts.length - 1] && iterations < 3) {
      attempts.push(fallback);
      fallback = quoteUnquotedKeys(fallback);
      iterations += 1;
    }
  }

  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const trimmed = rawText.slice(firstBrace, lastBrace + 1);
    if (attempts.indexOf(trimmed) === -1) {
      attempts.push(trimmed);
    }
  }
  for (let i = 0; i < attempts.length; i++) {
    try {
      return JSON.parse(attempts[i]);
    } catch (error) {
      if (i === attempts.length - 1) {
        const repairDetails = captureJsonRepairContext(rawText, attempts.slice(), payloadKey);
        const repairPrompt = buildRepairPrompt(rawText, error, context || {}, repairDetails);
        throw new AppError('__SCOPE_SCHEMA__', repairPrompt, repairDetails);
      }
    }
  }
  throw new AppError('LLM_JSON', 'Unable to parse LLM JSON response.');
}

function ensureArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

function toAnswerList(requiredAnswers, answers) {
  const list = [];
  if (Array.isArray(answers)) {
    answers.forEach(answer => {
      if (answer && answer.question && answer.answer !== undefined) {
        list.push({
          question: String(answer.question),
          answer: String(answer.answer)
        });
      }
    });
  }
  if (requiredAnswers && typeof requiredAnswers === 'object') {
    Object.keys(requiredAnswers).forEach(key => {
      const value = requiredAnswers[key];
      if (value !== undefined && value !== null && value !== '') {
        list.push({
          question: key,
          answer: String(value)
        });
      }
    });
  }
  return list;
}

function fetchAttachmentSummaries(fileIds) {
  UnifiedLogger.info('Attachments', 'Fetching attachment summaries', {
    requestedCount: fileIds ? fileIds.length : 0,
    maxAllowed: AI_MAX_PDF_FILES
  });

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    UnifiedLogger.debug('Attachments', 'No attachments to fetch');
    return [];
  }
  const summaries = [];
  fileIds.slice(0, AI_MAX_PDF_FILES).forEach(fileId => {
    if (!fileId) {
      return;
    }
    try {
      const file = DriveApp.getFileById(fileId);
      UnifiedLogger.debug('Attachments', 'Processing file', {
        fileId,
        fileName: file.getName(),
        mimeType: file.getMimeType()
      });

      const summary = {
        fileId: fileId,
        fileName: file.getName(),
        text: ''
      };
      try {
        const blob = file.getBlob();
        const contentType = blob.getContentType();
        if (contentType === MimeType.PDF || contentType === 'application/pdf') {
          let pdfText = '';
          try {
            const token = ScriptApp.getOAuthToken();
            const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/export?mimeType=text/plain';
            const response = UrlFetchApp.fetch(url, {
              headers: { Authorization: 'Bearer ' + token },
              muteHttpExceptions: true
            });
            if (response && response.getResponseCode && response.getResponseCode() === 200) {
              pdfText = response.getContentText();
            }
          } catch (exportError) {
            pdfText = '';
          }
          if (!pdfText && typeof Drive !== 'undefined' && Drive && Drive.Files && typeof Drive.Files.copy === 'function') {
            try {
              const copyFile = Drive.Files.copy({
                name: 'TEMP_OCR_' + new Date().getTime(),
                mimeType: MimeType.GOOGLE_DOCS
              }, fileId, {
                supportsAllDrives: true,
                fields: 'id'
              });
              if (copyFile && copyFile.id) {
                try {
                  Utilities.sleep(400);
                  const doc = DocumentApp.openById(copyFile.id);
                  if (doc && doc.getBody) {
                    pdfText = doc.getBody().getText();
                  }
                } catch (docError) {
                  pdfText = '';
                } finally {
                  try {
                    Drive.Files.delete(copyFile.id);
                  } catch (removeError) {
                    try {
                      DriveApp.getFileById(copyFile.id).setTrashed(true);
                    } catch (trashError) {
                      if (typeof Logger !== 'undefined' && Logger && typeof UnifiedLogger.info === 'function') {
                        UnifiedLogger.info('fetchAttachmentSummaries: unable to clean up OCR doc ' + copyFile.id + ': ' + trashError);
                      }
                    }
                  }
                }
              }
            } catch (ocrError) {
              if (typeof Logger !== 'undefined' && Logger && typeof UnifiedLogger.info === 'function') {
                UnifiedLogger.info('fetchAttachmentSummaries: Drive OCR fallback failed for ' + fileId + ': ' + ocrError);
              }
              pdfText = '';
            }
          }
          if (pdfText) {
            summary.text = truncate(pdfText, 20000);
          } else {
            summary.text = '(PDF summary unavailable in offline mode)';
          }
        } else {
          summary.text = truncate(blob.getDataAsString(), 4000);
        }
      } catch (readError) {
        summary.text = '(Unable to read attachment content: ' + readError + ')';
      }
      summaries.push(summary);
    } catch (error) {
      UnifiedLogger.warn('Attachments', 'Failed to process attachment', {
        fileId,
        error: String(error)
      });
      summaries.push({
        fileId: fileId,
        fileName: '(unavailable: ' + fileId + ')',
        text: '(Failed to load attachment: ' + error + ')'
      });
    }
  });

  UnifiedLogger.info('Attachments', 'Attachment fetch complete', {
    successCount: summaries.length,
    totalChars: summaries.reduce(function(sum, s) { return sum + (s.text ? s.text.length : 0); }, 0)
  });

  return summaries;
}
if (typeof globalThis !== 'undefined') {
}

function getCategoryHighlights() {
  return AI_MANDATORY_CATEGORIES.map(function(entry) {
    return {
      canonical: entry.canonical,
      label: entry.label,
      weight: entry.weight
    };
  });
}
if (typeof globalThis !== 'undefined') {
}

function loadScenarioPrompts(requiredCanonicals) {
  if (!Array.isArray(requiredCanonicals) || requiredCanonicals.length === 0) {
    return { system: [], user: [] };
  }
  if (!SCENARIO_PROMPT_CACHE) {
    let promptEntries = [];
    try {
      const raw = HtmlService.createHtmlOutputFromFile('prompts/quote_scenarios').getContent();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        promptEntries = parsed;
      }
    } catch (error) {
      if (typeof Logger !== 'undefined' && Logger && typeof UnifiedLogger.info === 'function') {
        UnifiedLogger.info('loadScenarioPrompts: failed to parse prompts file: ' + error);
      }
      promptEntries = [];
    }
    const cache = {};
    promptEntries.forEach(function(entry) {
      if (!entry || entry.canonical === undefined || entry.canonical === null) {
        return;
      }
      const canonicalValue = String(entry.canonical || '').trim();
      if (!canonicalValue) {
        return;
      }
      const resolved = typeof mapWorkflowCanonical === 'function'
        ? (mapWorkflowCanonical(canonicalValue) || canonicalValue)
        : canonicalValue;
      const keys = new Set([
        canonicalValue,
        canonicalValue.replace(/\s+/g, '-'),
        resolved,
        resolved.replace(/\s+/g, '-')
      ]);
      keys.forEach(function(key) {
        if (key) {
          cache[key] = {
            system: entry.system || '',
            user: entry.user || ''
          };
        }
      });
    });
    SCENARIO_PROMPT_CACHE = cache;
  }
  const systemSnippets = [];
  const userSnippets = [];
  const seenKeys = new Set();
  requiredCanonicals.forEach(function(canonical) {
    if (canonical === undefined || canonical === null) {
      return;
    }
    const canonicalValue = String(canonical || '').trim();
    if (!canonicalValue) {
      return;
    }
    const resolved = typeof mapWorkflowCanonical === 'function'
      ? (mapWorkflowCanonical(canonicalValue) || canonicalValue)
      : canonicalValue;
    const lookupKeys = [
      canonicalValue,
      canonicalValue.replace(/\s+/g, '-'),
      resolved,
      resolved.replace(/\s+/g, '-')
    ];
    let match = null;
    for (let i = 0; i < lookupKeys.length; i++) {
      const key = lookupKeys[i];
      if (key && SCENARIO_PROMPT_CACHE[key]) {
        match = SCENARIO_PROMPT_CACHE[key];
        break;
      }
    }
    if (!match) {
      return;
    }
    const signature = match.system + '||' + match.user;
    if (seenKeys.has(signature)) {
      return;
    }
    seenKeys.add(signature);
    if (match.system) {
      systemSnippets.push(match.system);
    }
    if (match.user) {
      userSnippets.push(match.user);
    }
  });
  return {
    system: systemSnippets,
    user: userSnippets
  };
}
if (typeof globalThis !== 'undefined') {
}

function inferSignalConfidence(draft) {
  if (!draft || typeof draft !== 'object') {
    return [];
  }
  const entries = Array.isArray(draft.scopeEntries) ? draft.scopeEntries : [];
  if (entries.length === 0) {
    return [];
  }
  const counts = {};
  const evidenceMap = {};
  entries.forEach(function(entry) {
    if (!entry || !entry.sectionId) {
      return;
    }
    const canonical = entry.sectionId;
    counts[canonical] = (counts[canonical] || 0) + 1;
    const evidence = [];
    if (Array.isArray(entry.deliverables)) {
      evidence.push.apply(evidence, entry.deliverables.slice(0, 2));
    }
    if (Array.isArray(entry.resources)) {
      entry.resources.slice(0, 2).forEach(function(resource) {
        if (resource && resource.role) {
          evidence.push(resource.role);
        }
      });
    }
    if (!evidenceMap[canonical]) {
      evidenceMap[canonical] = [];
    }
    evidenceMap[canonical].push.apply(evidenceMap[canonical], evidence);
  });

  return Object.keys(counts).map(function(canonical) {
    const weight = TOKEN_WEIGHTS[canonical] || 1;
    const score = Math.min(1, (counts[canonical] * weight) / 4);
    return {
      canonical: canonical,
      score: Number(score.toFixed(2)),
      evidence: (evidenceMap[canonical] || []).slice(0, 4)
    };
  });
}
if (typeof globalThis !== 'undefined') {
}

if (typeof globalThis !== 'undefined') {
}

// DELETED DEAD CODE: ensureScopeEntryParents (was lines 4054-4127)
// NEVER CALLED - orphaned function that ensures line items have parentId links
// This was NEW schema code (processes flat scopeEntries with isSection flags)
// but it's unused dead code - deleted

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function buildDeterministicPlan(context) {
  const trace = UnifiedLogger.startTrace('AISidebar', 'buildDeterministicPlan', { hasContext: !!context });
  try {
  UnifiedLogger.debug('PlanBuilder', 'Building deterministic plan', {
    hasApprovedScope: !!(context.approvedScope),
    hasCommercialFit: !!(context.commercialFit),
    hasSectionEntries: !!(context.sectionEntries)
  });

  const defaults = context.defaults || {};
  const plan = {
    status: 'ok',
    projectName: context.approvedScope && context.approvedScope.projectName ? context.approvedScope.projectName : '',
    clientName: context.approvedScope && context.approvedScope.clientName ? context.approvedScope.clientName : '',
    currency: defaults.currency || '',
    taxType: defaults.taxType || '',
    sections: [],
    fees: [],
    warnings: []
  };

  const sanitizePlanText = function(value) {
    return sanitizeText(value);
  };

  const fitEntries = (context.commercialFit && context.commercialFit.entries) || [];
  UnifiedLogger.debug('PlanBuilder', 'Commercial fit entries loaded', { count: fitEntries.length });

  const fitIndex = fitEntries.reduce(function(map, entry) {
    if (entry && entry.scopeEntryId) {
      map[entry.scopeEntryId] = entry;
    }
    return map;
  }, {});
  const contractIndex = (context.contractEntries || []).reduce(function(map, entry) {
    if (entry && entry.id) {
      map[entry.id] = entry;
    }
    return map;
  }, {});
  UnifiedLogger.debug('PlanBuilder', 'Indexes built', {
    fitIndexSize: Object.keys(fitIndex).length,
    contractIndexSize: Object.keys(contractIndex).length
  });

  const sectionEntries = Array.isArray(context.sectionEntries)
    ? context.sectionEntries.slice()
    : [];
  const sectionIdSet = new Set(filterNullish(sectionEntries.map(function(entry) {
    return entry && entry.id ? entry.id : null;
  })));
  const sectionOrderFromFit = [];
  fitEntries.forEach(function(entry) {
    if (!entry || entry.parentScopeId) {
      return;
    }
    const scopeEntryId = entry.scopeEntryId || entry.canonical || null;
    if (scopeEntryId) {
      sectionOrderFromFit.push(scopeEntryId);
    }
  });
  fitEntries.forEach(function(entry) {
    if (!entry || entry.parentScopeId) {
      return;
    }
    const scopeEntryId = entry.scopeEntryId || entry.canonical || null;
    if (!scopeEntryId || sectionIdSet.has(scopeEntryId)) {
      return;
    }
    sectionIdSet.add(scopeEntryId);
    const scopeLabel = entry.entry && entry.entry.scopeEntry && entry.entry.scopeEntry.scopeLabel
      ? entry.entry.scopeEntry.scopeLabel
      : entry.canonical || entry.scopeEntryId || 'Untitled Section';
    sectionEntries.push({
      id: scopeEntryId,
      sectionId: entry.canonical || '',
      canonical: entry.canonical || '',
      scopeLabel: scopeLabel,
      visibility: entry.visibility || VISIBILITY.CLIENT,
      notes: Array.isArray(entry.notes) ? entry.notes.slice(0, 3) : [],
      childIds: [],
      parentScopeId: '',
      manual: true
    });
  });
  if (sectionOrderFromFit.length) {
    const orderIndex = new Map();
    sectionOrderFromFit.forEach(function(id, idx) {
      if (!orderIndex.has(id)) {
        orderIndex.set(id, idx);
      }
    });
    sectionEntries.sort(function(left, right) {
      const leftIdx = orderIndex.has(left && left.id) ? orderIndex.get(left.id) : Number.MAX_SAFE_INTEGER;
      const rightIdx = orderIndex.has(right && right.id) ? orderIndex.get(right.id) : Number.MAX_SAFE_INTEGER;
      if (leftIdx === rightIdx) {
        return (left && left.scopeLabel ? left.scopeLabel : '').localeCompare(right && right.scopeLabel ? right.scopeLabel : '');
      }
      return leftIdx - rightIdx;
    });
  }
  const planWarnings = [];

  sectionEntries.forEach(function(sectionEntry) {
    if (!sectionEntry || !sectionEntry.id) {
      return;
    }
    const sectionId = sectionEntry.id;
    const sectionMeta = context.sectionMap && context.sectionMap[sectionId] ? context.sectionMap[sectionId] : null;
    let childIds = [];
    if (sectionMeta && Array.isArray(sectionMeta.childIds) && sectionMeta.childIds.length) {
      childIds = sectionMeta.childIds.slice();
    } else if (Array.isArray(sectionEntry.childIds) && sectionEntry.childIds.length) {
      childIds = sectionEntry.childIds.slice();
    } else {
      childIds = Object.keys(contractIndex).filter(function(childId) {
        return contractIndex[childId] && contractIndex[childId].parentId === sectionId;
      });
    }
    const canonical = sectionEntry.sectionId || sectionEntry.canonical || (sectionMeta && sectionMeta.canonical) || '';
    const section = {
      sectionName: sanitizePlanText(sectionEntry.scopeLabel || (sectionMeta && sectionMeta.scopeLabel) || ''),
      scopeEntryId: sectionId,
      canonical: canonical,
      justification: '',
      items: [],
      sectionWarnings: [],
      marginSummary: '',
      visibility: sectionEntry.visibility || (sectionMeta && sectionMeta.visibility) || VISIBILITY.CLIENT
    };
    section.childIds = childIds.slice();
    if (Array.isArray(sectionEntry.notes) && sectionEntry.notes.length) {
      section.sectionWarnings = section.sectionWarnings.concat(
        sectionEntry.notes.slice(0, 3).map(sanitizePlanText)
      );
    }
    if (sectionMeta && Array.isArray(sectionMeta.notes) && sectionMeta.notes.length) {
      section.sectionWarnings = section.sectionWarnings.concat(
        sectionMeta.notes.slice(0, 3).map(sanitizePlanText)
      );
    }

    const orderedChildren = fitEntries.filter(function(entry) {
      return entry && String(entry.parentScopeId || '') === sectionId;
    });
    const processedChildren = new Set();
    orderedChildren.forEach(function(childEntry) {
      if (!childEntry) {
        return;
      }
      const childId = childEntry.scopeEntryId || childEntry.scopeEntry || childEntry.id || '';
      if (childId) {
        processedChildren.add(childId);
      }
      const contractEntry = childId && contractIndex[childId] ? contractIndex[childId] : null;
      if (contractEntry) {
        const fit = fitIndex[childId] || childEntry || {};
        const qtyContext = fit.quantityContext || {};
        const unitRateContext = fit.unitRateContext || {};
        const itemWarnings = [];
        if (!fit.chosenSku) {
          itemWarnings.push('SKU not matched automatically; assign manually.');
        }
        if (Array.isArray(fit.warnings)) {
          itemWarnings.push.apply(itemWarnings, fit.warnings);
        }
        const quantitySignal = Array.isArray(contractEntry.quantitySignals) && contractEntry.quantitySignals.length
          ? contractEntry.quantitySignals[0]
          : null;
        const qtyValue = qtyContext.qty !== undefined ? qtyContext.qty : (quantitySignal && quantitySignal.value ? Number(quantitySignal.value) : 1);
        const unitValue = qtyContext.unit || (quantitySignal && quantitySignal.unit ? quantitySignal.unit : 'Unit');
        const item = {
          scopeEntryId: contractEntry.id,
          description: sanitizePlanText(contractEntry.label || (fit.catalogItem && fit.catalogItem.name) || fit.chosenSku || 'Unmatched service'),
          clientLineName: sanitizePlanText(contractEntry.label || (fit.catalogItem && fit.catalogItem.name) || fit.chosenSku || 'Service'),
          qty: qtyValue,
          unit: sanitizePlanText(unitValue),
          unitRate: unitRateContext.value !== undefined ? unitRateContext.value : null,
          sku: fit.chosenSku || null,
          visibility: contractEntry.visibility || section.visibility || VISIBILITY.INTERNAL,
          warnings: itemWarnings.map(sanitizePlanText)
        };
        const bundleKey = fit.bundleKey || contractEntry.bundleKey || (contractEntry.metadata && contractEntry.metadata.bundleKey) || '';
        if (bundleKey) {
          item.bundleKey = bundleKey;
          item.metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
          item.metadata.bundleKey = bundleKey;
        }
        item.sectionParentId = sectionId;
        item.metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
        item.metadata.parentScopeId = sectionId;
        section.items.push(item);
        if (itemWarnings.length) {
          planWarnings.push('Scope entry ' + contractEntry.id + ': ' + itemWarnings.join('; '));
        }
      } else {
        const qtyContext = childEntry.quantityContext || {};
        const unitRateContext = childEntry.unitRateContext || {};
        const manualQty = qtyContext.qty !== undefined && qtyContext.qty !== null
          ? qtyContext.qty
          : (childEntry.qty !== undefined && childEntry.qty !== null ? childEntry.qty : null);
        const manualUnit = qtyContext.unit || childEntry.unit || '';
        const manualRate = unitRateContext.value !== undefined && unitRateContext.value !== null
          ? unitRateContext.value
          : (childEntry.unitRate !== undefined && childEntry.unitRate !== null ? childEntry.unitRate : null);
        const manualLabel = childEntry.entry && childEntry.entry.scopeEntry && childEntry.entry.scopeEntry.scopeLabel
          ? childEntry.entry.scopeEntry.scopeLabel
          : (childEntry.scopeLabel || childEntry.canonical || childEntry.scopeEntryId || 'Manual Line');
        const manualDescription = childEntry.entry && childEntry.entry.scopeEntry && childEntry.entry.scopeEntry.description
          ? childEntry.entry.scopeEntry.description
          : (childEntry.description || manualLabel);
        const warnings = Array.isArray(childEntry.warnings) ? childEntry.warnings.slice() : [];
        if (!childEntry.chosenSku) {
          warnings.push('Manual line missing SKU.');
        }
        const manualItem = {
          scopeEntryId: childId || ('MANUAL_' + section.items.length + '_' + Date.now()),
          description: sanitizePlanText(manualDescription),
          clientLineName: sanitizePlanText(manualLabel),
          qty: manualQty,
          unit: sanitizePlanText(manualUnit || ''),
          unitRate: manualRate !== undefined ? manualRate : null,
          sku: childEntry.chosenSku || childEntry.sku || null,
          visibility: childEntry.visibility || section.visibility || VISIBILITY.CLIENT,
          warnings: warnings.map(sanitizePlanText),
          metadata: {
            parentScopeId: sectionId,
            manual: true
          },
          sectionParentId: sectionId
        };
        section.items.push(manualItem);
        if (warnings.length) {
          planWarnings.push('Manual scope entry ' + (manualItem.scopeEntryId || '(manual)') + ': ' + warnings.join('; '));
        }
      }
    });

    childIds.forEach(function(childId) {
      if (!childId || processedChildren.has(childId)) {
        return;
      }
      const contractEntry = contractIndex[childId];
      if (!contractEntry) {
        return;
      }
      const fit = fitIndex[childId] || {};
      const qtyContext = fit.quantityContext || {};
      const unitRateContext = fit.unitRateContext || {};
      const itemWarnings = [];
      if (!fit.chosenSku) {
        itemWarnings.push('SKU not matched automatically; assign manually.');
      }
      if (Array.isArray(fit.warnings)) {
        itemWarnings.push.apply(itemWarnings, fit.warnings);
      }
      const quantitySignal = Array.isArray(contractEntry.quantitySignals) && contractEntry.quantitySignals.length
        ? contractEntry.quantitySignals[0]
        : null;
      const qtyValue = qtyContext.qty !== undefined ? qtyContext.qty : (quantitySignal && quantitySignal.value ? Number(quantitySignal.value) : 1);
      const unitValue = qtyContext.unit || (quantitySignal && quantitySignal.unit ? quantitySignal.unit : 'Unit');
      const item = {
        scopeEntryId: contractEntry.id,
        description: sanitizePlanText(contractEntry.label || (fit.catalogItem && fit.catalogItem.name) || fit.chosenSku || 'Unmatched service'),
        clientLineName: sanitizePlanText(contractEntry.label || (fit.catalogItem && fit.catalogItem.name) || fit.chosenSku || 'Service'),
        qty: qtyValue,
        unit: sanitizePlanText(unitValue),
        unitRate: unitRateContext.value !== undefined ? unitRateContext.value : null,
        sku: fit.chosenSku || null,
        visibility: contractEntry.visibility || section.visibility || VISIBILITY.INTERNAL,
        warnings: itemWarnings.map(sanitizePlanText)
      };
      const bundleKey = fit.bundleKey || contractEntry.bundleKey || (contractEntry.metadata && contractEntry.metadata.bundleKey) || '';
      if (bundleKey) {
        item.bundleKey = bundleKey;
        item.metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
        item.metadata.bundleKey = bundleKey;
      }
      item.sectionParentId = sectionId;
      item.metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      item.metadata.parentScopeId = sectionId;
      section.items.push(item);
      if (itemWarnings.length) {
        planWarnings.push('Scope entry ' + contractEntry.id + ': ' + itemWarnings.join('; '));
      }
    });

    if (!section.items.length) {
      section.sectionWarnings.push(sanitizePlanText('No line items generated for this section.'));
      planWarnings.push('Section ' + sectionId + ' has no generated line items.');
    }
    plan.sections.push(section);
  });

  plan.metadata = {
    sectionMap: context.sectionMap || {},
    contractEntries: context.contractEntries || [],
    commercialFit: context.commercialFit || {},
    sectionEntries: context.sectionEntries || []
  };
  plan.warnings = planWarnings.map(sanitizePlanText);

  UnifiedLogger.debug('PlanBuilder', 'Plan build complete', {
    sectionCount: plan.sections.length,
    warningCount: plan.warnings.length,
    totalItems: plan.sections.reduce(function(sum, sec) { return sum + (sec.items ? sec.items.length : 0); }, 0)
  });

  
  trace.complete('buildDeterministicPlan complete');
  return plan;
  } catch (error) {
    trace.fail('buildDeterministicPlan failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'buildDeterministicPlan',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    return { sections: [], fees: [], warnings: [] };
  }
}
function addConfigHealthChecks_(plan) {
  if (!plan || !plan.metadata) {
    return;
  }
  const status = plan.metadata.configStatus || {};
  const healthChecks = ensureArray(plan.metadata.healthChecks);
  const nextChecks = [];
  if (status.schemaValid === false) {
    nextChecks.push({
      key: 'configSchema',
      status: 'failed',
      severity: 'error',
      reason: 'Config schema validation failed'
    });
  }
  if (status.snapshotFresh === false || (status.snapshotAgeMinutes !== undefined && status.snapshotTtlMinutes !== undefined && Number(status.snapshotAgeMinutes) > Number(status.snapshotTtlMinutes))) {
    nextChecks.push({
      key: 'configSnapshot',
      status: 'stale',
      severity: 'warn',
      ageMinutes: status.snapshotAgeMinutes,
      ttlMinutes: status.snapshotTtlMinutes,
      reason: 'Config snapshot is stale'
    });
  } else if (status.snapshotFresh === true) {
    nextChecks.push({
      key: 'configSnapshot',
      status: 'fresh',
      severity: 'info',
      ageMinutes: status.snapshotAgeMinutes,
      ttlMinutes: status.snapshotTtlMinutes
    });
  }
  plan.metadata.healthChecks = healthChecks.concat(nextChecks);
}

function getXeroPrecheckStatus_() {
  const status = {
    ready: true,
    reason: ''
  };
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new AppError('CONFIG_ERROR', 'No active spreadsheet available for Xero precheck.');
    }
    const xeroReadyName = SHEET_NAMES && SHEET_NAMES.XERO_READY ? SHEET_NAMES.XERO_READY : 'XERO_READY';
    const xeroReadySheet = ss.getSheetByName(xeroReadyName);
    if (!xeroReadySheet || xeroReadySheet.getLastRow() < 2) {
      status.ready = false;
      status.reason = 'XERO_READY is empty';
      return status;
    }
    const storedHash = getScriptProperty('XERO_READY_HASH') || '';
    const storedRows = Number(getScriptProperty('XERO_READY_ROW_COUNT')) || 0;
    const currentRows = xeroReadySheet.getLastRow() - 1;
    if (!storedHash || !storedRows) {
      status.ready = false;
      status.reason = 'Normalization markers missing';
      return status;
    }
    if (storedRows !== currentRows) {
      status.ready = false;
      status.reason = 'XERO_READY row count mismatch';
      return status;
    }
    if (typeof computeHash_ === 'function') {
      const values = xeroReadySheet.getRange(2, 1, currentRows, Math.min(xeroReadySheet.getLastColumn(), 12)).getValues();
      const currentHash = computeHash_(values);
      if (currentHash && storedHash && currentHash !== storedHash) {
        status.ready = false;
        status.reason = 'XERO_READY hash mismatch';
        status.hash = currentHash;
        return status;
      }
    }
    if (typeof getVectorStoreSyncStatus === 'function') {
      const vectorStatus = getVectorStoreSyncStatus();
      if (vectorStatus && vectorStatus.stale) {
        status.ready = false;
        status.reason = 'Vector store stale';
        status.vectorStale = true;
      }
    }
  } catch (error) {
    status.ready = false;
    status.reason = (error && error.message) ? error.message : '' + error;
  }
  return status;
}

function addXeroPrecheckStatus_(plan) {
  if (!plan || !plan.metadata) {
    return;
  }
  const xeroStatus = getXeroPrecheckStatus_();
  plan.metadata.xeroStatus = Object.assign({}, plan.metadata.xeroStatus || {}, xeroStatus);
  const healthChecks = ensureArray(plan.metadata.healthChecks);
  healthChecks.push({
    key: 'xeroPrecheck',
    status: xeroStatus.ready ? 'ready' : 'blocked',
    severity: xeroStatus.ready ? 'info' : 'error',
    reason: xeroStatus.reason || ''
  });
  plan.metadata.healthChecks = healthChecks;
}

function ensureQuoteBuilderCapacity(sheet, requiredRows) {
  const availableRows = sheet.getMaxRows();
  if (availableRows < requiredRows) {
    sheet.insertRowsAfter(availableRows, requiredRows - availableRows);
  }
}

/**
 * Determine the minimum required columns based on QB_COLS definition.
 * @return {number}
 */
var quoteBuilderColumnCountCache_ = undefined;

function getQuoteBuilderColumnCount() {
  if (quoteBuilderColumnCountCache_ !== undefined) {
    return quoteBuilderColumnCountCache_;
  }
  let maxIndex = -1;
  if (typeof QB_COLS === 'object' && QB_COLS) {
    Object.keys(QB_COLS).forEach(function(key) {
      const value = QB_COLS[key];
      if (typeof value === 'number' && value > maxIndex) {
        maxIndex = value;
      }
    });
  }
  const count = Math.max(1, maxIndex + 1);
  quoteBuilderColumnCountCache_ = count;
  return count;
}

/**
 * Ensure the builder sheet has enough columns for all tracked fields.
 * @param {Sheet} sheet
 */
function ensureQuoteBuilderColumnCapacity(sheet) {
  if (!sheet) {
    return;
  }
  const currentColumns = sheet.getMaxColumns();
  const requiredColumns = getQuoteBuilderColumnCount();
  if (currentColumns >= requiredColumns) {
    return;
  }
  sheet.insertColumnsAfter(currentColumns, requiredColumns - currentColumns);
}

function clearQuoteBuilderData(sheet) {
  const lastRow = sheet.getLastRow(), lastColumn = sheet.getLastColumn();
  if (lastRow <= 3) {
    return;
  }
  sheet.getRange(4, 1, lastRow - 3, lastColumn).clearContent();
}

function buildQuoteRowTemplate(columnCount) {
  const row = [];
  for (let i = 0; i < columnCount; i++) {
    row.push('');
  }
  return row;
}

function gatherSectionSummaryContexts(currency) {
  const sheet = getQuoteBuilderSheet();
  SpreadsheetApp.flush();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 3) {
    return [];
  }
  const totalColumns = sheet.getLastColumn();
  const values = sheet.getRange(4, 1, lastRow - 3, totalColumns).getValues();
  const sections = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row) {
      continue;
    }
    const type = row[QB_COLS.TYPE];
    if (type !== ROW_TYPES.SECTION) {
      continue;
    }
    const section = {
      rowIndex: i + 4,
      sectionName: row[QB_COLS.SECTION_NAME] || '',
      sectionKey: row[QB_COLS.SCOPE_ENTRY_ID] || ('row-' + (i + 4)),
      visibility: row[QB_COLS.VISIBILITY] || VISIBILITY.CLIENT,
      subtotal: coerceNumericValue(row[QB_COLS.SECTION_SUBTOTAL]),
      notes: row[QB_COLS.NOTES] || '',
      lineItems: []
    };
    let cursor = i + 1;
    while (cursor < values.length) {
      const childRow = values[cursor];
      if (!childRow) {
        break;
      }
      const childType = childRow[QB_COLS.TYPE];
      if (childType === ROW_TYPES.SECTION || childType === ROW_TYPES.FEE || !childType) {
        break;
      }
      if (childType === ROW_TYPES.LINE) {
        const itemCode = childRow[QB_COLS.ITEM_CODE] || '';
        let itemType = '';
        if (itemCode) {
          try {
            const catalogItem = safeLookupItem(itemCode);
            if (catalogItem && catalogItem.itemType) {
              itemType = catalogItem.itemType;
            }
          } catch (lookupError) {
            UnifiedLogger.info('gatherSectionSummaryContexts: safeLookupItem failed for ' + itemCode + ': ' + lookupError);
          }
        }
        section.lineItems.push({
          rowIndex: cursor + 4,
          itemCode: childRow[QB_COLS.ITEM_CODE] || '',
          description: childRow[QB_COLS.DESCRIPTION] || '',
          clientLineName: childRow[QB_COLS.CLIENT_LINE_NAME] || '',
          qty: childRow[QB_COLS.QTY],
          unit: childRow[QB_COLS.UNIT] || '',
          unitRate: childRow[QB_COLS.UNIT_RATE],
          rowNet: childRow[QB_COLS.ROW_NET],
          clientAmount: childRow[QB_COLS.CLIENT_AMOUNT],
          visibility: childRow[QB_COLS.VISIBILITY] || VISIBILITY.CLIENT,
          itemType: itemType
        });
      }
      cursor += 1;
    }
    if (section.subtotal === null || section.subtotal === undefined) {
      let computedTotal = 0;
      let hasAmount = false;
      section.lineItems.forEach(function(item) {
        const amount = coerceNumericValue(item.clientAmount);
        if (amount !== null) {
          computedTotal += amount;
          hasAmount = true;
          return;
        }
        const rowNet = coerceNumericValue(item.rowNet);
        if (rowNet !== null) {
          computedTotal += rowNet;
          hasAmount = true;
          return;
        }
        const qty = coerceNumericValue(item.qty);
        const rate = coerceNumericValue(item.unitRate);
        if (qty !== null && rate !== null) {
          computedTotal += qty * rate;
          hasAmount = true;
        }
      });
      if (hasAmount) {
        section.subtotal = computedTotal;
      }
    }
    sections.push(section);
  }
  return sections;
}

function buildFallbackSectionSummary(section, currency) {
  if (!section || !Array.isArray(section.lineItems) || section.lineItems.length === 0) {
    return 'No line items captured for this section.';
  }
  const labels = section.lineItems.map(function(item) {
    return (item && (item.clientLineName || item.description || item.itemCode)) || 'Line item';
  }).filter(function(label) { return !!label; });
  if (!labels.length) {
    return 'Includes scoped deliverables for this phase.';
  }
  if (labels.length === 1) {
    return 'Includes ' + labels[0] + '.';
  }
  if (labels.length === 2) {
    return 'Includes ' + labels[0] + ' and ' + labels[1] + '.';
  }
  const summarized = labels.slice(0, 3);
  const remainder = labels.length - summarized.length;
  let text = 'Includes ' + summarized.slice(0, -1).join(', ') + ', and ' + summarized[summarized.length - 1];
  if (remainder > 0) {
    text += ' plus ' + remainder + ' more item' + (remainder === 1 ? '' : 's');
  }
  return text + '.';
}

function simulateSectionSummariesViaLLM(sections, options) {
  const currency = options && options.currency ? options.currency : 'AED';
  const simulated = {};
  sections.forEach(function(section) {
    const sectionKey = section && section.sectionKey ? section.sectionKey : '';
    if (!sectionKey) {
      return;
    }
    simulated[sectionKey] = buildFallbackSectionSummary(section, currency);
  });
  return simulated;
}

function requestSectionSummariesViaLLM(sections, options) {
  if (options && options.simulateLLM === true) {
    return simulateSectionSummariesViaLLM(sections, options);
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return {};
  }
  const currency = options && options.currency ? options.currency : 'AED';
  const payload = {
    currency: currency,
    instructions: 'Summaries should list what the team will deliver in one or two sentences without quoting totals.',
    sections: sections.map(function(section) {
      return {
        sectionKey: section.sectionKey,
        sectionName: section.sectionName,
        subtotal: section.subtotal,
        notes: section.notes,
        visibility: section.visibility,
        lineItems: section.lineItems.map(function(item) {
          return {
            itemCode: item.itemCode,
            label: item.clientLineName || item.description || '',
            description: item.description,
            visibility: item.visibility,
            qty: item.qty,
            unit: item.unit,
            unitRate: item.unitRate,
            amount: item.clientAmount !== undefined && item.clientAmount !== null ? item.clientAmount : item.rowNet
          };
        })
      };
    })
  };

  const messages = [
    {
      role: 'system',
      content: 'You turn structured quote line items into concise section blurbs. Use a professional, confident tone and keep each summary to one or two sentences. Do not mention totals, taxes, or currency.'
    },
    {
      role: 'user',
      content: 'Summarize each section for a client-facing quote. Return JSON that matches the required schema.\n\n' +
        JSON.stringify(payload, null, 2)
    }
  ];

  const result = invokeLLMChat(messages, {
    runType: 'quote-section-summary',
    eventType: 'quote.section.summary.llm',
    modelProperty: 'LLM_SCOPE_MODEL',
    maxTokens: 800,
    responseFormat: getSectionSummaryResponseFormat()
  });

  const parsed = tryParseJsonResponse(result.output);
  const summaries = {};
  const entries = Array.isArray(parsed.summaries) ? parsed.summaries : [];
  entries.forEach(function(entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const key = entry.sectionKey || entry.sectionId || entry.id;
    const summary = entry.summary || entry.description || '';
    if (!key || !summary) {
      return;
    }
    summaries[key] = truncate(String(summary), 500);
  });
  return summaries;
}

function generateSectionSummaryTexts(sections, options) {
  const summaryMap = {};
  let usedLLM = false;
  if (!Array.isArray(sections) || sections.length === 0) {
    return {
      summaries: summaryMap,
      usedLLM: usedLLM
    };
  }
  const currency = options && options.currency ? options.currency : 'AED';
  let llmSummaries = null;
  if (!options || options.disableLLM !== true) {
    try {
      llmSummaries = requestSectionSummariesViaLLM(sections, options);
      if (llmSummaries && Object.keys(llmSummaries).length > 0) {
        usedLLM = true;
      }
    } catch (error) {
      UnifiedLogger.info('generateSectionSummaryTexts: LLM summary request failed: ' + error);
    }
  }

  sections.forEach(function(section) {
    const key = section.sectionKey;
    const fallback = buildFallbackSectionSummary(section, currency);
    const llmSummary = llmSummaries && llmSummaries[key] ? llmSummaries[key] : null;
    summaryMap[key] = llmSummary || fallback;
  });
  return {
    summaries: summaryMap,
    usedLLM: usedLLM
  };
}

function buildSectionSummaryText(section, summaryText, totalText) {
  const cleanSummary = summaryText ? String(summaryText).trim() : '';
  const cleanTotal = totalText ? String(totalText).trim() : '';
  const bulletLines = buildSectionLineItemBullets(section);
  const parts = [];
  if (cleanSummary) {
    parts.push(cleanSummary);
  }
  if (bulletLines.length) {
    parts.push(bulletLines.map(function(line) {
      return '- ' + line;
    }).join('\n'));
  }
  if (cleanTotal) {
    parts.push('Total: ' + cleanTotal);
  }
  if (!parts.length) {
    parts.push('');
  }
  return parts.join('\n\n');
}

function buildSectionLineItemBullets(section) {
  if (!section || !Array.isArray(section.lineItems)) {
    return [];
  }
  return section.lineItems.map(function(item) {
    const quantityPrefix = formatLineItemQuantityPrefix(item);
    const unitDisplay = formatLineItemUnitDisplay(item);
    const label = (item && (item.clientLineName || item.description || item.itemCode)) || 'Line item';
    let line = label;
    if (quantityPrefix) {
      line = quantityPrefix + ' – ' + label;
    }
    if (unitDisplay) {
      line = line + ' (' + unitDisplay + ')';
    }
    return line;
  }).filter(function(line) {
    return !!line;
  });
}

function pluralizeUnitForQuantity(unitLabel, qtyNumeric) {
  if (!unitLabel) {
    return '';
  }
  if (qtyNumeric === null || Math.abs(qtyNumeric - 1) < 0.0001) {
    return unitLabel;
  }
  const lower = unitLabel.toLowerCase();
  if (lower === 'day') {
    return 'Days';
  }
  if (lower === 'hour') {
    return 'Hours';
  }
  if (lower === 'project') {
    return 'Projects';
  }
  if (lower.endsWith('s')) {
    return unitLabel;
  }
  return unitLabel + 's';
}

function applySectionSummariesToQuoteBuilder(plan, options) {
  const currency = plan && plan.currency
    ? plan.currency
    : (options && options.currency ? options.currency : 'AED');
  const sections = gatherSectionSummaryContexts(currency);
  if (!sections.length) {
    return;
  }
  const summaryResult = generateSectionSummaryTexts(sections, {
    currency: currency,
    disableLLM: options && options.disableLLM,
    simulateLLM: options && options.simulateSectionSummaries
  });
  const summaryMap = summaryResult.summaries || {};
  const sanitizedUpdates = [];

  sections.forEach(function(section) {
    const summaryText = summaryMap[section.sectionKey] ||
      buildFallbackSectionSummary(section, currency);
    const subtotalValue = section.subtotal !== null && section.subtotal !== undefined
      ? formatCurrencyWithCode(section.subtotal, currency)
      : '';
    const html = buildSectionSummaryText(section, summaryText, subtotalValue);
    sanitizedUpdates.push({
      row: section.rowIndex,
      col: QB_COLS.DESCRIPTION + 1,
      value: html
    });
  });

  const sheet = getQuoteBuilderSheet();
  if (sanitizedUpdates.length) {
    try {
      QuoteUtils.batchUpdateCells(sheet, sanitizedUpdates);
    } catch (updateError) {
      UnifiedLogger.info('applySectionSummariesToQuoteBuilder: failed to write sanitized summaries: ' + updateError);
    }
  }

  try {
    logAIEvent('quote.section.summary.applied', {
      sections: sections.length,
      usedLLM: !!summaryResult.usedLLM
    });
  } catch (logError) {
    UnifiedLogger.info('applySectionSummariesToQuoteBuilder: logging failed: ' + logError);
  }
}

function runWithoutItemCodeValidation(sheet, callback) {
  if (!sheet || typeof callback !== 'function') {
    return;
  }
  const itemColumnIndex = QB_COLS.ITEM_CODE + 1;
  const totalRows = Math.max(1, sheet.getMaxRows() - 3);
  const targetRange = sheet.getRange(4, itemColumnIndex, totalRows, 1);
  logInvalidItemCodeValues(targetRange, 'runWithoutItemCodeValidation');
  callback();
}

/**
 * Log any item codes in the given range that are not recognized by the catalog.
 * @param {Range} range Column range for item codes
 * @param {string} context Description for log output
 */
function logInvalidItemCodeValues(range, context) {
  if (!range) {
    return;
  }
  const values = range.getValues();
  if (!values || !values.length) {
    return;
  }
  let cache = null;
  try {
    cache = typeof getXeroLookupCache === 'function'
      ? getXeroLookupCache()
      : null;
  } catch (lookupError) {
    UnifiedLogger.info((context || 'logInvalidItemCodeValues') + ': lookup cache unavailable: ' + lookupError);
  }
  const invalid = [];
  const startRow = range.getRow();
  for (let i = 0; i < values.length; i++) {
    const rawValue = values[i][0];
    if (!rawValue && rawValue !== 0) {
      continue;
    }
    const normalized = normalizeSku(rawValue);
    if (!normalized) {
      continue;
    }
    let recognized = false;
    if (cache && cache.size) {
      recognized = cache.has(normalized);
    } else if (typeof lookupItem === 'function') {
      recognized = !!lookupItem(normalized);
    }
    if (!recognized) {
      invalid.push({
        row: startRow + i,
        value: normalized
      });
      if (invalid.length >= 10) {
        break;
      }
    }
  }
  if (invalid.length) {
    const samples = invalid.map(entry => `${entry.value}@${entry.row}`).join(', ');
    UnifiedLogger.info((context || 'logInvalidItemCodeValues') + ': invalid SKUs detected: ' +
      invalid.length + ' entries (' + samples + ')');
  }
}

function renderSectionRow(section, columnCount) {
  const row = buildQuoteRowTemplate(columnCount);
  row[QB_COLS.ROW_ID] = '=ROW()';
  row[QB_COLS.TYPE] = ROW_TYPES.SECTION;
  row[QB_COLS.VISIBILITY] = VISIBILITY.CLIENT;
  row[QB_COLS.SECTION_NAME] = sanitizeSheetText(section.sectionName || section.canonical || '');
  row[QB_COLS.CLIENT_LINE_NAME] = sanitizeSheetText((section.sectionName || '') + ' Total');
  row[QB_COLS.NOTES] = sanitizeSheetText(ensureArray(section.sectionWarnings).join('\n'));
  if (section.scopeEntryId) {
    row[QB_COLS.SCOPE_ENTRY_ID] = sanitizeSheetText(section.scopeEntryId);
  }
  return row;
}

function renderLineRow(section, item, columnCount) {
  const row = buildQuoteRowTemplate(columnCount);
  row[QB_COLS.ROW_ID] = '=ROW()';
  row[QB_COLS.TYPE] = ROW_TYPES.LINE;
  const defaultVisibility = VISIBILITY.INTERNAL || 'Internal';
  const visibilityValue = item.visibility || defaultVisibility;
  row[QB_COLS.VISIBILITY] = visibilityValue;
  row[QB_COLS.SECTION_NAME] = sanitizeSheetText(section.sectionName || section.canonical || '');
  const normalizedSku = normalizeSku(item.sku || '');
  if (normalizedSku) {
    UnifiedLogger.info('renderLineRow writing SKU ' + normalizedSku + ' for scopeEntryId ' + (item.scopeEntryId || '(unknown)') + ' / section ' + (section.sectionName || '(unnamed)'));
  }
  let catalogItem = null;
  let catalogLookupFailed = false;
  if (normalizedSku) {
    catalogItem = safeLookupItem(normalizedSku);
    if (!catalogItem) {
      catalogLookupFailed = true;
    }
    row[QB_COLS.ITEM_CODE] = sanitizeSheetText(normalizedSku);
  } else {
    row[QB_COLS.ITEM_CODE] = '';
  }
  row[QB_COLS.DESCRIPTION] = '';
  if (visibilityValue === VISIBILITY.CLIENT) {
    const clientLabel = item.clientLineName || '';
    if (clientLabel) {
      row[QB_COLS.CLIENT_LINE_NAME] = sanitizeSheetText(clientLabel);
    }
  } else {
    row[QB_COLS.CLIENT_LINE_NAME] = '';
  }
  row[QB_COLS.QTY] = item.qty !== undefined && item.qty !== null ? item.qty : '';
  const resolvedUnit = catalogItem && catalogItem.unit
    ? catalogItem.unit
    : (item.unit || '');
  row[QB_COLS.UNIT] = sanitizeSheetText(resolvedUnit);
  row[QB_COLS.UNIT_RATE] = '';
  row[QB_COLS.INTERNAL_COST] = item.internalCost !== undefined && item.internalCost !== null ? item.internalCost : '';
  const notes = [];
  if (Array.isArray(item.warnings)) {
    notes.push.apply(notes, item.warnings);
  }
  if (item.justification) {
    notes.push('Justification: ' + item.justification);
  }
  if (catalogLookupFailed) {
    notes.push('SKU ' + normalizedSku + ' not found in XERO_READY catalog');
  }
  row[QB_COLS.NOTES] = sanitizeSheetText(notes.join('\n'));
  row[QB_COLS.SCOPE_ENTRY_ID] = sanitizeSheetText(item.scopeEntryId || '');
  return row;
}

function renderFeeRow(fee, columnCount) {
  const row = buildQuoteRowTemplate(columnCount);
  row[QB_COLS.ROW_ID] = '=ROW()';
  row[QB_COLS.TYPE] = ROW_TYPES.FEE;
  row[QB_COLS.VISIBILITY] = VISIBILITY.CLIENT;
  row[QB_COLS.SECTION_NAME] = sanitizeSheetText(fee.label || 'Agency Fee');
  row[QB_COLS.CLIENT_LINE_NAME] = sanitizeSheetText(fee.label || 'Agency Fee');
  row[QB_COLS.AGENCY_FEE_PCT] = fee.percentage !== undefined ? fee.percentage : '';
  row[QB_COLS.FEE_BASE] = '';
  row[QB_COLS.FEE_AMOUNT] = '';
  row[QB_COLS.CLIENT_AMOUNT] = '';
  row[QB_COLS.NOTES] = sanitizeSheetText(ensureArray(fee.warnings).join('\n'));
  return row;
}

function collectRowUpdates(rowValues, rowIndex) {
  const updates = [];
  if (!Array.isArray(rowValues)) {
    return updates;
  }
  for (let i = 0; i < rowValues.length; i++) {
    const value = rowValues[i];
    if (value !== undefined && value !== null && value !== '') {
      updates.push({
        row: rowIndex,
        col: i + 1,
        value: value
      });
    }
  }
  return updates;
}

function ensureEveryPlanSkuExists(plan) {
  if (!plan || !Array.isArray(plan.sections)) {
    return [];
  }
  let lookupCache = null;
  try {
    lookupCache = typeof getXeroLookupCache === 'function'
      ? getXeroLookupCache()
      : null;
  } catch (lookupError) {
    UnifiedLogger.info('ensureEveryPlanSkuExists: lookup cache unavailable: ' + lookupError);
    return [];
  }
  if (!lookupCache || !lookupCache.size) {
    return [];
  }
  const missing = [];
  const track = new Set();
  const collectSku = function(sku) {
    const normalized = sku ? String(sku).trim().toUpperCase() : '';
    if (!normalized || track.has(normalized)) {
      return;
    }
    track.add(normalized);
    if (!lookupCache.has(normalized)) {
      missing.push(normalized);
    }
  };
  plan.sections.forEach(function(section) {
    (section.items || []).forEach(function(item) {
      if (item && item.sku) {
        collectSku(item.sku);
      }
    });
  });
  if (Array.isArray(plan.fees)) {
    plan.fees.forEach(function(fee) {
      if (fee && fee.sku) {
        collectSku(fee.sku);
      }
    });
  }
  if (missing.length) {
    UnifiedLogger.info('ensureEveryPlanSkuExists: missing catalog SKUs -> ' + missing.join(', '));
  }
  return missing;
}

function restoreFormulasWithValidation_(sheet, startRow, numRows, totalCols) {
  try {
    const templateRowIndex = 3;
    const templateRange = sheet.getRange(templateRowIndex, 1, 1, totalCols);
    const formulas = templateRange.getFormulasR1C1()[0];

    const criticalCols = [
      QB_COLS.ROW_NET,
      QB_COLS.SECTION_SUBTOTAL,
      QB_COLS.FEE_BASE,
      QB_COLS.FEE_AMOUNT,
      QB_COLS.CLIENT_AMOUNT,
      QB_COLS.INTERNAL_COST,
      QB_COLS.MARGIN
    ];

    const missingFormulas = [];
    criticalCols.forEach(function(idx) {
      if (!formulas[idx]) {
        missingFormulas.push(idx + 1);
      }
    });

    if (missingFormulas.length > 0) {
      UnifiedLogger.info('WARNING: Template row (3) is missing formulas in columns: ' + missingFormulas.join(', '));
    }

    formulas.forEach(function(formula, idx) {
      if (formula) {
        const col = idx + 1;
        const source = sheet.getRange(templateRowIndex, col);
        const target = sheet.getRange(startRow, col, numRows, 1);
        source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      }
    });
  } catch (e) {
    UnifiedLogger.info('restoreFormulasWithValidation_ error: ' + e);
    throw new AppError('TEMPLATE_ERROR', 'Failed to restore formulas from template row. Check Row 3 configuration.');
  }
}

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function populateQuoteBuilderFromPlan(plan, scopeMap, options) {
  const trace = UnifiedLogger.startTrace('AISidebar', 'populateQuoteBuilderFromPlan', { hasPlan: !!plan, hasScopeMap: !!scopeMap });
  try {
  UnifiedLogger.info('QB Populate', 'Starting Quote Builder population', {
    sectionCount: plan.sections ? plan.sections.length : 0,
    hasWarnings: !!(plan.warnings && plan.warnings.length)
  });

  const liveSheet = getQuoteBuilderSheet();
  UnifiedLogger.debug('QB Populate', 'Quote Builder sheet accessed', {
    sheetName: liveSheet.getName(),
    lastRow: liveSheet.getLastRow(),
    lastColumn: liveSheet.getLastColumn()
  });

  ensureQuoteBuilderColumnCapacity(liveSheet);

  if (typeof capturePlanScriptSnippets === 'function') {
    try { capturePlanScriptSnippets(plan); } catch (e) { UnifiedLogger.info('capturePlanScriptSnippets failed: ' + e); }
  }
  const missingSkus = ensureEveryPlanSkuExists(plan);
  if (missingSkus.length) {
    UnifiedLogger.warn('QB Populate', 'Missing SKUs detected', { count: missingSkus.length, skus: missingSkus });
    plan.warnings = ensureArray(plan.warnings);
    plan.warnings.push('Plan references SKUs not in catalog: ' + missingSkus.join(', '));
  }

  const totalColumns = liveSheet.getLastColumn();
  if (typeof validateSheetHeaders_ === 'function') {
    validateSheetHeaders_(liveSheet, QB_HEADER_MAP, QB_COLS);
  }

  const lastRow = liveSheet.getLastRow();
  const dataStartRow = 4;
  let existingRows = [];
  if (lastRow >= dataStartRow) {
    const range = liveSheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, totalColumns);
    const values = range.getValues();
    existingRows = values.map(function(row, idx) {
      return {
        row: row,
        rowIndex: idx + dataStartRow,
        id: String(row[QB_COLS.SCOPE_ENTRY_ID] || ''),
        type: row[QB_COLS.TYPE],
        description: row[QB_COLS.DESCRIPTION],
        notes: row[QB_COLS.NOTES],
        markup: row[QB_COLS.MARKUP_PCT]
      };
    });
  }

  const manualRowsMap = new Map();
  const existingIdMap = new Map();
  let lastId = 'HEAD';

  existingRows.forEach(function(item) {
    if (item.id) {
      existingIdMap.set(item.id, item);
      lastId = item.id;
    } else {
      const desc = item.row[QB_COLS.DESCRIPTION] || item.row[QB_COLS.CLIENT_LINE_NAME];
      if (desc) {
         if (!manualRowsMap.has(lastId)) {
           manualRowsMap.set(lastId, []);
         }
         manualRowsMap.get(lastId).push(item.row);
      }
    }
  });

  const finalRows = [];
  const processedIds = new Set();

  const addManualFollowers = function(id) {
    if (manualRowsMap.has(id)) {
      const manuals = manualRowsMap.get(id);
      manuals.forEach(function(row) {
         const preserved = row.slice();
         preserved[QB_COLS.ROW_ID] = '=ROW()';
         finalRows.push(preserved);
      });
      manualRowsMap.delete(id);
    }
  };

  addManualFollowers('HEAD');

  const planRows = [];
  if (plan.sections) {
    plan.sections.forEach(function(section) {
      planRows.push(renderSectionRow(section, totalColumns));
      if (section.items) {
        section.items.forEach(function(item) {
          planRows.push(renderLineRow(section, item, totalColumns));
        });
      }
    });
  }
  if (plan.fees) {
    plan.fees.forEach(function(fee) {
      planRows.push(renderFeeRow(fee, totalColumns));
    });
  }

  planRows.forEach(function(newRow) {
    const newId = newRow[QB_COLS.SCOPE_ENTRY_ID];
    if (newId && existingIdMap.has(newId)) {
      const existing = existingIdMap.get(newId);
      processedIds.add(newId);
      const mergedRow = newRow.slice();

      if (existing.notes) mergedRow[QB_COLS.NOTES] = existing.notes;
      if (existing.markup !== '' && existing.markup != null) mergedRow[QB_COLS.MARKUP_PCT] = existing.markup;

      const newSku = newRow[QB_COLS.ITEM_CODE];
      const oldSku = existing.row[QB_COLS.ITEM_CODE];

      if (String(newSku || '') === String(oldSku || '')) {
         if (existing.description && String(existing.description).trim() !== '') {
            mergedRow[QB_COLS.DESCRIPTION] = existing.description;
         }
         const oldClientName = existing.row[QB_COLS.CLIENT_LINE_NAME];
         if (oldClientName && String(oldClientName).trim() !== '') {
            mergedRow[QB_COLS.CLIENT_LINE_NAME] = oldClientName;
         }
      }
      finalRows.push(mergedRow);
    } else {
      finalRows.push(newRow);
    }
    if (newId) addManualFollowers(newId);
  });

  existingIdMap.forEach(function(item, id) {
    if (!processedIds.has(id)) {
      const orphanRow = item.row.slice();
      const currentNotes = orphanRow[QB_COLS.NOTES] || '';
      if (!currentNotes.includes('[Orphaned]')) {
         orphanRow[QB_COLS.NOTES] = (currentNotes ? currentNotes + ' ' : '') + '[Orphaned: Not in current plan]';
      }
      orphanRow[QB_COLS.ROW_ID] = '=ROW()';
      finalRows.push(orphanRow);
      addManualFollowers(id);
    }
  });

  manualRowsMap.forEach(function(rows) {
    rows.forEach(function(r) {
        const p = r.slice();
        p[QB_COLS.ROW_ID] = '=ROW()';
        finalRows.push(p);
    });
  });

  const rowsNeeded = finalRows.length;
  const currentMaxRows = liveSheet.getMaxRows();

  if (currentMaxRows > 3) {
    liveSheet.getRange(4, 1, currentMaxRows - 3, totalColumns).clearContent();
  }
  ensureQuoteBuilderCapacity(liveSheet, 3 + rowsNeeded);

  if (rowsNeeded > 0) {
    liveSheet.getRange(4, 1, rowsNeeded, totalColumns).setValues(finalRows);
    restoreFormulasWithValidation_(liveSheet, 4, rowsNeeded, totalColumns);
  }

  try {
    applySectionSummariesToQuoteBuilder(plan, options || {});
  } catch (summaryError) {
    UnifiedLogger.info('populateQuoteBuilderFromPlan: section summary generation failed: ' + summaryError);
  }

  UnifiedLogger.info('QB Populate', 'Quote Builder population complete', {
    finalRowCount: liveSheet.getLastRow(),
    dataRows: liveSheet.getLastRow() - 3
  });

  trace.complete('populateQuoteBuilderFromPlan complete', {
    rowCount: liveSheet.getLastRow() - 3
  });
  } catch (error) {
    trace.fail('populateQuoteBuilderFromPlan failed', error);
    throw error;
  }
}

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function collectUnresolvedItems(plan) {
  const trace = UnifiedLogger.startTrace('AISidebar', 'collectUnresolvedItems', {
    hasPlan: !!plan,
    sectionCount: plan && plan.sections ? plan.sections.length : 0
  });

  try {
    UnifiedLogger.debug('Unresolved', 'Collecting unresolved items', {
      sectionCount: plan && plan.sections ? plan.sections.length : 0
    });

    const unresolved = [];
  if (!plan) {
    return unresolved;
  }
  (plan.sections || []).forEach(function(section) {
    (section.items || []).forEach(function(item) {
      const warnings = ensureArray(item.warnings).filter(function(message) {
        if (!message) {
          return false;
        }
        const normalized = String(message).toLowerCase();
        if (normalized.indexOf('catalog') !== -1 || normalized.indexOf('sku') !== -1) {
          return false;
        }
        if (normalized.indexOf('missing quantity') !== -1 || normalized.indexOf('missing rate') !== -1) {
          return false;
        }
        return true;
      });
      if (warnings.length > 0) {
        unresolved.push({
          scopeEntryId: item.scopeEntryId || '',
          warnings: warnings
        });
      }
    });
  });

  UnifiedLogger.info('Unresolved', 'Unresolved items collected', {
    unresolvedCount: unresolved.length
  });

  trace.complete('Unresolved items collected', {
    unresolvedCount: unresolved.length
  });

  return unresolved;

  } catch (error) {
    trace.fail('Collect unresolved items failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'collecting unresolved items',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    // Return empty array
    return [];
  }
}

function persistQuoteRun(user, run) {
  if (!run || !run.id) {
    return;
  }
  upsertUserSidebarStateRow({
    id: run.id,
    user: user,
    type: 'quoteRun',
    label: run.label || run.id,
    payload: JSON.stringify(run),
    timestamp: run.executedAt || new Date().toISOString()
  });
}

function persistCostConfig(user, costConfig) {
  if (!costConfig || typeof costConfig !== 'object') {
    return;
  }
  upsertUserSidebarStateRow({
    id: user + '_cost',
    user: user,
    type: 'costConfig',
    label: 'LLM Cost Config',
    payload: JSON.stringify(costConfig),
    timestamp: new Date().toISOString()
  });
}

function extractScopeDraft(options) {
  const request = options || {};
  const briefText = String(request.briefText || '').trim();
  const reviewerNotes = String(request.reviewerNotes || '').trim();
  const fileIds = Array.isArray(request.fileIds) ? filterTruthy(request.fileIds) : [];
  if (!briefText && fileIds.length === 0) {
    throw new AppError('SCOPE_BRIEF', 'Provide a brief or at least one attachment before extracting the scope.');
  }
  const summaries = fetchAttachmentSummaries(fileIds);
  const combinedText = filterTruthy([briefText, reviewerNotes]
    .concat(
      summaries
        .filter(function(summary) {
          return summary && summary.text && summary.text.indexOf('(PDF summary unavailable') === -1 && summary.text.indexOf('(Unable to read attachment') === -1;
        })
        .map(function(summary) {
          return summary.fileName + '\n' + summary.text;
        })
    ))
    .join('\n\n');
  const answers = toAnswerList(request.requiredAnswers, request.answers);
  const briefType = request.briefType || BRIEF_TYPE_DEFAULT;
  const context = buildLLMContext(combinedText, summaries, null, {
    mode: 'scope-draft',
    persona: 'analyst',
    answers: answers,
    clientNotes: reviewerNotes || '',
    clientContext: request.clientContext || {},
    briefType: briefType
  });

  const simulateLLM = request.simulateLLM === true;
  const stubPayload = simulateLLM ? (request.llmStub || null) : null;
  if (simulateLLM && !stubPayload) {
    throw new AppError('LLM_SIM', 'Simulated scope extraction requested without a stub payload.');
  }
  let messages;

  // Refactored 2026-01-10: Use simple 8-field schema (CONTRACT_20260110_190200 Phase 4 D4.1)
  // Pattern from App-script/AISidebar.js:13355 (schema setup for LLM validation)
  const scopeSchema = {
    type: 'json_schema',
    json_schema: {
      name: SCOPE_DRAFT_LLM_SCHEMA.name,
      strict: true,
      schema: SCOPE_DRAFT_LLM_SCHEMA.schema
    }
  };

  if (scopeSchema && scopeSchema.json_schema && scopeSchema.json_schema.schema) {
    UnifiedLogger.info('ScopeDraft schema required keys: ' + (scopeSchema.json_schema.schema.required || []).join(','));
    UnifiedLogger.info('ScopeDraft schema property keys: ' + Object.keys(scopeSchema.json_schema.schema.properties || {}).join(','));
  }

  let llmResult;
  if (simulateLLM) {
    llmResult = {
      output: stubPayload,
      usage: request.llmUsage || null
    };
  } else {
    messages = buildScopeDraftPrompt(context);
    llmResult = invokeLLMChatWithRunRecovery(messages, {
      runType: 'scope-draft',
      eventType: 'scope.draft.llm',
      modelProperty: 'LLM_SCOPE_MODEL',
      maxTokens: context.maxTokens || LLM_SCOPE_RESPONSE_TOKENS_DEFAULT,
      responseFormat: scopeSchema
    });
  }

  // Refactored 2026-01-10: Simple parse → normalize flow (CONTRACT_20260110_190200 Phase 4 D4.2-D4.3)
  // Pattern from App-script/AISidebar.js:13388 (LLM output processing)
  // Removed: Complex repair call logic (eliminates 1-2 repair LLM calls per draft)
  // Removed: Multi-stage transformation pipeline (replaced with single normalization)

  let parsed;
  if (simulateLLM) {
    parsed = llmResult.output;
  } else {
    parsed = tryParseJsonResponse(llmResult.output, context);
  }

  // Single-pass normalization: 8-field simple entries → 22-field complete entries
  const sanitized = normalizeScopeDraftToFinalStructure(parsed);

  // Log normalization metrics (CONTRACT_20260110_190200 Phase 4 D4.4)
  const llmEntryCount = parsed.scopeEntries ? parsed.scopeEntries.length : 0;
  const finalEntryCount = sanitized.scopeEntries ? sanitized.scopeEntries.length : 0;
  const sectionCount = sanitized.scopeEntries ? sanitized.scopeEntries.filter(function(e) { return e.isSection; }).length : 0;
  const lineItemCount = finalEntryCount - sectionCount;

  UnifiedLogger.info('AISidebar', 'Scope draft normalization complete', {
    llmEntryCount: llmEntryCount,
    finalEntryCount: finalEntryCount,
    sectionCount: sectionCount,
    lineItemCount: lineItemCount,
    repairCalls: 0,
    normalizationApplied: true
  });

  // Validate final structure
  validateScopeDraftPayload(sanitized);

  const recoveryEnabled = isScopeRecoveryEnabled();
  const fallbackPhaseUsed = recoveryEnabled && Array.isArray(sanitized.scopeEntries)
    && sanitized.scopeEntries.some(function(entry) {
      return entry && entry.metadata && entry.metadata.phaseRecovered === 'fallback';
    });
  if (fallbackPhaseUsed) {
    sanitized.fallbackPhaseUsed = true;
  }

  const diagnostics = [];

  if (typeof getVectorStoreSyncStatus === 'function') {
    const vectorStatus = getVectorStoreSyncStatus();
    if (vectorStatus && vectorStatus.stale) {
      diagnostics.push({
        level: 'warning',
        message: 'Vector store is stale. AI catalog matches may be outdated. Sync via Data Ops menu.'
      });
    }
  }

  if (sanitized.warnings && sanitized.warnings.length) {
    diagnostics.push({
      level: 'warning',
      message: sanitized.warnings.join('\n')
    });
  }
  if (fallbackPhaseUsed) {
    diagnostics.push({
      level: 'info',
      message: 'Scope phase config was unavailable for this brief type; recovery sections were applied.'
    });
  }

  if (request.costConfig) {
    const sanitizedCost = sanitizeCostConfigServer(request.costConfig);
    if (sanitizedCost) {
      persistCostConfig(getActiveUserEmailSafe(), sanitizedCost);
    }
  }

  try {
    logAIEvent('scope.extract', {
      runType: 'scope-draft',
      outcome: 'success',
      fallbackPhaseUsed: fallbackPhaseUsed,
      auditMeta: {
        warnings: sanitized.warnings ? sanitized.warnings.length : 0,
        questions: sanitized.questions ? sanitized.questions.length : 0,
        simulated: simulateLLM ? true : undefined
      }
    });
  } catch (logError) {
    UnifiedLogger.info('scope.extract logging failed: ' + logError);
  }

  return {
    success: true,
    draft: sanitized,
    diagnostics: diagnostics,
    usage: llmResult.usage || null,
    configStatus: (typeof getConfigStatus === 'function') ? getConfigStatus() : undefined
  };
}

function buildPlanSummaryHtml(plan, validation, options) {
  const vectorHitMap = options && options.vectorHits ? options.vectorHits : {};
  const sections = plan && Array.isArray(plan.sections) ? plan.sections : [];
  const metadata = plan && plan.metadata ? plan.metadata : {};
  const commercialFitMap = metadata.commercialFitMap || {};
  const lines = [];
  lines.push('<div class="summary-block">');
  lines.push('<strong>Sections & Line Items</strong>');
  sections.forEach(function(section) {
    const warningBadge = section.sectionWarnings && section.sectionWarnings.length
      ? ' <span class="warning-pill">' + section.sectionWarnings.length + '</span>'
      : '';
    lines.push('<div class="summary-section">');
    lines.push('<div class="summary-section-header">' + escapeHtml(section.sectionName || section.canonical || '(unnamed)') + warningBadge + '</div>');
    lines.push('<ul class="summary-lines">');
    (section.items || []).forEach(function(item) {
      const qty = item.qty !== undefined && item.qty !== null ? item.qty : '';
      const unit = item.unit || '';
      const rate = item.unitRate !== undefined && item.unitRate !== null ? item.unitRate : '';
      const visibility = item.visibility || 'Client';
      const description = escapeHtml(item.clientLineName || item.description || item.sku || '(line item)');
      const skuLabel = item.sku ? ' [' + escapeHtml(item.sku) + ']' : '';
      const metrics = [];
      if (qty !== '') {
        metrics.push(qty + (unit ? ' ' + escapeHtml(unit) : ''));
      }
      if (rate !== '') {
        metrics.push('AED ' + rate);
      }
      metrics.push(visibility);
      const warnings = Array.isArray(item.warnings) ? filterTruthy(item.warnings) : [];
      const warningBadge = warnings.length
        ? '<span class="summary-line-warning">Warnings: ' + warnings.length + '</span>'
        : '';
      const metricsHtml = filterTruthy(metrics
        .map(metric => '<span>' + escapeHtml(metric || '') + '</span>'))
        .join('');
      const entryId = item && (item.scopeEntryId || item.id) ? String(item.scopeEntryId || item.id) : '';
      const detailParentId = item && item.metadata && item.metadata.vectorDetailParent
        ? String(item.metadata.vectorDetailParent)
        : '';
      const detailId = item && item.id ? String(item.id) : '';
      const hasVectorMatch = entryId && Array.isArray(vectorHitMap[entryId]) && vectorHitMap[entryId].length > 0;
      const fitEntry = entryId && commercialFitMap[entryId] ? commercialFitMap[entryId] : null;
      const tooltipText = fitEntry ? formatFitTooltip(fitEntry) : '';
      const tooltipAttribute = tooltipText
        ? ' data-tooltip="' + escapeHtml(tooltipText) + '" title="' + escapeHtml(tooltipText) + '"'
        : '';
      const attributeList = [];
      if (entryId) {
        attributeList.push('data-scope-entry-id="' + escapeHtml(entryId) + '"');
      }
      if (detailParentId && detailId) {
        attributeList.push('data-vector-detail-parent="' + escapeHtml(detailParentId) + '"');
        attributeList.push('data-vector-detail-id="' + escapeHtml(detailId) + '"');
      }
      if (hasVectorMatch) {
        attributeList.push('data-vector-hit="true"');
      }
      const attributeString = attributeList.length ? ' ' + attributeList.join(' ') : '';
      // Capture vector context so diagnostics and UX widgets can anchor badges reliably.
      lines.push(
        '<li' + tooltipAttribute + '><div class="summary-line-card"' + attributeString + '><div class="summary-line-heading">' +
          description + skuLabel + (warningBadge ? ' ' + warningBadge : '') +
        '</div><div class="summary-line-metrics">' +
          metricsHtml +
        '</div></div></li>'
      );
    });
    lines.push('</ul>');
    lines.push('</div>');
  });
  lines.push('</div>');
  if (plan.fees && plan.fees.length) {
    lines.push('<div class="summary-block"><strong>Fees</strong><ul>');
    plan.fees.forEach(function(fee) {
      lines.push('<li>' + escapeHtml(fee.label || 'Agency Fee') + '</li>');
    });
    lines.push('</ul></div>');
  }
  if (validation && validation.errors && validation.errors.length) {
    lines.push('<div class="summary-block error"><strong>Validation Errors</strong><ul>');
    validation.errors.forEach(function(error) {
      lines.push('<li>' + escapeHtml(error) + '</li>');
    });
    lines.push('</ul></div>');
  }
  if (validation && validation.warnings && validation.warnings.length) {
    lines.push('<div class="summary-block warning"><strong>Validation Warnings</strong><ul>');
    validation.warnings.forEach(function(warning) {
      lines.push('<li>' + escapeHtml(warning) + '</li>');
    });
    lines.push('</ul></div>');
  }
  return lines.join('');
}

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function generateQuoteFromApprovedScope(request) {
  const trace = UnifiedLogger.startTrace('AISidebar', 'generateQuoteFromApprovedScope', {
    hasRequest: !!request
  });
  try {
    const startTime = Date.now();
  UnifiedLogger.info('QuoteGen', '🚀 START generateQuoteFromApprovedScope', { timestamp: new Date().toISOString() });

  try {
    const payload = request || {};
  UnifiedLogger.debug('QuoteGen', 'Payload received', {
    hasApprovedScope: !!(payload.approvedScope),
    snapshotId: payload.snapshotId || 'none',
    briefType: payload.briefType || 'default',
    fileCount: Array.isArray(payload.fileIds) ? payload.fileIds.length : 0
  });

  const approvedScope = payload.approvedScope;
  if (!approvedScope || typeof approvedScope !== 'object') {
    UnifiedLogger.error('QuoteGen', 'Missing approved scope payload');
    throw new AppError('SCOPE_APPROVAL', 'Approved scope payload is required.');
  }
  const snapshotId = payload.snapshotId || '';
  const allowIncomplete = payload.allowIncomplete === true;
  const fileIds = Array.isArray(payload.fileIds) ? filterTruthy(payload.fileIds) : [];
  const briefText = String(payload.briefText || '').trim();
  const clientNotes = ensureArray(payload.clientNotes).join('\n\n');
  const mapperNotes = String(payload.mapperNotes || '').trim();
  const briefType = payload.briefType || BRIEF_TYPE_DEFAULT;

  UnifiedLogger.info('QuoteGen', 'Validating scope contract', { snapshotId });
  const scopeMap = validateScopeContract(approvedScope);
  UnifiedLogger.info('QuoteGen', 'Scope validated', {
    totalEntries: scopeMap.totalEntries || 0,
    hashMismatch: scopeMap.hashMismatch || false
  });
  
  // If non-critical mismatch occurred, we proceed but log it.
  const isMinorMismatch = scopeMap.hashMismatch === true;

  UnifiedLogger.info('QuoteGen', 'Fetching attachments', { fileCount: fileIds.length });
  const summaries = fetchAttachmentSummaries(fileIds);
  UnifiedLogger.info('QuoteGen', 'Attachments fetched', { summaryCount: summaries.length });

  const answers = toAnswerList(payload.requiredAnswers, payload.answers);
  const combinedText = filterTruthy([briefText, clientNotes, mapperNotes]
    .concat(
      summaries
        .filter(function(summary) {
          return summary && summary.text && summary.text.indexOf('(PDF summary unavailable') === -1 && summary.text.indexOf('(Unable to read attachment') === -1;
        })
        .map(function(summary) {
          return summary.fileName + '\n' + summary.text;
        })
    ))
    .join('\n\n');

  UnifiedLogger.debug('QuoteGen', 'Combined text length', { chars: combinedText.length });

  // Clone and clean the approved scope to keep the planning prompt lean (IDs/qtys only).
  const optimizedScope = approvedScope && typeof approvedScope === 'object'
    ? deepClone(approvedScope)
    : {};
  if (Array.isArray(optimizedScope.scopeEntries)) {
    optimizedScope.scopeEntries.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      delete entry.sourceExcerpt;
      delete entry.interpretation;
      delete entry.approvalStatus;
    });
  }

  UnifiedLogger.info('QuoteGen', '📝 Building LLM context', { briefType });
  const context = buildLLMContext(combinedText, summaries, optimizedScope, {
    mode: 'plan',
    persona: 'proposal-author',
    answers: answers,
    clientNotes: clientNotes,
    mapperNotes: mapperNotes,
    clientContext: payload.clientContext || {},
    briefType: briefType,
    scopeMap: scopeMap,
    editedBundlePlan: payload.editedBundlePlan || null
  });
  UnifiedLogger.info('QuoteGen', 'LLM context built', {
    hasContractEntries: !!(context.contractEntries),
    hasCommercialFit: !!(context.commercialFit),
    contractEntryCount: context.contractEntries ? context.contractEntries.length : 0
  });

  context.approvedScope = approvedScope;
  UnifiedLogger.info('QuoteGen', '🎯 Building deterministic plan');
  const plan = buildDeterministicPlan(context);
  UnifiedLogger.info('QuoteGen', 'Plan built', {
    sectionCount: plan.sections ? plan.sections.length : 0,
    hasMetadata: !!(plan.metadata)
  });
  plan.metadata = plan.metadata || {};
  plan.metadata.contractEntries = context.contractEntries || [];
  plan.metadata.commercialFit = context.commercialFit || {};
  plan.metadata.commercialFitMap = buildCommercialFitIndex(context.commercialFit ? context.commercialFit.entries : []);
  plan.metadata.scopeMap = scopeMap;
  plan.metadata.configStatus = context.configStatus || plan.metadata.configStatus;
  plan.metadata.healthChecks = ensureArray(plan.metadata.healthChecks);
  if (context.sectionHierarchy) {
    plan.metadata.scopeHierarchy = context.sectionHierarchy;
  }
  if (plan && Array.isArray(plan.sections)) {
    const filteredSections = [];
    const removedSections = [];
    plan.sections.forEach(function(section) {
      if (!section || typeof section !== 'object') {
        removedSections.push({
          sectionName: section && section.sectionName ? section.sectionName : '',
          canonical: section && section.canonical ? section.canonical : ''
        });
        return;
      }
      if (!Array.isArray(section.items)) {
        removedSections.push({
          sectionName: section.sectionName || '',
          canonical: section.canonical || ''
        });
        return;
      }
      section.items = section.items.filter(function(item) {
        return item && typeof item === 'object';
      });
      if (section.items.length === 0) {
        removedSections.push({
          sectionName: section.sectionName || '',
          canonical: section.canonical || '',
          scopeEntryId: section.scopeEntryId || ''
        });
        return;
      }
      filteredSections.push(section);
    });
    plan.sections = filteredSections;
    if (removedSections.length > 0) {
      try {
        logAIEvent('plan.section.filtered', {
          removed: removedSections
        });
      } catch (logError) {
        UnifiedLogger.info('plan.section.filtered logging failed: ' + logError);
      }
    }
  }
  saveCommercialFitState(context.commercialFit.snapshotId, context.commercialFit.entries);
  seedPlanWithLockedSkus(plan, context.commercialFit.entries);
  validatePlanPayload(plan, scopeMap);

  addConfigHealthChecks_(plan);
  addVectorPreflightStatus_(plan, context);
  addXeroPrecheckStatus_(plan);

  const skuAlignmentWarnings = enforceCatalogSkuAlignment(
    plan,
    context.contractEntries || [],
    {
      commercialFitEntries: context.commercialFit.entries
    }
  );
  if (skuAlignmentWarnings.length) {
    try {
      logAIEvent('plan.warning.catalog', {
        warnings: skuAlignmentWarnings
      });
    } catch (catalogLogError) {
      UnifiedLogger.info('plan.warning.catalog logging failed: ' + catalogLogError);
    }
  }
  UnifiedLogger.info('QuoteGen', 'Collecting unresolved items');
  const unresolved = collectUnresolvedItems(plan);
  UnifiedLogger.info('QuoteGen', 'Unresolved items collected', { unresolvedCount: unresolved.length });

  if (unresolved.length > 0) {
    try {
      logAIEvent('plan.warning.unresolved', { unresolved: unresolved });
    } catch (unresolvedLogError) {
      UnifiedLogger.info('plan.warning.unresolved logging failed: ' + unresolvedLogError);
    }
    if (!allowIncomplete) {
      plan.warnings = ensureArray(plan.warnings).concat(unresolved.map(function(entry) {
        return entry.warnings.join('; ');
      }));
    }
  }

  if (isMinorMismatch) {
    plan.warnings = ensureArray(plan.warnings).concat(['Note: Scope content has changed slightly since approval.']);
  }

  UnifiedLogger.info('QuoteGen', '📊 Populating Quote Builder sheet');
  populateQuoteBuilderFromPlan(plan, scopeMap, {});
  UnifiedLogger.info('QuoteGen', 'Quote Builder populated');

  UnifiedLogger.info('QuoteGen', 'Performing quote validation');
  const validation = performQuoteValidation();
  UnifiedLogger.info('QuoteGen', 'Validation complete', {
    errorCount: validation.errors ? validation.errors.length : 0,
    warningCount: validation.warnings ? validation.warnings.length : 0
  });
  const summaryHtml = buildPlanSummaryHtml(plan, validation, {
    vectorHits: context.catalogSignals ? context.catalogSignals.vector : {}
  });

  const timestamp = new Date().toISOString();
  const user = getActiveUserEmailSafe();
  const runId = 'run_' + timestamp.replace(/[-:.TZ]/g, '');
  const runRecord = {
    id: runId,
    label: plan.projectName || plan.clientName || 'Quote Run',
    snapshotId: snapshotId,
    executedAt: timestamp,
    persona: context.persona,
    unresolved: unresolved,
    usage: null,
    validation: {
      errors: validation.errors,
      warnings: validation.warnings
    },
    contractHash: scopeMap.contractHash,
    sections: plan.sections ? plan.sections.length : 0
  };

  persistQuoteRun(user, runRecord);

  if (payload.costConfig) {
    const sanitizedCost = sanitizeCostConfigServer(payload.costConfig);
    if (sanitizedCost) {
      persistCostConfig(user, sanitizedCost);
    }
  }

  const elapsedMs = Date.now() - startTime;
  UnifiedLogger.info('QuoteGen', '✅ Quote generation complete', {
    elapsedMs,
    sections: runRecord.sections,
    unresolvedCount: unresolved.length,
    validationErrors: validation.errors ? validation.errors.length : 0
  });

  try {
    logAIEvent('quote.generate', {
      runType: 'quote',
      outcome: 'success',
      auditMeta: {
        snapshotId: snapshotId,
        contractHash: scopeMap.contractHash,
        unresolvedCount: unresolved.length,
        elapsedMs
      }
    });
  } catch (logError) {
    try { UnifiedLogger.warn('AISidebar', 'quote.generate logging failed', String(logError)); } catch (ignore) {}
  }

    return {
      success: true,
      message: 'Quote populated.',
      summaryHtml: summaryHtml,
      validation: validation,
      quoteRun: runRecord,
      unresolved: unresolved,
      vectorHitMap: context.catalogSignals ? context.catalogSignals.vector : {},
      vectorDiagnostics: context.vectorSearchDiagnostics,
      vectorDiagnosticsEnabled: context.vectorSearchDiagnosticsEnabled
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    UnifiedLogger.error('QuoteGen', '❌ Quote generation failed', {
      error: String(error),
      stack: error.stack || '',
      elapsedMs
    });
    throw error;
  }
  } catch (error) {
    trace.fail('generateQuoteFromApprovedScope failed', error);

    // Phase 5 Task 5.2.2: User-friendly error handling
    showFriendlyError(
      error,
      'Generating Quote from AI',
      {
        correlationId: trace.correlationId,
        retryCallback: function() {
          return generateQuoteFromApprovedScope(request);
        }
      }
    );

    throw error;
  }
}

function syncInventoryFromSidebar() {
  const result = syncInventoryToXero();
  try {
    logAIEvent('quote.sync_inventory', {
      runType: 'quote',
      outcome: 'success',
      auditMeta: {
        summary: result && result.summary ? truncate(result.summary, 200) : ''
      }
    });
  } catch (logError) {
    try { UnifiedLogger.warn('AISidebar', 'quote.sync_inventory logging failed', String(logError)); } catch (ignore) {}
  }
  return {
    success: true,
    message: result && result.summary ? result.summary : 'Inventory sync completed.',
    validation: result && result.validation ? result.validation : null
  };
}

// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function exportQuoteToXeroFromSidebar() {
  const trace = UnifiedLogger.startTrace('AISidebar', 'exportQuoteToXeroFromSidebar');
  try {
    exportToXero();
  return {
    success: true,
    message: 'Xero export initiated. Follow the prompts in the spreadsheet to complete contact selection.'
  };
  } catch (error) {
    trace.fail('exportQuoteToXeroFromSidebar failed', error);
    throw error;
  }
}

/**
 * Retrieve the persisted AI Quote Builder sidebar state for the active user.
 * MIGRATED: Now uses SidebarStateStorage abstraction layer (fast Properties + Sheet)
 * @return {Object}
 */
function getAIQuoteSidebarState() {
  const user = getActiveUserEmailSafe();

  // FAST PATH: Load current state from Properties (instant!)
  let draftState = getSidebarCurrentState(user, 'draft');
  let costConfig = getSidebarCurrentState(user, 'cost_config');

  // Load recent history from Sheet (limited to 25 snapshots, 25 quote runs)
  const snapshotHistory = getSidebarHistory(user, 'snapshot', 25);
  const quoteRunHistory = getSidebarHistory(user, 'quote_run', 25);

  // Transform snapshots
  let activeSnapshotId = null;
  const snapshots = snapshotHistory.map(function(item) {
    const payload = item.data || {};
    payload.id = payload.id || item.id;
    payload.label = payload.label || item.label || payload.id;
    payload.createdAt = payload.createdAt || item.timestamp || new Date().toISOString();
    payload.createdBy = payload.createdBy || user;
    payload.isActive = payload.isActive === true;

    if (payload.isActive) {
      activeSnapshotId = payload.id;
    }

    return payload;
  });

  // Transform quote runs
  const quoteRuns = quoteRunHistory.map(function(item) {
    const payload = item.data || {};
    payload.id = payload.id || item.id;
    if (!payload.createdAt && item.timestamp) {
      payload.createdAt = item.timestamp;
    }
    return payload;
  });

  // Sort snapshots by createdAt DESC
  snapshots.sort(function(a, b) {
    const left = a.createdAt || '';
    const right = b.createdAt || '';
    return right.localeCompare(left);
  });

  // Set active snapshot if none marked
  if (!activeSnapshotId && snapshots.length > 0) {
    snapshots[0].isActive = true;
    activeSnapshotId = snapshots[0].id;
  }

  // Fallback: Use active snapshot's draft if no draft state
  if ((!draftState || !draftState.draft) && snapshots.length > 0) {
    const activeSnapshot = snapshots.find(function(entry) {
      return entry.id === activeSnapshotId;
    }) || snapshots[0];
    if (activeSnapshot && activeSnapshot.draft) {
      draftState = { draft: activeSnapshot.draft };
    }
  }

  // Fallback: Load from backup if still no draft
  if (!draftState) {
    const backupState = loadUserDraftBackup_();
    if (backupState) {
      draftState = backupState;
    }
  }

  const normalizedDraftState = normalizeSidebarDraftState(draftState);
  const scopeEntries = (normalizedDraftState && normalizedDraftState.draft && Array.isArray(normalizedDraftState.draft.scopeEntries))
    ? normalizedDraftState.draft.scopeEntries
    : [];
  try { UnifiedLogger.info('AISidebar', 'getAIQuoteSidebarState', { draftEntries: scopeEntries.length, scopeEntries: scopeEntries.length, briefType: normalizedDraftState.briefType || BRIEF_TYPE_DEFAULT }); } catch (ignore) {}
  const vectorStatus = typeof getVectorStoreSyncStatus === 'function' ? getVectorStoreSyncStatus() : { stale: false };
  const readinessUsage = loadReadinessUsageMetrics_();

  return {
    ok: true,
    costConfig: costConfig || null,
    draftState: normalizedDraftState,
    snapshots: snapshots,
    quoteRuns: quoteRuns,
    activeSnapshotId: activeSnapshotId || null,
    briefType: normalizedDraftState.briefType || BRIEF_TYPE_DEFAULT,
    vectorStoreStatus: vectorStatus,
    configStatus: (typeof getConfigStatus === 'function') ? getConfigStatus() : { source: 'static', enabled: false },
    readinessUsage: readinessUsage
  };
}

/**
 * Persist user-driven sidebar state adjustments (active snapshot, renames, acknowledgements).
 * @param {Object} changes
 * @return {{ok:boolean, mutated:boolean}}
 */
function persistSidebarState(changes) {
  const updates = changes || {};
  if (typeof updates !== 'object') {
    return { ok: false, mutated: false };
  }

  const user = getActiveUserEmailSafe();
  const rows = loadUserSidebarStateRows(user);
  const timestamp = new Date().toISOString();
  let mutated = false;
  let currentBriefType = BRIEF_TYPE_DEFAULT;
  let existingDraftState = null;

  rows.forEach(function(row) {
    if (row.type !== 'draft' && row.type !== 'draftState') {
      return;
    }
    const payload = parseSidebarStatePayload(row.payload);
    if (!payload) {
      return;
    }
    try {
      const normalized = normalizeSidebarDraftState(payload);
      if (normalized) {
        existingDraftState = normalized;
        if (normalized.briefType) {
          currentBriefType = normalized.briefType;
        }
      }
    } catch (ignored) {
      // Empty catch replaced with error logging (Phase 6)
      // UnifiedLogger unavailable during bootstrap
    }
  });

  if (updates.activeSnapshotId) {
    const targetId = String(updates.activeSnapshotId);
    rows.forEach(function(row) {
      if (row.type !== 'snapshot') {
        return;
      }
      const payload = parseSidebarStatePayload(row.payload);
      if (!payload) {
        return;
      }
      const match = row.id === targetId || payload.id === targetId;
      const shouldBeActive = match;
      if (!!payload.isActive !== shouldBeActive) {
        payload.isActive = shouldBeActive;
        upsertUserSidebarStateRow({
          id: row.id,
          user: user,
          type: 'snapshot',
          label: payload.label || row.label || row.id,
          payload: JSON.stringify(payload),
          timestamp: timestamp
        });
        mutated = true;
      }
    });
  }

  if (updates.renameSnapshotId && updates.snapshotLabel) {
    const renameId = String(updates.renameSnapshotId);
    const newLabel = String(updates.snapshotLabel).trim();
    rows.forEach(function(row) {
      if (row.type !== 'snapshot') {
        return;
      }
      const payload = parseSidebarStatePayload(row.payload);
      if (!payload) {
        return;
      }
      const match = row.id === renameId || payload.id === renameId;
      if (match) {
        payload.label = newLabel;
        upsertUserSidebarStateRow({
          id: row.id,
          user: user,
          type: 'snapshot',
          label: newLabel || row.id,
          payload: JSON.stringify(payload),
          timestamp: timestamp
        });
        mutated = true;
      }
    });
  }

  if (updates.clearDraft === true) {
    const emptyState = normalizeSidebarDraftState({
      draft: createEmptyScopeDraft(),
      briefText: '',
      files: [],
      mapperNotes: '',
      commercialNotes: '',
      quoteNotes: '',
      briefType: BRIEF_TYPE_DEFAULT
    });
    upsertUserSidebarStateRow({
      id: user + '_draft',
      user: user,
      type: 'draftState',
      label: 'Active Draft',
      payload: JSON.stringify(emptyState),
      timestamp: timestamp
    });
    mutated = true;
  } else if (
    (updates.draftState && typeof updates.draftState === 'object') ||
    (updates.draft && typeof updates.draft === 'object') ||
    updates.briefText !== undefined ||
    updates.files ||
    updates.fileIds ||
    updates.briefType !== undefined ||
    updates.commercialFitApproved !== undefined ||
    updates.commercialFitSnapshotId !== undefined
  ) {
    const baseDraftState = Object.assign(
      {},
      existingDraftState || {},
      (updates.draftState && typeof updates.draftState === 'object') ? updates.draftState : null
    );
    if (updates.draft && typeof updates.draft === 'object') {
      baseDraftState.draft = updates.draft;
    }
    if (updates.briefType !== undefined) {
      const sanitizedBriefType = String(updates.briefType || '').trim();
      baseDraftState.briefType = sanitizedBriefType || BRIEF_TYPE_DEFAULT;
    }
    if (updates.briefText !== undefined) {
      baseDraftState.briefText = updates.briefText;
    }
    if (updates.files) {
      baseDraftState.files = updates.files;
    }
    if (updates.fileIds) {
      baseDraftState.fileIds = updates.fileIds;
    }
    if (updates.mapperNotes !== undefined) {
      baseDraftState.mapperNotes = updates.mapperNotes;
    }
    if (updates.commercialNotes !== undefined) {
      baseDraftState.commercialNotes = updates.commercialNotes;
    }
    if (updates.quoteNotes !== undefined) {
      baseDraftState.quoteNotes = updates.quoteNotes;
    }
    if (updates.commercialFitSnapshotId !== undefined) {
      baseDraftState.commercialFitSnapshotId = updates.commercialFitSnapshotId === null || updates.commercialFitSnapshotId === undefined
        ? ''
        : String(updates.commercialFitSnapshotId);
    }
    if (updates.commercialFitApproved !== undefined) {
      baseDraftState.commercialFitApproved = updates.commercialFitApproved === true;
    }
    if (!baseDraftState.draft || typeof baseDraftState.draft !== 'object') {
      baseDraftState.draft = createEmptyScopeDraft();
    }
    const normalizedDraftState = normalizeSidebarDraftState(baseDraftState);
    upsertUserSidebarStateRow({
      id: user + '_draft',
      user: user,
      type: 'draftState',
      label: 'Active Draft',
      payload: JSON.stringify(normalizedDraftState),
      timestamp: timestamp
    });
    mutated = true;
  }

  if (updates.acknowledgeRunId) {
    const runId = String(updates.acknowledgeRunId);
    rows.forEach(function(row) {
      if (row.type !== 'quoteRun' && row.type !== 'quote_run') {
        return;
      }
      const payload = parseSidebarStatePayload(row.payload);
      if (!payload) {
        return;
      }
      const match = row.id === runId || payload.id === runId;
      if (match) {
        payload.unresolved = [];
        payload.acknowledgedAt = timestamp;
        upsertUserSidebarStateRow({
          id: row.id,
          user: user,
          type: row.type,
          label: row.label || payload.label || row.id,
          payload: JSON.stringify(payload),
          timestamp: timestamp
        });
        mutated = true;
      }
    });
  }

  if (updates.quoteRun && typeof updates.quoteRun === 'object') {
    persistQuoteRun(user, updates.quoteRun);
    mutated = true;
  }

  if (updates.briefType !== undefined) {
    const sanitizedBriefType = String(updates.briefType || '').trim() || BRIEF_TYPE_DEFAULT;
    if (sanitizedBriefType !== currentBriefType) {
      try {
        logAIEvent('brief.type.selected', {
          briefType: sanitizedBriefType
        });
      } catch (logError) {
        UnifiedLogger.info('brief.type.selected logging failed: ' + logError);
      }
    }
  }

  if (updates.costConfig && typeof updates.costConfig === 'object') {
    const sanitized = sanitizeCostConfigServer(updates.costConfig);
    if (sanitized) {
      persistCostConfig(user, sanitized);
      mutated = true;
    }
  }

  return { ok: true, mutated: mutated };
}
/**
 * Persist an approved scope snapshot for contract and audit sidebars.
 * @param {Object} options
 * @return {{ok:boolean, snapshot:Object}}
 */
function recordScopeApproval(options) {
  const payload = options || {};
  const baseScope = payload.approvedScope;
  if (!baseScope || typeof baseScope !== 'object') {
    throw new AppError('SCOPE_APPROVAL', 'Approved scope payload is required before recording.');
  }
  if (!Array.isArray(baseScope.scopeEntries) || baseScope.scopeEntries.length === 0) {
    throw new AppError('SCOPE_APPROVAL', 'Approved scope does not contain any scope entries.');
  }

  const user = getActiveUserEmailSafe();
  const timestamp = new Date().toISOString();
  const snapshotId = String(payload.snapshotId || ('snap_' + timestamp.replace(/[-:.TZ]/g, '')));
  const rawLabel = payload.snapshotLabel || baseScope.projectName || baseScope.clientName || '';
  const snapshotLabel = rawLabel && rawLabel.trim().length > 0 ? rawLabel.trim() : snapshotId;
  const pendingKeys = Array.isArray(payload.pendingCritical)
    ? filterNullish(payload.pendingCritical).filter(function(entry) { return String(entry).trim().length > 0; })
    : [];
  const limitFiles = Array.isArray(payload.fileIds) ? payload.fileIds.slice(0, AI_MAX_PDF_FILES) : [];

  const approvedScope = JSON.parse(JSON.stringify(baseScope));
  if (payload.rawRequiredAnswers && typeof payload.rawRequiredAnswers === 'object') {
    approvedScope.rawRequiredAnswers = Object.assign({}, payload.rawRequiredAnswers);
  }
  approvedScope.requiredAnswers = approvedScope.requiredAnswers || {};

  const hydration = hydrateScopeContracts(approvedScope, payload.briefText || '');
  const contract = hydration.contract;
  const storedDraft = hydration.draft;

  // Attempt to reconcile with previous commercial fit state if available
  let preserveCommercialFit = false;
  if (payload.previousSnapshotId) {
    const reconciliation = reconcileScopeContractHash_(approvedScope, contract, payload.previousContractHash);
    if (reconciliation) {
      preserveCommercialFit = true;
    }
  }
  storedDraft.requiredAnswers = storedDraft.requiredAnswers || {};
  storedDraft.rawRequiredAnswers = storedDraft.rawRequiredAnswers || approvedScope.rawRequiredAnswers || {};
  storedDraft.snapshotId = snapshotId;
  storedDraft.snapshotLabel = snapshotLabel;
  if (!storedDraft.scopeContracts || typeof storedDraft.scopeContracts !== 'object') {
    storedDraft.scopeContracts = {};
  }
  if (!storedDraft.scopeContracts.snapshotId) {
    storedDraft.scopeContracts.snapshotId = snapshotId;
  }
  if (!storedDraft.scopeContracts.snapshotLabel) {
    storedDraft.scopeContracts.snapshotLabel = snapshotLabel;
  }

  const snapshot = {
    id: snapshotId,
    label: snapshotLabel,
    createdAt: timestamp,
    createdBy: user,
    isActive: true,
    briefText: payload.briefText ? truncate(String(payload.briefText), 4000) : '',
    fileIds: limitFiles,
    pendingKeys: pendingKeys,
    pendingCount: pendingKeys.length,
    draft: storedDraft,
    requiredAnswers: storedDraft.requiredAnswers,
    rawRequiredAnswers: storedDraft.rawRequiredAnswers,
    contractVersion: contract.version,
    contractHash: contract.contractHash,
    scopeHierarchy: contract.hierarchy || {},
    scopeEntries: contract.entries
  };

  const existingRows = loadUserSidebarStateRows(user);
  existingRows.forEach(function(row) {
    if (row.type !== 'snapshot') {
      return;
    }
    const parsed = parseSidebarStatePayload(row.payload);
    if (!parsed) {
      return;
    }
    if (parsed.isActive) {
      parsed.isActive = false;
      upsertUserSidebarStateRow({
        id: row.id,
        user: user,
        type: 'snapshot',
        label: parsed.label || row.label || row.id,
        payload: JSON.stringify(parsed),
        timestamp: timestamp
      });
    }
  });

  upsertUserSidebarStateRow({
    id: snapshot.id,
    user: user,
    type: 'snapshot',
    label: snapshot.label,
    payload: JSON.stringify(snapshot),
    timestamp: timestamp
  });

  upsertUserSidebarStateRow({
    id: user + '_draft',
    user: user,
    type: 'draftState',
    label: 'Active Draft',
    payload: JSON.stringify({ draft: storedDraft }),
    timestamp: timestamp
  });

  // If preservation is valid, we don't clear the commercial fit state in the return payload,
  // allowing the frontend to refresh instead of reset.
  const commercialFitAction = preserveCommercialFit ? 'preserved' : 'reset';

  appendScopeAuditLog('scope.approval', {
    snapshotId: snapshot.id,
    scopeContract: contract.contractHash,
    scopeEntries: Array.isArray(contract.entries) ? contract.entries.length : 0,
    pendingCount: snapshot.pendingCount
  });

  logAIEvent('scope.approval', {
    snapshotId: snapshot.id,
    runType: 'scope',
    outcome: snapshot.pendingCount > 0 ? 'approved_with_pending' : 'approved',
    contractHash: contract.contractHash,
    pendingCount: snapshot.pendingCount,
    fileCount: snapshot.fileIds.length
    ,
    commercialFitAction: commercialFitAction
  });

  return { ok: true, snapshot: snapshot, commercialFitPreserved: preserveCommercialFit };
}

/**
 * Record client-side console messages for troubleshooting.
 * @param {(string|Object)} message
 * @return {{ok:boolean}}
 */
function logClientMessage(message) {
  const payload = typeof message === 'object' && message !== null ? Object.assign({}, message) : { message: String(message || '') };
  payload.timestamp = new Date().toISOString();
  payload.user = getActiveUserEmailSafe();
  logAIEvent('client.log', payload);
  return { ok: true };
}

function getScopeContractOverview() {
  try {
    const user = getActiveUserEmailSafe();
    const rows = loadUserSidebarStateRows(user);
    const snapshots = filterTruthy(rows
      .filter(row => row && row.type === 'snapshot' && row.payload)
      .map(row => {
        const parsed = typeof parseSidebarStatePayload === 'function'
          ? parseSidebarStatePayload(row.payload)
          : null;
        if (parsed) {
          parsed.__rowTimestamp = row.timestamp;
          return parsed;
        }
        try {
          UnifiedLogger.warn('AISidebar', 'getScopeContractOverview: invalid snapshot payload', {
            rowId: row.id,
            payloadLength: row.payload ? String(row.payload).length : 0
          });
        } catch (ignore) {
          // UnifiedLogger unavailable during bootstrap
        }
        return null;
      }));

    if (snapshots.length === 0) {
      return { ok: false, message: 'No approved scope snapshot found for this user. Approve a scope via the AI Quote Builder first.' };
    }

    let activeSnapshot = snapshots.find(snap => snap && snap.isActive);
    if (!activeSnapshot) {
      activeSnapshot = snapshots.reduce((latest, current) => {
        if (!latest) return current;
        if (!current) return latest;
        const latestTime = latest.createdAt || latest.__rowTimestamp || '';
        const currentTime = current.createdAt || current.__rowTimestamp || '';
        return currentTime > latestTime ? current : latest;
      }, null);
    }

    if (!activeSnapshot) {
      return { ok: false, message: 'No usable scope snapshot found. Approve a scope via the AI Quote Builder.' };
    }

    const hydration = hydrateScopeContracts(activeSnapshot.draft || activeSnapshot, null);
    const auditTrail = getRecentScopeAuditLog(25);

    return {
      ok: true,
      snapshot: activeSnapshot,
      contract: hydration.contract,
      audit: auditTrail
    };
  } catch (error) {
    UnifiedLogger.info('getScopeContractOverview error: ' + error);
    return { ok: false, message: error && error.message ? error.message : String(error) };
  }
}

function getRecentScopeAuditLog(limit) {
  try {
    const sheet = ensureAILogSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return [];
    }
    const maxRows = Math.min(limit || 25, lastRow - 1);
    const startRow = lastRow - maxRows + 1;
    const range = sheet.getRange(startRow, 1, maxRows, sheet.getLastColumn());
    const values = range.getValues().reverse();
    return values
      .filter(row => row && row[2] && String(row[2]).indexOf('scope.') === 0)
      .map(row => {
        const payloadText = row[5];
        let summary = row[10] || '';
        if (!summary && payloadText) {
          try {
            const payload = JSON.parse(payloadText);
            if (payload && payload.message) {
              summary = payload.message;
            } else if (payload && payload.scopeContract) {
              summary = 'Contract hash ' + payload.scopeContract;
            }
          } catch (error) {
            summary = '';
          }
        }
        if (!summary && row[9]) {
          summary = row[9];
        }
        if (!summary && row[6]) {
          summary = row[6];
        }
        if (!summary && row[8]) {
          summary = 'Visibility ' + row[8];
        }
        return {
          timestamp: row[0] ? new Date(row[0]).toLocaleString() : '',
          user: row[1] || '',
          event: row[2] || '',
          summary: summary || ''
        };
      });
  } catch (error) {
    UnifiedLogger.info('getRecentScopeAuditLog error: ' + error);
    return [];
  }
}

function escapeJsonStringNewlines(text) {
  if (!text) {
    return text;
  }
  let result = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString && (ch === '\n' || ch === '\r')) {
      result += '\\n';
      if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        i += 1;
      }
      continue;
    }
    result += ch;
  }
  return result;
}

function removeEllipsisPlaceholders(text) {
  if (!text) {
    return text;
  }
  let result = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (!inString) {
      if (ch === '.' && text[i + 1] === '.' && text[i + 2] === '.') {
        while (i < text.length && text[i] === '.') {
          i += 1;
        }
        i -= 1;
        continue;
      }
      if (ch === '\u2026') {
        continue;
      }
    }
    result += ch;
  }
  return result;
}

function stripTrailingCommas(text) {
  if (!text) {
    return text;
  }
  let result = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (ch === ',' && !inString) {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        j += 1;
      }
      if (j < text.length && (text[j] === '}' || text[j] === ']')) {
        i = j - 1;
        continue;
      }
    }
    result += ch;
  }
      return result;
    }

function quoteBarePropertyNames(text) {
  if (!text) {
    return text;
  }
  const pattern = /([\{\[,]\s*)([A-Za-z0-9_\-\.]+(?:\s+[A-Za-z0-9_\-\.]+)*)(\s*:)/g;
  return text.replace(pattern, function(match, prefix, key, suffix) {
    if (!key) {
      return prefix + suffix;
    }
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return prefix + suffix;
    }
    if (trimmedKey.startsWith('"') && trimmedKey.endsWith('"')) {
      return prefix + trimmedKey + suffix;
    }
    return prefix + '"' + trimmedKey.replace(/"/g, '\\"') + '"' + suffix;
  });
}

function insertMissingPropertyCommas(text) {
  if (!text) {
    return text;
  }
  const chars = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    if (ch === '"' && prevChar !== '\\') {
      if (!inString) {
        if (shouldInsertCommaBeforeProperty(text, i)) {
          const lastNonWhitespace = findLastNonWhitespace(chars);
          if (lastNonWhitespace !== '{' && lastNonWhitespace !== '[' && lastNonWhitespace !== ',' && lastNonWhitespace !== '') {
            if (chars.length > 0 && chars[chars.length - 1] !== ',') {
              chars.push(',');
            }
          }
        }
        inString = true;
      } else {
        inString = false;
      }
    }
    chars.push(ch);
  }
  return chars.join('');
}

function findLastNonWhitespace(buffer) {
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (!/\s/.test(buffer[i])) {
      return buffer[i];
    }
  }
  return '';
}

function shouldInsertCommaBeforeProperty(text, index) {
  let inLocalString = false;
  let colonFound = false;
  for (let i = index + 1; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inLocalString = !inLocalString;
      continue;
    }
    if (inLocalString) {
      continue;
    }
    if (ch === ':') {
      colonFound = true;
      break;
    }
    if (!/\s/.test(ch)) {
      if (ch === '{' || ch === '[' || ch === ',') {
        return false;
      }
      if (ch === '}') {
        return false;
      }
    }
  }
  if (!colonFound) {
    return false;
  }
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      continue;
    }
    return !(ch === '{' || ch === '[' || ch === ',' || ch === ':');
  }
  return false;
}

function balanceJsonStructure(text) {
  if (!text) {
    return text;
  }
  const stack = [];
  let inString = false;
  let prev = '';
  let balanced = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    balanced += ch;
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === '}' || ch === ']') {
        if (stack.length > 0) {
          const top = stack[stack.length - 1];
          if ((top === '{' && ch === '}') || (top === '[' && ch === ']')) {
            stack.pop();
          } else {
            stack.pop();
          }
        }
      }
    }
    prev = ch;
  }
  if (inString) {
    balanced += '"';
  }
  while (stack.length > 0) {
    const open = stack.pop();
    balanced += open === '{' ? '}' : ']';
  }
  return balanced;
}

function quoteUnquotedKeys(jsonLike) {
  if (!jsonLike) {
    return '';
  }
  let previous = null;
  let output = jsonLike;
  const keyPatterns = [
    /([{,]\s*)([A-Za-z0-9_\-\.]+(?:\s+[A-Za-z0-9_\-\.]+)*)\s*:/g,
    /([{,]\s*)'([^']+)'\s*:/g
  ];
  const singleQuotedValuePattern = /:\s*'((?:\\'|[^'])*)'/g;
  const booleanPattern = /:\s*(True|False)\b/g;
  const nullPattern = /:\s*(Null)\b/g;

  while (output !== previous) {
    previous = output;
    keyPatterns.forEach(function(pattern) {
      output = output.replace(pattern, function(match, prefix, key) {
        if (!prefix) {
          prefix = '';
        }
        const cleanKey = String(key).replace(/"/g, '\\"');
        return prefix + '"' + cleanKey + '":';
      });
    });
    output = output.replace(singleQuotedValuePattern, function(match, value) {
      const unescaped = String(value).replace(/\\'/g, '\'');
      const escaped = unescaped.replace(/"/g, '\\"');
      return ': "' + escaped + '"';
    });
    output = output.replace(booleanPattern, function(match, value) {
      return ': ' + value.toLowerCase();
    });
    output = output.replace(nullPattern, function(match) {
      return ': null';
    });
  }
  let cleaned = '';
  let inString = false;
  for (let i = 0; i < output.length; i++) {
    const ch = output[i];
    const prev = i > 0 ? output[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
    }
    if (ch === '…' && !inString) {
      continue;
    }
    cleaned += ch;
  }
  return cleaned;
}

// DELETED: Duplicate escapeHtml - using canonical version from 00_StringUtils.js

function captureExistingSheetEdits_(sheet) {
  if (!sheet || sheet.getLastRow() < 4) return {};
  try {
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(4, 1, lastRow - 3, sheet.getLastColumn()).getValues();
    const edits = {};
    const ID_COL = QB_COLS.SCOPE_ENTRY_ID;
    const NOTES_COL = QB_COLS.NOTES;
    const MARKUP_COL = QB_COLS.MARKUP_PCT;
    data.forEach(function(row) {
      const id = row[ID_COL];
      if (!id) return;
      edits[id] = {
        notes: row[NOTES_COL],
        markup: row[MARKUP_COL]
      };
    });
    return edits;
  } catch (e) {
    UnifiedLogger.info('captureExistingSheetEdits_ error: ' + e);
    return {};
  }
}

function reapplyUserEditsToStaging_(sheet, edits) {
  if (!edits || Object.keys(edits).length === 0) return;
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 4) return;
    const ids = sheet.getRange(4, QB_COLS.SCOPE_ENTRY_ID + 1, lastRow - 3, 1).getValues();
    const currentNotes = sheet.getRange(4, QB_COLS.NOTES + 1, lastRow - 3, 1).getValues();
    const updates = [];
    ids.forEach(function(rowId, idx) {
      const id = rowId[0];
      if (!id || !edits[id]) return;
      const saved = edits[id];
      const rowIndex = 4 + idx;
      if (saved.notes) {
        const planNote = String(currentNotes[idx][0] || '');
        const savedNote = String(saved.notes);
        let newNote = planNote;
        if (planNote !== savedNote) {
          if (planNote && !planNote.includes(savedNote)) {
            newNote = planNote + '\n' + savedNote;
          } else if (!planNote) {
            newNote = savedNote;
          }
        }
        if (newNote !== planNote) {
          updates.push({ row: rowIndex, col: QB_COLS.NOTES + 1, value: newNote });
        }
      }
      if (saved.markup !== '' && saved.markup !== null && saved.markup !== undefined) {
        updates.push({ row: rowIndex, col: QB_COLS.MARKUP_PCT + 1, value: saved.markup });
      }
    });
    if (updates.length > 0) {
      QuoteUtils.batchUpdateCells(sheet, updates);
    }
  } catch (e) {
    UnifiedLogger.info('reapplyUserEditsToStaging_ error: ' + e);
  }
}

function syncCommercialFitFromSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.QUOTE_BUILDER);
    if (!sheet) return { ok: false, error: 'Quote_Builder sheet not found.' };
    validateSheetHeaders_(sheet, QB_HEADER_MAP, QB_COLS);

    if (typeof isQuoteBuilderSchemaTrusted_ === 'function' && !isQuoteBuilderSchemaTrusted_()) {
      return { ok: false, error: 'Quote_Builder schema untrusted; skipping sync.' };
    }

    const lastRow = sheet.getLastRow(), lastColumn = sheet.getLastColumn();
    const rowCount = Math.max(0, lastRow - 2);
    const data = rowCount > 0 ? sheet.getRange(3, 1, rowCount, lastColumn).getValues() : [];
    if (data.length === 0) return { ok: true, message: 'Sheet empty, nothing to sync.' };

    const edits = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const type = row[QB_COLS.TYPE];
      const id = row[QB_COLS.SCOPE_ENTRY_ID];
      if (type === ROW_TYPES.LINE && id) {
        const qty = row[QB_COLS.QTY];
        const unit = row[QB_COLS.UNIT];
        const rate = row[QB_COLS.UNIT_RATE];
        const update = {};
        if (qty !== '' && qty !== null && !isNaN(Number(qty))) update.qty = Number(qty);
        if (unit !== '' && unit !== null) update.unit = String(unit);
        if (rate !== '' && rate !== null && !isNaN(Number(rate))) update.unitRate = Number(rate);
        if (Object.keys(update).length > 0) edits.push({ scopeEntryId: String(id), updates: update });
      }
    }
    return edits.length ? applyCommercialFitEdits(edits) : { ok: true, message: 'No syncable lines found.' };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

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
// Main Entry Point
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
  }}
// Helper Functions
/**
 * Validate commercial fit row and get column index for a specific field
 * @param {string} scopeEntryId - The scope entry ID to look up
 * @param {string} columnName - The column name to find (e.g., 'SelectedSkusJSON', 'VectorCandidatesJSON')
 * @returns {{ok: boolean, error?: string, rowInfo?: Object, columnIdx?: number}}
 */
function validateCommercialFitRow(scopeEntryId, columnName) {
  const rowInfo = locateCommercialFitRow(scopeEntryId);
  if (!rowInfo) {
    return { ok: false, error: 'ENTRY_NOT_FOUND' };
  }
  const columnIdx = rowInfo.headers.indexOf(columnName);
  if (columnIdx === -1) {
    return { ok: false, error: columnName.replace('JSON', '_COLUMN_MISSING').toUpperCase() };
  }
  return { ok: true, rowInfo: rowInfo, columnIdx: columnIdx };
}
/**
 * Validate sheet and get dimensions
 * @param {Object} sheetResult - Result from getCommercialFitStateSheet
 * @returns {{ok: boolean, error?: string, sheet?: Object, dims?: Object}}
 */
function validateSheetDimensions(sheetResult) {
  if (sheetResult.error) {
    return { ok: false, error: sheetResult.error };
  }
  const sheet = sheetResult.sheet;
  const dims = validateSheetAndGetDimensions(sheet);
  if (!dims.valid) {
    return { ok: false, error: 'STATE_EMPTY' };
  }
  return { ok: true, sheet: sheet, dims: dims };
}
/**
 * Parse sidebar state payload from row
 * @param {Object} row - Row object with type and payload
 * @param {string|Array} expectedTypes - Expected type(s)
 * @returns {Object|null} - Parsed payload or null
 */
function parseRowPayload(row, expectedTypes) {
  if (!row) return null;
  if (expectedTypes) {
    const types = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
    if (!types.includes(row.type)) return null;
  }
  const payload = parseSidebarStatePayload(row.payload);
  return payload || null;
}
/**
 * Process string with quote tracking for JSON operations
 * Common pattern for escapeJsonStringNewlines, removeEllipsisPlaceholders, stripTrailingCommas
 * @param {string} text - Input text
 * @param {Function} processor - Function to process characters (ch, i, inString, text) => result
 * @returns {string} - Processed text
 */
function processJsonString(text, processor) {
  if (!text) return text;
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
    const processed = processor(ch, i, inString, text);
    if (processed && typeof processed === 'object' && processed.skipChars) {
      result += processed.value || '';
      i += processed.skipChars;
    } else if (processed !== undefined) {
      result += processed;
    }
  }
  return result;
}
// Timeline and State Management
/**
 * Push a structured step entry into a run timeline array.
 * @param {Array<Object>} timeline
 * @param {string} step
 * @param {string} status
 * @param {Object} [meta]
 */
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
    }}
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
    }}
  if (needsRewrite) {
    headerRange.setValues([headers]);
  }}
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
/**
 * Validate sheet schema and get dimensions
 * Consolidates pattern that appears 10+ times
 */
function validateSheetAndGetDimensions(sheet) {
  const { lastRow, lastColumn } = validateSheetAndGetDimensions(sheet);
  return { lastRow, lastColumn, valid: lastRow > 1 && lastColumn > 0 };
}
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
    }} catch (error) {
    trace.fail('Commercial fit state save failed', error);
    try { UnifiedLogger.warn('AISidebar', 'saveCommercialFitState failed', String(error)); } catch (ignore) {}}}
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
    }} catch (error) {
    UnifiedLogger.info('writeCommercialFitConsoleSheet failed: ' + error);
  }}
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
  }}
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
try {
  if (typeof globalThis !== 'undefined') {
  }} catch (ignored) {
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
  }}
/**
 * Build the scope-draft prompt for the LLM.
 * @param {Object} context
 * @param {string=} overrideUserContent
 * @return {Array<Object>}
 */
/**
 * Build the commercial plan prompt for the LLM.
 * @param {Object} context
 * @param {string=} overrideUserContent
 * @return {Array<Object>}
 */
/**
 * Provide Drive Picker credentials for the sidebar.
 * @return {{token: string, developerKey: (string|null)}}
 */
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
/**
 * Ensure the AI plan respects the approved scope, adding warnings or throwing if mismatched.
 * @param {Object} plan
 * @param {Object} approvedScope
 */
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
    }} catch (error) {
    UnifiedLogger.info('getActiveUserEmailSafe: ' + error);
  }
  try {
    const props = PropertiesService.getUserProperties();
    const fallback = props ? props.getProperty('DEFAULT_USER_EMAIL') : '';
    if (fallback) {
      return fallback;
    }} catch (propError) {
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
    }}
  const lastBrace = payloadText.lastIndexOf('}');
  const lastBracket = payloadText.lastIndexOf(']');
  const cutoff = Math.max(lastBrace, lastBracket);
  if (cutoff > 0) {
    const candidate = payloadText.substring(0, cutoff + 1).trimEnd();
    const parsedCandidate = tryParse(candidate);
    if (parsedCandidate) {
      return parsedCandidate;
    }}
  const positionMatch = /position (\d+)/.exec(lastError);
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    if (!Number.isNaN(position) && position > 0 && position < payloadText.length) {
      const truncated = payloadText.substring(0, position).trimEnd();
      const parsedTruncated = tryParse(truncated);
      if (parsedTruncated) {
        return parsedTruncated;
      }
    }}
  const firstObject = payloadText.indexOf('{');
  const firstArray = payloadText.indexOf('[');
  const start = Math.min(firstObject === -1 ? payloadText.length : firstObject, firstArray === -1 ? payloadText.length : firstArray);
  if (start > 0 && start < payloadText.length) {
    const fromStart = payloadText.substring(start).trim();
    const parsedFromStart = tryParse(fromStart);
    if (parsedFromStart) {
      return parsedFromStart;
    }}
  if (lastError) {
    UnifiedLogger.info('parseSidebarStatePayload failed: ' + lastError);
  }
  return null;
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
  }}
/**
 * Ensure the AI log sheet exists.
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
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
    }}
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
    }}
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
    }}
  sheet.appendRow(buildSidebarStateRowValues(entry));
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
    }} catch (e) {
    UnifiedLogger.info('saveUserDraftBackup_: ' + e);
  }}
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
  }}
/**
 * Determine the minimum required columns based on QB_COLS definition.
 * @return {number}
 */
var quoteBuilderColumnCountCache_ = undefined;
/**
 * Ensure the builder sheet has enough columns for all tracked fields.
 * @param {Sheet} sheet
 */
/**
 * Log any item codes in the given range that are not recognized by the catalog.
 * @param {Range} range Column range for item codes
 * @param {string} context Description for log output
 */
/**
 * Retrieve the persisted AI Quote Builder sidebar state for the active user.
 * MIGRATED: Now uses SidebarStateStorage abstraction layer (fast Properties + Sheet)
 * @return {Object}
 */
function getAIQuoteSidebarState() {
  const user = getActiveUserEmailSafe();
  // FAST PATH: Load current state from Properties (instant!)
  let draftState = unwrapSidebarStateData_(getSidebarCurrentState(user, 'draft'));
  let costConfig = unwrapSidebarStateData_(getSidebarCurrentState(user, 'cost_config'));
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
    }}
  // Fallback: Load from backup if still no draft
  if (!draftState) {
    const backupState = loadUserDraftBackup_();
    if (backupState) {
      draftState = backupState;
    }}
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
/**
 * Persist an approved scope snapshot for contract and audit sidebars.
 * @param {Object} options
 * @return {{ok:boolean, snapshot:Object}}
 */
/**
 * Record client-side console messages for troubleshooting.
 * @param {(string|Object)} message
 * @return {{ok:boolean}}
 */

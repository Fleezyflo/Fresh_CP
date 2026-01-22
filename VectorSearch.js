/**
 * hrmny Quote Builder - Vector Store Search Helpers
 *
 * Provides thin wrappers around the OpenAI vector store search endpoint so
 * scope entries can retrieve relevant catalog payloads prior to LLM usage.
 * Depends on the helper functions defined in ScopeVectorStoreSync.js for
 * credential resolution and header construction.
 *
 * Note: RateLimiter.js functions (enforceRateLimit, SERVICE_OPENAI_VECTOR) are available globally
 */

const VECTOR_SEARCH_LOG_CATEGORY = 'VectorSearch';

/** @const {number} maximum search results to request per entry. */
const VECTOR_SEARCH_MAX_RESULTS = 10;

/** @const {number} default score floor applied to vector search hits. */
// Pattern from App-script/VectorSearch.js:18 (lowered from 0.5 to 0.35 to include more semantically relevant matches)
const VECTOR_SEARCH_SCORE_FLOOR = 0.35;

/**
 * Execute a direct vector search against the configured OpenAI vector store.
 * @param {string} query free-form text describing the desired scope
 * @param {{limit?:number,minScore?:number,filter?:Object,cursor?:string}=} options
 * @return {{hits:Array<Object>, raw:Object}} normalized hits plus raw payload
 */
function searchVectorStoreScopes_(query, options) {
  options = options || {};
  if (!query || !String(query).trim()) {
    throw new AppError('VECTOR_QUERY_MISSING', 'Vector search query is required.');
  }

  if (typeof ensureVectorIntegrationReady_ === 'function') {
    ensureVectorIntegrationReady_({ operation: 'search', allowNetworkProbe: true });
  }

  const apiKey = getOpenAiApiKey_();
  if (!apiKey) {
    throw new AppError('OPENAI_CONFIG', 'OpenAI API key missing for vector search.');
  }

  const vectorStoreId = resolveVectorStoreId_();
  if (!vectorStoreId) {
    throw new AppError('OPENAI_CONFIG', 'Vector store id missing for vector search.');
  }

  const limit = options.limit && options.limit > 0
    ? Math.min(Number(options.limit), VECTOR_SEARCH_MAX_RESULTS)
    : VECTOR_SEARCH_MAX_RESULTS;
  let minScore = options.minScore !== undefined && options.minScore !== null
    ? Number(options.minScore)
    : VECTOR_SEARCH_SCORE_FLOOR;
  if (isNaN(minScore) || minScore <= 0) {
    minScore = VECTOR_SEARCH_SCORE_FLOOR;
  }

  const payload = {
    query: String(query),
    max_num_results: limit
  };
  if (options.filter) {
    payload.filters = options.filter;
  }
  if (options.cursor) {
    payload.after = options.cursor;
  }
  if (minScore && minScore > 0) {
    payload.ranking_options = {
      score_threshold: minScore
    };
  }

  try {
    UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'searchVectorStoreScopes_', {
      query: query,
      limit: limit,
      minScore: minScore,
      filter: options.filter || null
    });
  } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }

  const headers = buildOpenAiHeaders_(apiKey);
  headers['Content-Type'] = 'application/json';

  const url = 'https://api.openai.com/v1/vector_stores/' + vectorStoreId + '/search';

  // Rate limit enforcement for OpenAI vector search API
  enforceRateLimit(SERVICE_OPENAI_VECTOR);

  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: headers,
      muteHttpExceptions: true,
      payload: JSON.stringify(payload),
      contentType: 'application/json'
    });
  } catch (fetchError) {
    try { recordVectorSearchFailure({ reason: fetchError && fetchError.message ? fetchError.message : 'fetch-error' }); } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
    throw fetchError;
  }

  const status = response.getResponseCode();
  const bodyText = response.getContentText() || '';
  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (parseError) {
    body = {};
  }

  if (status >= 300) {
    const snippet = truncateForVectorLog_(bodyText, 400);
    try { recordVectorSearchFailure({ reason: 'status-' + status }); } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
    const failure = new AppError('VECTOR_SEARCH_FAILED', 'Vector search returned ' + status + ': ' + snippet);
    failure.statusCode = status;
    throw failure;
  }

  try { recordVectorSearchSuccess({ status: status, operation: 'search' }); } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }

  try {
    UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'searchVectorStoreScopes_ result', {
      status: status,
      hitCount: (body && Array.isArray(body.data)) ? body.data.length : 0,
      query: query
    });
  } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }

  // Catalog prefix filtering from App-script/VectorSearch.js:691
  let catalogPrefixes = Array.isArray(options.catalogPrefixes) ? options.catalogPrefixes : [];
  return {
    hits: normalizeVectorStoreSearchResponse_(body, minScore, query, catalogPrefixes),
    raw: body
  };
}

/**
 * Debug helper to fetch the raw vector store response for a query.
 * @param {string} query
 * @param {{limit?:number,minScore?:number,filter?:Object,cursor?:string}=} options
 * @return {{query:string,hits:Array<Object>,raw:Object}} raw payload plus normalized hits
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function fetchVectorStoreRawResponse_(query, options) {
  const trace = UnifiedLogger.startTrace('VectorSearch', 'fetchVectorStoreRawResponse_', {
    hasQuery: !!query
  });

  try {
    if (typeof ensureVectorIntegrationReady_ === 'function') {
      ensureVectorIntegrationReady_({ operation: 'search', allowNetworkProbe: true });
    }
    let searchResult = searchVectorStoreScopes_(query, options);
    const result = {
      query: String(query || ''),
      hits: searchResult.hits || [],
      raw: searchResult.raw || {}
    };

    trace.complete('Vector store search complete', {
      hitCount: result.hits.length,
      query: result.query
    });

    return result;

  } catch (error) {
    trace.fail('Vector store search failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'searching vector store',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    // Return empty result
    return {
      query: String(query || ''),
      hits: [],
      raw: {}
    };
  }
}

/**
 * Normalize response records from the vector store search endpoint.
 * @param {Object} payload
 * @param {number} minScore
 * @param {string=} query
 * @return {Array<Object>}
 */
// Pattern from App-script/VectorSearch.js:207 (validate SKUs against catalog)
function normalizeVectorStoreSearchResponse_(payload, minScore, query, catalogPrefixes) {
  const data = payload && Array.isArray(payload.data) ? payload.data : [];
  if (!data.length) {
    return [];
  }
  // Catalog prefix filtering from App-script/VectorSearch.js:691
  catalogPrefixes = Array.isArray(catalogPrefixes) ? catalogPrefixes : [];

  // Load scope catalog to validate SKUs exist
  let catalogResult = null;
  let catalogMap = {};
  if (typeof loadScopeCatalog === 'function') {
    try {
      catalogResult = loadScopeCatalog();
      // Handle V2 ConfigLoadResult wrapper
      const catalogData = (catalogResult && catalogResult.data) ? catalogResult.data : catalogResult;
      if (catalogData && typeof catalogData === 'object') {
        catalogMap = catalogData;
      }
    } catch (catError) {
      // Silent fail - continue without validation if catalog unavailable
    }
  }
  const hasCatalog = Object.keys(catalogMap).length > 0;

  const normalized = [];
  let skippedInvalidSKUs = 0;

  for (let i = 0; i < data.length; i++) {
    const record = data[i] || {};
  const attributes = record.attributes || record.metadata || {};
  const scopeEntryId = firstNonEmpty_(attributes.scope_entry_id, attributes.scopeEntryId);
  let scopeCode = scopeEntryId || extractScopeCodeFromRecord_(record, attributes);
  let scopeName = attributes.scope_name || attributes.scopeName || '';
  if (!scopeName && record.file && record.file.display_name) {
    scopeName = record.file.display_name;
  }
    const score = record.score !== undefined && record.score !== null ? Number(record.score) : null;
    if (score !== null && !isNaN(score) && minScore && score < minScore) {
      continue;
    }

    // Validate SKU exists in catalog before including in results
    if (hasCatalog && scopeCode) {
      let skuExists = false;
      // Check if SKU exists in any brief type
      for (let briefType in catalogMap) {
        if (catalogMap.hasOwnProperty(briefType)) {
          const briefCatalog = catalogMap[briefType];
          if (Array.isArray(briefCatalog)) {
            for (let j = 0; j < briefCatalog.length; j++) {
              const catalogEntry = briefCatalog[j];
              if (catalogEntry && catalogEntry.scopeId === scopeCode) {
                skuExists = true;
                break;
              }
            }
          }
          if (skuExists) break;
        }
      }

      // Skip this hit if SKU doesn't exist in catalog
      if (!skuExists) {
        skippedInvalidSKUs++;
        try {
          UnifiedLogger.warn(VECTOR_SEARCH_LOG_CATEGORY, 'Skipped vector hit with invalid SKU', {
            sku: scopeCode,
            score: score,
            reason: 'SKU not found in loaded catalog'
          });
        } catch (logError) {
          // Fallback if logger fails
          console.error('VectorSearch logging failed:', String(logError));
        }
        continue;
      }
    }

    // Catalog prefix filtering DISABLED (was filtering out valid results)
    // REASON: Vector search should return all relevant results, not filter by SKU prefix
    // if (catalogPrefixes.length > 0 && scopeCode) {
    //   var matchesPrefix = catalogPrefixes.some(function(prefix) {
    //     return scopeCode.startsWith(prefix);
    //   });
    //   if (!matchesPrefix) {
    //     try {
    //       UnifiedLogger.debug(VECTOR_SEARCH_LOG_CATEGORY, 'Skipped vector hit - SKU prefix not in brief catalog', {
    //         sku: scopeCode,
    //         score: score,
    //         allowedPrefixes: catalogPrefixes.join(', ')
    //       });
    //     } catch (logError) {
    //       // Fallback if logger fails
    //       console.error('VectorSearch logging failed:', String(logError));
    //     }
    //     continue;
    //   }
    // }

    normalized.push({
      fileId: record.file_id || (record.file && record.file.id) || '',
      vectorStoreId: record.vector_store_id || '',
      score: score,
      scopeCode: scopeCode,
      scopeEntryId: scopeEntryId || '',
      sku: scopeCode,
      scopeName: scopeName,
      attributes: attributes,
      snippet: buildSnippetFromChunk_(record.content || record.chunk || null)
    });
  }
  const queryText = query && String(query).trim();
  if (queryText) {
    const queryTokens = parseVectorQueryTokens_(queryText);
    if (queryTokens.length) {
      const normalizedQuery = normalizeTextForBoost_(queryText);
      normalized.forEach(function(hit) {
        let boost = computeLexicalBoostScore_(hit, queryTokens, normalizedQuery);
        hit.lexicalBoost = boost;
        hit.compositeScore = (hit.score || 0) + boost;
      });
      normalized.sort(function(a, b) {
        const scoreA = a.compositeScore || 0;
        const scoreB = b.compositeScore || 0;
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        return (b.score || 0) - (a.score || 0);
      });
    }
  }
  // Pattern from App-script/VectorSearch.js:314 (log validation results)
  try {
    UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'normalizeVectorStoreSearchResponse_', {
      inputCount: data.length,
      outputCount: normalized.length,
      skippedInvalidSKUs: skippedInvalidSKUs,
      catalogValidation: hasCatalog,
      catalogPrefixFilter: catalogPrefixes.length > 0 ? catalogPrefixes.join(', ') : 'none'
    });
  } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
  return normalized;
}

function vectorHitHasScopeName_(hit) {
  return !!(hit && hit.scopeName && String(hit.scopeName).trim());
}

function buildVectorHitSignature_(hit, index) {
  if (!hit) {
    return 'hit-' + index;
  }
  const keyParts = [];
  if (hit.scopeEntryId) {
    keyParts.push('entry:' + hit.scopeEntryId);
  }
  const codeCandidate = hit.scopeCode || hit.sku;
  if (codeCandidate) {
    keyParts.push('code:' + codeCandidate);
  }
  if (hit.fileId) {
    keyParts.push('file:' + hit.fileId);
  }
  if (hit.vectorStoreId) {
    keyParts.push('store:' + hit.vectorStoreId);
  }
  if (!keyParts.length) {
    return 'hit-' + index;
  }
  return keyParts.join('|');
}

function dedupVectorHitsLegacy_(hits) {
  try {
    UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'dedupVectorHitsLegacy_', {
      hitCount: hits && hits.length
    });
  } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
  const seenSignatures = Object.create(null);
  const deduped = [];
  for (let hitIndex = 0; hitIndex < hits.length; hitIndex++) {
    const hit = hits[hitIndex];
    if (!hit) {
      continue;
    }
    const signature = buildVectorHitSignature_(hit, hitIndex);
    if (seenSignatures[signature]) {
      continue;
    }
    seenSignatures[signature] = true;
    deduped.push(hit);
  }
  try {
    UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'dedupVectorHitsLegacy_ result', {
      outputCount: deduped.length
    });
  } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
  return deduped;
}

function dedupVectorHitsByScore_(hits, entryId) {
  try {
    UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'dedupVectorHitsByScore_', {
      hitCount: hits && hits.length,
      entryId: entryId
    });
  } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
  const seenSignatures = Object.create(null);
  const signatureOrder = [];
  for (let hitIndex = 0; hitIndex < hits.length; hitIndex++) {
    const hit = hits[hitIndex];
    if (!hit) {
      continue;
    }
    const signature = buildVectorHitSignature_(hit, hitIndex);
    if (!Object.prototype.hasOwnProperty.call(seenSignatures, signature)) {
      signatureOrder.push(signature);
      seenSignatures[signature] = {
        hit: hit,
        score: !hit ? null : normalizeNumber(hit.score, null),
        hasScopeName: vectorHitHasScopeName_(hit)
      };
      continue;
    }
    const existing = seenSignatures[signature];
    if (!existing || !existing.hit) {
      seenSignatures[signature] = {
        hit: hit,
        score: !hit ? null : normalizeNumber(hit.score, null),
        hasScopeName: vectorHitHasScopeName_(hit)
      };
      continue;
    }
    let replaceReason = null;
    const newHasScopeName = vectorHitHasScopeName_(hit);
    const existingHasScopeName = existing.hasScopeName;
    const newScore = !hit ? null : normalizeNumber(hit.score, null);
    const existingScore = existing.score;
    if (!existingHasScopeName && newHasScopeName) {
      replaceReason = 'scopeName';
    } else if (existingHasScopeName === newHasScopeName) {
      if (existingScore === null && newScore !== null) {
        replaceReason = 'score';
      } else if (existingScore !== null && newScore !== null && newScore > existingScore) {
        replaceReason = 'score';
      }
    }
    if (replaceReason) {
      logVectorMatchDedupReplacement_(entryId, signature, existing.hit, hit, replaceReason);
      seenSignatures[signature] = {
        hit: hit,
        score: newScore,
        hasScopeName: newHasScopeName
      };
    }
  }
  const deduped = [];
  for (let i = 0; i < signatureOrder.length; i++) {
    const record = seenSignatures[signatureOrder[i]];
    if (record && record.hit) {
      deduped.push(record.hit);
    }
  }
  try {
    UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'dedupVectorHitsByScore_ result', {
      outputCount: deduped.length,
      entryId: entryId
    });
  } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
  return deduped;
}

function logVectorMatchDedupReplacement_(entryId, signature, keptHit, droppedHit, reason) {
  if (typeof logAIEvent !== 'function') {
    return;
  }
  try {
    UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'vectorMatchDedupReplacement', {
      entryId: entryId,
      signature: signature,
      reason: reason,
      keptScore: !keptHit ? null : normalizeNumber(keptHit.score, null),
      droppedScore: !droppedHit ? null : normalizeNumber(droppedHit.score, null)
    });
    // Removed noise: dedup replacement logging
  } catch (error) {
    try { UnifiedLogger.warn(VECTOR_SEARCH_LOG_CATEGORY, 'vector match dedup log failed', String(error)); } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
  }
}

/**
 * Prompt the user for a query, fetch the raw OpenAI response, and log it for inspection.
 */
function promptVectorStoreDebugQuery() {
  let ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (error) {
    try { UnifiedLogger.warn(VECTOR_SEARCH_LOG_CATEGORY, '[Vector Debug] UI not available', String(error)); } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
    try { UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, '[Vector Debug] run from Sheets'); } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
    return;
  }
  const response = ui.prompt(
    'Vector Store Debug',
    'Enter the text you want to send to the vector store (brief description, scope label, etc.).',
    ui.ButtonSet.OK_CANCEL
  );
  const button = response.getSelectedButton();
  if (button !== ui.Button.OK) {
    return;
  }
  const queryText = String(response.getResponseText() || '').trim();
  if (!queryText) {
    ui.alert('Vector Debug', 'No query entered; nothing was sent to the vector store.', ui.ButtonSet.OK);
    return;
  }

  try {
    try {
      UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'promptVectorStoreDebugQuery', {
        query: queryText
      });
    } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
    const debugResult = fetchVectorStoreRawResponse_(queryText, {
      limit: VECTOR_SEARCH_MAX_RESULTS
    });
    const rawHits = debugResult.raw && Array.isArray(debugResult.raw.data)
      ? debugResult.raw.data
      : [];
    try {
      UnifiedLogger.info(VECTOR_SEARCH_LOG_CATEGORY, 'promptVectorStoreDebugQuery result', {
        query: debugResult.query,
        hitCount: rawHits.length,
        rawDataSnippet: truncateForVectorLog_(JSON.stringify(rawHits, null, 2), 4000)
      });
    } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
    ui.alert(
      'Vector Debug Complete',
      'Logged ' + rawHits.length + ' records for "' + debugResult.query + '". ' +
      'See View → Logs to inspect the raw payload.',
      ui.ButtonSet.OK
    );
  } catch (error) {
    try {
      UnifiedLogger.error(VECTOR_SEARCH_LOG_CATEGORY, '[Vector Debug] failure', {
        query: queryText,
        error: error
      });
    } catch (ignore) {
      console.error('[VectorSearch] Error:', ignore.message, ignore.stack);
    }
    ui.alert(
      'Vector Debug Failed',
      'The vector store request failed. Check Apps Script logs for the error details.',
      ui.ButtonSet.OK
    );
  }
}

function extractScopeCodeFromRecord_(record, attributes) {
  let scopeCode = '';
  if (attributes) {
    scopeCode = firstNonEmpty_(
      attributes.scope_code,
      attributes.scopeCode,
      attributes.sku,
      attributes.SKU,
      attributes.item_code,
      attributes.itemCode,
      attributes.catalog_sku,
      attributes.catalogSku
    );
  }
  if (!scopeCode && record && record.file && record.file.metadata) {
    scopeCode = firstNonEmpty_(
      record.file.metadata.scope_code,
      record.file.metadata.scopeCode,
      record.file.metadata.item_code,
      record.file.metadata.itemCode
    );
  }
  if (!scopeCode && record && record.file && record.file.filename) {
    scopeCode = extractScopeCodeFromFilename_(record.file.filename);
  }
  if (!scopeCode) {
    scopeCode = extractScopeCodeFromContent_(record && (record.content || record.chunk || null));
  }
  return scopeCode || '';
}

function firstNonEmpty_() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function extractScopeCodeFromContent_(content) {
  if (!content) {
    return '';
  }
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    for (let i = 0; i < content.length; i++) {
      const entry = content[i];
      if (!entry) {
        continue;
      }
      if (typeof entry === 'string') {
        text += entry + '\n';
      } else if (entry.text) {
        text += entry.text + '\n';
      } else if (entry.content) {
        text += JSON.stringify(entry.content) + '\n';
      } else {
        text += JSON.stringify(entry) + '\n';
      }
    }
  } else if (typeof content === 'object') {
    text = JSON.stringify(content);
  }
  if (!text) {
    return '';
  }
  let match = text.match(/\"scopeCode\"\s*:\s*\"([^"]+)\"/i);
  if (match && match[1]) {
    return match[1];
  }
  match = text.match(/scope[\s_-]?code[:=]\s*([A-Za-z0-9._-]+)/i);
  if (match && match[1]) {
    return match[1];
  }
  match = text.match(/\bScope\s+([A-Za-z0-9][A-Za-z0-9._-]+)\s*:/);
  if (match && match[1]) {
    return match[1];
  }
  return '';
}

/**
 * Execute vector search across a batch of scope entries.
 * @param {Array<Object>} entries approved scope entries
 * @param {{limit?:number,minScore?:number,catalogPrefixes?:Array<string>}=} options
 * @return {{hitsByEntry:Object<string,Array>, errors:Array<Object>}}
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function vectorSearchScopeEntries_(entries, options) {
  const trace = UnifiedLogger.startTrace('VectorSearch', 'vectorSearchScopeEntries_', {
    entryCount: Array.isArray(entries) ? entries.length : 0
  });

  try {
    const hitsByEntry = {};
    const errors = [];
  if (!Array.isArray(entries) || !entries.length) {
    return { hitsByEntry: hitsByEntry, errors: errors };
  }

  options = options || {};
  const limit = options.limit && options.limit > 0 ? Number(options.limit) : VECTOR_SEARCH_MAX_RESULTS;
  let minScore = options.minScore !== undefined && options.minScore !== null
    ? Number(options.minScore)
    : VECTOR_SEARCH_SCORE_FLOOR;
  if (isNaN(minScore) || minScore <= 0) {
    minScore = VECTOR_SEARCH_SCORE_FLOOR;
  }
  // Catalog prefix filtering from App-script/AISidebar.js:4524-4526
  const catalogPrefixes = Array.isArray(options.catalogPrefixes) ? options.catalogPrefixes : [];

  if (typeof ensureVectorIntegrationReady_ === 'function') {
    ensureVectorIntegrationReady_({ operation: 'search', allowNetworkProbe: true });
  }
  const featureFlags = typeof resolveVectorFeatureFlags_ === 'function' ? resolveVectorFeatureFlags_() : { cache: true };
  const cacheEnabled = featureFlags.cache !== false;
  const queryCache = {};

  // US-014-004-MAIN: Parallelize vector search using batch processing
  // Process entries in batches to improve performance from ~39 seconds to <20 seconds
  const BATCH_SIZE = 10; // Process 10 searches concurrently to avoid rate limits

  // Prepare all entries and check cache first
  const searchRequests = [];
  const entryMetadata = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || !entry.id) {
      errors.push(buildVectorDiagnosticEntry_(entry, {
        message: 'Skipped scope entry at index ' + i + ' due to missing identifier.',
        type: 'validation'
      }));
      continue;
    }
    const query = buildScopeVectorQuery_(entry);
    if (!query) {
      errors.push(buildVectorDiagnosticEntry_(entry, {
        entryId: entry.id,
        message: 'Entry ' + entry.id + ' missing searchable content.',
        type: 'validation'
      }));
      continue;
    }

    const cacheKey = cacheEnabled
      ? buildVectorCacheKey_(entry, query, limit, minScore)
      : '';

    // Check cache first
    if (cacheEnabled && cacheKey && Object.prototype.hasOwnProperty.call(queryCache, cacheKey)) {
      // Cache hit - process immediately
      const hits = cloneVectorHits_(queryCache[cacheKey]);
      processHits_(entry, hits, hitsByEntry, errors);
      continue;
    }

    // No cache hit - prepare for batch search
    searchRequests.push({
      entry: entry,
      query: query,
      cacheKey: cacheKey,
      index: i
    });
  }

  // Process search requests in batches
  for (let batchStart = 0; batchStart < searchRequests.length; batchStart += BATCH_SIZE) {
    const batch = searchRequests.slice(batchStart, Math.min(batchStart + BATCH_SIZE, searchRequests.length));

    // Build batch of URL fetch requests
    const fetchRequests = [];
    const batchMetadata = [];

    for (const request of batch) {
      const apiKey = getOpenAiApiKey_();
      const vectorStoreId = resolveVectorStoreId_();

      if (!apiKey || !vectorStoreId) {
        errors.push(buildVectorDiagnosticEntry_(request.entry, {
          message: 'Missing API configuration for entry ' + request.entry.id,
          type: 'configuration'
        }));
        continue;
      }

      const payload = {
        query: String(request.query),
        max_num_results: limit
      };

      if (minScore && minScore > 0) {
        payload.ranking_options = {
          score_threshold: minScore
        };
      }

      const headers = buildOpenAiHeaders_(apiKey);
      headers['Content-Type'] = 'application/json';

      fetchRequests.push({
        url: 'https://api.openai.com/v1/vector_stores/' + vectorStoreId + '/search',
        method: 'post',
        headers: headers,
        muteHttpExceptions: true,
        payload: JSON.stringify(payload),
        contentType: 'application/json'
      });

      batchMetadata.push(request);
    }

    if (fetchRequests.length === 0) {
      continue;
    }

    // Rate limit enforcement for batch
    enforceRateLimit(SERVICE_OPENAI_VECTOR);

    // Execute batch requests in parallel
    let responses = [];
    try {
      responses = UrlFetchApp.fetchAll(fetchRequests);
    } catch (batchError) {
      // If batch fails, fall back to sequential processing for this batch
      for (let j = 0; j < fetchRequests.length; j++) {
        try {
          responses[j] = UrlFetchApp.fetch(fetchRequests[j].url, fetchRequests[j]);
        } catch (singleError) {
          responses[j] = null;
          const request = batchMetadata[j];
          errors.push(buildVectorDiagnosticEntry_(request.entry, {
            message: 'Entry ' + request.entry.id + ' search failed: ' + singleError.message,
            type: 'search',
            hitCount: 0,
            query: request.query
          }));
        }
      }
    }

    // Process batch responses
    for (let j = 0; j < responses.length; j++) {
      const response = responses[j];
      const request = batchMetadata[j];

      if (!response) {
        continue; // Error already logged
      }

      const status = response.getResponseCode();
      const bodyText = response.getContentText() || '';
      let body = {};

      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch (parseError) {
        body = {};
      }

      if (status >= 300) {
        const snippet = truncateForVectorLog_(bodyText, 400);
        errors.push(buildVectorDiagnosticEntry_(request.entry, {
          message: 'Entry ' + request.entry.id + ' search failed with status ' + status + ': ' + snippet,
          type: 'search',
          statusCode: status,
          hitCount: 0,
          query: request.query
        }));
        continue;
      }

      let hits = parseVectorSearchResponse_(body);

      // Apply deduplication if needed
      if (hits && hits.length > 1) {
        const dedupPagerActive = typeof isVectorMatchPagerEnabled === 'function'
          ? isVectorMatchPagerEnabled()
          : true;
        if (dedupPagerActive) {
          hits = dedupVectorHitsByScore_(hits, request.entry && request.entry.id ? String(request.entry.id) : '');
        } else {
          hits = dedupVectorHitsLegacy_(hits);
        }
      }

      // Cache successful results
      if (cacheEnabled && request.cacheKey) {
        queryCache[request.cacheKey] = cloneVectorHits_(hits);
      }

      // Process hits
      processHits_(request.entry, hits, hitsByEntry, errors);

      // Log empty results if needed
      if (!hits.length) {
        UnifiedLogger.warn('VectorSearch', 'Vector search returned no matches', {
          entryId: request.entry.id,
          scopeLabel: request.entry.scopeLabel || '',
          canonical: request.entry.canonical || '',
          query: truncateForVectorLog_(request.query, 100),
          minScore: minScore
        });
      }
    }

    // Small delay between batches to avoid rate limits
    if (batchStart + BATCH_SIZE < searchRequests.length) {
      Utilities.sleep(100); // 100ms delay between batches
    }
  }

  const result = { hitsByEntry: hitsByEntry, errors: errors };

  trace.complete('Vector search complete', {
    entryCount: Object.keys(result.hitsByEntry).length,
    errorCount: result.errors.length
  });

  // FIX ISS-001: Log detailed error summary if errors occurred
  if (result.errors.length > 0) {
    UnifiedLogger.warn('VectorSearch', 'Vector search completed with errors', {
      totalEntries: entries.length,
      successfulEntries: Object.keys(result.hitsByEntry).length,
      errorCount: result.errors.length,
      errorDetails: result.errors.map(function(err) {
        return {
          entryId: err.entryId || '',
          type: err.type || '',
          message: err.message ? String(err.message).substring(0, 100) : ''
        };
      })
    });
  }

  return result;

  } catch (error) {
    trace.fail('Vector search failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'performing vector search on scope entries',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    // Return empty result
    return {
      hitsByEntry: {},
      errors: [{
        message: 'Vector search failed: ' + error.toString(),
        type: 'system',
        correlationId: trace.correlationId
      }]
    };
  }
}

/**
 * Build a vector search query from a scope entry.
 * @param {Object} entry scope entry payload
 * @return {string}
 */
function buildScopeVectorQuery_(entry) {
  if (!entry) {
    return '';
  }

  // For flattened deliverable entries, use scopeLabel directly (unique per entry)
  // instead of deliverables array (which often contains parent section label)
  const isFlattened = entry.metadata && entry.metadata.isDeliverableEntry === true;
  if (isFlattened) {
    return buildFallbackQuery_(entry);
  }

  const deliverablesQuery = buildDeliverablesQuery_(entry);
  if (deliverablesQuery) {
    return deliverablesQuery;
  }
  return buildFallbackQuery_(entry);
}

// Pattern from App-script/VectorSearch.js:839 (enhanced with fallback context for short queries)
function buildDeliverablesQuery_(entry) {
  if (!Array.isArray(entry.deliverables) || !entry.deliverables.length) {
    return '';
  }
  let text = entry.deliverables
    .map(function(item) { return item && String(item).trim(); })
    .filter(function(item) { return item && item.length; })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return '';
  }
  text = stripLeadingVerbPhrases_(text);
  text = normalizeForClause_(text);
  const limit = parseInt(getConfigValue('VECTOR_SEARCH_QUERY_WORD_LIMIT'), 10) || 25;
  text = enforceWordLimit_(text, limit);

  // If query is too short (< 5 words), add fallback context from interpretation and scopeLabel
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 5) {
    const contextParts = [text];
    const interpretation = entry.interpretation && String(entry.interpretation).trim();
    if (interpretation && text.toLowerCase().indexOf(interpretation.toLowerCase()) === -1) {
      contextParts.push(interpretation);
    }
    const scopeLabel = entry.scopeLabel && String(entry.scopeLabel).trim();
    if (scopeLabel && text.toLowerCase().indexOf(scopeLabel.toLowerCase()) === -1 &&
        (!interpretation || interpretation.toLowerCase().indexOf(scopeLabel.toLowerCase()) === -1)) {
      contextParts.push(scopeLabel);
    }
    text = contextParts.join(' ').replace(/\s+/g, ' ').trim();
    text = enforceWordLimit_(text, limit);
  }

  return text;
}

// Pattern from App-script/VectorSearch.js:858 (reduced aggressiveness to preserve semantic content)
function stripLeadingVerbPhrases_(text) {
  const verbs = [
    'create', 'develop', 'build', 'design', 'deliver', 'execute', 'manage',
    'prepare', 'plan', 'coordinate', 'implement', 'support', 'produce', 'drive'
  ];
  const verbPattern = verbs.join('|');
  // Only strip if verb is first word followed by article (a/an/the)
  // Preserves adjectives and descriptive terms like "comprehensive", "detailed", "annual"
  const regex = new RegExp('^\\s*(' + verbPattern + ')\\s+(a|an|the)\\s+', 'i');
  return text.replace(regex, '').trim();
}

function normalizeForClause_(text) {
  const match = text.match(/^(.*?)\bfor\b[\s\S]*?\bin\b([\s\S]*)$/i);
  if (!match || (!match[1] && !match[2])) {
    return text;
  }
  const prefix = (match[1] || '').trim();
  const suffix = (match[2] || '').trim();
  const result = [];
  if (prefix) {
    result.push(prefix);
  }
  if (suffix) {
    result.push('in ' + suffix);
  }
  return result.join(' ').trim();
}

function enforceWordLimit_(text, limit) {
  if (!text || !limit || limit <= 0) {
    return text;
  }
  const tokens = text.split(/\s+/);
  if (tokens.length <= limit) {
    return text;
  }
  return tokens.slice(0, limit).join(' ');
}

function buildFallbackQuery_(entry) {
  const fallbackParts = [];
  const interpretation = entry.interpretation && String(entry.interpretation).trim();
  if (interpretation) {
    fallbackParts.push(interpretation);
  }
  const scopeLabel = entry.scopeLabel && String(entry.scopeLabel).trim();
  if (scopeLabel && (!interpretation || interpretation.toLowerCase().indexOf(scopeLabel.toLowerCase()) === -1)) {
    fallbackParts.push(scopeLabel);
  }
  return fallbackParts.join(' ').replace(/\s+/g, ' ').trim();
}

function formatVectorSignal_(signal) {
  if (!signal) {
    return '';
  }
  if (typeof signal === 'string') {
    return String(signal).trim();
  }
  if (typeof signal === 'object') {
    const segments = [];
    if (signal.canonical) {
      segments.push(String(signal.canonical));
    }
    if (signal.evidence) {
      segments.push(String(signal.evidence));
    }
    if (signal.label) {
      segments.push(String(signal.label));
    }
    if (signal.text) {
      segments.push(String(signal.text));
    }
    if (segments.length) {
      return segments.join(' · ');
    }
    try {
      return JSON.stringify(signal);
    } catch (error) {
      return '';
    }
  }
  return String(signal).trim();
}

/**
 * Render a compact snippet from a vector chunk payload.
 * @param {Object} chunk
 * @return {string}
 */
function buildSnippetFromChunk_(chunk) {
  if (!chunk) {
    return '';
  }
  if (Array.isArray(chunk)) {
    const parts = [];
    for (let i = 0; i < chunk.length; i++) {
      const entry = chunk[i];
      if (!entry) {
        continue;
      }
      if (entry.text) {
        parts.push(String(entry.text));
      } else if (entry.type === 'text' && entry.value) {
        parts.push(String(entry.value));
      }
    }
    if (parts.length) {
      return truncateForVectorLog_(parts.join(' '), 360);
    }
  }
  if (chunk.text) {
    return truncateForVectorLog_(String(chunk.text), 360);
  }
  if (chunk.values && chunk.values.length) {
    return truncateForVectorLog_(chunk.values.join(' '), 360);
  }
  return '';
}

/**
 * Attempt to extract a scope code from a vector store filename.
 * @param {string} filename
 * @return {string}
 */
function extractScopeCodeFromFilename_(filename) {
  if (!filename) {
    return '';
  }
  const match = String(filename).match(/^scope_(.+)\.json$/i);
  if (!match || !match[1]) {
    return '';
  }
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
}

/**
 * Truncate lengthy values for logging or snippets.
 * @param {string} text
 * @param {number} limit
 * @return {string}
 */
function truncateForVectorLog_(text, limit) {
  if (!text) {
    return '';
  }
  const maxLength = limit && limit > 0 ? limit : 200;
  const value = String(text);
  if (value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength) + '…';
}

function parseVectorQueryTokens_(query) {
  const normalized = normalizeTextForBoost_(query);
  if (!normalized) {
    return [];
  }
  const segments = normalized.split(' ');
  const tokens = [];
  const seen = {};
  for (let i = 0; i < segments.length; i++) {
    const token = segments[i];
    if (!token || token.length < 3 || seen[token]) {
      continue;
    }
    seen[token] = true;
    tokens.push(token);
  }
  return tokens;
}

function normalizeTextForBoost_(value) {
  if (value === undefined || value === null) {
    return '';
  }
  const text = String(value);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNormalizedHitFieldText_(hit) {
  if (!hit) {
    return '';
  }
  const parts = [];
  const appendValue = function(value) {
    if (value === undefined || value === null) {
      return;
    }
    parts.push(String(value));
  };
  const appendArray = function(value) {
    if (!Array.isArray(value) || !value.length) {
      return;
    }
    parts.push(value.map(function(item) { return (item === undefined || item === null) ? '' : String(item); }).join(' '));
  };
  appendValue(hit.scopeName);
  const attributes = hit.attributes || {};
  appendValue(attributes.scopeName);
  appendValue(attributes.scope_name);
  appendValue(attributes.description);
  appendValue(attributes.categoryPath);
  appendValue(attributes.category_path);
  appendValue(attributes.roleSummary);
  appendArray(attributes.notes);
  appendArray(attributes.scenarioNotes);
  appendArray(attributes.scenarioHighlights);
  if (attributes.scopeDetails) {
    appendArray(attributes.scopeDetails.notes);
    appendArray(attributes.scopeDetails.scenarioHighlights);
  }
  appendArray(attributes.quantitySignals);
  if (attributes.assistantHints && attributes.assistantHints.embeddingText) {
    appendValue(attributes.assistantHints.embeddingText);
  }
  appendValue(hit.snippet);
  return normalizeTextForBoost_(parts.join(' '));
}

function computeLexicalBoostScore_(hit, tokens, phraseNormalized) {
  if (!tokens || !tokens.length) {
    return 0;
  }
  const fieldText = buildNormalizedHitFieldText_(hit);
  if (!fieldText) {
    return 0;
  }
  let matchCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (fieldText.indexOf(tokens[i]) !== -1) {
      matchCount++;
    }
  }
  if (!matchCount) {
    return 0;
  }
  const ratio = matchCount / tokens.length;
  const baseBoost = 0.08 + 0.32 * Math.min(1, ratio);
  let boost = Math.min(0.45, baseBoost);
  if (phraseNormalized && phraseNormalized.length && fieldText.indexOf(phraseNormalized) !== -1) {
    boost = Math.min(0.5, boost + 0.15);
  }
  return boost;
}

function buildVectorCacheKey_(entry, query, limit, minScore) {
  if (!query) {
    return '';
  }
  const normalizedQuery = normalizeTextForBoost_(query);
  if (!normalizedQuery) {
    return '';
  }
  const sectionId = entry && entry.sectionId ? String(entry.sectionId || '') : '';
  const entryId = entry && entry.id ? String(entry.id || '') : '';
  let detailParent = '';
  if (entry && entry.metadata && entry.metadata.vectorDetailParent) {
    detailParent = String(entry.metadata.vectorDetailParent);
  } else if (entry && entry.parentId) {
    detailParent = String(entry.parentId);
  }
  const components = [
    normalizedQuery,
    'section=' + sectionId,
    'entry=' + entryId,
    'parent=' + detailParent,
    'limit=' + (isFinite(limit) ? Number(limit) : VECTOR_SEARCH_MAX_RESULTS),
    'minScore=' + (isFinite(minScore) ? Number(minScore) : VECTOR_SEARCH_SCORE_FLOOR)
  ];
  return components.join('|');
}

function cloneVectorHits_(hits) {
  if (!Array.isArray(hits)) {
    return [];
  }
  const cloned = [];
  for (let index = 0; index < hits.length; index++) {
    const hit = hits[index];
    if (!hit) {
      cloned.push(hit);
      continue;
    }
    try {
      cloned.push(JSON.parse(JSON.stringify(hit)));
    } catch (error) {
      const shallow = Object.assign({}, hit);
      cloned.push(shallow);
    }
  }
  return cloned;
}

/**
 * US-014-004-MAIN: Helper function to process search hits for an entry
 * Consolidates the hit processing logic that was previously in the main loop
 * @param {Object} entry - The scope entry
 * @param {Array} hits - The search hits for this entry
 * @param {Object} hitsByEntry - The results accumulator
 * @param {Array} errors - The errors accumulator
 */
function processHits_(entry, hits, hitsByEntry, errors) {
  if (!entry || !entry.id) {
    return;
  }

  let targetEntryId = String(entry.id);
  let detailParentId = '';

  if (entry.metadata && entry.metadata.vectorDetailParent) {
    detailParentId = String(entry.metadata.vectorDetailParent).trim();
  } else if (entry.parentId) {
    detailParentId = String(entry.parentId).trim();
  }

  if (detailParentId) {
    targetEntryId = detailParentId;
  }

  const appendHitsForKey = function(key) {
    if (!key) {
      return;
    }
    if (!hitsByEntry[key]) {
      hitsByEntry[key] = [];
    }
    hitsByEntry[key] = hitsByEntry[key].concat(hits || []);
  };

  appendHitsForKey(targetEntryId);
  if (entry.id && targetEntryId !== String(entry.id)) {
    appendHitsForKey(String(entry.id));
  }
}

/**
 * US-014-004-MAIN: Helper function to parse vector search response
 * Extracts hits from the API response body
 * @param {Object} body - The parsed JSON response body
 * @return {Array} The array of hits
 */
function parseVectorSearchResponse_(body) {
  if (!body || typeof body !== 'object') {
    return [];
  }

  // Handle OpenAI vector store response format
  if (body.data && Array.isArray(body.data)) {
    return body.data.map(function(item) {
      return {
        id: item.id || '',
        score: item.score || 0,
        metadata: item.metadata || {},
        content: item.content || [],
        attributes: item.metadata || {}
      };
    });
  }

  // Handle legacy format
  if (body.hits && Array.isArray(body.hits)) {
    return body.hits;
  }

  // Handle single hit format
  if (body.id && body.score) {
    return [body];
  }

  return [];
}

function buildVectorDiagnosticEntry_(entry, config) {
  const options = config || {};
  const entryId = options.entryId || (entry && entry.id ? String(entry.id) : '');
  let fallbackParent = '';
  if (entry && entry.metadata && entry.metadata.vectorDetailParent) {
    fallbackParent = String(entry.metadata.vectorDetailParent);
  } else if (entry && entry.parentId) {
    fallbackParent = String(entry.parentId);
  }
  const vectorDetailParent = options.vectorDetailParent || fallbackParent;
  const message = options.message ? String(options.message) : '';
  return {
    entryId: entryId,
    vectorDetailParent: vectorDetailParent,
    type: options.type || 'vector',
    statusCode: options.statusCode !== undefined ? options.statusCode : null,
    message: message,
    hitCount: options.hitCount !== undefined && options.hitCount !== null ? Number(options.hitCount) : null,
    query: options.query || ''
  };
}

/* exported searchVectorStoreScopes_, vectorSearchScopeEntries_, fetchVectorStoreRawResponse_, promptVectorStoreDebugQuery */

/**
 * hrmny Quote Builder - OpenAI Vector Store Scope Sync
 *
 * Converts rows from the Scope Buildups sheet into JSON payloads and uploads them
 * to the configured OpenAI vector store for Responses file_search retrieval.
 * Requires the following configuration (stored in Script Properties):
 *   - OPENAI_API_KEY
 *   - OPENAI_VECTOR_STORE_ID
 *   - OPENAI_PROMPT_ID (optional but logged; legacy OPENAI_ASSISTANT_ID still accepted)
 *
 * Rate limiting: All OpenAI API calls are rate-limited via RateLimiter.js
 */

// Note: RateLimiter.js functions (enforceRateLimit, SERVICE_OPENAI_VECTOR) are available globally
// as this file loads after RateLimiter.js in the Apps Script project

// Module logging category for UnifiedLogger
const LOG_CATEGORY_SCOPE_VECTOR_SCOPE_VECTOR = 'ScopeVectorStoreSync';

/**
 * Sync Scope Buildup entries into the configured OpenAI vector store.
 * @param {{limit?: number, batchSize?: number, dryRun?: boolean}|undefined} options optional overrides for testing
 * @return {Object} summary of the sync process
 */
const VECTOR_STORE_HASH_PROP = 'OPENAI_VECTOR_STORE_CONTENT_HASH';

function syncScopeBuildupsToVectorStore(options) {
  // Correlation ID tracing for vector store sync (Example integration #3)
  const trace = UnifiedLogger.startTrace('ScopeVectorStoreSync', 'syncScopeBuildupsToVectorStore', {
    options: options
  });

  try {
    options = options || {};
    const limit = options.limit && !isNaN(options.limit) ? Number(options.limit) : null;
    const batchSize = options.batchSize && options.batchSize > 0 ? Number(options.batchSize) : 20;
    const dryRun = options.dryRun === true;

  if (typeof ensureVectorIntegrationReady_ === 'function') {
    ensureVectorIntegrationReady_({ operation: 'sync', allowNetworkProbe: true });
  }

  let result;

  const apiKey = getOpenAiApiKey_();
  if (!apiKey) {
    throw new AppError('OPENAI_CONFIG', 'Missing OpenAI API key. Set OPENAI_API_KEY in Script Properties.');
  }

  const vectorStoreId = resolveVectorStoreId_();
  if (!vectorStoreId) {
    throw new AppError('OPENAI_CONFIG', 'Missing OPENAI_VECTOR_STORE_ID. Set it in Script Properties.');
  }

  const promptId = resolvePromptId_();

  const syncStatus = getVectorStoreSyncStatus();
  if (syncStatus && syncStatus.hasHash && syncStatus.stale === false) {
    catchAndLog(function() {
      UnifiedLogger.info('ScopeVectorStoreSync', 'Vector store content hash unchanged; skipping sync.', syncStatus);
    }, 'ScopeVectorStoreSync');
    catchAndLog(function() {
      recordVectorSyncSuccess({ dryRun: false, uploaded: 0 });
    }, 'ScopeVectorStoreSync');
    trace.complete('Vector sync skipped - content unchanged', { syncStatus: syncStatus });
    return {
      processedScopes: 0,
      processedResources: 0,
      processedCrew: 0,
      payloadsPrepared: 0,
      filesUploaded: 0,
      deletedFileCount: 0,
      skippedScopes: 0,
      errors: [],
      promptId: promptId,
      vectorStoreId: vectorStoreId
    };
  }

  const scopes = collectScopeBuildupEntries_(limit);
  const resourceScopeEntries = collectResourceRateEntries_(limit);
  const crewScopeEntries = collectResourceRateEntries_(limit);
  try {
    UnifiedLogger.info('ScopeVectorStoreSync', 'Preparing payloads', {
      scopes: scopes.length,
      resources: resourceScopeEntries.length,
      crew: crewScopeEntries.length,
      limit: limit || 'all',
      batchSize: batchSize
    });
  } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_SCOPE_VECTOR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
  trace.info('Preparing payloads', {
    scopeCount: scopes.length,
    resourceCount: resourceScopeEntries.length,
    crewCount: crewScopeEntries.length
  });

  const payloads = [];
  const errors = [];

  scopes.forEach(function(scope, index) {
    try {
      const payload = buildScopeUploadPayload_(scope, 'scope');
      payload.serializedContent = JSON.stringify(payload.content);
      payload.checksum = computePayloadChecksum_(payload.serializedContent);
      payloads.push(payload);
    } catch (error) {
      const message = 'Failed to prepare scope ' + scope.code + ': ' + error;
      catchAndLog(function() {
        UnifiedLogger.warn('ScopeVectorStoreSync', message);
      }, 'ScopeVectorStoreSync');
      errors.push(message);
    }
  });

  resourceScopeEntries.forEach(function(scope, index) {
    try {
      const payload = buildScopeUploadPayload_(scope, 'resource');
      payload.serializedContent = JSON.stringify(payload.content);
      payload.checksum = computePayloadChecksum_(payload.serializedContent);
      payload.recordType = 'resource';
      payloads.push(payload);
    } catch (error) {
      const message = 'Failed to prepare resource ' + scope.code + ': ' + error;
      catchAndLog(function() {
        UnifiedLogger.warn('ScopeVectorStoreSync', message);
      }, 'ScopeVectorStoreSync');
      errors.push(message);
    }
  });

  crewScopeEntries.forEach(function(scope, index) {
    try {
      const payload = buildScopeUploadPayload_(scope, 'crew');
      payload.serializedContent = JSON.stringify(payload.content);
      payload.checksum = computePayloadChecksum_(payload.serializedContent);
      payload.recordType = 'crew';
      payloads.push(payload);
    } catch (error) {
      const message = 'Failed to prepare crew ' + scope.code + ': ' + error;
      catchAndLog(function() {
        UnifiedLogger.warn('ScopeVectorStoreSync', message);
      }, 'ScopeVectorStoreSync');
      errors.push(message);
    }
  });

  try {
    if (payloads.length === 0) {
      result = {
        processedScopes: scopes.length,
        payloadsPrepared: 0,
        filesUploaded: 0,
        dryRun: dryRun,
        deletedFileCount: 0,
        errors: errors
      };
    } else if (dryRun) {
      result = {
        processedScopes: scopes.length,
        processedResources: resourceScopeEntries.length,
        processedCrew: crewScopeEntries.length,
        payloadsPrepared: payloads.length,
        filesUploaded: 0,
        dryRun: true,
        samplePayload: payloads[0],
        deletedFileCount: 0,
        errors: errors
      };
    } else {
      const existingFileMap = indexExistingScopeFiles_(vectorStoreId, apiKey);
      let deletedFileCount = 0;
      let skippedCount = 0;
      const uploadCandidates = [];

      payloads.forEach(function(payload) {
        const scopeCode = payload.scope.code;
        const existing = existingFileMap[scopeCode];
        if (existing && existing.checksum && payload.checksum && existing.checksum === payload.checksum) {
          skippedCount++;
          delete existingFileMap[scopeCode];
          return;
        }
        if (existing) {
          try {
            deleteVectorStoreFile_(vectorStoreId, existing.fileId, apiKey);
            deletedFileCount++;
          } catch (error) {
            const message = 'Unable to remove old file ' + existing.fileId + ' (' + scopeCode + '): ' + error;
            catchAndLog(function() {
              UnifiedLogger.warn('ScopeVectorStoreSync', message);
            }, 'ScopeVectorStoreSync');
            errors.push(message);
          }
          delete existingFileMap[scopeCode];
        }
        uploadCandidates.push(payload);
      });

      Object.keys(existingFileMap).forEach(function(orphanScopeCode) {
        const fileRecord = existingFileMap[orphanScopeCode];
        try {
          deleteVectorStoreFile_(vectorStoreId, fileRecord.fileId, apiKey);
          deletedFileCount++;
        } catch (error) {
          const message = 'Unable to remove orphan file ' + fileRecord.fileId + ' (' + orphanScopeCode + '): ' + error;
          catchAndLog(function() {
            UnifiedLogger.warn('ScopeVectorStoreSync', message);
          }, 'ScopeVectorStoreSync');
          errors.push(message);
        }
      });

      const payloadChunks = chunkArray_(uploadCandidates, batchSize);
      const maxUploadsPerRun = options.maxUploadsPerRun && options.maxUploadsPerRun > 0 ? Number(options.maxUploadsPerRun) : 40;
      const maxChunksPerRun = Math.max(1, Math.floor(maxUploadsPerRun / batchSize));
      const chunkLimit = Math.min(payloadChunks.length, maxChunksPerRun);
      let uploadedCount = 0;

      for (let i = 0; i < chunkLimit; i++) {
        const chunk = payloadChunks[i];
        const label = (i + 1) + '/' + payloadChunks.length;
        const remaining = uploadCandidates.length - (i * batchSize) - chunk.length;
        try {
          UnifiedLogger.info('ScopeVectorStoreSync', 'Vector sync progress', {
            batch: label,
            batchSize: chunk.length,
            uploadedSoFar: uploadedCount,
            remaining: remaining,
            totalBatches: payloadChunks.length,
            limitedBatches: chunkLimit
          });
        } catch (ignore) {
          UnifiedLogger.error(LOG_CATEGORY_SCOPE_VECTOR, 'Operation error', { error: ignore.message, stack: ignore.stack });
        }
        try {
          try { UnifiedLogger.info('ScopeVectorStoreSync', 'Uploading batch ' + label, { payloads: chunk.length }); } catch (ignore) {
      UnifiedLogger.error(LOG_CATEGORY_SCOPE_VECTOR, 'Operation error', { error: ignore.message, stack: ignore.stack });
    }
          const batchResult = uploadScopePayloadsToVectorStore_(chunk, vectorStoreId, apiKey);
          uploadedCount += batchResult.uploadedFileCount;
          try {
            UnifiedLogger.info('ScopeVectorStoreSync', 'Batch completed', {
              batch: label,
              uploadedSoFar: uploadedCount,
              batchUploaded: batchResult.uploadedFileCount,
              remainingBatches: payloadChunks.length - (i + 1),
              remainingUploads: Math.max(0, uploadCandidates.length - ((i + 1) * batchSize))
            });
          } catch (ignore) {
            UnifiedLogger.error(LOG_CATEGORY_SCOPE_VECTOR, 'Operation error', { error: ignore.message, stack: ignore.stack });
          }
          if (batchResult.warnings && batchResult.warnings.length) {
            batchResult.warnings.forEach(function(warning) {
              const message = 'Batch ' + label + ' warning: ' + warning;
              catchAndLog(function() {
                UnifiedLogger.info('ScopeVectorStoreSync', message);
              }, 'ScopeVectorStoreSync');
              errors.push(message);
            });
          }
        } catch (error) {
          const message = 'Batch ' + label + ' failed: ' + error;
          catchAndLog(function() {
            UnifiedLogger.info('ScopeVectorStoreSync', message);
          }, 'ScopeVectorStoreSync');
          errors.push(message);
        }
      }

      saveVectorStoreSyncState_();

      catchAndLog(function() {
        UnifiedLogger.info('ScopeVectorStoreSync', 'Complete', { uploaded: uploadedCount, deleted: deletedFileCount, skipped: skippedCount, errors: errors.length });
      }, 'ScopeVectorStoreSync');

      result = {
        processedScopes: scopes.length,
        processedResources: resourceScopeEntries.length,
        processedCrew: crewScopeEntries.length,
        payloadsPrepared: payloads.length,
        filesUploaded: uploadedCount,
        deletedFileCount: deletedFileCount,
        skippedScopes: skippedCount,
        errors: errors,
        promptId: promptId,
        vectorStoreId: vectorStoreId
      };
    }
  } catch (error) {
    catchAndLog(function() {
      recordVectorSyncFailure({ reason: error && error.message ? error.message : 'sync-error' });
    }, 'ScopeVectorStoreSync');
    throw error;
  }

  catchAndLog(function() {
    recordVectorSyncSuccess({ dryRun: dryRun, uploaded: result && result.filesUploaded });
  }, 'ScopeVectorStoreSync');

  trace.complete('Vector store sync complete', {
    filesUploaded: result.filesUploaded,
    scopesProcessed: result.processedScopes,
    resourcesProcessed: result.processedResources,
    crewProcessed: result.processedCrew,
    errors: result.errors ? result.errors.length : 0
  });

  return result;
  } catch (syncError) {
    trace.fail('Vector store sync failed', syncError);
    throw syncError;
  }
}

/**
 * Convenience wrapper for menu usage - prompts the user before syncing.
 */
function syncScopeBuildupsToVectorStoreMenu() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Sync Scope Catalogue to OpenAI Vector Store',
    'This will upload the current Scope Buildups entries to the configured OpenAI vector store used by the catalog prompt.\n\n' +
      'Ensure Script Properties include OPENAI_API_KEY and OPENAI_VECTOR_STORE_ID (optionally OPENAI_PROMPT_ID for logging).\n\nProceed?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    ui.alert('Vector store sync cancelled.');
    return;
  }

  try {
    const result = syncScopeBuildupsToVectorStore();
    ui.alert(
      'Vector Store Sync Complete',
      'Scopes processed: ' + result.processedScopes + '\n' +
        'Files uploaded: ' + result.filesUploaded + '\n' +
        (result.deletedFileCount ? 'Old files removed: ' + result.deletedFileCount + '\n' : '') +
        (result.errors && result.errors.length ? 'Warnings:\n' + result.errors.slice(0, 3).join('\n') : 'No errors reported.'),
      ui.ButtonSet.OK
    );
  } catch (error) {
    catchAndLog(function() {
      UnifiedLogger.warn('ScopeVectorStoreSync', 'syncScopeBuildupsToVectorStoreMenu error', error && error.stack ? error.stack : String(error));
    }, 'ScopeVectorStoreSync');
    ui.alert('Vector store sync failed', error.message || String(error), ui.ButtonSet.OK);
  }
}

/**
 * Build a payload describing a scope for vector store ingestion.
 * @param {Object} scope
 * @return {{scope:Object, metadata:Object, content:string, filename:string}}
 */
function buildScopeUploadPayload_(scope, recordType) {
  if (!scope || !scope.code) {
    throw new Error('Invalid scope record.');
  }
  const metadata = buildScopeMetadata_(scope, null);
  metadata.scopeEntryId = scope.scopeEntryId || scope.entryId || scope.id || '';
  metadata.vectorDetailIndex = (scope.metadata && scope.metadata.vectorDetailIndex !== undefined && scope.metadata.vectorDetailIndex !== null)
    ? scope.metadata.vectorDetailIndex
    : null;
  const enrichedResources = enrichScopeResources_(scope.resources || []);
  const content = {
    scopeCode: scope.code,
    scopeName: scope.name,
    categoryPath: metadata.categoryPath,
    roleSummary: scope.roleSummary || '',
    resources: enrichedResources,
    totalAED: metadata.totalAED,
    resourceCount: metadata.resourceCount,
    scopeDetails: {
      notes: scope.notes || [],
      scenarioHighlights: scope.scenarioHighlights || [],
      scenarioNotes: scope.scenarioNotes || [],
      quantitySignals: scope.quantitySignals || [],
      usageSummary: scope.usageSummary || {}
    },
    assistantHints: {
      embeddingText: buildScopeEmbeddingText_(scope, enrichedResources)
    }
  };
  if (enrichedResources.length) {
    const seenIdentifiers = new Set();
    const catalogItems = [];
    const catalogLines = [];
    enrichedResources.forEach(function(resource) {
      const sku = resource && resource.code ? String(resource.code).trim() : '';
      if (!sku) {
        return;
      }
      const identifier = sku + '|' + (resource.catalogUnit || '');
      if (seenIdentifiers.has(identifier)) {
        return;
      }
      seenIdentifiers.add(identifier);
      const item = {
        sku: sku,
        name: resource.catalogName || resource.name || scope.name,
        description: resource.catalogDescription || resource.notes || '',
        category: resource.catalogCategory || '',
        unit: resource.catalogUnit || '',
        pricingMode: resource.catalogPricingMode || '',
        hours: resource.hours || 0,
        rate: resource.rate || 0,
        cost: resource.cost || 0
      };
      catalogItems.push(item);
      const parts = ['SKU ' + item.sku];
      if (item.name) {
        parts.push(item.name);
      }
      if (item.description) {
        parts.push(item.description);
      }
      if (item.cost) {
        parts.push('AED ' + formatNumberForEmbedding_(item.cost, 2) + ' total');
      }
      catalogLines.push(parts.join(' · '));
    });
    if (catalogItems.length) {
      content.catalogItems = catalogItems;
      content.catalogSummary = truncateText_(catalogLines.join('; '), 1900);
    }
  }
  return {
    scope: scope,
    recordType: recordType || 'scope',
    metadata: metadata,
    content: content,
    filename: 'scope_' + encodeURIComponent(scope.code) + '.json'
  };
}

/**
 * Upload payloads to the vector store.
 * @param {Array<Object>} payloads
 * @param {string} vectorStoreId
 * @param {string} apiKey
 * @return {{uploadedFileCount:number}}
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function uploadScopePayloadsToVectorStore_(payloads, vectorStoreId, apiKey) {
  const trace = UnifiedLogger.startTrace('ScopeVectorStoreSync', 'uploadScopePayloadsToVectorStore_', {
    payloadsCount: payloads ? payloads.length : 0,
    hasVectorStoreId: !!vectorStoreId
  });
  try {
    if (!payloads || !payloads.length) {
    return { uploadedFileCount: 0, warnings: [] };
  }

  const headers = buildOpenAiHeaders_(apiKey);
  const createdFiles = [];
  const warnings = [];

  payloads.forEach(function(payload) {
    try {
      const fileDescriptor = uploadPayloadFileWithRetry_(payload, headers);
      if (fileDescriptor) {
        createdFiles.push(fileDescriptor);
        Utilities.sleep(500); // small pacing between uploads
      }
    } catch (error) {
      warnings.push('Upload skipped for scope ' + (payload && payload.scope ? payload.scope.code : '?') + ': ' + error);
    }
  });

  if (!createdFiles.length) {
    return { uploadedFileCount: 0, warnings: warnings };
  }

  try {
    // PHASE 2: Rate limit enforcement with operation details
    try {
      enforceRateLimit(SERVICE_OPENAI_VECTOR, {
        operationName: 'uploadFilesToVectorStoreBatch',
        operationDetails: {
          vectorStoreId: vectorStoreId,
          fileCount: createdFiles.length
        }
      });
    } catch (error) {
      if (error.code === 'RATE_LIMIT') {
        UnifiedLogger.warn('VectorSync', 'Rate limit reached for batch upload', {
          vectorStoreId: vectorStoreId,
          fileCount: createdFiles.length,
          resetInSeconds: error.resetTimeSeconds
        });

        const err = new Error(
          'Vector store upload rate limit reached. Please wait ' +
          Math.ceil(error.resetTimeSeconds) + ' seconds and try again.'
        );
        err.code = 'RATE_LIMIT';
        throw err;
      }
      throw error;
    }

    const batchResponse = UrlFetchApp.fetch('https://api.openai.com/v1/vector_stores/' + vectorStoreId + '/file_batches', {
      method: 'post',
      headers: headers,
      contentType: 'application/json',
      payload: JSON.stringify({ files: createdFiles }),
      muteHttpExceptions: true
    });
    const batchStatus = batchResponse.getResponseCode();
    if (batchStatus >= 300) {
      const snippet = truncate(batchResponse.getContentText(), 400);
      warnings.push('Unable to attach files to vector store: ' + batchStatus + ' - ' + snippet);
      return { uploadedFileCount: 0, warnings: warnings };
    }

    const batchRecord = JSON.parse(batchResponse.getContentText());
    try {
      pollVectorStoreFileBatch_(vectorStoreId, batchRecord.id, apiKey);
    } catch (pollError) {
      warnings.push(String(pollError));
    }
  } catch (batchError) {
    warnings.push(String(batchError));
    return { uploadedFileCount: createdFiles.length, warnings: warnings };
  }

  return { uploadedFileCount: createdFiles.length, warnings: warnings };
  } catch (error) {
    trace.fail('uploadScopePayloadsToVectorStore_ failed', error);

    // User-friendly error handling
    showFriendlyError(
      error,
      'Uploading Files to Vector Store',
      {
        correlationId: trace.correlationId
        // Note: Retry may not be appropriate for batch uploads - user should check data
      }
    );

    throw error;
  }
}

/**
 * Poll a vector store file batch until completion.
 * @param {string} vectorStoreId
 * @param {string} batchId
 * @param {string} apiKey
 */
function pollVectorStoreFileBatch_(vectorStoreId, batchId, apiKey) {
  const headers = buildOpenAiHeaders_(apiKey);
  const url = 'https://api.openai.com/v1/vector_stores/' + vectorStoreId + '/file_batches/' + batchId;
  const start = Date.now();
  const timeoutMs = 5 * 60 * 1000;
  let attempts = 0;

  while (true) {
    Utilities.sleep(Math.min(4000, 1500 + attempts * 500));
    attempts++;

    // PHASE 2: Rate limit enforcement (polls can be frequent)
    try {
      enforceRateLimit(SERVICE_OPENAI_VECTOR, {
        operationName: 'pollBatchStatus',
        operationDetails: { batchId: batchId }
      });
    } catch (error) {
      if (error.code === 'RATE_LIMIT') {
        // For polling, log and sleep rather than throwing
        // This allows polling loop to back off naturally
        UnifiedLogger.info('VectorSync', 'Rate limit hit during polling, backing off', {
          batchId: batchId,
          resetInSeconds: error.resetTimeSeconds
        });
        Utilities.sleep(error.resetTimeSeconds * 1000);
        continue;
      }
      throw error;
    }

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    if (status >= 300) {
      const snippet = truncate(response.getContentText(), 400);
      throw new AppError('OPENAI_FILE_BATCH_STATUS_FAILED', 'Unable to poll file batch ' + batchId + ': ' + status + ' - ' + snippet);
    }
    const payload = JSON.parse(response.getContentText());
    if (!payload || !payload.status) {
      throw new AppError('OPENAI_FILE_BATCH_STATUS_FAILED', 'Malformed response while polling file batch ' + batchId + '.');
    }
    if (payload.status === 'completed') {
      return;
    }
    if (payload.status === 'failed' || payload.status === 'cancelled') {
      throw new AppError('OPENAI_FILE_BATCH_' + payload.status.toUpperCase(), 'File batch ' + batchId + ' ended with status ' + payload.status + '.');
    }
    if (Date.now() - start > timeoutMs) {
      throw new AppError('OPENAI_FILE_BATCH_TIMEOUT', 'File batch ' + batchId + ' did not complete within ' + Math.round(timeoutMs / 1000) + ' seconds.');
    }
  }
}

/**
 * Delete a vector store file by id.
 * @param {string} vectorStoreId
 * @param {string} fileId
 * @param {string} apiKey
 */
function deleteVectorStoreFile_(vectorStoreId, fileId, apiKey) {
  const headers = buildOpenAiHeaders_(apiKey);

  // PHASE 2: Rate limit enforcement
  enforceRateLimit(SERVICE_OPENAI_VECTOR, {
    operationName: 'deleteVectorStoreFile',
    operationDetails: { vectorStoreId: vectorStoreId, fileId: fileId }
  });

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/vector_stores/' + vectorStoreId + '/files/' + fileId, {
    method: 'delete',
    headers: headers,
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status >= 300) {
    const snippet = truncate(response.getContentText(), 400);
    throw new AppError('OPENAI_FILE_DELETE_FAILED', 'Unable to delete file ' + fileId + ': ' + status + ' - ' + snippet);
  }
}

/**
 * Build an index of existing scope files in the vector store.
 * @param {string} vectorStoreId
 * @param {string} apiKey
 * @return {Object<string,{fileId:string,scopeCode:string,checksum:string}>}
 */
function indexExistingScopeFiles_(vectorStoreId, apiKey) {
  const headers = buildOpenAiHeaders_(apiKey);
  const map = {};
  let after = null;
  let iterations = 0;

  do {
    const query = ['limit=100', 'filter=completed'];
    if (after) {
      query.push('after=' + encodeURIComponent(after));
    }
    const url = 'https://api.openai.com/v1/vector_stores/' + vectorStoreId + '/files?' + query.join('&');

    // PHASE 2: Rate limit enforcement
    enforceRateLimit(SERVICE_OPENAI_VECTOR, {
      operationName: 'listVectorStoreFiles',
      operationDetails: { vectorStoreId: vectorStoreId }
    });

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    if (status >= 300) {
      const snippet = truncate(response.getContentText(), 400);
      throw new AppError('OPENAI_FILE_LIST_FAILED', 'Unable to list vector store files: ' + status + ' - ' + snippet);
    }
    const body = JSON.parse(response.getContentText());
    const files = Array.isArray(body && body.data) ? body.data : [];
    for (let i = 0; i < files.length; i++) {
      const fileId = files[i] && files[i].id;
      if (!fileId) {
        continue;
      }
      let scopeCode = '';
      let checksum = '';
      const vectorDetails = fetchVectorStoreFileDetails_(vectorStoreId, fileId, headers);
      if (vectorDetails && vectorDetails.attributes) {
        scopeCode = vectorDetails.attributes.scope_code || vectorDetails.attributes.scopeCode || '';
        checksum = vectorDetails.attributes.checksum || '';
      }
      if (!scopeCode) {
        const baseFile = fetchOpenAiFileMetadata_(fileId, apiKey);
        if (baseFile && baseFile.filename) {
          const match = baseFile.filename.match(/^scope_(.+)\.json$/i);
          if (match && match[1]) {
            try {
              scopeCode = decodeURIComponent(match[1]);
            } catch (decodeError) {
              scopeCode = match[1];
            }
          }
        }
      }
      if (!scopeCode) {
        continue;
      }
      map[scopeCode] = {
        fileId: fileId,
        scopeCode: scopeCode,
        checksum: checksum || ''
      };
    }
    after = body && body.has_more ? body.last_id : null;
    iterations++;
  } while (after && iterations < 50);

  return map;
}

/**
 * Fetch metadata for an uploaded OpenAI file.
 * @param {string} fileId
 * @param {string} apiKey
 * @return {Object}
 */
function fetchOpenAiFileMetadata_(fileId, apiKey) {
  const headers = buildOpenAiHeaders_(apiKey);

  // PHASE 2: Rate limit enforcement
  enforceRateLimit(SERVICE_OPENAI_VECTOR, {
    operationName: 'fetchOpenAiFileMetadata',
    operationDetails: { fileId: fileId }
  });

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/files/' + fileId, {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status >= 300) {
    const snippet = truncate(response.getContentText(), 400);
    catchAndLog(function() {
      UnifiedLogger.warn('ScopeVectorStoreSync', 'Unable to fetch file metadata', { fileId: fileId, status: status, snippet: snippet });
    }, 'ScopeVectorStoreSync');
    return null;
  }
  return JSON.parse(response.getContentText());
}

/**
 * Build standard OpenAI headers for UrlFetch requests.
 * @param {string} apiKey
 * @return {Object}
 */
function buildOpenAiHeaders_(apiKey) {
  return {
    Authorization: 'Bearer ' + apiKey
  };
}

function uploadPayloadFileWithRetry_(payload, headers) {
  const maxAttempts = 3;
  let attempt = 0;
  let lastError = null;
  const jsonString = payload.serializedContent || JSON.stringify(payload.content);
  const blob = Utilities.newBlob(jsonString, 'application/json', payload.filename);
  const fileAttributes = buildVectorFileAttributes_(payload);
  if (blob.getBytes().length > 500 * 1024) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Payload for scope ' + payload.scope.code + ' exceeds 500KB.');
  }
  while (attempt < maxAttempts) {
    attempt++;
    try {
      // PHASE 2: Rate limit enforcement
      enforceRateLimit(SERVICE_OPENAI_VECTOR, {
        operationName: 'uploadFileToOpenAi',
        operationDetails: {
          fileName: blob.getName(),
          fileSize: blob.getBytes().length
        }
      });

      const response = UrlFetchApp.fetch('https://api.openai.com/v1/files', {
        method: 'post',
        headers: headers,
        payload: {
          purpose: 'assistants',
          file: blob
        },
        muteHttpExceptions: true
      });
      const status = response.getResponseCode();
      if (status >= 300) {
        const snippet = truncate(response.getContentText(), 400);
        lastError = new AppError('OPENAI_FILE_UPLOAD_FAILED', 'Unable to create file for scope ' + payload.scope.code + ' (attempt ' + attempt + '): ' + status + ' - ' + snippet);
        if (status >= 500 || status === 429) {
          Utilities.sleep(1000 * attempt);
          continue;
        }
        throw lastError;
      }
      const fileRecord = JSON.parse(response.getContentText());
      return {
        file_id: fileRecord.id,
        attributes: fileAttributes
      };
    } catch (error) {
      lastError = error;
      Utilities.sleep(1000 * attempt);
    }
  }
  throw lastError || new AppError('OPENAI_FILE_UPLOAD_FAILED', 'Failed to upload scope ' + payload.scope.code + ' after ' + maxAttempts + ' attempts.');
}

/**
 * Build attribute map for vector store file uploads.
 * @param {{scope:Object, metadata:Object, content:Object, checksum:string}} payload
 * @return {Object}
 */
function buildVectorFileAttributes_(payload) {
  const attrs = {
    scope_code: payload && payload.scope ? payload.scope.code : '',
    scope_name: payload && payload.scope ? truncateAttributeValue_(payload.scope.name, 512) : '',
    checksum: payload && payload.checksum ? payload.checksum : '',
    record_type: payload && payload.recordType ? payload.recordType : 'scope'
  };
  const total = payload && payload.metadata && payload.metadata.totalAED !== undefined
    ? Number(payload.metadata.totalAED)
    : (payload && payload.scope && payload.scope.total !== undefined ? Number(payload.scope.total) : null);
  if (!isNaN(total) && total !== null) {
    attrs.total_aed = total;
  }
  const resourceCount = payload && payload.metadata && payload.metadata.resourceCount !== undefined
    ? Number(payload.metadata.resourceCount)
    : (payload && payload.scope && Array.isArray(payload.scope.resources) ? payload.scope.resources.length : null);
  if (!isNaN(resourceCount) && resourceCount !== null) {
    attrs.resource_count = resourceCount;
  }
  const categoryPath = payload && payload.metadata && payload.metadata.categoryPath;
  if (categoryPath) {
    attrs.category_path = truncateAttributeValue_(categoryPath, 512);
  }
  const description = payload && payload.metadata && payload.metadata.description
    ? payload.metadata.description
    : null;
  if (description) {
    attrs.description = truncateAttributeValue_(description, 512);
  } else if (payload && payload.scope && Array.isArray(payload.scope.notes) && payload.scope.notes.length) {
    attrs.description = truncateAttributeValue_(payload.scope.notes.join('; '), 512);
  }
  return attrs;
}

function computePayloadChecksum_(serializedContent) {
  if (!serializedContent) {
    return '';
  }
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, serializedContent, Utilities.Charset.UTF_8);
  return digest.map(function(byte) {
    const value = (byte + 256) % 256;
  return (value < 16 ? '0' : '') + value.toString(16);
  }).join('');
}

/**
 * Truncate attribute values safely for vector store metadata.
 * @param {*} value
 * @param {number=} limit
 * @return {string}
 */
function truncateAttributeValue_(value, limit) {
  const max = typeof limit === 'number' && limit > 0 ? limit : 512;
  if (value === undefined || value === null) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.length <= max) {
    return stringValue;
  }
  return stringValue.substring(0, max);
}

function fetchVectorStoreFileDetails_(vectorStoreId, fileId, headers) {
  try {
    // PHASE 2: Rate limit enforcement
    enforceRateLimit(SERVICE_OPENAI_VECTOR, {
      operationName: 'fetchVectorStoreFileDetails',
      operationDetails: {
        vectorStoreId: vectorStoreId,
        vectorFileId: fileId
      }
    });

    const response = UrlFetchApp.fetch('https://api.openai.com/v1/vector_stores/' + vectorStoreId + '/files/' + fileId, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    if (status >= 300) {
      return null;
    }
    return JSON.parse(response.getContentText());
  } catch (error) {
    catchAndLog(function() {
      UnifiedLogger.warn('ScopeVectorStoreSync', 'Unable to fetch vector store file details', { fileId: fileId, error: String(error) });
    }, 'ScopeVectorStoreSync');
    return null;
  }
}

/**
 * Resolve the OpenAI Vector Store ID from Script Properties.
 * Uses execution-scoped caching to prevent redundant property reads.
 * Cache is cleared when clearConfigCache() is called.
 * @returns {string} Vector Store ID
 * @throws {AppError} If Vector Store ID is missing
 */
var vectorStoreIdCache_ = null;

function resolveVectorStoreId_() {
  // Check execution-scoped cache (defensive check for file load order)
  if (typeof vectorStoreIdCache_ !== 'undefined' && vectorStoreIdCache_) {
    return vectorStoreIdCache_;
  }

  // Cache miss - read from Script Properties
  const value = typeof getScriptProperty === 'function' ? getScriptProperty('OPENAI_VECTOR_STORE_ID') : null;
  if (value && String(value).trim()) {
    const trimmed = String(value).trim();

    // Cache the value for this execution
    vectorStoreIdCache_ = trimmed;

    // Log when building cache for this execution context
    catchAndLog(function() {
      UnifiedLogger.info('VectorStore', 'resolveVectorStoreId', { value: trimmed, cached: true });
    }, 'ScopeVectorStoreSync');
    return trimmed;
  }
  throw new AppError('OPENAI_CONFIG', 'Vector Store ID missing');
}

function resolvePromptId_() {
  function normalize(value) {
    return value && String(value).trim() ? String(value).trim() : '';
  }
  function isPromptId(value) {
    return /^pmpt_[a-zA-Z0-9]+$/.test(String(value || '').trim());
  }
  if (typeof getScriptProperty === 'function') {
    const propertyPrompt = getScriptProperty('OPENAI_PROMPT_ID');
    if (normalize(propertyPrompt) && isPromptId(propertyPrompt)) {
      return normalize(propertyPrompt);
    }
  }
  // Backwards compatibility with legacy assistant IDs stored in script properties.
  if (typeof getScriptProperty === 'function') {
    const legacyProperty = getScriptProperty('OPENAI_ASSISTANT_ID');
    if (normalize(legacyProperty) && isPromptId(legacyProperty)) {
      return normalize(legacyProperty);
    }
  }
  return '';
}

/**
 * Fetch a required script property or config value for the OpenAI API key.
 * @return {string}
 */
function getOpenAiApiKey_() {
  return requireSecret('OPENAI_API_KEY');
}

/**
 * Collect Scope Buildup entries grouped by ScopeCode.
 * @param {number|null} limit optional limit for testing
 * @return {Array<Object>} grouped scope records
 */
function collectScopeBuildupEntries_(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new AppError('SHEET_ACCESS', 'No active spreadsheet available.');
  }
  const sheetName = NORMALIZE_CONFIG && NORMALIZE_CONFIG.SOURCE_TABS ? NORMALIZE_CONFIG.SOURCE_TABS.SCOPES : 'Scope Buildups';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new AppError('SHEET_MISSING', 'Scope Buildups sheet not found.');
  }
  if (sheet.getLastRow() <= 1) {
    return [];
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const scopeMap = {};

  values.forEach(function(row) {
    const rawCode = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.CODE];
    const scopeCode = rawCode ? String(rawCode).trim() : '';
    if (!scopeCode) {
      return;
    }

    const scopeName = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.NAME] ? String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.NAME]).trim() : '';
    if (!scopeMap[scopeCode]) {
      scopeMap[scopeCode] = {
        code: scopeCode,
        name: scopeName,
        category: typeof getScopeCategoryFromCode === 'function' ? getScopeCategoryFromCode(scopeCode) : '',
        resources: [],
        total: 0,
        totalDetected: false
      };
    }

    const resourceCode = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_CODE];
    const notes = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.NOTES];
    const lineCost = parseNumericValue_(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.LINE_COST]);

    if ((!resourceCode || String(resourceCode).trim() === '') && notes && String(notes).toUpperCase().indexOf('TOTAL') !== -1) {
      scopeMap[scopeCode].total = lineCost;
      scopeMap[scopeCode].totalDetected = true;
      return;
    }

    const resourceName = row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME] ? String(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.RESOURCE_NAME]).trim() : '';
    if (!resourceCode && !resourceName) {
      return;
    }

    scopeMap[scopeCode].resources.push({
      code: resourceCode ? String(resourceCode).trim() : '',
      name: resourceName,
      hours: parseNumericValue_(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOURS]),
      rate: parseNumericValue_(row[NORMALIZE_CONFIG.SCOPE_COLUMNS.HOUR_RATE]),
      cost: lineCost,
      notes: notes ? String(notes).trim() : ''
    });
  });

  const scopes = Object.keys(scopeMap).map(function(code) {
    const record = scopeMap[code];
    if (!record.totalDetected) {
      const sum = record.resources.reduce(function(acc, resource) {
        return acc + (resource.cost || 0);
      }, 0);
      record.total = sum ? Number(sum) : 0;
    }

    record.resources = record.resources.filter(function(resource) {
      return !!resource.name;
    });

    const uniqueRoles = [];
    record.resources.forEach(function(resource) {
      if (resource.name && uniqueRoles.indexOf(resource.name) === -1) {
        uniqueRoles.push(resource.name);
      }
    });
    record.roleSummary = uniqueRoles.slice(0, 4).join(', ');

    return record;
  }).filter(function(record) {
    return record.resources.length > 0;
  }).sort(function(a, b) {
    return a.code.localeCompare(b.code);
  });

  if (limit && limit > 0) {
    return scopes.slice(0, limit);
  }
  return scopes;
}

/**
 * Collect resource rate entries and convert to scope-like records.
 * @param {number|null} limit
 * @return {Array<Object>}
 */
function collectResourceRateEntries_(limit) {
  if (typeof loadResourceCatalog !== 'function') {
    return [];
  }
  const rawCatalog = loadResourceCatalog();
  const catalog = typeof unwrapConfigResult === 'function'
    ? unwrapConfigResult(rawCatalog, { fallbackValue: { list: [], byCode: {} }, configName: 'resourceCatalog', logErrors: true })
    : rawCatalog;
  const list = catalog && Array.isArray(catalog.list)
    ? catalog.list
    : (Array.isArray(catalog) ? catalog : []);
  const items = list.map(function(entry) {
    if (!entry || !entry.code) {
      return null;
    }
    const code = String(entry.code).trim();
    if (!code) {
      return null;
    }
    const name = entry.name || code;
    const unit = entry.unit || '';
    const rate = typeof entry.rate === 'number' ? entry.rate : parseFloat(entry.rate) || 0;
    const category = entry.category || 'Resource Catalog';
    const notes = category + (entry.source ? ' | ' + entry.source : '');
    return {
      code: code,
      name: name,
      category: category,
      resources: [{
        code: code,
        name: name,
        category: category,
        unit: unit,
        hours: null,
        rate: rate,
        cost: null,
        notes: notes
      }],
      total: rate,
      totalDetected: true,
      roleSummary: name
    };
  }).filter(Boolean);
  if (limit && limit > 0) {
    return items.slice(0, limit);
  }
  return items;
}

/**
 * Chunk an array into fixed-size pieces.
 * @param {Array} items
 * @param {number} size
 * @return {Array<Array>}
 */
function chunkArray_(items, size) {
  const chunks = [];
  if (!items || items.length === 0 || !size || size <= 0) {
    return chunks;
  }
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Build embedding text (assistant hint) for the scope.
 * @param {Object} scope scope record
 * @param {Array<Object>=} resources enriched resources
 * @return {string} embedding text
 */
function buildScopeEmbeddingText_(scope, resources) {
  const parts = [];
  parts.push('Scope ' + scope.code + ': ' + scope.name);
  if (scope.category) {
    parts.push('Category: ' + scope.category);
  }
  if (scope.roleSummary) {
    parts.push('Key roles: ' + scope.roleSummary);
  }
  if (scope.total) {
    parts.push('Total cost AED ' + formatNumberForEmbedding_(scope.total));
  }
  if (Array.isArray(scope.notes) && scope.notes.length) {
    parts.push('Scope notes: ' + scope.notes.map(String).join('; '));
  }
  if (Array.isArray(scope.scenarioHighlights) && scope.scenarioHighlights.length) {
    parts.push('Scenario highlights: ' + scope.scenarioHighlights.map(String).join('; '));
  }
  if (scope.usageSummary) {
    if (scope.usageSummary.durationMonths) {
      parts.push('Usage duration: ' + scope.usageSummary.durationMonths + ' months');
    }
    if (scope.usageSummary.region) {
      parts.push('Usage region: ' + scope.usageSummary.region);
    }
    if (Array.isArray(scope.usageSummary.notes) && scope.usageSummary.notes.length) {
      parts.push('Usage notes: ' + scope.usageSummary.notes.map(String).join('; '));
    }
  }
  if (Array.isArray(scope.scenarioNotes) && scope.scenarioNotes.length) {
    parts.push('Scenario notes: ' + scope.scenarioNotes.map(String).join('; '));
  }
  if (Array.isArray(scope.quantitySignals) && scope.quantitySignals.length) {
    const signalDescriptions = scope.quantitySignals.map(function(signal) {
      const segments = [];
      if (signal.label) {
        segments.push(signal.label);
      } else if (signal.type) {
        segments.push(signal.type);
      }
      if (signal.value !== undefined && signal.value !== null) {
        segments.push(String(signal.value));
      }
      if (signal.unit) {
        segments.push(signal.unit);
      }
      return segments.join(' ');
    }).filter(Boolean);
    if (signalDescriptions.length) {
      parts.push('Quantity signals: ' + signalDescriptions.join('; '));
    }
  }

  const resourceList = Array.isArray(resources) ? resources : (scope.resources || []);
  const resourceLines = [];
  const maxResourceLines = 12;
  for (let i = 0; i < resourceList.length && i < maxResourceLines; i++) {
    const resource = resourceList[i];
    const segments = [];
    if (resource.name) {
      segments.push(resource.name);
    }
    if (resource.code) {
      segments.push('[' + resource.code + ']');
    }
    if (resource.catalogName && resource.catalogName !== resource.name) {
      segments.push('Catalog name: ' + resource.catalogName);
    }
    if (resource.catalogDescription) {
      segments.push(resource.catalogDescription);
    }
    if (resource.catalogCategory) {
      segments.push('Catalog category: ' + resource.catalogCategory);
    }
    if (resource.catalogUnit) {
      segments.push('Unit: ' + resource.catalogUnit);
    }
    if (resource.hours) {
      segments.push(formatNumberForEmbedding_(resource.hours, 2) + ' hours');
    }
    if (resource.rate) {
      segments.push('AED ' + formatNumberForEmbedding_(resource.rate, 2) + ' per hour');
    }
    if (resource.cost) {
      segments.push('Cost AED ' + formatNumberForEmbedding_(resource.cost, 2));
    }
    if (resource.notes && resource.notes.toUpperCase().indexOf('TOTAL') === -1) {
      segments.push(resource.notes);
    }
    resourceLines.push(segments.join(' | '));
  }

  if (resourceLines.length > 0) {
    parts.push('Resources: ' + resourceLines.join('; '));
  }
  if (resourceList.length > maxResourceLines) {
    parts.push('Additional roles: ' + (resourceList.length - maxResourceLines) + ' more entries not listed.');
  }

  const entryIdentifier = scope.scopeEntryId || scope.entryId || scope.id || scope.code || '';
  if (entryIdentifier) {
    const sanitizedEntryId = String(entryIdentifier).replace(/[^\x00-\x7F]/g, '');
    if (sanitizedEntryId) {
      parts.push('EntryID: ' + sanitizedEntryId);
    }
  }

  return truncateText_(parts.join('. '), 1900);
}

/**
 * Enrich scope resources with catalog metadata for embeddings.
 * @param {Array<Object>} resources
 * @return {Array<Object>}
 */
function enrichScopeResources_(resources) {
  if (!Array.isArray(resources) || resources.length === 0) {
    return [];
  }
  const canLookup = typeof lookupCrewResource === 'function' || typeof lookupItem === 'function';
  return resources.map(function(resource) {
    const catalog = canLookup && resource && resource.code
      ? (typeof lookupCrewResource === 'function' ? lookupCrewResource(resource.code) : lookupItem(resource.code))
      : null;
    const description = catalog && catalog.description ? String(catalog.description).trim() : '';
    const descriptionFallback = resource && resource.notes ? String(resource.notes).trim() : '';
    const finalDescription = description || descriptionFallback;
    return {
      code: resource.code || '',
      name: resource.name || '',
      hours: resource.hours || 0,
      rate: resource.rate || 0,
      cost: resource.cost || 0,
      notes: resource.notes || '',
      catalogName: catalog && catalog.name ? String(catalog.name) : String(resource.name || ''),
      catalogDescription: finalDescription,
      catalogCategory: catalog && catalog.category ? String(catalog.category) : String(resource.category || ''),
      catalogUnit: catalog && catalog.unit ? String(catalog.unit) : String(resource.unit || ''),
      catalogPricingMode: catalog && catalog.pricingMode ? String(catalog.pricingMode) : ''
    };
  });
}

/**
 * Build per-SKU catalog items for the vector store payload.
 * @param {Object} scope
 * @param {Array<Object>} enrichedResources
 * @return {Array<Object>}
 */
/**
 * Build compact metadata for scope payloads.
 * @param {Object} scope
 * @param {string|null} embeddingText unused legacy param for compatibility
 * @return {Object} metadata object
 */
function buildScopeMetadata_(scope, embeddingText) {
  const description = scope.roleSummary ? scope.name + ' delivered by ' + scope.roleSummary : scope.name;
  const categoryPath = scope.category ? 'Scope > ' + scope.category + ' > ' + scope.name : scope.name;
  const metadata = {
    itemCode: scope.code,
    scopeName: scope.name,
    categoryPath: categoryPath,
    description: description,
    totalAED: Number(scope.total || 0),
    resourceCount: scope.resources.length,
    source: 'scope_buildups'
  };
  if (Array.isArray(scope.notes) && scope.notes.length) {
    metadata.notes = scope.notes;
  }
  if (Array.isArray(scope.scenarioNotes) && scope.scenarioNotes.length) {
    metadata.scenarioNotes = scope.scenarioNotes;
  }
  if (Array.isArray(scope.scenarioHighlights) && scope.scenarioHighlights.length) {
    metadata.scenarioHighlights = scope.scenarioHighlights;
  }
  if (scope.usageSummary) {
    metadata.usageSummary = scope.usageSummary;
  }
  if (Array.isArray(scope.quantitySignals) && scope.quantitySignals.length) {
    metadata.quantitySignals = scope.quantitySignals;
  }
  return metadata;
}

/**
 * Helper to truncate text for embeddings/metadata.
 * @param {string} text
 * @param {number} limit
 * @return {string}
 */
function truncateText_(text, limit) {
  if (!text || !limit || limit <= 0) {
    return '';
  }
  const output = String(text);
  if (output.length <= limit) {
    return output;
  }
  return output.substring(0, limit - 3) + '...';
}

/**
 * Format numbers for embedding/metadata usage.
 * @param {number|string} value
 * @param {number} decimals
 * @return {string}
 */
function formatNumberForEmbedding_(value, decimals) {
  const numeric = Number(value || 0);
  const digits = typeof decimals === 'number' ? decimals : 0;
  return numeric.toFixed(digits);
}

/**
 * Parse a numeric cell value safely.
 * @param {*} value
 * @return {number}
 */
function parseNumericValue_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const numeric = Number(value);
  if (isNaN(numeric)) {
    return 0;
  }
  return numeric;
}

function computeCatalogContentHash_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return '';
    const sheets = [
      NORMALIZE_CONFIG.SOURCE_TABS.SCOPES,
      NORMALIZE_CONFIG.SOURCE_TABS.CREW,
      NORMALIZE_CONFIG.SOURCE_TABS.RESOURCES
    ];
    let combinedData = '';
    sheets.forEach(function(name) {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        const lastRow = sheet.getLastRow();
        const lastCol = sheet.getLastColumn();
        if (lastRow > 1 && lastCol > 0) {
          const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
          combinedData += JSON.stringify(values);
        }
      }
    });
    if (!combinedData) return '';
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, combinedData);
    return digest.map(function(byte) {
      const v = (byte < 0 ? byte + 256 : byte);
      return v.toString(16).padStart(2, '0');
    }).join('');
  } catch (e) {
    catchAndLog(function() {
      UnifiedLogger.warn('ScopeVectorStoreSync', 'computeCatalogContentHash_ error', String(e));
    }, 'ScopeVectorStoreSync');
    return '';
  }
}

function saveVectorStoreSyncState_() {
  try {
    const hash = computeCatalogContentHash_();
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    const timestamp = new Date().toISOString();
    if (props) {
      props.setProperty(VECTOR_STORE_HASH_PROP, hash);
      props.setProperty(VECTOR_STORE_HASH_PROP + '_TS', timestamp);
    }
  } catch (e) {
    catchAndLog(function() {
      UnifiedLogger.warn('ScopeVectorStoreSync', 'saveVectorStoreSyncState_ error', String(e));
    }, 'ScopeVectorStoreSync');
  }
}

function getVectorStoreSyncStatus() {
  try {
    const storedHash = getScriptProperty(VECTOR_STORE_HASH_PROP);
    const lastSync = getScriptProperty(VECTOR_STORE_HASH_PROP + '_TS') || getScriptProperty('VECTOR_STORE_LAST_SYNC');
    const lastNorm = getScriptProperty('CATALOG_LAST_UPDATED');
    const currentHash = computeCatalogContentHash_();

    let stale = storedHash && currentHash && storedHash !== currentHash;
    if (!stale && lastNorm && lastSync) {
      stale = new Date(lastNorm) > new Date(lastSync);
    }

    return {
      stale: !!stale,
      lastSync: lastSync || '',
      hasHash: !!storedHash
    };
  } catch (e) {
    catchAndLog(function() {
      UnifiedLogger.warn('ScopeVectorStoreSync', 'getVectorStoreSyncStatus error', String(e));
    }, 'ScopeVectorStoreSync');
    return { stale: false, error: true };
  }
}

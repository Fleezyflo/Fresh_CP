/**
 * Vector Search Diagnostics Tool
 *
 * Purpose: Diagnose and debug vector search errors
 * Use Case: When vector search returns errorCount > 0, use this to identify the root cause
 *
 * Created: 2026-01-12 (ISS-001: Vector Search Errors During Commercial Fit Refresh)
 */

/**
 * Run comprehensive vector search diagnostics
 *
 * Tests vector search configuration, connectivity, and error patterns
 *
 * @returns {Object} Complete diagnostic report
 *
 * @example
 * diagnoseVectorSearch();
 */
function diagnoseVectorSearch() {
  const report = {
    timestamp: new Date().toISOString(),
    checks: {},
    errors: [],
    warnings: [],
    recommendations: []
  };

  Logger.log('=== Vector Search Diagnostics ===');
  Logger.log('Starting diagnostic checks...\n');

  // Check 1: Script Properties Configuration
  Logger.log('Check 1: Script Properties Configuration');
  try {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('OPENAI_API_KEY');
    const vectorStoreId = props.getProperty('OPENAI_VECTOR_STORE_ID');

    report.checks.scriptProperties = {
      status: 'CHECKED',
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      hasVectorStoreId: !!vectorStoreId,
      vectorStoreId: vectorStoreId ? vectorStoreId : 'NOT_SET',
      vectorStoreIdFormat: vectorStoreId ? (vectorStoreId.startsWith('vs_') ? 'VALID' : 'INVALID') : 'NOT_SET'
    };

    if (!apiKey) {
      report.errors.push('OPENAI_API_KEY is not set in Script Properties');
      Logger.log('  ❌ OPENAI_API_KEY: NOT SET');
    } else {
      Logger.log('  ✅ OPENAI_API_KEY: SET (length: ' + apiKey.length + ')');
    }

    if (!vectorStoreId) {
      report.errors.push('OPENAI_VECTOR_STORE_ID is not set in Script Properties');
      Logger.log('  ❌ OPENAI_VECTOR_STORE_ID: NOT SET');
    } else if (!vectorStoreId.startsWith('vs_')) {
      report.errors.push('OPENAI_VECTOR_STORE_ID has invalid format (should start with vs_)');
      Logger.log('  ❌ OPENAI_VECTOR_STORE_ID: INVALID FORMAT (' + vectorStoreId.substring(0, 20) + '...)');
    } else {
      Logger.log('  ✅ OPENAI_VECTOR_STORE_ID: ' + vectorStoreId.substring(0, 30) + '...');
    }

  } catch (error) {
    report.checks.scriptProperties = { status: 'FAILED', error: String(error) };
    report.errors.push('Failed to check Script Properties: ' + error);
    Logger.log('  ❌ Check failed: ' + error);
  }

  Logger.log('');

  // Check 2: Vector Store API Connectivity
  Logger.log('Check 2: Vector Store API Connectivity');
  try {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('OPENAI_API_KEY');
    const vectorStoreId = props.getProperty('OPENAI_VECTOR_STORE_ID');

    if (!apiKey || !vectorStoreId) {
      report.checks.apiConnectivity = {
        status: 'SKIPPED',
        reason: 'Missing configuration'
      };
      Logger.log('  ⚠️ Skipped (missing configuration)');
    } else {
      // Test API connectivity by fetching vector store metadata
      const url = 'https://api.openai.com/v1/vector_stores/' + vectorStoreId;
      const headers = {
        'Authorization': 'Bearer ' + apiKey,
        'OpenAI-Beta': 'assistants=v2'
      };

      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: headers,
        muteHttpExceptions: true
      });

      const status = response.getResponseCode();
      const body = response.getContentText();

      report.checks.apiConnectivity = {
        status: status < 300 ? 'SUCCESS' : 'FAILED',
        httpStatus: status,
        responsePreview: body.substring(0, 200)
      };

      if (status === 200) {
        const data = JSON.parse(body);
        Logger.log('  ✅ Vector Store found: ' + (data.name || data.id));
        Logger.log('     File count: ' + (data.file_counts ? data.file_counts.total : 'unknown'));
        Logger.log('     Status: ' + (data.status || 'unknown'));

        report.checks.vectorStoreMetadata = {
          id: data.id,
          name: data.name || 'unnamed',
          status: data.status,
          fileCounts: data.file_counts,
          createdAt: data.created_at
        };

        if (data.status !== 'completed') {
          report.warnings.push('Vector Store status is "' + data.status + '" (expected "completed")');
        }

      } else if (status === 404) {
        report.errors.push('Vector Store not found (404) - ID may be incorrect or deleted');
        Logger.log('  ❌ Vector Store not found (404)');
        report.recommendations.push('Check if Vector Store ID is correct. You may need to create a new vector store or use a different ID.');
      } else if (status === 401) {
        report.errors.push('Authentication failed (401) - API key may be invalid');
        Logger.log('  ❌ Authentication failed (401)');
        report.recommendations.push('Verify OPENAI_API_KEY is correct and has not expired.');
      } else {
        report.errors.push('API request failed with status ' + status);
        Logger.log('  ❌ API request failed: ' + status);
        Logger.log('     Response: ' + body.substring(0, 200));
      }
    }

  } catch (error) {
    report.checks.apiConnectivity = { status: 'ERROR', error: String(error) };
    report.errors.push('API connectivity check failed: ' + error);
    Logger.log('  ❌ Check failed: ' + error);
  }

  Logger.log('');

  // Check 3: Vector Search Function Availability
  Logger.log('Check 3: Vector Search Function Availability');
  try {
    const functions = {
      searchVectorStoreScopes_: typeof searchVectorStoreScopes_ === 'function',
      vectorSearchScopeEntries_: typeof vectorSearchScopeEntries_ === 'function',
      resolveVectorStoreId_: typeof resolveVectorStoreId_ === 'function',
      buildScopeVectorQuery_: typeof buildScopeVectorQuery_ === 'function',
      normalizeVectorStoreSearchResponse_: typeof normalizeVectorStoreSearchResponse_ === 'function'
    };

    report.checks.functionAvailability = functions;

    Object.keys(functions).forEach(function(fn) {
      const available = functions[fn];
      if (available) {
        Logger.log('  ✅ ' + fn + ' is available');
      } else {
        Logger.log('  ❌ ' + fn + ' is NOT available');
        report.errors.push('Required function ' + fn + ' is not available');
      }
    });

  } catch (error) {
    report.checks.functionAvailability = { status: 'ERROR', error: String(error) };
    report.errors.push('Function availability check failed: ' + error);
    Logger.log('  ❌ Check failed: ' + error);
  }

  Logger.log('');

  // Check 4: Test Vector Search Query
  Logger.log('Check 4: Test Vector Search Query');
  try {
    if (typeof searchVectorStoreScopes_ === 'function' && report.checks.apiConnectivity && report.checks.apiConnectivity.status === 'SUCCESS') {

      const testQuery = 'content creation services';
      Logger.log('  Testing query: "' + testQuery + '"');

      const searchResult = searchVectorStoreScopes_(testQuery, {
        limit: 3,
        minScore: 0.1
      });

      report.checks.testSearch = {
        status: 'SUCCESS',
        query: testQuery,
        hitCount: searchResult.hits ? searchResult.hits.length : 0,
        rawHitCount: searchResult.raw && searchResult.raw.data ? searchResult.raw.data.length : 0
      };

      Logger.log('  ✅ Search succeeded');
      Logger.log('     Hits returned: ' + report.checks.testSearch.hitCount);
      Logger.log('     Raw hits: ' + report.checks.testSearch.rawHitCount);

      if (report.checks.testSearch.hitCount === 0) {
        report.warnings.push('Test search returned 0 hits - vector store may be empty or not indexed');
      }

      if (searchResult.hits && searchResult.hits.length > 0) {
        const topHit = searchResult.hits[0];
        Logger.log('     Top hit: ' + (topHit.scopeCode || 'unknown') + ' (score: ' + (topHit.score || 0).toFixed(3) + ')');
        report.checks.testSearch.topHit = {
          scopeCode: topHit.scopeCode,
          score: topHit.score,
          scopeName: topHit.scopeName
        };
      }

    } else {
      report.checks.testSearch = {
        status: 'SKIPPED',
        reason: 'Prerequisites not met (missing functions or API connectivity failed)'
      };
      Logger.log('  ⚠️ Skipped (prerequisites not met)');
    }

  } catch (error) {
    report.checks.testSearch = { status: 'FAILED', error: String(error) };
    report.errors.push('Test search failed: ' + error);
    Logger.log('  ❌ Test search failed: ' + error);

    if (error.message && error.message.indexOf('404') !== -1) {
      report.recommendations.push('Vector Store returned 404 - may need to be recreated or re-synced');
    }
  }

  Logger.log('');

  // Check 5: Catalog Validation
  Logger.log('Check 5: Catalog Validation');
  try {
    if (typeof loadScopeCatalog === 'function') {
      const catalogResult = loadScopeCatalog();
      const catalogData = (catalogResult && catalogResult.data) ? catalogResult.data : catalogResult;

      if (catalogData && typeof catalogData === 'object') {
        const briefTypes = Object.keys(catalogData);
        let totalEntries = 0;

        briefTypes.forEach(function(briefType) {
          const entries = Array.isArray(catalogData[briefType]) ? catalogData[briefType].length : 0;
          totalEntries += entries;
        });

        report.checks.catalogValidation = {
          status: 'SUCCESS',
          briefTypes: briefTypes.length,
          totalEntries: totalEntries,
          briefTypeList: briefTypes
        };

        Logger.log('  ✅ Catalog loaded successfully');
        Logger.log('     Brief types: ' + briefTypes.length);
        Logger.log('     Total entries: ' + totalEntries);

        if (totalEntries === 0) {
          report.warnings.push('Catalog has 0 entries - may cause SKU validation failures');
        }

      } else {
        report.checks.catalogValidation = {
          status: 'FAILED',
          reason: 'Catalog data is not an object'
        };
        report.warnings.push('Catalog data structure is invalid');
        Logger.log('  ⚠️ Catalog data structure is invalid');
      }

    } else {
      report.checks.catalogValidation = {
        status: 'SKIPPED',
        reason: 'loadScopeCatalog function not available'
      };
      Logger.log('  ⚠️ loadScopeCatalog function not available');
    }

  } catch (error) {
    report.checks.catalogValidation = { status: 'ERROR', error: String(error) };
    report.warnings.push('Catalog validation failed: ' + error);
    Logger.log('  ⚠️ Catalog check failed: ' + error);
  }

  Logger.log('');

  // Generate Final Report
  Logger.log('=== Diagnostic Summary ===');
  Logger.log('Errors: ' + report.errors.length);
  Logger.log('Warnings: ' + report.warnings.length);
  Logger.log('Recommendations: ' + report.recommendations.length);
  Logger.log('');

  if (report.errors.length > 0) {
    Logger.log('ERRORS:');
    report.errors.forEach(function(err, i) {
      Logger.log('  ' + (i + 1) + '. ' + err);
    });
    Logger.log('');
  }

  if (report.warnings.length > 0) {
    Logger.log('WARNINGS:');
    report.warnings.forEach(function(warn, i) {
      Logger.log('  ' + (i + 1) + '. ' + warn);
    });
    Logger.log('');
  }

  if (report.recommendations.length > 0) {
    Logger.log('RECOMMENDATIONS:');
    report.recommendations.forEach(function(rec, i) {
      Logger.log('  ' + (i + 1) + '. ' + rec);
    });
    Logger.log('');
  }

  if (report.errors.length === 0 && report.warnings.length === 0) {
    Logger.log('✅ All checks passed - vector search configuration appears healthy');
  }

  return report;
}

/**
 * Test vector search with specific scope entries
 *
 * Useful for debugging which specific entries are causing errors
 *
 * @param {Array<Object>} entries - Scope entries to test
 * @returns {Object} Test results with error details
 *
 * @example
 * // Test with sample entries
 * const entries = [
 *   { id: 'entry1', deliverables: ['Social media content'] },
 *   { id: 'entry2', scopeLabel: 'Blog posts' }
 * ];
 * testVectorSearchWithEntries(entries);
 */
function testVectorSearchWithEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Entries array is required');
  }

  Logger.log('=== Testing Vector Search with ' + entries.length + ' Entries ===\n');

  const results = {
    totalEntries: entries.length,
    successCount: 0,
    errorCount: 0,
    emptyResultCount: 0,
    details: []
  };

  if (typeof vectorSearchScopeEntries_ !== 'function') {
    Logger.log('❌ vectorSearchScopeEntries_ function not available');
    return { error: 'Function not available' };
  }

  try {
    const searchResult = vectorSearchScopeEntries_(entries, {
      limit: 5,
      minScore: 0.3
    });

    Logger.log('Search complete:');
    Logger.log('  Entry count: ' + Object.keys(searchResult.hitsByEntry).length);
    Logger.log('  Error count: ' + searchResult.errors.length);
    Logger.log('');

    results.errorCount = searchResult.errors.length;

    // Analyze each entry
    entries.forEach(function(entry) {
      const entryId = entry.id || 'unknown';
      const hits = searchResult.hitsByEntry[entryId] || [];
      const hasError = searchResult.errors.some(function(err) {
        return err.entryId === entryId || (err.message && err.message.indexOf(entryId) !== -1);
      });

      const detail = {
        entryId: entryId,
        hitCount: hits.length,
        hasError: hasError,
        errorDetails: hasError ? searchResult.errors.filter(function(err) {
          return err.entryId === entryId || (err.message && err.message.indexOf(entryId) !== -1);
        }) : []
      };

      results.details.push(detail);

      if (hasError) {
        Logger.log('❌ Entry: ' + entryId);
        detail.errorDetails.forEach(function(err) {
          Logger.log('   Error: ' + err.message);
          Logger.log('   Type: ' + err.type);
          if (err.statusCode) {
            Logger.log('   Status: ' + err.statusCode);
          }
        });
      } else if (hits.length === 0) {
        results.emptyResultCount++;
        Logger.log('⚠️ Entry: ' + entryId + ' - No hits found');
      } else {
        results.successCount++;
        Logger.log('✅ Entry: ' + entryId + ' - ' + hits.length + ' hits');
        hits.slice(0, 2).forEach(function(hit) {
          Logger.log('   - ' + (hit.scopeCode || 'unknown') + ' (score: ' + (hit.score || 0).toFixed(3) + ')');
        });
      }
    });

    Logger.log('');
    Logger.log('Summary:');
    Logger.log('  Successful: ' + results.successCount);
    Logger.log('  Empty results: ' + results.emptyResultCount);
    Logger.log('  Errors: ' + results.errorCount);

    return results;

  } catch (error) {
    Logger.log('❌ Test failed: ' + error);
    return {
      error: String(error),
      totalEntries: entries.length
    };
  }
}

/**
 * Quick vector store health check
 *
 * @returns {string} Status: 'HEALTHY', 'WARNING', or 'ERROR'
 *
 * @example
 * const status = quickVectorHealthCheck();
 */
function quickVectorHealthCheck() {
  Logger.log('Running quick health check...\n');

  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('OPENAI_API_KEY');
  const vectorStoreId = props.getProperty('OPENAI_VECTOR_STORE_ID');

  if (!apiKey) {
    Logger.log('❌ OPENAI_API_KEY not set');
    return 'ERROR';
  }

  if (!vectorStoreId || !vectorStoreId.startsWith('vs_')) {
    Logger.log('❌ OPENAI_VECTOR_STORE_ID not set or invalid');
    return 'ERROR';
  }

  // Try a simple API call
  try {
    const url = 'https://api.openai.com/v1/vector_stores/' + vectorStoreId;
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'OpenAI-Beta': 'assistants=v2'
      },
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();

    if (status === 200) {
      Logger.log('✅ Vector Store is accessible and healthy');
      return 'HEALTHY';
    } else if (status === 404) {
      Logger.log('❌ Vector Store not found (404)');
      return 'ERROR';
    } else {
      Logger.log('⚠️ Vector Store returned status ' + status);
      return 'WARNING';
    }

  } catch (error) {
    Logger.log('❌ Health check failed: ' + error);
    return 'ERROR';
  }
}

/* exported diagnoseVectorSearch, testVectorSearchWithEntries, quickVectorHealthCheck */

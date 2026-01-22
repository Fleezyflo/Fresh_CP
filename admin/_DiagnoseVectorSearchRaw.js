/**
 * COMPREHENSIVE Vector Search Diagnostic
 *
 * Shows EXACTLY what queries are sent to vector store and what RAW results come back
 * No LLM processing, no commercial fit, just pure vector search
 */
function diagnoseVectorSearchRaw() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   VECTOR SEARCH RAW DIAGNOSTIC - NO BULLSHIT                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Get the current sidebar state to see what scope entries exist
  let scopeEntries = [];
  try {
    const state = getAIQuoteSidebarState();
    if (state && state.approvedScope && state.approvedScope.scopeEntries) {
      scopeEntries = state.approvedScope.scopeEntries;
      console.log('✅ Found ' + scopeEntries.length + ' scope entries in sidebar state\n');
    } else {
      console.log('❌ No scope entries found in sidebar state');
      console.log('   Run scope extraction first, then run this diagnostic\n');
      return;
    }
  } catch (error) {
    console.log('❌ Failed to get sidebar state: ' + error.message);
    return;
  }

  // Test each scope entry's vector search
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('TESTING VECTOR SEARCH FOR EACH SCOPE ENTRY:\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (let i = 0; i < Math.min(scopeEntries.length, 5); i++) {
    const entry = scopeEntries[i];

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Entry ' + (i + 1) + ': ' + entry.id);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ Label: ' + entry.scopeLabel);
    console.log('│ Canonical: ' + entry.canonical);
    console.log('│ Section: ' + entry.sectionId);
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    // Find what query is being built for this entry
    console.log('🔍 QUERY CONSTRUCTION:');

    try {
      // This is what the system does - build a search query from the entry
      const searchQuery = buildVectorSearchQuery_(entry);
      console.log('   Query built: "' + searchQuery + '"');
      console.log('   Query length: ' + searchQuery.split(' ').length + ' words\n');

      // Now execute the ACTUAL vector search
      console.log('📡 CALLING VECTOR STORE:');
      console.log('   Endpoint: OpenAI Vector Store');
      console.log('   Limit: 10 results');
      console.log('   Min score: 0.35\n');

      const rawResults = searchVectorStoreRaw_(searchQuery, 10, 0.35);

      console.log('✅ RAW RESULTS FROM VECTOR STORE:');
      console.log('   Status: ' + (rawResults.status || 'unknown'));
      console.log('   Results returned: ' + (rawResults.results ? rawResults.results.length : 0));

      if (rawResults.results && rawResults.results.length > 0) {
        console.log('\n   Top 10 matches:');
        rawResults.results.forEach(function(result, idx) {
          const sku = result.metadata && result.metadata.sku ? result.metadata.sku : 'NO SKU';
          const score = result.score || result.similarity || 0;
          const name = result.metadata && result.metadata.name ? result.metadata.name : 'NO NAME';
          console.log('   ' + (idx + 1) + '. SKU: ' + sku + ' | Score: ' + score.toFixed(3) + ' | ' + name);
        });
      } else {
        console.log('   ❌ NO RESULTS RETURNED');
        console.log('   This means either:');
        console.log('   - Vector store is empty');
        console.log('   - Query is too specific/bad');
        console.log('   - Min score threshold too high');
      }

    } catch (error) {
      console.log('❌ ERROR: ' + error.message);
      console.log('   Stack: ' + error.stack);
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');
  }

  console.log('DIAGNOSTIC COMPLETE\n');
  console.log('KEY QUESTIONS TO ANSWER:');
  console.log('1. Are the queries sensible? (should be describing the work, not random phrases)');
  console.log('2. Are results coming back? (should get 10 matches per query)');
  console.log('3. Are the SKUs relevant? (should match the scope work being done)');
  console.log('4. Are scores reasonable? (0.35+ means decent match)');
}

/**
 * Helper: Build vector search query from scope entry
 * THIS IS THE ACTUAL CODE FROM VectorSearch.js - buildScopeVectorQuery_
 */
function buildVectorSearchQuery_(entry) {
  // ACTUAL implementation from VectorSearch.js
  if (!entry) {
    return '';
  }

  // Uses buildDeliverablesQuery_ from VectorSearch.js
  if (!Array.isArray(entry.deliverables) || !entry.deliverables.length) {
    // Fallback to interpretation or scopeLabel
    if (entry.interpretation) {
      return String(entry.interpretation).trim();
    }
    if (entry.scopeLabel) {
      return String(entry.scopeLabel).trim();
    }
    return '';
  }

  // Join all deliverables into query string
  let text = entry.deliverables
    .map(function(item) { return item && String(item).trim(); })
    .filter(function(item) { return item && item.length; })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Apply word limit (default 25 words)
  const limit = 25;
  const words = text.split(/\s+/);
  if (words.length > limit) {
    text = words.slice(0, limit).join(' ');
  }

  // If query too short, add context from interpretation/label
  if (words.length < 5) {
    const contextParts = [text];
    if (entry.interpretation) {
      contextParts.push(String(entry.interpretation).trim());
    }
    if (entry.scopeLabel) {
      contextParts.push(String(entry.scopeLabel).trim());
    }
    text = contextParts.join(' ').replace(/\s+/g, ' ').trim();
    // Re-apply limit
    const finalWords = text.split(/\s+/);
    if (finalWords.length > limit) {
      text = finalWords.slice(0, limit).join(' ');
    }
  }

  return text;
}

/**
 * Helper: Call ACTUAL vector search function
 * Calls searchVectorStoreScopes_ from VectorSearch.js
 */
function searchVectorStoreRaw_(query, limit, minScore) {
  // Call the REAL function from VectorSearch.js
  if (typeof searchVectorStoreScopes_ !== 'function') {
    throw new Error('searchVectorStoreScopes_ not found - VectorSearch.js not loaded?');
  }

  const result = searchVectorStoreScopes_(query, {
    limit: limit || 10,
    minScore: minScore || 0.35
  });

  // searchVectorStoreScopes_ returns {hits: [...], raw: {...}}
  return {
    status: 200,
    results: result.hits || [],
    raw: result.raw || {}
  };
}

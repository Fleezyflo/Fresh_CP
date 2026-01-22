/**
 * Show the EXACT prompts being sent to LLMs - output to sheet to avoid truncation
 */
function diagnoseExactPromptsToSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('_PROMPT_DIAGNOSTIC');

  if (!sheet) {
    sheet = ss.insertSheet('_PROMPT_DIAGNOSTIC');
  } else {
    sheet.clear();
  }

  const briefType = 'smm-retainer';

  // Build a mock context like the real extraction would
  const mockContext = {
    briefText: 'We need a 6-month social media retainer for our luxury hotel brand in Dubai. Monthly content creation including 20 posts per month, 5 reels, community management, and monthly reporting. Budget is AED 25,000/month.',
    briefType: briefType,
    pdfSummaries: [],
    answers: [],
    clientContext: {
      automated: {
        industries: [{label: 'Hospitality & Tourism', confidence: 0.9, evidence: ['hotel', 'Dubai']}],
        regions: [{label: 'UAE', confidence: 0.95, evidence: ['Dubai']}],
        expectations: [],
        riskFlags: []
      },
      overrides: {}
    },
    sectionPriority: ['Strategy & Planning', 'Content Development', 'Distribution & Activation', 'Measurement & Reporting'],
    briefProfile: getBriefProfile(briefType)
  };

  console.log('Building scope extraction prompt...');
  const scopePrompt = buildScopeDraftPrompt(mockContext);

  // Write to sheet
  let row = 1;

  sheet.getRange(row, 1).setValue('SCOPE EXTRACTION - SYSTEM PROMPT');
  sheet.getRange(row, 1).setFontWeight('bold');
  sheet.getRange(row, 1).setBackground('#4285f4');
  sheet.getRange(row, 1).setFontColor('#ffffff');
  row++;

  sheet.getRange(row, 1).setValue(scopePrompt[0].content);
  sheet.getRange(row, 1).setWrap(true);
  row++;
  row++;

  sheet.getRange(row, 1).setValue('SCOPE EXTRACTION - USER PROMPT');
  sheet.getRange(row, 1).setFontWeight('bold');
  sheet.getRange(row, 1).setBackground('#4285f4');
  sheet.getRange(row, 1).setFontColor('#ffffff');
  row++;

  sheet.getRange(row, 1).setValue(scopePrompt[1].content);
  sheet.getRange(row, 1).setWrap(true);
  row++;
  row++;

  sheet.getRange(row, 1).setValue('CANONICAL PHASE IDS (sent to LLM)');
  sheet.getRange(row, 1).setFontWeight('bold');
  sheet.getRange(row, 1).setBackground('#34a853');
  sheet.getRange(row, 1).setFontColor('#ffffff');
  row++;

  const phaseCanonicals = getScopePhaseCanonicals(briefType);
  sheet.getRange(row, 1).setValue('Count: ' + phaseCanonicals.length);
  row++;
  sheet.getRange(row, 1).setValue(phaseCanonicals.join(', '));
  sheet.getRange(row, 1).setWrap(true);
  row++;
  row++;

  sheet.getRange(row, 1).setValue('PHASE GUIDANCE (sent to LLM)');
  sheet.getRange(row, 1).setFontWeight('bold');
  sheet.getRange(row, 1).setBackground('#34a853');
  sheet.getRange(row, 1).setFontColor('#ffffff');
  row++;

  const phaseGuidance = buildPhaseGuidanceForPrompt(briefType);
  sheet.getRange(row, 1).setValue(phaseGuidance || '(none)');
  sheet.getRange(row, 1).setWrap(true);
  row++;
  row++;

  sheet.getRange(row, 1).setValue('PHASE DEFINITIONS BLOCK (sent to LLM)');
  sheet.getRange(row, 1).setFontWeight('bold');
  sheet.getRange(row, 1).setBackground('#34a853');
  sheet.getRange(row, 1).setFontColor('#ffffff');
  row++;

  const phaseDefinitions = buildPhaseDefinitionsBlock(mockContext);
  sheet.getRange(row, 1).setValue(phaseDefinitions || '(none)');
  sheet.getRange(row, 1).setWrap(true);
  row++;
  row++;

  sheet.getRange(row, 1).setValue('SCOPE DRAFT LLM SCHEMA');
  sheet.getRange(row, 1).setFontWeight('bold');
  sheet.getRange(row, 1).setBackground('#fbbc04');
  sheet.getRange(row, 1).setFontColor('#000000');
  row++;

  sheet.getRange(row, 1).setValue(JSON.stringify(SCOPE_DRAFT_LLM_SCHEMA, null, 2));
  sheet.getRange(row, 1).setWrap(true);
  row++;

  // Format column width
  sheet.setColumnWidth(1, 1200);

  console.log('✅ Prompts written to sheet: _PROMPT_DIAGNOSTIC');
  console.log('Total rows written: ' + row);
}

/**
 * Alternative: Output to console in chunks to avoid truncation
 */
function diagnoseExactPromptsChunked() {
  const briefType = 'smm-retainer';

  const mockContext = {
    briefText: 'We need a 6-month social media retainer for our luxury hotel brand in Dubai. Monthly content creation including 20 posts per month, 5 reels, community management, and monthly reporting. Budget is AED 25,000/month.',
    briefType: briefType,
    pdfSummaries: [],
    answers: [],
    clientContext: {
      automated: {
        industries: [{label: 'Hospitality & Tourism', confidence: 0.9, evidence: ['hotel', 'Dubai']}],
        regions: [{label: 'UAE', confidence: 0.95, evidence: ['Dubai']}],
        expectations: [],
        riskFlags: []
      },
      overrides: {}
    },
    sectionPriority: ['Strategy & Planning', 'Content Development', 'Distribution & Activation', 'Measurement & Reporting'],
    briefProfile: getBriefProfile(briefType)
  };

  console.log('═══════════════════════════════════════════════════════════');
  console.log('EXACT LLM PROMPTS - CHUNKED OUTPUT');
  console.log('═══════════════════════════════════════════════════════════');

  const scopePrompt = buildScopeDraftPrompt(mockContext);

  console.log('\n1. SYSTEM PROMPT (Part 1/3)');
  console.log('─────────────────────────────────────────────────────────────');
  const systemPrompt = scopePrompt[0].content;
  const chunk1 = systemPrompt.substring(0, 4000);
  console.log(chunk1);

  console.log('\n1. SYSTEM PROMPT (Part 2/3)');
  console.log('─────────────────────────────────────────────────────────────');
  const chunk2 = systemPrompt.substring(4000, 8000);
  console.log(chunk2);

  console.log('\n1. SYSTEM PROMPT (Part 3/3)');
  console.log('─────────────────────────────────────────────────────────────');
  const chunk3 = systemPrompt.substring(8000);
  console.log(chunk3);

  console.log('\n2. USER PROMPT');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(scopePrompt[1].content);

  console.log('\n3. CANONICAL PHASE IDS');
  console.log('─────────────────────────────────────────────────────────────');
  const phaseCanonicals = getScopePhaseCanonicals(briefType);
  console.log('Count:', phaseCanonicals.length);
  console.log('Values:', phaseCanonicals.join(', '));

  console.log('\n4. PHASE GUIDANCE (Part 1/2)');
  console.log('─────────────────────────────────────────────────────────────');
  const phaseGuidance = buildPhaseGuidanceForPrompt(briefType);
  const guidance1 = phaseGuidance.substring(0, 4000);
  console.log(guidance1);

  console.log('\n4. PHASE GUIDANCE (Part 2/2)');
  console.log('─────────────────────────────────────────────────────────────');
  const guidance2 = phaseGuidance.substring(4000);
  console.log(guidance2);

  console.log('\n5. PHASE DEFINITIONS (Part 1/3)');
  console.log('─────────────────────────────────────────────────────────────');
  const phaseDefinitions = buildPhaseDefinitionsBlock(mockContext);
  const def1 = phaseDefinitions.substring(0, 4000);
  console.log(def1);

  console.log('\n5. PHASE DEFINITIONS (Part 2/3)');
  console.log('─────────────────────────────────────────────────────────────');
  const def2 = phaseDefinitions.substring(4000, 8000);
  console.log(def2);

  console.log('\n5. PHASE DEFINITIONS (Part 3/3)');
  console.log('─────────────────────────────────────────────────────────────');
  const def3 = phaseDefinitions.substring(8000);
  console.log(def3);

  console.log('\n6. SCHEMA');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(SCOPE_DRAFT_LLM_SCHEMA, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
}

/**
 * Return full prompts as object (for inspection in debugger or return value)
 */
function getExactPromptsFull() {
  const briefType = 'smm-retainer';

  const mockContext = {
    briefText: 'We need a 6-month social media retainer for our luxury hotel brand in Dubai. Monthly content creation including 20 posts per month, 5 reels, community management, and monthly reporting. Budget is AED 25,000/month.',
    briefType: briefType,
    pdfSummaries: [],
    answers: [],
    clientContext: {
      automated: {
        industries: [{label: 'Hospitality & Tourism', confidence: 0.9, evidence: ['hotel', 'Dubai']}],
        regions: [{label: 'UAE', confidence: 0.95, evidence: ['Dubai']}],
        expectations: [],
        riskFlags: []
      },
      overrides: {}
    },
    sectionPriority: ['Strategy & Planning', 'Content Development', 'Distribution & Activation', 'Measurement & Reporting'],
    briefProfile: getBriefProfile(briefType)
  };

  const scopePrompt = buildScopeDraftPrompt(mockContext);
  const phaseCanonicals = getScopePhaseCanonicals(briefType);
  const phaseGuidance = buildPhaseGuidanceForPrompt(briefType);
  const phaseDefinitions = buildPhaseDefinitionsBlock(mockContext);

  return {
    scopeExtraction: {
      systemPrompt: scopePrompt[0].content,
      userPrompt: scopePrompt[1].content,
      systemPromptLength: scopePrompt[0].content.length,
      userPromptLength: scopePrompt[1].content.length
    },
    phaseData: {
      canonicals: phaseCanonicals,
      canonicalCount: phaseCanonicals.length,
      guidance: phaseGuidance,
      guidanceLength: phaseGuidance.length,
      definitions: phaseDefinitions,
      definitionsLength: phaseDefinitions.length
    },
    schema: SCOPE_DRAFT_LLM_SCHEMA,
    totalCharacters: scopePrompt[0].content.length + scopePrompt[1].content.length
  };
}

/**
 * Show the EXACT prompts being sent to LLMs with real data
 */
function diagnoseExactPrompts() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('EXACT LLM PROMPTS DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════');

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

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. SCOPE EXTRACTION PROMPT (what LLM receives for extraction)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const scopePrompt = buildScopeDraftPrompt(mockContext);

  console.log('\n▼ SYSTEM PROMPT ▼');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(scopePrompt[0].content);
  console.log('─────────────────────────────────────────────────────────────');

  console.log('\n▼ USER PROMPT ▼');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(scopePrompt[1].content);
  console.log('─────────────────────────────────────────────────────────────');

  // Show what getScopePhaseCanonicals returns
  console.log('\n▼ CANONICAL PHASE IDS (sent to LLM) ▼');
  console.log('─────────────────────────────────────────────────────────────');
  const phaseCanonicals = getScopePhaseCanonicals(briefType);
  console.log('Count:', phaseCanonicals.length);
  console.log('Values:', phaseCanonicals.join(', '));
  console.log('─────────────────────────────────────────────────────────────');

  // Show phase guidance
  console.log('\n▼ PHASE GUIDANCE (sent to LLM) ▼');
  console.log('─────────────────────────────────────────────────────────────');
  const phaseGuidance = buildPhaseGuidanceForPrompt(briefType);
  console.log(phaseGuidance || '(none)');
  console.log('─────────────────────────────────────────────────────────────');

  // Show phase definitions
  console.log('\n▼ PHASE DEFINITIONS BLOCK (sent to LLM) ▼');
  console.log('─────────────────────────────────────────────────────────────');
  const phaseDefinitions = buildPhaseDefinitionsBlock(mockContext);
  console.log(phaseDefinitions || '(none)');
  console.log('─────────────────────────────────────────────────────────────');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2. SCOPE EXTRACTION SCHEMA (LLM must follow this structure)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n▼ JSON SCHEMA (strict mode) ▼');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(SCOPE_DRAFT_LLM_SCHEMA, null, 2));
  console.log('─────────────────────────────────────────────────────────────');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3. COMMERCIAL PLAN PROMPT (quote generation)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Build mock approved scope for plan generation
  const mockApprovedScope = {
    projectName: 'Luxury Hotel Social Media Retainer',
    briefType: briefType,
    scopeEntries: [
      {
        id: 'strategy-planning',
        sectionId: 'strategy-planning',
        scopeLabel: 'Strategy & Planning',
        canonical: 'strategy-planning',
        isSection: true,
        deliverables: ['Social media strategy', 'Content calendar', 'Monthly planning'],
        notes: ['Includes competitor analysis', 'Aligned with brand guidelines'],
        signals: ['strategy', 'planning'],
        resources: [],
        sourceExcerpt: '6-month social media retainer',
        visibility: 'Client',
        approvalStatus: 'approved',
        interpretation: '',
        contingency: null,
        parentId: '',
        childIds: ['strategy-planning-line-1'],
        metadata: {
          bundleKey: '',
          parentScopeId: '',
          sectionParentId: '',
          vectorDetailParent: '',
          isSectionChild: false,
          detailSource: '',
          phaseRecovered: ''
        },
        quantitySignals: [{type: 'duration', label: 'months', value: 6, unit: 'months', source: 'brief', primary: true, evidence: ['6-month']}],
        scenarioHighlights: ['Monthly retainer structure'],
        usageSummary: {durationMonths: 6, region: 'UAE', notes: []},
        catalogRefs: [],
        resourcePackages: []
      },
      {
        id: 'strategy-planning-line-1',
        sectionId: 'strategy-planning',
        scopeLabel: 'Monthly social media strategy and planning',
        canonical: 'strategy-planning',
        isSection: false,
        deliverables: ['Content strategy', 'Editorial calendar'],
        notes: ['Updated monthly'],
        signals: ['planning'],
        resources: [{role: 'Social Media Manager', hours: 8, rate: null, internal: true}],
        sourceExcerpt: 'Monthly content creation',
        visibility: 'Client',
        approvalStatus: 'approved',
        interpretation: '',
        contingency: null,
        parentId: 'strategy-planning',
        childIds: [],
        metadata: {
          bundleKey: '',
          parentScopeId: 'strategy-planning',
          sectionParentId: 'strategy-planning',
          vectorDetailParent: '',
          isSectionChild: true,
          detailSource: 'llm',
          phaseRecovered: ''
        },
        quantitySignals: [{type: 'frequency', label: 'monthly', value: 12, unit: 'deliveries', source: 'derived', primary: true, evidence: ['monthly']}],
        scenarioHighlights: [],
        usageSummary: {durationMonths: 6, region: 'UAE', notes: []},
        catalogRefs: [],
        resourcePackages: []
      }
    ]
  };

  const mockPlanContext = {
    briefText: mockContext.briefText,
    briefType: briefType,
    briefProfile: mockContext.briefProfile,
    persona: 'proposal-author',
    contractEntries: mockApprovedScope.scopeEntries,
    catalogContext: [],
    signalLayers: {
      derived: [],
      automated: mockContext.clientContext.automated,
      overrides: mockContext.clientContext.overrides
    },
    commercialFit: {
      entries: [
        {
          scopeEntryId: 'strategy-planning-line-1',
          canonical: 'strategy-planning',
          archetype: 'retainer',
          chosenSku: 'SMM-STRATEGY-001',
          quantityContext: {qty: 6, unit: 'months'},
          visibility: 'Client',
          scoreBreakdown: {total: 85},
          warnings: []
        }
      ]
    },
    commercialConstraints: {
      targetMarginPct: 30,
      approvalsPending: []
    },
    defaults: {
      currency: 'AED',
      taxType: 'GST',
      sections: ['Strategy & Planning', 'Content Development', 'Distribution', 'Reporting']
    },
    optionalSections: []
  };

  const planPrompt = buildPlanPrompt(mockPlanContext);

  console.log('\n▼ SYSTEM PROMPT ▼');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(planPrompt[0].content);
  console.log('─────────────────────────────────────────────────────────────');

  console.log('\n▼ USER PROMPT ▼');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(planPrompt[1].content);
  console.log('─────────────────────────────────────────────────────────────');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4. CATALOG MAPPER SCHEMA (commercial fit)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n▼ JSON SCHEMA (strict mode) ▼');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(CATALOG_MAPPER_RESPONSE_SCHEMA, null, 2));
  console.log('─────────────────────────────────────────────────────────────');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('5. SECTION SUMMARY SCHEMA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n▼ JSON SCHEMA (strict mode) ▼');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(SECTION_SUMMARY_RESPONSE_SCHEMA, null, 2));
  console.log('─────────────────────────────────────────────────────────────');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('DIAGNOSTIC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
}

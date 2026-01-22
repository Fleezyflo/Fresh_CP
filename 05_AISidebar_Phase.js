/**
 * AISidebar Phase Module
 *
 * Responsibilities:
 * - Phase guidance generation for AI prompts
 * - Phase evidence scanning in brief text
 * - Phase definition building with strict boundaries
 * - Phase lookup maps and canonical ID extraction
 * - Phrase collection and regex matching for phase detection
 *
 * Dependencies:
 * - ConfigurationManager (scope.phases access)
 * - 05_AISidebar_Config.js (BRIEF_TYPE_DEFAULT)
 * - Utilities.js (truncate)
 *
 * Used by: Workflow module, Processing module, UI module
 *
 * Load Order: 05_ prefix ensures loading after Config module
 *
 * Extracted from monolithic AISidebar.js (Phase 3 Plan 2)
 */

// ============================================================================
// Phase Canonical Extraction
// ============================================================================

function getScopePhaseCanonicals(briefType) {
  // Load scope phases via getScopeCategoryConfigMap (returns grouped map by briefType)
  const type = briefType || BRIEF_TYPE_DEFAULT;
  try {
    const configMap = getScopeCategoryConfigMap();  // Get grouped map, not raw array
    const config = configMap[type] || null;
    if (!config || !Array.isArray(config.phases)) {
      return [];
    }
    const canonicalList = config.phases
      .map(function(phase) {
        if (!phase || typeof phase !== 'object') {
          return '';
      }
      return phase.canonical || phase.id || phase.label || '';
    })
    .map(function(value) {
      return typeof value === 'string' ? value.trim() : '';
    })
    .filter(Boolean);
    return Array.from(new Set(canonicalList));
  } catch (error) {
    try {
      UnifiedLogger.error('AISidebar_Phase', 'Failed to load scope phases', { briefType: type, error: String(error) });
    } catch (logError) {
      // UnifiedLogger unavailable during bootstrap
    }
    return [];
  }
}

// ============================================================================
// Phase Guidance for AI Prompts
// ============================================================================

function buildPhaseGuidanceForPrompt(briefType) {
  const type = briefType || BRIEF_TYPE_DEFAULT;
  try {
    const configMap = getScopeCategoryConfigMap();  // Get grouped map, not raw array
    const config = configMap[type] || null;
    if (!config || !Array.isArray(config.phases) || !config.phases.length) {
      return '';
    }
  const lines = [];
  config.phases.forEach(function(phase) {
    if (!phase || !phase.canonical) {
      return;
    }
    const hintParts = [];
    const label = phase.label || phase.canonical;
    hintParts.push('Phase: ' + label);
    const inputs = phase.inputs || {};
    const deliverableHint = phase.deliverableHint || inputs.deliverableHint;
    const signalHint = phase.signalHint || inputs.signalHint;
    if (deliverableHint) {
      hintParts.push('Deliverables: ' + deliverableHint);
    }
    if (signalHint) {
      hintParts.push('Signals: ' + signalHint);
    }
    const canonical = phase.canonical || phase.id || phase.label || '';
    const taxonomyHints = typeof getPhaseInputHintsFromTaxonomy === 'function'
      ? getPhaseInputHintsFromTaxonomy(briefType, canonical)
      : null;
    if (taxonomyHints) {
      if (taxonomyHints.deliverableHint) {
        hintParts.push('Deliverables (taxonomy): ' + taxonomyHints.deliverableHint);
      }
      if (taxonomyHints.signalHint) {
        hintParts.push('Signals (taxonomy): ' + taxonomyHints.signalHint);
      }
    }
    if (hintParts.length > 0) {
      lines.push(truncate(hintParts.join(' | '), 200));
    }
  });
    return lines.length ? lines.join('\n') : '';
  } catch (error) {
    try {
      UnifiedLogger.error('AISidebar_Phase', 'Failed to build phase guidance', { briefType: type, error: String(error) });
    } catch (logError) {
      // UnifiedLogger unavailable during bootstrap
    }
    return '';
  }
}

function buildMandatoryEvidenceSection(context) {
  const evidenceEntries = scanBriefForPhaseEvidence(context);
  if (!evidenceEntries.length) {
    return '';
  }
  const evidenceLines = evidenceEntries.map(function(entry) {
    const snippet = entry.hits.join(' | ');
    return '- ' + entry.label + ' (' + entry.canonical + '): Evidence: ' + snippet + ' You MUST create a ' + entry.label + ' section (detail rows must live there).';
  });
  return [
    '### Mandatory Phase Evidence',
    'Pre-scan detected execution signals for these phases; create each named section before emitting detail rows and do not dump execution items into Strategy/Planning.',
    evidenceLines.join('\n')
  ].join('\n');
}

function buildPhaseDefinitionsBlock(context) {
  const briefType = context && context.briefType ? context.briefType : BRIEF_TYPE_DEFAULT;
  const canonicalOrder = getScopePhaseCanonicals(briefType);
  if (!canonicalOrder.length) {
    return '';
  }
  const phaseLabelMap = getPhaseLabelMap(briefType);
  const taxonomyLookup = (typeof getBriefTypePhaseTaxonomy === 'function')
    ? getBriefTypePhaseTaxonomy(briefType)
    : {};
  const lines = ['### Phase Definitions'];
  canonicalOrder.forEach(function(canonical) {
    const label = phaseLabelMap[canonical] || canonical;
    const entry = taxonomyLookup && taxonomyLookup[canonical] ? taxonomyLookup[canonical] : null;
    const definitionLines = [];
    const purpose = entry && (entry.purpose || entry.definition || entry.title);
    if (purpose) {
      definitionLines.push('Strict definition: ' + entry.purpose);
    } else {
      definitionLines.push('Strict definition: Keep this phase aligned to the configured taxonomy and avoid overlapping responsibilities.');
    }
    const keyDeliverables = entry && (entry.keyDeliverables || entry.key_deliverables_examples);
    if (keyDeliverables && Array.isArray(keyDeliverables) && keyDeliverables.length) {
      definitionLines.push('Key deliverables: ' + keyDeliverables.slice(0, 3).join('; '));
    }
    const signals = entry && (entry.signals || entry.positive_signals);
    if (signals && Array.isArray(signals) && signals.length) {
      definitionLines.push('Signals: ' + signals.slice(0, 3).join('; '));
    }
    const keywords = entry && entry.keywords;
    if (keywords && Array.isArray(keywords) && keywords.length) {
      definitionLines.push('Keywords: ' + keywords.slice(0, 3).join('; '));
    }
    const boundaryHint = (entry && entry.boundaryHint) ? entry.boundaryHint : buildPhaseBoundaryHint(canonical);
    if (boundaryHint) {
      definitionLines.push('Boundary: ' + boundaryHint);
    }
    lines.push('- Phase: ' + label + ' (' + canonical + ')');
    definitionLines.forEach(function(line) {
      lines.push('  ' + line);
    });
  });
  return lines.length ? lines.join('\n') : '';
}

// ============================================================================
// Phase Keyword Heuristics
// ============================================================================

const PHASE_KEYWORD_OVERRIDES = [
  {
    pattern: /pre[- ]?production|production|capture|shoot|film|live/i,
    keywords: ['shoot', 'capture', 'camera', 'crew', 'location', 'filming', 'production day', 'set', 'registry', 'scene']
  },
  {
    pattern: /post[- ]?production|asset|deliverable|editing|finish/i,
    keywords: ['post', 'edit', 'grade', 'finalize', 'master', 'version', 'asset', 'packaging', 'render', 'encode']
  },
  {
    pattern: /distribution|activation|amplification|go[- ]?live|publish|traffic/i,
    keywords: ['post', 'publish', 'launch', 'schedule', 'deploy', 'share', 'release', 'amplify']
  },
  {
    pattern: /measurement|report|insight|analytics|evaluation/i,
    keywords: ['report', 'measure', 'metric', 'dashboard', 'insight', 'tracking', 'analysis', 'scorecard']
  },
  {
    pattern: /strategy|planning|architecture|briefing|steering/i,
    keywords: ['strategy', 'planning', 'roadmap', 'approach', 'direction', 'priorities', 'narrative']
  }
];

// ============================================================================
// Phase Boundary Hints
// ============================================================================

// Provide a reminder about what belongs inside each canonical phase so definitions stay strict.
function buildPhaseBoundaryHint(canonical) {
  if (!canonical) {
    return '';
  }
  const normalized = String(canonical).toLowerCase();
  if (normalized.includes('strategy') || normalized.includes('planning')) {
    return 'Strategy is for planning, not doing; keep execution verbs like shoot, edit, or post inside production, post-production, and distribution phases.';
  }
  if (normalized.includes('production') || normalized.includes('capture')) {
    return 'Keep execution-focused work here and avoid letting planning or measurement language bleed back into the Strategy/Planning sections.';
  }
  if (normalized.includes('post-production') || normalized.includes('asset') || normalized.includes('deliverable')) {
    return 'Focus on editing, packaging, and asset governance rather than capture or strategy work.';
  }
  if (normalized.includes('distribution') || normalized.includes('activation') || normalized.includes('publish')) {
    return 'This phase handles pushing content live and amplifying it; do not treat it as a creation or strategy phase.';
  }
  if (normalized.includes('measurement') || normalized.includes('analytics') || normalized.includes('insight') || normalized.includes('report')) {
    return 'Reserve this phase for performance tracking, analysis, and lessons learned—not creation or strategic direction.';
  }
  return '';
}

// ============================================================================
// Phase Lookup Maps
// ============================================================================

function getPhaseLabelMap(briefType) {
  const type = briefType || BRIEF_TYPE_DEFAULT;
  const map = {};
  try {
    const configMap = getScopeCategoryConfigMap();  // Get grouped map, not raw array
    const config = configMap[type] || null;
    if (!config || !Array.isArray(config.phases)) {
      return map;
    }
    config.phases.forEach(function(phase) {
      if (!phase) {
        return;
      }
      const canonical = phase.canonical || phase.id || phase.label;
      if (!canonical) {
        return;
      }
      map[canonical] = phase.label || phase.id || canonical;
    });
    return map;
  } catch (error) {
    try {
      UnifiedLogger.error('AISidebar_Phase', 'Failed to load phase label map', { briefType: type, error: String(error) });
    } catch (logError) {
      // UnifiedLogger unavailable during bootstrap
    }
    return map;
  }
}

function getPhaseConfigLookup(briefType) {
  const type = briefType || BRIEF_TYPE_DEFAULT;
  const lookup = {};
  try {
    const configMap = getScopeCategoryConfigMap();  // Get grouped map, not raw array
    const config = configMap[type] || null;
    if (!config || !Array.isArray(config.phases)) {
      return lookup;
    }
    config.phases.forEach(function(phase) {
      if (!phase) {
        return;
      }
      const canonical = phase.canonical || phase.id || phase.label;
      if (!canonical) {
        return;
      }
      lookup[canonical] = phase;
    });
    return lookup;
  } catch (error) {
    try {
      UnifiedLogger.error('AISidebar_Phase', 'Failed to load phase config lookup', { briefType: type, error: String(error) });
    } catch (logError) {
      // UnifiedLogger unavailable during bootstrap
    }
    return lookup;
  }
}

// ============================================================================
// Phase Phrase Collection and Matching
// ============================================================================

// Combine configured synonyms, taxonomy keywords, and heuristic phrases into a phase-specific seed list.
function collectPhaseSearchPhrases(briefType, canonical, phaseConfig) {
  const phrases = new Set();
  const addPhrase = function(value) {
    if (!value) {
      return;
    }
    let text = String(value).trim();
    text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ');
    if (text.length < 2) {
      return;
    }
    phrases.add(text);
  };
  const addHintPhrases = function(hint) {
    splitHintText(hint).forEach(addPhrase);
  };
  if (phaseConfig) {
    addPhrase(phaseConfig.label);
    addPhrase(phaseConfig.canonical);
    addPhrase(phaseConfig.id);
    if (Array.isArray(phaseConfig.synonyms)) {
      phaseConfig.synonyms.forEach(addPhrase);
    }
    if (phaseConfig.inputs) {
      addPhrase(phaseConfig.inputs.deliverableHint);
      addPhrase(phaseConfig.inputs.signalHint);
      addHintPhrases(phaseConfig.inputs.deliverableHint);
      addHintPhrases(phaseConfig.inputs.signalHint);
    }
  }
  if (typeof collectPhaseTaxonomyPhrases === 'function') {
    const taxonomyPhrases = collectPhaseTaxonomyPhrases(briefType, canonical);
    if (Array.isArray(taxonomyPhrases)) {
      taxonomyPhrases.forEach(addPhrase);
    }
  }
  const canonicalKey = canonical ? String(canonical) : '';
  if (canonicalKey) {
    PHASE_KEYWORD_OVERRIDES.forEach(function(entry) {
      if (!entry || !entry.pattern) {
        return;
      }
      if (entry.pattern.test(canonicalKey)) {
        (entry.keywords || []).forEach(addPhrase);
      }
    });
  }
  return Array.from(phrases).slice(0, 40);
}

function splitHintText(hint) {
  if (!hint || typeof hint !== 'string') {
    return [];
  }
  return hint.split(/[;•,]/).map(function(part) {
    return part.trim();
  }).filter(Boolean);
}

function buildPhasePhraseRegex(phrase) {
  if (!phrase) {
    return null;
  }
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  try {
    return new RegExp('\\b' + escaped + '\\b', 'i');
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Phase Evidence Scanning
// ============================================================================

// Capture a short context window around the matched keyword to include as evidence.
function formatEvidenceSnippet(text, index, matchLength) {
  if (index === undefined || index === null) {
    return '';
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + (matchLength || 0) + 60);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (!snippet) {
    return '';
  }
  if (start > 0) {
    snippet = '... ' + snippet;
  }
  if (end < text.length) {
    snippet = snippet + ' ...';
  }
  return snippet;
}

// Pre-scan the brief for seeded phrases so the prompt can mandate the related phase sections.
function scanBriefForPhaseEvidence(context) {
  const briefText = context && context.briefText ? String(context.briefText).trim() : '';
  if (!briefText) {
    return [];
  }
  const briefType = context && context.briefType ? context.briefType : BRIEF_TYPE_DEFAULT;
  const canonicalOrder = getScopePhaseCanonicals(briefType);
  if (!canonicalOrder.length) {
    return [];
  }
  const labelMap = getPhaseLabelMap(briefType);
  const configLookup = getPhaseConfigLookup(briefType);
  const evidenceEntries = [];
  canonicalOrder.forEach(function(canonical) {
    const phrases = collectPhaseSearchPhrases(briefType, canonical, configLookup[canonical]);
    if (!phrases.length) {
      return;
    }
    const hits = [];
    for (let i = 0; i < phrases.length && hits.length < 2; i += 1) {
      const phrase = phrases[i];
      const regex = buildPhasePhraseRegex(phrase);
      if (!regex) {
        continue;
      }
      const match = regex.exec(briefText);
      if (!match) {
        continue;
      }
      const snippet = formatEvidenceSnippet(briefText, match.index, match[0] ? match[0].length : phrase.length);
      if (snippet && hits.indexOf(snippet) === -1) {
        hits.push(snippet);
      } else if (!snippet && hits.indexOf(phrase) === -1) {
        hits.push(phrase);
      }
    }
    if (hits.length) {
      evidenceEntries.push({
        canonical: canonical,
        label: labelMap[canonical] || canonical,
        hits: hits
      });
    }
  });
  return evidenceEntries;
}

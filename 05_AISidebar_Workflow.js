/**
 * AISidebar Workflow Module
 *
 * Responsibilities:
 * - Workflow signal processing and inference
 * - Client context building and formatting
 * - Signal normalization and merging
 * - Text sanitization and identifier generation
 *
 * Dependencies:
 * - 05_AISidebar_Config.js (CLIENT_* constants, BRIEF_TYPE_DEFAULT, etc.)
 * - Utilities.js (truncate, ensureArray)
 * - UnifiedLogger.js (logging)
 *
 * Used by: Data module, Processing module, UI module
 *
 * Load Order: 05_ prefix ensures loading after Config and Phase modules
 *
 * Extracted from monolithic AISidebar.js (Phase 3 Plan 3)
 */

// ============================================================================
// Client Context Building
// ============================================================================

/**
 * Build client context signals that keep the LLM grounded in commercial realities.
 * @param {string} combinedText
 * @param {Object=} approvedScope
 * @param {Object=} options
 * @return {Object}
 */
function buildClientContextPayload(combinedText, approvedScope, options) {
  const settings = options || {};
  const overrides = settings.overrides && typeof settings.overrides === 'object'
    ? settings.overrides
    : {};
  const manualNotes = sanitizeText(settings.manualNotes);
  const answers = Array.isArray(settings.answers)
    ? settings.answers
        .filter(function(answer) {
          return answer && answer.question && answer.answer !== undefined && answer.answer !== null;
        })
        .map(function(answer) {
          return {
            question: truncate(String(answer.question), 160),
            answer: truncate(String(answer.answer), 160)
          };
        })
    : [];

  const corpusBySource = {
    brief: sanitizeText(combinedText),
    notes: manualNotes,
    answers: answers.map(function(entry) {
      return entry.question + ' ' + entry.answer;
    }).join(' '),
    scope: summarizeScopeForSignals(approvedScope)
  };

  const autoIndustries = []
    .concat(collectKeywordSignals(corpusBySource.brief, CLIENT_INDUSTRY_KEYWORDS, 'brief'))
    .concat(collectKeywordSignals(corpusBySource.scope, CLIENT_INDUSTRY_KEYWORDS, 'scope'))
    .concat(collectKeywordSignals(corpusBySource.answers, CLIENT_INDUSTRY_KEYWORDS, 'answers'))
    .concat(collectKeywordSignals(corpusBySource.notes, CLIENT_INDUSTRY_KEYWORDS, 'reviewer-notes'));

  const autoRegions = []
    .concat(collectKeywordSignals(corpusBySource.brief, CLIENT_REGION_KEYWORDS, 'brief'))
    .concat(collectKeywordSignals(corpusBySource.scope, CLIENT_REGION_KEYWORDS, 'scope'))
    .concat(collectKeywordSignals(corpusBySource.answers, CLIENT_REGION_KEYWORDS, 'answers'))
    .concat(collectKeywordSignals(corpusBySource.notes, CLIENT_REGION_KEYWORDS, 'reviewer-notes'));

  const usageRegionSignal = extractUsageRegionSignal(approvedScope);
  if (usageRegionSignal) {
    autoRegions.push(usageRegionSignal);
  }

  const autoExpectations = []
    .concat(collectKeywordSignals(corpusBySource.brief, CLIENT_EXPECTATION_KEYWORDS, 'brief'))
    .concat(collectKeywordSignals(corpusBySource.scope, CLIENT_EXPECTATION_KEYWORDS, 'scope'))
    .concat(collectKeywordSignals(corpusBySource.answers, CLIENT_EXPECTATION_KEYWORDS, 'answers'))
    .concat(collectKeywordSignals(corpusBySource.notes, CLIENT_EXPECTATION_KEYWORDS, 'reviewer-notes'));

  const autoRiskFlags = []
    .concat(collectKeywordSignals(corpusBySource.brief, CLIENT_RISK_KEYWORDS, 'brief'))
    .concat(collectKeywordSignals(corpusBySource.scope, CLIENT_RISK_KEYWORDS, 'scope'))
    .concat(collectKeywordSignals(corpusBySource.answers, CLIENT_RISK_KEYWORDS, 'answers'))
    .concat(collectKeywordSignals(corpusBySource.notes, CLIENT_RISK_KEYWORDS, 'reviewer-notes'));

  const autoConstraints = []
    .concat(collectKeywordSignals(corpusBySource.brief, CLIENT_CONSTRAINT_KEYWORDS, 'brief'))
    .concat(collectKeywordSignals(corpusBySource.scope, CLIENT_CONSTRAINT_KEYWORDS, 'scope'))
    .concat(collectKeywordSignals(corpusBySource.answers, CLIENT_CONSTRAINT_KEYWORDS, 'answers'))
    .concat(collectKeywordSignals(corpusBySource.notes, CLIENT_CONSTRAINT_KEYWORDS, 'reviewer-notes'));

  const context = {
    persona: sanitizeText(overrides.persona) || CLIENT_CONTEXT_DEFAULT_PERSONA,
    manualNotes: manualNotes,
    answers: answers,
    industries: mergeSignalLists(
      normalizeSignalList(overrides.industries, 'override'),
      autoIndustries
    ),
    regions: mergeSignalLists(
      normalizeSignalList(overrides.regions, 'override'),
      autoRegions
    ),
    expectations: mergeSignalLists(
      normalizeSignalList(overrides.expectations, 'override'),
      autoExpectations
    ),
    riskFlags: mergeSignalLists(
      normalizeSignalList(overrides.riskFlags, 'override'),
      autoRiskFlags
    ),
    constraints: mergeSignalLists(
      normalizeSignalList(overrides.constraints, 'override'),
      autoConstraints
    ),
    overrides: overrides
  };

  return context;
}

/**
 * Convert client context into prompt-ready prose.
 * @param {Object} context
 * @return {string}
 */
function formatClientContextForPrompt(context) {
  if (!context || typeof context !== 'object') {
    return '';
  }
  const lines = [];
  if (context.persona) {
    lines.push('Persona: ' + context.persona);
  }
  if (Array.isArray(context.industries) && context.industries.length > 0) {
    lines.push('Industries: ' + context.industries.map(formatSignalEntry).filter(Boolean).join('; '));
  }
  if (Array.isArray(context.regions) && context.regions.length > 0) {
    lines.push('Regions: ' + context.regions.map(formatSignalEntry).filter(Boolean).join('; '));
  }
  if (Array.isArray(context.expectations) && context.expectations.length > 0) {
    lines.push('Expectations: ' + context.expectations.map(formatSignalEntry).filter(Boolean).join('; '));
  }
  if (Array.isArray(context.riskFlags) && context.riskFlags.length > 0) {
    lines.push('Risk Flags: ' + context.riskFlags.map(formatSignalEntry).filter(Boolean).join('; '));
  }
  if (Array.isArray(context.constraints) && context.constraints.length > 0) {
    lines.push('Identified Constraints: ' + context.constraints.map(formatSignalEntry).filter(Boolean).join('; '));
  }
  if (context.manualNotes) {
    lines.push('Reviewer Notes: ' + truncate(context.manualNotes, 200));
  }
  if (Array.isArray(context.answers) && context.answers.length > 0) {
    lines.push('Key Client Answers:');
    context.answers.slice(0, CLIENT_CONTEXT_MAX_SIGNALS).forEach(function(answer) {
      lines.push('- ' + truncate(answer.question, 80) + ': ' + truncate(answer.answer, 160));
    });
  }
  return lines.join('\n');
}

function formatSignalEntry(signal) {
  if (!signal) {
    return '';
  }
  if (typeof signal === 'string') {
    return signal;
  }
  const label = sanitizeText(signal.label || signal.canonical || signal.name || '');
  if (!label) {
    return '';
  }
  const parts = [label];
  if (Array.isArray(signal.evidence) && signal.evidence.length > 0) {
    const evidence = signal.evidence
      .filter(function(item) { return item !== undefined && item !== null && item !== ''; })
      .slice(0, 2)
      .map(function(item) {
        return truncate(String(item), 60);
      });
    if (evidence.length > 0) {
      parts.push('[' + evidence.join(', ') + ']');
    }
  }
  if (signal.source) {
    parts.push('via ' + signal.source);
  }
  if (signal.confidence !== undefined && signal.confidence !== null && !isNaN(signal.confidence)) {
    parts.push('(score ' + Number(signal.confidence).toFixed(2) + ')');
  }
  return parts.join(' ');
}

// ============================================================================
// Text Processing Helpers
// ============================================================================

function sanitizeText(value) {
  if (value === undefined || value === null) {
    return '';
  }
  const text = String(value).trim();
  if (typeof QuoteUtils !== 'undefined' &&
      QuoteUtils &&
      typeof QuoteUtils.sanitizeForSheet === 'function') {
    return QuoteUtils.sanitizeForSheet(text);
  }
  if (!text) {
    return '';
  }
  const prefix = text.charAt(0);
  if (prefix === '=' || prefix === '+' || prefix === '-' || prefix === '@' || /\u0009|\u000A|\u000D/.test(prefix)) {
    return '\'' + text;
  }
  return text;
}

function slugifyIdentifier(value, prefix, seed) {
  const base = sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base) {
    return base.slice(0, 80);
  }
  const safePrefix = sanitizeText(prefix) || 'id';
  const suffix = seed !== undefined && seed !== null ? sanitizeText(seed) : String(new Date().getTime());
  return (safePrefix || 'id') + '-' + (suffix || '1');
}

// ============================================================================
// Signal Normalization and Merging
// ============================================================================

function normalizeSignalList(rawSignals, defaultSource) {
  return ensureArray(rawSignals)
    .map(function(entry) {
      return normalizeSignalEntry(entry, defaultSource);
    })
    .filter(Boolean);
}

function normalizeSignalEntry(raw, defaultSource) {
  if (!raw) {
    return null;
  }
  if (typeof raw === 'string') {
    const label = sanitizeText(raw);
    return label ? { label: label, source: defaultSource || '' } : null;
  }
  if (typeof raw !== 'object') {
    return null;
  }
  const label = sanitizeText(raw.label || raw.canonical || raw.name || '');
  if (!label) {
    return null;
  }
  const entry = {
    label: label
  };
  const source = sanitizeText(raw.source || defaultSource || '');
  if (source) {
    entry.source = source;
  }
  if (raw.confidence !== undefined && raw.confidence !== null && !isNaN(raw.confidence)) {
    entry.confidence = Number(raw.confidence);
  }
  if (Array.isArray(raw.evidence) && raw.evidence.length > 0) {
    entry.evidence = raw.evidence
      .filter(function(item) { return item !== undefined && item !== null && item !== ''; })
      .map(function(item) { return String(item); })
      .slice(0, 4);
  }
  if (raw.notes) {
    entry.notes = sanitizeText(raw.notes);
  }
  return entry;
}

function mergeSignalLists(overrides, automated) {
  const merged = [];
  const indexByLabel = {};
  function append(entry) {
    if (!entry || !entry.label) {
      return;
    }
    const key = entry.label.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(indexByLabel, key)) {
      const existing = merged[indexByLabel[key]];
      if (entry.source && !existing.source) {
        existing.source = entry.source;
      }
      if (entry.confidence !== undefined && entry.confidence !== null) {
        const existingConfidence = existing.confidence !== undefined && existing.confidence !== null
          ? Number(existing.confidence)
          : 0;
        const incomingConfidence = Number(entry.confidence);
        if (!isNaN(incomingConfidence)) {
          existing.confidence = existingConfidence > incomingConfidence ? existingConfidence : incomingConfidence;
        }
      }
      if (Array.isArray(entry.evidence) && entry.evidence.length > 0) {
        existing.evidence = existing.evidence || [];
        entry.evidence.forEach(function(item) {
          if (existing.evidence.length >= CLIENT_CONTEXT_MAX_SIGNALS) {
            return;
          }
          const value = String(item);
          if (existing.evidence.indexOf(value) === -1) {
            existing.evidence.push(value);
          }
        });
      }
      return;
    }
    indexByLabel[key] = merged.length;
    merged.push(entry);
  }
  overrides.forEach(append);
  automated.forEach(append);
  return merged.slice(0, CLIENT_CONTEXT_MAX_SIGNALS);
}

// ============================================================================
// Keyword Signal Collection
// ============================================================================

function collectKeywordSignals(text, keywordConfig, sourceLabel) {
  const normalizedText = sanitizeText(text).toLowerCase();
  if (!normalizedText) {
    return [];
  }
  const matches = [];
  keywordConfig.forEach(function(entry) {
    if (!entry || !entry.label || !Array.isArray(entry.keywords)) {
      return;
    }
    const evidence = entry.keywords
      .map(function(keyword) { return sanitizeText(keyword).toLowerCase(); })
      .filter(function(keyword) {
        return keyword && normalizedText.indexOf(keyword) !== -1;
      });
    if (evidence.length > 0) {
      matches.push(normalizeSignalEntry({
        label: entry.label,
        source: sourceLabel,
        evidence: evidence.slice(0, 3),
        confidence: Math.min(1, evidence.length / 2)
      }, sourceLabel));
    }
  });
  return matches;
}

// ============================================================================
// Workflow Signal Inference
// ============================================================================

function inferWorkflowSignalsFromContent(options) {
  const settings = options || {};
  const textParts = [];
  const appendText = function(value) {
    const sanitized = sanitizeText(value);
    if (sanitized) {
      textParts.push(sanitized);
    }
  };
  const briefType = typeof settings.briefType === 'string' && settings.briefType
    ? settings.briefType
    : BRIEF_TYPE_DEFAULT;

  appendText(settings.briefText);
  appendText(settings.reviewerNotes);

  if (Array.isArray(settings.pdfSummaries)) {
    settings.pdfSummaries.forEach(function(summary) {
      if (!summary) {
        return;
      }
      const text = summary.text || '';
      if (!text) {
        return;
      }
      if (text.indexOf('(PDF summary unavailable') !== -1 || text.indexOf('(Unable to read attachment') !== -1) {
        return;
      }
      appendText(text);
    });
  }

  if (Array.isArray(settings.answers)) {
    settings.answers.forEach(function(answer) {
      if (!answer) {
        return;
      }
      const question = sanitizeText(answer.question);
      const response = sanitizeText(answer.answer);
      appendText([question, response].filter(Boolean).join(' '));
    });
  }

  const combined = textParts.join(' ').trim();
  if (!combined) {
    return [];
  }

  const normalizedText = combined.toLowerCase();
  const normalizedPlain = normalizedText
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizedPlain) {
    return [];
  }
  const paddedPlain = ' ' + normalizedPlain + ' ';

  const scoreMap = {};
  const evidenceMap = {};

  const recordHit = function(canonical, deltaScore, evidenceLabel) {
    if (!canonical) {
      return;
    }
    const resolved = typeof mapWorkflowCanonical === 'function'
      ? (mapWorkflowCanonical(canonical) || canonical)
      : canonical;
    if (!resolved || !MANDATORY_CATEGORY_SET.has(resolved)) {
      return;
    }
    const increment = deltaScore !== undefined && deltaScore !== null && !isNaN(deltaScore)
      ? Number(deltaScore)
      : 0.5;
    scoreMap[resolved] = (scoreMap[resolved] || 0) + increment;
    if (evidenceLabel) {
      if (!evidenceMap[resolved]) {
        evidenceMap[resolved] = [];
      }
      if (evidenceMap[resolved].length < 6 && evidenceMap[resolved].indexOf(evidenceLabel) === -1) {
        evidenceMap[resolved].push(evidenceLabel);
      }
    }
  };

  Object.keys(workflowTaxonomyMap).forEach(function(canonical) {
    const entry = workflowTaxonomyMap[canonical];
    const synonyms = Array.isArray(entry.synonyms) ? entry.synonyms : [];
    const weight = entry.weight || 1;
    const seenSynonyms = new Set();
    synonyms.forEach(function(synonym) {
      const normalizedSyn = sanitizeText(synonym)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalizedSyn || seenSynonyms.has(normalizedSyn)) {
        return;
      }
      seenSynonyms.add(normalizedSyn);
      if (normalizedSyn.length < 2) {
        return;
      }
      const token = ' ' + normalizedSyn + ' ';
      if (paddedPlain.indexOf(token) !== -1) {
        recordHit(canonical, Math.max(0.4, weight * 0.8), 'synonym:' + synonym);
      }
    });
  });

  const taxonomyEnabled = typeof isEnhancedTaxonomyEnabled === 'function' ? isEnhancedTaxonomyEnabled() : false;
  const taxonomyLookup = (taxonomyEnabled && typeof getBriefTypePhaseTaxonomy === 'function')
    ? getBriefTypePhaseTaxonomy(briefType)
    : null;
  if (taxonomyLookup) {
    const taxonomyLogSet = new Set();
    Object.keys(taxonomyLookup).forEach(function(canonical) {
      const entry = taxonomyLookup[canonical] || {};
      const phrases = []
        .concat(entry.keywords || [])
        .concat(entry.key_deliverables_examples || [])
        .concat(entry.positive_signals || []);
      const seenTaxonomy = new Set();
      phrases.forEach(function(rawValue) {
        const normalizedValue = sanitizeText(rawValue)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!normalizedValue || seenTaxonomy.has(normalizedValue)) {
          return;
        }
        seenTaxonomy.add(normalizedValue);
        const token = ' ' + normalizedValue + ' ';
        if (paddedPlain.indexOf(token) !== -1) {
          recordHit(canonical, Math.max(0.5, 0.9), 'taxonomy:' + rawValue);
          const logKey = (briefType || '') + '|' + canonical + '|' + normalizedValue;
          if (!taxonomyLogSet.has(logKey) && typeof logAIEvent === 'function') {
            taxonomyLogSet.add(logKey);
            try {
              logAIEvent('workflow.signal.taxonomy', {
                briefType: briefType || '',
                canonical: canonical,
                phrase: rawValue,
                source: 'taxonomy'
              });
            } catch (logError) {
              try { UnifiedLogger.warn('AISidebar', 'workflow signal taxonomy log failed', String(logError)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
            }
          }
        }
      });
    });
  } else {
    const reason = taxonomyEnabled ? 'no-entry' : 'feature-disabled';
    const logKey = (briefType || 'default') + ':' + reason;
    if (!TAXONOMY_MISSING_LOG.has(logKey)) {
      TAXONOMY_MISSING_LOG.add(logKey);
      if (typeof logAIEvent === 'function') {
        try {
          logAIEvent('workflow.signal.taxonomy.missing', {
            briefType: briefType || '',
            reason: reason
          });
        } catch (logError) {
          try { UnifiedLogger.warn('AISidebar', 'workflow signal taxonomy missing log failed', String(logError)); } catch (ignore) {
      // UnifiedLogger unavailable during bootstrap
    }
        }
      }
    }
  }

  return Object.keys(scoreMap).map(function(canonical) {
    const totalScore = scoreMap[canonical];
    const entry = workflowTaxonomyMap[canonical] || {};
    const weight = entry.weight || 1;
    const normalizedScore = Math.min(1, totalScore / (weight * 2));
    return {
      canonical: canonical,
      score: Number(normalizedScore.toFixed(2)),
      evidence: (evidenceMap[canonical] || []).slice(0, 4)
    };
  }).sort(function(a, b) {
    return (b.score || 0) - (a.score || 0);
  });
}

function mergeWorkflowSignalLists(primary, secondary) {
  const entries = {};
  const append = function(entry, sourceTag) {
    if (!entry || !entry.canonical) {
      return;
    }
    const canonical = typeof mapWorkflowCanonical === 'function'
      ? (mapWorkflowCanonical(entry.canonical) || entry.canonical)
      : entry.canonical;
    if (!canonical || !MANDATORY_CATEGORY_SET.has(canonical)) {
      return;
    }
    if (!entries[canonical]) {
      entries[canonical] = {
        canonical: canonical,
        score: 0,
        evidence: [],
        sources: []
      };
    }
    const target = entries[canonical];
    const scoreValue = entry.score !== undefined && entry.score !== null && !isNaN(entry.score)
      ? Number(entry.score)
      : 0;
    target.score = Math.max(target.score, Math.min(1, scoreValue));
    const evidenceList = Array.isArray(entry.evidence)
      ? entry.evidence
      : (entry.evidence ? [entry.evidence] : []);
    evidenceList.forEach(function(evidence) {
      const label = sanitizeText(evidence);
      if (!label) {
        return;
      }
      if (target.evidence.indexOf(label) === -1 && target.evidence.length < 6) {
        target.evidence.push(label);
      }
    });
    if (sourceTag && target.sources.indexOf(sourceTag) === -1 && target.sources.length < 6) {
      target.sources.push(sourceTag);
    }
  };

  ensureArray(primary).forEach(function(entry) {
    append(entry, 'scope');
  });
  ensureArray(secondary).forEach(function(entry) {
    append(entry, 'brief');
  });

  return Object.keys(entries).map(function(canonical) {
    const entry = entries[canonical];
    const score = entry.score || 0.4;
    const payload = {
      canonical: canonical,
      score: Number(Math.min(1, score).toFixed(2)),
      evidence: entry.evidence
    };
    if (entry.sources && entry.sources.length > 0) {
      payload.sources = entry.sources;
    }
    return payload;
  }).sort(function(a, b) {
    return (b.score || 0) - (a.score || 0);
  });
}

// Global exports for backward compatibility
if (typeof globalThis !== 'undefined') {
}

// ============================================================================
// Scope Summarization
// ============================================================================

function summarizeScopeForSignals(scope) {
  if (!scope || typeof scope !== 'object') {
    return '';
  }
  const parts = [];
  ['projectName', 'clientName', 'sourceSummary'].forEach(function(key) {
    if (scope[key]) {
      parts.push(scope[key]);
    }
  });
  ['assumptions', 'warnings', 'questions', 'services', 'retainers', 'campaigns', 'channels'].forEach(function(key) {
    const value = scope[key];
    if (Array.isArray(value) && value.length > 0) {
      parts.push(value.join(' '));
    } else if (value) {
      parts.push(value);
    }
  });
  if (scope.usage) {
    if (scope.usage.region) {
      parts.push(scope.usage.region);
    }
    if (scope.usage.notes) {
      parts.push(scope.usage.notes);
    }
  }
  if (scope.budget) {
    if (scope.budget.notes) {
      parts.push(scope.budget.notes);
    }
  }
  if (Array.isArray(scope.scopeEntries)) {
    scope.scopeEntries.slice(0, 12).forEach(function(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      if (entry.scopeLabel) {
        parts.push(entry.scopeLabel);
      }
      if (Array.isArray(entry.deliverables) && entry.deliverables.length > 0) {
        parts.push(entry.deliverables.join(' '));
      }
      if (Array.isArray(entry.notes) && entry.notes.length > 0) {
        parts.push(entry.notes.join(' '));
      }
      if (Array.isArray(entry.resources) && entry.resources.length > 0) {
        entry.resources.slice(0, 6).forEach(function(resource) {
          if (resource && resource.role) {
            parts.push(resource.role);
          }
        });
      }
    });
  }
  return parts.join(' ');
}

// ============================================================================
// Usage Region Signal Extraction
// ============================================================================

function extractUsageRegionSignal(scope) {
  if (!scope || !scope.usage) {
    return null;
  }
  const regionValue = scope.usage.region || scope.usage.territory;
  if (!regionValue) {
    return null;
  }
  const label = resolveUsageRegionLabel(regionValue);
  if (!label) {
    return null;
  }
  return normalizeSignalEntry({
    label: label,
    source: 'scope.usage',
    evidence: [String(regionValue)]
  }, 'scope.usage');
}

function resolveUsageRegionLabel(value) {
  const text = sanitizeText(value);
  if (!text) {
    return '';
  }
  const normalized = text.toLowerCase();
  for (var key in USAGE_RIGHTS_REGION_MAP) {
    if (!Object.prototype.hasOwnProperty.call(USAGE_RIGHTS_REGION_MAP, key)) {
      continue;
    }
    const candidates = USAGE_RIGHTS_REGION_MAP[key];
    if (!Array.isArray(candidates)) {
      continue;
    }
    for (let i = 0; i < candidates.length; i++) {
      const keyword = sanitizeText(candidates[i]).toLowerCase();
      if (keyword && normalized.indexOf(keyword) !== -1) {
        return USAGE_RIGHTS_REGION_LABELS[key] || text;
      }
    }
  }
  return text;
}

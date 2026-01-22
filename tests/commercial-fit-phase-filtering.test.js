/**
 * Tests for filterCandidatesByPhaseHint_() function
 *
 * Source: App-script/05_AISidebar_Processing.js (lines 2650-2692)
 *
 * Function Purpose:
 * Filters commercial fit candidates by phase hint using pre-built prefix index.
 * Returns candidates that match the current phase based on SKU prefix metadata.
 *
 * Test Coverage:
 * - Filtering behavior (matching phases, non-matching phases)
 * - Phase normalization (case/whitespace variations)
 * - Edge cases (no SKU, no phase hint, no index)
 * - BriefType matching (correct index lookup)
 * - Empty inputs (null, undefined, empty arrays)
 *
 * Note: Functions copied from GAS file since GAS doesn't use module.exports.
 * Will refactor to proper imports in Phase 12 god object split.
 */

// ============================================================================
// FUNCTIONS UNDER TEST (copied from 05_AISidebar_Processing.js)
// ============================================================================

// normalizePhaseCanonical_ (lines 2561-2590)
function normalizePhaseCanonical_(phaseName) {
  if (!phaseName) {
    return '';
  }

  const normalized = String(phaseName).trim().toLowerCase();

  // Standard canonical phases (9 total)
  const STANDARD_PHASES = [
    'strategy-account',
    'planning-architecture',
    'asset-development',
    'pre-production',
    'production',
    'post-production',
    'distribution-community',
    'measurement-reporting',
    'deliverable-management'
  ];

  // Log warning if phase doesn't match standards (helps catch typos)
  if (normalized && STANDARD_PHASES.indexOf(normalized) === -1) {
    UnifiedLogger.verbose('CommercialFit', 'Non-standard phase canonical detected', {
      original: phaseName,
      normalized: normalized
    });
  }

  return normalized;
}

// filterCandidatesByPhaseHint_ (lines 2650-2692)
function filterCandidatesByPhaseHint_(candidates, canonical, briefType, prefixIndex) {
  if (!Array.isArray(candidates) || !canonical || !prefixIndex) {
    if (Array.isArray(candidates) && candidates.length > 0 && !prefixIndex) {
      UnifiedLogger.verbose('CommercialFit', 'Phase filtering skipped - no prefix index', {
        candidateCount: candidates.length
      });
    }
    return candidates;
  }

  return candidates.filter(function(candidate) {
    if (!candidate.sku) {
      return true; // Keep if no SKU
    }

    // Extract prefix from SKU
    // Assumes format: PREFIX-NUMBER (e.g., "STR-001", "DEV-042")
    // Handles multi-dash SKUs: "STR-SUB-001" → "STR-"
    // Note: SKUs without dashes won't match any prefix
    const prefix = candidate.sku.split('-')[0] + '-';

    // Option A (strict): Lookup metadata by briefType only (no wildcard fallback)
    let metadata = null;
    if (briefType && prefixIndex[briefType] && prefixIndex[briefType][prefix]) {
      metadata = prefixIndex[briefType][prefix];
    }

    if (!metadata || !metadata.phaseHint) {
      return true; // Keep if no phase hint
    }

    // Normalize current phase
    const normalizedCanonical = normalizePhaseCanonical_(canonical);

    // Parse and normalize allowed phases
    const allowedPhases = metadata.phaseHint.split(',').map(function(p) {
      return normalizePhaseCanonical_(p);
    });

    // Compare normalized values
    return allowedPhases.indexOf(normalizedCanonical) !== -1;
  });
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('filterCandidatesByPhaseHint_', () => {
  // Mock prefix index structure
  const mockPrefixIndex = {
    'smm-retainer': {
      'STR-': {
        category: 'Strategy',
        phaseHint: 'strategy-account, planning-architecture'
      },
      'DEV-': {
        category: 'Development',
        phaseHint: 'asset-development, pre-production'
      },
      'PROD-': {
        category: 'Production',
        phaseHint: 'production'
      },
      'POST-': {
        category: 'Post-Production',
        phaseHint: 'post-production'
      }
    },
    'content-marketing': {
      'CM-': {
        category: 'Content',
        phaseHint: 'strategy-account, asset-development, distribution-community'
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('filtering behavior', () => {
    test('filters candidates by matching phase hint', () => {
      const candidates = [
        { sku: 'STR-001', name: 'Strategy Item' },
        { sku: 'DEV-042', name: 'Development Item' },
        { sku: 'PROD-100', name: 'Production Item' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account',
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe('STR-001');
    });

    test('includes candidates matching multiple phases', () => {
      const candidates = [
        { sku: 'STR-001', name: 'Strategy Item' }, // Matches both strategy-account and planning-architecture
        { sku: 'DEV-042', name: 'Development Item' }
      ];

      // Test with first phase
      const result1 = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account',
        'smm-retainer',
        mockPrefixIndex
      );
      expect(result1).toHaveLength(1);
      expect(result1[0].sku).toBe('STR-001');

      // Test with second phase
      const result2 = filterCandidatesByPhaseHint_(
        candidates,
        'planning-architecture',
        'smm-retainer',
        mockPrefixIndex
      );
      expect(result2).toHaveLength(1);
      expect(result2[0].sku).toBe('STR-001');
    });

    test('excludes candidates that do not match phase', () => {
      const candidates = [
        { sku: 'STR-001', name: 'Strategy Item' },
        { sku: 'DEV-042', name: 'Development Item' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'production', // Neither STR- nor DEV- match production
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(0);
    });

    test('filters correctly with single-phase hints', () => {
      const candidates = [
        { sku: 'PROD-100', name: 'Production Item' },
        { sku: 'DEV-042', name: 'Development Item' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'production',
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe('PROD-100');
    });
  });

  describe('phase normalization', () => {
    test('handles phase name variations (case)', () => {
      const candidates = [{ sku: 'STR-001', name: 'Strategy Item' }];

      // Different case variations should all match
      const result1 = filterCandidatesByPhaseHint_(candidates, 'Strategy-Account', 'smm-retainer', mockPrefixIndex);
      const result2 = filterCandidatesByPhaseHint_(candidates, 'STRATEGY-ACCOUNT', 'smm-retainer', mockPrefixIndex);
      const result3 = filterCandidatesByPhaseHint_(candidates, 'strategy-account', 'smm-retainer', mockPrefixIndex);

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
      expect(result3).toHaveLength(1);
    });

    test('handles phase name variations (whitespace)', () => {
      const candidates = [{ sku: 'STR-001', name: 'Strategy Item' }];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        ' strategy-account ',
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
    });

    test('handles combined case and whitespace variations', () => {
      const candidates = [{ sku: 'STR-001', name: 'Strategy Item' }];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        '  Strategy-Account  ',
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('edge cases - candidates without SKU', () => {
    test('keeps candidates without SKU', () => {
      const candidates = [
        { sku: null, name: 'No SKU Item' },
        { sku: 'STR-001', name: 'Has SKU' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'production', // STR-001 won't match
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('No SKU Item');
    });

    test('keeps candidates with undefined SKU', () => {
      const candidates = [
        { name: 'Undefined SKU' }, // No sku property
        { sku: 'DEV-042', name: 'Has SKU' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account', // DEV-042 won't match
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Undefined SKU');
    });

    test('keeps candidates with empty string SKU', () => {
      const candidates = [
        { sku: '', name: 'Empty SKU' },
        { sku: 'DEV-042', name: 'Has SKU' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account',
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Empty SKU');
    });
  });

  describe('edge cases - no prefix index', () => {
    test('returns all candidates when prefixIndex is null', () => {
      const candidates = [
        { sku: 'STR-001', name: 'Item 1' },
        { sku: 'DEV-042', name: 'Item 2' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account',
        'smm-retainer',
        null // No index
      );

      expect(result).toHaveLength(2);
      expect(UnifiedLogger.verbose).toHaveBeenCalledWith(
        'CommercialFit',
        'Phase filtering skipped - no prefix index',
        { candidateCount: 2 }
      );
    });

    test('returns all candidates when prefixIndex is undefined', () => {
      const candidates = [
        { sku: 'STR-001', name: 'Item 1' },
        { sku: 'DEV-042', name: 'Item 2' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account',
        'smm-retainer',
        undefined
      );

      expect(result).toHaveLength(2);
    });
  });

  describe('edge cases - no phase hint in metadata', () => {
    test('keeps candidates when prefix has no phase hint', () => {
      const indexWithoutHint = {
        'smm-retainer': {
          'STR-': {
            category: 'Strategy',
            phaseHint: null // No hint
          }
        }
      };

      const candidates = [{ sku: 'STR-001', name: 'Strategy Item' }];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'production',
        'smm-retainer',
        indexWithoutHint
      );

      expect(result).toHaveLength(1);
    });

    test('keeps candidates when prefix not in index', () => {
      const candidates = [
        { sku: 'UNKNOWN-001', name: 'Unknown Prefix' },
        { sku: 'STR-001', name: 'Known Prefix' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'production',
        'smm-retainer',
        mockPrefixIndex
      );

      // UNKNOWN-001 kept (no metadata), STR-001 filtered out (doesn't match production)
      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe('UNKNOWN-001');
    });
  });

  describe('briefType matching', () => {
    test('uses correct briefType index', () => {
      const candidates = [
        { sku: 'CM-001', name: 'Content Marketing Item' },
        { sku: 'STR-001', name: 'Strategy Item' } // STR- not in content-marketing index, so kept
      ];

      // content-marketing index has CM- with strategy-account phase
      const result = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account',
        'content-marketing',
        mockPrefixIndex
      );

      // Both kept: CM-001 matches phase, STR-001 has no metadata (prefix not in content-marketing index)
      expect(result).toHaveLength(2);
      expect(result.find(c => c.sku === 'CM-001')).toBeDefined();
      expect(result.find(c => c.sku === 'STR-001')).toBeDefined();
    });

    test('returns all candidates when briefType not in index', () => {
      const candidates = [
        { sku: 'STR-001', name: 'Item 1' },
        { sku: 'DEV-042', name: 'Item 2' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account',
        'unknown-brief-type',
        mockPrefixIndex
      );

      // No filtering happens when briefType not found
      expect(result).toHaveLength(2);
    });

    test('handles null briefType', () => {
      const candidates = [
        { sku: 'STR-001', name: 'Item 1' }
      ];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        'strategy-account',
        null,
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('empty inputs', () => {
    test('returns empty array for empty candidates', () => {
      const result = filterCandidatesByPhaseHint_(
        [],
        'strategy-account',
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toEqual([]);
    });

    test('returns candidates unchanged when canonical is empty', () => {
      const candidates = [{ sku: 'STR-001', name: 'Item' }];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        '',
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
    });

    test('returns candidates unchanged when canonical is null', () => {
      const candidates = [{ sku: 'STR-001', name: 'Item' }];

      const result = filterCandidatesByPhaseHint_(
        candidates,
        null,
        'smm-retainer',
        mockPrefixIndex
      );

      expect(result).toHaveLength(1);
    });
  });
});

/**
 * Tests for normalizePhaseCanonical_() function
 *
 * Source: App-script/05_AISidebar_Processing.js (lines 2561-2590)
 *
 * Function Purpose:
 * Normalizes phase names to canonical lowercase format with trimmed whitespace.
 * Logs verbose warnings for non-standard phase names to help catch typos.
 *
 * Test Coverage:
 * - Normalization behavior (lowercase, trim, combined)
 * - Edge cases (null, undefined, empty)
 * - Standard phase validation (no logging)
 * - Non-standard phase detection (verbose logging)
 *
 * Note: Function copied from GAS file since GAS doesn't use module.exports.
 * Will refactor to proper imports in Phase 12 god object split.
 */

// ============================================================================
// FUNCTION UNDER TEST (copied from 05_AISidebar_Processing.js:2561-2590)
// ============================================================================

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

// ============================================================================
// TEST SUITE
// ============================================================================

describe('normalizePhaseCanonical_', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalization behavior', () => {
    test('converts to lowercase', () => {
      expect(normalizePhaseCanonical_('Strategy-Account')).toBe('strategy-account');
      expect(normalizePhaseCanonical_('STRATEGY-ACCOUNT')).toBe('strategy-account');
    });

    test('trims whitespace', () => {
      expect(normalizePhaseCanonical_(' strategy-account ')).toBe('strategy-account');
      expect(normalizePhaseCanonical_('  strategy-account  ')).toBe('strategy-account');
    });

    test('handles combined case and whitespace', () => {
      expect(normalizePhaseCanonical_(' Strategy-Account ')).toBe('strategy-account');
      expect(normalizePhaseCanonical_('  PLANNING-ARCHITECTURE  ')).toBe('planning-architecture');
    });

    test('preserves hyphens in phase names', () => {
      expect(normalizePhaseCanonical_('strategy-account')).toBe('strategy-account');
      expect(normalizePhaseCanonical_('asset-development')).toBe('asset-development');
    });
  });

  describe('edge cases', () => {
    test('returns empty string for null', () => {
      expect(normalizePhaseCanonical_(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
      expect(normalizePhaseCanonical_(undefined)).toBe('');
    });

    test('returns empty string for empty string', () => {
      expect(normalizePhaseCanonical_('')).toBe('');
    });

    test('returns empty string for whitespace-only string', () => {
      expect(normalizePhaseCanonical_('   ')).toBe('');
    });
  });

  describe('standard phase validation', () => {
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

    test('does NOT log for standard phases', () => {
      STANDARD_PHASES.forEach(phase => {
        normalizePhaseCanonical_(phase);
      });
      expect(UnifiedLogger.verbose).not.toHaveBeenCalled();
    });

    test('does NOT log for standard phases with case variations', () => {
      normalizePhaseCanonical_('Strategy-Account');
      normalizePhaseCanonical_('PLANNING-ARCHITECTURE');
      normalizePhaseCanonical_(' asset-development ');

      expect(UnifiedLogger.verbose).not.toHaveBeenCalled();
    });

    test('recognizes all 9 standard phases', () => {
      expect(STANDARD_PHASES).toHaveLength(9);

      // Verify each standard phase normalizes without logging
      STANDARD_PHASES.forEach(phase => {
        const result = normalizePhaseCanonical_(phase);
        expect(result).toBe(phase);
      });

      expect(UnifiedLogger.verbose).not.toHaveBeenCalled();
    });
  });

  describe('non-standard phase detection', () => {
    test('logs verbose warning for non-standard phase', () => {
      normalizePhaseCanonical_('custom-phase');

      expect(UnifiedLogger.verbose).toHaveBeenCalledWith(
        'CommercialFit',
        'Non-standard phase canonical detected',
        expect.objectContaining({
          original: 'custom-phase',
          normalized: 'custom-phase'
        })
      );
    });

    test('logs verbose warning with original casing preserved', () => {
      normalizePhaseCanonical_('Custom-Phase');

      expect(UnifiedLogger.verbose).toHaveBeenCalledWith(
        'CommercialFit',
        'Non-standard phase canonical detected',
        expect.objectContaining({
          original: 'Custom-Phase',
          normalized: 'custom-phase'
        })
      );
    });

    test('does NOT log for empty strings', () => {
      normalizePhaseCanonical_('');
      normalizePhaseCanonical_(null);
      normalizePhaseCanonical_(undefined);

      expect(UnifiedLogger.verbose).not.toHaveBeenCalled();
    });

    test('logs for typos in standard phase names', () => {
      // Common typos that should be caught
      normalizePhaseCanonical_('straegy-account'); // missing 't'
      normalizePhaseCanonical_('asset-developement'); // 'e' instead of 'o'

      expect(UnifiedLogger.verbose).toHaveBeenCalledTimes(2);
    });
  });
});

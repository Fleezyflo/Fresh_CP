/**
 * DEPRECATED: Scope phases extraction diagnostic
 *
 * This diagnostic is NO LONGER RELEVANT because:
 * - getExpandedTaxonomyData() function has been DELETED (3500+ lines of hardcoded taxonomy)
 * - Config: Scope Phases sheet is now populated from CSV import or manual entry
 * - getBriefTypeTaxonomyMap() now reads FROM the Config: Scope Phases sheet (not hardcoded data)
 * - There is NO MORE "extraction from taxonomy" - the sheet IS the source of truth
 *
 * To verify scope phases are working:
 * 1. Check that Config: Scope Phases sheet has data (should already be populated)
 * 2. Run: diagnoseScopePhasesLoad() to verify ConfigurationManager can load the data
 * 3. Run scope extraction in the UI to verify it works end-to-end
 */

function diagnoseScopePhasesExtraction() {
  console.log('=== DEPRECATED DIAGNOSTIC ===');
  console.log('This diagnostic is no longer relevant.');
  console.log('getExpandedTaxonomyData() has been DELETED.');
  console.log('Use diagnoseScopePhasesLoad() instead to verify Config: Scope Phases sheet loading.');
}

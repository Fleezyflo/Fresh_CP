/**
 * Check what's being sent to the LLM in the prompt
 */
function diagnosePrompt() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PROMPT DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════');

  const briefType = 'smm-retainer';

  // Check phase canonicals
  console.log('\n1. Phase Canonicals for:', briefType);
  const phaseCanonicals = getScopePhaseCanonicals(briefType);
  console.log('   Count:', phaseCanonicals.length);
  console.log('   Values:', phaseCanonicals.join(', '));

  // Check phase guidance
  console.log('\n2. Phase Guidance:');
  const phaseGuidance = buildPhaseGuidanceForPrompt(briefType);
  console.log(phaseGuidance || '   (none)');

  // Check brief profile
  console.log('\n3. Brief Profile:');
  const briefProfile = getBriefProfile(briefType);
  console.log('   Label:', briefProfile.label);
  console.log('   Nudge:', briefProfile.nudge);
  console.log('   Section order:', Array.isArray(briefProfile.sectionOrder) ? briefProfile.sectionOrder.join(', ') : '(none)');

  // Check config
  console.log('\n4. Scope Category Config:');
  const config = getScopeCategoryConfig(briefType);
  if (config && config.phases) {
    console.log('   Phases:', config.phases.length);
    console.log('   First 3:');
    config.phases.slice(0, 3).forEach(function(p) {
      console.log('     - canonical:', p.canonical, ', label:', p.label);
    });
  } else {
    console.log('   ❌ NO CONFIG');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
}

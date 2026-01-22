/**
 * Feature Flags System
 * Runtime control of feature availability (separate from module loading timing)
 *
 * Key distinction:
 * - ModuleLoader (Menu.js stages): WHEN to load (timing: Stage 1/2/3)
 * - FeatureFlags: IF to enable (conditional: on/off, A/B testing)
 *
 * Phase C (v3.1): Contract Artifact PC-A002
 */

const FeatureFlags = {
  // Default flags
  defaults: {
    XERO_SYNC: true,
    AI_SIDEBAR: true,
    ADVANCED_DIAGNOSTICS: false, // Admin-only
    EXPERIMENTAL_BATCH_PROCESSING: false
  },

  /**
   * Check if a feature flag is enabled
   * @param {string} flagName - Name of the feature flag
   * @return {boolean} True if enabled
   */
  isEnabled: function(flagName) {
    try {
      // PropertiesCache has been deprecated - using defaults only
      // TODO: Consider using ConfigurationManager for runtime overrides

      // Use default value
      return this.defaults[flagName] === true;
    } catch (error) {
      // Fallback logging (UnifiedLogger may fail in error states)
      console.error('[FeatureFlags] isEnabled failed for ' + flagName, error);
      return this.defaults[flagName] === true; // Fallback to default on error
    }
  },

  /**
   * Set a feature flag (runtime control, persists in cache)
   * @param {string} flagName - Name of the feature flag
   * @param {boolean} enabled - True to enable, false to disable
   */
  setFlag: function(flagName, enabled) {
    try {
      // PropertiesCache has been deprecated - runtime overrides no longer supported
      // TODO: Consider using ConfigurationManager for runtime overrides
      console.warn('[FeatureFlags] Runtime flag overrides not available without PropertiesCache', { flagName: flagName, enabled: enabled });
    } catch (error) {
      // Fallback logging (UnifiedLogger may fail in error states)
      console.error('[FeatureFlags] setFlag failed', error);
    }
  },

  /**
   * Get all flags (current state)
   * @return {Object} All flags with current values
   */
  getAllFlags: function() {
    const flags = {};
    for (const name in this.defaults) {
      flags[name] = this.isEnabled(name);
    }
    return flags;
  },

  /**
   * Reset flag to default value
   * @param {string} flagName - Name of the feature flag
   */
  resetFlag: function(flagName) {
    try {
      if (typeof deleteCachedPropertyNS === 'function') {
        deleteCachedPropertyNS('featureFlags', flagName);
        UnifiedLogger.info('FeatureFlags', 'Reset flag to default', { flagName: flagName });
      }
    } catch (error) {
      // Fallback logging (UnifiedLogger may fail in error states)
      console.error('[FeatureFlags] resetFlag failed', error);
    }
  },

  /**
   * Reset all flags to defaults
   */
  resetAllFlags: function() {
    try {
      if (typeof clearNamespace === 'function') {
        clearNamespace('featureFlags');
        UnifiedLogger.info('FeatureFlags', 'Reset all flags to defaults');
      }
    } catch (error) {
      // Fallback logging (UnifiedLogger may fail in error states)
      console.error('[FeatureFlags] resetAllFlags failed', error);
    }
  },

  /**
   * Get feature flag statistics
   * @return {Object} Statistics about flags
   */
  getStats: function() {
    const all = this.getAllFlags();
    let enabledCount = 0;
    let disabledCount = 0;

    for (const name in all) {
      if (all[name]) {
        enabledCount++;
      } else {
        disabledCount++;
      }
    }

    return {
      total: Object.keys(all).length,
      enabled: enabledCount,
      disabled: disabledCount,
      flags: all
    };
  }
};

// Export globally

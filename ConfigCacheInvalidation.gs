/**
 * Configuration Cache Invalidation
 * Detects manual edits to config sheets and invalidates cache automatically (FIX-005)
 *
 * @fileoverview This module provides automatic cache invalidation when config sheets are edited.
 * When a user manually edits any of the 8 config sheets, the corresponding cache is cleared
 * to ensure fresh data is loaded on next access.
 */

// Config sheet names that trigger cache invalidation
var CONFIG_SHEET_NAMES = [
  'Config: Brief Profiles',
  'Config: Scope Phases',
  'Config: Phase Taxonomy Overrides',
  'Config: Catalog Prefixes',
  'Config: Resource Catalog',
  'Config: Scope Catalog',
  'Config: Column Map',
  'Config: Commercial Panel'
];

// Map config sheet names to cache keys
var CONFIG_SHEET_TO_CACHE_KEY = {
  'Config: Brief Profiles': 'briefProfiles',
  'Config: Scope Phases': 'phaseMap',
  'Config: Phase Taxonomy Overrides': 'phaseTaxonomyOverrides',
  'Config: Catalog Prefixes': 'catalogPrefixes',
  'Config: Resource Catalog': 'resourceCatalog',
  'Config: Scope Catalog': 'scopeCatalog',
  'Config: Column Map': 'columnMap',
  'Config: Commercial Panel': 'commercialPanelConfig'
};

/**
 * onEdit trigger - called automatically when any cell is edited
 * @param {Object} e - Edit event object
 */
function onEdit(e) {
  try {
    // Check if edit occurred in a config sheet
    var sheet = e.source.getActiveSheet();
    if (!sheet) return;

    var sheetName = sheet.getName();

    // Check if this is a config sheet
    if (CONFIG_SHEET_NAMES.indexOf(sheetName) === -1) {
      return;  // Not a config sheet, ignore
    }

    // Get cache key for this sheet
    var cacheKey = CONFIG_SHEET_TO_CACHE_KEY[sheetName];
    if (!cacheKey) {
      return;
    }

    // Invalidate cache for this config
    invalidateConfigCache(cacheKey, sheetName);

    // Log the invalidation
    logConfigCacheInvalidation(sheetName, cacheKey, e);

  } catch (error) {
    // Silent failure - don't interrupt user's edit
    try {
      if (typeof logConfigEvent_ === 'function') {
        logConfigEvent_('ERROR', 'onEdit trigger failed', {
          error: String(error),
          message: error.message,
          stack: error.stack
        });
      }
    } catch (ignore) {
      // Last resort - do nothing
    }
  }
}

/**
 * Invalidate cache for a specific config
 * @param {string} cacheKey - Cache key to invalidate
 * @param {string} sheetName - Config sheet name
 */
function invalidateConfigCache(cacheKey, sheetName) {
  try {
    // Phase A (v3.1): Clear PropertiesCache 'config' namespace entry
    if (typeof deleteCachedPropertyNS === 'function') {
      deleteCachedPropertyNS('config', cacheKey);
    }

    // Clear snapshot cache in Script Properties
    if (typeof PropertiesService !== 'undefined') {
      var props = PropertiesService.getScriptProperties();
      if (props) {
        var snapshotKey = 'CONFIG_SNAPSHOT_' + cacheKey;
        props.deleteProperty(snapshotKey);
      }
    }

    // Log successful invalidation
    if (typeof logConfigEvent_ === 'function') {
      logConfigEvent_('INFO', 'Config cache invalidated', {
        cacheKey: cacheKey,
        sheetName: sheetName,
        reason: 'Manual edit detected'
      });
    }

  } catch (error) {
    // Log error but don't throw (silent failure)
    if (typeof logConfigEvent_ === 'function') {
      logConfigEvent_('ERROR', 'Cache invalidation failed', {
        cacheKey: cacheKey,
        sheetName: sheetName,
        error: String(error)
      });
    }
  }
}

/**
 * Log cache invalidation details
 * @param {string} sheetName - Config sheet name
 * @param {string} cacheKey - Cache key
 * @param {Object} e - Edit event
 */
function logConfigCacheInvalidation(sheetName, cacheKey, e) {
  try {
    var details = {
      sheetName: sheetName,
      cacheKey: cacheKey,
      timestamp: new Date().toISOString()
    };

    // Add edit details if available
    if (e) {
      if (e.range) {
        details.editedRange = e.range.getA1Notation();
        details.editedRow = e.range.getRow();
        details.editedColumn = e.range.getColumn();
      }
      if (e.value !== undefined) {
        details.newValue = String(e.value);
      }
      if (e.oldValue !== undefined) {
        details.oldValue = String(e.oldValue);
      }
    }

    if (typeof logConfigEvent_ === 'function') {
      logConfigEvent_('INFO', 'Config sheet edited - cache invalidated', details);
    }

  } catch (error) {
    // Silent failure - logging is non-critical
  }
}

/**
 * Manual cache invalidation function (callable from UI)
 * @param {string} cacheKey - Optional cache key to invalidate (if not provided, clears all)
 * @return {boolean} Success status
 */
function manuallyInvalidateCache(cacheKey) {
  try {
    if (cacheKey) {
      // Invalidate specific cache
      invalidateConfigCache(cacheKey, 'Manual invalidation');
    } else {
      // Invalidate all caches
      Object.keys(CONFIG_SHEET_TO_CACHE_KEY).forEach(function(sheetName) {
        var key = CONFIG_SHEET_TO_CACHE_KEY[sheetName];
        invalidateConfigCache(key, sheetName);
      });
    }

    return true;
  } catch (error) {
    if (typeof logConfigEvent_ === 'function') {
      logConfigEvent_('ERROR', 'Manual cache invalidation failed', {
        cacheKey: cacheKey || 'all',
        error: String(error)
      });
    }
    return false;
  }
}

/**
 * Get cache invalidation status (for testing)
 * @return {Object} Status info
 */
function getCacheInvalidationStatus() {
  var status = {
    configSheets: CONFIG_SHEET_NAMES.length,
    cacheKeys: Object.keys(CONFIG_SHEET_TO_CACHE_KEY).length,
    onEditTriggerInstalled: false
  };

  // Check if onEdit trigger is installed
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'onEdit' &&
          triggers[i].getEventType() === ScriptApp.EventType.ON_EDIT) {
        status.onEditTriggerInstalled = true;
        break;
      }
    }
  } catch (error) {
    status.triggerCheckError = String(error);
  }

  return status;
}

/**
 * Install onEdit trigger programmatically (if needed)
 * Note: Simple triggers (named onEdit) are installed automatically
 * This function is for testing/verification only
 */
function installOnEditTrigger() {
  try {
    // Check if trigger already exists
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'onEdit') {
        Logger.log('onEdit trigger already installed');
        return true;
      }
    }

    // Note: Simple triggers (functions named onEdit, onOpen, etc.) are automatically installed
    // No need to create trigger manually
    Logger.log('onEdit simple trigger is automatically installed by Apps Script');
    return true;

  } catch (error) {
    Logger.log('Error checking/installing onEdit trigger: ' + error);
    return false;
  }
}

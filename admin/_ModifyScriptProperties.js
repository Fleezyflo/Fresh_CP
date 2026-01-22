/**
 * Script Properties Modification Helper
 *
 * Purpose: Easy modification of Script Properties (especially Vector Store ID)
 * Use Case: When you need to switch vector stores or update credentials
 *
 * SECURITY: This admin tool can modify sensitive properties - use with caution!
 */

/**
 * Modify Vector Store ID
 *
 * Easy function to update the OpenAI Vector Store ID
 *
 * @param {string} newVectorStoreId - New vector store ID (e.g., 'vs_...')
 * @returns {Object} Status and confirmation
 *
 * @example
 * // Run this from Apps Script editor to change vector store:
 * modifyVectorStoreId('vs_ABC123xyz...');
 */
function modifyVectorStoreId(newVectorStoreId) {
  if (!newVectorStoreId || typeof newVectorStoreId !== 'string') {
    throw new Error('Vector Store ID is required (string starting with vs_)');
  }

  const trimmed = String(newVectorStoreId).trim();

  if (!trimmed.startsWith('vs_')) {
    throw new Error('Invalid Vector Store ID format. Must start with "vs_"');
  }

  try {
    const props = PropertiesService.getScriptProperties();

    // Get old value for logging
    const oldValue = props.getProperty('OPENAI_VECTOR_STORE_ID') || 'NOT_SET';

    // Set new value
    props.setProperty('OPENAI_VECTOR_STORE_ID', trimmed);

    // Clear execution cache (forces reload on next use)
    if (typeof globalThis !== 'undefined' && globalThis.__vectorStoreId) {
      delete globalThis.__vectorStoreId;
    }

    // Invalidate PropertiesLoader cache if available
    if (typeof PropertiesLoader !== 'undefined' && typeof PropertiesLoader.invalidate === 'function') {
      PropertiesLoader.invalidate();
    }

    Logger.log('✅ Vector Store ID updated successfully');
    Logger.log('   Old: ' + oldValue.substring(0, 20) + '...');
    Logger.log('   New: ' + trimmed.substring(0, 20) + '...');

    return {
      status: 'SUCCESS',
      message: 'Vector Store ID updated',
      oldValue: oldValue.substring(0, 20) + '...',
      newValue: trimmed.substring(0, 20) + '...',
      fullNewValue: trimmed
    };

  } catch (error) {
    Logger.log('❌ Failed to update Vector Store ID: ' + error);
    throw error;
  }
}

/**
 * Modify any Script Property
 *
 * General-purpose function to update any script property
 *
 * @param {string} key - Property key (e.g., 'OPENAI_API_KEY', 'XERO_CLIENT_ID')
 * @param {string} value - New property value
 * @returns {Object} Status and confirmation
 *
 * @example
 * modifyScriptProperty('OPENAI_API_KEY', 'sk-proj-new-key...');
 * modifyScriptProperty('XERO_TENANT_ID', 'new-tenant-id');
 */
function modifyScriptProperty(key, value) {
  if (!key || typeof key !== 'string') {
    throw new Error('Property key is required');
  }

  if (value === undefined || value === null) {
    throw new Error('Property value is required (use deleteScriptProperty to remove)');
  }

  const propertyKey = String(key).trim().toUpperCase();
  const propertyValue = String(value).trim();

  if (!propertyValue) {
    throw new Error('Property value cannot be empty (use deleteScriptProperty to remove)');
  }

  try {
    const props = PropertiesService.getScriptProperties();

    // Get old value for logging (sanitized)
    const oldValue = props.getProperty(propertyKey);
    const hadValue = oldValue !== null;

    // Set new value
    props.setProperty(propertyKey, propertyValue);

    // Clear execution caches
    clearPropertyCaches_(propertyKey);

    const action = hadValue ? 'updated' : 'created';
    const valuePreview = propertyValue.substring(0, 20) + (propertyValue.length > 20 ? '...' : '');

    Logger.log('✅ Property ' + action + ': ' + propertyKey);
    Logger.log('   Value: ' + valuePreview + ' (length: ' + propertyValue.length + ')');

    return {
      status: 'SUCCESS',
      message: 'Property ' + action,
      key: propertyKey,
      valueLength: propertyValue.length,
      action: action
    };

  } catch (error) {
    Logger.log('❌ Failed to modify property ' + propertyKey + ': ' + error);
    throw error;
  }
}

/**
 * Delete a Script Property
 *
 * @param {string} key - Property key to delete
 * @returns {Object} Status
 *
 * @example
 * deleteScriptProperty('OLD_PROPERTY_NAME');
 */
function deleteScriptProperty(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('Property key is required');
  }

  const propertyKey = String(key).trim().toUpperCase();

  try {
    const props = PropertiesService.getScriptProperties();

    // Check if exists
    const exists = props.getProperty(propertyKey) !== null;

    if (!exists) {
      Logger.log('⚠️ Property does not exist: ' + propertyKey);
      return {
        status: 'NOT_FOUND',
        message: 'Property does not exist',
        key: propertyKey
      };
    }

    // Delete
    props.deleteProperty(propertyKey);

    // Clear caches
    clearPropertyCaches_(propertyKey);

    Logger.log('✅ Property deleted: ' + propertyKey);

    return {
      status: 'SUCCESS',
      message: 'Property deleted',
      key: propertyKey
    };

  } catch (error) {
    Logger.log('❌ Failed to delete property ' + propertyKey + ': ' + error);
    throw error;
  }
}

/**
 * List all Script Properties (keys only, not values for security)
 *
 * @returns {Object} List of property keys and count
 *
 * @example
 * listScriptProperties();
 */
function listScriptProperties() {
  try {
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    const keys = Object.keys(all);

    Logger.log('=== Script Properties ===');
    Logger.log('Total: ' + keys.length);
    Logger.log('');

    keys.sort().forEach(function(key) {
      const value = all[key];
      const preview = value ? value.substring(0, 10) + '...' : 'EMPTY';
      const length = value ? value.length : 0;
      Logger.log('  ' + key + ': ' + preview + ' (length: ' + length + ')');
    });

    return {
      status: 'SUCCESS',
      count: keys.length,
      keys: keys
    };

  } catch (error) {
    Logger.log('❌ Failed to list properties: ' + error);
    throw error;
  }
}

/**
 * Get current Vector Store ID (for verification)
 *
 * @returns {Object} Current vector store ID info
 *
 * @example
 * getCurrentVectorStoreId();
 */
function getCurrentVectorStoreId() {
  try {
    const props = PropertiesService.getScriptProperties();
    const vectorStoreId = props.getProperty('OPENAI_VECTOR_STORE_ID');

    if (!vectorStoreId) {
      Logger.log('⚠️ OPENAI_VECTOR_STORE_ID is not set');
      return {
        status: 'NOT_SET',
        message: 'Vector Store ID is not configured',
        value: null
      };
    }

    const preview = vectorStoreId.substring(0, 20) + '...';

    Logger.log('Current Vector Store ID: ' + preview);
    Logger.log('Full length: ' + vectorStoreId.length + ' characters');

    return {
      status: 'SET',
      message: 'Vector Store ID is configured',
      preview: preview,
      length: vectorStoreId.length,
      fullValue: vectorStoreId
    };

  } catch (error) {
    Logger.log('❌ Failed to get Vector Store ID: ' + error);
    throw error;
  }
}

/**
 * Batch modify multiple properties at once
 *
 * @param {Object} properties - Object with key-value pairs to set
 * @returns {Object} Status
 *
 * @example
 * batchModifyProperties({
 *   'OPENAI_VECTOR_STORE_ID': 'vs_new123...',
 *   'OPENAI_API_KEY': 'sk-proj-new...'
 * });
 */
function batchModifyProperties(properties) {
  if (!properties || typeof properties !== 'object') {
    throw new Error('Properties object is required');
  }

  const results = [];
  const props = PropertiesService.getScriptProperties();

  try {
    Object.keys(properties).forEach(function(key) {
      const value = properties[key];
      const propertyKey = String(key).trim().toUpperCase();

      try {
        props.setProperty(propertyKey, String(value));
        results.push({
          key: propertyKey,
          status: 'SUCCESS'
        });
        Logger.log('✅ Set: ' + propertyKey);
      } catch (error) {
        results.push({
          key: propertyKey,
          status: 'FAILED',
          error: String(error)
        });
        Logger.log('❌ Failed: ' + propertyKey + ' - ' + error);
      }
    });

    // Clear all caches
    clearPropertyCaches_();

    const successCount = results.filter(function(r) { return r.status === 'SUCCESS'; }).length;
    const failCount = results.filter(function(r) { return r.status === 'FAILED'; }).length;

    Logger.log('');
    Logger.log('Batch update complete: ' + successCount + ' succeeded, ' + failCount + ' failed');

    return {
      status: failCount === 0 ? 'SUCCESS' : 'PARTIAL',
      total: results.length,
      succeeded: successCount,
      failed: failCount,
      results: results
    };

  } catch (error) {
    Logger.log('❌ Batch update failed: ' + error);
    throw error;
  }
}

/**
 * Clear property caches (internal helper)
 * @private
 */
function clearPropertyCaches_(specificKey) {
  // Clear globalThis caches
  if (typeof globalThis !== 'undefined') {
    if (specificKey === 'OPENAI_VECTOR_STORE_ID' || !specificKey) {
      delete globalThis.__vectorStoreId;
    }
    // Add other cached properties as needed
  }

  // Clear PropertiesLoader cache
  if (typeof PropertiesLoader !== 'undefined' && typeof PropertiesLoader.invalidate === 'function') {
    PropertiesLoader.invalidate();
  }
}

/**
 * Interactive Vector Store ID replacement workflow
 *
 * Prompts user for new vector store ID and updates it
 *
 * @example
 * replaceVectorStoreIdInteractive();
 */
function replaceVectorStoreIdInteractive() {
  try {
    const ui = SpreadsheetApp.getUi();

    // Get current value
    const current = getCurrentVectorStoreId();

    const prompt = current.status === 'SET'
      ? 'Current Vector Store ID: ' + current.preview + '\n\nEnter NEW Vector Store ID (must start with vs_):'
      : 'No Vector Store ID is currently set.\n\nEnter Vector Store ID (must start with vs_):';

    const response = ui.prompt(
      'Update Vector Store ID',
      prompt,
      ui.ButtonSet.OK_CANCEL
    );

    if (response.getSelectedButton() !== ui.Button.OK) {
      ui.alert('Cancelled', 'Vector Store ID was not changed.', ui.ButtonSet.OK);
      return { status: 'CANCELLED' };
    }

    const newValue = String(response.getResponseText() || '').trim();

    if (!newValue) {
      ui.alert('Error', 'Vector Store ID cannot be empty.', ui.ButtonSet.OK);
      return { status: 'ERROR', message: 'Empty value' };
    }

    if (!newValue.startsWith('vs_')) {
      ui.alert('Error', 'Vector Store ID must start with "vs_"', ui.ButtonSet.OK);
      return { status: 'ERROR', message: 'Invalid format' };
    }

    // Update
    const result = modifyVectorStoreId(newValue);

    ui.alert(
      'Success',
      'Vector Store ID updated!\n\n' +
      'Old: ' + result.oldValue + '\n' +
      'New: ' + result.newValue + '\n\n' +
      'The change is effective immediately.',
      ui.ButtonSet.OK
    );

    return result;

  } catch (error) {
    try {
      SpreadsheetApp.getUi().alert('Error', 'Failed to update: ' + error, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (ignore) {
      Logger.log('❌ Update failed: ' + error);
    }
    throw error;
  }
}

/* exported modifyVectorStoreId, modifyScriptProperty, deleteScriptProperty, listScriptProperties, getCurrentVectorStoreId, batchModifyProperties, replaceVectorStoreIdInteractive */

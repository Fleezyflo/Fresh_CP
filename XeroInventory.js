/**
 * hrmny Quote Builder - Xero Inventory Item Creation
 *
 * Creates inventory items in Xero via API
 * Uses existing callXeroAPI() from XeroAuth.gs
 */

// Xero API validation limits
const XERO_ITEM_CODE_MAX_LENGTH = 30;
const XERO_ITEM_NAME_MAX_LENGTH = 100;
const XERO_ITEM_DESCRIPTION_MAX_LENGTH = 4000;

// Rate limiting
const BATCH_API_DELAY_MS = 1000; // 1 second between batch calls
const RATE_LIMIT_RETRY_DELAY_MS = 60000; // 60 seconds for 429 errors
const BATCH_SIZE = 100; // Xero allows 100 items per API call

/**
 * Resolve sales configuration (account & tax) from Config sheet.
 * Provides safe defaults when values are absent.
 * @return {{accountCode: string, taxType: string}}
 */
function getXeroSalesSettings() {
  let accountCode = '200';
  let taxType = '';

  try {
    const configuredAccount = getConfigValue('XERO_ACCOUNT_CODE_DEFAULT');
    if (configuredAccount) {
      accountCode = String(configuredAccount).trim() || '200';
    }
  } catch (error) {
    try { UnifiedLogger.info('XeroInventory', 'No custom sales account configured, using default 200'); } catch (ignore) {
      console.error('[XeroInventory] Error:', ignore.message, ignore.stack);
    }
  }

  try {
    const configuredTax = getConfigValue('XERO_TAX_TYPE');
    if (configuredTax) {
      taxType = String(configuredTax).trim();
    }
  } catch (error) {
    try { UnifiedLogger.info('XeroInventory', 'No custom tax type configured'); } catch (ignore) {
      console.error('[XeroInventory] Error:', ignore.message, ignore.stack);
    }
  }

  return {
    accountCode: accountCode || '200',
    taxType: taxType
  };
}

/**
 * Create a single inventory item in Xero
 *
 * @param {string} itemCode - Item code (max 30 chars, required)
 * @param {string} name - Item name (max 100 chars, required)
 * @param {string} description - Item description (max 4000 chars, optional)
 * @param {number} unitPrice - Unit price (required)
 * @return {Object} {success: boolean, itemId: string, exists: boolean, error: string}
 */
function createXeroInventoryItem(itemCode, name, description, unitPrice) {
  UnifiedLogger.info('XeroInventory', 'createXeroInventoryItem: Starting', { itemCode: itemCode, name: name, unitPrice: unitPrice });

  try {
    // VALIDATE INPUTS
    const validationError = validateItemInputs(itemCode, name, description, unitPrice);
    if (validationError) {
      UnifiedLogger.error('XeroInventory', 'createXeroInventoryItem: Validation error', { error: validationError });
      return { success: false, error: validationError };
    }

    // Build Xero API payload
    const salesSettings = getXeroSalesSettings();
    const salesDetails = {
      UnitPrice: unitPrice,
      AccountCode: salesSettings.accountCode
    };
    if (salesSettings.taxType) {
      salesDetails.TaxType = salesSettings.taxType;
    }

    const payload = {
      Items: [{
        Code: itemCode,
        Name: name,
        Description: description || '',
        SalesDetails: salesDetails,
        IsTrackedAsInventory: false,
        IsSold: true,
        IsPurchased: false
      }]
    };

    UnifiedLogger.debug('XeroInventory', 'createXeroInventoryItem: Creating item in Xero', { payload: payload });

    // Make API call using existing callXeroAPI function
    const response = callXeroAPI('/Items', 'PUT', payload);

    UnifiedLogger.debug('XeroInventory', 'createXeroInventoryItem: Response received', { response: response });

    // Check response
    if (response && response.Items && response.Items.length > 0) {
      const createdItem = response.Items[0];
      UnifiedLogger.info('XeroInventory', 'createXeroInventoryItem: SUCCESS', { itemId: createdItem.ItemID, itemCode: itemCode });

      return {
        success: true,
        itemId: createdItem.ItemID,
        exists: false,
        message: 'Item created successfully'
      };
    } else {
      UnifiedLogger.error('XeroInventory', 'createXeroInventoryItem: Invalid response format', { response: response });
      return { success: false, error: 'Invalid response from Xero API' };
    }

  } catch (error) {
    UnifiedLogger.error('XeroInventory', 'createXeroInventoryItem: Exception', { error: error.toString() });

    // Handle specific Xero API errors
    const errorMessage = error.toString();

    // Duplicate ItemCode error (shouldn't happen since we check first, but handle anyway)
    if (errorMessage.indexOf('409') !== -1 || errorMessage.toLowerCase().indexOf('duplicate') !== -1) {
      UnifiedLogger.warn('XeroInventory', 'createXeroInventoryItem: Duplicate detected', { itemCode: itemCode });
      return {
        success: true,
        exists: true,
        message: 'Item already exists in Xero (duplicate detected)'
      };
    }

    // 400 - Validation error
    if (errorMessage.indexOf('400') !== -1) {
      return { success: false, error: 'Validation error: ' + errorMessage };
    }

    // 401 - Authorization error
    if (errorMessage.indexOf('401') !== -1 || errorMessage.indexOf('UNAUTHORIZED') !== -1) {
      return { success: false, error: 'Authorization failed. Please re-authorize with Xero.' };
    }

    // 429 - Rate limit
    if (errorMessage.indexOf('429') !== -1) {
      UnifiedLogger.warn('XeroInventory', 'createXeroInventoryItem: Rate limit hit, waiting 60s');

      try {
        Utilities.sleep(RATE_LIMIT_RETRY_DELAY_MS);
        UnifiedLogger.info('XeroInventory', 'createXeroInventoryItem: Retrying after rate limit');

        // Retry once
        const retryResponse = callXeroAPI('/Items', 'PUT', payload);

        if (retryResponse && retryResponse.Items && retryResponse.Items.length > 0) {
          const createdItem = retryResponse.Items[0];
          UnifiedLogger.info('XeroInventory', 'createXeroInventoryItem: SUCCESS on retry', { itemId: createdItem.ItemID });

          return {
            success: true,
            itemId: createdItem.ItemID,
            exists: false,
            message: 'Item created successfully (after retry)'
          };
        }
      } catch (retryError) {
        UnifiedLogger.error('XeroInventory', 'createXeroInventoryItem: Retry failed', { error: retryError.toString() });
        return { success: false, error: 'Rate limit exceeded and retry failed: ' + retryError.toString() };
      }
    }

    // 500 - Server error
    if (errorMessage.indexOf('500') !== -1) {
      return { success: false, error: 'Xero server error: ' + errorMessage };
    }

    // Network timeout
    if (errorMessage.toLowerCase().indexOf('timeout') !== -1) {
      return { success: false, error: 'Network timeout: ' + errorMessage };
    }

    // Generic error
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if an item with the given ItemCode exists in Xero
 *
 * @param {string} itemCode - Item code to check
 * @return {Object} {exists: boolean, itemId: string, error: string}
 */
/**
 * Batch create multiple inventory items in Xero
 * Creates items in batches of 100 (Xero API limit)
 * Adds 1 second delay between batches for rate limiting
 *
 * @param {Array} items - Array of item objects: [{itemCode, name, description, unitPrice}, ...]
 * @return {Object} {success: boolean, created: number, failed: number, skipped: number, results: Array, errors: Array}
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function batchCreateItems(items) {
  const trace = UnifiedLogger.startTrace('XeroInventory', 'batchCreateItems', {
    itemsCount: items ? items.length : 0
  });
  try {
    UnifiedLogger.info('XeroInventory', 'batchCreateItems: Starting', { itemsCount: items.length });

  try {
    // Validate input
    if (!items || !Array.isArray(items)) {
      UnifiedLogger.error('XeroInventory', 'batchCreateItems: Invalid input', { error: 'items must be an array' });
      return { success: false, error: 'items parameter must be an array' };
    }

    if (items.length === 0) {
      UnifiedLogger.info('XeroInventory', 'batchCreateItems: No items to create');
      return {
        success: true,
        created: 0,
        failed: 0,
        skipped: 0,
        results: [],
        errors: []
      };
    }

    const results = [];
    const errors = [];
    let created = 0;
    let failed = 0;
    let skipped = 0;

    // Process items in batches of BATCH_SIZE
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(items.length / BATCH_SIZE);
      const batch = items.slice(i, i + BATCH_SIZE);

      UnifiedLogger.info('XeroInventory', 'batchCreateItems: Processing batch', { batchNumber: batchNumber, totalBatches: totalBatches, batchSize: batch.length });

      // Validate and prepare batch payload
      const validItems = [];

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const itemIndex = i + j;

        // Validate item structure
        if (!item || typeof item !== 'object') {
          UnifiedLogger.error('XeroInventory', 'batchCreateItems: Invalid item', { itemIndex: itemIndex, error: 'not an object' });
          errors.push({
            index: itemIndex,
            itemCode: null,
            error: 'Item must be an object'
          });
          failed++;
          continue;
        }

        // Validate item inputs
        const validationError = validateItemInputs(item.itemCode, item.name, item.description, item.unitPrice);
        if (validationError) {
          UnifiedLogger.error('XeroInventory', 'batchCreateItems: Item validation failed', { itemIndex: itemIndex, error: validationError });
          errors.push({
            index: itemIndex,
            itemCode: item.itemCode,
            error: validationError
          });
          failed++;
          continue;
        }

        validItems.push({
          index: itemIndex,
          itemCode: item.itemCode,
          name: item.name,
          description: item.description,
          unitPrice: item.unitPrice
        });
      }

      // If no valid items in this batch, skip API call
      if (validItems.length === 0) {
        UnifiedLogger.warn('XeroInventory', 'batchCreateItems: No valid items in batch', { batchNumber: batchNumber });
        continue;
      }

      // Build batch payload
      const salesSettings = getXeroSalesSettings();

      const batchPayload = {
        Items: validItems.map(function(item) {
          const salesDetails = {
            UnitPrice: item.unitPrice,
            AccountCode: salesSettings.accountCode
          };
          if (salesSettings.taxType) {
            salesDetails.TaxType = salesSettings.taxType;
          }

          return {
            Code: item.itemCode,
            Name: item.name,
            Description: item.description || '',
            SalesDetails: salesDetails,
            IsTrackedAsInventory: false,
            IsSold: true,
            IsPurchased: false
          };
        })
      };

      UnifiedLogger.debug('XeroInventory', 'batchCreateItems: Creating items in batch', { batchNumber: batchNumber, itemsCount: itemsToCreate.length, payload: batchPayload });

      try {
        // Make batch API call
        const response = callXeroAPI('/Items', 'PUT', batchPayload);

        UnifiedLogger.debug('XeroInventory', 'batchCreateItems: Batch response received', { batchNumber: batchNumber, response: response });

        // Process response
        const responseMap = new Map();
        if (response && response.Items && response.Items.length > 0) {
          response.Items.forEach(function(createdItem, idx) {
            const originalItem = validItems[idx];
            if (createdItem.ValidationErrors && createdItem.ValidationErrors.length > 0) {
              const validationError = createdItem.ValidationErrors[0].Message;
              UnifiedLogger.error('XeroInventory', 'batchCreateItems: Validation error', { itemCode: originalItem.itemCode, error: validationError });

              errors.push({
                index: originalItem.index,
                itemCode: originalItem.itemCode,
                error: validationError
              });
              failed++;
            } else if (createdItem.ItemID) {
              UnifiedLogger.info('XeroInventory', 'batchCreateItems: Item created', { itemCode: originalItem.itemCode, itemId: createdItem.ItemID });

              results.push({
                index: originalItem.index,
                itemCode: originalItem.itemCode,
                success: true,
                exists: false,
                itemId: createdItem.ItemID,
                message: 'Item created successfully'
              });
              responseMap.set(originalItem.itemCode, createdItem.ItemID);
              created++;
            } else {
              UnifiedLogger.error('XeroInventory', 'batchCreateItems: Unknown error', { itemCode: originalItem.itemCode });

              errors.push({
                index: originalItem.index,
                itemCode: originalItem.itemCode,
                error: 'Unknown error - no ItemID in response'
              });
              failed++;
            }
          });
        } else {
          UnifiedLogger.error('XeroInventory', 'batchCreateItems: Invalid batch response', { batchNumber: batchNumber });

          // Mark all items in this batch as failed
          for (let n = 0; n < validItems.length; n++) {
            const item = validItems[n];
            errors.push({
              index: item.index,
              itemCode: item.itemCode,
              error: 'Invalid response from Xero API'
            });
            failed++;
          }
        }

      } catch (batchError) {
        UnifiedLogger.error('XeroInventory', 'batchCreateItems: Batch API call failed', { batchNumber: batchNumber, error: batchError.toString() });

        const errorMessage = batchError.toString();

        // Handle rate limit (429)
        if (errorMessage.indexOf('429') !== -1) {
          UnifiedLogger.warn('XeroInventory', 'batchCreateItems: Rate limit hit, waiting 60s');

          try {
            Utilities.sleep(RATE_LIMIT_RETRY_DELAY_MS);
            UnifiedLogger.info('XeroInventory', 'batchCreateItems: Retrying batch after rate limit', { batchNumber: batchNumber });

            // Retry this batch once
            const retryResponse = callXeroAPI('/Items', 'PUT', batchPayload);

            if (retryResponse && retryResponse.Items && retryResponse.Items.length > 0) {
              retryResponse.Items.forEach(function(createdItem, idx) {
                const originalItem = validItems[idx];

                if (createdItem.ItemID) {
                  UnifiedLogger.info('XeroInventory', 'batchCreateItems: Item created on retry', { itemCode: originalItem.itemCode, itemId: createdItem.ItemID });

                  results.push({
                    index: originalItem.index,
                    itemCode: originalItem.itemCode,
                    success: true,
                    exists: false,
                    itemId: createdItem.ItemID,
                    message: 'Item created successfully (after retry)'
                  });
                  created++;
                }
              });
            }
          } catch (retryError) {
            UnifiedLogger.error('XeroInventory', 'batchCreateItems: Retry failed', { batchNumber: batchNumber, error: retryError.toString() });

            // Mark all items in this batch as failed
            for (let q = 0; q < validItems.length; q++) {
              const item = validItems[q];
              errors.push({
                index: item.index,
                itemCode: item.itemCode,
                error: 'Rate limit exceeded and retry failed: ' + retryError.toString()
              });
              failed++;
            }
          }
        } else {
          // Mark all items in this batch as failed
          for (let r = 0; r < itemsToCreate.length; r++) {
            const item = itemsToCreate[r];
            errors.push({
              index: item.index,
              itemCode: item.itemCode,
              error: errorMessage
            });
            failed++;
          }
        }
      }

      // Add delay between batches (rate limiting)
      if (i + BATCH_SIZE < items.length) {
        UnifiedLogger.debug('XeroInventory', 'batchCreateItems: Waiting before next batch', { delayMs: BATCH_API_DELAY_MS });
        Utilities.sleep(BATCH_API_DELAY_MS);
      }
    }

    UnifiedLogger.info('XeroInventory', 'batchCreateItems: Batch creation complete', { created: created, failed: failed, skipped: skipped });

    const idMap = new Map();
    results.forEach(function(entry) {
      if (entry.success && entry.itemId) {
        idMap.set(entry.itemCode, entry.itemId);
      }
    });

    return {
      success: (failed === 0),
      created: created,
      failed: failed,
      skipped: skipped,
      results: results,
      errors: errors,
      total: items.length,
      itemIdMap: idMap
    };

  } catch (error) {
    UnifiedLogger.error('XeroInventory', 'batchCreateItems: Exception', { error: error.toString() });
    return {
      success: false,
      created: 0,
      failed: 0,
      skipped: 0,
      error: error.toString()
    };
  }
  } catch (error) {
    trace.fail('batchCreateItems failed', error);
    throw error;
  }
}

/**
 * Validate item inputs before API call
 *
 * @param {string} itemCode - Item code
 * @param {string} name - Item name
 * @param {string} description - Item description
 * @param {number} unitPrice - Unit price
 * @return {string|null} Error message or null if valid
 */
function validateItemInputs(itemCode, name, description, unitPrice) {
  // ItemCode validation
  if (!itemCode || typeof itemCode !== 'string' || itemCode.trim() === '') {
    return 'ItemCode is required';
  }

  if (itemCode.length > XERO_ITEM_CODE_MAX_LENGTH) {
    return 'ItemCode exceeds max length of ' + XERO_ITEM_CODE_MAX_LENGTH + ' characters (current: ' + itemCode.length + ')';
  }

  // Name validation
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'Name is required';
  }

  if (name.length > XERO_ITEM_NAME_MAX_LENGTH) {
    return 'Name exceeds max length of ' + XERO_ITEM_NAME_MAX_LENGTH + ' characters (current: ' + name.length + ')';
  }

  // Description validation (optional but must be valid if provided)
  if (description && typeof description !== 'string') {
    return 'Description must be a string';
  }

  if (description && description.length > XERO_ITEM_DESCRIPTION_MAX_LENGTH) {
    return 'Description exceeds max length of ' + XERO_ITEM_DESCRIPTION_MAX_LENGTH + ' characters (current: ' + description.length + ')';
  }

  // UnitPrice validation
  if (unitPrice === null || unitPrice === undefined) {
    return 'UnitPrice is required';
  }

  if (typeof unitPrice !== 'number' || isNaN(unitPrice)) {
    return 'UnitPrice must be a valid number';
  }

  if (unitPrice < 0) {
    return 'UnitPrice cannot be negative';
  }

  // All validations passed
  return null;
}


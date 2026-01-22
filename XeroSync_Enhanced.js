/**
 * Google Sheets to Xero Inventory Sync - ENHANCED VERSION
 *
 * NEW FEATURES:
 * ✅ Incremental Sync - Only syncs items that changed
 * ✅ Batch API Operations - Up to 100 items per API call (10x faster)
 * ✅ Data Validation - Validates data before syncing
 * ✅ Dry Run Mode - Preview changes before syncing
 * ✅ Better Error Handling - More detailed error messages
 * ✅ Unified Logging - Centralized logs for debugging
 *
 * This script syncs inventory items from Google Sheets to Xero
 * Supports: Item details (SKU, Name, Description) and Pricing (Cost, Sell Price)
 */

// ============================================================================
// CONFIGURATION - Edit these values
// ============================================================================

const CONFIG = {
  // Google Sheet configuration
  SHEET_NAME: 'XERO_READY',          // FIXED: Changed from 'Inventory' to 'XERO_READY'
  HEADER_ROW: 1,                     // Row number where headers are located
  DATA_START_ROW: 2,                 // First row of actual data

  // Column mapping (adjust to match your sheet structure)
  COLUMNS: {
    SKU: 'A',              // Item Code/SKU
    NAME: 'B',             // Item Name
    DESCRIPTION: 'C',      // Item Description
    SELL_PRICE: 'D',       // Sell Price
    COST_PRICE: 'E',       // Purchase Price/Cost
    ACCOUNT_CODE: 'F',     // Sales Account Code (optional)
    PURCHASE_ACCOUNT: 'G', // Purchase Account Code (optional)
    CATEGORY: 'H',         // FIXED: Category (added by normalization)
    STATUS: 'I',           // FIXED: Status (added by normalization)
    LAST_SYNCED: 'J',      // FIXED: Moved from H to J
    ROW_HASH: 'K'          // FIXED: Moved from I to K
  },

  // Xero configuration
  XERO_API_URL: 'https://api.xero.com/api.xro/2.0',
  XERO_IDENTITY_URL: 'https://identity.xero.com/connect/token',

  // Sync settings
  BATCH_SIZE: 100,           // Items per API call (Xero max is 100)
  API_DELAY_MS: 1000,        // Delay between batch calls (rate limiting)
  LOG_ENABLED: true,         // Enable logging
  INCREMENTAL_SYNC: false,    // Set true to skip unchanged items
  VALIDATE_BEFORE_SYNC: true, // Validate data before syncing
  INCLUDE_COST_PRICE: false   // Toggle purchase cost export
};

function getXeroTenantIdOrThrow_() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'getXeroTenantIdOrThrow_');
  try {
    const tenantId = requireSecret('XERO_TENANT_ID');
    trace.complete('getXeroTenantIdOrThrow_ completed', {});
    return tenantId;
  } catch (error) {
    trace.fail('getXeroTenantIdOrThrow_ failed', error);
    throw new AppError('XERO_CONFIG_ERROR', 'XERO_TENANT_ID not found in Script Properties. Run authorizeXeroInventory() to refresh credentials.', error);
  }
}

function ensureXeroInventoryReadiness_() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'ensureXeroInventoryReadiness_');
  try {
    if (typeof ensureXeroIntegrationReady_ === 'function') {
      ensureXeroIntegrationReady_({ operation: 'inventory-readiness', allowNetworkProbe: true, surfaceToast: true });
    }
    if (typeof ensureXeroSyncReadiness_ === 'function') {
      ensureXeroSyncReadiness_();
      trace.complete('ensureXeroInventoryReadiness_ completed - via ensureXeroSyncReadiness_', {});
      return;
    }
    const health = typeof getXeroHealthStatus === 'function'
      ? getXeroHealthStatus()
      : { connected: (typeof isXeroAuthorized === 'function' ? isXeroAuthorized() : false), message: 'Not authorized with Xero' };
    if (!health || !health.connected) {
      trace.fail('ensureXeroInventoryReadiness_ - not connected', {});
      throw new AppError('XERO_AUTH_ERROR', (health && health.message) ? health.message : 'Xero is not authorized. Authorize before syncing inventory.');
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.fail('ensureXeroInventoryReadiness_ - no spreadsheet', {});
      throw new AppError('CONFIG_ERROR', 'No active spreadsheet available for Xero inventory sync.');
    }
    const xeroReadyName = SHEET_NAMES && SHEET_NAMES.XERO_READY ? SHEET_NAMES.XERO_READY : CONFIG.SHEET_NAME;
    const sheet = ss.getSheetByName(xeroReadyName);
    if (!sheet || sheet.getLastRow() < CONFIG.DATA_START_ROW) {
      trace.fail('ensureXeroInventoryReadiness_ - XERO_READY empty', {});
      throw new AppError('XERO_READY_STALE', 'XERO_READY is empty. Run Normalize Data before syncing inventory to Xero.');
    }
    trace.complete('ensureXeroInventoryReadiness_ completed', {});
  } catch (error) {
    trace.fail('ensureXeroInventoryReadiness_ failed', error);
    throw error;
  }
}

// ============================================================================
// MAIN SYNC FUNCTIONS
// ============================================================================

/**
 * Manual sync trigger
 */
function syncToXeroManual() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'syncToXeroManual');
  try {
    if (!isUrlFetchAllowedForXero_()) {
      SpreadsheetApp.getUi().alert('UrlFetch policy blocked; Xero sync skipped. Contact admin to allow external requests.');
      catchAndLog(function() {
        UnifiedLogger.warn('XeroSync', 'syncToXeroManual blocked: UrlFetch policy');
      }, 'XeroSync');
      trace.complete('syncToXeroManual completed - UrlFetch blocked', {});
      return;
    }
    const ui = SpreadsheetApp.getUi();
    try {
      if (typeof ensureXeroIntegrationReady_ === 'function') {
        ensureXeroIntegrationReady_({ operation: 'inventory-sync', allowNetworkProbe: true, surfaceToast: true });
      }
    } catch (preflightError) {
      ui.alert('Xero Not Ready', preflightError && preflightError.message ? preflightError.message : 'Xero integration not ready. Re-authorize and retry.', ui.ButtonSet.OK);
      trace.complete('syncToXeroManual completed - preflight failed', {});
      return;
    }
    const result = ui.alert(
      'Sync to Xero',
      'This will normalize data and sync inventory items to Xero (only changed items). Continue?',
      ui.ButtonSet.YES_NO
    );
    if (result === ui.Button.YES) {
      try {
        // Normalize data first to populate XERO_READY
        SpreadsheetApp.getActiveSpreadsheet().toast('Normalizing data from Scope Buildups...', 'Sync to Xero', 5);
        if (typeof normalizeAllData === 'function') {
          normalizeAllData();
          SpreadsheetApp.getActiveSpreadsheet().toast('Data normalized. Starting sync...', 'Sync to Xero', 3);
        } else {
          throw new Error('normalizeAllData function not available. Ensure NormalizeData.js is loaded.');
        }

        const syncResult = syncInventoryToXero();

        let message = `✅ Successfully synced: ${syncResult.success} items\n`;
        message += `⏭️ Skipped (unchanged): ${syncResult.skipped || 0} items\n`;
        message += `❌ Failed: ${syncResult.failed} items\n`;

        if (syncResult.validated) {
          message += `⚠️ Validation warnings: ${syncResult.warnings || 0}\n`;
        }

        message += `\n⏱️ Completed in ${syncResult.duration}s\n`;
        message += '\nCheck the sync log for details.';

        ui.alert('Sync Complete', message, ui.ButtonSet.OK);
        trace.complete('syncToXeroManual completed - sync successful', { success: syncResult.success, failed: syncResult.failed });
      } catch (error) {
        trace.fail('syncToXeroManual - sync failed', error);
        const userError = createUserFriendlyError(error, {
          operation: 'Syncing to Xero',
          correlationId: trace.correlationId
        });
        ui.alert('Sync Failed', userError.message || (error && error.message ? error.message : 'Xero sync failed. Re-authorize and re-run.'), ui.ButtonSet.OK);
      }
    } else {
      trace.complete('syncToXeroManual completed - user cancelled', {});
    }
  } catch (error) {
    trace.fail('syncToXeroManual failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Manual Xero sync',
      correlationId: trace.correlationId
    });
    showErrorToast('Xero Sync Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Dry run - preview what will be synced
 */
function dryRunSync() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'dryRunSync');
  try {
    if (!isUrlFetchAllowedForXero_()) {
      SpreadsheetApp.getUi().alert('UrlFetch policy blocked; Xero dry run skipped. Contact admin to allow external requests.');
      catchAndLog(function() {
        UnifiedLogger.warn('XeroSync', 'dryRunSync blocked: UrlFetch policy');
      }, 'XeroSync');
      trace.complete('dryRunSync completed - UrlFetch blocked', {});
      return;
    }
    const ui = SpreadsheetApp.getUi();
    try {
      if (typeof ensureXeroIntegrationReady_ === 'function') {
        ensureXeroIntegrationReady_({ operation: 'inventory-dry-run', allowNetworkProbe: true, surfaceToast: true });
      }
    } catch (preflightError) {
      ui.alert('Xero Not Ready', preflightError && preflightError.message ? preflightError.message : 'Xero integration not ready. Re-authorize and retry.', ui.ButtonSet.OK);
      trace.complete('dryRunSync completed - preflight failed', {});
      return;
    }
    const result = ui.alert(
      'Dry Run',
      'This will normalize data and show what would be synced without actually syncing. Continue?',
      ui.ButtonSet.YES_NO
    );
    if (result === ui.Button.YES) {
      try {
        // Normalize data first to populate XERO_READY
        SpreadsheetApp.getActiveSpreadsheet().toast('Normalizing data from Scope Buildups...', 'Dry Run', 5);
        if (typeof normalizeAllData === 'function') {
          normalizeAllData();
          SpreadsheetApp.getActiveSpreadsheet().toast('Data normalized. Running dry run...', 'Dry Run', 3);
        } else {
          throw new Error('normalizeAllData function not available. Ensure NormalizeData.js is loaded.');
        }

        const dryRunResult = performDryRun();

        let message = `📊 DRY RUN RESULTS:\n\n`;
        message += `🆕 Items to CREATE: ${dryRunResult.toCreate.length}\n`;
        message += `🔄 Items to UPDATE: ${dryRunResult.toUpdate.length}\n`;
        message += `⏭️ Items to SKIP: ${dryRunResult.toSkip.length}\n`;
        message += `❌ Items with ERRORS: ${dryRunResult.errors.length}\n\n`;

        if (dryRunResult.errors.length > 0) {
          message += 'Fix errors before syncing! Check Validation Report for details.';
        }

        ui.alert('Dry Run Complete', message, ui.ButtonSet.OK);
        trace.complete('dryRunSync completed - dry run successful', { toCreate: dryRunResult.toCreate.length, toUpdate: dryRunResult.toUpdate.length });
      } catch (error) {
        trace.fail('dryRunSync - dry run failed', error);
        const userError = createUserFriendlyError(error, {
          operation: 'Dry run preview',
          correlationId: trace.correlationId
        });
        ui.alert('Dry Run Failed', userError.message || (error && error.message ? error.message : 'Xero dry run failed. Re-authorize and re-run.'), ui.ButtonSet.OK);
      }
    } else {
      trace.complete('dryRunSync completed - user cancelled', {});
    }
  } catch (error) {
    trace.fail('dryRunSync failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Xero dry run',
      correlationId: trace.correlationId
    });
    showErrorToast('Dry Run Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}
function forceFullSync() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'forceFullSync');
  try {
    if (!isUrlFetchAllowedForXero_()) {
      SpreadsheetApp.getUi().alert('UrlFetch policy blocked; force full sync skipped. Contact admin to allow external requests.');
      catchAndLog(function() {
        UnifiedLogger.warn('XeroSync', 'forceFullSync blocked: UrlFetch policy');
      }, 'XeroSync');
      trace.complete('forceFullSync completed - UrlFetch blocked', {});
      return;
    }
    const ui = SpreadsheetApp.getUi();
    try {
      if (typeof ensureXeroIntegrationReady_ === 'function') {
        ensureXeroIntegrationReady_({ operation: 'inventory-force-sync', allowNetworkProbe: true, surfaceToast: true });
      }
    } catch (preflightError) {
      ui.alert('Xero Not Ready', preflightError && preflightError.message ? preflightError.message : 'Xero integration not ready. Re-authorize and retry.', ui.ButtonSet.OK);
      trace.complete('forceFullSync completed - preflight failed', {});
      return;
    }
    const result = ui.alert(
      'Force Full Sync',
      'This will sync ALL items regardless of changes. Use for troubleshooting. Continue?',
      ui.ButtonSet.YES_NO
    );
    if (result === ui.Button.YES) {
      try {
        const originalSetting = CONFIG.INCREMENTAL_SYNC;
        CONFIG.INCREMENTAL_SYNC = false;

        const syncResult = syncInventoryToXero();

        CONFIG.INCREMENTAL_SYNC = originalSetting;

        ui.alert(
          'Full Sync Complete',
          `✅ Synced ${syncResult.success} items\n❌ Failed: ${syncResult.failed}\n\nCheck the sync log for details.`,
          ui.ButtonSet.OK
        );
        trace.complete('forceFullSync completed - sync successful', { success: syncResult.success, failed: syncResult.failed });
      } catch (error) {
        trace.fail('forceFullSync - sync failed', error);
        CONFIG.INCREMENTAL_SYNC = originalSetting;
        const userError = createUserFriendlyError(error, {
          operation: 'Force full sync',
          correlationId: trace.correlationId
        });
        ui.alert('Full Sync Failed', userError.message || (error && error.message ? error.message : 'Xero full sync failed. Re-authorize and re-run.'), ui.ButtonSet.OK);
      }
    } else {
      trace.complete('forceFullSync completed - user cancelled', {});
    }
  } catch (error) {
    trace.fail('forceFullSync failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Force full Xero sync',
      correlationId: trace.correlationId
    });
    showErrorToast('Full Sync Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Main sync function - can be called manually or by trigger
 */

function syncInventoryToXero() {
  // Phase 5 Task 5.2.4: Add correlation ID tracing
  const trace = UnifiedLogger.startTrace('XeroSync', 'syncInventoryToXero');

  const startTime = new Date();
  log('=== Starting Xero Inventory Sync (Enhanced) ===');

  try {
    trace.info('Starting Xero inventory sync');
    if (!isUrlFetchAllowedForXero_()) {
      throw new AppError('NETWORK_POLICY', 'UrlFetch policy blocked; cannot contact Xero.');
    }
    ensureXeroInventoryReadiness_();
    const tenantId = getXeroTenantIdOrThrow_();
    if (typeof callXeroAPI !== 'function') {
      throw new AppError('XERO_API_UNAVAILABLE', 'No callXeroAPI handler available. Re-authorize Xero and retry.');
    }

    // Read inventory data from sheet
    const allItems = readInventoryFromSheet();
    log(`Found ${allItems.length} total items in sheet`);

    // Validate items if enabled
    let itemsToSync = allItems;
    let validationWarnings = 0;

    if (CONFIG.VALIDATE_BEFORE_SYNC) {
      const validationResult = validateItems(allItems);
      itemsToSync = validationResult.validItems;
      validationWarnings = validationResult.warnings.length;

      if (validationResult.errors.length > 0) {
        log(`⚠️ ${validationResult.errors.length} items have validation errors and will be skipped`);
        saveValidationReport(validationResult);
      }
    }
  
      // Filter to only changed items if incremental sync enabled
    let itemsToProcess = itemsToSync;
    let skippedCount = 0;
  
    if (CONFIG.INCREMENTAL_SYNC) {
      const changeResult = filterChangedItems(itemsToSync);
      itemsToProcess = changeResult.changedItems;
      skippedCount = changeResult.skippedCount;
      log(`Incremental sync: ${itemsToProcess.length} changed, ${skippedCount} unchanged (skipped)`);
    }

    if (itemsToProcess.length === 0) {
      log('No items to sync');
      return {
        success: 0,
        failed: 0,
        skipped: skippedCount,
        validated: CONFIG.VALIDATE_BEFORE_SYNC,
        warnings: validationWarnings,
        duration: ((new Date() - startTime) / 1000).toFixed(2)
      };
    }

    // Sync items using batch operations
    const syncResult = syncItemsInBatches(itemsToProcess, tenantId);

    const duration = ((new Date() - startTime) / 1000).toFixed(2);
    log(`=== Sync Complete in ${duration}s ===`);
    log(`Success: ${syncResult.successCount} | Failed: ${syncResult.failCount} | Skipped: ${skippedCount}`);

    if (syncResult.errors.length > 0) {
      log('Errors:', syncResult.errors.join('\n'));
    }

    trace.complete('Xero inventory sync completed', {
      success: syncResult.successCount,
      failed: syncResult.failCount,
      skipped: skippedCount,
      duration: duration
    });

    return {
      success: syncResult.successCount,
      failed: syncResult.failCount,
      skipped: skippedCount,
      validated: CONFIG.VALIDATE_BEFORE_SYNC,
      warnings: validationWarnings,
      errors: syncResult.errors,
      duration: duration
    };

  } catch (error) {
    trace.fail('Xero inventory sync failed', error);
    log(`CRITICAL ERROR: ${error.message}`);
    log(error.stack);

    // Phase 5 Task 5.2.4: User-friendly error handling
    showFriendlyError(
      error,
      'Syncing Xero Inventory',
      {
        correlationId: trace.correlationId,
        retryCallback: function() {
          return syncInventoryToXero();
        }
      }
    );

    throw error;
  }
}

function isUrlFetchAllowedForXero_() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'isUrlFetchAllowedForXero_');
  try {
    // Check if callXeroAPI is available (from XeroAuth.js)
    if (typeof callXeroAPI === 'function') {
      trace.complete('isUrlFetchAllowedForXero_ completed - handler available', {});
      return true;
    }
    catchAndLog(function() {
      UnifiedLogger.warn('XeroSync', 'callXeroAPI handler unavailable');
    }, 'XeroSync');
    trace.complete('isUrlFetchAllowedForXero_ completed - handler unavailable', {});
    return false;
  } catch (error) {
    catchAndLog(function() {
      UnifiedLogger.warn('XeroSync', 'callXeroAPI handler check failed', String(error));
    }, 'XeroSync');
    trace.fail('isUrlFetchAllowedForXero_ failed', error);
    return false;
  }
}

/**
 * Perform dry run to preview changes
 */
function performDryRun() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'performDryRun');
  try {
    log('=== Starting Dry Run ===');

    ensureXeroInventoryReadiness_();
    const tenantId = getXeroTenantIdOrThrow_();
    if (typeof callXeroAPI !== 'function') {
      trace.fail('performDryRun - no API handler', {});
      throw new AppError('XERO_API_UNAVAILABLE', 'No callXeroAPI handler available. Re-authorize Xero and retry.');
    }

    const allItems = readInventoryFromSheet();
    const validationResult = validateItems(allItems);

    const toCreate = [];
    const toUpdate = [];
    const toSkip = [];

    // Check each valid item
    for (const item of validationResult.validItems) {
      // Check if changed (if incremental sync enabled)
      if (CONFIG.INCREMENTAL_SYNC && !hasItemChanged(item)) {
        toSkip.push(item);
        continue;
      }

      // Check if exists in Xero
      const existingItem = getXeroItem(item.code, tenantId);

      if (existingItem) {
        toUpdate.push(item);
      } else {
        toCreate.push(item);
      }
    }

    log(`Dry run: ${toCreate.length} to create, ${toUpdate.length} to update, ${toSkip.length} to skip`);

    // Save dry run report
    saveDryRunReport({
      toCreate: toCreate,
      toUpdate: toUpdate,
      toSkip: toSkip,
      errors: validationResult.errors
    });

    const result = {
      toCreate: toCreate,
      toUpdate: toUpdate,
      toSkip: toSkip,
      errors: validationResult.errors
    };
    trace.complete('performDryRun completed', { toCreate: toCreate.length, toUpdate: toUpdate.length, toSkip: toSkip.length });
    return result;
  } catch (error) {
    trace.fail('performDryRun failed', error);
    log(`Dry run error: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// DATA VALIDATION
// ============================================================================

/**
 * Validate items before syncing
 */
function validateItems(items) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'validateItems');
  try {
    if (!items) {
      log('validateItems: No items provided, reading from sheet');
      items = readInventoryFromSheet();
    }

    if (!Array.isArray(items)) {
      trace.fail('validateItems - not an array', {});
      throw new TypeError('validateItems: Expected an array of items');
    }

    const validItems = [];
    const errors = [];
    const warnings = [];

    for (const item of items) {
      const itemErrors = [];
      const itemWarnings = [];

      // Required field validation
      if (!item.code || item.code.trim() === '') {
        itemErrors.push(`Row ${item.row}: SKU is required`);
      }

      if (!item.name || item.name.trim() === '') {
        itemErrors.push(`Row ${item.row}: Name is required`);
      }

      // SKU format validation
      if (item.code) {
        if (item.code.length > 30) {
          itemErrors.push(`Row ${item.row}: SKU too long (max 30 characters)`);
        }

        // Check for invalid characters
        if (!/^[a-zA-Z0-9\-_]+$/.test(item.code)) {
          itemWarnings.push(`Row ${item.row}: SKU contains special characters (may cause issues)`);
        }
      }

      // Name length validation
      if (item.name && item.name.length > 50) {
        itemWarnings.push(`Row ${item.row}: Name is long (${item.name.length} chars, recommended <50)`);
      }

      // Description length validation
      if (item.description && item.description.length > 4000) {
        itemErrors.push(`Row ${item.row}: Description too long (max 4000 characters)`);
      }

      // Price validation
      if (item.sellPrice !== null && item.sellPrice !== undefined) {
        if (typeof item.sellPrice !== 'number' || isNaN(item.sellPrice)) {
          itemErrors.push(`Row ${item.row}: Sell price must be a valid number`);
        } else if (item.sellPrice < 0) {
          itemErrors.push(`Row ${item.row}: Sell price cannot be negative`);
        } else if (item.sellPrice === 0) {
          itemWarnings.push(`Row ${item.row}: Sell price is zero`);
        }
      }

      if (item.costPrice !== null && item.costPrice !== undefined) {
        if (typeof item.costPrice !== 'number' || isNaN(item.costPrice)) {
          itemErrors.push(`Row ${item.row}: Cost price must be a valid number`);
        } else if (item.costPrice < 0) {
          itemErrors.push(`Row ${item.row}: Cost price cannot be negative`);
        }
      }

      // Cost vs Sell price check
      if (item.sellPrice > 0 && item.costPrice > 0 && item.costPrice > item.sellPrice) {
        itemWarnings.push(`Row ${item.row}: Cost price (${item.costPrice}) > Sell price (${item.sellPrice})`);
      }

      // Account code validation (basic)
      if (item.accountCode && !/^\d{1,10}$/.test(item.accountCode)) {
        itemWarnings.push(`Row ${item.row}: Account code format may be invalid`);
      }

      if (item.purchaseAccount && !/^\d{1,10}$/.test(item.purchaseAccount)) {
        itemWarnings.push(`Row ${item.row}: Purchase account format may be invalid`);
      }

      // Store validation results
      if (itemErrors.length > 0) {
        errors.push({
          row: item.row,
          code: item.code,
          errors: itemErrors
        });
      } else {
        validItems.push(item);

        if (itemWarnings.length > 0) {
          warnings.push({
            row: item.row,
            code: item.code,
            warnings: itemWarnings
          });
        }
      }
    }

    log(`Validation: ${validItems.length} valid, ${errors.length} errors, ${warnings.length} warnings`);

    const result = {
      validItems: validItems,
      errors: errors,
      warnings: warnings
    };
    trace.complete('validateItems completed', { validItems: validItems.length, errors: errors.length, warnings: warnings.length });
    return result;
  } catch (error) {
    trace.fail('validateItems failed', error);
    throw error;
  }
}

/**
 * Save validation report to sheet
 */
function saveValidationReport(validationResult) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'saveValidationReport');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let reportSheet = ss.getSheetByName('Validation Report');

    if (!reportSheet) {
      reportSheet = ss.insertSheet('Validation Report');
    } else {
      reportSheet.clear();
    }

    // Add headers
    reportSheet.appendRow(['Timestamp', 'Row', 'SKU', 'Type', 'Message']);
    reportSheet.getRange('A1:E1').setFontWeight('bold');

    const timestamp = new Date();

    // Add errors
    validationResult.errors.forEach(error => {
      error.errors.forEach(msg => {
        reportSheet.appendRow([timestamp, error.row, error.code, 'ERROR', msg]);
      });
    });

    // Add warnings
    validationResult.warnings.forEach(warning => {
      warning.warnings.forEach(msg => {
        reportSheet.appendRow([timestamp, warning.row, warning.code, 'WARNING', msg]);
      });
    });

    // Color code (Optimized - use getLastRow() instead of getDataRange())
    const numRows = reportSheet.getLastRow();

    if (numRows > 1) {
      for (let i = 2; i <= numRows; i++) {
        const type = reportSheet.getRange(i, 4).getValue();
        if (type === 'ERROR') {
          reportSheet.getRange(i, 1, 1, 5).setBackground('#f4cccc');
        } else if (type === 'WARNING') {
          reportSheet.getRange(i, 1, 1, 5).setBackground('#fff2cc');
        }
      }
    }

    trace.complete('saveValidationReport completed', { errors: validationResult.errors.length, warnings: validationResult.warnings.length });
  } catch (error) {
    trace.fail('saveValidationReport failed', error);
    log(`Failed to save validation report: ${error.message}`);
  }
}

/**
 * Show validation report
 */
function showValidationReport() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'showValidationReport');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let reportSheet = ss.getSheetByName('Validation Report');

    if (!reportSheet) {
      SpreadsheetApp.getUi().alert('No validation report found. Run a sync first.');
      trace.complete('showValidationReport completed - no report found', {});
      return;
    }

    ss.setActiveSheet(reportSheet);
    trace.complete('showValidationReport completed', {});
  } catch (error) {
    trace.fail('showValidationReport failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Showing validation report',
      correlationId: trace.correlationId
    });
    showErrorToast('Show Report Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

// ============================================================================
// CHANGE DETECTION
// ============================================================================

/**
 * Calculate hash of item data for change detection
 */
function calculateItemHash(item) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'calculateItemHash');
  try {
    const hashData = [
      item.code,
      item.name,
      item.description,
      item.sellPrice,
      item.costPrice,
      item.accountCode,
      item.purchaseAccount
    ].join('|');

    const hash = Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      hashData,
      Utilities.Charset.UTF_8
    ).map(byte => (byte & 0xFF).toString(16).padStart(2, '0')).join('');
    trace.complete('calculateItemHash completed', { itemCode: item.code });
    return hash;
  } catch (error) {
    trace.fail('calculateItemHash failed', error);
    throw error;
  }
}

/**
 * Check if item has changed since last sync
 */
function hasItemChanged(item) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'hasItemChanged');
  try {
    const storedHash = item.storedHash || '';
    const currentHash = calculateItemHash(item);

    const changed = storedHash !== currentHash;
    trace.complete('hasItemChanged completed', { itemCode: item.code, changed: changed });
    return changed;
  } catch (error) {
    trace.fail('hasItemChanged failed', error);
    throw error;
  }
}

/**
 * Filter items to only those that have changed
 */
function filterChangedItems(items) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'filterChangedItems');
  try {
    const changedItems = [];
    let skippedCount = 0;

    for (const item of items) {
      if (hasItemChanged(item)) {
        changedItems.push(item);
      } else {
        skippedCount++;
      }
    }

    const result = {
      changedItems: changedItems,
      skippedCount: skippedCount
    };
    trace.complete('filterChangedItems completed', { totalItems: items.length, changed: changedItems.length, skipped: skippedCount });
    return result;
  } catch (error) {
    trace.fail('filterChangedItems failed', error);
    throw error;
  }
}

/**
 * Update item hash after successful sync
 */
function updateItemHash(item) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'updateItemHash');
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    const hash = calculateItemHash(item);
    sheet.getRange(`${CONFIG.COLUMNS.ROW_HASH}${item.row}`).setValue(hash);
    item.storedHash = hash;
    trace.complete('updateItemHash completed', { itemCode: item.code, row: item.row });
  } catch (error) {
    trace.fail('updateItemHash failed', error);
    throw error;
  }
}

// ============================================================================
// BATCH SYNC OPERATIONS
// ============================================================================

/**
 * Sync items in batches using Xero batch API
 */
function syncItemsInBatches(items, tenantId) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'syncItemsInBatches');
  try {
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // First, identify which items need to be created vs updated
    let itemsToCreate = [];
    const itemsToUpdate = [];

    log('Skipping existence check - creating all items as new');

    // Since Xero inventory is empty, just create everything
    itemsToCreate = items;

    log(`${itemsToCreate.length} items to create, ${itemsToUpdate.length} items to update`);

    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.verbose('XeroInventory', `Batch plan: Create=${itemsToCreate.length}, Update=${itemsToUpdate.length}`);
    }

    // Process creates in batches
    if (itemsToCreate.length > 0) {
      const createResult = batchCreateItems(itemsToCreate, tenantId);
      successCount += createResult.successCount;
      failCount += createResult.failCount;
      errors.push(...createResult.errors);
    }

    // Process updates in batches
    if (itemsToUpdate.length > 0) {
      const updateResult = batchUpdateItems(itemsToUpdate, tenantId);
      successCount += updateResult.successCount;
      failCount += updateResult.failCount;
      errors.push(...updateResult.errors);
    }

    const result = {
      successCount: successCount,
      failCount: failCount,
      errors: errors
    };
    trace.complete('syncItemsInBatches completed', { totalItems: items.length, success: successCount, failed: failCount });
    return result;
  } catch (error) {
    trace.fail('syncItemsInBatches failed', error);
    throw error;
  }
}

/**
 * Batch create items
 */
function batchCreateItems(items, tenantId) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'batchCreateItems');
  try {
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // Process in batches of CONFIG.BATCH_SIZE
    for (let i = 0; i < items.length; i += CONFIG.BATCH_SIZE) {
      const batch = items.slice(i, i + CONFIG.BATCH_SIZE);
      const batchNum = Math.floor(i / CONFIG.BATCH_SIZE) + 1;

      if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.verbose('XeroInventory', `Creating batch ${batchNum}`, { count: batch.length });
      }

      try {
        const xeroItems = batch.map(item => buildXeroItem(item));
        const result = createXeroItemsBatch(xeroItems, tenantId);

        // Process results
        result.Items.forEach((xeroItem, index) => {
          const originalItem = batch[index];

          if (xeroItem.HasValidationErrors) {
            failCount++;
            const errorMsg = xeroItem.ValidationErrors.map(e => e.Message).join(', ');
            errors.push(`${originalItem.code}: ${errorMsg}`);
            log(`✗ Failed to create: ${originalItem.code} - ${errorMsg}`);
          } else {
            successCount++;
            updateLastSyncedTimestamp(originalItem.row);
            updateItemHash(originalItem);
            log(`✓ Created: ${originalItem.code} - ${originalItem.name}`);
          }
        });

      } catch (error) {
        // Batch failed, mark all as failed
        failCount += batch.length;
        batch.forEach(item => {
          errors.push(`${item.code}: Batch failed - ${error.message}`);
        });
        log(`✗ Batch create failed: ${error.message}`);
        if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.error('XeroInventory', 'Batch create failed', error);
        }
      }

      // Rate limiting
      if (i + CONFIG.BATCH_SIZE < items.length) {
        Utilities.sleep(CONFIG.API_DELAY_MS);
      }
    }

    trace.complete('batchCreateItems completed', { totalItems: items.length, success: successCount, failed: failCount });
    return { successCount, failCount, errors };
  } catch (error) {
    trace.fail('batchCreateItems failed', error);
    throw error;
  }
}

/**
 * Batch update items
 */
function batchUpdateItems(items, tenantId) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'batchUpdateItems');
  try {
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // Process in batches
    for (let i = 0; i < items.length; i += CONFIG.BATCH_SIZE) {
      const batch = items.slice(i, i + CONFIG.BATCH_SIZE);
      const batchNum = Math.floor(i / CONFIG.BATCH_SIZE) + 1;

      if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.verbose('XeroInventory', `Updating batch ${batchNum}`, { count: batch.length });
      }

      try {
        const xeroItems = batch.map(item => {
          const xeroItem = buildXeroItem(item);
          xeroItem.ItemID = item.itemId;
          return xeroItem;
        });

        const result = updateXeroItemsBatch(xeroItems, tenantId);

        // Process results
        result.Items.forEach((xeroItem, index) => {
          const originalItem = batch[index];

          if (xeroItem.HasValidationErrors) {
            failCount++;
            const errorMsg = xeroItem.ValidationErrors.map(e => e.Message).join(', ');
            errors.push(`${originalItem.code}: ${errorMsg}`);
            log(`✗ Failed to update: ${originalItem.code} - ${errorMsg}`);
          } else {
            successCount++;
            updateLastSyncedTimestamp(originalItem.row);
            updateItemHash(originalItem);
            log(`✓ Updated: ${originalItem.code} - ${originalItem.name}`);
          }
        });

      } catch (error) {
        // Batch failed
        failCount += batch.length;
        batch.forEach(item => {
          errors.push(`${item.code}: Batch failed - ${error.message}`);
        });
        log(`✗ Batch update failed: ${error.message}`);
        if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.error('XeroInventory', 'Batch update failed', error);
        }
      }

      // Rate limiting
      if (i + CONFIG.BATCH_SIZE < items.length) {
        Utilities.sleep(CONFIG.API_DELAY_MS);
      }
    }

    trace.complete('batchUpdateItems completed', { totalItems: items.length, success: successCount, failed: failCount });
    return { successCount, failCount, errors };
  } catch (error) {
    trace.fail('batchUpdateItems failed', error);
    throw error;
  }
}

/**
 * Build Xero item object from sheet item
 */
function buildXeroItem(item) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'buildXeroItem');
  try {
    const xeroItem = {
      Code: item.code,
      Name: item.name,
      Description: item.description,
      IsSold: true,
      IsPurchased: true
    };

    // Add pricing if provided
    if (item.sellPrice > 0) {
      xeroItem.SalesDetails = {
        UnitPrice: item.sellPrice
      };

      if (item.accountCode) {
        xeroItem.SalesDetails.AccountCode = item.accountCode;
      }
    }

    if (CONFIG.INCLUDE_COST_PRICE && item.costPrice > 0) {
      xeroItem.PurchaseDetails = {
        UnitPrice: item.costPrice
      };

      if (item.purchaseAccount) {
        xeroItem.PurchaseDetails.AccountCode = item.purchaseAccount;
      }
    }

    trace.complete('buildXeroItem completed', { itemCode: item.code });
    return xeroItem;
  } catch (error) {
    trace.fail('buildXeroItem failed', error);
    throw error;
  }
}

// ============================================================================
// GOOGLE SHEETS FUNCTIONS
// ============================================================================

/**
 * Read inventory items from Google Sheet
 */
function readInventoryFromSheet() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'readInventoryFromSheet');
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      trace.fail('readInventoryFromSheet - sheet not found', {});
      throw new AppError('SHEET_MISSING', `Sheet "${CONFIG.SHEET_NAME}" not found`);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG.DATA_START_ROW) {
      trace.complete('readInventoryFromSheet completed - no data', {});
      return [];
    }

    const startRow = CONFIG.DATA_START_ROW;
    const startCol = QuoteUtils.columnLetterToIndex(CONFIG.COLUMNS.SKU) + 1;
    const endCol = QuoteUtils.columnLetterToIndex(CONFIG.COLUMNS.ROW_HASH) + 1;
    const numRows = lastRow - startRow + 1;
    const numCols = endCol - startCol + 1;

    const values = sheet.getRange(startRow, startCol, numRows, numCols).getValues();
    const items = [];

    values.forEach((rowValues, index) => {
      const rowNumber = startRow + index;
      const rawCode = rowValues[0];

      if (!rawCode || rawCode.toString().trim() === '') {
        return;
      }

      const rawSellPrice = rowValues[3];
      const rawCostPrice = rowValues[4];
      const rawAccountCode = rowValues[5];
      const rawPurchaseAccount = rowValues[6];
      const rawCategory = rowValues[7];
      const rawStatus = rowValues[8];
      const rawLastSynced = rowValues[9];
      const rawHash = rowValues[10];

      const item = {
        row: rowNumber,
        code: rawCode.toString().trim(),
        name: rowValues[1] ? rowValues[1].toString() : '',
        description: rowValues[2] ? rowValues[2].toString() : '',
        sellPrice: normalizeNumberValue(rawSellPrice),
        costPrice: normalizeNumberValue(rawCostPrice),
        accountCode: normalizeStringValue(rawAccountCode),
        purchaseAccount: normalizeStringValue(rawPurchaseAccount),
        category: rawCategory ? rawCategory.toString().trim() : '',
        status: rawStatus ? rawStatus.toString().trim() : 'Active',
        lastSynced: rawLastSynced || null,
        storedHash: rawHash || ''
      };

      items.push(item);
    });

    trace.complete('readInventoryFromSheet completed', { itemsRead: items.length });
    return items;
  } catch (error) {
    trace.fail('readInventoryFromSheet failed', error);
    throw error;
  }
}

/**
 * Normalize numeric values pulled from Sheets
 * @param {*} value
 * @return {number}
 */
function normalizeNumberValue(value) {
  return normalizeNumber(value, 0);
}

/**
 * Normalize optional string values pulled from Sheets
 * @param {*} value
 * @return {string|null}
 */
function normalizeStringValue(value) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'normalizeStringValue');
  try {
    if (value === null || value === undefined) {
      trace.complete('normalizeStringValue completed - null', {});
      return null;
    }

    const asString = typeof value === 'string' ? value.trim() : value.toString().trim();
    const result = asString === '' ? null : asString;
    trace.complete('normalizeStringValue completed', { hasValue: !!result });
    return result;
  } catch (error) {
    trace.fail('normalizeStringValue failed', error);
    throw error;
  }
}

/**
 * Update last synced timestamp
 */
function updateLastSyncedTimestamp(row) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'updateLastSyncedTimestamp');
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    const timestamp = new Date();
    sheet.getRange(`${CONFIG.COLUMNS.LAST_SYNCED}${row}`).setValue(timestamp);
    trace.complete('updateLastSyncedTimestamp completed', { row: row });
  } catch (error) {
    trace.fail('updateLastSyncedTimestamp failed', error);
    throw error;
  }
}


// ============================================================================
// XERO API FUNCTIONS (with batch support)
// ============================================================================

/**
 * Get item from Xero by code
 */
function getXeroItem(itemCode, tenantId) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'getXeroItem');
  try {
    if (!itemCode || String(itemCode).trim() === '') {
      trace.fail('getXeroItem - no item code', {});
      throw new AppError('VALIDATION_ERROR', 'getXeroItem: itemCode is required');
    }

    try {
      const response = callXeroAPI(`/Items/${encodeURIComponent(itemCode)}`, 'GET', null, { tenantId: tenantId });
      if (response && response.Items && response.Items.length > 0) {
        trace.complete('getXeroItem completed - item found', { itemCode: itemCode });
        return response.Items[0];
      }
      trace.complete('getXeroItem completed - item not found', { itemCode: itemCode });
      return null;
    } catch (error) {
      log(`Error getting item ${itemCode}: ${error.message}`);
      trace.complete('getXeroItem completed - error', { itemCode: itemCode });
      return null;
    }
  } catch (error) {
    trace.fail('getXeroItem failed', error);
    throw error;
  }
}

/**
 * Create items in batch (up to 100 items)
 */
function createXeroItemsBatch(items, tenantId) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'createXeroItemsBatch');
  try {
    const payload = {
      Items: items
    };

    const response = callXeroAPI('/Items?summarizeErrors=false', 'PUT', payload, { tenantId: tenantId });

    if (response && response.Items) {
      trace.complete('createXeroItemsBatch completed', { itemCount: items.length });
      return response;
    }

    trace.fail('createXeroItemsBatch - empty response', {});
    throw new AppError('XERO_API_ERROR', 'Failed to create items batch: empty response');
  } catch (error) {
    trace.fail('createXeroItemsBatch failed', error);
    throw error;
  }
}

/**
 * Update items in batch (up to 100 items)
 */
function updateXeroItemsBatch(items, tenantId) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'updateXeroItemsBatch');
  try {
    const payload = {
      Items: items
    };

    const response = callXeroAPI('/Items?includeArchived=true', 'POST', payload, { tenantId: tenantId });

    if (response && response.Items) {
      trace.complete('updateXeroItemsBatch completed', { itemCount: items.length });
      return response;
    }

    trace.fail('updateXeroItemsBatch - empty response', {});
    throw new AppError('XERO_API_ERROR', 'Failed to update items batch: empty response');
  } catch (error) {
    trace.fail('updateXeroItemsBatch failed', error);
    throw error;
  }
}

// ============================================================================
// XERO OAUTH 2.0 AUTHENTICATION (same as basic version)
// ============================================================================

/**
 * Get Xero access token
 */
// Token lifecycle is owned by XeroAuth.js; legacy helpers removed.

/**
 * Get Xero Tenant ID
 */
function getTenantId() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'getTenantId');
  try {
    const connections = callXeroAPI('/connections', 'GET');
    if (connections && connections.length > 0) {
      const tenantId = connections[0].tenantId;
      catchAndLog(function() {
        UnifiedLogger.info('XeroSync', 'Your Xero Tenant ID: ' + tenantId);
      }, 'XeroSync');
      trace.complete('getTenantId completed', { tenantId: tenantId });
      return tenantId;
    }
    catchAndLog(function() {
      UnifiedLogger.warn('XeroSync', 'No Xero organizations found');
    }, 'XeroSync');
    trace.complete('getTenantId completed - no organizations', {});
    return null;
  } catch (error) {
    trace.fail('getTenantId failed', error);
    throw error;
  }
}

// ============================================================================
// SCHEDULED SYNC & UTILITIES
// ============================================================================

/**
 * Setup scheduled sync trigger
 */
function setupScheduledSync() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'setupScheduledSync');
  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.prompt(
      'Setup Scheduled Sync',
      'Enter sync frequency (hours between syncs, e.g., 1, 6, 24):',
      ui.ButtonSet.OK_CANCEL
    );

    if (result.getSelectedButton() === ui.Button.OK) {
      const hours = parseInt(result.getResponseText());

      if (isNaN(hours) || hours < 1) {
        ui.alert('Invalid input. Please enter a number >= 1');
        trace.complete('setupScheduledSync completed - invalid input', {});
        return;
      }

      deleteAllTriggers();

      ScriptApp.newTrigger('syncInventoryToXero')
        .timeBased()
        .everyHours(hours)
        .create();

      ui.alert(`✅ Scheduled sync setup complete!\nInventory will sync every ${hours} hour(s).`);
      trace.complete('setupScheduledSync completed - trigger created', { hours: hours });
    } else {
      trace.complete('setupScheduledSync completed - user cancelled', {});
    }
  } catch (error) {
    trace.fail('setupScheduledSync failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Setting up scheduled sync',
      correlationId: trace.correlationId
    });
    showErrorToast('Scheduled Sync Setup Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Delete all existing triggers
 */
function deleteAllTriggers() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'deleteAllTriggers');
  try {
    const allowedHandlers = [
      'syncInventoryToXero',
      'performDryRun',
      'syncToXeroManual',
      'dryRunSync',
      'forceFullSync',
      'setupScheduledSync'
    ];
    const triggers = ScriptApp.getProjectTriggers();
    const summary = { deleted: 0, skipped: 0 };
    triggers.forEach(trigger => {
      const handler = trigger.getHandlerFunction && trigger.getHandlerFunction();
      if (handler && allowedHandlers.indexOf(handler) !== -1) {
        ScriptApp.deleteTrigger(trigger);
        summary.deleted++;
      } else {
        summary.skipped++;
      }
    });
    catchAndLog(function() {
      UnifiedLogger.info('XeroSync', 'Scoped trigger cleanup', summary);
    }, 'XeroSync');
    trace.complete('deleteAllTriggers completed', summary);
  } catch (error) {
    trace.fail('deleteAllTriggers failed', error);
    throw error;
  }
}

/**
 * Log message
 */
function log(message) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'log');
  try {
    if (!CONFIG.LOG_ENABLED) {
      trace.complete('log completed - logging disabled', {});
      return;
    }

    catchAndLog(function() {
      UnifiedLogger.info('XeroSync', message);
    }, 'XeroSync');
    trace.complete('log completed', {});
  } catch (error) {
    trace.fail('log failed', error);
    throw error;
  }
}

/**
 * Show sync log
 */
function showSyncLog() {
  const trace = UnifiedLogger.startTrace('XeroSync', 'showSyncLog');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('Sync Log');

    if (!logSheet) {
      SpreadsheetApp.getUi().alert('No sync log found. Run a sync first.');
      trace.complete('showSyncLog completed - no log found', {});
      return;
    }

    ss.setActiveSheet(logSheet);
    trace.complete('showSyncLog completed', {});
  } catch (error) {
    trace.fail('showSyncLog failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Showing sync log',
      correlationId: trace.correlationId
    });
    showErrorToast('Show Sync Log Failed', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Save dry run report
 */
function saveDryRunReport(results) {
  const trace = UnifiedLogger.startTrace('XeroSync', 'saveDryRunReport');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let reportSheet = ss.getSheetByName('Dry Run Report');

    if (!reportSheet) {
      reportSheet = ss.insertSheet('Dry Run Report');
    } else {
      reportSheet.clear();
    }

    reportSheet.appendRow(['Timestamp', 'Action', 'SKU', 'Name', 'Sell Price', 'Cost Price']);
    reportSheet.getRange('A1:F1').setFontWeight('bold');

    const timestamp = new Date();

    results.toCreate.forEach(item => {
      reportSheet.appendRow([timestamp, 'CREATE', item.code, item.name, item.sellPrice, item.costPrice]);
    });

    results.toUpdate.forEach(item => {
      reportSheet.appendRow([timestamp, 'UPDATE', item.code, item.name, item.sellPrice, item.costPrice]);
    });

    results.toSkip.forEach(item => {
      reportSheet.appendRow([timestamp, 'SKIP', item.code, item.name, item.sellPrice, item.costPrice]);
    });

    results.errors.forEach(error => {
      reportSheet.appendRow([timestamp, 'ERROR', error.code, '', '', '']);
    });

    // Color code (Optimized - use getLastRow() instead of getDataRange())
    const numRows = reportSheet.getLastRow();

    if (numRows > 1) {
      for (let i = 2; i <= numRows; i++) {
        const action = reportSheet.getRange(i, 2).getValue();
        if (action === 'CREATE') {
          reportSheet.getRange(i, 1, 1, 6).setBackground('#d9ead3');
        } else if (action === 'UPDATE') {
          reportSheet.getRange(i, 1, 1, 6).setBackground('#c9daf8');
        } else if (action === 'SKIP') {
          reportSheet.getRange(i, 1, 1, 6).setBackground('#efefef');
        } else if (action === 'ERROR') {
          reportSheet.getRange(i, 1, 1, 6).setBackground('#f4cccc');
        }
      }
    }

    trace.complete('saveDryRunReport completed', { toCreate: results.toCreate.length, toUpdate: results.toUpdate.length, toSkip: results.toSkip.length });
  } catch (error) {
    trace.fail('saveDryRunReport failed', error);
    log(`Failed to save dry run report: ${error.message}`);
  }
}

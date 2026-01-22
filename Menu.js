/**
 * hrmny Quote Builder - Custom Menu
 * Creates custom menu in Google Sheets UI
 */

const MENU_LOG_CATEGORY = 'Menu';

const MENU_REBUILD_CACHE_KEY = 'MENU_REBUILD_INFLIGHT';
const MENU_REBUILD_PROP_KEY = 'MENU_LAST_REBUILD_TS';
const MENU_THROTTLE_SECONDS = 5;
// READINESS_USAGE_PROP is defined globally in 05_AISidebar_Config.js:42
const REQUIRED_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.container.ui',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/script.external_request'
];
const STARTUP_FRESHNESS_MS = 4 * 60 * 60 * 1000;
const BOOTSTRAP_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const STARTUP_STAGE_COUNT = 5;
const STAGE_INPROGRESS_MAX_MS = 10 * 60 * 1000;
const STAGE_TOTAL_BUDGET_MS = 5 * 60 * 1000;
const STAGE_BUDGET_MS = {
  1: 15000,
  2: 90000,
  3: 30000,
  4: 15000,
  5: 15000
};

// ========================================
// PHASE 3: DEFERRED INITIALIZATION FLAG
// Phase C (v3.1): Enhanced with stage-based loading
// ========================================

/**
 * Flag to track initialization status with stage-based loading.
 * Prevents duplicate initialization while allowing onOpen to complete quickly.
 *
 * Phase C (v3.1): Enhanced with stages:
 * - Stage 1: Critical path (<3s) - Config, Logger, basic menu
 * - Stage 2: Enhanced features (deferred 60s) - XeroSync, AISidebar
 * - Stage 3: Admin tools (on-demand) - Diagnostics, PropertiesMonitor
 */
const MENU_INITIALIZED = {
  value: false, // Keep for backward compatibility
  currentStage: 0,
  stages: {
    1: { loaded: false, name: 'critical', budget: 3000 }, // Critical path: <3s
    2: { loaded: false, name: 'enhanced', budget: 3000 }, // Enhanced features (deferred)
    3: { loaded: false, name: 'admin', budget: 0 }         // Admin tools (on-demand)
  },
  triggers: [] // Track created triggers for cleanup
};


function getTriggerCreationPermission_() {
  const trace = UnifiedLogger.startTrace('Menu', 'getTriggerCreationPermission_');
  try {
    if (typeof ScriptApp === 'undefined' || !ScriptApp || typeof ScriptApp.getAuthorizationInfo !== 'function') {
      trace.complete('ScriptApp unavailable', { reason: 'scriptapp-unavailable' });
      return { allowed: false, reason: 'scriptapp-unavailable' };
    }
    const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    const status = info && typeof info.getAuthorizationStatus === 'function'
      ? info.getAuthorizationStatus()
      : null;
    if (status === ScriptApp.AuthorizationStatus.REQUIRED) {
      trace.complete('Authorization required', { status: status });
      return { allowed: false, reason: 'authorization-required', status: status };
    }
    trace.complete('Permission granted', { status: status });
    return { allowed: true, status: status || 'unknown' };
  } catch (error) {
    trace.fail('getTriggerCreationPermission_ failed', error);
    return { allowed: false, reason: 'permission-probe-failed', error: '' + error };
  }
}

// ========================================
// PHASE C (v3.1): STAGE-BASED LOADING FUNCTIONS
// ========================================

/**
 * Load a specific stage with budget tracking and error handling
 * @param {number} stageNum - Stage number (1, 2, or 3)
 */
function loadStage_(stageNum) {
  if (MENU_INITIALIZED.currentStage >= stageNum) {
    return; // Already loaded
  }

  const stage = MENU_INITIALIZED.stages[stageNum];
  if (typeof perfMark === 'function') perfMark('menu-stage-' + stageNum + '-start');

  try {
    switch(stageNum) {
      case 1:
        loadStage1Critical_();
        break;
      case 2:
        loadStage2Enhanced_();
        break;
      case 3:
        loadStage3Admin_();
        break;
    }

    stage.loaded = true;
    MENU_INITIALIZED.currentStage = stageNum;

    if (typeof perfMark === 'function') perfMark('menu-stage-' + stageNum + '-end');

    const duration = typeof perfGetDuration === 'function'
      ? perfGetDuration('menu-stage-' + stageNum + '-start', 'menu-stage-' + stageNum + '-end')
      : 0;

    if (duration && duration > stage.budget && stage.budget > 0) {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage ' + stageNum + ' exceeded budget', {
          stage: stageNum,
          duration: duration,
          budget: stage.budget
        });
      }
    }
  } catch (error) {
    if (typeof perfRecordError === 'function') {
      perfRecordError('MENU_STAGE', 'Stage ' + stageNum + ' failed', error);
    }
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error(MENU_LOG_CATEGORY, 'Stage ' + stageNum + ' failed', error);
    }
  }
}

/**
 * Stage 1: Critical path only (<3s target)
 * Load minimum: Config cache, Logger, basic menu
 */
function loadStage1Critical_() {
  // PropertiesCache has been deprecated - no longer needed
  // TODO: Consider using ConfigurationManager for batch loading

  // Build core menu (just essential items)
  buildCoreMenu_();
}

/**
 * Stage 2: Enhanced features (deferred 60s)
 * Load: XeroSync, AISidebar, advanced menu items
 */
function loadStage2Enhanced_() {
  // Rebuild menu with enhanced features
  rebuildMenuWithEnhancedFeatures_();
}

/**
 * Stage 3: Admin tools (on-demand only)
 * Load: Diagnostics, PropertiesMonitor, Profiler
 * These are heavy and rarely used
 */
function loadStage3Admin_() {
  // Admin tools are loaded on-demand when accessed
  // No preloading needed
}

/**
 * Open the UnifiedLogger log sheet
 * Menu handler for "View Logs"
 */
function openLogSheet() {
  try {
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('UNIFIED_LOGGER_SPREADSHEET_ID');
    if (!spreadsheetId) {
      SpreadsheetApp.getUi().alert(
        'Logs Not Available',
        'UnifiedLogger spreadsheet ID not configured. Please initialize the logger first.',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }

    const logSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const logSheet = logSpreadsheet.getSheetByName('UnifiedLogger_Logs');

    if (!logSheet) {
      SpreadsheetApp.getUi().alert(
        'Log Sheet Not Found',
        'UnifiedLogger_Logs sheet not found in the log spreadsheet.',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }

    // Show URL to open in new tab
    const url = logSpreadsheet.getUrl() + '#gid=' + logSheet.getSheetId();
    const html = HtmlService.createHtmlOutput(
      '<p><a href="' + url + '" target="_blank">Open UnifiedLogger Logs</a></p>' +
      '<p><small>Click the link above to view logs in a new tab.</small></p>'
    ).setWidth(400).setHeight(100);

    SpreadsheetApp.getUi().showModalDialog(html, 'View Logs');
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      'Error',
      'Failed to open log sheet: ' + error.message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Display system health report
 * Menu handler for "System Health"
 */
function viewSystemHealth() {
  try {
    // Check if perfGetSystemHealth exists
    if (typeof perfGetSystemHealth === 'undefined') {
      SpreadsheetApp.getUi().alert(
        'System Health Not Available',
        'Performance monitoring is not loaded. Please ensure admin tools are deployed.',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }

    const health = perfGetSystemHealth();

    const output = [
      '=== SYSTEM HEALTH REPORT ===',
      '',
      'Health Status: ' + health.health,
      'Timestamp: ' + health.timestamp,
      '',
      '--- Performance (Session) ---',
      'Total Operations: ' + health.performance.totalOperations,
      'Slowest: ' + (health.performance.slowestSegment ?
        health.performance.slowestSegment.segment + ' (' + health.performance.slowestSegment.duration + 'ms)' : 'N/A'),
      '',
      '--- Errors ---',
      'Total Errors: ' + health.errors.total,
      'Error Rate: ' + health.errors.errorRate,
      'By Category: ' + JSON.stringify(health.errors.byCategory),
      '',
      '--- Config Load Metrics ---',
      health.configLoad && health.configLoad.overall ?
        'Success Rate: ' + (health.configLoad.overall.successRate * 100).toFixed(1) + '%' : 'N/A',
      health.configLoad && health.configLoad.overall ?
        'Cache Hit Rate: ' + (health.configLoad.overall.cacheHitRate * 100).toFixed(1) + '%' : 'N/A',
      '',
      '--- Cache Stats ---',
      health.cache ? 'Hit Rate: ' + health.cache.hitRate : 'N/A',
      health.cache ? 'Cache Size: ' + health.cache.cacheSize : 'N/A',
      health.cache ? 'Cache Version: ' + (health.cache.version || 'unversioned') : 'N/A',
      health.cache ? 'TTL Keys: ' + health.cache.ttlKeys : 'N/A'
    ];

    const ui = SpreadsheetApp.getUi();
    ui.alert('System Health', output.join('\n'), ui.ButtonSet.OK);
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      'Error',
      'Failed to generate health report: ' + error.message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Refresh configuration caches
 * Menu handler for "Refresh Config"
 *
 * Clears ConfigurationManager caches (Sheet, Properties, BusinessRules).
 * Use this after editing config sheets (Brief Profiles, Scope Phases, catalogs)
 * to see changes immediately without reopening the spreadsheet.
 */
function refreshConfigMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'refreshConfigMenu');
  try {
    if (typeof ConfigurationManager === 'undefined' || !ConfigurationManager.invalidate) {
      throw new Error('ConfigurationManager not available');
    }

    ConfigurationManager.invalidate();
    SpreadsheetApp.getActiveSpreadsheet().toast('Configuration cache cleared', 'Config', 3);
    trace.complete('refreshConfigMenu completed');
  } catch (error) {
    trace.fail('refreshConfigMenu failed', error);
    SpreadsheetApp.getUi().alert(
      'Error',
      'Failed to refresh config: ' + error.message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Build core menu with essential items only
 */
function buildCoreMenu_() {
  try {
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu('Fresh CP');

    // Critical items only (Stage 1 - onOpen)
    if (typeof refreshConfigMenu === 'function') {
      menu.addItem('Refresh Config', 'refreshConfigMenu');
    }
    menu.addItem('View Logs', 'openLogSheet');
    menu.addItem('System Health', 'viewSystemHealth');

    menu.addToUi();
  } catch (error) {
    console.error('[Menu] buildCoreMenu_ failed:', error);
  }
}

/**
 * Rebuild menu with enhanced features (Stage 2+)
 */
function rebuildMenuWithEnhancedFeatures_() {
  try {
    const ui = SpreadsheetApp.getUi();

    // Build full production and advanced menus
    buildProductionMenu_(ui);
    buildAdvancedMenu_(ui);
  } catch (error) {
    console.error('[Menu] rebuildMenuWithEnhancedFeatures_ failed:', error);
  }
}

/**
 * Schedule Stage 2 for deferred loading (60s after onOpen)
 * Pattern from App-script/Menu.js:97 (getTriggerCreationPermission_)
 * Apps Script limitation: Simple triggers cannot create installable triggers
 */
function scheduleStage2Deferred_() {
  try {
    // Permission check pattern from App-script/Menu.js:97
    const permission = getTriggerCreationPermission_();

    if (!permission.allowed) {
      // Lazy load fallback pattern from App-script/Menu.js:54-63
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage 2 will load on next user interaction', {
          reason: permission.reason
        });
      }
      MENU_INITIALIZED.stages[2].pendingLazyLoad = true;
      return;
    }

    // Trigger creation pattern from App-script/Menu.js:285-294 (original code)
    const trigger = ScriptApp.newTrigger('loadStage2Trigger_')
      .timeBased()
      .after(60 * 1000)
      .create();

    MENU_INITIALIZED.triggers.push({
      id: trigger.getUniqueId(),
      handler: 'loadStage2Trigger_',
      created: new Date()
    });
  } catch (error) {
    // Error handling pattern from App-script/Menu.js:295-299 (original code)
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage 2 trigger failed, using lazy load', {
        error: error.message || ''
      });
    }
    MENU_INITIALIZED.stages[2].pendingLazyLoad = true;
  }
}

/**
 * Trigger handler for Stage 2 deferred loading
 */
function loadStage2Trigger_() {
  try {
    loadStage_(2);
    cleanupTrigger_('loadStage2Trigger_');
  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error(MENU_LOG_CATEGORY, 'Stage 2 trigger failed', error);
    }
  }
}

/**
 * Load pending stages on user interaction (lazy loading fallback)
 * Pattern from App-script/Menu.js:54-63 (MENU_INITIALIZED.stages)
 * Call this at start of menu functions to load deferred stages
 */
function loadPendingStagesOnInteraction_() {
  try {
    // Check pattern from App-script/Menu.js:54-63
    for (let stageNum = 1; stageNum <= 3; stageNum++) {
      const stage = MENU_INITIALIZED.stages[stageNum];
      if (stage && stage.pendingLazyLoad && !stage.loaded) {
        if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.info(MENU_LOG_CATEGORY, 'Lazy loading stage on user interaction', {
            stage: stageNum
          });
        }
        loadStage_(stageNum);
        stage.pendingLazyLoad = false;
      }
    }
  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Lazy load check failed', error);
    }
  }
}

/**
 * Cleanup trigger by handler name
 * @param {string} handlerName - Name of the trigger handler function
 */
function cleanupTrigger_(handlerName) {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let cleaned = 0;

    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === handlerName) {
        ScriptApp.deleteTrigger(triggers[i]);
        cleaned++;
      }
    }

    // Remove from tracking
    MENU_INITIALIZED.triggers = MENU_INITIALIZED.triggers.filter(function(t) {
      return t.handler !== handlerName;
    });

    if (cleaned > 0 && typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Cleaned up triggers', { handler: handlerName, count: cleaned });
    }
  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error(MENU_LOG_CATEGORY, 'Trigger cleanup failed', error);
    }
  }
}

/**
 * Admin function to force stage loading (for testing/debugging)
 * @param {number} stageNum - Stage number to load
 * @return {Object} Stage status
 */
function forceLoadStage(stageNum) {
  loadStage_(stageNum);
  const stage = MENU_INITIALIZED.stages[stageNum];
  return {
    stage: stageNum,
    loaded: stage.loaded,
    currentStage: MENU_INITIALIZED.currentStage
  };
}

// Export globally

// ========================================
// LEGACY DEFERRED INITIALIZATION (kept for compatibility)
// ========================================

/**
 * Deferred initialization function.
 * Runs heavy initialization operations only once, on first menu action.
 * This keeps onOpen() lightweight and prevents 30+ second timeouts.
 */
function deferredInitialization() {
  // Check if already initialized (idempotent)
  if (MENU_INITIALIZED.value) {
    return;
  }

  // Mark as initialized immediately to prevent duplicate runs
  MENU_INITIALIZED.value = true;

  // Performance monitoring
  if (typeof perfMark === 'function') perfMark('deferredInit-start');

  const trace = UnifiedLogger.startTrace('Menu', 'deferredInitialization');
  try {
    // Run heavy initialization that was previously in onOpen()
    runOnOpenAsync(null, { triggersAllowed: false });
    trace.complete('deferredInitialization completed');

    if (typeof perfMark === 'function') perfMark('deferredInit-beforeDisableStartup');

    // Disable startup mode to re-enable full trace logging
    if (typeof disableStartupMode_ === 'function') {
      disableStartupMode_();
    }

    if (typeof perfMark === 'function') {
      perfMark('deferredInit-end');
      // Log performance report after deferred initialization completes
      if (typeof perfLogReport === 'function') perfLogReport();
    }
  } catch (error) {
    if (typeof perfMark === 'function') perfMark('deferredInit-error');
    trace.fail('deferredInitialization failed', error);
    // Don't reset flag - avoid infinite retry loops
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'deferredInitialization failed', String(error));

    // Still disable startup mode even on error (allow normal logging for debugging)
    if (typeof disableStartupMode_ === 'function') {
      disableStartupMode_();
    }
  }
}

/**
 * Simple trigger fired when the spreadsheet opens.
 * Lightweight - only creates menus, defers heavy init.
 * Phase C (v3.1): Enhanced with stage-based loading
 * @param {GoogleAppsScript.Events.SheetsOnOpen|undefined} event
 */
function onOpen(event) {
  try {
    // SIMPLIFIED: Build menu directly with zero dependencies
    const ui = SpreadsheetApp.getUi();

    // Production Menu
    const menu = ui.createMenu('Fresh CP');
    menu.addItem('🔐 Authorize Xero', 'authorizeXero');
    menu.addItem('⚡ Sync Inventory to Xero', 'syncToXeroManual');
    menu.addItem('🚀 AI Quote Builder', 'showAIQuoteBuilder');
    menu.addSeparator();
    menu.addItem('Refresh Config', 'refreshConfigMenu');
    menu.addItem('View Logs', 'openLogSheet');
    menu.addItem('System Health', 'viewSystemHealth');
    menu.addToUi();

    // Advanced Menu
    ui.createMenu('🔧 Advanced')
      .addItem('📥 Sync Scopes to Vector Store', 'syncScopeBuildupsToVectorStoreMenu')
      .addItem('🩺 Check Integrations Health', 'checkIntegrationsHealthMenu')
      .addSeparator()
      .addItem('🧾 Show Script Properties', 'showScriptPropertiesMenu')
      .addItem('✍️ Set Script Property', 'setScriptPropertyFromPrompt')
      .addSeparator()
      .addItem('🔍 Search Logs', 'searchLogsMenu')
      .addItem('📊 Error Summary', 'showErrorSummaryMenu')
      .addToUi();

    console.log('[Menu] onOpen completed - menus built');
  } catch (error) {
    console.error('[Menu] onOpen failed:', error);
    console.error('[Menu] Error stack:', error.stack);
  }
}

/**
 * Installable trigger handler to ensure menus exist after manual installation.
 * @param {GoogleAppsScript.Events.SheetsOnOpen|undefined} event
 */
function onInstall(event) {
  const trace = UnifiedLogger.startTrace('Menu', 'onInstall');
  try {
    rebuildMenus(event);
    trace.complete('onInstall completed successfully', { hasEvent: !!event });
  } catch (error) {
    trace.fail('onInstall failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Installing add-on',
      correlationId: trace.correlationId
    });
    showErrorToast('Installation Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

function markOnOpenHeartbeat_() {
  const trace = UnifiedLogger.startTrace('Menu', 'markOnOpenHeartbeat_');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      props.setProperty('LAST_ONOPEN_TS', String(new Date().getTime()));
    }
    trace.complete('markOnOpenHeartbeat_ completed', { hasProps: !!props });
  } catch (error) {
    trace.fail('markOnOpenHeartbeat_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'markOnOpenHeartbeat_ failed', String(error));
  }
}

function getStartupProps_() {
  const trace = UnifiedLogger.startTrace('Menu', 'getStartupProps_');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    trace.complete('getStartupProps_ completed', { hasProps: !!props });
    return props;
  } catch (error) {
    trace.fail('getStartupProps_ failed', error);
    throw error;
  }
}

function getStagePropKey_(stage, suffix) {
  const trace = UnifiedLogger.startTrace('Menu', 'getStagePropKey_');
  try {
    const key = 'STARTUP_STAGE' + stage + '_' + suffix;
    trace.complete('getStagePropKey_ completed', { stage: stage, suffix: suffix });
    return key;
  } catch (error) {
    trace.fail('getStagePropKey_ failed', error);
    throw error;
  }
}

function parseStageProgress_(value) {
  const trace = UnifiedLogger.startTrace('Menu', 'parseStageProgress_');
  try {
    if (!value) {
      trace.complete('parseStageProgress_ completed - no value', { hasValue: false });
      return null;
    }
    try {
      const result = JSON.parse(value);
      trace.complete('parseStageProgress_ completed', { hasValue: true });
      return result;
    } catch (ignore) {
      trace.fail('JSON parse failed', ignore);
      return null;
    }
  } catch (error) {
    trace.fail('parseStageProgress_ failed', error);
    throw error;
  }
}

function getStageState_(stage, props) {
  const trace = UnifiedLogger.startTrace('Menu', 'getStageState_');
  try {
    const store = props || getStartupProps_();
    if (!store) {
      trace.complete('getStageState_ completed - no store', { hasStore: false });
      return {};
    }
    const state = {
      status: store.getProperty(getStagePropKey_(stage, 'STATUS')) || null,
      ts: parseInt(store.getProperty(getStagePropKey_(stage, 'TS')) || '0', 10) || 0,
      progress: parseStageProgress_(store.getProperty(getStagePropKey_(stage, 'PROGRESS'))),
      inProgressTs: parseInt(store.getProperty(getStagePropKey_(stage, 'IN_PROGRESS_TS')) || '0', 10) || 0,
      retryCount: parseInt(store.getProperty(getStagePropKey_(stage, 'RETRY_COUNT')) || '0', 10) || 0,
      retryLock: parseInt(store.getProperty(getStagePropKey_(stage, 'RETRY_LOCK')) || '0', 10) || 0,
      lastError: store.getProperty(getStagePropKey_(stage, 'LAST_ERROR')) || null
    };
    trace.complete('getStageState_ completed', { stage: stage, status: state.status });
    return state;
  } catch (error) {
    trace.fail('getStageState_ failed', error);
    throw error;
  }
}

function setStageState_(stage, data, props) {
  const trace = UnifiedLogger.startTrace('Menu', 'setStageState_');
  try {
    const store = props || getStartupProps_();
    if (!store) {
      trace.complete('setStageState_ completed - no store', { hasStore: false });
      return;
    }
    if (data.status) {
      store.setProperty(getStagePropKey_(stage, 'STATUS'), data.status);
    }
    if (data.ts) {
      store.setProperty(getStagePropKey_(stage, 'TS'), String(data.ts));
    }
    if (data.progress !== undefined) {
      if (data.progress === null) {
        store.deleteProperty(getStagePropKey_(stage, 'PROGRESS'));
      } else {
        const progressJson = JSON.stringify(data.progress);
        const validation = validatePropertySize(progressJson, 9000);
        if (!validation.valid) {
          UnifiedLogger.warn('PropertyWrite', 'Stage progress payload too large', {
            stage: stage,
            key: getStagePropKey_(stage, 'PROGRESS'),
            size: validation.size,
            message: validation.message
          });
          // Skip storing oversized progress data
        } else {
          store.setProperty(getStagePropKey_(stage, 'PROGRESS'), progressJson);
        }
      }
    }
    if (data.inProgressTs !== undefined) {
      if (data.inProgressTs) {
        store.setProperty(getStagePropKey_(stage, 'IN_PROGRESS_TS'), String(data.inProgressTs));
      } else {
        store.deleteProperty(getStagePropKey_(stage, 'IN_PROGRESS_TS'));
      }
    }
    if (data.retryCount !== undefined) {
      store.setProperty(getStagePropKey_(stage, 'RETRY_COUNT'), String(data.retryCount));
    }
    if (data.retryLock !== undefined) {
      if (data.retryLock) {
        store.setProperty(getStagePropKey_(stage, 'RETRY_LOCK'), String(data.retryLock));
      } else {
        store.deleteProperty(getStagePropKey_(stage, 'RETRY_LOCK'));
      }
    }
    if (data.lastError !== undefined) {
      if (data.lastError === null) {
        store.deleteProperty(getStagePropKey_(stage, 'LAST_ERROR'));
      } else {
        store.setProperty(getStagePropKey_(stage, 'LAST_ERROR'), String(data.lastError));
      }
    }
    trace.complete('setStageState_ completed', { stage: stage, dataKeys: Object.keys(data || {}) });
  } catch (error) {
    trace.fail('setStageState_ failed', error);
    throw error;
  }
}

function computeNextStageFromProps_(props) {
  const trace = UnifiedLogger.startTrace('Menu', 'computeNextStageFromProps_');
  try {
    const store = props || getStartupProps_();
    if (!store) {
      trace.complete('computeNextStageFromProps_ completed - no store', { result: 1 });
      return 1;
    }
    for (let i = 1; i <= STARTUP_STAGE_COUNT; i++) {
      const state = getStageState_(i, store);
      if (state.status !== 'ok') {
        trace.complete('computeNextStageFromProps_ completed', { nextStage: i });
        return i;
      }
    }
    trace.complete('computeNextStageFromProps_ completed - all stages ok', { result: null });
    return null;
  } catch (error) {
    trace.fail('computeNextStageFromProps_ failed', error);
    throw error;
  }
}

function isOverallStartupFresh_(props, now) {
  const trace = UnifiedLogger.startTrace('Menu', 'isOverallStartupFresh_');
  try {
    const store = props || getStartupProps_();
    if (!store) {
      trace.complete('isOverallStartupFresh_ completed - no store', { isFresh: false });
      return false;
    }
    const status = store.getProperty('STARTUP_RUN_STATUS');
    const ts = parseInt(store.getProperty('STARTUP_RUN_TS') || '0', 10) || 0;
    const isFresh = status === 'ok' && ts && (now - ts) < STARTUP_FRESHNESS_MS;
    trace.complete('isOverallStartupFresh_ completed', { isFresh: isFresh, status: status });
    return isFresh;
  } catch (error) {
    trace.fail('isOverallStartupFresh_ failed', error);
    throw error;
  }
}

function markOverallStartup_(status, timestamp, props) {
  const trace = UnifiedLogger.startTrace('Menu', 'markOverallStartup_');
  try {
    const store = props || getStartupProps_();
    if (!store) {
      trace.complete('markOverallStartup_ completed - no store', { hasStore: false });
      return;
    }
    const ts = timestamp || new Date().getTime();
    store.setProperty('STARTUP_RUN_STATUS', status);
    store.setProperty('STARTUP_RUN_TS', String(ts));
    trace.complete('markOverallStartup_ completed', { status: status, timestamp: ts });
  } catch (error) {
    trace.fail('markOverallStartup_ failed', error);
    throw error;
  }
}

function setNextStage_(stage, props) {
  const trace = UnifiedLogger.startTrace('Menu', 'setNextStage_');
  try {
    const store = props || getStartupProps_();
    if (!store) {
      trace.complete('setNextStage_ completed - no store', { hasStore: false });
      return;
    }
    if (stage === null || stage === undefined) {
      store.deleteProperty('STARTUP_NEXT_STAGE');
      trace.complete('setNextStage_ completed - deleted', { stage: stage });
      return;
    }
    store.setProperty('STARTUP_NEXT_STAGE', String(stage));
    trace.complete('setNextStage_ completed', { stage: stage });
  } catch (error) {
    trace.fail('setNextStage_ failed', error);
    throw error;
  }
}

function getStageBudgetMs_(stage) {
  const trace = UnifiedLogger.startTrace('Menu', 'getStageBudgetMs_');
  try {
    const budget = STAGE_BUDGET_MS[stage] || 15000;
    trace.complete('getStageBudgetMs_ completed', { stage: stage, budget: budget });
    return budget;
  } catch (error) {
    trace.fail('getStageBudgetMs_ failed', error);
    throw error;
  }
}

function isStageRetryLocked_(stage, now, props) {
  const trace = UnifiedLogger.startTrace('Menu', 'isStageRetryLocked_');
  try {
    const state = getStageState_(stage, props);
    const isLocked = state.retryLock && now < state.retryLock;
    trace.complete('isStageRetryLocked_ completed', { stage: stage, isLocked: isLocked });
    return isLocked;
  } catch (error) {
    trace.fail('isStageRetryLocked_ failed', error);
    throw error;
  }
}

function setStageRetryLock_(stage, now, props) {
  const trace = UnifiedLogger.startTrace('Menu', 'setStageRetryLock_');
  try {
    const state = getStageState_(stage, props);
    const count = Math.max(0, state.retryCount || 0);
    const delay = Math.min(30 * 60 * 1000, Math.pow(2, count) * 30000);
    const lockUntil = now + delay;
    setStageState_(stage, { retryCount: count + 1, retryLock: lockUntil }, props);
    trace.complete('setStageRetryLock_ completed', { stage: stage, lockUntil: lockUntil, retryCount: count + 1 });
    return lockUntil;
  } catch (error) {
    trace.fail('setStageRetryLock_ failed', error);
    throw error;
  }
}

function enqueueOnOpenAsync_(event) {
  const trace = UnifiedLogger.startTrace('Menu', 'enqueueOnOpenAsync_');
  try {
    const props = getStartupProps_();
    const flagKey = 'ONOPEN_ASYNC_SCHEDULED';
    const lockKey = 'ONOPEN_ASYNC_LOCK';
    const now = new Date().getTime();
    const lockUntil = parseInt(getScriptProperty(lockKey) || '0', 10);
    if (lockUntil && now < lockUntil) {
      trace.complete('enqueueOnOpenAsync_ skipped - locked', { lockUntil: lockUntil });
      return;
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(50)) {
      trace.complete('enqueueOnOpenAsync_ skipped - lock acquisition failed', { lockAttempted: true });
      return;
    }
    try {
      const lastRunTs = parseInt(getScriptProperty('STARTUP_RUN_TS') || '0', 10);
      const lastStatus = getScriptProperty('STARTUP_RUN_STATUS') || '';
      const throttleMs = 5 * 60 * 1000;
      if (lastRunTs && now - lastRunTs < throttleMs && lastStatus === 'ok') {
        trace.complete('enqueueOnOpenAsync_ skipped - throttled', { lastRunTs: lastRunTs, lastStatus: lastStatus });
        return;
      }
      if (getScriptProperty(flagKey) === 'true' && lockUntil && now < lockUntil) {
        trace.complete('enqueueOnOpenAsync_ skipped - already scheduled', { flagKey: flagKey });
        return;
      }
      if (props) {
        props.setProperty(lockKey, String(now + 60 * 1000));
        props.setProperty(flagKey, 'true');
      }
      runOnOpenAsync(event, { triggersAllowed: false });
      trace.complete('enqueueOnOpenAsync_ completed', { hasEvent: !!event });
    } finally {
      try { lock.releaseLock(); } catch (ignore) {
        trace.fail('Lock release failed', ignore);
      }
    }
  } catch (error) {
    trace.fail('enqueueOnOpenAsync_ failed', error);
    const detail = {
      message: error && error.message ? '' + error.message : '' + error,
      stack: error && error.stack ? String(error.stack) : null
    };
    try {
      const props = getStartupProps_();
      if (props) {
        props.setProperty('ONOPEN_ASYNC_LOCK', String(new Date().getTime() + 5 * 60 * 1000));
        props.setProperty('ONOPEN_ASYNC_LAST_ERROR', detail.message || 'unknown');
      }
    } catch (ignore) {
      // Silent fail
    }
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'enqueueOnOpenAsync_ failed', detail);
    const userError = createUserFriendlyError(error, {
      operation: 'Queueing startup tasks',
      correlationId: trace.correlationId
    });
    showErrorToast('Startup Queue Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function runOnOpenAsync(event, options) {
  const trace = UnifiedLogger.startTrace('Menu', 'runOnOpenAsync');
  try {
    const props = getStartupProps_();
    const now = new Date().getTime();
    if (props) {
      props.deleteProperty('ONOPEN_ASYNC_SCHEDULED');
      props.deleteProperty('ONOPEN_ASYNC_LOCK');
    }
    markOnOpenHeartbeat_();
    logHeadlessContextIfNeeded_();
    const stage0 = runStartupStage0_({ source: 'onOpen' });
    const stage1 = runStartupStage1_({ source: 'onOpen', budgetMs: getStageBudgetMs_(1) });
    const freshnessOk = isOverallStartupFresh_(props, now);
    let nextStage = computeNextStageFromProps_(props);
    if (freshnessOk && nextStage === null) {
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'runOnOpenAsync skipped deferred: fresh', { stage0: stage0.status, stage1: stage1.status });
      trace.complete('runOnOpenAsync skipped - fresh', { stage0: stage0.status, stage1: stage1.status });
      return;
    }
    if (nextStage === null) {
      nextStage = 2;
    }
    setNextStage_(nextStage, props);
    markOverallStartup_('pending', now, props);
    enqueueDeferredStartup_();
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'runOnOpenAsync queued deferred startup', {
      trigger: true,
      nextStage: nextStage,
      stage0: stage0.status,
      stage1: stage1.status,
      user: Session.getActiveUser && Session.getActiveUser().getEmail ? Session.getActiveUser().getEmail() : 'unknown'
    });
    trace.complete('runOnOpenAsync completed', { nextStage: nextStage, stage0: stage0.status, stage1: stage1.status });
  } catch (error) {
    trace.fail('runOnOpenAsync failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runOnOpenAsync failed', String(error));
    const userError = createUserFriendlyError(error, {
      operation: 'Running startup tasks',
      correlationId: trace.correlationId
    });
    showErrorToast('Startup Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function runStartupStage0_(context) {
  const trace = UnifiedLogger.startTrace('Menu', 'runStartupStage0_');
  try {
    const now = new Date().getTime();
    const props = getStartupProps_();
    const payload = { stage: 0, source: context && context.source ? context.source : 'unknown' };
    try {
      ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
      const spreadsheet = getActiveSpreadsheetSafe_();
      if (!spreadsheet) {
        setStageState_(0, { status: 'error', ts: now, lastError: 'no-active-spreadsheet' }, props);
        setNextStage_(1, props);
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage0 failed: no active spreadsheet', payload);
        trace.complete('runStartupStage0_ completed - no spreadsheet', { status: 'error' });
        return { status: 'error', reason: 'no-spreadsheet' };
      }
      setStageState_(0, { status: 'ok', ts: now, lastError: null }, props);
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage0 ok: scopes and spreadsheet present', payload);
      trace.complete('runStartupStage0_ completed', { status: 'ok' });
      return { status: 'ok', reason: 'ready' };
    } catch (error) {
      trace.fail('runStartupStage0_ scopes failed', error);
      setStageState_(0, { status: 'error', ts: now, lastError: String(error) }, props);
      setNextStage_(1, props);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage0 failed: scopes', { error: String(error), source: payload.source });
      const userError = createUserFriendlyError(error, {
        operation: 'Initializing spreadsheet',
        correlationId: trace.correlationId
      });
      showErrorToast('Initialization Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
      return { status: 'error', reason: 'scope', error: String(error) };
    }
  } catch (error) {
    trace.fail('runStartupStage0_ failed', error);
    throw error;
  }
}

function runStartupStage1_(context) {
  const trace = UnifiedLogger.startTrace('Menu', 'runStartupStage1_');
  try {
    const props = getStartupProps_();
    const budgetMs = context && context.budgetMs ? context.budgetMs : getStageBudgetMs_(1);
    const now = new Date().getTime();
    const start = now;
    setStageState_(1, { inProgressTs: now }, props);
    try {
      if (typeof ensureCoreSheetsAndHeaders === 'function') {
        ensureCoreSheetsAndHeaders();
      }
      if (typeof checkConfigSheets_ === 'function') {
        checkConfigSheets_();
      }
      if (typeof ensureDynamicConfigHealthOnOpen_ === 'function') {
        ensureDynamicConfigHealthOnOpen_();
      }
      const elapsedMs = new Date().getTime() - start;
      const status = elapsedMs > budgetMs ? 'partial' : 'ok';
      setStageState_(1, { status: status, ts: new Date().getTime(), progress: null, lastError: null }, props);
      if (status === 'partial') {
        setNextStage_(1, props);
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage1 partial: budget hit', { elapsedMs: elapsedMs, budgetMs: budgetMs });
        trace.complete('runStartupStage1_ completed - partial', { status: 'partial', elapsedMs: elapsedMs });
        return { status: 'partial', elapsedMs: elapsedMs, reason: 'budget' };
      }
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage1 completed', { elapsedMs: elapsedMs });
      trace.complete('runStartupStage1_ completed', { status: 'ok', elapsedMs: elapsedMs });
      return { status: 'ok', elapsedMs: elapsedMs };
    } catch (error) {
      trace.fail('runStartupStage1_ failed', error);
      const nowTs = new Date().getTime();
      setStageState_(1, { status: 'error', ts: nowTs, lastError: String(error) }, props);
      setStageRetryLock_(1, nowTs, props);
      setNextStage_(1, props);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage1 failed', { error: String(error) });
      const userError = createUserFriendlyError(error, {
        operation: 'Setting up sheets',
        correlationId: trace.correlationId
      });
      showErrorToast('Setup Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
      return { status: 'error', error: String(error) };
    } finally {
      setStageState_(1, { inProgressTs: null }, props);
    }
  } catch (error) {
    trace.fail('runStartupStage1_ outer failed', error);
    throw error;
  }
}

function runBootstrapSteps_(options) {
  const trace = UnifiedLogger.startTrace('Menu', 'runBootstrapSteps_');
  try {
    const opts = options || {};
    const budgetMs = opts.budgetMs || null;
    const props = getStartupProps_();
    const start = new Date().getTime();
    const progress = (opts.progress && typeof opts.progress === 'object') ? opts.progress : parseStageProgress_(props && props.getProperty ? props.getProperty(getStagePropKey_(2, 'PROGRESS')) : null) || {};
    let stepIndex = progress.stepIndex || 0;
    const steps = [
      { key: 'normalize', fn: typeof normalizeData === 'function' ? normalizeData : null },
      { key: 'refreshLookups', fn: typeof refreshLookups === 'function' ? refreshLookups : null },
      { key: 'seedConfig', fn: typeof seedDynamicConfigFromStatic === 'function' ? seedDynamicConfigFromStatic : (typeof seedCatalogsOnly === 'function' ? seedCatalogsOnly : null) }
    ];
    const ranSteps = [];
    for (; stepIndex < steps.length; stepIndex++) {
      const now = new Date().getTime();
      if (budgetMs && now - start > budgetMs) {
        trace.complete('runBootstrapSteps_ completed - partial', { status: 'partial', stepIndex: stepIndex, ranSteps: ranSteps });
        return { status: 'partial', progress: { stepIndex: stepIndex }, ranSteps: ranSteps, elapsedMs: now - start };
      }
      const step = steps[stepIndex];
      if (step && typeof step.fn === 'function') {
        step.fn();
      }
      ranSteps.push(step.key);
    }
    const doneTs = new Date().getTime();
    if (props) {
      props.deleteProperty(getStagePropKey_(2, 'PROGRESS'));
      props.setProperty('BOOTSTRAP_DONE_TS', String(doneTs));
      props.setProperty('BOOTSTRAP_STATUS', 'ok');
      props.deleteProperty('BOOTSTRAP_LAST_ERROR');
    }
    trace.complete('runBootstrapSteps_ completed', { status: 'ok', ranSteps: ranSteps, elapsedMs: doneTs - start });
    return { status: 'ok', ranSteps: ranSteps, elapsedMs: doneTs - start };
  } catch (error) {
    trace.fail('runBootstrapSteps_ failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Running bootstrap steps',
      correlationId: trace.correlationId
    });
    showErrorToast('Bootstrap Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

function runStartupStage2_(context) {
  const trace = UnifiedLogger.startTrace('Menu', 'runStartupStage2_');
  try {
    const props = getStartupProps_();
    const now = new Date().getTime();
    const budgetMs = context && context.budgetMs ? context.budgetMs : getStageBudgetMs_(2);
    const bootstrapStatus = props ? props.getProperty('BOOTSTRAP_STATUS') : null;
    const bootstrapDone = parseInt(getScriptProperty('BOOTSTRAP_DONE_TS') || '0', 10);
    const bootstrapFresh = bootstrapStatus === 'ok' && bootstrapDone && (now - bootstrapDone) < BOOTSTRAP_FRESHNESS_MS;
    if (bootstrapFresh) {
      setStageState_(2, { status: 'ok', ts: now, progress: null, lastError: null }, props);
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage2 skipped: fresh bootstrap', { doneTs: bootstrapDone });
      trace.complete('runStartupStage2_ skipped - fresh', { status: 'ok', bootstrapDone: bootstrapDone });
      return { status: 'ok', reason: 'fresh' };
    }
    setStageState_(2, { inProgressTs: now }, props);
    try {
      const progress = parseStageProgress_(props ? props.getProperty(getStagePropKey_(2, 'PROGRESS')) : null) || {};
      const result = runBootstrapSteps_({ budgetMs: budgetMs, progress: progress });
      if (result.status === 'partial') {
        setStageState_(2, { status: 'partial', ts: new Date().getTime(), progress: result.progress, lastError: null }, props);
        setNextStage_(2, props);
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage2 partial', { progress: result.progress, elapsedMs: result.elapsedMs, budgetMs: budgetMs });
        trace.complete('runStartupStage2_ completed - partial', { status: 'partial', elapsedMs: result.elapsedMs });
        return { status: 'partial', progress: result.progress, elapsedMs: result.elapsedMs };
      }
      setStageState_(2, { status: 'ok', ts: new Date().getTime(), progress: null, lastError: null }, props);
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage2 completed', { ranSteps: result.ranSteps, elapsedMs: result.elapsedMs });
      trace.complete('runStartupStage2_ completed', { status: 'ok', elapsedMs: result.elapsedMs });
      return { status: 'ok', elapsedMs: result.elapsedMs };
    } catch (error) {
      trace.fail('runStartupStage2_ failed', error);
      const nowTs = new Date().getTime();
      setStageState_(2, { status: 'error', ts: nowTs, lastError: String(error) }, props);
      props && props.setProperty('BOOTSTRAP_STATUS', 'error');
      props && props.setProperty('BOOTSTRAP_LAST_ERROR', String(error));
      setStageRetryLock_(2, nowTs, props);
      setNextStage_(2, props);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage2 failed', { error: String(error) });
      const userError = createUserFriendlyError(error, {
        operation: 'Bootstrapping data',
        correlationId: trace.correlationId
      });
      showErrorToast('Bootstrap Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
      return { status: 'error', error: String(error) };
    } finally {
      setStageState_(2, { inProgressTs: null }, props);
    }
  } catch (error) {
    trace.fail('runStartupStage2_ outer failed', error);
    throw error;
  }
}

function runStartupStage3_(context) {
  const trace = UnifiedLogger.startTrace('Menu', 'runStartupStage3_');
  try {
    const props = getStartupProps_();
    const now = new Date().getTime();
    const budgetMs = context && context.budgetMs ? context.budgetMs : getStageBudgetMs_(3);
    const start = now;
    setStageState_(3, { inProgressTs: now }, props);
    try {
      ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
        'https://www.googleapis.com/auth/script.scriptapp',
        'https://www.googleapis.com/auth/spreadsheets'
      ]);
      const result = ensureCoreTriggersHealthy_({ allowCreate: true });
      const elapsedMs = new Date().getTime() - start;
      const status = elapsedMs > budgetMs ? 'partial' : 'ok';
      setStageState_(3, { status: status, ts: new Date().getTime(), progress: null, lastError: null }, props);
      if (status === 'partial') {
        setNextStage_(3, props);
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage3 partial: budget hit', { elapsedMs: elapsedMs, budgetMs: budgetMs });
        trace.complete('runStartupStage3_ completed - partial', { status: 'partial', elapsedMs: elapsedMs });
        return { status: 'partial', elapsedMs: elapsedMs, detail: result };
      }
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage3 completed', { elapsedMs: elapsedMs, detail: result });
      trace.complete('runStartupStage3_ completed', { status: 'ok', elapsedMs: elapsedMs });
      return { status: 'ok', elapsedMs: elapsedMs, detail: result };
    } catch (error) {
      trace.fail('runStartupStage3_ failed', error);
      const nowTs = new Date().getTime();
      setStageState_(3, { status: 'error', ts: nowTs, lastError: String(error) }, props);
      setStageRetryLock_(3, nowTs, props);
      setNextStage_(3, props);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage3 failed', { error: String(error) });
      const userError = createUserFriendlyError(error, {
        operation: 'Setting up triggers',
        correlationId: trace.correlationId
      });
      showErrorToast('Trigger Setup Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
      return { status: 'error', error: String(error) };
    } finally {
      setStageState_(3, { inProgressTs: null }, props);
    }
  } catch (error) {
    trace.fail('runStartupStage3_ outer failed', error);
    throw error;
  }
}

function runStartupStage4_(context) {
  const trace = UnifiedLogger.startTrace('Menu', 'runStartupStage4_');
  try {
    const props = getStartupProps_();
    const now = new Date().getTime();
    const budgetMs = context && context.budgetMs ? context.budgetMs : getStageBudgetMs_(4);
    const start = now;
    setStageState_(4, { inProgressTs: now }, props);
    try {
      const lastAudit = props ? parseInt(props.getProperty('LAST_READINESS_AUDIT_TS') || '0', 10) : 0;
      const readinessPending = props ? props.getProperty('READINESS_AUDIT_PENDING') === 'true' : false;
      const shouldSchedule = !lastAudit || (now - lastAudit) > STARTUP_FRESHNESS_MS || readinessPending;
      if (shouldSchedule && typeof scheduleReadinessAuditRetry_ === 'function') {
        scheduleReadinessAuditRetry_();
      }
      const elapsedMs = new Date().getTime() - start;
      const status = elapsedMs > budgetMs ? 'partial' : 'ok';
      setStageState_(4, { status: status, ts: new Date().getTime(), progress: null, lastError: null }, props);
      if (status === 'partial') {
        setNextStage_(4, props);
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage4 partial: budget hit', { elapsedMs: elapsedMs, budgetMs: budgetMs });
        trace.complete('runStartupStage4_ completed - partial', { status: 'partial', elapsedMs: elapsedMs });
        return { status: 'partial', elapsedMs: elapsedMs };
      }
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage4 completed', { elapsedMs: elapsedMs, scheduled: shouldSchedule });
      trace.complete('runStartupStage4_ completed', { status: 'ok', elapsedMs: elapsedMs, scheduled: shouldSchedule });
      return { status: 'ok', elapsedMs: elapsedMs, scheduled: shouldSchedule };
    } catch (error) {
      trace.fail('runStartupStage4_ failed', error);
      const nowTs = new Date().getTime();
      setStageState_(4, { status: 'error', ts: nowTs, lastError: String(error) }, props);
      setStageRetryLock_(4, nowTs, props);
      setNextStage_(4, props);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage4 failed', { error: String(error) });
      const userError = createUserFriendlyError(error, {
        operation: 'Scheduling readiness audit',
        correlationId: trace.correlationId
      });
      showErrorToast('Audit Schedule Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
      return { status: 'error', error: String(error) };
    } finally {
      setStageState_(4, { inProgressTs: null }, props);
    }
  } catch (error) {
    trace.fail('runStartupStage4_ outer failed', error);
    throw error;
  }
}

function runStartupStage5_(context) {
  const trace = UnifiedLogger.startTrace('Menu', 'runStartupStage5_');
  try {
    const props = getStartupProps_();
    const now = new Date().getTime();
    const budgetMs = context && context.budgetMs ? context.budgetMs : getStageBudgetMs_(5);
    const start = now;
    setStageState_(5, { inProgressTs: now }, props);
    try {
      const fresh = isOverallStartupFresh_(props, now) && getStageState_(5, props).ts && (now - getStageState_(5, props).ts) < STARTUP_FRESHNESS_MS;
      if (fresh) {
        setStageState_(5, { status: 'ok', ts: now, progress: null, lastError: null }, props);
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage5 skipped: fresh', { ts: getStageState_(5, props).ts });
        trace.complete('runStartupStage5_ skipped - fresh', { status: 'ok' });
        return { status: 'ok', reason: 'fresh' };
      }
      const health = (typeof checkIntegrationsHealth === 'function')
        ? checkIntegrationsHealth({ lightweight: true, silent: true, source: context && context.source ? context.source : 'deferred-startup' })
        : null;
      const elapsedMs = new Date().getTime() - start;
      const status = elapsedMs > budgetMs ? 'partial' : 'ok';
      setStageState_(5, { status: status, ts: new Date().getTime(), progress: null, lastError: null }, props);
      if (status === 'partial') {
        setNextStage_(5, props);
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage5 partial: budget hit', { elapsedMs: elapsedMs, budgetMs: budgetMs });
        trace.complete('runStartupStage5_ completed - partial', { status: 'partial', elapsedMs: elapsedMs });
        return { status: 'partial', elapsedMs: elapsedMs };
      }
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Stage5 completed', { elapsedMs: elapsedMs, health: health });
      trace.complete('runStartupStage5_ completed', { status: 'ok', elapsedMs: elapsedMs });
      return { status: 'ok', elapsedMs: elapsedMs, health: health };
    } catch (error) {
      trace.fail('runStartupStage5_ failed', error);
      const nowTs = new Date().getTime();
      setStageState_(5, { status: 'error', ts: nowTs, lastError: String(error) }, props);
      setStageRetryLock_(5, nowTs, props);
      setNextStage_(5, props);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Stage5 failed', { error: String(error) });
      const userError = createUserFriendlyError(error, {
        operation: 'Checking integrations health',
        correlationId: trace.correlationId
      });
      showErrorToast('Health Check Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
      return { status: 'error', error: String(error) };
    } finally {
      setStageState_(5, { inProgressTs: null }, props);
    }
  } catch (error) {
    trace.fail('runStartupStage5_ outer failed', error);
    throw error;
  }
}

function runBootstrapNow_() {
  const trace = UnifiedLogger.startTrace('Menu', 'runBootstrapNow_');
  try {
    const props = getStartupProps_();
    const now = new Date().getTime();
    const bootstrapStatus = props ? props.getProperty('BOOTSTRAP_STATUS') : null;
    const bootstrapDone = parseInt(getScriptProperty('BOOTSTRAP_DONE_TS') || '0', 10);
    const bootstrapFresh = bootstrapStatus === 'ok' && bootstrapDone && (now - bootstrapDone) < BOOTSTRAP_FRESHNESS_MS;
    if (bootstrapFresh) {
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'runBootstrapNow_ skipped: fresh', { status: bootstrapStatus, doneTs: bootstrapDone });
      trace.complete('runBootstrapNow_ skipped - fresh', { status: bootstrapStatus, bootstrapDone: bootstrapDone });
      return;
    }
    try {
      const result = runBootstrapSteps_({ budgetMs: null });
      const status = result.status || 'ok';
      if (props) {
        props.setProperty('BOOTSTRAP_DONE_TS', String(new Date().getTime()));
        props.setProperty('BOOTSTRAP_STATUS', status);
        if (status === 'ok') {
          props.deleteProperty('BOOTSTRAP_LAST_ERROR');
        }
      }
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'runBootstrapNow_ completed', { status: status, ranSteps: result.ranSteps, elapsedMs: result.elapsedMs });
      trace.complete('runBootstrapNow_ completed', { status: status, elapsedMs: result.elapsedMs });
    } catch (error) {
      trace.fail('runBootstrapNow_ failed', error);
      if (props) {
        props.setProperty('BOOTSTRAP_STATUS', 'error');
        props.setProperty('BOOTSTRAP_LAST_ERROR', String(error));
      }
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runBootstrapNow_ failed', String(error));
      const userError = createUserFriendlyError(error, {
        operation: 'Running bootstrap',
        correlationId: trace.correlationId
      });
      showErrorToast('Bootstrap Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
    }
  } catch (error) {
    trace.fail('runBootstrapNow_ outer failed', error);
    throw error;
  }
}

function ensureCatalogSeeded_() {
  const trace = UnifiedLogger.startTrace('Menu', 'ensureCatalogSeeded_');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      trace.complete('ensureCatalogSeeded_ skipped - no spreadsheet');
      return;
    }
    const xeroReady = ss.getSheetByName(SHEET_NAMES && SHEET_NAMES.XERO_READY ? SHEET_NAMES.XERO_READY : 'XERO_READY');
    const xeroReadyRows = xeroReady ? Math.max(0, xeroReady.getLastRow() - 1) : 0;
    if (xeroReadyRows === 0) {
      logToast_('Catalog Seed', 'Skipped: XERO_READY empty. Normalize before seeding catalogs.', 8, 'WARN');
      trace.complete('ensureCatalogSeeded_ skipped - XERO_READY empty');
      return;
    }
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger.checkHealth === 'function') {
      const health = UnifiedLogger.checkHealth({ source: 'catalogSeedGuard', probe: false });
      if (!health.sheetFound || (health.disabledUntil && new Date().getTime() < health.disabledUntil)) {
        logToast_('Catalog Seed', 'Deferred: logging degraded, retry after Verify Logging.', 6, 'WARN');
        trace.complete('ensureCatalogSeeded_ deferred - logging degraded');
        return;
      }
    }
    const resourceSheet = ss.getSheetByName('Config: Resource Catalog');
    const scopeSheet = ss.getSheetByName('Config: Scope Catalog');
    const needsResourceSeed = !resourceSheet || resourceSheet.getLastRow() < 2;
    const needsScopeSeed = !scopeSheet || scopeSheet.getLastRow() < 2;
    if (!(needsResourceSeed || needsScopeSeed)) {
      trace.complete('ensureCatalogSeeded_ skipped - catalogs already seeded');
      return;
    }
    const now = new Date().getTime();
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    const lastNormalize = parseInt(getScriptProperty('LAST_NORMALIZE_TS') || '0', 10);
    const lastLookup = parseInt(getScriptProperty('LAST_LOOKUP_REFRESH_TS') || '0', 10);
    const normalizeFresh = lastNormalize && (now - lastNormalize) <= 30 * 60 * 1000;
    const lookupFresh = lastLookup && (now - lastLookup) <= 30 * 60 * 1000;
    if (!normalizeFresh || !lookupFresh) {
      logToast_('Catalog Seed', 'Deferred: normalize/lookups stale. Refresh before seeding catalogs.', 8, 'WARN');
      trace.complete('ensureCatalogSeeded_ deferred - data stale');
      return;
    }
    if (typeof seedCatalogsOnly === 'function') {
      seedCatalogsOnly();
    }
    trace.complete('ensureCatalogSeeded_ completed');
  } catch (error) {
    trace.fail('ensureCatalogSeeded_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'ensureCatalogSeeded_ failed', String(error));
  }
}

/**
 * Rebuild every custom menu, ensuring each section fails independently so
 * regressions in one area do not block the others.
 * @param {GoogleAppsScript.Events.SheetsOnOpen|undefined} event
 */
function rebuildMenus(event) {
  let trace = null;
  if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger.startTrace) {
    trace = UnifiedLogger.startTrace('Menu', 'rebuildMenus');
  }

  try {
    const ui = SpreadsheetApp.getUi();
    buildProductionMenu_(ui);
    buildAdvancedMenu_(ui);
    if (trace) trace.complete('rebuildMenus completed');
  } catch (error) {
    if (trace) trace.fail('rebuildMenus failed', error);
    console.error('[Menu] rebuildMenus failed:', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'rebuildMenus skipped: UI not available', String(error));

    try {
      if (typeof createUserFriendlyError === 'function' && typeof showErrorToast === 'function') {
        const userError = createUserFriendlyError(error, {
          operation: 'Rebuilding menus',
          correlationId: trace ? trace.correlationId : 'unknown'
        });
        showErrorToast('Menu Error', userError.message, null, {
          correlationId: trace ? trace.correlationId : 'unknown',
          error: error
        });
      }
    } catch (e) {
      console.error('[Menu] Failed to show error toast:', e);
    }
  }
}

/**
 * Installable trigger hook to guarantee menus rebuild after other handlers run.
 * @param {GoogleAppsScript.Events.SheetsOnOpen|undefined} event
 */
function rebuildMenusInstallable(event) {
  const trace = UnifiedLogger.startTrace('Menu', 'rebuildMenusInstallable');
  try {
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'rebuildMenusInstallable invoked');
    rebuildMenus(event);
    trace.complete('rebuildMenusInstallable completed');
  } catch (error) {
    trace.fail('rebuildMenusInstallable failed', error);
    throw error;
  }
}

/**
 * Build production menu - essential workflow items only
 */
function buildProductionMenu_(ui) {
  let trace = null;
  if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger.startTrace) {
    trace = UnifiedLogger.startTrace('Menu', 'buildProductionMenu_');
  }

  try {
    const menu = ui.createMenu('Fresh CP');

    // Xero Integration (authorization first, then sync)
    if (typeof authorizeXero === 'function') {
      menu.addItem('🔐 Authorize Xero', 'authorizeXero');
    }
    if (typeof syncToXeroManual === 'function') {
      menu.addItem('⚡ Sync Inventory to Xero', 'syncToXeroManual');
    }
    if (typeof dryRunSync === 'function') {
      menu.addItem('👁️ Dry Run Sync', 'dryRunSync');
    }

    menu.addSeparator();

    // AI Quote Builder
    if (typeof showAIQuoteBuilder === 'function') {
      menu.addItem('🚀 AI Quote Builder', 'showAIQuoteBuilder');
    }

    menu.addSeparator();

    // Core Operations
    if (typeof refreshConfigMenu === 'function') {
      menu.addItem('Refresh Config', 'refreshConfigMenu');
    }
    menu.addItem('View Logs', 'openLogSheet');
    menu.addItem('System Health', 'viewSystemHealth');

    menu.addToUi();
    if (trace) trace.complete('buildProductionMenu_ completed');
  } catch (error) {
    if (trace) trace.fail('buildProductionMenu_ failed', error);
    console.error('[Menu] buildProductionMenu_ failed:', error);
    throw error;
  }
}

/**
 * Launch the AI Quote Builder sidebar.
 */
function showAIQuoteBuilder() {
  // Run deferred initialization on first menu action
  deferredInitialization();

  const trace = UnifiedLogger.startTrace('Menu', 'showAIQuoteBuilder');
  try {
    const html = HtmlService.createHtmlOutputFromFile('ui/ai_quote_sidebar')
      .setTitle('AI Quote Builder')
      .setWidth(420)
      .setHeight(640);
    SpreadsheetApp.getUi().showSidebar(html);
    trace.complete('showAIQuoteBuilder completed');
  } catch (error) {
    trace.fail('showAIQuoteBuilder failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Launching AI Quote Builder',
      correlationId: trace.correlationId
    });
    showErrorToast('AI Quote Builder Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Build advanced menu - admin and diagnostic tools
 */
function buildAdvancedMenu_(ui) {
  let trace = null;
  if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger.startTrace) {
    trace = UnifiedLogger.startTrace('Menu', 'buildAdvancedMenu_');
  }

  try {
    ui.createMenu('🔧 Advanced')
      // Data Operations
      .addItem('📥 Sync Scopes to Vector Store', 'syncScopeBuildupsToVectorStoreMenu')
      .addItem('🩺 Check Integrations Health', 'checkIntegrationsHealthMenu')
      .addSeparator()
      // Properties Management
      .addItem('🧾 Show Script Properties', 'showScriptPropertiesMenu')
      .addItem('✍️ Set Script Property', 'setScriptPropertyFromPrompt')
      .addSeparator()
      // Logging & Diagnostics
      .addItem('🔍 Search Logs', 'searchLogsMenu')
      .addItem('📊 Error Summary', 'showErrorSummaryMenu')
      .addToUi();
    if (trace) trace.complete('buildAdvancedMenu_ completed');
  } catch (error) {
    if (trace) trace.fail('buildAdvancedMenu_ failed', error);
    console.error('[Menu] buildAdvancedMenu_ failed:', error);
    throw error;
  }
}

function setScriptPropertyFromPrompt() {
  const trace = UnifiedLogger.startTrace('Menu', 'setScriptPropertyFromPrompt');
  try {
    const ui = SpreadsheetApp.getUi();
    const keyResponse = ui.prompt(
      'Set Script Property',
      'Enter the property name (e.g., SOURCE_DATA_FOLDER_ID).',
      ui.ButtonSet.OK_CANCEL
    );
    if (keyResponse.getSelectedButton() !== ui.Button.OK) {
      trace.complete('setScriptPropertyFromPrompt cancelled');
      return;
    }
    const key = String(keyResponse.getResponseText() || '').trim();
    if (!key) {
      ui.alert('Set Script Property', 'Property name is required.', ui.ButtonSet.OK);
      trace.complete('setScriptPropertyFromPrompt missing key');
      return;
    }
    const valueResponse = ui.prompt(
      'Set Script Property',
      'Enter the value for ' + key + '.',
      ui.ButtonSet.OK_CANCEL
    );
    if (valueResponse.getSelectedButton() !== ui.Button.OK) {
      trace.complete('setScriptPropertyFromPrompt cancelled');
      return;
    }
    const value = String(valueResponse.getResponseText() || '').trim();
    if (!value) {
      ui.alert('Set Script Property', 'Property value is required.', ui.ButtonSet.OK);
      trace.complete('setScriptPropertyFromPrompt missing value');
      return;
    }
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      ui.alert('Set Script Property', 'Script Properties unavailable.', ui.ButtonSet.OK);
      trace.complete('setScriptPropertyFromPrompt missing props');
      return;
    }
    props.setProperty(key, value);
    trace.complete('setScriptPropertyFromPrompt completed', { key: key });
    ui.alert('Set Script Property', 'Saved: ' + key, ui.ButtonSet.OK);
  } catch (error) {
    trace.fail('setScriptPropertyFromPrompt failed', error);
    try { SpreadsheetApp.getUi().alert('Set Script Property', 'Failed to save property: ' + error, SpreadsheetApp.getUi().ButtonSet.OK); } catch (ignore) {
      // Silent fail
    }
  }
}

function repairTriggersMenu() {
  // Run deferred initialization on first menu action
  deferredInitialization();

  const trace = UnifiedLogger.startTrace('Menu', 'repairTriggersMenu');
  try {
    const summary = ensureCoreTriggersHealthy_({ allowCreate: true });
    const created = ['createdOnOpen', 'createdOnChange', 'createdDeferred', 'createdReadiness', 'createdPropConsent', 'createdIntegration'].filter(function(key) { return summary[key]; }).length;
    const message = [
      'onOpen=' + (summary.onOpenPresent ? 'ok' : 'missing'),
      'onChange=' + (summary.onChangePresent ? 'ok' : 'missing'),
      'deferred=' + (summary.deferredPresent ? 'ok' : 'missing'),
      'readiness=' + (summary.readinessPresent ? 'ok' : 'missing'),
      'propConsent=' + (summary.propConsentPresent ? 'ok' : 'missing'),
      'integration=' + (summary.integrationHealthPresent ? 'ok' : 'missing'),
      'created=' + created,
      summary.errors && summary.errors.length ? ('errors=' + summary.errors.length) : null
    ].filter(Boolean).join(' | ');
    const severity = summary.errors && summary.errors.length ? 'WARN' : 'INFO';
    logToast_('Trigger Repair', message, summary.errors && summary.errors.length ? 10 : 6, severity, summary);
    trace.complete('repairTriggersMenu completed', { created: created, severity: severity });
  } catch (error) {
    trace.fail('repairTriggersMenu failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'repairTriggersMenu failed', String(error));
    try { SpreadsheetApp.getUi().alert('Trigger Repair', 'Failed to repair triggers: ' + error, SpreadsheetApp.getUi().ButtonSet.OK); } catch (ignore) {
      // Silent fail
    }
    const userError = createUserFriendlyError(error, {
      operation: 'Repairing triggers',
      correlationId: trace.correlationId
    });
    showErrorToast('Trigger Repair Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function runFullReadinessAudit() {
  const trace = UnifiedLogger.startTrace('Menu', 'runFullReadinessAudit');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summary = { repairs: [], warnings: [], errors: [] };
  const usage = createReadinessUsageCounters_();
  const toastAllowed = !!ss;
  const props = getScriptProperty.props || PropertiesService.getScriptProperties();
  clearReadinessScheduleState_(props);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(200)) {
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'runFullReadinessAudit skipped: lock busy');
    scheduleReadinessAuditRetry_();
    trace.complete('runFullReadinessAudit skipped - lock busy');
    return;
  }
  try {
    const now = new Date().getTime();
    const lastAudit = parseInt(getScriptProperty('LAST_READINESS_AUDIT_TS') || '0', 10);
    if (now - lastAudit < 5 * 60 * 1000) {
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'runFullReadinessAudit skipped: recent audit', { lastAudit: lastAudit });
      trace.complete('runFullReadinessAudit skipped - recent audit', { lastAudit: lastAudit });
      return;
    }

    let heavyOpsAllowed = true;
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger.checkHealth === 'function') {
      const loggingHealth = UnifiedLogger.checkHealth({ source: 'readinessAudit', probe: false });
      if (!loggingHealth.sheetFound) {
        summary.warnings.push('Logging degraded: log sheet missing or unreadable');
        heavyOpsAllowed = false;
      }
      if (loggingHealth.disabledUntil && now < loggingHealth.disabledUntil) {
        summary.warnings.push('Logging backoff active: retry Verify Logging');
        heavyOpsAllowed = false;
      }
    }

    const integrationSnapshot = (typeof checkIntegrationsHealth === 'function')
      ? checkIntegrationsHealth({ lightweight: true, silent: true, source: 'readiness-audit' })
      : null;
    if (integrationSnapshot && integrationSnapshot.xero && integrationSnapshot.xero.backoff && integrationSnapshot.xero.backoff.active) {
      summary.warnings.push('Xero backoff active until ' + new Date(integrationSnapshot.xero.backoff.until).toLocaleTimeString());
    }

    if (typeof ensureSourceDataFromDriveIfEmpty === 'function' && heavyOpsAllowed) {
      incrementReadinessUsage_(usage, 'driveOps');
      if (ensureSourceDataFromDriveIfEmpty()) summary.repairs.push('Imported CSVs');
    }
    if (typeof ensureCoreSheetsAndHeaders === 'function') {
      incrementReadinessUsage_(usage, 'sheetOps');
      try { ensureCoreSheetsAndHeaders(); } catch (e) { summary.warnings.push('Ensure core sheets failed'); }
    }
    const dynamicEnabled = (typeof isConfigDynamicEnabled === 'function') ? isConfigDynamicEnabled() : false;
    if (dynamicEnabled) {
      incrementReadinessUsage_(usage, 'sheetOps');
    }
    repairDynamicConfigIfNeeded_();

    if (heavyOpsAllowed && typeof ensureCatalogSeeded_ === 'function') {
      incrementReadinessUsage_(usage, 'sheetOps');
      try { ensureCatalogSeeded_(); } catch (e) { summary.warnings.push('Catalog seed check failed'); }
    }

    const lastNormalize = parseInt(getScriptProperty('LAST_NORMALIZE_TS') || '0', 10);
    const needsNormalize = (now - lastNormalize > 10 * 60 * 1000);
    if (needsNormalize && typeof ensureXeroReadyPopulated === 'function' && heavyOpsAllowed) {
      incrementReadinessUsage_(usage, 'sheetOps');
      if (ensureXeroReadyPopulated()) {
        summary.repairs.push('Normalized XERO_READY');
        if (props) props.setProperty('LAST_NORMALIZE_TS', String(now));
      }
    }

    const lastLookupRefresh = parseInt(getScriptProperty('LAST_LOOKUP_REFRESH_TS') || '0', 10);
    const needsLookupRefresh = (now - lastLookupRefresh > 24 * 60 * 60 * 1000);
    if (needsLookupRefresh && typeof refreshItemLookup === 'function' && heavyOpsAllowed) {
      incrementReadinessUsage_(usage, 'sheetOps');
      try { refreshItemLookup(); summary.repairs.push('Item lookup refreshed'); } catch (e) { summary.warnings.push('Refresh Item Lookup failed'); }
      if (props) props.setProperty('LAST_LOOKUP_REFRESH_TS', String(now));
    }
    const lastQuoteFix = parseInt(getScriptProperty('LAST_QUOTE_FIX_TS') || '0', 10);
    const needsQuoteFix = (now - lastQuoteFix > 24 * 60 * 60 * 1000);
    if (needsQuoteFix) {
      if (typeof restoreQuoteBuilderIntegrity === 'function') {
        incrementReadinessUsage_(usage, 'sheetOps');
        try { restoreQuoteBuilderIntegrity(); summary.repairs.push('Quote layout restored'); } catch (e) { summary.warnings.push('Quote layout repair failed'); }
      }
      if (typeof validateQuote === 'function') {
        incrementReadinessUsage_(usage, 'sheetOps');
        try { validateQuote(); } catch (e) { summary.warnings.push('Quote validation reported issues'); }
      }
      if (props) props.setProperty('LAST_QUOTE_FIX_TS', String(now));
    }

    const lastVectorSync = parseInt(getScriptProperty('LAST_VECTOR_SYNC_TS') || '0', 10);
    const needsVectorSync = (now - lastVectorSync > 60 * 60 * 1000);
    const vectorHealth = integrationSnapshot ? integrationSnapshot.vector : null;
    const hasVectorProps = vectorHealth ? vectorHealth.ok : (getScriptProperty('OPENAI_VECTOR_STORE_ID') && getScriptProperty('OPENAI_API_KEY'));
    if (needsVectorSync && typeof syncScopeBuildupsToVectorStoreMenu === 'function' && heavyOpsAllowed) {
      if (vectorHealth && vectorHealth.sync && vectorHealth.sync.active) {
        summary.warnings.push('Vector sync skipped: backoff until ' + new Date(vectorHealth.sync.until).toLocaleTimeString());
      } else if (!hasVectorProps) {
        summary.warnings.push('Vector sync skipped: missing vector credentials');
      } else if (vectorHealth && vectorHealth.featureFlags && vectorHealth.featureFlags.disabled) {
        summary.warnings.push('Vector sync skipped: vector features disabled');
      } else if (vectorHealth && !vectorHealth.urlFetch.allowed) {
        summary.warnings.push('Vector sync skipped: ' + (vectorHealth.urlFetch.reason || 'UrlFetch blocked'));
      } else {
        incrementReadinessUsage_(usage, 'urlFetchCalls');
        try {
          syncScopeBuildupsToVectorStoreMenu();
          summary.repairs.push('Synced vector store');
          if (props) props.setProperty('LAST_VECTOR_SYNC_TS', String(now));
        } catch (e) { summary.warnings.push('Vector sync failed'); }
      }
    }

    const propsStatus = ensureRequiredScriptProperties_();
    const scopeStatus = ensureScopeConsentPreflight_({ includeToast: false });
    const missingSource = ensureSourceDataFilesPresent_();
    if (missingSource.length) {
      incrementReadinessUsage_(usage, 'driveOps');
    }
    if (propsStatus.missing.length) summary.errors.push('Missing props: ' + propsStatus.missing.join(', '));
    if (propsStatus.invalid.length) summary.errors.push('Invalid props: ' + propsStatus.invalid.join(', '));
    if (missingSource.length) summary.errors.push('Missing files: ' + missingSource.join(', '));
    if (scopeStatus.length) summary.warnings.push('Scopes: ' + scopeStatus.join(', '));
    if (toastAllowed && (summary.errors.length || summary.warnings.length || summary.repairs.length)) {
      const toast = summary.errors.length
        ? 'Readiness issues: ' + summary.errors.join(' | ')
        : 'Ready. Repairs: ' + (summary.repairs.join(', ') || 'none') + (summary.warnings.length ? ' | Warnings: ' + summary.warnings.join(', ') : '');
      logToast_('Full Readiness Audit', toast, summary.errors.length ? 8 : 5, summary.errors.length ? 'WARN' : 'INFO', summary);
    }
    if (props) {
      props.setProperty('LAST_READINESS_AUDIT_TS', String(now));
      props.deleteProperty('READINESS_RETRY_SCHEDULED');
      props.deleteProperty('READINESS_RETRY_COUNT');
      props.deleteProperty('READINESS_RETRY_LOCK');
      props.deleteProperty('READINESS_AUDIT_PENDING');
    }
    const hasUsage = (usage && ((usage.sheetOps || 0) + (usage.driveOps || 0) + (usage.urlFetchCalls || 0))) > 0;
    const hasFindings = summary.errors.length || summary.warnings.length || summary.repairs.length;
    if (hasUsage || hasFindings) {
      recordReadinessUsageMetrics_(usage, summary, now);
    }
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'runFullReadinessAudit', summary);
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger.shouldLog === 'function' && UnifiedLogger.shouldLog('VERBOSE')) {
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'runFullReadinessAudit.verbose', { summary: summary, usage: usage, propsStatus: propsStatus, scopeStatus: scopeStatus });
    }
    trace.complete('runFullReadinessAudit completed', { repairs: summary.repairs.length, warnings: summary.warnings.length, errors: summary.errors.length });
  } catch (error) {
    trace.fail('runFullReadinessAudit failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runFullReadinessAudit failed', String(error));
    if (toastAllowed) {
      logToast_('Full Readiness Audit', 'Readiness audit failed: ' + error, 8, 'WARN', { error: '' + error });
    }
    const hasUsage = (usage && ((usage.sheetOps || 0) + (usage.driveOps || 0) + (usage.urlFetchCalls || 0))) > 0;
    const hasFindings = summary.errors.length || summary.warnings.length || summary.repairs.length;
    if (hasUsage || hasFindings) {
      recordReadinessUsageMetrics_(usage, summary, new Date().getTime());
    }
  } finally {
    try { lock.releaseLock(); } catch (e) {
      // Silent fail
    }
  }
}

function createReadinessUsageCounters_() {
  const trace = UnifiedLogger.startTrace('Menu', 'createReadinessUsageCounters_');
  try {
    const counters = {
      sheetOps: 0,
      driveOps: 0,
      urlFetchCalls: 0
    };
    trace.complete('createReadinessUsageCounters_ completed');
    return counters;
  } catch (error) {
    trace.fail('createReadinessUsageCounters_ failed', error);
    throw error;
  }
}

function incrementReadinessUsage_(usage, key, amount) {
  const trace = UnifiedLogger.startTrace('Menu', 'incrementReadinessUsage_');
  try {
    if (!usage || !key) {
      trace.complete('incrementReadinessUsage_ skipped - no usage or key');
      return;
    }
    const delta = amount && !isNaN(amount) ? Number(amount) : 1;
    usage[key] = (usage[key] || 0) + delta;
    trace.complete('incrementReadinessUsage_ completed', { key: key, delta: delta });
  } catch (error) {
    trace.fail('incrementReadinessUsage_ failed', error);
    throw error;
  }
}

function recordReadinessUsageMetrics_(usage, summary, timestampMs) {
  const trace = UnifiedLogger.startTrace('Menu', 'recordReadinessUsageMetrics_');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      trace.complete('recordReadinessUsageMetrics_ skipped - no props');
      return;
    }
    const payload = {
      timestamp: new Date(timestampMs || Date.now()).toISOString(),
      sheetOps: usage && usage.sheetOps ? usage.sheetOps : 0,
      driveOps: usage && usage.driveOps ? usage.driveOps : 0,
      urlFetchCalls: usage && usage.urlFetchCalls ? usage.urlFetchCalls : 0,
      repairs: summary && summary.repairs ? summary.repairs.length : 0,
      warnings: summary && summary.warnings ? summary.warnings.length : 0,
      errors: summary && summary.errors ? summary.errors.length : 0
    };
    const payloadJson = JSON.stringify(payload);
    const validation = validatePropertySize(payloadJson, 9000);
    if (!validation.valid) {
      UnifiedLogger.warn('PropertyWrite', 'Readiness usage payload too large', {
        key: READINESS_USAGE_PROP,
        size: validation.size,
        message: validation.message
      });
      trace.fail('recordReadinessUsageMetrics_ payload too large', new Error(validation.message));
      return;
    }
    props.setProperty(READINESS_USAGE_PROP, payloadJson);
    trace.complete('recordReadinessUsageMetrics_ completed', { timestamp: payload.timestamp });
  } catch (error) {
    trace.fail('recordReadinessUsageMetrics_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'recordReadinessUsageMetrics_ failed', String(error));
  }
}

function repairDynamicConfigMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'repairDynamicConfigMenu');
  try {
    if (typeof reloadConfig === 'function') {
      reloadConfig();
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const repairs = detectDynamicConfigRepairs_(ss);
    if (repairs.length) {
      repairs.forEach(function(action) {
        try { action.fn(ss); } catch (seedError) { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'repairDynamicConfigMenu seed failed: ' + action.label, String(seedError)); }
      });
      if (typeof reloadConfig === 'function') {
        reloadConfig();
      }
    }
    const status = (typeof getConfigStatus === 'function') ? getConfigStatus() : null;
    const snapshotHint = (status && status.snapshotAgeMinutes !== null && status.snapshotAgeMinutes !== undefined)
      ? ' | snapshot age: ' + status.snapshotAgeMinutes + 'm (ttl ' + status.snapshotTtlMinutes + 'm)' + (status.snapshotFresh === false ? ' [STALE]' : '')
      : '';
    const toastText = status
      ? 'Dynamic config OK (profiles: ' + status.briefProfiles + ', phases: ' + status.scopePhaseGroups + ', prefixes: ' + status.catalogPrefixes + ')' + snapshotHint
      : 'Dynamic config status unavailable';
    logToast_('Config Repair', toastText, 5, 'INFO');
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'repairDynamicConfigMenu', { status: status, repairs: repairs.map(function(r){return r.label;}) });
    trace.complete('repairDynamicConfigMenu completed', { repairs: repairs.length });
  } catch (error) {
    trace.fail('repairDynamicConfigMenu failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'repairDynamicConfigMenu failed', String(error));
    try {
      logToast_('Config Repair', 'Repair failed: ' + error, 6, 'WARN');
    } catch (toastError) {
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'repairDynamicConfigMenu toast failed', String(toastError));
    }
    const userError = createUserFriendlyError(error, {
      operation: 'Repairing dynamic config',
      correlationId: trace.correlationId
    });
    showErrorToast('Config Repair Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

/**
 * Simple trigger fired on structural changes to keep dynamic config aligned.
 * @param {GoogleAppsScript.Events.SheetsOnChange|undefined} event
 */
function onChange(event) {
  const trace = UnifiedLogger.startTrace('Menu', 'onChange');
  try {
    repairDynamicConfigIfNeeded_(event);
    trace.complete('onChange completed');
  } catch (error) {
    trace.fail('onChange failed', error);
    throw error;
  }
}

function ensureDynamicConfigHealthOnOpen_() {
  const trace = UnifiedLogger.startTrace('Menu', 'ensureDynamicConfigHealthOnOpen_');
  if (typeof isConfigDynamicEnabled !== 'function' || !isConfigDynamicEnabled()) {
    trace.complete('ensureDynamicConfigHealthOnOpen_ skipped - dynamic config disabled');
    return;
  }
  try {
    // Don't call reloadConfig() here - cache is already fresh from onOpen
    // Clearing and rebuilding cache causes duplicate warnings and wastes time
    const status = (typeof getConfigStatus === 'function') ? getConfigStatus() : null;
    if (!status) {
      logToast_('Config Health', 'Dynamic config enabled; status unavailable', 5, 'INFO');
      trace.complete('ensureDynamicConfigHealthOnOpen_ completed - status unavailable');
      return;
    }
    const missing = [];
    if (!status.briefProfiles) missing.push('Brief Profiles');
    if (!status.scopePhaseGroups) missing.push('Scope Phases');
    if (missing.length) {
      logToast_('Config Health', 'Config tabs missing: ' + missing.join(', '), 8, 'WARN');
    } else if (status.snapshotAgeMinutes !== null && status.snapshotAgeMinutes !== undefined) {
      const snapshotMsg = 'Snapshot age: ' + status.snapshotAgeMinutes + 'm (ttl ' + status.snapshotTtlMinutes + 'm)' + (status.snapshotFresh === false ? ' [STALE]' : '');
      logToast_('Config Health', snapshotMsg, status.snapshotFresh === false ? 8 : 5, status.snapshotFresh === false ? 'WARN' : 'INFO');
    }
    trace.complete('ensureDynamicConfigHealthOnOpen_ completed', { missing: missing.length });
  } catch (error) {
    trace.fail('ensureDynamicConfigHealthOnOpen_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'ensureDynamicConfigHealthOnOpen_ failed', String(error));
  }
}

function repairDynamicConfigIfNeeded_(event) {
  const trace = UnifiedLogger.startTrace('Menu', 'repairDynamicConfigIfNeeded_');
  if (typeof isConfigDynamicEnabled !== 'function' || !isConfigDynamicEnabled()) {
    trace.complete('repairDynamicConfigIfNeeded_ skipped - dynamic config disabled');
    return;
  }
  try {
    if (typeof reloadConfig === 'function') {
      reloadConfig();
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const repairs = detectDynamicConfigRepairs_(ss);
    if (repairs.length) {
      repairs.forEach(function(action) {
        try { action.fn(ss); } catch (seedError) { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'repairDynamicConfigIfNeeded_ seed failed: ' + action.label, String(seedError)); }
      });
      if (typeof reloadConfig === 'function') {
        reloadConfig();
      }
    }
    trace.complete('repairDynamicConfigIfNeeded_ completed', { repairs: repairs.length });
  } catch (error) {
    trace.fail('repairDynamicConfigIfNeeded_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'repairDynamicConfigIfNeeded_ failed', String(error));
  }
}

function ensurePermissionPreflight_() {
  const trace = UnifiedLogger.startTrace('Menu', 'ensurePermissionPreflight_');
  try {
    const issues = [];
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    const triggers = ScriptApp.getProjectTriggers();
    const hasOnChange = triggers.some(function(trigger) {
      return trigger.getHandlerFunction && trigger.getHandlerFunction() === 'onChange';
    });
    const hasInstallableOnOpen = triggers.some(function(trigger) {
      return trigger.getHandlerFunction && trigger.getHandlerFunction() === 'rebuildMenusInstallable';
    });
    const repairFlag = getScriptProperty('CONFIG_REPAIR_TRIGGER_INSTALLED');
    const menuFlag = getScriptProperty('MENU_TRIGGER_INSTALLED');
    if (!hasOnChange || repairFlag === 'disabled') {
      issues.push('Installable onChange trigger missing (policy may block creation). Re-run onOpen with consent or create manually via ScriptApp.');
    }
    if (!hasInstallableOnOpen || menuFlag === 'disabled') {
      issues.push('Installable onOpen trigger missing (policy may block creation). Re-run onOpen with consent or create manually via ScriptApp.');
    }
    const missingScopes = ensureScopeConsentPreflight_();
    if (missingScopes.length) {
      issues.push('Consent required: ' + missingScopes.join(', '));
    }
    const configSheetStatus = checkConfigSheets_();
    if (configSheetStatus.missing && configSheetStatus.missing.length) {
      issues.push('Missing sheets: ' + configSheetStatus.missing.join(', '));
    }
    if (!isUrlFetchAllowed_()) {
      issues.push('UrlFetch blocked: vector/Xero integrations will be skipped');
    }
    if (issues.length) {
      const message = issues.join(' | ');
      logToast_('Permissions/Scopes', message, 10, 'WARN');
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Permission preflight issues', { issues: issues });
    }
    trace.complete('ensurePermissionPreflight_ completed', { issues: issues.length });
    return issues;
  } catch (error) {
    trace.fail('ensurePermissionPreflight_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'ensurePermissionPreflight_ failed', String(error));
    return ['Permission preflight failed: ' + error];
  }
}

function clearReadinessScheduleState_(props) {
  const trace = UnifiedLogger.startTrace('Menu', 'clearReadinessScheduleState_');
  try {
    const store = props || getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!store) {
      trace.complete('clearReadinessScheduleState_ skipped - no props');
      return;
    }
    ['READINESS_RETRY_SCHEDULED', 'READINESS_RETRY_COUNT', 'READINESS_RETRY_LOCK', 'READINESS_AUDIT_PENDING'].forEach(function(key) {
      store.deleteProperty(key);
    });
    trace.complete('clearReadinessScheduleState_ completed');
  } catch (error) {
    trace.fail('clearReadinessScheduleState_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'clearReadinessScheduleState_ failed', String(error));
  }
}

function ensurePermissionPreflightForTest() {
  const trace = UnifiedLogger.startTrace('Menu', 'ensurePermissionPreflightForTest');
  try {
    const triggerStatus = ensureCoreTriggersHealthy_({ allowCreate: false });
    const missingScopes = ensureScopeConsentPreflight_({ force: true, includeToast: false });
    const result = {
      missingScopes: missingScopes,
      onChangeMissing: !triggerStatus.onChangePresent,
      onOpenMissing: !triggerStatus.onOpenPresent,
      repairFlag: triggerStatus.onChangePresent ? 'true' : 'missing',
      menuFlag: triggerStatus.onOpenPresent ? 'true' : 'missing'
    };
    trace.complete('ensurePermissionPreflightForTest completed', result);
    return result;
  } catch (error) {
    trace.fail('ensurePermissionPreflightForTest failed', error);
    throw error;
  }
}

function verifyLogging(options) {
  const trace = UnifiedLogger.startTrace('Menu', 'verifyLogging');
  try {
    const opts = options || {};
    const summary = {
      level: 'default',
      sampleRate: 'default',
      disabledUntil: 0,
      sheetId: null,
      sheetFound: false,
      appendOk: false,
      created: false,
      backoffAttempts: 0,
      errors: []
    };

    try {
      summary.level = getScriptProperty('UNIFIED_LOG_LEVEL') || 'default';
      summary.sampleRate = getScriptProperty('UNIFIED_LOG_SAMPLE_RATE') || 'default';
      summary.disabledUntil = parseInt(getScriptProperty('UNIFIED_LOG_DISABLED_UNTIL') || '0', 10) || 0;
      summary.sheetId = getScriptProperty('UNIFIED_LOG_SHEET_ID') || getScriptProperty('UNIFIED_LOG_SPREADSHEET_ID') || null;
      summary.backoffAttempts = parseInt(getScriptProperty('UNIFIED_LOG_BACKOFF_ATTEMPTS') || '0', 10) || 0;
    } catch (error) {
      summary.errors.push('Props read failed');
    }

  try {
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger.checkHealth === 'function') {
      const health = UnifiedLogger.checkHealth({ source: 'verifyLogging', probe: true });
      summary.level = health.level || summary.level;
      summary.sampleRate = health.sampleRate || summary.sampleRate;
      summary.disabledUntil = health.disabledUntil || summary.disabledUntil;
      summary.sheetId = health.sheetId || summary.sheetId;
      summary.sheetFound = !!health.sheetFound;
      summary.appendOk = !!health.appendOk;
      summary.created = !!health.created;
      summary.backoffAttempts = health.backoffAttempts || summary.backoffAttempts;
      if (health.errors && health.errors.length) {
        summary.errors = summary.errors.concat(health.errors);
      }
      if (!summary.sheetFound) {
        summary.errors.push('Log sheet missing');
      }
    } else {
      summary.errors.push('UnifiedLogger unavailable');
    }
  } catch (error) {
    summary.errors.push('Health check failed: ' + error);
  }

  try {
    if (!summary.sheetId) {
      const ss = getActiveSpreadsheetSafe_();
      if (ss) {
        const props = getScriptProperty.props || PropertiesService.getScriptProperties();
        if (props) {
          props.setProperty('UNIFIED_LOG_SHEET_ID', ss.getId());
          summary.sheetId = ss.getId();
        }
      }
    }
  } catch (ignore) {
      // Silent fail
    }

  if (opts.includeBackoff && summary.disabledUntil && new Date().getTime() < summary.disabledUntil) {
    summary.errors.push('Logging backoff active');
  }

  const parts = [];
  parts.push('Level=' + summary.level);
  parts.push('Sample=' + summary.sampleRate);
  if (summary.disabledUntil) {
    parts.push('Backoff until ' + new Date(summary.disabledUntil).toISOString());
  }
  if (summary.backoffAttempts) {
    parts.push('Backoff attempts=' + summary.backoffAttempts);
  }
  parts.push(summary.sheetFound ? 'Log sheet OK' : 'Log sheet missing');
  parts.push(summary.appendOk ? 'Append OK' : 'Append skipped/fail');
  if (summary.created) {
    parts.push('Recreated log sheet');
  }
  if (summary.errors.length) {
    parts.push('Errors: ' + summary.errors.join('; '));
  }

    const severity = summary.errors.length ? 'WARN' : (summary.appendOk ? 'INFO' : 'WARN');
    if (opts.showToast !== false) {
      logToast_('Logging Health', parts.join(' | '), summary.errors.length ? 8 : 5, severity, summary);
    }
    trace.complete('verifyLogging completed', { errors: summary.errors.length, appendOk: summary.appendOk });
    return summary;
  } catch (error) {
    trace.fail('verifyLogging failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Verifying logging',
      correlationId: trace.correlationId
    });
    showErrorToast('Verify Logging Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

/**
 * Menu handler to run integration health checks for Xero and vector ops.
 */
function checkIntegrationsHealthMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'checkIntegrationsHealthMenu');
  try {
    const summary = checkIntegrationsHealth({ lightweight: false, silent: true, source: 'menu' });
    const xero = summary.xero || {};
    const vector = summary.vector || {};
    const parts = [];
    parts.push('Xero: ' + (xero.ok ? 'healthy' : (xero.issues && xero.issues[0] ? xero.issues[0] : 'issues')));
    if (xero.backoff && xero.backoff.active) {
      parts.push('Xero backoff until ' + new Date(xero.backoff.until).toLocaleString());
    }
    parts.push('Vector: ' + (vector.ok ? 'healthy' : (vector.missingProps && vector.missingProps.length ? 'missing ' + vector.missingProps.join(', ') : (vector.issues && vector.issues[0] ? vector.issues[0] : 'issues'))));
    if ((vector.sync && vector.sync.active) || (vector.search && vector.search.active)) {
      parts.push('Vector backoff active');
    }
    if (vector.featureFlags && vector.featureFlags.disabled) {
      parts.push('Vector features disabled');
    }
    const severity = (xero.ok && vector.ok && !(xero.backoff && xero.backoff.active) && !(vector.sync && vector.sync.active)) ? 'INFO' : 'WARN';
    logToast_('Integrations Health', parts.join(' | '), 8, severity, summary);
    trace.complete('checkIntegrationsHealthMenu completed', { xeroOk: xero.ok, vectorOk: vector.ok });
  } catch (error) {
    trace.fail('checkIntegrationsHealthMenu failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'checkIntegrationsHealthMenu failed', String(error));
    logToast_('Integrations Health', 'Health check failed: ' + error, 8, 'WARN');
    const userError = createUserFriendlyError(error, {
      operation: 'Checking integrations health',
      correlationId: trace.correlationId
    });
    showErrorToast('Integration Health Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function ensureScopeConsentPreflight_(options) {
  const trace = UnifiedLogger.startTrace('Menu', 'ensureScopeConsentPreflight_');
  try {
    trace.complete('ensureScopeConsentPreflight_ completed - no scopes required');
    return [];
  } catch (error) {
    trace.fail('ensureScopeConsentPreflight_ failed', error);
    throw error;
  }
}

function computeScopesSignature_() {
  const trace = UnifiedLogger.startTrace('Menu', 'computeScopesSignature_');
  try {
    const signature = REQUIRED_OAUTH_SCOPES.slice().sort().join('|');
    trace.complete('computeScopesSignature_ completed');
    return signature;
  } catch (error) {
    trace.fail('computeScopesSignature_ failed', error);
    return 'unknown';
  }
}

function getManifestScopes_() {
  const trace = UnifiedLogger.startTrace('Menu', 'getManifestScopes_');
  try {
    if (typeof AppsscriptManifest === 'undefined' || !AppsscriptManifest || !AppsscriptManifest.oauthScopes) {
      trace.complete('getManifestScopes_ completed - no manifest');
      return { changed: false, scopes: [] };
    }
    const normalized = AppsscriptManifest.oauthScopes.slice().sort();
    const result = { changed: normalized.join('|') !== computeScopesSignature_(), scopes: normalized };
    trace.complete('getManifestScopes_ completed', { changed: result.changed, scopeCount: normalized.length });
    return result;
  } catch (error) {
    trace.fail('getManifestScopes_ failed', error);
    return { changed: false, scopes: [] };
  }
}

function isUrlFetchAllowed_() {
  const trace = UnifiedLogger.startTrace('Menu', 'isUrlFetchAllowed_');
  try {
    if (typeof UrlFetchApp === 'undefined') {
      trace.complete('isUrlFetchAllowed_ completed - UrlFetchApp undefined', { allowed: false });
      return false;
    }
    UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true, method: 'head', followRedirects: false });
    trace.complete('isUrlFetchAllowed_ completed', { allowed: true });
    return true;
  } catch (error) {
    const message = error && error.message ? String(error.message) : String(error);
    // If authorization is explicitly required, bubble as blocked; otherwise assume allowed to avoid noisy false negatives.
    if (/Authorization|permission/i.test(message)) {
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'UrlFetch policy check blocked', String(error));
      trace.complete('isUrlFetchAllowed_ completed - blocked', { allowed: false });
      return false;
    }
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'UrlFetch policy check soft-failed; assuming allowed', message);
    trace.complete('isUrlFetchAllowed_ completed - soft fail, assuming allowed', { allowed: true });
    return true;
  }
}

function scheduleReadinessAuditRetry_() {
  const trace = UnifiedLogger.startTrace('Menu', 'scheduleReadinessAuditRetry_');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    const triggers = ScriptApp.getProjectTriggers();
    const readinessPresent = triggers.some(function(trigger) {
      return trigger.getHandlerFunction && trigger.getHandlerFunction() === 'runFullReadinessAudit';
    });
    if (readinessPresent) {
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'readiness retry skipped: trigger already present');
      trace.complete('scheduleReadinessAuditRetry_ skipped - trigger present');
      return;
    }
    const retryFlag = getScriptProperty('READINESS_RETRY_SCHEDULED');
    const retryLock = parseInt(getScriptProperty('READINESS_RETRY_LOCK') || '0', 10);
    const currentCount = parseInt(getScriptProperty('READINESS_RETRY_COUNT') || '0', 10);
    if (currentCount >= 5) {
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'readiness retry capped; manual run required', { attempts: currentCount });
      trace.complete('scheduleReadinessAuditRetry_ capped', { attempts: currentCount });
      return;
    }
    if (retryFlag === 'blocked') {
      if (retryLock && new Date().getTime() >= retryLock && props) {
        props.deleteProperty('READINESS_RETRY_SCHEDULED');
      } else {
        trace.complete('scheduleReadinessAuditRetry_ skipped - blocked');
        return;
      }
    }
    if (retryFlag === 'true') {
      if (!retryLock || new Date().getTime() < retryLock) {
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'readiness retry already scheduled', { attempts: currentCount });
        trace.complete('scheduleReadinessAuditRetry_ skipped - already scheduled');
        return;
      }
    }
    try {
      ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
        'https://www.googleapis.com/auth/script.scriptapp',
        'https://www.googleapis.com/auth/spreadsheets'
      ]);
      const delayMs = Math.min(30000 * Math.pow(2, currentCount), 10 * 60 * 1000);
      ScriptApp.newTrigger('runFullReadinessAudit').timeBased().after(delayMs).create();
      if (props) {
        props.setProperty('READINESS_RETRY_SCHEDULED', 'true');
        props.setProperty('READINESS_RETRY_COUNT', String(currentCount + 1));
        props.setProperty('READINESS_RETRY_LOCK', String(new Date().getTime() + delayMs));
        props.setProperty('READINESS_AUDIT_PENDING', 'true');
      }
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Scheduled readiness audit retry', { delayMs: delayMs, attempts: currentCount + 1 });
      trace.complete('scheduleReadinessAuditRetry_ completed', { delayMs: delayMs, attempts: currentCount + 1 });
    } catch (error) {
      trace.fail('scheduleReadinessAuditRetry_ trigger creation failed', error);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'scheduleReadinessAuditRetry_ failed', String(error));
    }
  } catch (error) {
    trace.fail('scheduleReadinessAuditRetry_ failed', error);
    throw error;
  }
}

function enqueueDeferredStartup_() {
  const trace = UnifiedLogger.startTrace('Menu', 'enqueueDeferredStartup_');
  let lock;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(200)) {
      trace.complete('enqueueDeferredStartup_ skipped - lock busy');
      return;
    }
    const props = getStartupProps_();
    const now = new Date().getTime();
    const scheduleFlag = getScriptProperty('STARTUP_DEFERRED_SCHEDULED');
    const lockTs = parseInt(getScriptProperty('STARTUP_DEFERRED_LOCK') || '0', 10);
    const isFresh = isOverallStartupFresh_(props, now);
    if (isFresh) {
      trace.complete('enqueueDeferredStartup_ skipped - startup fresh');
      return;
    }
    const nextStage = (props && parseInt(props.getProperty('STARTUP_NEXT_STAGE') || '0', 10)) || computeNextStageFromProps_(props);
    if (!nextStage) {
      markOverallStartup_('ok', now, props);
      setNextStage_(null, props);
      trace.complete('enqueueDeferredStartup_ completed - no next stage');
      return;
    }
    if (scheduleFlag === 'true' && lockTs && now < lockTs) {
      trace.complete('enqueueDeferredStartup_ skipped - already scheduled');
      return;
    }
    try {
      ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
        'https://www.googleapis.com/auth/script.scriptapp',
        'https://www.googleapis.com/auth/spreadsheets'
      ]);
      ScriptApp.newTrigger('runDeferredStartup').timeBased().after(15000).create();
    } catch (triggerError) {
      trace.fail('enqueueDeferredStartup_ trigger creation failed', triggerError);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'enqueueDeferredStartup_ failed', String(triggerError));
      return;
    }
    if (props) {
      props.setProperty('STARTUP_DEFERRED_SCHEDULED', 'true');
      props.setProperty('STARTUP_DEFERRED_LOCK', String(now + 60000));
      props.setProperty('STARTUP_NEXT_STAGE', String(nextStage));
    }
    trace.complete('enqueueDeferredStartup_ completed', { nextStage: nextStage });
  } catch (error) {
    trace.fail('enqueueDeferredStartup_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'enqueueDeferredStartup_ failed', String(error));
  } finally {
    try {
      if (lock) {
        lock.releaseLock();
      }
    } catch (ignore) {
      // Silent fail
    }
  }
}

function runStartupStageByNumber_(stage, context) {
  const trace = UnifiedLogger.startTrace('Menu', 'runStartupStageByNumber_');
  try {
    let result;
    switch (stage) {
      case 1:
        result = runStartupStage1_(context);
        break;
      case 2:
        result = runStartupStage2_(context);
        break;
      case 3:
        result = runStartupStage3_(context);
        break;
      case 4:
        result = runStartupStage4_(context);
        break;
      case 5:
        result = runStartupStage5_(context);
        break;
      default:
        result = { status: 'ok', reason: 'noop' };
    }
    trace.complete('runStartupStageByNumber_ completed', { stage: stage, status: result.status });
    return result;
  } catch (error) {
    trace.fail('runStartupStageByNumber_ failed', error);
    throw error;
  }
}

function runDeferredStartup() {
  const trace = UnifiedLogger.startTrace('Menu', 'runDeferredStartup');
  try {
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
    const props = getStartupProps_();
    const start = new Date().getTime();
    const snapshot = { stagesRan: [], stagesSkipped: [], warnings: [] };
    const totalBudget = STAGE_TOTAL_BUDGET_MS;
    const endBy = start + totalBudget;
    clearDeferredStartupFlags_(props);
    const overallFresh = isOverallStartupFresh_(props, start);
    if (overallFresh) {
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'runDeferredStartup skipped: freshness', { runTs: props && props.getProperty ? props.getProperty('STARTUP_RUN_TS') : null });
      trace.complete('runDeferredStartup skipped - fresh');
      return;
    }
  const stage0 = runStartupStage0_({ source: 'deferred-startup' });
  snapshot.stagesRan.push({ stage: 0, status: stage0.status, reason: stage0.reason || null });
  if (stage0.status !== 'ok') {
    setNextStage_(1, props);
    markOverallStartup_('pending', start, props);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runDeferredStartup aborted: stage0 failed', { status: stage0.status, reason: stage0.reason });
    return;
  }
  let nextStageProp = props ? parseInt(props.getProperty('STARTUP_NEXT_STAGE') || '0', 10) : 0;
  let nextStage = nextStageProp || computeNextStageFromProps_(props) || 1;
  while (nextStage && new Date().getTime() < endBy) {
    const now = new Date().getTime();
    const state = getStageState_(nextStage, props);
    if (state.inProgressTs && now - state.inProgressTs > STAGE_INPROGRESS_MAX_MS) {
      setStageState_(nextStage, { inProgressTs: null }, props);
      snapshot.warnings.push('stage' + nextStage + '-stale-cleared');
    }
    if (isStageRetryLocked_(nextStage, now, props)) {
      const retryState = getStageState_(nextStage, props);
      snapshot.stagesSkipped.push({ stage: nextStage, reason: 'retry-lock', retryLock: retryState.retryLock });
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runDeferredStartup skip: retry lock', { stage: nextStage, retryLock: retryState.retryLock });
      break;
    }
    let stageLock;
    try {
      stageLock = LockService.getScriptLock();
      if (!stageLock.tryLock(200)) {
        snapshot.stagesSkipped.push({ stage: nextStage, reason: 'lock-busy' });
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runDeferredStartup skip: lock busy', { stage: nextStage });
        break;
      }
    } catch (lockError) {
      snapshot.stagesSkipped.push({ stage: nextStage, reason: 'lock-error', error: String(lockError) });
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runDeferredStartup skip: lock error', { stage: nextStage, error: String(lockError) });
      break;
    }
    try {
      const result = runStartupStageByNumber_(nextStage, { deferred: true, budgetMs: getStageBudgetMs_(nextStage), source: 'deferred-startup' });
      snapshot.stagesRan.push({ stage: nextStage, status: result.status, reason: result.reason || result.error || result.detail || null, elapsedMs: result.elapsedMs });
      if (result.status === 'partial' || result.status === 'error') {
        break;
      }
      nextStage = computeNextStageFromProps_(props);
      if (!nextStage) {
        break;
      }
    } finally {
      try { stageLock && stageLock.releaseLock(); } catch (ignore) {
      // Silent fail
    }
    }
  }
  setNextStage_(nextStage || null, props);
  try {
    if (props) {
      props.deleteProperty('STARTUP_DEFERRED_SCHEDULED');
      props.deleteProperty('STARTUP_DEFERRED_LOCK');
    }
  } catch (ignore) {
      // Silent fail
    }
  const totalMs = new Date().getTime() - start;
  if (!nextStage) {
    markOverallStartup_('ok', start, props);
  } else {
    markOverallStartup_('pending', start, props);
  }
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'runDeferredStartup snapshot', {
      stagesRan: snapshot.stagesRan,
      stagesSkipped: snapshot.stagesSkipped,
      nextStage: nextStage || null,
      warnings: snapshot.warnings,
      totalMs: totalMs
    });
    trace.complete('runDeferredStartup completed', { stagesRan: snapshot.stagesRan.length, nextStage: nextStage || null, totalMs: totalMs });
  } catch (error) {
    trace.fail('runDeferredStartup failed', error);
    throw error;
  }
}

function scheduleBootstrapStage_(delayMs) {
  const trace = UnifiedLogger.startTrace('Menu', 'scheduleBootstrapStage_');
  try {
    try {
      ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
        'https://www.googleapis.com/auth/script.scriptapp',
        'https://www.googleapis.com/auth/spreadsheets'
      ]);
    } catch (permissionError) {
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'scheduleBootstrapStage_ blocked: trigger creation', String(permissionError));
      runBootstrapStage({ inline: true });
      trace.complete('scheduleBootstrapStage_ completed - inline fallback');
      return;
    }
    const existing = ScriptApp.getProjectTriggers().some(function(trigger) {
      return trigger.getHandlerFunction && trigger.getHandlerFunction() === 'runBootstrapStage';
    });
    if (existing) {
      trace.complete('scheduleBootstrapStage_ skipped - trigger exists');
      return;
    }
    ScriptApp.newTrigger('runBootstrapStage').timeBased().after(Math.max(1000, delayMs || 1000)).create();
    trace.complete('scheduleBootstrapStage_ completed', { delayMs: delayMs });
  } catch (error) {
    trace.fail('scheduleBootstrapStage_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'scheduleBootstrapStage_ failed', String(error));
  }
}

function startFullBootstrapMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'startFullBootstrapMenu');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      props.setProperty('BOOTSTRAP_STAGE', 'sheet');
      props.deleteProperty('BOOTSTRAP_STAGE_ERROR');
      props.deleteProperty('BOOTSTRAP_STAGE_IN_PROGRESS');
      props.deleteProperty('BOOTSTRAP_STAGE_LAST');
    }
    logToast_('Bootstrap', 'Full bootstrap scheduled', 4, 'INFO');
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'startFullBootstrapMenu scheduled bootstrap');
    scheduleBootstrapStage_(1000);
    trace.complete('startFullBootstrapMenu completed');
  } catch (error) {
    trace.fail('startFullBootstrapMenu failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Starting full bootstrap',
      correlationId: trace.correlationId
    });
    showErrorToast('Bootstrap Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

function resetBootstrapStateMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'resetBootstrapStateMenu');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      ['BOOTSTRAP_STAGE', 'BOOTSTRAP_STAGE_ERROR', 'BOOTSTRAP_STAGE_IN_PROGRESS', 'BOOTSTRAP_STAGE_LAST'].forEach(function(key) {
        try { props.deleteProperty(key); } catch (ignore) {
      // Silent fail
    }
      });
    }
    logToast_('Bootstrap', 'Bootstrap state reset', 4, 'INFO');
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'resetBootstrapStateMenu cleared state');
    trace.complete('resetBootstrapStateMenu completed');
  } catch (error) {
    trace.fail('resetBootstrapStateMenu failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Resetting bootstrap state',
      correlationId: trace.correlationId
    });
    showErrorToast('Bootstrap Reset Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
    throw error;
  }
}

function seedCatalogsFromDriveMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'seedCatalogsFromDriveMenu');
  try {
    try { UnifiedLogger.info(MENU_LOG_CATEGORY, 'seedCatalogsFromDriveMenu: starting'); } catch (ignore) {
      // Silent fail
    }
    const result = importScopesV2FromDrive();
    const message = result && result.status
      ? 'Seeded from Drive. Resources: ' + (result.resources || 0) + ', Scopes: ' + (result.scopeRows || 0) + ', Scope Catalog: ' + (result.scopeCatalogRows || 0)
      : 'Seeded from Drive';
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'seedCatalogsFromDriveMenu', result || {});
    logToast_('Catalog Seed', message, 8, 'INFO', result || {});
    try { UnifiedLogger.info(MENU_LOG_CATEGORY, 'seedCatalogsFromDriveMenu: result', result); } catch (ignore) {
      // Silent fail
    }
    trace.complete('seedCatalogsFromDriveMenu completed', { resources: result && result.resources, scopeRows: result && result.scopeRows });
  } catch (error) {
    trace.fail('seedCatalogsFromDriveMenu failed', error);
    try { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'seedCatalogsFromDriveMenu failed', String(error)); } catch (ignore) {
      // Silent fail
    }
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'seedCatalogsFromDriveMenu failed', String(error));
    logToast_('Catalog Seed', 'Seed from Drive failed: ' + error, 8, 'WARN');
    const userError = createUserFriendlyError(error, {
      operation: 'Seeding catalogs from Drive',
      correlationId: trace.correlationId
    });
    showErrorToast('Catalog Seed Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function seedCatalogsFromDriveForceMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'seedCatalogsFromDriveForceMenu');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const result = importScopesV2FromDrive();
    const scopeSheet = ss ? ss.getSheetByName('Scope Buildups') : null;
    const resourceSheet = ss ? ss.getSheetByName('Config: Resource Catalog') : null;
    const scopeCatalogSheet = ss ? ss.getSheetByName('Config: Scope Catalog') : null;
    try {
      if (scopeSheet && typeof ensureScopeBuildupValidationsAndFormulas === 'function') {
        ensureScopeBuildupValidationsAndFormulas(scopeSheet, { forceLive: true });
      }
    } catch (ignore) {
      // Silent fail
    }
    const scopeRows = scopeSheet ? Math.max(0, scopeSheet.getLastRow() - 1) : 0;
    const resourceRows = resourceSheet ? Math.max(0, resourceSheet.getLastRow() - 1) : 0;
    const scopeCatalogRows = scopeCatalogSheet ? Math.max(0, scopeCatalogSheet.getLastRow() - 1) : 0;
    const message = 'Force seed wrote — Scope Buildups: ' + scopeRows + ', Resource Catalog: ' + resourceRows + ', Scope Catalog: ' + scopeCatalogRows;
    logToast_('Catalog Seed', message, 8, 'INFO', { scopeRows: scopeRows, resourceRows: resourceRows, scopeCatalogRows: scopeCatalogRows, result: result || {} });
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'seedCatalogsFromDriveForceMenu', { scopeRows: scopeRows, resourceRows: resourceRows, scopeCatalogRows: scopeCatalogRows, result: result || {} });
    try { UnifiedLogger.info(MENU_LOG_CATEGORY, message); } catch (ignore) {
      // Silent fail
    }
    trace.complete('seedCatalogsFromDriveForceMenu completed', { scopeRows: scopeRows, resourceRows: resourceRows, scopeCatalogRows: scopeCatalogRows });
  } catch (error) {
    trace.fail('seedCatalogsFromDriveForceMenu failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'seedCatalogsFromDriveForceMenu failed', String(error));
    logToast_('Catalog Seed', 'Force seed failed: ' + error, 8, 'WARN');
    try { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'seedCatalogsFromDriveForceMenu failed', String(error)); } catch (ignore) {
      // Silent fail
    }
    const userError = createUserFriendlyError(error, {
      operation: 'Force seeding catalogs from Drive',
      correlationId: trace.correlationId
    });
    showErrorToast('Force Catalog Seed Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function runBootstrapStage(options) {
  const trace = UnifiedLogger.startTrace('Menu', 'runBootstrapStage');
  const inline = options && options.inline === true;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(500)) {
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'runBootstrapStage skipped: lock busy');
    trace.complete('runBootstrapStage skipped - lock busy');
    return;
  }
  const props = getScriptProperty.props || PropertiesService.getScriptProperties();
  try {
    let stage = props ? props.getProperty('BOOTSTRAP_STAGE') : null;
    if (!stage) {
      stage = 'sheet';
      if (props) props.setProperty('BOOTSTRAP_STAGE', stage);
    }
    let iterations = 0;
    while (iterations < 4 && stage && stage !== 'done') {
      const now = new Date().getTime();
      if (props) {
        props.setProperty('BOOTSTRAP_STAGE_IN_PROGRESS', stage);
        props.setProperty('BOOTSTRAP_STAGE_LAST', String(now));
      }
      const timings = { stage: stage, started: now };
      const ss = getActiveSpreadsheetSafe_();
      if (!ss) {
        logToast_('Bootstrap', 'Skipped: no active spreadsheet', 6, 'WARN');
        UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runBootstrapStage skipped: no active spreadsheet');
        trace.complete('runBootstrapStage skipped - no spreadsheet');
        return;
      }
      if (stage === 'sheet') {
        const start = new Date().getTime();
        if (typeof ensureCoreSheetsAndHeaders === 'function') {
          try { ensureCoreSheetsAndHeaders(); } catch (sheetError) { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'ensureCoreSheetsAndHeaders failed', String(sheetError)); }
        }
        let seeded = false;
        if (typeof ensureSourceDataFromDriveIfEmpty === 'function') {
          try { ensureSourceDataFromDriveIfEmpty(); seeded = true; } catch (seedError) { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'ensureSourceDataFromDriveIfEmpty failed', String(seedError)); }
        }
        if (!seeded && typeof seedCatalogsOnly === 'function') {
          try { seedCatalogsOnly(); } catch (seedError) { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'seedCatalogsOnly failed inline', String(seedError)); }
        }
        timings.sheetMs = new Date().getTime() - start;
        if (props) props.setProperty('BOOTSTRAP_STAGE', 'bootstrap');
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'Bootstrap stage complete', { stage: stage, timings: timings });
        if (!inline) {
          scheduleBootstrapStage_(5000);
          trace.complete('runBootstrapStage scheduled next - sheet stage done', { stage: stage });
          return;
        }
        stage = 'bootstrap';
      } else if (stage === 'bootstrap') {
        const start = new Date().getTime();
        runBootstrapNow_();
        timings.bootstrapMs = new Date().getTime() - start;
        if (props) props.setProperty('BOOTSTRAP_STAGE', 'readiness');
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'Bootstrap stage complete', { stage: stage, timings: timings });
        if (!inline) {
          scheduleBootstrapStage_(5000);
          trace.complete('runBootstrapStage scheduled next - bootstrap stage done', { stage: stage });
          return;
        }
        stage = 'readiness';
      } else if (stage === 'readiness') {
        const start = new Date().getTime();
        const triggerAudit = ensureCoreTriggersHealthy_({ allowCreate: true });
        const rebuildStart = new Date().getTime();
        rebuildMenus();
        timings.menuMs = new Date().getTime() - rebuildStart;
        ensureDynamicConfigHealthOnOpen_();
        const permissionIssues = ensurePermissionPreflight_();
        const integrationHealth = (typeof checkIntegrationsHealth === 'function')
          ? checkIntegrationsHealth({ lightweight: true, silent: true, source: 'bootstrap-stage' })
          : null;
        const lastAudit = props ? parseInt(props.getProperty('LAST_READINESS_AUDIT_TS') || '0', 10) : 0;
        if (!lastAudit || (now - lastAudit) > 5 * 60 * 1000) {
          scheduleReadinessAuditRetry_();
        }
        timings.readinessMs = new Date().getTime() - start;
        if (props) {
          props.setProperty('BOOTSTRAP_STAGE', 'done');
          props.setProperty('BOOTSTRAP_DONE_TS', String(now));
        }
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'Bootstrap stage complete', { stage: stage, triggerAudit: triggerAudit, permissionIssues: permissionIssues, integrations: integrationHealth, timings: timings });
        logToast_('Bootstrap', 'Bootstrap completed', 4, 'INFO');
        trace.complete('runBootstrapStage completed - readiness stage done', { timings: timings });
        return;
      } else {
        if (props) {
          props.setProperty('BOOTSTRAP_STAGE', 'done');
          props.setProperty('BOOTSTRAP_DONE_TS', String(now));
        }
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'Bootstrap stage complete', { stage: stage, timings: timings });
        trace.complete('runBootstrapStage completed - unknown stage', { stage: stage });
        return;
      }
      iterations++;
    }
    trace.complete('runBootstrapStage completed - max iterations', { iterations: iterations });
  } catch (error) {
    trace.fail('runBootstrapStage failed', error);
    if (props) {
      props.setProperty('BOOTSTRAP_STAGE_ERROR', String(error));
    }
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'runBootstrapStage failed', String(error));
    logToast_('Bootstrap', 'Bootstrap stage failed: ' + error, 8, 'WARN');
  } finally {
    try {
      if (props) {
        props.deleteProperty('BOOTSTRAP_STAGE_IN_PROGRESS');
      }
    } catch (ignore) {
      // Silent fail
    }
    try { lock.releaseLock(); } catch (ignore) {
      // Silent fail
    }
  }
}

function cleanStalePropertiesMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'cleanStalePropertiesMenu');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      logToast_('Script Properties', 'No script properties available', 5, 'WARN');
      trace.complete('cleanStalePropertiesMenu skipped - no props');
      return;
    }
    const staleKeys = [
      // Startup / readiness / retry locks and flags
      'ONOPEN_ASYNC_SCHEDULED', 'ONOPEN_ASYNC_LOCK',
      'DEFERRED_STARTUP_SCHEDULED', 'DEFERRED_STARTUP_LOCK', 'DEFERRED_STARTUP_IN_PROGRESS', 'DEFERRED_STARTUP_LAST_ERROR',
      'READINESS_RETRY_SCHEDULED', 'READINESS_RETRY_COUNT', 'READINESS_RETRY_LOCK', 'READINESS_AUDIT_PENDING',
      // Bootstrap staging markers
      'BOOTSTRAP_STAGE', 'BOOTSTRAP_STAGE_ERROR', 'BOOTSTRAP_STAGE_IN_PROGRESS', 'BOOTSTRAP_STAGE_LAST'
    ];
    staleKeys.forEach(function(key) {
      try { props.deleteProperty(key); } catch (ignore) {
      // Silent fail
    }
    });
    logToast_('Script Properties', 'Cleared stale markers (' + staleKeys.length + ')', 4, 'INFO');
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'cleanStalePropertiesMenu cleared markers', { keys: staleKeys });
    trace.complete('cleanStalePropertiesMenu completed', { cleared: staleKeys.length });
  } catch (error) {
    trace.fail('cleanStalePropertiesMenu failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'cleanStalePropertiesMenu failed', String(error));
    logToast_('Script Properties', 'Failed to clean properties: ' + error, 8, 'WARN');
    const userError = createUserFriendlyError(error, {
      operation: 'Cleaning stale properties',
      correlationId: trace.correlationId
    });
    showErrorToast('Clean Properties Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function purgeNonessentialPropertiesMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'purgeNonessentialPropertiesMenu');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      logToast_('Script Properties', 'No script properties available', 5, 'WARN');
      trace.complete('purgeNonessentialPropertiesMenu skipped - no props');
      return;
    }
    const keep = [
      'DOC_AI_LOCATION', 'DOC_AI_PROCESSOR_ID', 'DOC_AI_PROJECT_ID', 'GOOGLE_PICKER_KEY',
      'LAST_ONOPEN_TS', 'LAST_QUOTE_FIX_TS', 'LAST_READINESS_AUDIT_TS',
      'LLM_API_KEY', 'LLM_EMBEDDING_MODEL',
      'OPENAI_API_KEY', 'OPENAI_VECTOR_STORE_ID',
      'PINECONE_API_KEY', 'PINECONE_DIMENSION', 'PINECONE_ENVIRONMENT', 'PINECONE_HOST', 'PINECONE_INDEX_NAME',
      'PROP_CONSENT_HEALTH_TRIGGER', 'READINESS_USAGE_METRICS',
      'SCOPE_RECOVERY_ENABLED', 'TEMPLATE_OUTPUT_FOLDER_ID',
      'UNIFIED_LOG_DISABLED_UNTIL', 'UNIFIED_LOG_SHEET_GID', 'UNIFIED_LOG_SHEET_ID', 'UNIFIED_LOG_SPREADSHEET_ID',
      'XERO_ACCESS_TOKEN', 'XERO_CLIENT_ID', 'XERO_CLIENT_SECRET', 'XERO_REFRESH_TOKEN', 'XERO_TENANT_ID', 'XERO_TOKEN_EXPIRY', 'XERO_TOKEN_LAST_REFRESH_TS', 'oauth2.xero'
    ];
    const all = props.getProperties();
    let deleted = 0;
    Object.keys(all).forEach(function(key) {
      if (keep.indexOf(key) === -1) {
        try { props.deleteProperty(key); deleted++; } catch (ignore) {
      // Silent fail
    }
      }
    });
    logToast_('Script Properties', 'Purged nonessential props: ' + deleted + ' deleted, kept ' + keep.length, 6, 'INFO');
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'purgeNonessentialPropertiesMenu completed', { deleted: deleted, kept: keep.length });
    trace.complete('purgeNonessentialPropertiesMenu completed', { deleted: deleted, kept: keep.length });
  } catch (error) {
    trace.fail('purgeNonessentialPropertiesMenu failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'purgeNonessentialPropertiesMenu failed', String(error));
    logToast_('Script Properties', 'Failed to purge: ' + error, 8, 'WARN');
    const userError = createUserFriendlyError(error, {
      operation: 'Purging nonessential properties',
      correlationId: trace.correlationId
    });
    showErrorToast('Purge Properties Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function showScriptPropertiesMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'showScriptPropertiesMenu');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      try { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Script Properties unavailable (no store)'); } catch (ignore) {
      // Silent fail
    }
      logToast_('Script Properties', 'No script properties available', 5, 'WARN');
      trace.complete('showScriptPropertiesMenu skipped - no props');
      return;
    }
    const sensitiveList = (typeof CONFIG_SENSITIVE_KEYS !== 'undefined' && Array.isArray(CONFIG_SENSITIVE_KEYS)) ? CONFIG_SENSITIVE_KEYS : [];
    const sensitiveMap = sensitiveList.reduce(function(map, key) {
      map[key] = true;
      return map;
    }, {});
    const all = props.getProperties();
    const entries = Object.keys(all).sort().map(function(key) {
      const value = sensitiveMap[key] ? '[REDACTED]' : all[key];
      return key + ' = ' + value;
    });
    const message = entries.length ? entries.join('\n') : 'No script properties set';
    try {
      UnifiedLogger.info(MENU_LOG_CATEGORY, 'Script Properties (' + entries.length + ')', { entries: message });
      UnifiedLogger.debug(MENU_LOG_CATEGORY, 'Script Properties', { count: entries.length, properties: message });
    } catch (ignore) {
      // Silent fail
    }
    SpreadsheetApp.getUi().alert('Script Properties', message, SpreadsheetApp.getUi().ButtonSet.OK);
    UnifiedLogger.info(MENU_LOG_CATEGORY, 'showScriptPropertiesMenu', { count: entries.length });
    trace.complete('showScriptPropertiesMenu completed', { count: entries.length });
  } catch (error) {
    trace.fail('showScriptPropertiesMenu failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'showScriptPropertiesMenu failed', String(error));
    logToast_('Script Properties', 'Failed to load properties: ' + error, 8, 'WARN');
    const userError = createUserFriendlyError(error, {
      operation: 'Showing script properties',
      correlationId: trace.correlationId
    });
    showErrorToast('Script Properties Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function getActiveSpreadsheetSafe_() {
  const trace = UnifiedLogger.startTrace('Menu', 'getActiveSpreadsheetSafe_');
  try {
    const ss = SpreadsheetApp.getActive();
    trace.complete('getActiveSpreadsheetSafe_ completed', { hasSpreadsheet: !!ss });
    return ss;
  } catch (error) {
    trace.fail('getActiveSpreadsheetSafe_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'getActiveSpreadsheetSafe_ failed to fetch active spreadsheet', String(error));
    return null;
  }
}

function clearDeferredStartupFlags_(props) {
  const trace = UnifiedLogger.startTrace('Menu', 'clearDeferredStartupFlags_');
  try {
    const store = props || getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!store) {
      trace.complete('clearDeferredStartupFlags_ skipped - no props');
      return;
    }
    [
      'DEFERRED_STARTUP_SCHEDULED',
      'DEFERRED_STARTUP_LOCK',
      'DEFERRED_STARTUP_IN_PROGRESS',
      'DEFERRED_STARTUP_LAST_ERROR',
      'LAST_DEFERRED_STARTUP_TS',
      'LAST_DEFERRED_STARTUP_STATUS',
      'LAST_DEFERRED_STARTUP_ERROR',
      'STARTUP_DEFERRED_SCHEDULED',
      'STARTUP_DEFERRED_LOCK'
    ].forEach(function(key) {
      store.deleteProperty(key);
    });
    trace.complete('clearDeferredStartupFlags_ completed');
  } catch (error) {
    trace.fail('clearDeferredStartupFlags_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'clearDeferredStartupFlags_ failed', String(error));
  }
}

function ensureCoreTriggersHealthy_(options) {
  const trace = UnifiedLogger.startTrace('Menu', 'ensureCoreTriggersHealthy_');
  const opts = options || {};
  const allowCreate = opts.allowCreate === true;
  const summary = {
    onOpenPresent: false,
    onChangePresent: false,
    deferredPresent: false,
    readinessPresent: false,
    propConsentPresent: false,
    integrationHealthPresent: false,
    runOnOpenAsyncPresent: false,
    createdOnOpen: false,
    createdOnChange: false,
    createdDeferred: false,
    createdReadiness: false,
    createdPropConsent: false,
    createdIntegration: false,
    deletedStale: 0,
    deletedDuplicates: 0,
    errors: []
  };
  const props = getScriptProperty.props || PropertiesService.getScriptProperties();
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const seen = {};
    triggers.forEach(function(trigger) {
      const handler = trigger.getHandlerFunction && trigger.getHandlerFunction();
      if (!handler) {
        return;
      }

      // Delete ALL rebuildMenusInstallable triggers - they're redundant with simple onOpen() trigger
      if (handler === 'rebuildMenusInstallable') {
        try {
          ScriptApp.deleteTrigger(trigger);
          summary.deletedStale++;
        } catch (deleteError) {
          summary.errors.push('delete-rebuildMenusInstallable:' + deleteError);
        }
        return;
      }

      // Delete stale runDeferredStartup triggers (they're time-based one-shots that should have already fired)
      if (handler === 'runDeferredStartup') {
        const eventType = trigger.getEventType && trigger.getEventType();
        if (eventType === ScriptApp.EventType.CLOCK) {
          // Time-based deferred triggers are one-shot and auto-delete, but clean up any orphans
          try {
            ScriptApp.deleteTrigger(trigger);
            summary.deletedStale++;
          } catch (deleteError) {
            summary.errors.push('delete-stale-deferred:' + deleteError);
          }
          return;
        }
      }

      const handlerExists = (typeof globalThis !== 'undefined' && typeof globalThis[handler] === 'function') || (typeof this !== 'undefined' && typeof this[handler] === 'function');
      if (!handlerExists) {
        try { ScriptApp.deleteTrigger(trigger); summary.deletedStale++; } catch (deleteError) { summary.errors.push('delete-stale:' + handler); }
        return;
      }
      if (!seen[handler]) {
        seen[handler] = trigger;
      } else {
        try { ScriptApp.deleteTrigger(trigger); summary.deletedDuplicates++; } catch (deleteDupError) { summary.errors.push('delete-dup:' + handler); }
      }
      if (handler === 'onChange') {
        summary.onChangePresent = true;
      }
      if (handler === 'runDeferredStartup') {
        summary.deferredPresent = true;
      }
      if (handler === 'runFullReadinessAudit') {
        summary.readinessPresent = true;
      }
      if (handler === 'propConsentHealthCheck') {
        summary.propConsentPresent = true;
      }
      if (handler === 'runIntegrationsDailyHealth') {
        summary.integrationHealthPresent = true;
      }
      if (handler === 'runOnOpenAsync') {
        summary.runOnOpenAsyncPresent = true;
      }
    });

    // Note: onOpenPresent deliberately not checked - simple onOpen() trigger is always present and can't be disabled
    const noCoreTriggers = !summary.onChangePresent && !summary.deferredPresent && !summary.readinessPresent && !summary.propConsentPresent && !summary.integrationHealthPresent;
    const creationAllowed = allowCreate || noCoreTriggers;
    if (creationAllowed) {
      ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
        'https://www.googleapis.com/auth/script.scriptapp',
        'https://www.googleapis.com/auth/spreadsheets'
      ]);
    }

    // DON'T create rebuildMenusInstallable trigger - simple onOpen() trigger is sufficient
    // Creating both causes duplicate execution and duplicate logs during spreadsheet open
    // rebuildMenusInstallable() was redundant with onOpen() which always fires
    if (props) {
      props.setProperty('MENU_TRIGGER_INSTALLED', 'simple-trigger-only');
    }

    if (!summary.onChangePresent && creationAllowed) {
      try {
        const spreadsheet = SpreadsheetApp.getActive();
        if (spreadsheet) {
          ScriptApp.newTrigger('onChange').forSpreadsheet(spreadsheet).onChange().create();
          summary.createdOnChange = true;
          summary.onChangePresent = true;
          if (props) {
            props.setProperty('CONFIG_REPAIR_TRIGGER_INSTALLED', 'true');
            props.deleteProperty('TRIGGER_SETUP_BLOCKED');
          }
        }
      } catch (createError) {
        summary.errors.push('create-onChange:' + createError);
        try {
          const store = props || getScriptProperty.props || PropertiesService.getScriptProperties();
          if (store) store.setProperty('TRIGGER_SETUP_BLOCKED', 'onChange');
          if (props) props.setProperty('CONFIG_REPAIR_TRIGGER_INSTALLED', 'disabled');
        } catch (ignore) {
      // Silent fail
    }
        if (allowCreate) {
          logToast_('Trigger Setup', 'Installable onChange trigger blocked (policy/consent). See Repair Triggers.', 8, 'WARN', { error: '' + createError });
        }
      }
    } else if (props) {
      props.setProperty('CONFIG_REPAIR_TRIGGER_INSTALLED', 'true');
    }

    // DON'T create runDeferredStartup here - it's created by enqueueDeferredStartup_() when needed
    // Creating it here causes duplicate deferred executions and duplicate logs
    // Line 1354 (enqueueDeferredStartup_) is the proper place to create this trigger

    if (!summary.readinessPresent && creationAllowed) {
      try {
        ScriptApp.newTrigger('runFullReadinessAudit').timeBased().everyHours(4).create();
        summary.readinessPresent = true;
        summary.createdReadiness = true;
        if (props) {
          props.deleteProperty('TRIGGER_SETUP_BLOCKED');
        }
      } catch (createError) {
        summary.errors.push('create-readiness:' + createError);
        try {
          const store = props || getScriptProperty.props || PropertiesService.getScriptProperties();
          if (store) store.setProperty('TRIGGER_SETUP_BLOCKED', 'runFullReadinessAudit');
        } catch (ignore) {
      // Silent fail
    }
        if (allowCreate) {
          logToast_('Trigger Setup', 'Readiness audit trigger blocked (policy/consent). See Repair Triggers.', 8, 'WARN', { error: '' + createError });
        }
      }
    }

    if (!summary.propConsentPresent && creationAllowed) {
      try {
        ScriptApp.newTrigger('propConsentHealthCheck').timeBased().everyDays(1).create();
        summary.propConsentPresent = true;
        summary.createdPropConsent = true;
        if (props) {
          props.setProperty('PROP_CONSENT_HEALTH_TRIGGER', 'true');
          props.deleteProperty('TRIGGER_SETUP_BLOCKED');
        }
      } catch (createError) {
        summary.errors.push('create-propConsent:' + createError);
        try {
          if (props) props.setProperty('PROP_CONSENT_HEALTH_TRIGGER', 'disabled');
          const store = props || getScriptProperty.props || PropertiesService.getScriptProperties();
          if (store) store.setProperty('TRIGGER_SETUP_BLOCKED', 'propConsentHealthCheck');
        } catch (ignore) {
      // Silent fail
    }
        if (allowCreate) {
          logToast_('Trigger Setup', 'Prop/consent health trigger blocked (policy/consent). See Repair Triggers.', 8, 'WARN', { error: '' + createError });
        }
      }
    } else if (props) {
      props.setProperty('PROP_CONSENT_HEALTH_TRIGGER', 'true');
    }

    if (!summary.integrationHealthPresent && creationAllowed) {
      try {
        ScriptApp.newTrigger('runIntegrationsDailyHealth').timeBased().atHour(5).everyDays(1).create();
        summary.integrationHealthPresent = true;
        summary.createdIntegration = true;
        if (props) {
          props.setProperty('INTEGRATIONS_HEALTH_TRIGGER', 'true');
          props.deleteProperty('TRIGGER_SETUP_BLOCKED');
        }
      } catch (createError) {
        summary.errors.push('create-integration:' + createError);
        try {
          if (props) props.setProperty('INTEGRATIONS_HEALTH_TRIGGER', 'disabled');
          const store = props || getScriptProperty.props || PropertiesService.getScriptProperties();
          if (store) store.setProperty('TRIGGER_SETUP_BLOCKED', 'runIntegrationsDailyHealth');
        } catch (ignore) {
      // Silent fail
    }
        if (allowCreate) {
          logToast_('Trigger Setup', 'Integrations health trigger blocked (policy/consent). See Repair Triggers.', 8, 'WARN', { error: '' + createError });
        }
      }
    } else if (props) {
      props.setProperty('INTEGRATIONS_HEALTH_TRIGGER', 'true');
    }
  } catch (error) {
    trace.fail('ensureCoreTriggersHealthy_ failed', error);
    summary.errors.push('audit:' + error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'ensureCoreTriggersHealthy_ failed', String(error));
  }
  trace.complete('ensureCoreTriggersHealthy_ completed', { deletedStale: summary.deletedStale, deletedDuplicates: summary.deletedDuplicates, errors: summary.errors.length });
  return summary;
}

function checkConfigSheets_() {
  const trace = UnifiedLogger.startTrace('Menu', 'checkConfigSheets_');
  const status = { missing: [], errors: [] };
  const requiredSheets = ['Config', 'QUOTE_BUILDER', 'XERO_READY'];
  try {
    const ss = getActiveSpreadsheetSafe_();
    if (!ss) {
      status.missing = requiredSheets.slice();
      status.errors.push('No active spreadsheet');
      trace.complete('checkConfigSheets_ completed - no spreadsheet', { missing: status.missing.length });
      return status;
    }
    requiredSheets.forEach(function(name) {
      const sheet = ss.getSheetByName(name);
      if (!sheet) {
        status.missing.push(name);
      }
    });
    if (status.missing.length) {
      const guidance = 'Missing sheets: ' + status.missing.join(', ') + '. If sheets are protected/hidden, unprotect or create headers before readiness.';
      logToast_('Readiness', guidance, 8, 'WARN');
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Config sheet check missing', { missing: status.missing, guidance: guidance });
    }
    trace.complete('checkConfigSheets_ completed', { missing: status.missing.length, errors: status.errors.length });
  } catch (error) {
    trace.fail('checkConfigSheets_ failed', error);
    status.errors.push(String(error));
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'checkConfigSheets_ failed', String(error));
  }
  return status;
}

function logHeadlessContextIfNeeded_() {
  const trace = UnifiedLogger.startTrace('Menu', 'logHeadlessContextIfNeeded_');
  try {
    const ss = getActiveSpreadsheetSafe_();
    if (!ss) {
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Headless context detected (no active spreadsheet)');
      trace.complete('logHeadlessContextIfNeeded_ completed - headless');
    } else {
      trace.complete('logHeadlessContextIfNeeded_ completed - has spreadsheet');
    }
  } catch (error) {
    trace.fail('logHeadlessContextIfNeeded_ failed', error);
  }
}

function recheckPropertiesAndConsent() {
  const trace = UnifiedLogger.startTrace('Menu', 'recheckPropertiesAndConsent');
  try {
    const propsStatus = ensureRequiredScriptProperties_();
    const scopeStatus = ensureScopeConsentPreflight_({ force: true, includeToast: false });
    const parts = [];
    if (propsStatus.missing.length) parts.push('Missing: ' + propsStatus.missing.join(', '));
    if (propsStatus.invalid.length) parts.push('Invalid: ' + propsStatus.invalid.join(', '));
    if (scopeStatus.length) parts.push('Scopes: ' + scopeStatus.join(', '));
    const healthy = !parts.length;
    const message = healthy ? 'Properties and scopes look healthy' : parts.join(' | ');
    const severity = healthy ? 'INFO' : 'WARN';
    if (healthy) {
      persistPropConsentAudit_();
    }
    logToast_('Props & Consent', message, parts.length ? 8 : 4, severity, { propsStatus: propsStatus, scopeStatus: scopeStatus });
    const logLevel = severity === 'WARN' ? 'warn' : 'info';
    UnifiedLogger[logLevel](MENU_LOG_CATEGORY, 'recheckPropertiesAndConsent', { propsStatus: propsStatus, scopeStatus: scopeStatus });
    trace.complete('recheckPropertiesAndConsent completed', { healthy: healthy, issues: parts.length });
  } catch (error) {
    trace.fail('recheckPropertiesAndConsent failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'recheckPropertiesAndConsent failed', String(error));
    const userError = createUserFriendlyError(error, {
      operation: 'Rechecking properties and consent',
      correlationId: trace.correlationId
    });
    showErrorToast('Props & Consent Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function ensureRequiredScriptProperties_() {
  const trace = UnifiedLogger.startTrace('Menu', 'ensureRequiredScriptProperties_');
  try {
    const registry = getRequiredPropertyRegistry_();
    const status = { missing: [], invalid: [], placeholders: [], sensitiveMissing: [] };
    const sensitiveKeys = ((typeof CONFIG_SENSITIVE_KEYS !== 'undefined' ? CONFIG_SENSITIVE_KEYS : null) || []).reduce(function(map, key) {
      map[key] = true;
      return map;
    }, {});
    try {
      const props = getScriptProperty.props || PropertiesService.getScriptProperties();
      if (!props) {
        status.missing = registry.map(function(entry) { return entry.key; });
        trace.complete('ensureRequiredScriptProperties_ completed - no props', { missing: status.missing.length });
        return status;
      }
      registry.forEach(function(entry) {
        const sensitive = entry.sensitive || !!sensitiveKeys[entry.key];
        const val = getScriptProperty(entry.key);
        const empty = val === null || val === undefined || val === '';
        if (empty) {
          if (sensitive) {
            status.sensitiveMissing.push(entry.key);
            if (typeof ensureConfigInputPlaceholder_ === 'function') {
              try { ensureConfigInputPlaceholder_(entry.key, { sensitive: true, noteOnly: true }); } catch (placeholderError) {
      // Silent fail
    }
            }
          }
          if (!sensitive && typeof ensureConfigInputPlaceholder_ === 'function') {
            try { ensureConfigInputPlaceholder_(entry.key, { sensitive: false }); status.placeholders.push(entry.key); } catch (placeholderError) {
      // Silent fail
    }
          }
          status.missing.push(entry.key);
          return;
        }
        if (entry.validator && !entry.validator(val)) {
          status.invalid.push(entry.key);
        }
      });
    } catch (error) {
      trace.fail('ensureRequiredScriptProperties_ inner check failed', error);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'ensureRequiredScriptProperties_ failed', String(error));
      status.missing = registry.map(function(entry) { return entry.key; });
    }
    const hasGaps = status.missing.length || status.invalid.length || status.sensitiveMissing.length;
    if (!hasGaps) {
      persistPropConsentAudit_();
    }
    trace.complete('ensureRequiredScriptProperties_ completed', { missing: status.missing.length, invalid: status.invalid.length, hasGaps: hasGaps });
    return status;
  } catch (error) {
    trace.fail('ensureRequiredScriptProperties_ failed', error);
    throw error;
  }
}

function getRequiredPropertyRegistry_() {
  const trace = UnifiedLogger.startTrace('Menu', 'getRequiredPropertyRegistry_');
  try {
    const registry = [
      { key: 'SOURCE_DATA_FOLDER_ID', sensitive: true, validator: isLikelyId_, label: 'Source Data Folder ID', help: 'Drive folder containing source CSVs' },
      { key: 'XERO_CLIENT_ID', sensitive: false, validator: isLikelyId_, label: 'Xero Client ID', help: 'From Xero app credentials' },
      { key: 'XERO_CLIENT_SECRET', sensitive: true, validator: isLikelySecret_, label: 'Xero Client Secret', help: 'Keep in PropertiesService only' },
      { key: 'XERO_TENANT_ID', sensitive: false, validator: isLikelyId_, label: 'Xero Tenant ID', help: 'Tenant GUID from Xero' },
      { key: 'OPENAI_API_KEY', sensitive: true, validator: isLikelySecret_, label: 'OpenAI API Key', help: 'Required for LLM/vector calls' },
      { key: 'LLM_API_KEY', sensitive: true, validator: isLikelySecret_, label: 'LLM API Key', help: 'Alternative/model-specific key' },
      { key: 'OPENAI_VECTOR_STORE_ID', sensitive: false, validator: isLikelyId_, label: 'Vector Store ID', help: 'Target store for scope embeddings' },
      { key: 'GOOGLE_PICKER_KEY', sensitive: false, validator: isLikelyId_, label: 'Picker API Key', help: 'Enable Drive picker' }
    ];
    trace.complete('getRequiredPropertyRegistry_ completed', { count: registry.length });
    return registry;
  } catch (error) {
    trace.fail('getRequiredPropertyRegistry_ failed', error);
    throw error;
  }
}

function isLikelyId_(value) {
  const trace = UnifiedLogger.startTrace('Menu', 'isLikelyId_');
  try {
    const normalized = String(value || '').trim();
    const result = normalized.length >= 5;
    trace.complete('isLikelyId_ completed', { result: result });
    return result;
  } catch (error) {
    trace.fail('isLikelyId_ failed', error);
    throw error;
  }
}

function isLikelySecret_(value) {
  const trace = UnifiedLogger.startTrace('Menu', 'isLikelySecret_');
  try {
    const normalized = String(value || '').trim();
    const result = normalized.length >= 12;
    trace.complete('isLikelySecret_ completed', { result: result });
    return result;
  } catch (error) {
    trace.fail('isLikelySecret_ failed', error);
    throw error;
  }
}

function persistPropConsentAudit_() {
  const trace = UnifiedLogger.startTrace('Menu', 'persistPropConsentAudit_');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      props.setProperty('LAST_PROP_CONSENT_OK_TS', String(new Date().getTime()));
    }
    trace.complete('persistPropConsentAudit_ completed');
  } catch (error) {
    trace.fail('persistPropConsentAudit_ failed', error);
  }
}

function propConsentHealthCheck() {
  const trace = UnifiedLogger.startTrace('Menu', 'propConsentHealthCheck');
  try {
    const propsStatus = ensureRequiredScriptProperties_();
    const scopes = ensureScopeConsentPreflight_({ force: true, includeToast: false });
    const hasIssues = propsStatus.missing.length || propsStatus.invalid.length || scopes.length;
    const logLevel = hasIssues ? 'warn' : 'info';
    UnifiedLogger[logLevel](MENU_LOG_CATEGORY, 'propConsentHealthCheck', { propsStatus: propsStatus, scopes: scopes });
    trace.complete('propConsentHealthCheck completed', { hasIssues: !!hasIssues });
  } catch (error) {
    trace.fail('propConsentHealthCheck failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'propConsentHealthCheck failed', String(error));
  }
}

function ensureSourceDataFilesPresent_() {
  const trace = UnifiedLogger.startTrace('Menu', 'ensureSourceDataFilesPresent_');
  try {
    if (typeof verifySourceDataFilesPresent !== 'function') {
      trace.complete('ensureSourceDataFilesPresent_ skipped - function unavailable');
      return [];
    }
    try {
      const result = verifySourceDataFilesPresent();
      trace.complete('ensureSourceDataFilesPresent_ completed', { issues: result.length });
      return result;
    } catch (error) {
      trace.fail('ensureSourceDataFilesPresent_ verification failed', error);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'ensureSourceDataFilesPresent_ failed', String(error));
      return ['SOURCE_DATA_FOLDER_ID inaccessible'];
    }
  } catch (error) {
    trace.fail('ensureSourceDataFilesPresent_ failed', error);
    throw error;
  }
}

function detectDynamicConfigRepairs_(ss) {
  const trace = UnifiedLogger.startTrace('Menu', 'detectDynamicConfigRepairs_');
  try {
    const repairs = [];
    try {
      const checks = [
        { name: 'Config: Brief Profiles', fn: (typeof seedBriefProfiles_ === 'function') ? seedBriefProfiles_ : null },
        { name: 'Config: Scope Phases', fn: (typeof seedScopePhases_ === 'function') ? seedScopePhases_ : null },
        { name: 'Config: Catalog Prefixes', fn: (typeof seedCatalogPrefixes_ === 'function') ? seedCatalogPrefixes_ : null },
        { name: 'Config: Scope Catalog', fn: (typeof seedScopeCatalog_ === 'function') ? seedScopeCatalog_ : null },
        { name: 'Config: Resource Catalog', fn: (typeof seedResourceCatalog_ === 'function') ? seedResourceCatalog_ : null },
        { name: 'Config: Column Map', fn: (typeof seedColumnMap_ === 'function') ? seedColumnMap_ : null }
      ];
      checks.forEach(function(entry) {
        if (!entry.fn) {
          return;
        }
        const sheet = ss.getSheetByName(entry.name);
        const needsSeed = !sheet || sheet.getLastRow() < 2;
        if (needsSeed) {
          repairs.push({ label: entry.name, fn: entry.fn });
        }
      });
    } catch (error) {
      trace.fail('detectDynamicConfigRepairs_ check failed', error);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'detectDynamicConfigRepairs_ failed', String(error));
    }
    trace.complete('detectDynamicConfigRepairs_ completed', { repairs: repairs.length });
    return repairs;
  } catch (error) {
    trace.fail('detectDynamicConfigRepairs_ failed', error);
    throw error;
  }
}

function logToast_(title, message, seconds, level, context) {
  const trace = UnifiedLogger.startTrace('Menu', 'logToast_');
  try {
    const duration = seconds || 5;
    const severity = level || 'INFO';
    let headless = false;
    const ss = getActiveSpreadsheetSafe_();
    try {
      const payload = {
        title: title,
        message: message,
        context: context || null,
        duration: duration
      };
      const logLevel = severity === 'WARN' ? 'warn' : severity === 'ERROR' ? 'error' : 'info';
      UnifiedLogger[logLevel](MENU_LOG_CATEGORY, 'toast.' + (title || 'untitled'), payload);
    } catch (logError) {
      // Silent fail
    }
    try {
      if (!ss) {
        headless = true;
      } else {
        ss.toast(message, title, duration);
      }
    } catch (toastError) {
      headless = true;
      try { UnifiedLogger.warn(MENU_LOG_CATEGORY, 'toastFailed.' + (title || 'untitled'), { error: '' + toastError }); } catch (ignore) {
      // Silent fail
    }
    }
    if (headless) {
      try { UnifiedLogger.info(MENU_LOG_CATEGORY, 'toastSkipped.headless', { title: title, message: message }); } catch (ignore) {
      // Silent fail
    }
    }
    trace.complete('logToast_ completed', { title: title, headless: headless });
  } catch (error) {
    trace.fail('logToast_ failed', error);
  }
}

/**
 * Show about dialog
 */
function showAboutDialog() {
  const trace = UnifiedLogger.startTrace('Menu', 'showAboutDialog');
  try {
    const ui = SpreadsheetApp.getUi();

    const html = `
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <h2>hrmny Quote Builder</h2>
        <p><strong>Version:</strong> 1.0</p>
        <p><strong>Purpose:</strong> Commercial proposal generation system</p>
        <hr>
        <h3>Features:</h3>
        <ul>
          <li>Master items catalogue integration</li>
          <li>Section totals & agency fee automation</li>
          <li>Client/Internal visibility control</li>
          <li>Xero export capability</li>
        </ul>
        <hr>
        <p><small>Based on SYSTEM_BRIEF.md specification</small></p>
      </div>
    `;

    const htmlOutput = HtmlService.createHtmlOutput(html)
      .setWidth(400)
      .setHeight(300);

    ui.showModalDialog(htmlOutput, 'About hrmny Quote Builder');
    trace.complete('showAboutDialog completed');
  } catch (error) {
    trace.fail('showAboutDialog failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Showing about dialog',
      correlationId: trace.correlationId
    });
    showErrorToast('About Dialog Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

/**
 * Show success toast message
 * @param {string} message
 */
function showSuccessToast(message) {
  const trace = UnifiedLogger.startTrace('Menu', 'showSuccessToast');
  try {
    logToast_('✅ Success', message, 3, 'INFO');
    trace.complete('showSuccessToast completed');
  } catch (error) {
    trace.fail('showSuccessToast failed', error);
  }
}

/**
 * Show error toast message
 * PHASE 1 FIX: This function has been moved to Utilities.js for advanced features.
 * The Utilities.js version supports retry callbacks, correlation IDs, and technical details.
 * All calls to showErrorToast now use the advanced version from Utilities.js.
 *
 * NOTE: This comment remains for reference. The actual implementation is in Utilities.js:282
 */

/**
 * Show warning toast message
 * @param {string} message
 */
function showWarningToast(message) {
  const trace = UnifiedLogger.startTrace('Menu', 'showWarningToast');
  try {
    logToast_('⚠️ Warning', message, 4, 'WARN');
    trace.complete('showWarningToast completed');
  } catch (error) {
    trace.fail('showWarningToast failed', error);
  }
}

/**
 * Wrapper for normalize menu item
 * Provides user confirmation dialog before running normalization
 */
function normalizeAllDataManual() {
  const trace = UnifiedLogger.startTrace('Menu', 'normalizeAllDataManual');
  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.alert(
      'Normalize Data',
      'This will update the XERO_READY tab with latest data from source tabs. Continue?',
      ui.ButtonSet.YES_NO
    );

    if (result === ui.Button.YES) {
      try {
        const stats = normalizeAllData();

        let message = `✅ Normalization Complete!\n\n`;
        message += `Scopes: ${stats.scopes} items\n`;
        message += `Crew: ${stats.crew} items\n`;
        message += `Resources: ${stats.resources} items\n`;
        message += `Tools: ${stats.tools} items\n`;
        message += `──────────────────\n`;
        message += `Total: ${stats.total} items\n\n`;

        if (stats.errors && stats.errors > 0) {
          message += `⚠️ ${stats.errors} errors (check log)`;
        }

        if (stats.integrity) {
          const changeNote = (stats.integrity.previousHash && stats.integrity.previousHash !== stats.integrity.hash)
            ? `Hash changed (${stats.integrity.previousHash} → ${stats.integrity.hash})`
            : 'Hash stable';
          message += `\nIntegrity: rows ${stats.integrity.previousRows || 'n/a'} → ${stats.integrity.rows}, ${changeNote}`;
        }

        ui.alert('Normalization Complete', message, ui.ButtonSet.OK);

        try {
          const lookupStats = refreshValidationLookups();
          UnifiedLogger.info(MENU_LOG_CATEGORY, 'Validation hub refreshed after normalization', lookupStats);
        } catch (lookupError) {
          UnifiedLogger.warn(MENU_LOG_CATEGORY, 'Failed to refresh validation hub', String(lookupError));
        }
        trace.complete('normalizeAllDataManual completed', { total: stats.total, errors: stats.errors });
      } catch (error) {
        trace.fail('normalizeAllDataManual normalization failed', error);
        ui.alert(
          'Normalization Failed',
          `❌ Error: ${error.message}\n\nCheck Normalization Log for details.`,
          ui.ButtonSet.OK
        );
        const userError = createUserFriendlyError(error, {
          operation: 'Normalizing data',
          correlationId: trace.correlationId
        });
        showErrorToast('Normalization Error', userError.message, null, {
          correlationId: trace.correlationId,
          error: error
        });
      }
    } else {
      trace.complete('normalizeAllDataManual cancelled by user');
    }
  } catch (error) {
    trace.fail('normalizeAllDataManual failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Normalizing data',
      correlationId: trace.correlationId
    });
    showErrorToast('Normalization Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

/**
 * Show XERO_READY tab
 */
function showXeroReady() {
  const trace = UnifiedLogger.startTrace('Menu', 'showXeroReady');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const xeroReadySheet = ss.getSheetByName('XERO_READY');

    if (!xeroReadySheet) {
      SpreadsheetApp.getUi().alert('XERO_READY tab not found. Run normalization first.');
      trace.complete('showXeroReady completed - sheet not found');
      return;
    }

    ss.setActiveSheet(xeroReadySheet);
    trace.complete('showXeroReady completed');
  } catch (error) {
    trace.fail('showXeroReady failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Showing XERO_READY tab',
      correlationId: trace.correlationId
    });
    showErrorToast('Show XERO_READY Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

/**
 * Show normalization log
 */
function showNormalizationLog() {
  const trace = UnifiedLogger.startTrace('Menu', 'showNormalizationLog');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName('Normalization Log');

    if (!logSheet) {
      SpreadsheetApp.getUi().alert('No normalization log found. Run normalization first.');
      trace.complete('showNormalizationLog completed - log not found');
      return;
    }

    ss.setActiveSheet(logSheet);
    trace.complete('showNormalizationLog completed');
  } catch (error) {
    trace.fail('showNormalizationLog failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Showing normalization log',
      correlationId: trace.correlationId
    });
    showErrorToast('Show Log Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

/**
 * Show global unified log.
 */
function showGlobalLog() {
  const trace = UnifiedLogger.startTrace('Menu', 'showGlobalLog');
  try {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.show();
    } else {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('_Global_Log');
      if (sheet) {
        sheet.showSheet();
        ss.setActiveSheet(sheet);
      } else {
        SpreadsheetApp.getUi().alert('Global log module missing or sheet not initialized.');
      }
    }
    trace.complete('showGlobalLog completed');
  } catch (error) {
    trace.fail('showGlobalLog failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Showing global log',
      correlationId: trace.correlationId
    });
    showErrorToast('Show Log Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function openScopeReviewPanel() {
  const trace = UnifiedLogger.startTrace('Menu', 'openScopeReviewPanel');
  try {
    const html = HtmlService.createHtmlOutputFromFile('ui/scope_review_panel')
      .setTitle('Scope Review Studio')
      .setWidth(420)
      .setHeight(600);
    SpreadsheetApp.getUi().showSidebar(html);
    trace.complete('openScopeReviewPanel completed');
  } catch (error) {
    trace.fail('openScopeReviewPanel failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Opening scope review panel',
      correlationId: trace.correlationId
    });
    showErrorToast('Scope Review Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function showScopeContractOverview() {
  const trace = UnifiedLogger.startTrace('Menu', 'showScopeContractOverview');
  try {
    const html = HtmlService.createHtmlOutputFromFile('ui/scope_contract_overview')
      .setTitle('Scope Contract Overview')
      .setWidth(420)
      .setHeight(640);
    SpreadsheetApp.getUi().showSidebar(html);
    trace.complete('showScopeContractOverview completed');
  } catch (error) {
    trace.fail('showScopeContractOverview failed', error);
    const userError = createUserFriendlyError(error, {
      operation: 'Showing scope contract overview',
      correlationId: trace.correlationId
    });
    showErrorToast('Scope Contract Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function openScopeAuditLog() {
  const trace = UnifiedLogger.startTrace('Menu', 'openScopeAuditLog');
  try {
    const sheet = ensureAILogSheet();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    sheet.showSheet();
    ss.setActiveSheet(sheet);
    SpreadsheetApp.getUi().alert('Scope audit log opened. Filter by Event to focus on scope.* entries.');
    trace.complete('openScopeAuditLog completed');
  } catch (error) {
    trace.fail('openScopeAuditLog failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'openScopeAuditLog error', String(error));
    SpreadsheetApp.getUi().alert('Unable to open scope audit log: ' + (error && error.message ? error.message : error));
    const userError = createUserFriendlyError(error, {
      operation: 'Opening scope audit log',
      correlationId: trace.correlationId
    });
    showErrorToast('Audit Log Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

function isMenuRebuildThrottled_() {
  const trace = UnifiedLogger.startTrace('Menu', 'isMenuRebuildThrottled_');
  try {
    try {
      const cache = CacheService.getScriptCache();
      if (cache && cache.get(MENU_REBUILD_CACHE_KEY)) {
        UnifiedLogger.info(MENU_LOG_CATEGORY, 'isMenuRebuildThrottled_: cache flag active');
        trace.complete('isMenuRebuildThrottled_ completed - throttled by cache', { throttled: true });
        return true;
      }
    } catch (error) {
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'isMenuRebuildThrottled_ fallback', String(error));
    }
    try {
      const timestamp = getScriptProperty(MENU_REBUILD_PROP_KEY);
      if (timestamp) {
        const parsed = Date.parse(timestamp);
        if (!isNaN(parsed)) {
          const elapsed = (Date.now() - parsed) / 1000;
          if (elapsed < MENU_THROTTLE_SECONDS) {
            UnifiedLogger.info(MENU_LOG_CATEGORY, 'isMenuRebuildThrottled_: property throttle', { elapsedSeconds: elapsed });
            trace.complete('isMenuRebuildThrottled_ completed - throttled by property', { throttled: true, elapsedSeconds: elapsed });
            return true;
          }
        }
      }
    } catch (error) {
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'isMenuRebuildThrottled_ property check failed', String(error));
    }
    trace.complete('isMenuRebuildThrottled_ completed', { throttled: false });
    return false;
  } catch (error) {
    trace.fail('isMenuRebuildThrottled_ failed', error);
    throw error;
  }
}

function markMenuRebuildStart_() {
  const trace = UnifiedLogger.startTrace('Menu', 'markMenuRebuildStart_');
  try {
    const nowIso = new Date().toISOString();
    CacheService.getScriptCache().put(MENU_REBUILD_CACHE_KEY, nowIso, MENU_THROTTLE_SECONDS);
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      props.setProperty(MENU_REBUILD_PROP_KEY, nowIso);
    }
    trace.complete('markMenuRebuildStart_ completed');
  } catch (error) {
    trace.fail('markMenuRebuildStart_ failed', error);
    UnifiedLogger.warn(MENU_LOG_CATEGORY, 'markMenuRebuildStart_ failed', String(error));
  }
}

function downloadQuoteJsonToDrive() {
  const trace = UnifiedLogger.startTrace('Menu', 'downloadQuoteJsonToDrive');
  try {
    const ui = SpreadsheetApp.getUi();
    try {
      const url = downloadJSONAsFile();
      if (url) {
        ui.alert('JSON Exported', 'Quote JSON saved to Drive. Open file:\n' + url, ui.ButtonSet.OK);
      }
      trace.complete('downloadQuoteJsonToDrive completed', { url: !!url });
    } catch (error) {
      trace.fail('downloadQuoteJsonToDrive download failed', error);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'downloadQuoteJsonToDrive error', String(error));
      ui.alert('Download Failed', '❌ ' + (error && error.message ? error.message : error), ui.ButtonSet.OK);
      const userError = createUserFriendlyError(error, {
        operation: 'Downloading quote JSON to Drive',
        correlationId: trace.correlationId
      });
      showErrorToast('Download Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
    }
  } catch (error) {
    trace.fail('downloadQuoteJsonToDrive failed', error);
    throw error;
  }
}

function showClientJSONDialog() {
  const trace = UnifiedLogger.startTrace('Menu', 'showClientJSONDialog');
  try {
    const ui = SpreadsheetApp.getUi();
    try {
      const clientJson = exportClientDataJSON();
      let html = `
        <style>
          body { font-family: 'Google Sans', Arial, sans-serif; padding: 20px; color: #202124; }
          h2 { margin-top: 0; font-size: 18px; color: #1a73e8; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
          th { text-align: left; border-bottom: 2px solid #e0e0e0; padding: 8px 4px; color: #5f6368; font-weight: 600; }
          td { border-bottom: 1px solid #f1f3f4; padding: 8px 4px; vertical-align: top; }
          .num { text-align: right; white-space: nowrap; }
          .totals { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: right; }
          .totals-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 5px; font-size: 12px; }
          .totals-row.grand { font-weight: bold; font-size: 14px; color: #1a73e8; margin-top: 8px; }
          .meta { font-size: 11px; color: #5f6368; margin-bottom: 20px; }
        </style>
        <h2>Client Quote Preview</h2>
        <div class="meta">Generated: ${escapeHtml(clientJson.quoteDate)}</div>
        <table>
          <thead>
            <tr>
              <th width="50%">Description</th>
              <th width="10%">Qty</th>
              <th width="15%">Unit</th>
              <th width="25%" class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
      `;

      if (clientJson.items && clientJson.items.length > 0) {
        clientJson.items.forEach(item => {
          const desc = item.clientLineName || item.description || '';
          const section = item.sectionName ? `<div style="font-size:10px;color:#1a73e8;margin-bottom:2px;">${escapeHtml(item.sectionName)}</div>` : '';
          html += `
            <tr>
              <td>${section}${escapeHtml(desc)}</td>
              <td>${escapeHtml(item.qty)}</td>
              <td>${escapeHtml(item.unit)}</td>
              <td class="num">${escapeHtml(QuoteUtils.formatCurrency(item.clientAmount))}</td>
            </tr>
          `;
        });
      } else {
        html += '<tr><td colspan="4" style="text-align:center;padding:20px;color:#999;">No visible client items found.</td></tr>';
      }

      html += `
          </tbody>
        </table>
        <div class="totals">
          <div class="totals-row"><span>Subtotal:</span> <span>${escapeHtml(QuoteUtils.formatCurrency(clientJson.totals.subtotal))}</span></div>
          <div class="totals-row"><span>VAT:</span> <span>${escapeHtml(QuoteUtils.formatCurrency(clientJson.totals.vat))}</span></div>
          <div class="totals-row grand"><span>Total:</span> <span>${escapeHtml(QuoteUtils.formatCurrency(clientJson.totals.total))}</span></div>
        </div>
      `;

      const output = HtmlService.createHtmlOutput(html).setWidth(600).setHeight(600);
      ui.showModalDialog(output, 'Client Quote Preview');
      trace.complete('showClientJSONDialog completed', { itemCount: clientJson.items ? clientJson.items.length : 0 });
    } catch (error) {
      trace.fail('showClientJSONDialog export failed', error);
      UnifiedLogger.warn(MENU_LOG_CATEGORY, 'showClientJSONDialog error', String(error));
      ui.alert('Export Failed', '❌ ' + (error && error.message ? error.message : error), ui.ButtonSet.OK);
      const userError = createUserFriendlyError(error, {
        operation: 'Showing client JSON dialog',
        correlationId: trace.correlationId
      });
      showErrorToast('Client JSON Error', userError.message, null, {
        correlationId: trace.correlationId,
        error: error
      });
    }
  } catch (error) {
    trace.fail('showClientJSONDialog failed', error);
    throw error;
  }
}

// DELETED: Duplicate escapeHtml - using canonical version from 00_StringUtils.js

/**
 * Show interactive log search dialog.
 * Phase 4, Task 4.3: Menu integration for log search
 */
function searchLogsMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'searchLogsMenu');
  try {
    if (typeof promptLogSearch === 'function') {
      promptLogSearch();
      trace.complete('searchLogsMenu completed');
    } else {
      SpreadsheetApp.getUi().alert(
        'Log Search Not Available',
        'The log search feature is not loaded. Please ensure LogSearcher.js is deployed.',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      trace.complete('searchLogsMenu completed - feature not available');
    }
  } catch (error) {
    trace.fail('searchLogsMenu failed', error);
    SpreadsheetApp.getUi().alert(
      'Search Failed',
      'Error: ' + error.message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    try {
      UnifiedLogger.error('Menu', 'Log search menu failed', error);
    } catch (ignore) {
      // Silent fail
    }
    const userError = createUserFriendlyError(error, {
      operation: 'Searching logs',
      correlationId: trace.correlationId
    });
    showErrorToast('Log Search Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

/**
 * Show error summary for recent errors.
 * Phase 4, Task 4.3: Menu integration for error analysis
 */
function showErrorSummaryMenu() {
  const trace = UnifiedLogger.startTrace('Menu', 'showErrorSummaryMenu');
  try {
    if (typeof generateErrorSummary !== 'function') {
      SpreadsheetApp.getUi().alert(
        'Error Summary Not Available',
        'The error summary feature is not loaded. Please ensure LogSearcher.js is deployed.',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      trace.complete('showErrorSummaryMenu completed - feature not available');
      return;
    }

    // Generate summary for last 48 hours
    const summary = generateErrorSummary(48);

    // Build summary message
    let message = '📊 ERROR SUMMARY (Last 48 Hours)\n\n';
    message += 'Total Errors: ' + summary.totalErrors + '\n\n';

    if (summary.totalErrors === 0) {
      message += '✅ No errors found!';
    } else {
      message += '=== Top 5 Errors ===\n';
      const topCount = Math.min(5, summary.topErrors.length);
      for (let i = 0; i < topCount; i++) {
        const error = summary.topErrors[i];
        message += (i + 1) + '. ' + truncate(error.message, 80);
        message += '\n   Count: ' + error.count + ' | Category: ' + error.category + '\n';
      }

      message += '\n=== By Category ===\n';
      const categories = Object.keys(summary.byCategory).slice(0, 5);
      categories.forEach(function(cat) {
        message += '  • ' + cat + ': ' + summary.byCategory[cat].count + ' errors\n';
      });

      if (Object.keys(summary.byCategory).length > 5) {
        message += '  ... and ' + (Object.keys(summary.byCategory).length - 5) + ' more categories\n';
      }

      message += '\n💡 Tip: Use "Search Logs" to investigate specific errors';
    }

    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      '📊 Error Summary Report',
      message,
      ui.ButtonSet.OK_CANCEL
    );

    // If user clicks OK, offer to create detailed report
    if (response === ui.Button.OK && summary.totalErrors > 0) {
      const createReport = ui.alert(
        'Create Detailed Report?',
        'Would you like to create a detailed error report sheet?',
        ui.ButtonSet.YES_NO
      );

      if (createReport === ui.Button.YES) {
        // Get recent errors and display in sheet
        const errors = getRecentErrors(48, 500);
        if (errors.length > 0) {
          displayLogsInSheet(errors, 'Error_Summary_Report_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss'));
          ui.alert('Report Created', 'Detailed error report created. Check the new sheet.', ui.ButtonSet.OK);
        }
      }
    }

    try {
      UnifiedLogger.info('Menu', 'Error summary shown', {
        totalErrors: summary.totalErrors,
        hours: 48
      });
    } catch (ignore) {
      // Silent fail
    }

    trace.complete('showErrorSummaryMenu completed', { totalErrors: summary.totalErrors });

  } catch (error) {
    trace.fail('showErrorSummaryMenu failed', error);
    SpreadsheetApp.getUi().alert(
      'Error Summary Failed',
      'Error: ' + error.message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    try {
      UnifiedLogger.error('Menu', 'Error summary menu failed', error);
    } catch (ignore) {
      // Silent fail
    }
    const userError = createUserFriendlyError(error, {
      operation: 'Showing error summary',
      correlationId: trace.correlationId
    });
    showErrorToast('Error Summary Error', userError.message, null, {
      correlationId: trace.correlationId,
      error: error
    });
  }
}

/**
 * hrmny Quote Builder - Integration Health & Backoff Helpers
 * Provides shared readiness, credential, and backoff utilities for Xero and
 * vector store integrations. Keeps network probes optional so lightweight
 * contexts (onOpen, deferred startup) can run without external calls.
 */

const INTEGRATION_HEALTH_LOG_CATEGORY = 'IntegrationHealth';
const INTEGRATION_BACKOFF_BASE_MS = 2 * 60 * 1000; // 2 minutes
const INTEGRATION_BACKOFF_MAX_MS = 15 * 60 * 1000; // 15 minutes cap

const XERO_INTEGRATION_KEY = 'XERO';
const VECTOR_SYNC_INTEGRATION_KEY = 'VECTOR_SYNC';
const VECTOR_SEARCH_INTEGRATION_KEY = 'VECTOR_SEARCH';

/**
 * Validate required Xero credentials without exposing secrets.
 * @return {{ok:boolean, missing:Array<string>, issues:Array<string>, tenantId:string|null}}
 */
function validateXeroCredentials() {
  const missing = [];
  const issues = [];
  let tenantId = null;

  const props = getScriptProperty.props || PropertiesService.getScriptProperties();
  if (!props) {
    return { ok: false, missing: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET', 'XERO_TENANT_ID'], issues: ['Script properties unavailable'], tenantId: null };
  }

  const clientId = getScriptProperty('XERO_CLIENT_ID');
  const clientSecret = getScriptProperty('XERO_CLIENT_SECRET');
  tenantId = getScriptProperty('XERO_TENANT_ID');

  if (!clientId) missing.push('XERO_CLIENT_ID');
  if (!clientSecret) missing.push('XERO_CLIENT_SECRET');
  if (!tenantId) missing.push('XERO_TENANT_ID');

  if (clientId && typeof isLikelyId_ === 'function' && !isLikelyId_(clientId)) {
    issues.push('Client ID format unexpected');
  }
  if (tenantId && typeof isLikelyId_ === 'function' && !isLikelyId_(tenantId)) {
    issues.push('Tenant ID format unexpected');
  }

  return {
    ok: missing.length === 0 && issues.length === 0,
    missing: missing,
    issues: issues,
    tenantId: tenantId || null
  };
}

/**
 * Ensure the cached Xero token is fresh; attempts a lightweight refresh when stale.
 * FIX ISS-005: Now verifies OAuth2 library has access and updates timestamp
 * @param {{allowNetworkProbe?:boolean, staleMs?:number, reason?:string}=} options
 * @return {{ok:boolean, refreshed:boolean, issues:Array<string>, lastRefresh:number}}
 */
function ensureXeroTokenFresh(options) {
  const opts = options || {};
  const status = { ok: true, refreshed: false, issues: [], lastRefresh: 0 };
  try {
    // Check if OAuth2 library has valid access (automatically refreshes if needed)
    if (typeof getXeroService === 'function') {
      const service = getXeroService();

      // OAuth2 library hasAccess() automatically refreshes tokens internally
      if (!service.hasAccess()) {
        status.ok = false;
        status.issues.push('Xero not authorized. Please re-authorize via Menu → Xero → Authorize Xero');
        return status;
      }

      // OAuth2 library will auto-refresh on getAccessToken() if needed
      const token = service.getAccessToken();
      if (!token) {
        status.ok = false;
        status.issues.push('Failed to get access token. Please re-authorize Xero.');
        return status;
      }

      // Update timestamp to reflect successful token access
      const now = new Date().getTime();
      setScriptProperty('XERO_TOKEN_LAST_REFRESH_TS', String(now));
      status.lastRefresh = now;
      status.ok = true;
      return status;
    }

    // Fallback: Check timestamp if OAuth2 service not available
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    const lastRefresh = parseInt(getScriptProperty('XERO_TOKEN_LAST_REFRESH_TS') || '0', 10);
    const now = new Date().getTime();
    status.lastRefresh = isNaN(lastRefresh) ? 0 : lastRefresh;
    const staleMs = opts.staleMs || (24 * 60 * 60 * 1000);
    const stale = !status.lastRefresh || (now - status.lastRefresh) > staleMs;

    if (stale) {
      status.ok = false;
      status.issues.push('Xero token stale or missing - timestamp check');
    }
  } catch (error) {
    status.ok = false;
    status.issues.push('Token check failed: ' + error);
  }
  return status;
}

/**
 * Summarize Xero integration health, including creds, token state, UrlFetch, and backoff.
 * @param {{allowNetworkProbe?:boolean}=} options
 * @return {{ok:boolean, issues:Array<string>, warnings:Array<string>, credentials:Object, token:Object, urlFetch:Object, backoff:Object, lastSuccess:number, lastFailure:number, failureCount:number}}
 */
function getXeroIntegrationHealth(options) {
  const opts = options || {};
  const credentials = validateXeroCredentials();
  const token = ensureXeroTokenFresh({ allowNetworkProbe: !!opts.allowNetworkProbe });
  const urlFetch = getUrlFetchHealth_(!!opts.allowNetworkProbe);
  const backoff = getIntegrationBackoffState_(XERO_INTEGRATION_KEY);

  const issues = [];
  const warnings = [];
  if (credentials.missing.length) {
    issues.push('Missing: ' + credentials.missing.join(', '));
  }
  if (credentials.issues.length) {
    issues.push.apply(issues, credentials.issues);
  }
  if (!token.ok) {
    issues.push.apply(issues, token.issues);
  }
  if (!urlFetch.allowed) {
    warnings.push(urlFetch.reason || 'UrlFetch blocked or unavailable');
  }
  if (backoff.active) {
    warnings.push('Backoff active until ' + new Date(backoff.until).toISOString());
  }

  return {
    ok: issues.length === 0,
    issues: issues,
    warnings: warnings,
    credentials: credentials,
    token: token,
    urlFetch: urlFetch,
    backoff: backoff,
    lastSuccess: backoff.lastSuccess,
    lastFailure: backoff.lastFailure,
    failureCount: backoff.failureCount
  };
}

/**
 * Guard Xero operations by enforcing credential, UrlFetch, and backoff readiness.
 * @param {{operation?:string, allowNetworkProbe?:boolean, surfaceToast?:boolean}=} options
 * @throws {AppError} when integration is unhealthy or backoff is active
 * @return {Object} health snapshot
 */
function ensureXeroIntegrationReady_(options) {
  const opts = options || {};
  const health = getXeroIntegrationHealth({ allowNetworkProbe: !!opts.allowNetworkProbe });
  const context = { operation: opts.operation || 'xero', backoff: health.backoff };
  if (health.backoff.active) {
    const message = 'Xero calls paused after failures. Backoff until ' + new Date(health.backoff.until).toLocaleString();
    if (opts.surfaceToast && typeof logToast_ === 'function') {
      logToast_('Xero Backoff', message, 8, 'WARN', context);
    }
    throw new AppError('XERO_BACKOFF_ACTIVE', message);
  }
  if (!health.ok) {
    const message = 'Xero preflight failed: ' + (health.issues.join('; ') || 'unknown issue');
    if (opts.surfaceToast && typeof logToast_ === 'function') {
      logToast_('Xero Preflight', message, 8, 'WARN', context);
    }
    throw new AppError('XERO_PREFLIGHT_FAILED', message);
  }
  if (!health.urlFetch.allowed) {
    const message = health.urlFetch.reason || 'UrlFetch blocked; cannot reach Xero.';
    if (opts.surfaceToast && typeof logToast_ === 'function') {
      logToast_('Xero Network', message, 8, 'WARN', context);
    }
    throw new AppError('XERO_NETWORK_BLOCKED', message);
  }
  return health;
}

/**
 * Summarize vector integration readiness for sync/search.
 * @param {{allowNetworkProbe?:boolean}=} options
 * @return {{ok:boolean, missingProps:Array<string>, warnings:Array<string>, issues:Array<string>, featureFlags:Object, urlFetch:Object, sync:Object, search:Object}}
 */
function getVectorIntegrationHealth(options) {
  const opts = options || {};
  const props = getScriptProperty.props || PropertiesService.getScriptProperties();
  const missing = [];
  const issues = [];
  const warnings = [];

  const apiKey = getScriptProperty('OPENAI_API_KEY');
  const vectorStoreId = getScriptProperty('OPENAI_VECTOR_STORE_ID');
  if (!apiKey) missing.push('OPENAI_API_KEY');
  if (!vectorStoreId) missing.push('OPENAI_VECTOR_STORE_ID');

  const featureFlags = resolveVectorFeatureFlags_();
  if (featureFlags.disabled) {
    warnings.push('Vector features disabled via flags');
  }

  const urlFetch = getUrlFetchHealth_(!!opts.allowNetworkProbe);
  if (!urlFetch.allowed) {
    warnings.push(urlFetch.reason || 'UrlFetch blocked for vector operations');
  }

  const syncBackoff = getIntegrationBackoffState_(VECTOR_SYNC_INTEGRATION_KEY);
  const searchBackoff = getIntegrationBackoffState_(VECTOR_SEARCH_INTEGRATION_KEY);
  if (syncBackoff.active) {
    warnings.push('Vector sync backoff until ' + new Date(syncBackoff.until).toISOString());
  }
  if (searchBackoff.active) {
    warnings.push('Vector search backoff until ' + new Date(searchBackoff.until).toISOString());
  }

  const assistantId = getScriptProperty('OPENAI_ASSISTANT_ID');
  if (assistantId && typeof isLikelyId_ === 'function' && !isLikelyId_(assistantId)) {
    issues.push('Assistant ID format unexpected');
  }

  return {
    ok: missing.length === 0 && issues.length === 0,
    missingProps: missing,
    issues: issues,
    warnings: warnings,
    featureFlags: featureFlags,
    urlFetch: urlFetch,
    sync: syncBackoff,
    search: searchBackoff
  };
}

/**
 * Ensure vector sync/search can run; honors feature flags and backoff.
 * @param {{operation?:'sync'|'search', allowNetworkProbe?:boolean, allowDisabled?:boolean}=} options
 * @throws {AppError} when blocked
 * @return {Object} health snapshot
 */
function ensureVectorIntegrationReady_(options) {
  const opts = options || {};
  const health = getVectorIntegrationHealth({ allowNetworkProbe: !!opts.allowNetworkProbe });
  const op = opts.operation || 'sync';
  const backoffState = op === 'search' ? health.search : health.sync;

  if (backoffState.active) {
    throw new AppError('VECTOR_BACKOFF_ACTIVE', 'Vector ' + op + ' paused until ' + new Date(backoffState.until).toLocaleString());
  }
  if (!health.ok) {
    throw new AppError('OPENAI_CONFIG', 'Vector preflight failed: ' + (health.missingProps.join(', ') || health.issues.join('; ')));
  }
  if (health.featureFlags.disabled && !opts.allowDisabled) {
    throw new AppError('VECTOR_FEATURE_DISABLED', 'Vector operations disabled by feature flags.');
  }
  if (!health.urlFetch.allowed) {
    throw new AppError('VECTOR_NETWORK_BLOCKED', health.urlFetch.reason || 'UrlFetch blocked for vector operations');
  }
  return health;
}

/**
 * Aggregate and log integration health for menu/trigger usage.
 * @param {{lightweight?:boolean, silent?:boolean, source?:string}=} options
 * @return {{xero:Object, vector:Object}}
 */
function checkIntegrationsHealth(options) {
  const opts = options || {};
  const probeNetwork = !opts.lightweight;
  let uiAvailable = true;
  try {
    SpreadsheetApp.getActiveSpreadsheet().getId();
  } catch (uiError) {
    uiAvailable = false;
  }
  const xeroHealth = getXeroIntegrationHealth({ allowNetworkProbe: probeNetwork });
  const vectorHealth = getVectorIntegrationHealth({ allowNetworkProbe: probeNetwork });
  const parts = [];

  parts.push('Xero: ' + (xeroHealth.ok ? 'healthy' : 'issues')); 
  if (xeroHealth.backoff.active) {
    parts.push('Xero backoff until ' + new Date(xeroHealth.backoff.until).toISOString());
  }
  if (vectorHealth.ok) {
    parts.push('Vector: healthy');
  } else {
    const vectorIssues = vectorHealth.missingProps.length ? ('missing ' + vectorHealth.missingProps.join(', ')) : (vectorHealth.issues.join('; ') || 'issues');
    parts.push('Vector: ' + vectorIssues);
  }
  if (vectorHealth.sync.active || vectorHealth.search.active) {
    parts.push('Vector backoff active');
  }

  const payload = {
    source: opts.source || 'manual',
    uiAvailable: uiAvailable,
    xero: xeroHealth,
    vector: vectorHealth
  };
  try { UnifiedLogger.info('IntegrationsHealth', 'Integrations health check', payload); } catch (ignore) {
      console.error('[IntegrationHealth] Error:', ignore.message, ignore.stack);
    }

  if (!opts.silent && typeof logToast_ === 'function') {
    const toastMessage = parts.join(' | ');
    const severity = (xeroHealth.ok && vectorHealth.ok && !xeroHealth.backoff.active && !vectorHealth.sync.active && !vectorHealth.search.active) ? 'INFO' : 'WARN';
    logToast_('Integrations Health', toastMessage, 8, severity, payload);
  }

  return { xero: xeroHealth, vector: vectorHealth };
}

/**
 * Trigger-friendly wrapper to run daily health checks without UI.
 */
function runIntegrationsDailyHealth() {
  try {
    checkIntegrationsHealth({ lightweight: false, silent: true, source: 'daily-trigger' });
  } catch (error) {
    try { UnifiedLogger.warn(INTEGRATION_HEALTH_LOG_CATEGORY, 'runIntegrationsDailyHealth failed', String(error)); } catch (ignore) {
      console.error('[IntegrationHealth] Error:', ignore.message, ignore.stack);
    }
  }
}

function getUrlFetchHealth_(probe) {
  try {
    if (typeof UrlFetchApp === 'undefined') {
      return { allowed: false, reason: 'UrlFetch unavailable in this context' };
    }
    if (probe) {
      UrlFetchApp.fetch('https://www.google.com', { method: 'get', muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: true });
    }
    return { allowed: true };
  } catch (error) {
    return { allowed: false, reason: 'UrlFetch blocked: ' + error };
  }
}

function resolveVectorFeatureFlags_() {
  const props = getScriptProperty.props || PropertiesService.getScriptProperties();
  const flags = {
    diagnostics: true,
    cache: true,
    matchPager: true,
    disabled: false
  };
  try {
    if (props) {
      const diagRaw = getScriptProperty('FEATURE_VECTOR_DIAGNOSTICS');
      const cacheRaw = getScriptProperty('FEATURE_VECTOR_SEARCH_CACHE');
      const pagerRaw = getScriptProperty('FEATURE_VECTOR_MATCH_PAGER');
      if (diagRaw && String(diagRaw).toLowerCase() === 'false') {
        flags.diagnostics = false;
      }
      if (cacheRaw && String(cacheRaw).toLowerCase() === 'false') {
        flags.cache = false;
      }
      if (pagerRaw && String(pagerRaw).toLowerCase() === 'false') {
        flags.matchPager = false;
      }
      flags.disabled = (flags.diagnostics === false && flags.matchPager === false);
    }
  } catch (error) {
    try { UnifiedLogger.warn(INTEGRATION_HEALTH_LOG_CATEGORY, 'resolveVectorFeatureFlags_ failed', String(error)); } catch (ignore) {
      console.error('[IntegrationHealth] Error:', ignore.message, ignore.stack);
    }
  }
  return flags;
}

function recordIntegrationSuccess_(integrationKey, context) {
  try {
    const now = new Date().getTime();
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      return;
    }
    props.deleteProperty(integrationKey + '_BACKOFF_UNTIL');
    props.deleteProperty(integrationKey + '_BACKOFF_ATTEMPTS');
    props.deleteProperty(integrationKey + '_FAILURE_COUNT');
    props.setProperty(integrationKey + '_LAST_SUCCESS_TS', String(now));
    try {
      UnifiedLogger.info(INTEGRATION_HEALTH_LOG_CATEGORY, 'integrationSuccess', { integration: integrationKey, context: context || null });
    } catch (ignore) {
      console.error('[IntegrationHealth] Error:', ignore.message, ignore.stack);
    }
  } catch (error) {
    try { UnifiedLogger.warn(INTEGRATION_HEALTH_LOG_CATEGORY, 'recordIntegrationSuccess_ failed', String(error)); } catch (ignore) {
      console.error('[IntegrationHealth] Error:', ignore.message, ignore.stack);
    }
  }
}

function recordIntegrationFailure_(integrationKey, context) {
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      return;
    }
    const attempts = parseInt(getScriptProperty(integrationKey + '_BACKOFF_ATTEMPTS') || '0', 10) || 0;
    const nextAttempts = attempts + 1;
    const delay = Math.min(INTEGRATION_BACKOFF_BASE_MS * Math.pow(2, nextAttempts - 1), INTEGRATION_BACKOFF_MAX_MS);
    const until = new Date().getTime() + delay;
    const failureCount = parseInt(getScriptProperty(integrationKey + '_FAILURE_COUNT') || '0', 10) + 1;
    props.setProperty(integrationKey + '_BACKOFF_ATTEMPTS', String(nextAttempts));
    props.setProperty(integrationKey + '_BACKOFF_UNTIL', String(until));
    props.setProperty(integrationKey + '_FAILURE_COUNT', String(failureCount));
    props.setProperty(integrationKey + '_LAST_FAILURE_TS', String(new Date().getTime()));
    try {
      UnifiedLogger.warn(INTEGRATION_HEALTH_LOG_CATEGORY, 'integrationFailure', { integration: integrationKey, until: until, attempts: nextAttempts, context: context || null });
    } catch (ignore) {
      console.error('[IntegrationHealth] Error:', ignore.message, ignore.stack);
    }
  } catch (error) {
    try { UnifiedLogger.warn(INTEGRATION_HEALTH_LOG_CATEGORY, 'recordIntegrationFailure_ failed', String(error)); } catch (ignore) {
      console.error('[IntegrationHealth] Error:', ignore.message, ignore.stack);
    }
  }
}

function getIntegrationBackoffState_(integrationKey) {
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (!props) {
      return { active: false, until: 0, attempts: 0, failureCount: 0, lastSuccess: 0, lastFailure: 0 };
    }
    const until = parseInt(getScriptProperty(integrationKey + '_BACKOFF_UNTIL') || '0', 10) || 0;
    const now = new Date().getTime();
    return {
      active: until && until > now,
      until: until,
      attempts: parseInt(getScriptProperty(integrationKey + '_BACKOFF_ATTEMPTS') || '0', 10) || 0,
      failureCount: parseInt(getScriptProperty(integrationKey + '_FAILURE_COUNT') || '0', 10) || 0,
      lastSuccess: parseInt(getScriptProperty(integrationKey + '_LAST_SUCCESS_TS') || '0', 10) || 0,
      lastFailure: parseInt(getScriptProperty(integrationKey + '_LAST_FAILURE_TS') || '0', 10) || 0
    };
  } catch (error) {
    try { UnifiedLogger.warn(INTEGRATION_HEALTH_LOG_CATEGORY, 'getIntegrationBackoffState_ failed', String(error)); } catch (ignore) {
      console.error('[IntegrationHealth] Error:', ignore.message, ignore.stack);
    }
    return { active: false, until: 0, attempts: 0, failureCount: 0, lastSuccess: 0, lastFailure: 0 };
  }
}

function recordXeroSuccess(context) {
  recordIntegrationSuccess_(XERO_INTEGRATION_KEY, context);
}

function recordXeroFailure(context) {
  recordIntegrationFailure_(XERO_INTEGRATION_KEY, context);
}

function recordVectorSyncSuccess(context) {
  recordIntegrationSuccess_(VECTOR_SYNC_INTEGRATION_KEY, context);
}

function recordVectorSyncFailure(context) {
  recordIntegrationFailure_(VECTOR_SYNC_INTEGRATION_KEY, context);
}

function recordVectorSearchSuccess(context) {
  recordIntegrationSuccess_(VECTOR_SEARCH_INTEGRATION_KEY, context);
}

function recordVectorSearchFailure(context) {
  recordIntegrationFailure_(VECTOR_SEARCH_INTEGRATION_KEY, context);
}

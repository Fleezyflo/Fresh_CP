/**
 * hrmny Quote Builder - Xero OAuth 2.0 Authentication
 *
 * NOTE: Requires OAuth2 library
 * Add library ID: 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF
 *
 * Rate limiting: All Xero API calls are rate-limited via RateLimiter.js
 * Note: RateLimiter.js functions (enforceRateLimit, SERVICE_XERO) are available globally
 */

// Xero OAuth configuration - URLs only (credentials loaded dynamically)
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_API_URL = 'https://api.xero.com/api.xro/2.0';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

/**
 * Get redirect URI (dynamic)
 */
function getXeroRedirectUri() {
  return ScriptApp.getService().getUrl() + '/usercallback';
}

/**
 * Get Xero OAuth service
 * @return {OAuth2Service} OAuth service
 */
function getXeroService() {
  const clientId = requireSecret('XERO_CLIENT_ID');
  const clientSecret = requireSecret('XERO_CLIENT_SECRET');

  return OAuth2.createService('xero')
    .setAuthorizationBaseUrl(XERO_AUTH_URL)
    .setTokenUrl(XERO_TOKEN_URL)
    .setClientId(clientId)
    .setClientSecret(clientSecret)
    .setCallbackFunction('authCallback')
    .setPropertyStore(getScriptProperty.props || PropertiesService.getScriptProperties())
    .setScope('openid profile email accounting.contacts accounting.transactions accounting.settings offline_access')
    .setParam('response_type', 'code')
    .setParam('prompt', 'consent');
}

/**
 * ROOT CAUSE FIX (ISS-005): Ensure Xero token is fresh before API calls
 * The OAuth2 library with 'offline_access' scope should auto-refresh tokens,
 * but we explicitly check and refresh to handle edge cases.
 *
 * @param {Object} options - Optional configuration
 * @return {Object} Status object {ok: boolean, issues?: Array}
 */
function ensureXeroTokenFresh(options) {
  const trace = UnifiedLogger.startTrace('XeroAuth', 'ensureXeroTokenFresh');
  try {
    const service = getXeroService();

    // Check if we have access (OAuth2 library handles refresh internally)
    if (!service.hasAccess()) {
      trace.fail('No Xero access', null);
      return {
        ok: false,
        issues: ['Xero not authorized. Please re-authorize via Menu → Xero → Authorize Xero']
      };
    }

    // OAuth2 library automatically refreshes tokens when getAccessToken() is called
    // and the access token is expired (it uses the refresh token internally)
    const token = service.getAccessToken();
    if (!token) {
      trace.fail('No access token', null);
      return {
        ok: false,
        issues: ['Failed to get access token. Please re-authorize Xero.']
      };
    }

    trace.complete('Token is fresh', null);
    return { ok: true };

  } catch (error) {
    trace.fail('Token refresh check failed', error);
    return {
      ok: false,
      issues: ['Token refresh failed: ' + String(error)]
    };
  }
}

/**
 * Authorize with Xero
 */
function authorizeXero() {
  const service = getXeroService();

  if (!service.hasAccess()) {
    const authorizationUrl = service.getAuthorizationUrl();
    const template = HtmlService.createTemplate(
      '<p>Click the link below to authorize with Xero:</p>' +
      '<p><a href="<?= authorizationUrl ?>" target="_blank">Authorize with Xero</a></p>' +
      '<p><small>After authorizing, close this window and return to the spreadsheet.</small></p>'
    );
    template.authorizationUrl = authorizationUrl;
    const page = template.evaluate().setWidth(400).setHeight(200);
    SpreadsheetApp.getUi().showModalDialog(page, 'Xero Authorization');
  } else {
    showSuccessToast('Already authorized with Xero');
  }
}

/**
 * Handle GET requests (required for OAuth callbacks)
 */
function doGet(request) {
  const service = getXeroService();
  return service.handleCallback(request);
}

/**
 * OAuth callback
 * FIX ISS-005: Now sets XERO_TOKEN_LAST_REFRESH_TS on successful auth
 */
function authCallback(request) {
  const service = getXeroService();
  const isAuthorized = service.handleCallback(request);

  if (isAuthorized) {
    try {
      // Set token refresh timestamp
      setScriptProperty('XERO_TOKEN_LAST_REFRESH_TS', String(new Date().getTime()));

      updateTenantId();
      return HtmlService.createHtmlOutput('<h2>✅ Success!</h2><p>Xero authorization complete. You can close this tab and return to the spreadsheet.</p>');
    } catch (e) {
      return HtmlService.createHtmlOutput('<h2>⚠️ Partially Successful</h2><p>Authorized, but failed to get tenant ID. Error: ' + e.message + '</p>');
    }
  } else {
    return HtmlService.createHtmlOutput('<h2>❌ Authorization Failed</h2><p>Please try again.</p>');
  }
}

/**
 * Get and store Xero tenant ID
 */
function updateTenantId() {
  const service = getXeroService();
  if (!service.hasAccess()) {
    throw new AppError('XERO_AUTH_ERROR', 'Not authorized with Xero');
  }

  // Rate limit enforcement for Xero API
  enforceRateLimit(SERVICE_XERO);

  const response = UrlFetchApp.fetch(XERO_CONNECTIONS_URL, {
    headers: {
      'Authorization': 'Bearer ' + service.getAccessToken()
    },
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new AppError('XERO_API_ERROR', 'Failed to get connections. Status: ' + responseCode + ', Response: ' + responseText);
  }

  const connections = JSON.parse(responseText);
  if (connections.length === 0) {
    throw new AppError('XERO_CONFIG_ERROR', 'No Xero organizations found');
  }

  const tenantId = connections[0].tenantId;
  setScriptSecret('XERO_TENANT_ID', tenantId);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
      if (configSheet) {
        const data = (configSheet.getLastRow() > 0 ? configSheet.getRange(1, 1, configSheet.getLastRow(), Math.max(configSheet.getLastColumn(), 1)).getValues() : []);
        for (let i = 0; i < data.length; i++) {
          if (data[i][0] === 'XERO_TENANT_ID') {
            configSheet.getRange(i + 1, 2).clearContent();
            break;
          }
        }
      }
    }
  } catch (clearError) {
    try { UnifiedLogger.warn('XeroAuth', 'updateTenantId: unable to clear Config sheet entry', String(clearError)); } catch (ignore) {
      console.error('[XeroAuth] Error:', ignore.message, ignore.stack);
    }
  }
  try { UnifiedLogger.info('XeroAuth', 'Tenant ID stored in Script Properties'); } catch (ignore) {
      console.error('[XeroAuth] Error:', ignore.message, ignore.stack);
    }
  try {
    recordXeroSuccess({ operation: 'updateTenantId' });
  } catch (ignore) {
      console.error('[XeroAuth] Error:', ignore.message, ignore.stack);
    }
  return tenantId;
}

/**
 * Reset authorization
 */
function resetXeroAuth() {
  const service = getXeroService();
  service.reset();
  setScriptSecret('XERO_TENANT_ID', '');
  try {
    const props = getScriptProperty.props || PropertiesService.getScriptProperties();
    if (props) {
      ['XERO_BACKOFF_UNTIL', 'XERO_BACKOFF_ATTEMPTS', 'XERO_FAILURE_COUNT', 'XERO_LAST_FAILURE_TS'].forEach(function(key) {
        props.deleteProperty(key);
      });
    }
  } catch (ignore) {
      console.error('[XeroAuth] Error:', ignore.message, ignore.stack);
    }
  showSuccessToast('Xero authorization reset');
}

/**
 * Check if authorized
 * @return {boolean} True if authorized
 */
function isXeroAuthorized() {
  const service = getXeroService();
  return service.hasAccess();
}

/**
 * Summarize auth/tenant readiness without exposing secrets.
 * @return {{connected: boolean, message: string, issues: string[], tenantId: string|null}}
 */
function getXeroHealthStatus() {
  const health = typeof getXeroIntegrationHealth === 'function'
    ? getXeroIntegrationHealth({ allowNetworkProbe: false })
    : { ok: isXeroAuthorized(), issues: [], warnings: [], credentials: { tenantId: getScriptProperty('XERO_TENANT_ID') || '' } };
  const connected = !!health.ok;
  const issues = (health.issues || []).concat(health.warnings || []);
  const message = connected ? 'Connected' : (issues[0] || 'Not authorized with Xero');
  return {
    connected: connected,
    message: message,
    issues: issues,
    tenantId: (health.credentials && health.credentials.tenantId) || null
  };
}

function checkXeroAuthStatus() {
  const status = getXeroHealthStatus();
  return {
    connected: status.connected,
    message: status.message
  };
}

/**
 * Make authenticated API call to Xero with automatic 429 retry
 * Automatic retry on rate limit errors (max 3 attempts)
 * @param {string} endpoint - API endpoint (e.g., '/Contacts')
 * @param {string} method - HTTP method (GET, POST, PUT)
 * @param {Object} payload - Request payload (optional)
 * @param {Object} options - Optional settings {maxRetries: 3, retryDelay: 2000}
 * @return {Object} API response
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function callXeroAPI(endpoint, method, payload, options) {
  // Correlation ID tracing for Xero API calls (Example integration #2)
  const trace = UnifiedLogger.startTrace('XeroAuth', 'callXeroAPI_' + endpoint.replace(/\//g, '_'), {
    endpoint: endpoint,
    method: method || 'GET'
  });

  try {
    if (!isXeroAuthorized()) {
    throw new AppError('XERO_AUTH_ERROR', 'NOT AUTHORIZED! Run: Menu → Xero → Authorize Xero');
  }

  if (typeof ensureXeroIntegrationReady_ === 'function') {
    ensureXeroIntegrationReady_({ operation: endpoint, allowNetworkProbe: true });
  }

  const service = getXeroService();
  let tenantId = '';
  try {
    tenantId = requireSecret('XERO_TENANT_ID');
  } catch (secretError) {
    if (typeof recordXeroFailure === 'function') {
      recordXeroFailure({ operation: endpoint, reason: 'tenant-id-missing' });
    }
    throw new AppError('XERO_CONFIG_ERROR', 'No Tenant ID found. Please re-authorize Xero to capture a tenant ID.', secretError);
  }

  const tokenStatus = typeof ensureXeroTokenFresh === 'function'
    ? ensureXeroTokenFresh({ allowNetworkProbe: true, reason: endpoint })
    : { ok: true };
  if (!tokenStatus.ok) {
    throw new AppError('XERO_TOKEN_ERROR', tokenStatus.issues.join('; '));
  }

  const url = XERO_API_URL + endpoint;
  const fetchOptions = {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + service.getAccessToken(),
      'xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  };

  if (payload) {
    fetchOptions.payload = JSON.stringify(payload);
  }

  // PHASE 3: Use executeXeroApiCall wrapper for rate limiting and retry logic
  try {
    const response = executeXeroApiCall(url, fetchOptions, endpoint);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    try { recordXeroSuccess({ operation: endpoint, status: responseCode }); } catch (ignore) {
      console.error('[XeroAuth] Error:', ignore.message, ignore.stack);
    }
    trace.complete('Xero API call successful', { status: responseCode, endpoint: endpoint });
    return JSON.parse(responseText);
  } catch (error) {
    // executeXeroApiCall already handles retries and rate limiting
    if (typeof recordXeroFailure === 'function') {
      recordXeroFailure({
        operation: endpoint,
        reason: error && error.message ? error.message : 'api-error',
        retriesExhausted: true
      });
    }
    trace.fail('Xero API call failed', error);
    throw error;
  }
  } catch (outerError) {
    trace.fail('Xero API call exception', outerError);
    throw outerError;
  }
}

/**
 * Show message - works in both UI and non-UI contexts
 */
function showMessage(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    try { UnifiedLogger.info('XeroAuth', title + ': ' + message); } catch (ignore) {
      console.error('[XeroAuth] Error:', ignore.message, ignore.stack);
    }
  }
}

/**
 * Simple debug test to see what's happening
 */
function debugXeroSimple() {
  const ui = SpreadsheetApp.getUi();
  try {
    const allowDebug = getScriptProperty('XERO_DEBUG_ALLOW') === 'true';
    if (!allowDebug) {
      ui.alert('Debug Restricted', 'Xero debug details are limited. Set XERO_DEBUG_ALLOW=true in Script Properties to enable.', ui.ButtonSet.OK);
      return;
    }
    const status = getXeroHealthStatus();
    let message = '🔍 XERO DEBUG STATUS:\n\n';
    message += 'Access: ' + (status.connected ? '✅ Connected' : '❌ Issues') + '\n';
    message += 'Tenant ID: ' + (status.tenantId || 'NULL') + '\n';
    if (status.issues && status.issues.length) {
      message += '\nIssues:\n - ' + status.issues.join('\n - ');
    }
    if (status.connected && status.tenantId) {
      try {
        message += '\n\nTesting API call to /Organisation...\n';
        const response = callXeroAPI('/Organisation', 'GET');
        const code = response && response.Organisations ? 200 : 0;
        message += 'Response Code: ' + code + '\n';
        if (response && response.Organisations && response.Organisations.length > 0) {
          message += '✅ SUCCESS! Connected to: ' + response.Organisations[0].Name;
        }
      } catch (apiError) {
        message += '❌ Error: ' + apiError.message;
      }
    }
    ui.alert('Debug Results', message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Debug Error', error.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Execute a Xero API call with automatic rate limiting and retry logic.
 * Xero Rate Limiting
 * Contract: CSR-2026-001-B
 *
 * @param {string} url - Xero API endpoint URL
 * @param {Object} options - UrlFetchApp.fetch options
 * @param {string} operationName - Human-readable operation name for logging
 * @returns {HTTPResponse} API response
 */
function executeXeroApiCall(url, options, operationName) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // PHASE 3: Rate limit enforcement
      enforceRateLimit(SERVICE_XERO, {
        operationName: operationName || 'xero-api-call',
        operationDetails: { url: url, attempt: attempt + 1 }
      });

      // Execute API call
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();

      // Success
      if (statusCode >= 200 && statusCode < 300) {
        if (attempt > 0) {
          UnifiedLogger.info('Xero', 'API call succeeded after retry', {
            operation: operationName,
            attempts: attempt + 1,
            statusCode: statusCode
          });
        }
        return response;
      }

      // Handle rate limit from Xero (even with our limiting, can happen)
      if (statusCode === 429) {
        const retryAfter = parseInt(response.getHeaders()['Retry-After'] || '60', 10);

        UnifiedLogger.warn('Xero', 'Xero API rate limit (429) received', {
          operation: operationName,
          retryAfter: retryAfter,
          attempt: attempt + 1
        });

        if (attempt < maxRetries - 1) {
          UnifiedLogger.info('Xero', 'Sleeping before retry', {
            seconds: retryAfter,
            attempt: attempt + 1
          });
          Utilities.sleep(retryAfter * 1000);
          attempt++;
          continue;
        }

        // Max retries exhausted
        const err = new Error(
          'Xero rate limit exceeded. Please wait ' + retryAfter + ' seconds and try again.'
        );
        err.code = 'XERO_RATE_LIMIT';
        err.retryAfter = retryAfter;
        throw err;
      }

      // Other errors (400, 401, 404, 500, etc.)
      const errorBody = response.getContentText();
      const err = new Error(
        'Xero API returned status ' + statusCode + ': ' + errorBody
      );
      err.statusCode = statusCode;
      err.responseBody = errorBody;
      throw err;

    } catch (error) {
      if (error.code === 'RATE_LIMIT') {
        // Our internal rate limiter triggered
        UnifiedLogger.warn('Xero', 'Internal rate limit reached', {
          operation: operationName,
          resetInSeconds: error.resetTimeSeconds,
          attempt: attempt + 1
        });

        if (attempt < maxRetries - 1) {
          Utilities.sleep(error.resetTimeSeconds * 1000);
          attempt++;
          continue;
        }

        // Max retries exhausted
        const err = new Error(
          'Xero API rate limit reached. Please wait ' +
          Math.ceil(error.resetTimeSeconds) + ' seconds and try again.'
        );
        err.code = 'RATE_LIMIT';
        err.resetTimeSeconds = error.resetTimeSeconds;
        throw err;
      }

      // Other errors - don't retry
      UnifiedLogger.error('Xero', 'Xero API call failed', {
        operation: operationName,
        error: error.message,
        attempt: attempt + 1
      });
      throw error;
    }
  }

  // Should never reach here, but safety net
  const err = new Error(
    'Xero API call failed after ' + maxRetries + ' attempts. Please try again later.'
  );
  err.code = 'XERO_MAX_RETRIES';
  throw err;
}

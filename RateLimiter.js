/**
 * Rate Limiter - API Call Rate Limiting System
 * Prevents quota exhaustion by tracking and limiting API calls per minute.
 * Uses CacheService for distributed rate limit tracking across all users.
 *
 * PHASE 2 ENHANCEMENTS (CSR-2026-001):
 * - Feature flag support (RATE_LIMITER_ENABLED) for emergency bypass
 * - Enhanced logging for debugging
 * - Integrated with all OpenAI API call sites
 */

const RATE_LIMITER_LOG_CATEGORY = 'RateLimiter';

// Rate limit configuration keys (Script Properties)
const RATE_LIMIT_OPENAI_VECTOR_PROP = 'RATE_LIMIT_OPENAI_VECTOR';  // calls/minute
const RATE_LIMIT_OPENAI_COMPLETION_PROP = 'RATE_LIMIT_OPENAI_COMPLETION';  // calls/minute
const RATE_LIMIT_XERO_PROP = 'RATE_LIMIT_XERO';  // calls/minute

// Default rate limits (80% of API maximums per approval APR-20260105-CSR001)
const DEFAULT_OPENAI_VECTOR_LIMIT = 300;  // 300 calls/minute for vector operations
const DEFAULT_OPENAI_COMPLETION_LIMIT = 20;  // 20 calls/minute for completions (80% of 25)
const DEFAULT_XERO_LIMIT = 48;  // 48 calls/minute for Xero API (80% of 60)

// Cache keys for rate limit tracking
const CACHE_KEY_PREFIX = 'rate_limit_';
const CACHE_TTL_SECONDS = 60;  // 1 minute rolling window

// Rate limit service identifiers
const SERVICE_OPENAI_VECTOR = 'openai_vector';
const SERVICE_OPENAI_COMPLETION = 'openai_completion';
const SERVICE_XERO = 'xero';

/**
 * Get rate limit configuration for a service.
 * @param {string} service - Service identifier (openai_vector, openai_completion, xero)
 * @return {number} Rate limit in calls/minute
 * @private
 */
function getRateLimitConfig_(service) {
  try {
    let propKey, defaultLimit;

    switch (service) {
      case SERVICE_OPENAI_VECTOR:
        propKey = RATE_LIMIT_OPENAI_VECTOR_PROP;
        defaultLimit = DEFAULT_OPENAI_VECTOR_LIMIT;
        break;
      case SERVICE_OPENAI_COMPLETION:
        propKey = RATE_LIMIT_OPENAI_COMPLETION_PROP;
        defaultLimit = DEFAULT_OPENAI_COMPLETION_LIMIT;
        break;
      case SERVICE_XERO:
        propKey = RATE_LIMIT_XERO_PROP;
        defaultLimit = DEFAULT_XERO_LIMIT;
        break;
      default:
        throw new Error('Unknown service: ' + service);
    }

    const configValue = getScriptProperty(propKey);
    if (configValue) {
      const parsed = parseInt(configValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return defaultLimit;
  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.warn(RATE_LIMITER_LOG_CATEGORY, 'Rate limit config read failed, using defaults', {
        service: service,
        error: String(error)
      });
    }
    return service === SERVICE_OPENAI_VECTOR ? DEFAULT_OPENAI_VECTOR_LIMIT :
           service === SERVICE_OPENAI_COMPLETION ? DEFAULT_OPENAI_COMPLETION_LIMIT :
           DEFAULT_XERO_LIMIT;
  }
}

/**
 * Get current call count from cache.
 * @param {string} cacheKey - Cache key for the service
 * @return {number} Current call count
 * @private
 */
function getCurrentCallCount_(cacheKey) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = parseInt(cached, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.warn(RATE_LIMITER_LOG_CATEGORY, 'Cache read failed', {
        cacheKey: cacheKey,
        error: String(error)
      });
    }
  }
  return 0;
}

/**
 * Increment call count in cache.
 * @param {string} cacheKey - Cache key for the service
 * @return {number} New call count
 * @private
 */
function incrementCallCount_(cacheKey) {
  try {
    const cache = CacheService.getScriptCache();
    const current = getCurrentCallCount_(cacheKey);
    const newCount = current + 1;

    // Store with TTL to auto-reset after window
    cache.put(cacheKey, String(newCount), CACHE_TTL_SECONDS);

    return newCount;
  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error(RATE_LIMITER_LOG_CATEGORY, 'Cache increment failed', error);
    }
    throw new Error('Rate limiter cache update failed: ' + error);
  }
}

/**
 * Generate cache key for a service.
 * @param {string} service - Service identifier
 * @return {string} Cache key
 * @private
 */
function generateCacheKey_(service) {
  const timestamp = Math.floor(new Date().getTime() / 1000 / 60);  // Current minute
  return CACHE_KEY_PREFIX + service + '_' + timestamp;
}

/**
 * Check if rate limiter is enabled via feature flag.
 * @return {boolean} True if enabled (default), false if disabled
 * @private
 */
function isRateLimiterEnabled_() {
  try {
    const enabled = getScriptProperty('RATE_LIMITER_ENABLED');
    if (enabled !== null && enabled !== undefined) {
      const normalized = String(enabled).toLowerCase().trim();
      // Explicit false values disable the limiter
      if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
      }
    }
  } catch (error) {
    // Failed to read feature flag - default to enabled (fail-safe)
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.debug(RATE_LIMITER_LOG_CATEGORY, 'Feature flag check failed, defaulting to enabled', {
        error: String(error)
      });
    }
  }
  return true; // Default to enabled for safety
}

/**
 * Enforce rate limit for an API call.
 * Throws RATE_LIMIT error if limit exceeded, otherwise records the call.
 *
 * Feature flag RATE_LIMITER_ENABLED can be set to "false" for emergency bypass.
 * Set in Script Properties: RATE_LIMITER_ENABLED = false
 *
 * @param {string} service - Service identifier (openai_vector, openai_completion, xero)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.dryRun - If true, check limit without recording call
 * @throws {Error} RATE_LIMIT error if limit exceeded
 *
 * @example
 * try {
 *   enforceRateLimit(SERVICE_OPENAI_VECTOR);
 *   // Proceed with API call
 * } catch (error) {
 *   if (error.code === 'RATE_LIMIT') {
 *     // Handle rate limit error
 *   }
 * }
 */
function enforceRateLimit(service, options) {
  // Check feature flag for emergency bypass
  if (!isRateLimiterEnabled_()) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.warn(RATE_LIMITER_LOG_CATEGORY, 'Rate limiter DISABLED by feature flag', {
        service: service
      });
    }
    return; // Bypass rate limiting
  }

  const opts = options || {};
  const cacheKey = generateCacheKey_(service);
  const limit = getRateLimitConfig_(service);
  const currentCount = getCurrentCallCount_(cacheKey);

  // Check if limit exceeded
  if (currentCount >= limit) {
    const resetTimeSeconds = CACHE_TTL_SECONDS - (new Date().getSeconds() % CACHE_TTL_SECONDS);
    const error = new Error(
      'RATE_LIMIT: ' + service + ' limit exceeded (' + currentCount + '/' + limit + '). ' +
      'Wait ' + resetTimeSeconds + ' seconds before retry.'
    );
    error.code = 'RATE_LIMIT';
    error.service = service;
    error.limit = limit;
    error.currentCount = currentCount;
    error.resetTimeSeconds = resetTimeSeconds;

    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.warn(RATE_LIMITER_LOG_CATEGORY, 'Rate limit exceeded', {
        service: service,
        limit: limit,
        currentCount: currentCount,
        resetTimeSeconds: resetTimeSeconds
      });
    }

    throw error;
  }

  // Record call unless dry run
  if (!opts.dryRun) {
    incrementCallCount_(cacheKey);

    // Per-call logging removed to avoid log spam.
  }
}

/**
 * Get current rate limit status for a service.
 *
 * @param {string} service - Service identifier (openai_vector, openai_completion, xero)
 * @return {Object} Rate limit status
 * @return {number} .currentCount - Current call count in window
 * @return {number} .limit - Maximum calls allowed per minute
 * @return {number} .resetTimeSeconds - Seconds until window resets
 * @return {number} .percentageUsed - Percentage of limit used (0-100)
 * @return {boolean} .available - Whether calls are available
 * @return {boolean} .enabled - Whether rate limiter is enabled
 *
 * @example
 * const status = getRateLimitStatus(SERVICE_OPENAI_VECTOR);
 * console.log('Used: ' + status.currentCount + '/' + status.limit);
 * console.log('Available: ' + status.available);
 */
function getRateLimitStatus(service) {
  const enabled = isRateLimiterEnabled_();
  const cacheKey = generateCacheKey_(service);
  const limit = getRateLimitConfig_(service);
  const currentCount = enabled ? getCurrentCallCount_(cacheKey) : 0;
  const resetTimeSeconds = CACHE_TTL_SECONDS - (new Date().getSeconds() % CACHE_TTL_SECONDS);
  const percentageUsed = limit > 0 ? Math.round((currentCount / limit) * 100) : 0;

  return {
    enabled: enabled,
    currentCount: currentCount,
    limit: limit,
    resetTimeSeconds: resetTimeSeconds,
    percentageUsed: percentageUsed,
    available: enabled ? currentCount < limit : true
  };
}

/**
 * Reset rate limit counter for a service (admin function).
 * Use with caution - primarily for testing or manual intervention.
 *
 * @param {string} service - Service identifier to reset
 */
function resetRateLimit(service) {
  try {
    const cacheKey = generateCacheKey_(service);
    const cache = CacheService.getScriptCache();
    cache.remove(cacheKey);

    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.info(RATE_LIMITER_LOG_CATEGORY, 'Rate limit manually reset', {
        service: service
      });
    }
  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error(RATE_LIMITER_LOG_CATEGORY, 'Rate limit reset failed', error);
    }
    throw error;
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    enforceRateLimit: enforceRateLimit,
    getRateLimitStatus: getRateLimitStatus,
    resetRateLimit: resetRateLimit,
    SERVICE_OPENAI_VECTOR: SERVICE_OPENAI_VECTOR,
    SERVICE_OPENAI_COMPLETION: SERVICE_OPENAI_COMPLETION,
    SERVICE_XERO: SERVICE_XERO
  };
}

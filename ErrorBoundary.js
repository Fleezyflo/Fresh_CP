/**
 * ErrorBoundary - Error propagation and user notification
 * Error Propagation
 * @version 1.0
 */

const ErrorBoundary = (function() {

  // Error registry
  const errorLog = [];
  const MAX_ERROR_LOG = 100;

  /**
   * Handle config load error
   * @param {string} configName - e.g., 'briefProfiles'
   * @param {ConfigLoadResult} result
   */
  function handleConfigLoadError(configName, result) {
    // Log error
    errorLog.push({
      timestamp: Date.now(),
      configName: configName,
      result: result
    });

    // Trim error log if too large
    if (errorLog.length > MAX_ERROR_LOG) {
      errorLog.splice(0, errorLog.length - MAX_ERROR_LOG);
    }

    // Log via UnifiedLogger
    try {
      if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) {
        UnifiedLogger.error('ErrorBoundary', 'Config load failed: ' + configName, {
          errors: result.errors,
          warnings: result.warnings,
          metadata: result.metadata
        });
      }
    } catch (logError) {
      // Silent fail on logging
    }

    // Track metrics if available
    try {
      trackMetric_('config_load_error', {
        config: configName,
        errorCodes: result.errors.map(function(e) { return e.code; }),
        source: result.metadata.source,
        recoverable: result.errors.some(function(e) { return e.recoverable; })
      });
    } catch (metricError) {
      // Silent fail on metrics
    }

    // Show user-facing error toast (AC-002, AC-007)
    try {
      if (typeof showErrorToast === 'function') {
        const firstError = result.errors && result.errors.length > 0 ? result.errors[0] : null;
        const errorMessage = firstError ? firstError.message : 'Configuration load failed';
        const isRecoverable = firstError && firstError.recoverable;

        showErrorToast(
          'Configuration Error',
          'Failed to load ' + configName + ': ' + errorMessage,
          isRecoverable ? 'retryConfigLoad_' + configName : null
        );
      }
    } catch (toastError) {
      // Silent fail on toast - don't break error handling flow
    }
  }

  /**
   * Handle config warnings (degraded state)
   * @param {string} configName
   * @param {ConfigLoadResult} result
   */
  function handleConfigWarnings(configName, result) {
    // Log via UnifiedLogger
    try {
      if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) {
        UnifiedLogger.warn('ErrorBoundary', 'Config warnings: ' + configName, {
          warnings: result.warnings,
          source: result.metadata.source
        });
      }
    } catch (logError) {
      // Silent fail on logging
    }

    // Show user-facing warning toast for critical warnings (AC-002)
    try {
      if (typeof showWarningToast === 'function' && result.warnings && result.warnings.length > 0) {
        const criticalWarnings = result.warnings.filter(function(w) {
          return w.severity === 'HIGH' || w.severity === 'CRITICAL';
        });

        if (criticalWarnings.length > 0) {
          const firstWarning = criticalWarnings[0];
          showWarningToast(
            'Configuration Warning',
            configName + ': ' + firstWarning.message,
            null,
            null
          );
        }
      }
    } catch (toastError) {
      // Silent fail on toast
    }
  }

  /**
   * Get error history for debugging
   * @returns {Array}
   */
  function getErrorLog() {
    return errorLog.slice(); // Return copy
  }

  /**
   * Clear error log
   */
  function clearErrorLog() {
    errorLog.length = 0;
  }

  /**
   * Track metric (stub for future integration)
   * @private
   */
  function trackMetric_(metricName, data) {
    // Future: Send to monitoring system
    // Log via UnifiedLogger
    try {
      if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger) {
        UnifiedLogger.verbose('ErrorBoundary', 'Metric: ' + metricName, data);
      }
    } catch (e) {
      // Silent fail
    }
  }

  /**
   * Get summary of recent errors
   * @returns {Object}
   */
  function getErrorSummary() {
    const now = Date.now();
    const last5Min = now - (5 * 60 * 1000);
    const last1Hour = now - (60 * 60 * 1000);

    const recent5Min = errorLog.filter(function(entry) {
      return entry.timestamp >= last5Min;
    });

    const recent1Hour = errorLog.filter(function(entry) {
      return entry.timestamp >= last1Hour;
    });

    const errorsByConfig = {};
    errorLog.forEach(function(entry) {
      const configName = entry.configName;
      if (!errorsByConfig[configName]) {
        errorsByConfig[configName] = 0;
      }
      errorsByConfig[configName]++;
    });

    return {
      totalErrors: errorLog.length,
      errorsLast5Min: recent5Min.length,
      errorsLast1Hour: recent1Hour.length,
      errorsByConfig: errorsByConfig,
      oldestError: errorLog.length > 0 ? errorLog[0].timestamp : null,
      newestError: errorLog.length > 0 ? errorLog[errorLog.length - 1].timestamp : null
    };
  }

  /**
   * Check if config system is healthy
   * @returns {Object}
   */
  function getHealthStatus() {
    const summary = getErrorSummary();
    const now = Date.now();

    // Unhealthy if > 5 errors in last 5 minutes
    const isHealthy = summary.errorsLast5Min <= 5;

    // Degraded if > 10 errors in last hour
    const isDegraded = summary.errorsLast1Hour > 10;

    return {
      status: isHealthy ? (isDegraded ? 'degraded' : 'healthy') : 'unhealthy',
      totalErrors: summary.totalErrors,
      errorsLast5Min: summary.errorsLast5Min,
      errorsLast1Hour: summary.errorsLast1Hour,
      errorsByConfig: summary.errorsByConfig,
      timestamp: now
    };
  }

  // Public API
  return {
    handleConfigLoadError: handleConfigLoadError,
    handleConfigWarnings: handleConfigWarnings,
    getErrorLog: getErrorLog,
    clearErrorLog: clearErrorLog,
    getErrorSummary: getErrorSummary,
    getHealthStatus: getHealthStatus
  };

})();

// Export to global namespace
if (typeof globalThis !== 'undefined') {
}

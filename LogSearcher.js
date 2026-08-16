/**
 * LogSearcher - Query and analyze system logs
 * Provides search and filtering capabilities for the System_Logs sheet.
 */

const LOG_SEARCHER_CATEGORY = 'LogSearcher';
const DEFAULT_LOG_SHEET_NAME = '_Global_Log';

/**
 * Search logs by various criteria.
 * @param {Object} options - Search criteria
 * @param {string} [options.correlationId] - Filter by correlation ID
 * @param {string} [options.category] - Filter by category
 * @param {string} [options.level] - Filter by log level (VERBOSE, INFO, WARN, ERROR)
 * @param {Date} [options.startTime] - Filter by start time
 * @param {Date} [options.endTime] - Filter by end time
 * @param {string} [options.user] - Filter by user email
 * @param {string} [options.messageContains] - Filter by message text
 * @param {number} [options.limit] - Maximum number of results (default: 100)
 * @return {Array<Object>} Array of matching log entries
 *
 * @example
 * const logs = searchLogs({ correlationId: 'abc-123', level: 'ERROR' });
 * console.log('Found ' + logs.length + ' error logs for request abc-123');
 */
function searchLogs(options) {
  const opts = options || {};
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 100;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DEFAULT_LOG_SHEET_NAME);

    if (!sheet) {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.warn(LOG_SEARCHER_CATEGORY, 'Log sheet not found', { sheetName: DEFAULT_LOG_SHEET_NAME });
      }
      return [];
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return []; // No data rows (only header)
    }

    // Get all data (skip header row)
    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

    // Filter results
    const results = [];
    for (let i = 0; i < data.length && results.length < limit; i++) {
      const row = data[i];
      const entry = {
        timestamp: row[0],
        level: row[1],
        category: row[2],
        user: row[3],
        message: row[4],
        details: row[5]
      };

      // Parse details JSON if possible
      if (entry.details && typeof entry.details === 'string') {
        try {
          entry.detailsObj = JSON.parse(entry.details);
        } catch (ignore) {
      // Empty catch replaced with error logging
      console.error('[LogSearcher] Error:', ignore.message, ignore.stack);
    }
      }

      // Apply filters
      if (opts.correlationId) {
        const detailsObj = entry.detailsObj || {};
        if (detailsObj.correlationId !== opts.correlationId) {
          continue;
        }
      }

      if (opts.category && entry.category !== opts.category) {
        continue;
      }

      if (opts.level && entry.level !== opts.level) {
        continue;
      }

      if (opts.user && entry.user !== opts.user) {
        continue;
      }

      if (opts.messageContains) {
        if (!entry.message || entry.message.indexOf(opts.messageContains) === -1) {
          continue;
        }
      }

      if (opts.startTime) {
        const entryTime = new Date(entry.timestamp);
        if (entryTime < opts.startTime) {
          continue;
        }
      }

      if (opts.endTime) {
        const entryTime = new Date(entry.timestamp);
        if (entryTime > opts.endTime) {
          continue;
        }
      }

      // All filters passed
      results.push(entry);
    }

    return results;

  } catch (error) {
    if (typeof UnifiedLogger !== 'undefined') {
      UnifiedLogger.error(LOG_SEARCHER_CATEGORY, 'Log search failed', error);
    }
    throw new Error('Log search failed: ' + error.message);
  }
}

/**
 * Get all logs for a given correlation ID (end-to-end trace).
 * Returns logs in chronological order.
 * @param {string} correlationId - Correlation ID to search for
 * @param {number} [limit] - Maximum number of results (default: 1000)
 * @return {Array<Object>} Array of log entries for this correlation ID
 *
 * @example
 * const trace = getLogsByCorrelationId('abc-123');
 * trace.forEach(function(log) {
 *   console.log(log.timestamp + ' - ' + log.category + ': ' + log.message);
 * });
 */
function getLogsByCorrelationId(correlationId, limit) {
  if (!correlationId) {
    throw new Error('correlationId is required');
  }

  return searchLogs({
    correlationId: correlationId,
    limit: limit || 1000
  });
}

/**
 * Get recent error logs.
 * @param {number} [hours] - Number of hours to look back (default: 24)
 * @param {number} [limit] - Maximum number of results (default: 100)
 * @return {Array<Object>} Array of error log entries
 *
 * @example
 * const recentErrors = getRecentErrors(24);
 * console.log('Found ' + recentErrors.length + ' errors in last 24 hours');
 */
function getRecentErrors(hours, limit) {
  const lookbackHours = hours && hours > 0 ? hours : 24;
  const startTime = new Date(new Date().getTime() - (lookbackHours * 60 * 60 * 1000));

  return searchLogs({
    level: 'ERROR',
    startTime: startTime,
    limit: limit || 100
  });
}

/**
 * Get recent warning logs.
 * @param {number} [hours] - Number of hours to look back (default: 24)
 * @param {number} [limit] - Maximum number of results (default: 100)
 * @return {Array<Object>} Array of warning log entries
 */
function getRecentWarnings(hours, limit) {
  const lookbackHours = hours && hours > 0 ? hours : 24;
  const startTime = new Date(new Date().getTime() - (lookbackHours * 60 * 60 * 1000));

  return searchLogs({
    level: 'WARN',
    startTime: startTime,
    limit: limit || 100
  });
}

/**
 * Get log statistics for a time period.
 * @param {number} [hours] - Number of hours to look back (default: 24)
 * @return {Object} Log statistics
 *
 * @example
 * const stats = getLogStatistics(24);
 * console.log('Errors: ' + stats.errorCount + ', Warnings: ' + stats.warnCount);
 */
function getLogStatistics(hours) {
  const lookbackHours = hours && hours > 0 ? hours : 24;
  const startTime = new Date(new Date().getTime() - (lookbackHours * 60 * 60 * 1000));

  const allLogs = searchLogs({
    startTime: startTime,
    limit: 10000
  });

  const stats = {
    totalCount: allLogs.length,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    verboseCount: 0,
    categoryCounts: {},
    userCounts: {},
    timeRange: {
      start: startTime,
      end: new Date()
    }
  };

  allLogs.forEach(function(log) {
    // Count by level
    switch (log.level) {
      case 'ERROR':
        stats.errorCount++;
        break;
      case 'WARN':
        stats.warnCount++;
        break;
      case 'INFO':
        stats.infoCount++;
        break;
      case 'VERBOSE':
        stats.verboseCount++;
        break;
    }

    // Count by category
    if (log.category) {
      stats.categoryCounts[log.category] = (stats.categoryCounts[log.category] || 0) + 1;
    }

    // Count by user
    if (log.user) {
      stats.userCounts[log.user] = (stats.userCounts[log.user] || 0) + 1;
    }
  });

  return stats;
}


/**
 * Generate error summary report (aggregated by category and message pattern).
 * Error analysis functionality
 *
 * @param {number} [hours] - Number of hours to look back (default: 24)
 * @return {Object} Error summary with counts by category and message
 *
 * @example
 * const summary = generateErrorSummary(48);
 * console.log('Total errors: ' + summary.totalErrors);
 * console.log('Categories: ' + Object.keys(summary.byCategory).join(', '));
 */
function generateErrorSummary(hours) {
  const lookbackHours = hours && hours > 0 ? hours : 24;
  const errors = getRecentErrors(lookbackHours, 10000);

  const summary = {
    totalErrors: errors.length,
    timeRange: {
      hours: lookbackHours,
      start: new Date(new Date().getTime() - (lookbackHours * 60 * 60 * 1000)),
      end: new Date()
    },
    byCategory: {},
    byMessage: {},
    byUser: {},
    topErrors: []
  };

  // Count by category
  errors.forEach(function(error) {
    if (error.category) {
      if (!summary.byCategory[error.category]) {
        summary.byCategory[error.category] = {
          count: 0,
          examples: []
        };
      }
      summary.byCategory[error.category].count++;
      if (summary.byCategory[error.category].examples.length < 3) {
        summary.byCategory[error.category].examples.push({
          timestamp: error.timestamp,
          message: error.message
        });
      }
    }

    // Count by message pattern (first 100 chars)
    if (error.message) {
      const messageKey = error.message.substring(0, 100);
      if (!summary.byMessage[messageKey]) {
        summary.byMessage[messageKey] = {
          count: 0,
          fullMessage: error.message,
          category: error.category,
          lastSeen: error.timestamp
        };
      }
      summary.byMessage[messageKey].count++;
      summary.byMessage[messageKey].lastSeen = error.timestamp;
    }

    // Count by user
    if (error.user) {
      summary.byUser[error.user] = (summary.byUser[error.user] || 0) + 1;
    }
  });

  // Find top 10 most frequent errors
  const messageEntries = [];
  for (let key in summary.byMessage) {
    if (summary.byMessage.hasOwnProperty(key)) {
      messageEntries.push({
        message: summary.byMessage[key].fullMessage,
        count: summary.byMessage[key].count,
        category: summary.byMessage[key].category,
        lastSeen: summary.byMessage[key].lastSeen
      });
    }
  }
  messageEntries.sort(function(a, b) { return b.count - a.count; });
  summary.topErrors = messageEntries.slice(0, 10);

  return summary;
}

/**
 * Display log search results in a new sheet.
 * Log result display functionality
 *
 * @param {Array<Object>} logs - Array of log entries from searchLogs()
 * @param {string} [sheetName] - Name for results sheet (default: 'Log_Search_Results')
 * @return {Sheet} The created sheet
 *
 * @example
 * const logs = searchLogs({ level: 'ERROR', limit: 50 });
 * displayLogsInSheet(logs, 'Recent_Errors');
 */
function displayLogsInSheet(logs, sheetName) {
  if (!logs || logs.length === 0) {
    throw new Error('No logs to display');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultSheetName = sheetName || 'Log_Search_Results';

  // Delete existing results sheet if present
  let resultSheet = ss.getSheetByName(resultSheetName);
  if (resultSheet) {
    ss.deleteSheet(resultSheet);
  }

  // Create new results sheet
  resultSheet = ss.insertSheet(resultSheetName);

  // Write header row
  const headers = ['Timestamp', 'Level', 'Category', 'User', 'Message', 'Details'];
  resultSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  resultSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');

  // Write data rows
  const rows = logs.map(function(log) {
    return [
      log.timestamp,
      log.level,
      log.category,
      log.user,
      log.message,
      log.details || ''
    ];
  });

  if (rows.length > 0) {
    resultSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  // Auto-resize columns
  for (let i = 1; i <= headers.length; i++) {
    resultSheet.autoResizeColumn(i);
  }

  // Freeze header row
  resultSheet.setFrozenRows(1);

  // Add filter to header row
  resultSheet.getRange(1, 1, 1, headers.length).createFilter();

  // Format level column with conditional colors
  if (rows.length > 0) {
    const levelRange = resultSheet.getRange(2, 2, rows.length, 1);
    const levelValues = levelRange.getValues();
    const backgrounds = levelValues.map(function(row) {
      switch (row[0]) {
        case 'ERROR': return ['#f4cccc'];
        case 'WARN': return ['#fff2cc'];
        case 'INFO': return ['#d9ead3'];
        case 'VERBOSE': return ['#cfe2f3'];
        default: return ['#ffffff'];
      }
    });
    levelRange.setBackgrounds(backgrounds);
  }

  // Activate the results sheet
  ss.setActiveSheet(resultSheet);

  try {
    UnifiedLogger.info(LOG_SEARCHER_CATEGORY, 'Log search results displayed', {
      sheetName: resultSheetName,
      resultCount: logs.length
    });
  } catch (ignore) {
      console.error('[LogSearcher] Error:', ignore.message, ignore.stack);
    }

  return resultSheet;
}

/**
 * Show interactive log search dialog.
 * Interactive search UI
 *
 * @example
 * promptLogSearch(); // Shows dialog
 */
function promptLogSearch() {
  const ui = SpreadsheetApp.getUi();

  // Build search dialog
  const htmlTemplate = HtmlService.createHtmlOutput(
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<base target="_top">' +
    '<style>' +
    'body { font-family: Arial, sans-serif; padding: 20px; }' +
    'label { display: block; margin-top: 10px; font-weight: bold; }' +
    'input, select { width: 100%; padding: 5px; margin-top: 5px; box-sizing: border-box; }' +
    'button { margin-top: 20px; padding: 10px 20px; background: #4285f4; color: white; border: none; cursor: pointer; font-size: 14px; }' +
    'button:hover { background: #357ae8; }' +
    '.help { font-size: 11px; color: #666; margin-top: 2px; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<h2>Search System Logs</h2>' +
    '<form id="searchForm">' +
    '<label>Log Level:</label>' +
    '<select id="level">' +
    '<option value="">All Levels</option>' +
    '<option value="ERROR">ERROR</option>' +
    '<option value="WARN">WARN</option>' +
    '<option value="INFO">INFO</option>' +
    '<option value="VERBOSE">VERBOSE</option>' +
    '</select>' +
    '<label>Category:</label>' +
    '<input type="text" id="category" placeholder="e.g., XeroAuth, Config, VectorStore">' +
    '<div class="help">Leave blank to search all categories</div>' +
    '<label>Message Contains:</label>' +
    '<input type="text" id="messageContains" placeholder="Search text in message">' +
    '<label>Correlation ID:</label>' +
    '<input type="text" id="correlationId" placeholder="Trace a specific operation">' +
    '<div class="help">Use to trace a complete operation end-to-end</div>' +
    '<label>Time Range (hours):</label>' +
    '<input type="number" id="hours" value="24" min="1" max="720">' +
    '<div class="help">How many hours to look back (1-720)</div>' +
    '<label>Max Results:</label>' +
    '<input type="number" id="limit" value="100" min="1" max="10000">' +
    '<button type="button" onclick="performSearch()">Search Logs</button>' +
    '</form>' +
    '<script>' +
    'function performSearch() {' +
    '  const level = document.getElementById("level").value;' +
    '  const category = document.getElementById("category").value;' +
    '  const messageContains = document.getElementById("messageContains").value;' +
    '  const correlationId = document.getElementById("correlationId").value;' +
    '  const hours = parseInt(document.getElementById("hours").value) || 24;' +
    '  const limit = parseInt(document.getElementById("limit").value) || 100;' +
    '  google.script.run' +
    '    .withSuccessHandler(function(count) {' +
    '      alert("Search complete! Found " + count + " results. Check the Log_Search_Results sheet.");' +
    '      google.script.host.close();' +
    '    })' +
    '    .withFailureHandler(function(error) {' +
    '      alert("Search failed: " + error.message);' +
    '    })' +
    '    .executeLogSearch({' +
    '      level: level,' +
    '      category: category,' +
    '      messageContains: messageContains,' +
    '      correlationId: correlationId,' +
    '      hours: hours,' +
    '      limit: limit' +
    '    });' +
    '}' +
    '</script>' +
    '</body>' +
    '</html>'
  );

  htmlTemplate.setWidth(450).setHeight(550);
  ui.showModalDialog(htmlTemplate, '🔍 Search System Logs');
}

/**
 * Execute log search from UI (called by promptLogSearch dialog).
 * @param {Object} options - Search parameters from dialog
 * @return {number} Number of results found
 */
function executeLogSearch(options) {
  const opts = options || {};

  // Build search criteria
  const searchCriteria = {
    limit: opts.limit || 100
  };

  if (opts.level) {
    searchCriteria.level = opts.level;
  }

  if (opts.category) {
    searchCriteria.category = opts.category;
  }

  if (opts.messageContains) {
    searchCriteria.messageContains = opts.messageContains;
  }

  if (opts.correlationId) {
    searchCriteria.correlationId = opts.correlationId;
  }

  if (opts.hours && opts.hours > 0) {
    const startTime = new Date(new Date().getTime() - (opts.hours * 60 * 60 * 1000));
    searchCriteria.startTime = startTime;
  }

  // Perform search
  const results = searchLogs(searchCriteria);

  // Display results in sheet
  if (results.length > 0) {
    displayLogsInSheet(results);
  }

  try {
    UnifiedLogger.info(LOG_SEARCHER_CATEGORY, 'Log search executed from UI', {
      criteria: searchCriteria,
      resultCount: results.length
    });
  } catch (ignore) {
      console.error('[LogSearcher] Error:', ignore.message, ignore.stack);
    }

  return results.length;
}


// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    searchLogs: searchLogs,
    getLogsByCorrelationId: getLogsByCorrelationId,
    getRecentErrors: getRecentErrors,
    getRecentWarnings: getRecentWarnings,
    getLogStatistics: getLogStatistics,
    generateErrorSummary: generateErrorSummary,
    displayLogsInSheet: displayLogsInSheet,
    promptLogSearch: promptLogSearch,
    executeLogSearch: executeLogSearch
  };
}

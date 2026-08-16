/**
 * LogSearcher Helper Functions for Menu Integration
 * Menu Integration
 * Contract: CSR-2026-001-B
 */

/**
 * Search by correlation ID (interactive dialog)
 */
function promptSearchByCorrelationId() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    'Search by Correlation ID',
    'Enter correlation ID:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const correlationId = response.getResponseText().trim();
  if (!correlationId) {
    ui.alert(
      'Invalid Input',
      'Please enter a correlation ID.',
      ui.ButtonSet.OK
    );
    return;
  }

  const results = getLogsByCorrelationId(correlationId);

  if (results.length === 0) {
    ui.alert(
      'No Results',
      'No logs found with correlation ID: ' + correlationId,
      ui.ButtonSet.OK
    );
    return;
  }

  displayLogsInSheet(results, 'Trace_' + correlationId.substring(0, 8));
}

/**
 * Show recent errors (1 hour)
 */
function showRecentErrors1Hour() {
  const errors = getRecentErrors(1, 50);

  if (errors.length === 0) {
    SpreadsheetApp.getUi().alert(
      'No Errors',
      'No errors found in the last hour.\n\n✅ System is healthy!',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  displayLogsInSheet(errors, 'Recent_Errors_1h');
}

/**
 * Show recent errors (24 hours)
 */
function showRecentErrors24Hours() {
  const errors = getRecentErrors(24, 200);

  if (errors.length === 0) {
    SpreadsheetApp.getUi().alert(
      'No Errors',
      'No errors found in the last 24 hours.\n\n✅ System is healthy!',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  displayLogsInSheet(errors, 'Recent_Errors_24h');
}

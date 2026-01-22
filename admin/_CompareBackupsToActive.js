/**
 * Compare Backup Sheets to Active Sheets
 *
 * Purpose: Check if current sheets have >= data than backups
 * This prevents accidental data loss
 */

/**
 * Compare all backup sheets to their active counterparts
 * @return {Object} Comparison report
 */
function compareBackupsToActive() {
  const trace = UnifiedLogger.startTrace('CompareBackups', 'compareBackupsToActive');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();

    const report = {
      timestamp: new Date().toISOString(),
      safeToDelete: [],
      WARNING_LARGER_BACKUPS: [],
      activeSheets: {},
      backupGroups: {}
    };

    // First, catalog all sheets
    sheets.forEach(function(sheet) {
      const name = sheet.getName();
      const rowCount = sheet.getLastRow();

      // Check if it's a backup
      if (isBackupSheet(name)) {
        const baseName = extractBaseName(name);
        if (!report.backupGroups[baseName]) {
          report.backupGroups[baseName] = [];
        }
        report.backupGroups[baseName].push({
          name: name,
          rows: rowCount,
          timestamp: extractBackupTimestamp(name)
        });
      } else {
        // Active sheet
        report.activeSheets[name] = {
          name: name,
          rows: rowCount
        };
      }
    });

    // Compare each backup group to active sheet
    Object.keys(report.backupGroups).forEach(function(baseName) {
      const backups = report.backupGroups[baseName];
      const activeSheet = report.activeSheets[baseName];

      if (!activeSheet) {
        console.log('⚠️ WARNING: No active sheet for: ' + baseName);
        console.log('  Backups exist but active sheet missing!');
        report.WARNING_LARGER_BACKUPS.push({
          baseName: baseName,
          reason: 'Active sheet missing',
          backupCount: backups.length,
          maxBackupRows: Math.max.apply(null, backups.map(function(b) { return b.rows; }))
        });
        return;
      }

      // Find largest backup
      const maxBackupRows = Math.max.apply(null, backups.map(function(b) { return b.rows; }));
      const activeRows = activeSheet.rows;

      if (maxBackupRows > activeRows) {
        // DANGER: Backup has more data than active sheet
        console.log('🚨 DANGER: "' + baseName + '"');
        console.log('  Active sheet: ' + activeRows + ' rows');
        console.log('  Largest backup: ' + maxBackupRows + ' rows');
        console.log('  → Backup has ' + (maxBackupRows - activeRows) + ' MORE rows!');
        console.log('');

        report.WARNING_LARGER_BACKUPS.push({
          baseName: baseName,
          activeRows: activeRows,
          maxBackupRows: maxBackupRows,
          difference: maxBackupRows - activeRows,
          backupCount: backups.length
        });
      } else {
        // Safe: Active sheet has >= rows
        console.log('✅ SAFE: "' + baseName + '"');
        console.log('  Active: ' + activeRows + ' rows, Largest backup: ' + maxBackupRows + ' rows');

        report.safeToDelete.push({
          baseName: baseName,
          activeRows: activeRows,
          maxBackupRows: maxBackupRows,
          backupCount: backups.length
        });
      }
    });

    // Summary
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    COMPARISON SUMMARY                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('✅ Safe to delete: ' + report.safeToDelete.length + ' backup groups');
    console.log('🚨 WARNINGS: ' + report.WARNING_LARGER_BACKUPS.length + ' backup groups');
    console.log('');

    if (report.WARNING_LARGER_BACKUPS.length > 0) {
      console.log('⚠️ DO NOT DELETE ALL BACKUPS!');
      console.log('');
      console.log('These backups have MORE data than active sheets:');
      report.WARNING_LARGER_BACKUPS.forEach(function(item) {
        console.log('  - ' + item.baseName + ': ' + item.maxBackupRows + ' rows in backup vs ' + (item.activeRows || 0) + ' in active');
      });
      console.log('');
      console.log('RECOMMENDATION: Review these sheets manually before deleting.');
    } else {
      console.log('✅ ALL BACKUPS ARE SAFE TO DELETE!');
      console.log('');
      console.log('Active sheets have >= data than all backups.');
      console.log('You can safely run: deleteAllBackupSheetsConfirmed()');
    }

    trace.complete('compareBackupsToActive completed', {
      safeToDelete: report.safeToDelete.length,
      warnings: report.WARNING_LARGER_BACKUPS.length
    });

    return report;

  } catch (error) {
    trace.fail('compareBackupsToActive failed', error);
    console.error('Comparison failed: ' + error.message);
    throw error;
  }
}

/**
 * Check if sheet name is a backup
 */
function isBackupSheet(name) {
  const nameLower = name.toLowerCase();
  if (nameLower.indexOf('backup') !== -1 && /\d{8}_\d{6}/.test(name)) {
    return true;
  }
  if (/\(\d+\)$/.test(name)) {
    return true;
  }
  if (nameLower.indexOf('copy of') !== -1) {
    return true;
  }
  return false;
}

/**
 * Extract base name from backup sheet
 * "Config: Resource Catalog Backup 20251223_012003" → "Config: Resource Catalog"
 */
function extractBaseName(name) {
  // Remove " Backup YYYYMMDD_HHMMSS"
  const backup = name.replace(/ Backup \d{8}_\d{6}.*$/, '');

  // Remove " (N)"
  const numbered = backup.replace(/ \(\d+\)$/, '');

  // Remove "Copy of "
  const copied = numbered.replace(/^Copy of /, '');

  return copied;
}

/**
 * Extract timestamp from backup name
 */
function extractBackupTimestamp(name) {
  const match = name.match(/Backup (\d{8})_(\d{6})/);
  if (!match) {
    return null;
  }

  const dateStr = match[1];
  const timeStr = match[2];

  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(timeStr.substring(0, 2));
  const minute = parseInt(timeStr.substring(2, 4));
  const second = parseInt(timeStr.substring(4, 6));

  return new Date(year, month, day, hour, minute, second);
}

/**
 * Cleanup Backup Sheets - Remove debugging backup sheets
 *
 * Purpose: Delete all backup sheets created during debugging/development
 *
 * Usage:
 * 1. Run identifyBackupSheets() to see what will be deleted
 * 2. Run deleteAllBackupSheets() to actually delete them
 */

/**
 * Identify all backup sheets without deleting them
 * @return {Object} Summary of backup sheets found
 */
function identifyBackupSheets() {
  const trace = UnifiedLogger.startTrace('CleanupBackupSheets', 'identifyBackupSheets');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();

    const backupSheets = [];
    const activeSheets = [];

    sheets.forEach(function(sheet) {
      const name = sheet.getName();

      // Check if it's a backup sheet
      if (isBackupSheet(name)) {
        backupSheets.push({
          name: name,
          index: sheet.getIndex(),
          rowCount: sheet.getLastRow(),
          isHidden: sheet.isSheetHidden()
        });
      } else {
        activeSheets.push(name);
      }
    });

    // Log results
    console.log('=== BACKUP SHEET IDENTIFICATION ===');
    console.log('');
    console.log('Total Sheets: ' + sheets.length);
    console.log('Backup Sheets: ' + backupSheets.length);
    console.log('Active Sheets: ' + activeSheets.length);
    console.log('');
    console.log('--- BACKUP SHEETS TO DELETE ---');
    backupSheets.forEach(function(sheet) {
      console.log('  - ' + sheet.name + ' (' + sheet.rowCount + ' rows)');
    });
    console.log('');
    console.log('--- ACTIVE SHEETS TO KEEP ---');
    activeSheets.slice(0, 20).forEach(function(name) {
      console.log('  - ' + name);
    });
    if (activeSheets.length > 20) {
      console.log('  ... and ' + (activeSheets.length - 20) + ' more');
    }
    console.log('');
    console.log('To delete backup sheets, run: deleteAllBackupSheets()');

    trace.complete('identifyBackupSheets completed', {
      totalSheets: sheets.length,
      backupSheets: backupSheets.length,
      activeSheets: activeSheets.length
    });

    return {
      totalSheets: sheets.length,
      backupSheets: backupSheets,
      activeSheets: activeSheets
    };

  } catch (error) {
    trace.fail('identifyBackupSheets failed', error);
    console.error('Identification failed: ' + error.message);
    throw error;
  }
}

/**
 * DELETE ALL BACKUP SHEETS - NO CONFIRMATION REQUIRED
 * Run this function from the dropdown to delete all backups
 * @return {Object} Summary of deletion
 */
function deleteAllBackupSheetsConfirmed() {
  console.log('🗑️ DELETING ALL BACKUP SHEETS (NO UNDO)...');
  console.log('');
  return deleteAllBackupSheets(true);
}

/**
 * Delete all backup sheets (requires confirmation)
 * @param {boolean} confirmed - Pass true to actually delete
 * @return {Object} Summary of deletion
 */
function deleteAllBackupSheets(confirmed) {
  const trace = UnifiedLogger.startTrace('CleanupBackupSheets', 'deleteAllBackupSheets');

  try {
    if (confirmed !== true) {
      console.log('⚠️ SAFETY CHECK: This will delete all backup sheets!');
      console.log('');
      console.log('To confirm deletion, run:');
      console.log('  deleteAllBackupSheets(true)');
      console.log('');
      console.log('Or run identifyBackupSheets() first to see what will be deleted.');
      return { status: 'cancelled', reason: 'confirmation required' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();

    const backupSheets = [];
    const failedDeletions = [];

    // Identify backup sheets
    sheets.forEach(function(sheet) {
      const name = sheet.getName();
      if (isBackupSheet(name)) {
        backupSheets.push(sheet);
      }
    });

    console.log('=== DELETING BACKUP SHEETS ===');
    console.log('Found ' + backupSheets.length + ' backup sheets to delete');
    console.log('');

    // Delete them
    let deletedCount = 0;
    backupSheets.forEach(function(sheet) {
      try {
        const name = sheet.getName();
        console.log('Deleting: ' + name);
        ss.deleteSheet(sheet);
        deletedCount++;
      } catch (error) {
        failedDeletions.push({
          name: sheet.getName(),
          error: error.message
        });
        console.error('Failed to delete ' + sheet.getName() + ': ' + error.message);
      }
    });

    console.log('');
    console.log('=== DELETION COMPLETE ===');
    console.log('Deleted: ' + deletedCount + ' sheets');
    console.log('Failed: ' + failedDeletions.length + ' sheets');
    console.log('Remaining sheets: ' + ss.getSheets().length);

    if (failedDeletions.length > 0) {
      console.log('');
      console.log('Failed deletions:');
      failedDeletions.forEach(function(fail) {
        console.log('  - ' + fail.name + ': ' + fail.error);
      });
    }

    trace.complete('deleteAllBackupSheets completed', {
      deleted: deletedCount,
      failed: failedDeletions.length,
      remainingSheets: ss.getSheets().length
    });

    return {
      status: 'completed',
      deleted: deletedCount,
      failed: failedDeletions.length,
      failedDeletions: failedDeletions,
      remainingSheets: ss.getSheets().length
    };

  } catch (error) {
    trace.fail('deleteAllBackupSheets failed', error);
    console.error('Deletion failed: ' + error.message);
    throw error;
  }
}

/**
 * DELETE OLD BACKUP SHEETS - Before December 2025
 * Run this function from the dropdown to delete old backups only
 * @return {Object} Summary of deletion
 */
function deleteOldBackupSheets() {
  console.log('🗑️ DELETING BACKUPS BEFORE 2025-12-01...');
  console.log('');
  return deleteBackupSheetsByDate("2025-12-01", true);
}

/**
 * Delete backup sheets by date range
 * @param {string} beforeDate - Date string in YYYY-MM-DD format
 * @param {boolean} confirmed - Pass true to actually delete
 * @return {Object} Summary of deletion
 */
function deleteBackupSheetsByDate(beforeDate, confirmed) {
  const trace = UnifiedLogger.startTrace('CleanupBackupSheets', 'deleteBackupSheetsByDate');

  try {
    if (!beforeDate) {
      console.log('⚠️ You must specify a date!');
      console.log('');
      console.log('Example: Delete all backups before 2025-12-25:');
      console.log('  deleteBackupSheetsByDate("2025-12-25", true)');
      return { status: 'cancelled', reason: 'date not specified' };
    }

    if (confirmed !== true) {
      console.log('⚠️ SAFETY CHECK: This will delete backup sheets before ' + beforeDate);
      console.log('');
      console.log('To confirm, run:');
      console.log('  deleteBackupSheetsByDate("' + beforeDate + '", true)');
      return { status: 'cancelled', reason: 'confirmation required' };
    }

    const cutoffDate = new Date(beforeDate);
    if (isNaN(cutoffDate.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();

    const sheetsToDelete = [];
    const sheetsToKeep = [];

    sheets.forEach(function(sheet) {
      const name = sheet.getName();
      if (isBackupSheet(name)) {
        const timestamp = extractBackupTimestamp(name);
        if (timestamp && timestamp < cutoffDate) {
          sheetsToDelete.push(sheet);
        } else {
          sheetsToKeep.push(name);
        }
      }
    });

    console.log('=== DELETING BACKUP SHEETS BEFORE ' + options.before + ' ===');
    console.log('Found ' + sheetsToDelete.length + ' backup sheets to delete');
    console.log('Keeping ' + sheetsToKeep.length + ' newer backup sheets');
    console.log('');

    let deletedCount = 0;
    sheetsToDelete.forEach(function(sheet) {
      try {
        console.log('Deleting: ' + sheet.getName());
        ss.deleteSheet(sheet);
        deletedCount++;
      } catch (error) {
        console.error('Failed to delete ' + sheet.getName() + ': ' + error.message);
      }
    });

    console.log('');
    console.log('=== DELETION COMPLETE ===');
    console.log('Deleted: ' + deletedCount + ' sheets');
    console.log('Remaining sheets: ' + ss.getSheets().length);

    trace.complete('deleteBackupSheetsByDate completed', { deleted: deletedCount });

    return {
      status: 'completed',
      deleted: deletedCount,
      kept: sheetsToKeep.length,
      remainingSheets: ss.getSheets().length
    };

  } catch (error) {
    trace.fail('deleteBackupSheetsByDate failed', error);
    console.error('Deletion failed: ' + error.message);
    throw error;
  }
}

/**
 * Check if a sheet name is a backup sheet
 * @param {string} name - Sheet name
 * @return {boolean} True if it's a backup sheet
 */
function isBackupSheet(name) {
  const nameLower = name.toLowerCase();

  // Pattern: "Backup YYYYMMDD_HHMMSS"
  if (nameLower.indexOf('backup') !== -1 && /\d{8}_\d{6}/.test(name)) {
    return true;
  }

  // Pattern: "Sheet Name (1)", "Sheet Name (2)" - duplicates created by copyTo
  if (/\(\d+\)$/.test(name)) {
    return true;
  }

  // Pattern: "Copy of ..."
  if (nameLower.indexOf('copy of') !== -1) {
    return true;
  }

  return false;
}

/**
 * Extract timestamp from backup sheet name
 * @param {string} name - Sheet name
 * @return {Date|null} Parsed date or null
 */
function extractBackupTimestamp(name) {
  // Pattern: "Backup YYYYMMDD_HHMMSS"
  const match = name.match(/Backup (\d{8})_(\d{6})/);
  if (!match) {
    return null;
  }

  const dateStr = match[1]; // YYYYMMDD
  const timeStr = match[2]; // HHMMSS

  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1; // 0-indexed
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(timeStr.substring(0, 2));
  const minute = parseInt(timeStr.substring(2, 4));
  const second = parseInt(timeStr.substring(4, 6));

  return new Date(year, month, day, hour, minute, second);
}

/**
 * Interactive cleanup with preview
 */
function cleanupBackupSheetsInteractive() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           BACKUP SHEET CLEANUP - INTERACTIVE MODE              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const result = identifyBackupSheets();

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    CLEANUP OPTIONS                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Option 1: Delete ALL backup sheets');
  console.log('  → Select function: deleteAllBackupSheetsConfirmed');
  console.log('  → Click Run');
  console.log('');
  console.log('Option 2: Delete only old backups (before Dec 2025)');
  console.log('  → Select function: deleteOldBackupSheets');
  console.log('  → Click Run');
  console.log('');
  console.log('Option 3: Keep analyzing');
  console.log('  → Select function: identifyBackupSheets');
  console.log('  → Click Run');
  console.log('');

  return result;
}

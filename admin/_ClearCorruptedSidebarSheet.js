/**
 * _ClearCorruptedSidebarSheet - Clear corrupted sidebar state from SHEET
 *
 * Purpose:
 * - Properties are empty, data is in _AI_SIDEBAR_STATE sheet
 * - Clear corrupted/old sheet data causing JSON parse errors
 * - Fresh start for sidebar state storage
 *
 * Usage:
 * Run clearSidebarSheet() to delete all sidebar state sheet data
 *
 * @version 1.0.0
 * @since 2026-01-17
 */

const SIDEBAR_SHEET_NAME = '_AI_SIDEBAR_STATE';

function clearSidebarSheet() {
  console.log('=== Clearing Sidebar State Sheet ===\n');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SIDEBAR_SHEET_NAME);

    if (!sheet) {
      console.log('✅ Sheet "' + SIDEBAR_SHEET_NAME + '" does not exist - nothing to clear');
      return {
        found: false,
        cleared: 0
      };
    }

    const lastRow = sheet.getLastRow();
    console.log('Found sheet with ' + lastRow + ' rows');

    if (lastRow <= 1) {
      console.log('✅ Sheet is empty (header row only) - nothing to clear');
      return {
        found: true,
        cleared: 0
      };
    }

    // Delete all data rows (keep header)
    const dataRows = lastRow - 1;
    sheet.deleteRows(2, dataRows);

    console.log('\n✅ Cleared ' + dataRows + ' rows from ' + SIDEBAR_SHEET_NAME);
    console.log('Sheet now has only header row');
    console.log('Next sidebar load will create fresh state');

    return {
      found: true,
      cleared: dataRows
    };

  } catch (error) {
    console.error('❌ Error clearing sheet:', error.message);
    return {
      found: false,
      cleared: 0,
      error: error.message
    };
  }
}

/**
 * List current sidebar sheet contents (diagnostic)
 */
function listSidebarSheetContents() {
  console.log('=== Sidebar State Sheet Contents ===\n');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SIDEBAR_SHEET_NAME);

    if (!sheet) {
      console.log('Sheet "' + SIDEBAR_SHEET_NAME + '" does not exist');
      return;
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    console.log('Sheet: ' + SIDEBAR_SHEET_NAME);
    console.log('Rows: ' + lastRow);
    console.log('Columns: ' + lastCol);
    console.log('');

    if (lastRow === 0) {
      console.log('Sheet is completely empty');
      return;
    }

    // Show header
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    console.log('Headers: ' + headers.join(' | '));
    console.log('');

    if (lastRow === 1) {
      console.log('Sheet has only header row');
      return;
    }

    // Show first 5 rows of data
    const previewRows = Math.min(5, lastRow - 1);
    const data = sheet.getRange(2, 1, previewRows, lastCol).getValues();

    console.log('First ' + previewRows + ' data rows:\n');
    data.forEach(function(row, idx) {
      console.log('Row ' + (idx + 2) + ':');
      row.forEach(function(cell, cellIdx) {
        const header = headers[cellIdx];
        const value = typeof cell === 'string' ? cell.substring(0, 100) : String(cell);
        console.log('  ' + header + ': ' + value);
      });
      console.log('');
    });

  } catch (error) {
    console.error('Error reading sheet:', error.message);
  }
}

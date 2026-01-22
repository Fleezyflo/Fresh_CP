/**
 * Diagnose malformed JSON in Config: Brief Profiles sheet
 *
 * Scans each row and identifies JSON parsing errors with exact positions
 */

function diagnoseBriefProfileJSON() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config: Brief Profiles');

  if (!sheet) {
    console.log('❌ Sheet "Config: Brief Profiles" not found');
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  console.log(`Scanning ${lastRow} rows in "Config: Brief Profiles"...`);
  console.log('');

  const errors = [];
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  values.forEach((row, index) => {
    const rowNum = index + 1;

    // Check each cell in the row for JSON-like content
    row.forEach((cell, colIndex) => {
      const colLetter = String.fromCharCode(65 + colIndex); // A, B, C, etc.
      const cellValue = String(cell || '').trim();

      // Skip empty cells or cells that don't look like JSON
      if (!cellValue || cellValue.length < 2) return;
      if (!cellValue.startsWith('{') && !cellValue.startsWith('[')) return;

      // Try to parse
      try {
        JSON.parse(cellValue);
        // Success - no error
      } catch (error) {
        // Extract position from error message
        const match = error.message.match(/position (\d+)/);
        const position = match ? parseInt(match[1]) : null;

        let preview = cellValue;
        let errorContext = '';

        if (position !== null && position < cellValue.length) {
          const start = Math.max(0, position - 50);
          const end = Math.min(cellValue.length, position + 50);
          const beforeError = cellValue.substring(start, position);
          const atError = cellValue.charAt(position);
          const afterError = cellValue.substring(position + 1, end);

          errorContext = `...${beforeError}⚠️[${atError}]${afterError}...`;
        }

        errors.push({
          cell: `${colLetter}${rowNum}`,
          row: rowNum,
          col: colLetter,
          error: error.message,
          position: position,
          length: cellValue.length,
          preview: cellValue.substring(0, 100) + (cellValue.length > 100 ? '...' : ''),
          errorContext: errorContext
        });
      }
    });
  });

  // Report findings
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          CONFIG: BRIEF PROFILES - JSON DIAGNOSTIC             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (errors.length === 0) {
    console.log('✅ No JSON errors found!');
    console.log('All JSON in the sheet is valid.');
  } else {
    console.log(`❌ Found ${errors.length} JSON parsing error(s):\n`);

    errors.forEach((err, idx) => {
      console.log(`Error ${idx + 1}:`);
      console.log(`  Cell: ${err.cell}`);
      console.log(`  Error: ${err.error}`);
      console.log(`  Content length: ${err.length} characters`);
      console.log(`  Preview: ${err.preview}`);
      if (err.errorContext) {
        console.log(`  Error location: ${err.errorContext}`);
      }
      console.log('');
    });

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      HOW TO FIX                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('For each error above:');
    console.log('1. Go to the cell listed (e.g., B5)');
    console.log('2. Look for the character marked with ⚠️ in the error location');
    console.log('3. Common issues:');
    console.log('   - Extra characters after closing } or ]');
    console.log('   - Missing quotes around property names');
    console.log('   - Trailing commas in objects/arrays');
    console.log('   - Single quotes instead of double quotes');
    console.log('4. Fix the JSON and run this diagnostic again');
  }

  return {
    totalRows: lastRow,
    totalErrors: errors.length,
    errors: errors
  };
}

/**
 * Auto-fix common JSON issues in Brief Profiles sheet
 * WARNING: This modifies the sheet! Review changes after running.
 */
function autoFixBriefProfileJSON() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config: Brief Profiles');

  if (!sheet) {
    console.log('❌ Sheet "Config: Brief Profiles" not found');
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  console.log('🔧 Auto-fixing JSON issues...');
  console.log('');

  let fixCount = 0;
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  values.forEach((row, index) => {
    const rowNum = index + 1;

    row.forEach((cell, colIndex) => {
      const cellValue = String(cell || '').trim();

      if (!cellValue || cellValue.length < 2) return;
      if (!cellValue.startsWith('{') && !cellValue.startsWith('[')) return;

      // Try to parse - if it fails, try to fix
      try {
        JSON.parse(cellValue);
      } catch (error) {
        console.log(`Attempting to fix cell ${String.fromCharCode(65 + colIndex)}${rowNum}...`);

        let fixed = cellValue;

        // Common fix: Remove trailing non-JSON characters
        // Find the last } or ]
        let lastBrace = Math.max(fixed.lastIndexOf('}'), fixed.lastIndexOf(']'));
        if (lastBrace > 0 && lastBrace < fixed.length - 1) {
          const afterBrace = fixed.substring(lastBrace + 1).trim();
          if (afterBrace) {
            console.log(`  Removing trailing characters: "${afterBrace}"`);
            fixed = fixed.substring(0, lastBrace + 1);
          }
        }

        // Try to parse the fixed version
        try {
          JSON.parse(fixed);
          console.log(`  ✅ Fixed! Writing back to sheet.`);
          sheet.getRange(rowNum, colIndex + 1).setValue(fixed);
          fixCount++;
        } catch (stillBroken) {
          console.log(`  ❌ Could not auto-fix. Manual intervention required.`);
          console.log(`     Error: ${stillBroken.message}`);
        }
      }
    });
  });

  console.log('');
  console.log(`✅ Auto-fix complete. Fixed ${fixCount} cell(s).`);
  console.log('');
  console.log('Run diagnoseBriefProfileJSON() again to verify all issues are resolved.');
}

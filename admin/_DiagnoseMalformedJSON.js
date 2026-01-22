/**
 * Diagnostic: Find rows with malformed JSON in Config: Scope Phases
 *
 * Run this function from Apps Script editor to identify which rows have invalid JSON
 */
function diagnoseMalformedJSON() {
  console.log('=== MALFORMED JSON DIAGNOSTIC ===\n');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Config: Scope Phases');

    if (!sheet) {
      console.log('❌ Sheet "Config: Scope Phases" not found');
      return;
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Find taxonomyHintJSON column index
    const jsonColIndex = headers.findIndex(h => String(h).toLowerCase().includes('taxonomyhintjson'));

    if (jsonColIndex === -1) {
      console.log('❌ taxonomyHintJSON column not found');
      console.log('   Available columns: ' + headers.join(', '));
      return;
    }

    console.log('✅ Found taxonomyHintJSON at column ' + (jsonColIndex + 1));
    console.log('   Checking ' + (data.length - 1) + ' rows...\n');

    let validCount = 0;
    let invalidCount = 0;
    const invalidRows = [];

    // Check each row (skip header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const jsonValue = row[jsonColIndex];
      const briefType = row[0]; // Assuming briefType is first column
      const phaseId = row[1];   // Assuming phaseId is second column

      // Skip empty cells
      if (!jsonValue || String(jsonValue).trim() === '') {
        validCount++;
        continue;
      }

      // Try to parse JSON
      try {
        JSON.parse(jsonValue);
        validCount++;
      } catch (error) {
        invalidCount++;
        invalidRows.push({
          row: i + 1, // +1 for 1-indexed row number
          briefType: briefType,
          phaseId: phaseId,
          jsonValue: String(jsonValue).substring(0, 100) + '...', // First 100 chars
          error: error.message
        });
      }
    }

    console.log('RESULTS:');
    console.log('✅ Valid rows: ' + validCount);
    console.log('❌ Invalid rows: ' + invalidCount + '\n');

    if (invalidCount > 0) {
      console.log('INVALID ROWS (fix these):');
      invalidRows.forEach(function(item) {
        console.log('\n📍 Row ' + item.row + ':');
        console.log('   briefType: ' + item.briefType);
        console.log('   phaseId: ' + item.phaseId);
        console.log('   Error: ' + item.error);
        console.log('   Value preview: ' + item.jsonValue);
      });

      console.log('\n\n🔧 HOW TO FIX:');
      console.log('1. Go to row numbers listed above');
      console.log('2. Check taxonomyHintJSON column');
      console.log('3. Common fixes:');
      console.log('   - Remove trailing commas: {"key": "value",} → {"key": "value"}');
      console.log('   - Use double quotes: {\'key\': \'value\'} → {"key": "value"}');
      console.log('   - Fix smart quotes: {"key": "value"} → {"key": "value"}');
      console.log('   - Remove line breaks inside JSON');
      console.log('   - Validate with https://jsonlint.com/');
    } else {
      console.log('✅ All rows have valid JSON!');
    }

  } catch (error) {
    console.log('❌ Diagnostic failed: ' + error.message);
    console.log('   Stack: ' + error.stack);
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

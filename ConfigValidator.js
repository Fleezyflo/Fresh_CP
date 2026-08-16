/**
 * ConfigValidator - Flexible header and data validation
 * Header Validation (Presence, not Order)
 * @version 1.0
 */

const ConfigValidator = (function() {

  /**
   * Validate sheet headers (PRESENCE not ORDER)
   * @param {Sheet} sheet
   * @param {Array<string>} requiredColumns - List of required column names
   * @returns {Object} - {valid, error, context, columnMap}
   */
  function validateHeaders(sheet, requiredColumns) {
    const result = {
      valid: false,
      error: null,
      context: {},
      columnMap: {}
    };

    try {
      // Get ALL headers (not just first N)
      const lastCol = sheet.getLastColumn();
      if (lastCol < 1) {
        result.error = 'Sheet has no columns';
        result.context = { sheetName: sheet.getName() };
        return result;
      }

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

      // Build column index map (normalize header names)
      const columnMap = {};
      headers.forEach(function(header, index) {
        if (header) {  // Skip empty headers
          const normalized = normalizeHeaderKey_(header);
          if (normalized) {
            columnMap[normalized] = index + 1;  // 1-indexed for Google Sheets
          }
        }
      });

      // Check required columns PRESENT (not checking order)
      const normalizedRequired = requiredColumns.map(normalizeHeaderKey_);
      const missing = normalizedRequired.filter(function(col) {
        return !(col in columnMap);
      });

      if (missing.length > 0) {
        // Map back to original names for error message
        const missingOriginal = missing.map(function(norm) {
          const idx = normalizedRequired.indexOf(norm);
          return requiredColumns[idx];
        });

        result.error = 'Missing required columns: ' + missingOriginal.join(', ');
        result.context = {
          missingColumns: missingOriginal,
          foundColumns: Object.keys(columnMap),
          requiredColumns: requiredColumns,
          sheetName: sheet.getName()
        };
        return result;
      }

      // Success!
      result.valid = true;
      result.columnMap = columnMap;
      result.context = {
        sheetName: sheet.getName(),
        totalColumns: lastCol,
        foundColumns: Object.keys(columnMap).length
      };
      return result;

    } catch (error) {
      result.error = 'Header validation error: ' + error.message;
      result.context = {
        error: error.toString(),
        sheetName: sheet ? sheet.getName() : 'unknown'
      };
      return result;
    }
  }

  /**
   * Normalize header key (same logic as ConfigLoader)
   * @private
   */
  function normalizeHeaderKey_(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  /**
   * Read sheet data using dynamic column map
   * @param {Sheet} sheet
   * @param {Object} columnMap - From validateHeaders
   * @param {Object} schema - Column schema definition
   * @returns {Array} - Rows as objects
   */
  function readSheetData(sheet, columnMap, schema) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return [];  // No data rows
    }

    const lastColumn = sheet.getLastColumn();

    // Read ALL data
    const allData = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

    // Transform to objects using column map
    return allData.map(function(row, idx) {
      const record = { __rowNumber: idx + 2 };
      let isEmpty = true;

      // Map required columns
      schema.forEach(function(column) {
        const normalized = normalizeHeaderKey_(column.name);
        const colIndex = columnMap[normalized];

        if (colIndex === undefined) {
          // Column not found - will be caught by validateHeaders
          record[column.name] = null;
          return;
        }

        const cell = row[colIndex - 1];  // Convert to 0-indexed

        if (!(cell === '' || cell === null || typeof cell === 'undefined')) {
          isEmpty = false;
        }

        // Parse based on column type
        if (column.csv) {
          record[column.name] = parseCsv_(cell);
        } else if (column.json) {
          record[column.name] = safeParseJson_(cell, column.default || null);
        } else if (column.type === 'bool') {
          record[column.name] = normalizeBoolean_(cell, column.default || false);
        } else if (column.type === 'number') {
          const parsed = Number(cell);
          record[column.name] = isNaN(parsed) ? null : parsed;
        } else if (column.type === 'string') {
          record[column.name] = (cell === null || typeof cell === 'undefined') ? '' : String(cell).trim();
        } else {
          record[column.name] = cell;
        }
      });

      // Only return non-empty rows
      return isEmpty ? null : record;
    }).filter(Boolean);
  }

  /**
   * Helper: Parse CSV value
   * @private
   */
  function parseCsv_(value) {
    if (value === null || typeof value === 'undefined') {
      return [];
    }
    if (Array.isArray(value)) {
      return value
        .map(function(entry) { return String(entry || '').trim(); })
        .filter(Boolean);
    }
    return String(value)
      .split(/[,;\n]/)
      .map(function(entry) { return entry.trim(); })
      .filter(Boolean);
  }

  /**
   * Helper: Safe JSON parse
   * @private
   */
  function safeParseJson_(value, fallback) {
    if (value === null || typeof value === 'undefined' || value === '') {
      return fallback;
    }
    if (typeof value === 'object') {
      return value;
    }
    try {
      return JSON.parse(String(value));
    } catch (error) {
      return fallback;
    }
  }

  /**
   * Helper: Normalize boolean
   * @private
   */
  function normalizeBoolean_(value, defaultValue) {
    if (value === null || typeof value === 'undefined' || value === '') {
      return !!defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    return !!defaultValue;
  }

  /**
   * Validate data against schema rules
   * @param {Array} data
   * @param {Object} schema
   * @returns {Object} - {valid, failures, warnings}
   */
  function validateData(data, schema) {
    const result = {
      valid: true,
      failures: [],
      warnings: []
    };

    data.forEach(function(row) {
      schema.forEach(function(column) {
        const value = row[column.name];

        // Check required fields
        if (column.required) {
          const missing = value === null ||
                         typeof value === 'undefined' ||
                         value === '' ||
                         (Array.isArray(value) && value.length === 0);

          if (missing) {
            result.valid = false;
            result.failures.push({
              row: row.__rowNumber || 'unknown',
              column: column.name,
              issue: 'Required field missing'
            });
          }
        }

        // Type validation
        if (value !== null && typeof value !== 'undefined') {
          if (column.type === 'number' && typeof value !== 'number') {
            result.warnings.push({
              row: row.__rowNumber || 'unknown',
              column: column.name,
              issue: 'Expected number, got ' + typeof value
            });
          }
          if (column.type === 'bool' && typeof value !== 'boolean') {
            result.warnings.push({
              row: row.__rowNumber || 'unknown',
              column: column.name,
              issue: 'Expected boolean, got ' + typeof value
            });
          }
        }
      });
    });

    return result;
  }

  // Public API
  return {
    validateHeaders: validateHeaders,
    readSheetData: readSheetData,
    validateData: validateData
  };

})();

// ConfigValidator is already in global scope in Apps Script
// No explicit globalThis export needed

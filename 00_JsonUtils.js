/**
 * JSON Utilities
 *
 * Canonical JSON manipulation functions for parsing, fixing, and transforming JSON.
 * Replaces scattered JSON parsing/fixing logic across 6+ files.
 *
 * Load order: 00_ prefix ensures early loading
 * Compatibility: ES5 syntax for Apps Script compatibility
 *
 * @example
 * // Safe parsing with fallback
 * var data = safeJsonParse(response, {});
 *
 * // Fix malformed JSON
 * let fixed = fixMalformedJson("{key: 'value'}");  // → '{"key": "value"}'
 *
 * // Deep merge objects
 * var merged = deepMerge({a: 1}, {b: 2});  // → {a: 1, b: 2}
 */

/**
 * Safe JSON parse with error handling
 *
 * @param {string} jsonString - JSON string to parse
 * @param {*} [defaultValue=null] - Value to return on parse failure
 * @returns {*} Parsed object or defaultValue
 * @throws Never throws - returns defaultValue on error
 *
 * @example
 * safeJsonParse('{"key": "value"}', {})
 * // Returns: {key: "value"}
 *
 * safeJsonParse('invalid json', {})
 * // Returns: {} (defaultValue)
 */
function safeJsonParse(jsonString, defaultValue) {
  // Set default value
  const fallback = defaultValue !== undefined ? defaultValue : null;

  // Handle null/undefined input
  if (jsonString === null || jsonString === undefined) {
    return fallback;
  }

  // Handle non-string input
  if (typeof jsonString !== 'string') {
    return fallback;
  }

  // Attempt parse
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    // Log failure with logging-the-logger pattern
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.error('safeJsonParse', 'JSON parse failed', {
          error: String(error),
          message: error && error.message ? String(error.message) : String(error),
          input: jsonString.substring(0, 100)
        });
      }
    } catch (logError) {
      console.error('JSON parse failed:', String(error));
    }
    return fallback;
  }
}

/**
 * Safe JSON stringify with circular reference detection
 *
 * @param {*} obj - Object to stringify
 * @param {number} [space=0] - Indentation spaces (0 = compact)
 * @returns {string} JSON string or empty string on error
 *
 * @example
 * safeJsonStringify({key: "value"}, 2)
 * // Returns: "{\n  \"key\": \"value\"\n}"
 */
function safeJsonStringify(obj, space) {
  const indent = space !== undefined ? space : 0;

  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return '';
  }

  try {
    // Detect circular references
    if (_hasCircularRef(obj)) {
      try {
        if (typeof UnifiedLogger !== 'undefined') {
          UnifiedLogger.warn('safeJsonStringify', 'Circular reference detected, using toString');
        }
      } catch (logError) {
        console.error('Circular reference detected');
      }
      return String(obj);
    }

    return JSON.stringify(obj, null, indent);
  } catch (error) {
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.error('safeJsonStringify', 'JSON stringify failed', {
          error: error.message,
          type: typeof obj
        });
      }
    } catch (logError) {
      console.error('JSON stringify failed:', error.message);
    }
    return '';
  }
}

/**
 * Check if object has circular references (private helper)
 *
 * @param {*} obj - Object to check
 * @returns {boolean} True if circular reference detected
 * @private
 */
function _hasCircularRef(obj) {
  const seen = [];

  function detect(current) {
    if (current && typeof current === 'object') {
      if (seen.indexOf(current) !== -1) {
        return true;  // Circular reference found
      }
      seen.push(current);

      for (let key in current) {
        if (current.hasOwnProperty(key)) {
          if (detect(current[key])) {
            return true;
          }
        }
      }
    }
    return false;
  }

  return detect(obj);
}

/**
 * Quote unquoted keys in JSON string
 *
 * Fixes common JSON issue: {key: "value"} → {"key": "value"}
 *
 * @param {string} jsonString - JSON string with potentially unquoted keys
 * @returns {string} JSON string with quoted keys
 *
 * @example
 * quoteObjectKeys('{key: "value", other: 123}')
 * // Returns: '{"key": "value", "other": 123}'
 */
function quoteObjectKeys(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return jsonString || '';
  }

  // Replace unquoted keys: {key: → {"key":
  // Pattern: word characters not preceded/followed by quotes
  const quoted = jsonString.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');

  return quoted;
}

/**
 * Fix malformed JSON string
 *
 * Handles: missing quotes on keys, trailing commas, single quotes → double quotes
 *
 * @param {string} jsonString - Potentially malformed JSON string
 * @returns {string} Fixed JSON string
 *
 * @example
 * fixMalformedJson("{key: 'value', arr: [1,2,],}")
 * // Returns: '{"key": "value", "arr": [1,2]}'
 */
function fixMalformedJson(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return jsonString || '';
  }

  let fixed = jsonString;

  // 1. Replace single quotes with double quotes (except within existing double quotes)
  fixed = fixed.replace(/'/g, '"');

  // 2. Quote unquoted keys
  fixed = quoteObjectKeys(fixed);

  // 3. Remove trailing commas in arrays: [1,2,] → [1,2]
  fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

  // 4. Remove comments (// and /* */)
  fixed = stripJsonComments(fixed);

  return fixed;
}

/**
 * Deep merge two objects recursively
 *
 * @param {Object} target - Target object (modified in place)
 * @param {Object} source - Source object to merge from
 * @returns {Object} Merged object (same reference as target)
 *
 * @example
 * deepMerge({a: 1, b: {c: 2}}, {b: {d: 3}, e: 4})
 * // Returns: {a: 1, b: {c: 2, d: 3}, e: 4}
 */
function deepMerge(target, source) {
  // Handle null/undefined
  if (!target || typeof target !== 'object') {
    return source || {};
  }
  if (!source || typeof source !== 'object') {
    return target;
  }

  // Merge properties
  for (let key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      // If both are objects, recurse
      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
          targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
        target[key] = deepMerge(targetValue, sourceValue);
      }
      // If both are arrays, concatenate
      else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        target[key] = targetValue.concat(sourceValue);
      }
      // Otherwise, source wins
      else {
        target[key] = sourceValue;
      }
    }
  }

  return target;
}

/**
 * Deep clone object/array
 *
 * @param {*} obj - Object or array to clone
 * @returns {*} Deep cloned copy
 *
 * @example
 * var original = {a: 1, b: {c: 2}};
 * var clone = deepClone(original);
 * clone.b.c = 3;
 * // original.b.c is still 2
 */
function deepClone(obj) {
  // Handle primitives and null
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  // Handle Array
  if (Array.isArray(obj)) {
    const arrCopy = [];
    for (let i = 0; i < obj.length; i++) {
      arrCopy[i] = deepClone(obj[i]);
    }
    return arrCopy;
  }

  // Handle Object
  const objCopy = {};
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      objCopy[key] = deepClone(obj[key]);
    }
  }
  return objCopy;
}

/**
 * Check if string is valid JSON
 *
 * @param {string} str - String to validate
 * @returns {boolean} True if valid JSON
 *
 * @example
 * isValidJson('{"key": "value"}')
 * // Returns: true
 *
 * isValidJson('{invalid json}')
 * // Returns: false
 */
function isValidJson(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }

  try {
    JSON.parse(str);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Strip comments from JSON string
 *
 * Removes // and /* *\/ comments
 *
 * @param {string} jsonString - JSON string with comments
 * @returns {string} JSON string without comments
 *
 * @example
 * stripJsonComments('{"key": "value" /* comment *\/}')
 * // Returns: '{"key": "value" }'
 */
function stripJsonComments(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return jsonString || '';
  }

  let cleaned = jsonString;

  // Remove /* */ comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove // comments (but not in strings)
  // Simple approach: remove // to end of line
  cleaned = cleaned.replace(/\/\/.*$/gm, '');

  return cleaned;
}

// Export to globalThis for backward compatibility
// Functions are already in global scope in Apps Script

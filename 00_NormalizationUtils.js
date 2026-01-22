/**
 * Normalization Utilities
 *
 * Canonical normalization functions for string, type, and structure normalization.
 * Replaces 43 scattered normalization functions across 14 files.
 *
 * Load order: 00_ prefix ensures early loading
 * Compatibility: ES5 syntax for Apps Script compatibility
 */

/**
 * Normalize a string value with configurable options
 *
 * @param {string|*} value - Value to normalize
 * @param {Object} options - Normalization options
 * @param {boolean} [options.trim=true] - Trim whitespace
 * @param {boolean} [options.lowercase=false] - Convert to lowercase
 * @param {boolean} [options.removeSpecialChars=false] - Remove special characters (keep alphanumeric, spaces, hyphens)
 * @param {boolean} [options.collapseWhitespace=true] - Collapse multiple spaces to single space
 * @returns {string} Normalized string
 *
 * @example
 * normalizeString("  Hello  World  ", { trim: true, collapseWhitespace: true })
 * // Returns: "Hello World"
 */
function normalizeString(value, options) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to string
  let str = String(value);

  // Set default options
  const opts = options || {};
  const trim = opts.trim !== undefined ? opts.trim : true;
  const lowercase = opts.lowercase !== undefined ? opts.lowercase : false;
  const removeSpecialChars = opts.removeSpecialChars !== undefined ? opts.removeSpecialChars : false;
  const collapseWhitespace = opts.collapseWhitespace !== undefined ? opts.collapseWhitespace : true;

  // Apply trim
  if (trim) {
    str = str.replace(/^\s+|\s+$/g, '');
  }

  // Apply lowercase
  if (lowercase) {
    str = str.toLowerCase();
  }

  // Apply removeSpecialChars (keep alphanumeric, spaces, hyphens)
  if (removeSpecialChars) {
    str = str.replace(/[^a-zA-Z0-9\s\-]/g, '');
  }

  // Apply collapseWhitespace
  if (collapseWhitespace) {
    str = str.replace(/\s+/g, ' ');
  }

  return str;
}

/**
 * Normalize a value into a standardized key/identifier
 *
 * Replaces 5 scattered key normalization functions.
 * Converts to lowercase, removes special chars, replaces spaces with hyphens.
 *
 * @param {string|*} value - Value to normalize into key
 * @returns {string} Normalized key
 *
 * @example
 * normalizeKey("Phase Key #1")
 * // Returns: "phase-key-1"
 */
function normalizeKey(value) {
  // Use normalizeString with key-specific options
  let normalized = normalizeString(value, {
    trim: true,
    lowercase: true,
    removeSpecialChars: true,
    collapseWhitespace: true
  });

  // Replace spaces with hyphens
  normalized = normalized.replace(/\s/g, '-');

  // Remove consecutive hyphens
  normalized = normalized.replace(/-+/g, '-');

  // Remove leading/trailing hyphens
  normalized = normalized.replace(/^-+|-+$/g, '');

  return normalized;
}

/**
 * Normalize text for hash comparison (scope contract validation)
 *
 * Preserves special characters for hash consistency.
 * Used by ScopeMap.js for scope contract validation.
 *
 * @param {string|*} value - Value to normalize for hashing
 * @returns {string} Normalized text (preserves special chars)
 *
 * @example
 * normalizeTextForHash("  Compare THIS!  ")
 * // Returns: "compare this!"
 */
function normalizeTextForHash(value) {
  // Use normalizeString but preserve special chars
  return normalizeString(value, {
    trim: true,
    lowercase: true,
    removeSpecialChars: false,
    collapseWhitespace: true
  });
}

/**
 * Normalize a value to boolean with default fallback
 *
 * Handles string "true"/"false", numbers (0/1), and actual booleans.
 * Replaces ConfigLoader.normalizeBoolean_
 *
 * @param {*} value - Value to normalize to boolean
 * @param {boolean} defaultValue - Default value if null/undefined
 * @returns {boolean} Normalized boolean
 *
 * @example
 * normalizeBoolean("true", false)  // Returns: true
 * normalizeBoolean(1, false)       // Returns: true
 * normalizeBoolean(null, false)    // Returns: false
 */
function normalizeBoolean(value, defaultValue) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return defaultValue !== undefined ? defaultValue : false;
  }

  // Handle boolean type
  if (typeof value === 'boolean') {
    return value;
  }

  // Handle string "true"/"false"
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1') {
      return true;
    }
    if (lower === 'false' || lower === '0') {
      return false;
    }
  }

  // Handle numbers (0 = false, non-zero = true)
  if (typeof value === 'number') {
    return value !== 0;
  }

  // Default conversion for other types
  return Boolean(value);
}

/**
 * Normalize a value to number with default fallback
 *
 * Parses strings to numbers, handles null/undefined and NaN.
 * Replaces XeroSync_Enhanced.normalizeNumberValue
 *
 * @param {*} value - Value to normalize to number
 * @param {number} defaultValue - Default value if null/undefined/NaN
 * @returns {number} Normalized number
 *
 * @example
 * normalizeNumber("42", 0)     // Returns: 42
 * normalizeNumber("abc", 0)    // Returns: 0
 * normalizeNumber(null, 0)     // Returns: 0
 */
function normalizeNumber(value, defaultValue) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return defaultValue !== undefined ? defaultValue : 0;
  }

  // Handle number type
  if (typeof value === 'number') {
    // Check for NaN
    if (isNaN(value)) {
      return defaultValue !== undefined ? defaultValue : 0;
    }
    return value;
  }

  // Parse string to number
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      return defaultValue !== undefined ? defaultValue : 0;
    }
    return parsed;
  }

  // Attempt numeric conversion for other types
  const converted = Number(value);
  if (isNaN(converted)) {
    return defaultValue !== undefined ? defaultValue : 0;
  }
  return converted;
}

/**
 * Normalize a value to array with default fallback
 *
 * Handles null/undefined, strings (JSON parse or single-item array), and arrays.
 *
 * @param {*} value - Value to normalize to array
 * @param {Array} defaultValue - Default value if null/undefined
 * @returns {Array} Normalized array
 *
 * @example
 * normalizeArray(null, [])           // Returns: []
 * normalizeArray([1,2,3], [])        // Returns: [1,2,3]
 * normalizeArray("test", [])         // Returns: ["test"]
 * normalizeArray("[1,2,3]", [])      // Returns: [1,2,3]
 */
function normalizeArray(value, defaultValue) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return defaultValue !== undefined ? defaultValue : [];
  }

  // Handle array type
  if (Array.isArray(value)) {
    return value;
  }

  // Handle string - try JSON parse, fallback to single-item array
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      // Parsed successfully but not an array - wrap it
      return [parsed];
    } catch (e) {
      // JSON parse failed - wrap original string
      return [value];
    }
  }

  // Wrap other types in array
  return [value];
}

/**
 * Normalize object by merging with default values
 *
 * Creates new object with defaults for missing keys.
 * Does NOT mutate original object.
 *
 * @param {Object|*} obj - Object to normalize
 * @param {Object} defaults - Default values for missing keys
 * @returns {Object} Normalized object (new instance)
 *
 * @example
 * normalizeObject({ a: 1 }, { a: 0, b: 2 })
 * // Returns: { a: 1, b: 2 }
 */
function normalizeObject(obj, defaults) {
  // Handle null/undefined - return copy of defaults
  if (obj === null || obj === undefined) {
    return fillDefaults({}, defaults);
  }

  // Handle non-object types
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return fillDefaults({}, defaults);
  }

  // Merge obj with defaults
  return fillDefaults(obj, defaults);
}

/**
 * Shallow merge utility - fill missing keys with defaults
 *
 * Creates new object without mutating inputs.
 * Uses ES5 compatible manual property copy (no Object.assign).
 *
 * @param {Object} obj - Object with values
 * @param {Object} defaults - Default values for missing keys
 * @returns {Object} New object with merged values
 *
 * @example
 * fillDefaults({ a: 1 }, { a: 0, b: 2 })
 * // Returns: { a: 1, b: 2 }
 */
function fillDefaults(obj, defaults) {
  const result = {};

  // Copy all keys from defaults first
  if (defaults && typeof defaults === 'object') {
    for (let key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        result[key] = defaults[key];
      }
    }
  }

  // Overwrite with keys from obj (if present)
  if (obj && typeof obj === 'object') {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = obj[key];
      }
    }
  }

  return result;
}

// Functions are already in global scope in Apps Script

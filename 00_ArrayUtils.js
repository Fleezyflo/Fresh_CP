/**
 * Array Utilities
 *
 * Canonical array manipulation functions for filtering and transforming arrays.
 * Replaces scattered array operations across 10+ files.
 *
 * Load order: 00_ prefix ensures early loading
 * Compatibility: ES5 syntax for Apps Script compatibility
 *
 * @example
 * // Remove duplicates
 * var unique = uniqueBy(items, function(item) { return item.id; });
 *
 * // Remove nullish values
 * var clean = filterNullish(array);
 *
 * // Split into chunks
 * var chunks = chunk(array, 100);
 */

/**
 * Remove duplicates using key function (preserves first occurrence)
 *
 * @param {Array} array - Array to deduplicate
 * @param {Function} keyFn - Function that returns uniqueness key for each element
 * @returns {Array} Array with duplicates removed
 *
 * @example
 * uniqueBy([{id: 1, name: 'A'}, {id: 2, name: 'B'}, {id: 1, name: 'C'}], function(item) { return item.id; })
 * // Returns: [{id: 1, name: 'A'}, {id: 2, name: 'B'}]
 */
function uniqueBy(array, keyFn) {
  if (!Array.isArray(array)) {
    return [];
  }

  if (typeof keyFn !== 'function') {
    return array.slice();  // Return copy if no key function
  }

  const seen = {};
  const result = [];

  for (let i = 0; i < array.length; i++) {
    const item = array[i];
    const key = String(keyFn(item));

    if (!seen[key]) {
      seen[key] = true;
      result.push(item);
    }
  }

  return result;
}

/**
 * Remove all falsy values (null, undefined, false, 0, "", NaN)
 *
 * @param {Array} array - Array to filter
 * @returns {Array} Array with all falsy values removed
 *
 * @example
 * filterTruthy([1, null, 2, undefined, 3, false, 4, 0, 5, ""])
 * // Returns: [1, 2, 3, 4, 5]
 */
function filterTruthy(array) {
  if (!Array.isArray(array)) {
    return [];
  }

  return array.filter(function(item) {
    return !!item;  // Convert to boolean, filter truthy
  });
}

/**
 * Remove only null and undefined (keeps false, 0, "")
 *
 * @param {Array} array - Array to filter
 * @returns {Array} Array with null/undefined removed
 *
 * @example
 * filterNullish([1, null, 2, undefined, 3, false, 4, 0, 5, ""])
 * // Returns: [1, 2, 3, false, 4, 0, 5, ""]
 */
function filterNullish(array) {
  if (!Array.isArray(array)) {
    return [];
  }

  return array.filter(function(item) {
    return item !== null && item !== undefined;
  });
}

/**
 * Split array into chunks of specified size
 *
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size (must be > 0)
 * @returns {Array<Array>} Array of chunks
 *
 * @example
 * chunk([1, 2, 3, 4, 5, 6, 7], 3)
 * // Returns: [[1, 2, 3], [4, 5, 6], [7]]
 */
function chunk(array, size) {
  if (!Array.isArray(array)) {
    return [];
  }

  let chunkSize = parseInt(size, 10);
  if (isNaN(chunkSize) || chunkSize <= 0) {
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.warn('chunk', 'Invalid chunk size, using size 1', { size: size });
      }
    } catch (logError) {
      console.error('chunk: Invalid size - using 1');
    }
    chunkSize = 1;
  }

  const result = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }

  return result;
}

// Export to globalThis for backward compatibility
// Functions are already in global scope in Apps Script

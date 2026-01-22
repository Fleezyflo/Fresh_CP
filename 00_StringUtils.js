/**
 * String Utilities
 *
 * Canonical string manipulation functions for truncate, capitalize, slugify, escaping.
 * Handles string transformations, HTML safety, and text formatting.
 *
 * Load order: 00_ prefix ensures early loading
 * Compatibility: ES5 syntax for Apps Script compatibility
 *
 * @example
 * // Truncate long text
 * var short = truncate('This is a very long string that needs shortening', 20);
 * // Returns: "This is a very long..."
 *
 * // Capitalize text
 * var title = capitalize('hello world');
 * // Returns: "Hello world"
 *
 * // Create URL slug
 * var slug = slugify('My Amazing Post!');
 * // Returns: "my-amazing-post"
 */

/**
 * Truncate string to maximum length with suffix
 *
 * Attempts to break at word boundaries when possible to avoid cutting words mid-way.
 *
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length (including suffix)
 * @param {string} [suffix='...'] - Suffix to append when truncated
 * @returns {string} Truncated string
 *
 * @example
 * truncate('The quick brown fox jumps over the lazy dog', 20)
 * // Returns: "The quick brown..."
 *
 * truncate('Short', 20)
 * // Returns: "Short"
 *
 * truncate('Hello world', 10, '…')
 * // Returns: "Hello wo…"
 */
function truncate(str, maxLength, suffix) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  if (typeof maxLength !== 'number' || maxLength <= 0) {
    return str;
  }

  const safeSuffix = suffix !== undefined ? String(suffix) : '...';

  if (str.length <= maxLength) {
    return str;
  }

  // Reserve space for suffix
  const targetLength = maxLength - safeSuffix.length;
  if (targetLength <= 0) {
    return safeSuffix;
  }

  // Try to break at word boundary
  let truncated = str.substring(0, targetLength);
  const lastSpace = truncated.lastIndexOf(' ');

  // If we found a space and it's not too far back (at least 60% of target)
  if (lastSpace > 0 && lastSpace >= targetLength * 0.6) {
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated + safeSuffix;
}

/**
 * Capitalize first letter of string
 *
 * @param {string} str - String to capitalize
 * @returns {string} String with first letter capitalized
 *
 * @example
 * capitalize('hello world')
 * // Returns: "Hello world"
 *
 * capitalize('HELLO')
 * // Returns: "HELLO"
 *
 * capitalize('')
 * // Returns: ""
 */
function capitalize(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  if (str.length === 0) {
    return str;
  }

  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Capitalize first letter of each word (title case)
 *
 * @param {string} str - String to capitalize
 * @returns {string} String with each word capitalized
 *
 * @example
 * capitalizeWords('hello world')
 * // Returns: "Hello World"
 *
 * capitalizeWords('the quick brown fox')
 * // Returns: "The Quick Brown Fox"
 *
 * capitalizeWords('ALREADY UPPERCASE')
 * // Returns: "ALREADY UPPERCASE"
 */
function capitalizeWords(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  return str.replace(/\b\w/g, function(char) {
    return char.toUpperCase();
  });
}

/**
 * Create URL-safe slug from string
 *
 * Converts to lowercase, replaces spaces with hyphens, removes special characters.
 *
 * @param {string} str - String to slugify
 * @returns {string} URL-safe slug
 *
 * @example
 * slugify('My Amazing Post!')
 * // Returns: "my-amazing-post"
 *
 * slugify('Hello World 123')
 * // Returns: "hello-world-123"
 *
 * slugify('Special @#$ Characters')
 * // Returns: "special-characters"
 */
function slugify(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  return str
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Replace multiple hyphens with single hyphen
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '');
}

/**
 * Escape HTML special characters
 *
 * Prevents XSS by converting HTML special characters to entities.
 *
 * @param {string} str - String to escape
 * @returns {string} HTML-safe string
 *
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
 *
 * escapeHtml('Hello & goodbye')
 * // Returns: "Hello &amp; goodbye"
 *
 * escapeHtml("It's a test")
 * // Returns: "It&#39;s a test"
 */
function escapeHtml(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return str.replace(/[&<>"']/g, function(char) {
    return entityMap[char];
  });
}

/**
 * Unescape HTML entities to special characters
 *
 * Reverses escapeHtml operation.
 *
 * @param {string} str - HTML-escaped string
 * @returns {string} Unescaped string
 *
 * @example
 * unescapeHtml('&lt;div&gt;Hello&lt;/div&gt;')
 * // Returns: "<div>Hello</div>"
 *
 * unescapeHtml('Hello &amp; goodbye')
 * // Returns: "Hello & goodbye"
 */
function unescapeHtml(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  const entityMap = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
  };

  return str.replace(/&(amp|lt|gt|quot|#39);/g, function(entity) {
    return entityMap[entity] || entity;
  });
}

/**
 * Count words in string
 *
 * Splits by whitespace and counts non-empty tokens.
 *
 * @param {string} str - String to count words in
 * @returns {number} Word count
 *
 * @example
 * wordCount('Hello world')
 * // Returns: 2
 *
 * wordCount('The quick brown fox')
 * // Returns: 4
 *
 * wordCount('   Multiple   spaces   ')
 * // Returns: 2
 */
function wordCount(str) {
  if (!str || typeof str !== 'string') {
    return 0;
  }

  const trimmed = str.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  // Split by whitespace and count non-empty tokens
  const words = trimmed.split(/\s+/);
  return words.length;
}

/**
 * Replace all occurrences of search string with replacement
 *
 * Polyfill for String.prototype.replaceAll() for older JavaScript environments.
 *
 * @param {string} str - Source string
 * @param {string} search - String to search for
 * @param {string} replace - Replacement string
 * @returns {string} String with all occurrences replaced
 *
 * @example
 * replaceAll('Hello world, hello universe', 'hello', 'goodbye')
 * // Returns: "Hello world, goodbye universe"
 *
 * replaceAll('foo-bar-baz', '-', '_')
 * // Returns: "foo_bar_baz"
 *
 * replaceAll('test', 'x', 'y')
 * // Returns: "test"
 */
function replaceAll(str, search, replace) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  if (!search || typeof search !== 'string') {
    return str;
  }

  const safeReplace = replace !== undefined ? String(replace) : '';

  // Escape special regex characters in search string
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedSearch, 'g');

  return str.replace(regex, safeReplace);
}

/**
 * Split large JSON string into 49KB chunks for Sheet storage
 *
 * Sheet cells have 50KB character limit. Split large JSON across multiple columns
 * to prevent silent truncation and data loss.
 *
 * @param {string} jsonString - JSON to split
 * @param {number} maxChunkSize - Max chars per chunk (default 49000)
 * @returns {string[]} Array of 3 chunks (empty strings if not needed)
 *
 * @example
 * const json = JSON.stringify(largeObject); // 120KB
 * const chunks = splitJsonForSheet(json);
 * // chunks[0] = 49KB, chunks[1] = 49KB, chunks[2] = 22KB
 * // Store in 3 separate sheet columns
 */
function splitJsonForSheet(jsonString, maxChunkSize) {
  maxChunkSize = maxChunkSize || 49000; // 49KB per chunk (1KB margin for safety)

  if (!jsonString || jsonString.length <= maxChunkSize) {
    return [jsonString || '', '', ''];
  }

  const chunks = [];
  let cursor = 0;

  while (cursor < jsonString.length && chunks.length < 3) {
    chunks.push(jsonString.substring(cursor, cursor + maxChunkSize));
    cursor += maxChunkSize;
  }

  // Pad with empty strings to always return 3 chunks
  while (chunks.length < 3) {
    chunks.push('');
  }

  if (jsonString.length > maxChunkSize * 3) {
    UnifiedLogger.warn('StringUtils', 'JSON exceeds 147KB capacity (3 × 49KB chunks)', {
      size: jsonString.length,
      capacity: maxChunkSize * 3
    });
  }

  return chunks;
}

/**
 * Reassemble JSON from split chunks
 *
 * @param {string[]} chunks - Array of chunks from splitJsonForSheet
 * @returns {string} Reassembled JSON string
 */
function reassembleJsonFromChunks(chunks) {
  if (!Array.isArray(chunks)) {
    return '';
  }

  return chunks.join('');
}

// Export to globalThis for backward compatibility
// Functions are already in global scope in Apps Script

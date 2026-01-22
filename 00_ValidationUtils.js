/**
 * Validation Utilities
 *
 * Canonical validation functions for emails, dates, required fields, and data types.
 * Replaces scattered validation logic across 6+ files.
 *
 * Load order: 00_ prefix ensures early loading
 * Compatibility: ES5 syntax for Apps Script compatibility
 *
 * @example
 * // Email validation
 * var valid = isValidEmail('user@example.com');
 *
 * // Required field validation
 * var result = validateRequired(obj, ['name', 'email']);
 * if (!result.valid) {
 *   console.log('Missing fields:', result.missing);
 * }
 */

/**
 * Validate email address (RFC 5322 basic pattern)
 *
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 *
 * @example
 * isValidEmail('user@example.com')
 * // Returns: true
 *
 * isValidEmail('invalid.email')
 * // Returns: false
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic RFC 5322 pattern - sufficient for most cases
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate date string
 *
 * @param {string} dateStr - Date string to validate
 * @param {string} [format] - Optional format hint (currently unused, for future enhancement)
 * @returns {boolean} True if valid date
 *
 * @example
 * isValidDate('2026-01-12')
 * // Returns: true
 *
 * isValidDate('invalid-date')
 * // Returns: false
 */
function isValidDate(dateStr, format) {
  if (!dateStr) {
    return false;
  }

  // Try parsing as date
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Check if value is numeric (string or number)
 *
 * @param {*} value - Value to check
 * @returns {boolean} True if value is numeric
 *
 * @example
 * isNumeric(123)
 * // Returns: true
 *
 * isNumeric('456')
 * // Returns: true
 *
 * isNumeric('abc')
 * // Returns: false
 */
function isNumeric(value) {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  return !isNaN(Number(value));
}

/**
 * Check if numeric value is in range
 *
 * @param {number|string} value - Value to check
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {boolean} [inclusive=true] - Include min/max in range
 * @returns {boolean} True if value is in range
 *
 * @example
 * isInRange(5, 1, 10)
 * // Returns: true
 *
 * isInRange(10, 1, 10, true)
 * // Returns: true (inclusive)
 *
 * isInRange(10, 1, 10, false)
 * // Returns: false (exclusive)
 */
function isInRange(value, min, max, inclusive) {
  if (!isNumeric(value) || !isNumeric(min) || !isNumeric(max)) {
    return false;
  }

  const num = Number(value);
  const minNum = Number(min);
  const maxNum = Number(max);
  const includeEdges = inclusive !== false; // Default to true

  if (includeEdges) {
    return num >= minNum && num <= maxNum;
  } else {
    return num > minNum && num < maxNum;
  }
}

/**
 * Validate object has required fields
 *
 * @param {Object} obj - Object to validate
 * @param {Array<string>} fields - Required field names
 * @returns {Object} {valid: boolean, missing: string[]}
 *
 * @example
 * validateRequired({name: 'John', email: 'john@example.com'}, ['name', 'email', 'phone'])
 * // Returns: {valid: false, missing: ['phone']}
 *
 * validateRequired({name: 'John', email: 'john@example.com'}, ['name', 'email'])
 * // Returns: {valid: true, missing: []}
 */
function validateRequired(obj, fields) {
  // Validate inputs
  if (!obj || typeof obj !== 'object') {
    return {
      valid: false,
      missing: Array.isArray(fields) ? fields.slice() : []
    };
  }

  if (!Array.isArray(fields)) {
    return {valid: true, missing: []};
  }

  // Find missing fields
  const missing = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!(field in obj) || obj[field] === null || obj[field] === undefined || obj[field] === '') {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing
  };
}

/**
 * Validate URL (http/https)
 *
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 *
 * @example
 * isValidUrl('https://example.com')
 * // Returns: true
 *
 * isValidUrl('ftp://example.com')
 * // Returns: false
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check for http/https protocol
  const urlRegex = /^https?:\/\/.+/i;
  if (!urlRegex.test(url.trim())) {
    return false;
  }

  // Try URL parsing
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    // URL parsing failed - likely invalid format
    return false;
  }
}

/**
 * Check if value is non-empty string (trim whitespace)
 *
 * @param {*} value - Value to check
 * @returns {boolean} True if non-empty string after trimming
 *
 * @example
 * isNonEmptyString('hello')
 * // Returns: true
 *
 * isNonEmptyString('   ')
 * // Returns: false
 *
 * isNonEmptyString(123)
 * // Returns: false
 */
function isNonEmptyString(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return value.trim().length > 0;
}

/**
 * Validate phone number (basic validation - digits, +, -, (), spaces)
 *
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 *
 * @example
 * isValidPhoneNumber('+1 (555) 123-4567')
 * // Returns: true
 *
 * isValidPhoneNumber('555-1234')
 * // Returns: true
 *
 * isValidPhoneNumber('abc-defg')
 * // Returns: false
 */
function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // Basic phone validation: must have at least 7 digits, allow +, -, (), spaces
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  return /^\d{7,}$/.test(cleaned);
}

/**
 * Match value against regex pattern with error handling
 *
 * @param {string} value - Value to match
 * @param {RegExp|string} regex - Pattern to match against
 * @returns {boolean} True if matches, false if no match or error
 *
 * @example
 * matchesPattern('ABC123', /^[A-Z0-9]+$/)
 * // Returns: true
 *
 * matchesPattern('abc', '^[A-Z]+$')
 * // Returns: false
 */
function matchesPattern(value, regex) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const pattern = regex instanceof RegExp ? regex : new RegExp(regex);
    return pattern.test(value);
  } catch (error) {
    // Invalid regex pattern
    try {
      if (typeof UnifiedLogger !== 'undefined') {
        UnifiedLogger.error('matchesPattern', 'Invalid regex pattern', {
          error: error.message,
          regex: String(regex)
        });
      }
    } catch (logError) {
      console.error('matchesPattern: Invalid regex pattern');
    }
    return false;
  }
}

/**
 * Sanitize input by type
 *
 * @param {string} input - Input to sanitize
 * @param {string} type - Sanitization type ('email', 'phone', 'numeric', 'alphanumeric')
 * @returns {string} Sanitized input
 *
 * @example
 * sanitizeInput('  User@Example.COM  ', 'email')
 * // Returns: 'user@example.com'
 *
 * sanitizeInput('+1 (555) 123-4567', 'phone')
 * // Returns: '15551234567'
 *
 * sanitizeInput('abc123xyz', 'numeric')
 * // Returns: '123'
 */
function sanitizeInput(input, type) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const cleaned = input.trim();

  switch (type) {
    case 'email':
      return cleaned.toLowerCase();

    case 'phone':
      // Remove all non-digits except leading +
      return cleaned.replace(/[^\d+]/g, '').replace(/\+(\d+)/, '$1');

    case 'numeric':
      // Remove all non-digits
      return cleaned.replace(/\D/g, '');

    case 'alphanumeric':
      // Keep only letters and numbers
      return cleaned.replace(/[^a-zA-Z0-9]/g, '');

    default:
      // Default: just trim
      return cleaned;
  }
}

/**
 * Validates payload size before PropertiesService write
 *
 * PropertiesService has a 9,216 byte limit per property.
 * This function measures actual byte size (not string length) to prevent silent truncation.
 * Unicode characters can be 2-4 bytes, so .length !== byte size.
 *
 * @param {string} value - Value to write
 * @param {number} [maxSize=9000] - Max size in bytes (default 9000, safe buffer below 9216 hard limit)
 * @returns {Object} {valid: boolean, size: number, message: string}
 *
 * @example
 * var result = validatePropertySize(JSON.stringify(largeObject), 9000);
 * if (!result.valid) {
 *   console.log(result.message); // 'Payload exceeds 9000 bytes (9500 bytes)'
 * }
 */
function validatePropertySize(value, maxSize) {
  maxSize = maxSize || 9000; // Safe limit (below 9216 hard limit)

  // Handle non-string values
  if (value === null || value === undefined) {
    return {
      valid: true,
      size: 0,
      message: 'Empty value (0 bytes)'
    };
  }

  // Convert to string if not already
  var stringValue = typeof value === 'string' ? value : String(value);

  // Measure actual byte size using UTF-8 encoding
  var sizeBytes = Utilities.newBlob(stringValue, 'text/plain', 'UTF-8').getBytes().length;

  return {
    valid: sizeBytes <= maxSize,
    size: sizeBytes,
    message: sizeBytes > maxSize
      ? 'Payload exceeds ' + maxSize + ' bytes (' + sizeBytes + ' bytes)'
      : 'Payload size OK (' + sizeBytes + ' bytes)'
  };
}

// Export to globalThis for backward compatibility
// Functions are already in global scope in Apps Script

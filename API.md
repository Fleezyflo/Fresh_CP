# Fresh CP - Public API Reference

**Complete reference for all public functions available in the Fresh CP system**

Version: 1.0.0
Last Updated: 2026-01-12

---

## Table of Contents

### Quick Navigation

- [Introduction](#introduction)
- [Common Use Cases](#common-use-cases)
- [Alphabetical Index](#alphabetical-index)

### API by Module

1. [Normalization Utilities](#normalization-utilities)
2. [JSON Utilities](#json-utilities)
3. [Array Utilities](#array-utilities)
4. [Validation Utilities](#validation-utilities)
5. [String Utilities](#string-utilities)
6. [Error Utilities](#error-utilities)
7. [Configuration API](#configuration-api)
8. [Entry Points](#entry-points)

---

## Introduction

This document provides comprehensive documentation for all public functions available in the Fresh CP system. Functions are organized by module and purpose, with detailed parameter descriptions, return values, usage examples, and cross-references.

### Function Naming Conventions

- **Utility functions**: Lowercase with descriptive names (e.g., `normalizeString`, `safeJsonParse`)
- **Type conversion**: `normalize*` prefix (e.g., `normalizeNumber`, `normalizeBoolean`)
- **Validation**: `isValid*` or `is*` prefix (e.g., `isValidEmail`, `isNumeric`)
- **Error handling**: `create*Error`, `catch*`, `format*` (e.g., `createError`, `catchAndLog`)

### Global Exports

All utility functions are exported to `globalThis` for easy access throughout the codebase:

```javascript
// Functions available globally via globalThis
globalThis.normalizeString(value, options);
globalThis.safeJsonParse(jsonString, defaultValue);
globalThis.groupBy(array, keyFn);
// etc...
```

### Error Handling

All functions include comprehensive error handling with fallback values. Errors are logged via UnifiedLogger with console.error fallback (logging-the-logger pattern).

---

## Common Use Cases

Quick examples for the most common operations:

### Parse JSON Safely

```javascript
// Parse JSON with fallback on error
const data = safeJsonParse(response, {});
// Never throws - returns {} if parse fails
```

### Validate Email Address

```javascript
// Validate email format
if (isValidEmail('user@example.com')) {
  // Email is valid
}
```

### Get Configuration Value

```javascript
// Load configuration from any source
const profiles = ConfigurationManager.get('brief.profiles');
const apiKey = ConfigurationManager.get('properties.openai.apiKey');
```

### Handle Errors Gracefully

```javascript
// Execute function with error handling and fallback
const result = catchAndLog(
  function() { return riskyOperation(); },
  'MyModule',
  defaultValue
);
```

### Normalize User Input

```javascript
// Normalize string input
const clean = normalizeString('  Hello  World  ', {
  trim: true,
  lowercase: true,
  collapseWhitespace: true
});
// Returns: "hello world"
```

### Group Array by Property

```javascript
// Group items by type
const grouped = groupBy(items, function(item) {
  return item.type;
});
// Returns: {typeA: [...], typeB: [...]}
```

---

## Alphabetical Index

Quick alphabetical lookup of all functions:

- [aggregateErrors](#aggregateerrors)
- [asAIUserError](#asaiusererror)
- [capitalize](#capitalize)
- [capitalizeWords](#capitalizewords)
- [catchAndLog](#catchandlog)
- [chunk](#chunk)
- [createError](#createerror)
- [createRetryableError](#createretryableerror)
- [deepClone](#deepclone)
- [deepMerge](#deepmerge)
- [escapeHtml](#escapehtml)
- [executeRetry](#executeretry)
- [fillDefaults](#filldefaults)
- [filterNullish](#filternullish)
- [filterTruthy](#filtertruthy)
- [fixMalformedJson](#fixmalformedjson)
- [flatten](#flatten)
- [formatErrorLog](#formaterrorlog)
- [formatErrorMessage](#formaterrormessage)
- [get (ConfigurationManager)](#get-configurationmanager)
- [getValidationErrors](#getvalidationerrors)
- [groupBy](#groupby)
- [has (ConfigurationManager)](#has-configurationmanager)
- [invalidate (ConfigurationManager)](#invalidate-configurationmanager)
- [isInRange](#isinrange)
- [isKnownError](#isknownerror)
- [isNonEmptyString](#isnonemptystring)
- [isNumeric](#isnumeric)
- [isValidDate](#isvaliddate)
- [isValidEmail](#isvalidemail)
- [isValidJson](#isvalidjson)
- [isValidPhoneNumber](#isvalidphonenumber)
- [isValidUrl](#isvalidurl)
- [matchesPattern](#matchespattern)
- [normalizeArray](#normalizearray)
- [normalizeBoolean](#normalizeboolean)
- [normalizeKey](#normalizekey)
- [normalizeNumber](#normalizenumber)
- [normalizeObject](#normalizeobject)
- [normalizeString](#normalizestring)
- [normalizeTextForHash](#normalizetextforhash)
- [onOpen](#onopen)
- [partition](#partition)
- [pluck](#pluck)
- [quoteObjectKeys](#quoteobjectkeys)
- [replaceAll](#replaceall)
- [resetRetryCounter](#resetretrycounter)
- [retryOnError](#retryonerror)
- [safeJsonParse](#safejsonparse)
- [safeJsonStringify](#safejsonstringify)
- [sanitizeInput](#sanitizeinput)
- [showAISidebar](#showaisidebar)
- [slugify](#slugify)
- [stripJsonComments](#stripjsoncomments)
- [truncate](#truncate)
- [unescapeHtml](#unescapehtml)
- [uniqueBy](#uniqueby)
- [validateAll](#validateall)
- [validateRequired](#validaterequired)
- [wordCount](#wordcount)
- [wrapError](#wraperror)

---

## Normalization Utilities

Functions for normalizing strings, types, and data structures into consistent formats.

**Module:** `00_NormalizationUtils.js`
**Export:** `globalThis.NormalizationUtils`

### normalizeString

Normalize a string value with configurable options.

**Parameters:**
- `value` (string|*) - Value to normalize
- `options` (Object) - Normalization options
  - `trim` (boolean) - Trim whitespace (default: true)
  - `lowercase` (boolean) - Convert to lowercase (default: false)
  - `removeSpecialChars` (boolean) - Remove special characters, keep alphanumeric, spaces, hyphens (default: false)
  - `collapseWhitespace` (boolean) - Collapse multiple spaces to single space (default: true)

**Returns:** (string) Normalized string

**Example:**
```javascript
normalizeString("  Hello  World  ", { trim: true, collapseWhitespace: true });
// Returns: "Hello World"

normalizeString("User@Example.COM", { lowercase: true, trim: true });
// Returns: "user@example.com"

normalizeString("Hello! @World# 123", { removeSpecialChars: true });
// Returns: "Hello World 123"
```

**Notes:**
- Handles null/undefined by returning empty string
- All options default to sensible values for most use cases
- Non-string values are converted to string first

**See Also:** [normalizeKey](#normalizekey), [normalizeTextForHash](#normalizetextforhash)

---

### normalizeKey

Normalize a value into a standardized key/identifier.

Converts to lowercase, removes special chars, replaces spaces with hyphens.
Replaces 5 scattered key normalization functions.

**Parameters:**
- `value` (string|*) - Value to normalize into key

**Returns:** (string) Normalized key (lowercase, hyphen-separated)

**Example:**
```javascript
normalizeKey("Phase Key #1");
// Returns: "phase-key-1"

normalizeKey("  User Name  ");
// Returns: "user-name"

normalizeKey("Special!@#$%Characters");
// Returns: "specialcharacters"
```

**Notes:**
- Removes consecutive hyphens
- Removes leading/trailing hyphens
- Ideal for creating URL slugs, object keys, identifiers

**See Also:** [slugify](#slugify), [normalizeString](#normalizestring)

---

### normalizeTextForHash

Normalize text for hash comparison (scope contract validation).

Preserves special characters for hash consistency.

**Parameters:**
- `value` (string|*) - Value to normalize for hashing

**Returns:** (string) Normalized text (preserves special chars)

**Example:**
```javascript
normalizeTextForHash("  Compare THIS!  ");
// Returns: "compare this!"

normalizeTextForHash("Text with $pecial @chars");
// Returns: "text with $pecial @chars"
```

**Notes:**
- Used by ScopeMap.js for scope contract validation
- Preserves special characters unlike normalizeKey
- Ensures consistent hash values across text variations

**See Also:** [normalizeString](#normalizestring)

---

### normalizeBoolean

Normalize a value to boolean with default fallback.

Handles string "true"/"false", numbers (0/1), and actual booleans.

**Parameters:**
- `value` (*) - Value to normalize to boolean
- `defaultValue` (boolean) - Default value if null/undefined

**Returns:** (boolean) Normalized boolean

**Example:**
```javascript
normalizeBoolean("true", false);  // Returns: true
normalizeBoolean(1, false);       // Returns: true
normalizeBoolean(0, false);       // Returns: false
normalizeBoolean(null, false);    // Returns: false
normalizeBoolean("yes", true);    // Returns: true (truthy string)
```

**Notes:**
- Replaces ConfigLoader.normalizeBoolean_
- String "1" treated as true
- Numbers: 0 = false, non-zero = true

**See Also:** [normalizeNumber](#normalizenumber)

---

### normalizeNumber

Normalize a value to number with default fallback.

Parses strings to numbers, handles null/undefined and NaN.

**Parameters:**
- `value` (*) - Value to normalize to number
- `defaultValue` (number) - Default value if null/undefined/NaN

**Returns:** (number) Normalized number

**Example:**
```javascript
normalizeNumber("42", 0);     // Returns: 42
normalizeNumber("abc", 0);    // Returns: 0
normalizeNumber(null, 0);     // Returns: 0
normalizeNumber("3.14", 0);   // Returns: 3.14
```

**Notes:**
- Replaces XeroSync_Enhanced.normalizeNumberValue
- Uses parseFloat for string parsing
- Returns defaultValue for unparseable strings

**See Also:** [normalizeBoolean](#normalizeboolean), [isNumeric](#isnumeric)

---

### normalizeArray

Normalize a value to array with default fallback.

Handles null/undefined, strings (JSON parse or single-item array), and arrays.

**Parameters:**
- `value` (*) - Value to normalize to array
- `defaultValue` (Array) - Default value if null/undefined

**Returns:** (Array) Normalized array

**Example:**
```javascript
normalizeArray(null, []);           // Returns: []
normalizeArray([1,2,3], []);        // Returns: [1,2,3]
normalizeArray("test", []);         // Returns: ["test"]
normalizeArray("[1,2,3]", []);      // Returns: [1,2,3] (parsed)
```

**Notes:**
- Attempts JSON.parse for strings
- Wraps non-array values in array
- Never throws - returns defaultValue on error

**See Also:** [normalizeObject](#normalizeobject)

---

### normalizeObject

Normalize object by merging with default values.

Creates new object with defaults for missing keys. Does NOT mutate original object.

**Parameters:**
- `obj` (Object|*) - Object to normalize
- `defaults` (Object) - Default values for missing keys

**Returns:** (Object) Normalized object (new instance)

**Example:**
```javascript
normalizeObject({ a: 1 }, { a: 0, b: 2 });
// Returns: { a: 1, b: 2 }

normalizeObject(null, { x: 10, y: 20 });
// Returns: { x: 10, y: 20 }
```

**Notes:**
- Does NOT mutate input objects
- Missing keys filled from defaults
- Existing keys preserved from obj

**See Also:** [fillDefaults](#filldefaults)

---

### fillDefaults

Shallow merge utility - fill missing keys with defaults.

Creates new object without mutating inputs. Uses ES5 compatible manual property copy.

**Parameters:**
- `obj` (Object) - Object with values
- `defaults` (Object) - Default values for missing keys

**Returns:** (Object) New object with merged values

**Example:**
```javascript
fillDefaults({ a: 1 }, { a: 0, b: 2 });
// Returns: { a: 1, b: 2 }

fillDefaults({}, { x: 10, y: 20 });
// Returns: { x: 10, y: 20 }
```

**Notes:**
- Shallow merge only (no deep recursion)
- obj values override defaults
- Used by normalizeObject

**See Also:** [normalizeObject](#normalizeobject), [deepMerge](#deepmerge)

---

## JSON Utilities

Functions for safe JSON parsing, fixing malformed JSON, and transforming JSON data.

**Module:** `00_JsonUtils.js`
**Exports:** Individual functions to `globalThis`

### safeJsonParse

Safe JSON parse with error handling. Never throws.

**Parameters:**
- `jsonString` (string) - JSON string to parse
- `defaultValue` (*) - Value to return on parse failure (default: null)
- `silent` (boolean) - If true, suppress error logging (default: false)

**Returns:** (*) Parsed object or defaultValue

**Example:**
```javascript
safeJsonParse('{"key": "value"}', {});
// Returns: {key: "value"}

safeJsonParse('invalid json', {});
// Returns: {} (defaultValue)

safeJsonParse('invalid json', {}, true);
// Returns: {} (no error logged)
```

**Notes:**
- Never throws - always returns valid value
- Logs errors via UnifiedLogger unless silent=true
- Handles null/undefined input gracefully

**See Also:** [safeJsonStringify](#safejsonstringify), [isValidJson](#isvalidjson)

---

### safeJsonStringify

Safe JSON stringify with circular reference detection.

**Parameters:**
- `obj` (*) - Object to stringify
- `space` (number) - Indentation spaces (0 = compact, default: 0)

**Returns:** (string) JSON string or empty string on error

**Example:**
```javascript
safeJsonStringify({key: "value"}, 2);
// Returns: "{\n  \"key\": \"value\"\n}"

safeJsonStringify({key: "value"});
// Returns: '{"key":"value"}'
```

**Notes:**
- Detects circular references before stringify
- Returns empty string on error
- Logs warnings for circular references

**See Also:** [safeJsonParse](#safejsonparse)

---

### quoteObjectKeys

Quote unquoted keys in JSON string.

Fixes common JSON issue: {key: "value"} → {"key": "value"}

**Parameters:**
- `jsonString` (string) - JSON string with potentially unquoted keys

**Returns:** (string) JSON string with quoted keys

**Example:**
```javascript
quoteObjectKeys('{key: "value", other: 123}');
// Returns: '{"key": "value", "other": 123}'

quoteObjectKeys('{_id: 1, $name: "test"}');
// Returns: '{"_id": 1, "$name": "test"}'
```

**Notes:**
- Handles alphanumeric keys, underscores, dollar signs
- Used by fixMalformedJson
- Regex-based transformation

**See Also:** [fixMalformedJson](#fixmalformedjson)

---

### fixMalformedJson

Fix malformed JSON string.

Handles: missing quotes on keys, trailing commas, single quotes → double quotes, comments.

**Parameters:**
- `jsonString` (string) - Potentially malformed JSON string

**Returns:** (string) Fixed JSON string

**Example:**
```javascript
fixMalformedJson("{key: 'value', arr: [1,2,],}");
// Returns: '{"key": "value", "arr": [1,2]}'

fixMalformedJson("{'name': 'John', /* comment */ 'age': 30}");
// Returns: '{"name": "John", "age": 30}'
```

**Notes:**
- Replaces single quotes with double quotes
- Removes trailing commas
- Strips // and /* */ comments
- Multiple fixes applied sequentially

**See Also:** [quoteObjectKeys](#quoteobjectkeys), [stripJsonComments](#stripjsoncomments)

---

### deepMerge

Deep merge two objects recursively.

**Parameters:**
- `target` (Object) - Target object (modified in place)
- `source` (Object) - Source object to merge from

**Returns:** (Object) Merged object (same reference as target)

**Example:**
```javascript
deepMerge({a: 1, b: {c: 2}}, {b: {d: 3}, e: 4});
// Returns: {a: 1, b: {c: 2, d: 3}, e: 4}

deepMerge({arr: [1,2]}, {arr: [3,4]});
// Returns: {arr: [1,2,3,4]} (arrays concatenated)
```

**Notes:**
- Mutates target object
- Recursively merges nested objects
- Arrays are concatenated, not merged
- Source values override target for primitives

**See Also:** [deepClone](#deepclone), [fillDefaults](#filldefaults)

---

### deepClone

Deep clone object/array.

**Parameters:**
- `obj` (*) - Object or array to clone

**Returns:** (*) Deep cloned copy

**Example:**
```javascript
var original = {a: 1, b: {c: 2}};
var clone = deepClone(original);
clone.b.c = 3;
// original.b.c is still 2
```

**Notes:**
- Handles nested objects and arrays
- Handles Date objects
- Does NOT handle functions, RegExp, Map, Set
- Recursively clones all properties

**See Also:** [deepMerge](#deepmerge)

---

### isValidJson

Check if string is valid JSON.

**Parameters:**
- `str` (string) - String to validate

**Returns:** (boolean) True if valid JSON

**Example:**
```javascript
isValidJson('{"key": "value"}');
// Returns: true

isValidJson('{invalid json}');
// Returns: false

isValidJson('null');
// Returns: true
```

**Notes:**
- Uses JSON.parse internally
- Never throws - returns boolean
- Handles edge cases (null, numbers, arrays)

**See Also:** [safeJsonParse](#safejsonparse)

---

### stripJsonComments

Strip comments from JSON string.

Removes // and /* */ comments.

**Parameters:**
- `jsonString` (string) - JSON string with comments

**Returns:** (string) JSON string without comments

**Example:**
```javascript
stripJsonComments('{"key": "value" /* comment */}');
// Returns: '{"key": "value" }'

stripJsonComments('{\n  "key": "value" // inline comment\n}');
// Returns: '{\n  "key": "value" \n}'
```

**Notes:**
- Removes /* */ multiline comments
- Removes // single-line comments
- Simple regex-based approach
- Used by fixMalformedJson

**See Also:** [fixMalformedJson](#fixmalformedjson)

---

## Array Utilities

Functions for grouping, filtering, and transforming arrays.

**Module:** `00_ArrayUtils.js`
**Exports:** Individual functions to `globalThis`

### groupBy

Group array elements by key function result.

**Parameters:**
- `array` (Array) - Array to group
- `keyFn` (Function) - Function that returns grouping key for each element

**Returns:** (Object) Object with keys mapped to arrays of elements

**Example:**
```javascript
groupBy([{type: 'a', val: 1}, {type: 'b', val: 2}, {type: 'a', val: 3}],
  function(item) { return item.type; }
);
// Returns: {a: [{type: 'a', val: 1}, {type: 'a', val: 3}], b: [{type: 'b', val: 2}]}

groupBy(['apple', 'banana', 'apricot', 'blueberry'],
  function(item) { return item[0]; }
);
// Returns: {a: ['apple', 'apricot'], b: ['banana', 'blueberry']}
```

**Notes:**
- Nullish keys converted to empty string
- Keys converted to strings for object property access
- Returns empty object for invalid inputs

**See Also:** [uniqueBy](#uniqueby), [partition](#partition)

---

### uniqueBy

Remove duplicates using key function (preserves first occurrence).

**Parameters:**
- `array` (Array) - Array to deduplicate
- `keyFn` (Function) - Function that returns uniqueness key for each element

**Returns:** (Array) Array with duplicates removed

**Example:**
```javascript
uniqueBy([{id: 1, name: 'A'}, {id: 2, name: 'B'}, {id: 1, name: 'C'}],
  function(item) { return item.id; }
);
// Returns: [{id: 1, name: 'A'}, {id: 2, name: 'B'}]

uniqueBy([1, 2, 3, 2, 1, 4], function(item) { return item; });
// Returns: [1, 2, 3, 4]
```

**Notes:**
- First occurrence kept, subsequent duplicates removed
- Keys converted to strings for comparison
- Returns array copy if no key function provided

**See Also:** [groupBy](#groupby)

---

### filterTruthy

Remove all falsy values (null, undefined, false, 0, "", NaN).

**Parameters:**
- `array` (Array) - Array to filter

**Returns:** (Array) Array with all falsy values removed

**Example:**
```javascript
filterTruthy([1, null, 2, undefined, 3, false, 4, 0, 5, ""]);
// Returns: [1, 2, 3, 4, 5]

filterTruthy([true, false, 'text', '']);
// Returns: [true, 'text']
```

**Notes:**
- Removes ALL falsy values including 0 and ""
- Use filterNullish to keep 0, false, ""

**See Also:** [filterNullish](#filternullish)

---

### filterNullish

Remove only null and undefined (keeps false, 0, "").

**Parameters:**
- `array` (Array) - Array to filter

**Returns:** (Array) Array with null/undefined removed

**Example:**
```javascript
filterNullish([1, null, 2, undefined, 3, false, 4, 0, 5, ""]);
// Returns: [1, 2, 3, false, 4, 0, 5, ""]

filterNullish([null, 0, false, undefined, '']);
// Returns: [0, false, '']
```

**Notes:**
- Only removes null and undefined
- Preserves 0, false, "" (unlike filterTruthy)
- More lenient than filterTruthy

**See Also:** [filterTruthy](#filtertruthy)

---

### chunk

Split array into chunks of specified size.

**Parameters:**
- `array` (Array) - Array to chunk
- `size` (number) - Chunk size (must be > 0)

**Returns:** (Array<Array>) Array of chunks

**Example:**
```javascript
chunk([1, 2, 3, 4, 5, 6, 7], 3);
// Returns: [[1, 2, 3], [4, 5, 6], [7]]

chunk(['a', 'b', 'c', 'd'], 2);
// Returns: [['a', 'b'], ['c', 'd']]
```

**Notes:**
- Last chunk may be smaller than size
- Invalid size defaults to 1 with warning
- Returns empty array for invalid input

**See Also:** [flatten](#flatten), [partition](#partition)

---

### flatten

Flatten nested arrays to specified depth.

**Parameters:**
- `array` (Array) - Array to flatten
- `depth` (number) - How many levels to flatten (default: Infinity)

**Returns:** (Array) Flattened array

**Example:**
```javascript
flatten([[1, 2], [3, [4, 5]], 6], 1);
// Returns: [1, 2, 3, [4, 5], 6]

flatten([[1, 2], [3, [4, 5]], 6]);
// Returns: [1, 2, 3, 4, 5, 6] (all levels)

flatten([1, [2, [3, [4]]]], 2);
// Returns: [1, 2, 3, [4]]
```

**Notes:**
- Default depth is Infinity (flatten all levels)
- Depth of 0 returns copy of original array
- Recursive implementation

**See Also:** [chunk](#chunk)

---

### partition

Split array into [matching, notMatching] based on predicate.

**Parameters:**
- `array` (Array) - Array to partition
- `predicateFn` (Function) - Function that returns boolean for each element

**Returns:** (Array<Array>) Tuple [matching, notMatching]

**Example:**
```javascript
partition([1, 2, 3, 4, 5, 6], function(x) { return x % 2 === 0; });
// Returns: [[2, 4, 6], [1, 3, 5]]

partition(['apple', 'apricot', 'banana', 'avocado'],
  function(x) { return x[0] === 'a'; }
);
// Returns: [['apple', 'apricot', 'avocado'], ['banana']]
```

**Notes:**
- Always returns 2-element array
- First element: items matching predicate
- Second element: items not matching predicate

**See Also:** [groupBy](#groupby), [filterTruthy](#filtertruthy)

---

### pluck

Extract property from array of objects.

**Parameters:**
- `array` (Array) - Array of objects
- `key` (string) - Property name to extract

**Returns:** (Array) Array of property values

**Example:**
```javascript
pluck([{id: 1, name: 'A'}, {id: 2, name: 'B'}], 'name');
// Returns: ['A', 'B']

pluck([{x: 10}, {x: 20}, {x: 30}], 'x');
// Returns: [10, 20, 30]
```

**Notes:**
- Only extracts if property exists in object
- Skips items without the property
- Returns empty array for invalid inputs

**See Also:** [groupBy](#groupby)

---

## Validation Utilities

Functions for validating emails, dates, required fields, and data types.

**Module:** `00_ValidationUtils.js`
**Exports:** Individual functions to `globalThis`

### isValidEmail

Validate email address (RFC 5322 basic pattern).

**Parameters:**
- `email` (string) - Email address to validate

**Returns:** (boolean) True if valid email format

**Example:**
```javascript
isValidEmail('user@example.com');
// Returns: true

isValidEmail('invalid.email');
// Returns: false

isValidEmail('user@domain');
// Returns: false
```

**Notes:**
- Basic RFC 5322 pattern (sufficient for most cases)
- Checks for @ and domain with extension
- Does NOT verify email exists (format only)

**See Also:** [isValidUrl](#isvalidurl), [sanitizeInput](#sanitizeinput)

---

### isValidDate

Validate date string.

**Parameters:**
- `dateStr` (string) - Date string to validate
- `format` (string) - Optional format hint (currently unused)

**Returns:** (boolean) True if valid date

**Example:**
```javascript
isValidDate('2026-01-12');
// Returns: true

isValidDate('invalid-date');
// Returns: false

isValidDate('2026/01/12');
// Returns: true
```

**Notes:**
- Uses JavaScript Date parsing
- Accepts various formats (ISO, US, etc.)
- Future: format parameter for strict validation

**See Also:** [isValidEmail](#isvalidemail)

---

### isNumeric

Check if value is numeric (string or number).

**Parameters:**
- `value` (*) - Value to check

**Returns:** (boolean) True if value is numeric

**Example:**
```javascript
isNumeric(123);
// Returns: true

isNumeric('456');
// Returns: true

isNumeric('abc');
// Returns: false

isNumeric(null);
// Returns: false
```

**Notes:**
- Accepts both numbers and numeric strings
- Empty string returns false
- NaN returns false

**See Also:** [normalizeNumber](#normalizenumber), [isInRange](#isinrange)

---

### isInRange

Check if numeric value is in range.

**Parameters:**
- `value` (number|string) - Value to check
- `min` (number) - Minimum value
- `max` (number) - Maximum value
- `inclusive` (boolean) - Include min/max in range (default: true)

**Returns:** (boolean) True if value is in range

**Example:**
```javascript
isInRange(5, 1, 10);
// Returns: true

isInRange(10, 1, 10, true);
// Returns: true (inclusive)

isInRange(10, 1, 10, false);
// Returns: false (exclusive)

isInRange(0, 1, 10);
// Returns: false
```

**Notes:**
- Inclusive by default (>= and <=)
- Set inclusive=false for exclusive (> and <)
- All parameters must be numeric

**See Also:** [isNumeric](#isnumeric)

---

### validateRequired

Validate object has required fields.

**Parameters:**
- `obj` (Object) - Object to validate
- `fields` (Array<string>) - Required field names

**Returns:** (Object) {valid: boolean, missing: string[]}

**Example:**
```javascript
validateRequired({name: 'John', email: 'john@example.com'}, ['name', 'email', 'phone']);
// Returns: {valid: false, missing: ['phone']}

validateRequired({name: 'John', email: 'john@example.com'}, ['name', 'email']);
// Returns: {valid: true, missing: []}

validateRequired({name: '', email: 'test@test.com'}, ['name', 'email']);
// Returns: {valid: false, missing: ['name']} (empty string counts as missing)
```

**Notes:**
- Checks for null, undefined, and empty string
- Returns array of missing field names
- Use for form validation

**See Also:** [isNonEmptyString](#isnonemptystring)

---

### isValidUrl

Validate URL (http/https).

**Parameters:**
- `url` (string) - URL to validate

**Returns:** (boolean) True if valid URL

**Example:**
```javascript
isValidUrl('https://example.com');
// Returns: true

isValidUrl('http://example.com/path?query=value');
// Returns: true

isValidUrl('ftp://example.com');
// Returns: false (only http/https)

isValidUrl('not a url');
// Returns: false
```

**Notes:**
- Only accepts http:// and https://
- Uses URL parsing for validation
- Returns false for invalid protocol

**See Also:** [isValidEmail](#isvalidemail)

---

### isNonEmptyString

Check if value is non-empty string (trim whitespace).

**Parameters:**
- `value` (*) - Value to check

**Returns:** (boolean) True if non-empty string after trimming

**Example:**
```javascript
isNonEmptyString('hello');
// Returns: true

isNonEmptyString('   ');
// Returns: false

isNonEmptyString(123);
// Returns: false

isNonEmptyString('');
// Returns: false
```

**Notes:**
- Trims whitespace before checking
- Type must be string (numbers/objects return false)
- Common validation for text inputs

**See Also:** [validateRequired](#validaterequired)

---

### isValidPhoneNumber

Validate phone number (basic validation - digits, +, -, (), spaces).

**Parameters:**
- `phone` (string) - Phone number to validate

**Returns:** (boolean) True if valid phone format

**Example:**
```javascript
isValidPhoneNumber('+1 (555) 123-4567');
// Returns: true

isValidPhoneNumber('555-1234');
// Returns: true (at least 7 digits)

isValidPhoneNumber('abc-defg');
// Returns: false
```

**Notes:**
- Requires at least 7 digits
- Allows +, -, (), spaces
- Basic format check (not country-specific)

**See Also:** [sanitizeInput](#sanitizeinput)

---

### matchesPattern

Match value against regex pattern with error handling.

**Parameters:**
- `value` (string) - Value to match
- `regex` (RegExp|string) - Pattern to match against

**Returns:** (boolean) True if matches, false if no match or error

**Example:**
```javascript
matchesPattern('ABC123', /^[A-Z0-9]+$/);
// Returns: true

matchesPattern('abc', '^[A-Z]+$');
// Returns: false

matchesPattern('test123', /\d+/);
// Returns: true
```

**Notes:**
- Accepts RegExp or string pattern
- Never throws - returns false on invalid regex
- Logs errors for invalid patterns

**See Also:** [isValidEmail](#isvalidemail)

---

### sanitizeInput

Sanitize input by type.

**Parameters:**
- `input` (string) - Input to sanitize
- `type` (string) - Sanitization type ('email', 'phone', 'numeric', 'alphanumeric')

**Returns:** (string) Sanitized input

**Example:**
```javascript
sanitizeInput('  User@Example.COM  ', 'email');
// Returns: 'user@example.com'

sanitizeInput('+1 (555) 123-4567', 'phone');
// Returns: '15551234567'

sanitizeInput('abc123xyz', 'numeric');
// Returns: '123'

sanitizeInput('Hello World!', 'alphanumeric');
// Returns: 'HelloWorld'
```

**Notes:**
- email: lowercase and trim
- phone: remove non-digits (keep leading +)
- numeric: keep only digits
- alphanumeric: keep only letters and numbers

**See Also:** [normalizeString](#normalizestring)

---

## String Utilities

Functions for truncating, capitalizing, slugifying, and escaping strings.

**Module:** `00_StringUtils.js`
**Exports:** Individual functions to `globalThis`

### truncate

Truncate string to maximum length with suffix.

Attempts to break at word boundaries when possible.

**Parameters:**
- `str` (string) - String to truncate
- `maxLength` (number) - Maximum length (including suffix)
- `suffix` (string) - Suffix to append when truncated (default: '...')

**Returns:** (string) Truncated string

**Example:**
```javascript
truncate('The quick brown fox jumps over the lazy dog', 20);
// Returns: "The quick brown..."

truncate('Short', 20);
// Returns: "Short"

truncate('Hello world', 10, '…');
// Returns: "Hello wo…"
```

**Notes:**
- Tries to break at word boundary (last space)
- Only breaks at space if within 60% of target length
- Otherwise breaks at exact character count

**See Also:** [wordCount](#wordcount)

---

### capitalize

Capitalize first letter of string.

**Parameters:**
- `str` (string) - String to capitalize

**Returns:** (string) String with first letter capitalized

**Example:**
```javascript
capitalize('hello world');
// Returns: "Hello world"

capitalize('HELLO');
// Returns: "HELLO"

capitalize('');
// Returns: ""
```

**Notes:**
- Only affects first character
- Rest of string unchanged
- Returns empty string for invalid input

**See Also:** [capitalizeWords](#capitalizewords)

---

### capitalizeWords

Capitalize first letter of each word (title case).

**Parameters:**
- `str` (string) - String to capitalize

**Returns:** (string) String with each word capitalized

**Example:**
```javascript
capitalizeWords('hello world');
// Returns: "Hello World"

capitalizeWords('the quick brown fox');
// Returns: "The Quick Brown Fox"

capitalizeWords('ALREADY UPPERCASE');
// Returns: "ALREADY UPPERCASE"
```

**Notes:**
- Capitalizes each word boundary (\b\w)
- Does NOT lowercase existing uppercase
- Useful for titles and names

**See Also:** [capitalize](#capitalize)

---

### slugify

Create URL-safe slug from string.

Converts to lowercase, replaces spaces with hyphens, removes special characters.

**Parameters:**
- `str` (string) - String to slugify

**Returns:** (string) URL-safe slug

**Example:**
```javascript
slugify('My Amazing Post!');
// Returns: "my-amazing-post"

slugify('Hello World 123');
// Returns: "hello-world-123"

slugify('Special @#$ Characters');
// Returns: "special-characters"
```

**Notes:**
- Lowercase transformation
- Spaces/underscores → hyphens
- Removes non-alphanumeric (except hyphens)
- Removes consecutive/leading/trailing hyphens

**See Also:** [normalizeKey](#normalizekey)

---

### escapeHtml

Escape HTML special characters.

Prevents XSS by converting HTML special characters to entities.

**Parameters:**
- `str` (string) - String to escape

**Returns:** (string) HTML-safe string

**Example:**
```javascript
escapeHtml('<script>alert("XSS")</script>');
// Returns: "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"

escapeHtml('Hello & goodbye');
// Returns: "Hello &amp; goodbye"

escapeHtml("It's a test");
// Returns: "It&#39;s a test"
```

**Notes:**
- Escapes: & < > " '
- Essential for preventing XSS attacks
- Use before inserting user input into HTML

**See Also:** [unescapeHtml](#unescapehtml)

---

### unescapeHtml

Unescape HTML entities to special characters.

Reverses escapeHtml operation.

**Parameters:**
- `str` (string) - HTML-escaped string

**Returns:** (string) Unescaped string

**Example:**
```javascript
unescapeHtml('&lt;div&gt;Hello&lt;/div&gt;');
// Returns: "<div>Hello</div>"

unescapeHtml('Hello &amp; goodbye');
// Returns: "Hello & goodbye"

unescapeHtml('It&#39;s a test');
// Returns: "It's a test"
```

**Notes:**
- Unescapes: &amp; &lt; &gt; &quot; &#39;
- Use for displaying escaped content
- Inverse of escapeHtml

**See Also:** [escapeHtml](#escapehtml)

---

### wordCount

Count words in string.

Splits by whitespace and counts non-empty tokens.

**Parameters:**
- `str` (string) - String to count words in

**Returns:** (number) Word count

**Example:**
```javascript
wordCount('Hello world');
// Returns: 2

wordCount('The quick brown fox');
// Returns: 4

wordCount('   Multiple   spaces   ');
// Returns: 2
```

**Notes:**
- Splits by any whitespace (\s+)
- Trims before counting
- Empty strings return 0

**See Also:** [truncate](#truncate)

---

### replaceAll

Replace all occurrences of search string with replacement.

Polyfill for String.prototype.replaceAll() for older JavaScript environments.

**Parameters:**
- `str` (string) - Source string
- `search` (string) - String to search for
- `replace` (string) - Replacement string

**Returns:** (string) String with all occurrences replaced

**Example:**
```javascript
replaceAll('Hello world, hello universe', 'hello', 'goodbye');
// Returns: "Hello world, goodbye universe"

replaceAll('foo-bar-baz', '-', '_');
// Returns: "foo_bar_baz"

replaceAll('test', 'x', 'y');
// Returns: "test"
```

**Notes:**
- Case-sensitive replacement
- Escapes regex special characters in search
- Global replacement (all occurrences)

**See Also:** [normalizeString](#normalizestring)

---

## Error Utilities

Functions for creating, formatting, and handling errors with retry mechanisms.

**Module:** `00_ErrorUtils.js`
**Exports:** Classes and functions to `globalThis`

### AppError

Structured error class that survives Apps Script → client round trips.

**Constructor:**
- `code` (string) - Machine-readable error code
- `message` (string) - Human-readable message
- `details` (Object) - Optional context object

**Example:**
```javascript
throw new AppError('CONFIG_LOAD_FAILED', 'Unable to load configuration', {
  file: 'settings.json',
  timestamp: Date.now()
});
```

**Notes:**
- Extends Error class
- name property set to 'AppError'
- Serializable for client/server communication

**See Also:** [AIUserError](#aiusererror), [createError](#createerror)

---

### AIUserError

Structured error for user-facing error messages with suggestions.

**Constructor:**
- `step` (string) - Machine-readable step identifier
- `message` (string) - Human-readable summary for UI
- `suggestion` (string) - Optional remediation hint
- `details` (Object) - Diagnostic context (logged only)

**Example:**
```javascript
throw new AIUserError(
  'VALIDATION_FAILED',
  'Email address is invalid',
  'Please check the email format and try again',
  {email: userInput}
);
```

**Notes:**
- Includes user-friendly suggestion
- Serializes as JSON for transport
- Details excluded from user display

**See Also:** [asAIUserError](#asaiusererror), [AppError](#apperror)

---

### asAIUserError

Convert any thrown value into an AIUserError instance.

**Parameters:**
- `error` (*) - Error to convert
- `fallbackStep` (string) - Step identifier if error has none
- `suggestion` (string) - Optional suggestion text

**Returns:** (AIUserError) Converted error

**Example:**
```javascript
try {
  riskyOperation();
} catch (e) {
  throw asAIUserError(e, 'OPERATION_FAILED', 'Please try again');
}
```

**Notes:**
- Already AIUserError: returned as-is
- Other errors: converted to AIUserError
- Stack trace truncated to 800 chars

**See Also:** [AIUserError](#aiusererror)

---

### createError

Create standardized error object.

**Parameters:**
- `code` (string) - Error code (format: MODULE_OPERATION_REASON)
- `message` (string) - User-facing error message
- `context` (Object) - Additional context

**Returns:** (Error) Error object with standardized properties

**Example:**
```javascript
createError('CONFIG_LOAD_FAILED', 'Unable to load configuration', {
  file: 'settings.json'
});
```

**Notes:**
- Includes timestamp automatically
- isCustomError flag for identification
- Consistent error structure

**See Also:** [AppError](#apperror), [wrapError](#wraperror)

---

### formatErrorMessage

Format error for user display (user-friendly).

**Parameters:**
- `error` (Error|Object) - Error to format

**Returns:** (string) User-friendly error message

**Example:**
```javascript
formatErrorMessage(new Error('Database connection failed'));
// Returns: "Database connection failed"

formatErrorMessage({code: 'CONFIG_LOAD_FAILED', message: 'Cannot load config'});
// Returns: "Config error: Cannot load config"
```

**Notes:**
- Strips technical details (stack traces)
- Extracts category from error code
- Fallback: generic message

**See Also:** [formatErrorLog](#formaterrorlog)

---

### formatErrorLog

Format error for logging (technical details).

**Parameters:**
- `error` (Error|Object) - Error to format

**Returns:** (string) Detailed error log string

**Example:**
```javascript
formatErrorLog({
  code: 'DB_QUERY_FAILED',
  message: 'Query timeout',
  context: {query: 'SELECT *', timeout: 5000}
});
// Returns: "[DB_QUERY_FAILED] Query timeout | Context: {...} | Time: ..."
```

**Notes:**
- Includes code, message, context, timestamp
- Stack trace (first 3 lines)
- Pipe-separated format for parsing

**See Also:** [formatErrorMessage](#formaterrormessage)

---

### wrapError

Wrap native error with additional context.

**Parameters:**
- `originalError` (Error) - Original error to wrap
- `context` (Object) - Additional context

**Returns:** (Error) Wrapped error

**Example:**
```javascript
try {
  apiCall();
} catch (e) {
  throw wrapError(e, {
    operation: 'sync',
    timestamp: Date.now()
  });
}
```

**Notes:**
- Preserves original error and stack
- Adds context without losing details
- Useful for error enrichment

**See Also:** [createError](#createerror)

---

### isKnownError

Check if error is a known/expected error type.

**Parameters:**
- `error` (Error|Object) - Error to check

**Returns:** (boolean) True if error is custom/known type

**Example:**
```javascript
isKnownError(new AppError('CODE', 'message'));
// Returns: true

isKnownError(new Error('native error'));
// Returns: false

isKnownError({code: 'CUSTOM', message: 'error'});
// Returns: true
```

**Notes:**
- Checks for isCustomError flag or code property
- Helps distinguish application vs system errors

**See Also:** [createError](#createerror), [AppError](#apperror)

---

### retryOnError

Retry function on error with exponential backoff.

**Parameters:**
- `fn` (Function) - Function to retry
- `maxAttempts` (number) - Maximum retry attempts (default: 3)
- `delayMs` (number) - Initial delay in milliseconds (default: 1000)

**Returns:** (*) Result of successful function call

**Example:**
```javascript
retryOnError(
  function() { return unstableApiCall(); },
  3,
  1000
);
// Retries up to 3 times with exponential backoff (1s, 2s, 4s)
```

**Notes:**
- Exponential backoff: delay * 2^(attempt-1)
- Throws last error if all attempts fail
- Uses Utilities.sleep for delays

**See Also:** [executeRetry](#executeretry), [catchAndLog](#catchandlog)

---

### catchAndLog

Execute function, catch errors, log them, return fallback.

**Parameters:**
- `fn` (Function) - Function to execute
- `category` (string) - Category for logging
- `fallbackValue` (*) - Value to return on error

**Returns:** (*) Result or fallback value

**Example:**
```javascript
const result = catchAndLog(
  function() { return riskyOperation(); },
  'MyModule',
  defaultValue
);
```

**Notes:**
- Never throws - always returns value
- Logs errors via UnifiedLogger
- Graceful degradation pattern

**See Also:** [retryOnError](#retryonerror)

---

### aggregateErrors

Aggregate multiple errors into summary.

**Parameters:**
- `errors` (Array<Error>) - Array of errors to aggregate

**Returns:** (Error) Combined error with all details

**Example:**
```javascript
aggregateErrors([
  new Error('Error 1'),
  new Error('Error 2'),
  new Error('Error 3')
]);
// Returns single error with all details in context
```

**Notes:**
- Combines multiple errors into one
- Preserves all error details
- Returns single error if array has one

**See Also:** [createError](#createerror)

---

### executeRetry

Execute retry callback with circuit breaker protection.

**Parameters:**
- `operationKey` (string) - Unique key identifying operation
- `callbackName` (string) - Name of function in globalThis
- `maxAttempts` (number) - Maximum retry attempts (default: 3)

**Example:**
```javascript
// Define retry function
globalThis.retryLoadConfig = function() {
  loadConfiguration();
};

// Execute with retry
executeRetry('config_load', 'retryLoadConfig', 3);
```

**Notes:**
- Circuit breaker activates after maxAttempts
- Uses function name string (not reference)
- Shows fallback alert when circuit trips

**See Also:** [resetRetryCounter](#resetretrycounter), [createRetryableError](#createretryableerror)

---

### resetRetryCounter

Reset retry counter for an operation.

**Parameters:**
- `operationKey` (string) - Operation key to reset

**Example:**
```javascript
// After successful operation
loadConfiguration();
resetRetryCounter('config_load');
```

**Notes:**
- Call after successful operation
- Allows retries for next failure
- Logs reset action

**See Also:** [executeRetry](#executeretry)

---

### createRetryableError

Create retryable error object for retry mechanism.

**Parameters:**
- `error` (Error) - Original error
- `operationKey` (string) - Circuit breaker key
- `retryCallbackName` (string) - Function name in globalThis
- `context` (string) - Context description

**Returns:** (Object) Error with retry metadata

**Example:**
```javascript
createRetryableError(
  new Error('Load failed'),
  'config_load',
  'retryLoadConfig',
  'Configuration Loading'
);
```

**Notes:**
- Uses function name string (not reference)
- Includes retry metadata
- Compatible with executeRetry

**See Also:** [executeRetry](#executeretry)

---

## Configuration API

Unified configuration management system for accessing all configuration sources.

**Module:** `ConfigurationManager.js`
**Export:** `ConfigurationManager` object

### get (ConfigurationManager)

Get configuration value by dotted key notation.

Loads from appropriate source (sheets, properties, business rules), validates, and caches.

**Parameters:**
- `key` (string) - Dotted key notation (e.g., 'brief.profiles', 'cost.feePercentages')

**Returns:** (*) Configuration value (type depends on key)

**Example:**
```javascript
// Sheet-driven config
const profiles = ConfigurationManager.get('brief.profiles');
// Returns: [{label: 'Standard', description: '...', ...}, ...]

// Script Properties (secrets)
const apiKey = ConfigurationManager.get('properties.openai.apiKey');
// Returns: 'sk-...' (string)

// Business rules
const feePercentages = ConfigurationManager.get('cost.feePercentages');
// Returns: {standard: 0.15, premium: 0.12, ...}
```

**Available Keys:**
- Sheet configs: `brief.profiles`, `scope.phases`, `taxonomy.overrides`, `catalog.*`, `column.map`
- Properties: `properties.*.*` (e.g., `properties.openai.apiKey`)
- Business rules: `cost.*`, `scope.categories`, `scope.phaseMapping`

**Notes:**
- First call loads and caches (slow)
- Subsequent calls return cached value (fast)
- Use invalidate(key) to force reload
- Business rules validated during load

**See Also:** [has (ConfigurationManager)](#has-configurationmanager), [invalidate](#invalidate-configurationmanager)

---

### has (ConfigurationManager)

Check if configuration key exists and is available.

**Parameters:**
- `key` (string) - Dotted key to check

**Returns:** (boolean) True if config exists, false otherwise

**Example:**
```javascript
// Check before loading
if (ConfigurationManager.has('brief.profiles')) {
  const profiles = ConfigurationManager.get('brief.profiles');
}

// Check optional config
const hasCustomRules = ConfigurationManager.has('cost.customRules');
```

**Notes:**
- Faster than get() (doesn't load config)
- Returns true for cached configs
- Returns false for unknown keys (doesn't throw)
- Safe guard pattern for optional configs

**See Also:** [get (ConfigurationManager)](#get-configurationmanager)

---

### invalidate (ConfigurationManager)

Invalidate cached configuration to force reload on next get().

**Parameters:**
- `key` (string) - Specific key to invalidate (omit for all)

**Example:**
```javascript
// Invalidate specific config after sheet update
ConfigurationManager.invalidate('brief.profiles');

// Invalidate all configs
ConfigurationManager.invalidate();

// Common pattern: invalidate after update
PropertiesService.getScriptProperties().setProperty('API_KEY', newKey);
ConfigurationManager.invalidate('properties.openai.apiKey');
```

**Notes:**
- Clears ConfigurationManager cache
- Cascades to loader caches (Sheet, Properties, BusinessRules)
- Never throws - graceful degradation
- Use after configuration changes

**See Also:** [get (ConfigurationManager)](#get-configurationmanager)

---

### validateAll

Validate all business rules configurations.

**Returns:** (Object) Validation report:
```javascript
{
  valid: boolean,
  results: Object,
  totalWarnings: number
}
```

**Example:**
```javascript
const report = ConfigurationManager.validateAll();
if (!report.valid) {
  console.log('Validation warnings:', report.totalWarnings);
  console.log('Details:', report.results);
}
```

**Notes:**
- Validates: cost.*, scope.categories, scope.phaseMapping
- Warnings logged but configs still usable
- Check report.results for per-key details

**See Also:** [getValidationErrors](#getvalidationerrors)

---

### getValidationErrors

Get validation errors for all configurations.

**Returns:** (Array<Object>) Array of warning objects:
```javascript
[{
  key: string,
  warnings: string[]
}, ...]
```

**Example:**
```javascript
const errors = ConfigurationManager.getValidationErrors();
if (errors.length > 0) {
  errors.forEach(e => {
    console.error(e.key + ':', e.warnings);
  });
}
```

**Notes:**
- Convenience wrapper for validateAll()
- Returns only configs with warnings
- Empty array if all valid

**See Also:** [validateAll](#validateall)

---

## Entry Points

Main entry points for user interaction with the system.

### onOpen

Apps Script onOpen trigger - initializes custom menu.

**Parameters:**
- `event` (Object) - Apps Script event object

**Example:**
```javascript
// Automatically called by Apps Script
function onOpen(event) {
  // Implementation in Menu.js
}
```

**Notes:**
- Triggered when spreadsheet opens
- Builds custom menu with staged loading
- Stage 1 (critical), Stage 2 (enhanced), Stage 3 (admin)

**See Also:** [showAISidebar](#showaisidebar)

---

### showAISidebar

Display AI-powered sidebar for scope generation.

**Example:**
```javascript
// Called from menu
function showAISidebar() {
  // Shows HTML sidebar with AI assistant
}
```

**Notes:**
- Main entry point for AI features
- Opens HTML sidebar in spreadsheet
- Handles scope drafting and generation

**See Also:** [onOpen](#onopen)

---

## Function Count Summary

- **Normalization Utilities:** 8 functions
- **JSON Utilities:** 9 functions (8 public + 1 private)
- **Array Utilities:** 8 functions
- **Validation Utilities:** 10 functions
- **String Utilities:** 8 functions
- **Error Utilities:** 13 functions
- **Configuration API:** 5 functions
- **Entry Points:** 2 functions

**Total Public Functions Documented:** 56 functions

---

## Best Practices

### Error Handling

```javascript
// Always use try-catch with fallback
try {
  const result = riskyOperation();
} catch (error) {
  UnifiedLogger.error('Module', 'Operation failed', {error: error.message});
  return fallbackValue;
}

// Or use catchAndLog helper
const result = catchAndLog(
  function() { return riskyOperation(); },
  'Module',
  fallbackValue
);
```

### Configuration Access

```javascript
// Check availability before loading
if (ConfigurationManager.has('optional.config')) {
  const config = ConfigurationManager.get('optional.config');
  useConfig(config);
}

// Invalidate after changes
updateConfiguration();
ConfigurationManager.invalidate('config.key');
```

### Data Validation

```javascript
// Validate required fields
const validation = validateRequired(data, ['name', 'email', 'phone']);
if (!validation.valid) {
  throw new Error('Missing fields: ' + validation.missing.join(', '));
}

// Validate format
if (!isValidEmail(email)) {
  throw new Error('Invalid email format');
}
```

### Array Operations

```javascript
// Group by property
const byType = groupBy(items, function(item) { return item.type; });

// Remove duplicates
const unique = uniqueBy(items, function(item) { return item.id; });

// Filter safely
const clean = filterNullish(items);
```

---

## Version History

- **1.0.0** (2026-01-12): Initial API documentation release
  - Documented 56 public functions
  - Organized by module with examples
  - Added alphabetical index and common use cases

---

## Support

For issues or questions:
- Check function examples and notes sections
- Review module source files for implementation details
- Consult ARCHITECTURE.md for system design
- See CONFIGURATION.md for configuration options

---

*End of API Reference*

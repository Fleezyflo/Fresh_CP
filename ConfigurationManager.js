/**
 * ConfigurationManager - Single entry point for ALL configuration access
 *
 * Purpose:
 * - Provides unified API for accessing configuration from all sources
 * - Coordinates specialized loaders (Sheet, Properties, BusinessRules)
 * - Manages caching, validation, and error handling
 * - Lazy loading pattern (configs loaded on first access)
 *
 * Architecture:
 * - **Coordinator pattern**: Delegates to specialized loaders
 * - **Loaders**: SheetConfigLoader, PropertiesLoader, BusinessRulesLoader
 * - **Validation**: Basic structure validation for business rules
 * - **Caching**: In-memory Map cache with TTL and invalidation support
 * - **Error handling**: Comprehensive try-catch with helpful error messages
 * - **Logging**: UnifiedLogger with console.error fallback (logging-the-logger pattern)
 *
 * ======================================================================================
 * AVAILABLE CONFIGURATION KEYS
 * ======================================================================================
 *
 * **Sheet-Driven Configurations** (SheetConfigLoader):
 * - 'brief.profiles'         → Brief profiles from "Config: Brief Profiles" sheet
 * - 'scope.phases'           → Scope phases from "Config: Scope Phases" sheet
 * - 'taxonomy.overrides'     → Phase taxonomy overrides from "Config: Phase Taxonomy Overrides" sheet
 * - 'catalog.prefixes'       → Catalog prefixes from "Config: Catalog Prefixes" sheet
 * - 'catalog.resource'       → Resource catalog from "Catalog: Resources" sheet
 * - 'catalog.scope'          → Scope catalog from "Catalog: Scopes" sheet
 * - 'column.map'             → Column mappings from "Config: Column Map" sheet
 *
 * **Config Sheet Arbitrary Entries** (SheetKeyValueLoader - NEW):
 * - 'sheet.DEFAULT_CURRENCY'              → Business constant from Config Sheet
 * - 'sheet.XERO_TAX_TYPE'                 → Tax type configuration
 * - 'sheet.SECTION_TAXONOMY'              → Section taxonomy JSON
 * - 'sheet.VECTOR_SEARCH_QUERY_WORD_LIMIT' → Query limit config
 * - 'sheet.TARGET_MARGIN_PCT'             → Target margin percentage
 * - 'sheet.[ANY_UPPER_SNAKE_CASE]'        → Any arbitrary Config Sheet key
 *
 * **Script Properties** (PropertiesLoader - Secrets):
 * - 'properties.openai.apiKey'         → OpenAI API key (OPENAI_API_KEY)
 * - 'properties.xero.clientId'         → Xero OAuth client ID (XERO_CLIENT_ID)
 * - 'properties.xero.clientSecret'     → Xero OAuth client secret (XERO_CLIENT_SECRET)
 * - 'properties.[any].[any]'           → Dynamically converts to UPPER_SNAKE_CASE
 *
 * **Business Rules** (BusinessRulesLoader - Static Constants):
 * - 'cost.feePercentages'       → Fee % by client type {standard, premium, enterprise, nonprofit}
 * - 'cost.markupRules'          → Markup rules by category {crew, equipment, location, services, default}
 * - 'cost.calculationMethods'   → Calculation method constants {FIXED, RATE, DAY_RATE, TIERED, CUSTOM}
 * - 'cost.categoryPricingMap'   → Default pricing modes by category
 * - 'scope.categories'          → Scope category definitions (mostly in sheets, minimal fallback)
 * - 'scope.phaseMapping'        → Phase-to-category mapping (mostly in sheets, minimal fallback)
 *
 * ======================================================================================
 * USAGE EXAMPLES
 * ======================================================================================
 *
 * @example
 * // Sheet-driven configs
 * const profiles = ConfigurationManager.get('brief.profiles');
 * const phases = ConfigurationManager.get('scope.phases');
 * const catalogPrefixes = ConfigurationManager.get('catalog.prefixes');
 *
 * @example
 * // Properties (secrets/credentials) - Never logged
 * const apiKey = ConfigurationManager.get('properties.openai.apiKey');
 * const xeroId = ConfigurationManager.get('properties.xero.clientId');
 *
 * @example
 * // Business rules - Validated on load
 * const feePercentages = ConfigurationManager.get('cost.feePercentages');
 * const standardFee = feePercentages.standard; // 0.15 (15%)
 * const markupRules = ConfigurationManager.get('cost.markupRules');
 * const crewMarkup = markupRules.crew; // {percentage: 0.25, minAmount: 50}
 *
 * @example
 * // Check existence before accessing
 * if (ConfigurationManager.has('brief.profiles')) {
 *   const profiles = ConfigurationManager.get('brief.profiles');
 * }
 *
 * @example
 * // Invalidate cache when config changes
 * ConfigurationManager.invalidate('brief.profiles'); // Specific key
 * ConfigurationManager.invalidate(); // All keys
 *
 * ======================================================================================
 * CACHING BEHAVIOR
 * ======================================================================================
 *
 * - **In-memory cache**: Configs cached in Map after first load
 * - **Cache lifetime**: Until invalidate() called or process restarts
 * - **Loader caching**: Each loader (Sheet, Properties, BusinessRules) has own cache
 * - **Cache hits**: Instant return (<1ms), no loader calls
 * - **Cache misses**: Loader called, result cached, subsequent calls instant
 * - **Invalidation**: invalidate(key) clears both ConfigurationManager and loader caches
 *
 * ======================================================================================
 * VALIDATION RULES
 * ======================================================================================
 *
 * **Sheet configs**: Validated by SheetConfigLoader (headers, required fields)
 * **Properties**: No validation (secrets, arbitrary structure)
 * **Business rules**: Basic structure validation:
 *   - cost.feePercentages: Must have 'standard' field
 *   - cost.markupRules: Must have 'default' field with percentage and minAmount
 *   - Others: Type checking only
 *
 * Validation failures:
 * - **Warning logged**: Config returned but may be invalid (degraded mode)
 * - **Not thrown**: Allows system to continue with potentially incomplete config
 * - **Check logs**: Look for "Config validation warning" in UnifiedLogger output
 *
 * ======================================================================================
 * ERROR HANDLING
 * ======================================================================================
 *
 * **Common Errors:**
 *
 * 1. "Invalid config key format":
 *    - **Cause**: Key missing dot (e.g., 'briefprofiles' instead of 'brief.profiles')
 *    - **Fix**: Use dotted notation: 'category.type'
 *
 * 2. "Unknown configuration key":
 *    - **Cause**: Key not recognized by any loader
 *    - **Fix**: Check AVAILABLE CONFIGURATION KEYS section above
 *    - **Available keys listed in error message**
 *
 * 3. "SheetConfigLoader not available":
 *    - **Cause**: SheetConfigLoader.js not loaded yet
 *    - **Fix**: Ensure load order (SheetConfigLoader before ConfigurationManager)
 *
 * 4. "Config validation warning":
 *    - **Cause**: Loaded config doesn't match expected structure
 *    - **Effect**: Config returned but may cause issues downstream
 *    - **Fix**: Check source (sheet/properties/code) for completeness
 *
 * **All errors logged with**:
 * - UnifiedLogger (category: 'ConfigurationManager')
 * - Fallback console.error if logger fails (logging-the-logger pattern)
 * - Helpful context (key, loader, error details)
 *
 * ======================================================================================
 * MIGRATION GUIDE
 * ======================================================================================
 *
 * **From ConfigLoader:**
 * ```
 * OLD: ConfigLoader.loadBriefProfiles()
 * NEW: ConfigurationManager.get('brief.profiles')
 *
 * OLD: ConfigLoader.loadScopePhases()
 * NEW: ConfigurationManager.get('scope.phases')
 * ```
 *
 * **From CostCalculationConfig:**
 * ```
 * OLD: CostCalculationConfig.FEE_PERCENTAGES.standard
 * NEW: ConfigurationManager.get('cost.feePercentages').standard
 *
 * OLD: CostCalculationConfig.getMarkupRules('crew')
 * NEW: ConfigurationManager.get('cost.markupRules').crew
 * ```
 *
 * **From PropertiesCache:**
 * ```
 * OLD: getCachedProperty('OPENAI_API_KEY')
 * NEW: ConfigurationManager.get('properties.openai.apiKey')
 *
 * OLD: getCachedProperty('XERO_CLIENT_ID')
 * NEW: ConfigurationManager.get('properties.xero.clientId')
 * ```
 *
 * **Benefits of migration:**
 * - Single API for all configs (no more "where is this config?")
 * - Consistent caching across all sources
 * - Validation and error handling built-in
 * - Easier to mock/test (one manager instead of 8 systems)
 *
 * @module ConfigurationManager
 * @version 1.1.0
 *  *  */

// ===== Private State =====

/**
 * Cache for loaded configurations
 * @type {Map<string, any>}
 * @private
 */
const configCache_ = new Map();

/**
 * Loader registry
 * @type {Object}
 * @private
 */
const loaders_ = {
  sheet: null,           // SheetConfigLoader (initialized lazily)
  sheetKeyValue: null,   // SheetKeyValueLoader (arbitrary Config entries)
  properties: null,      // PropertiesLoader (Plan 3)
  businessRules: null    // BusinessRulesLoader (Plan 3)
};

// ===== Private Helpers =====

/**
 * Validate business rules config structure
 * @private
 * @param {string} key - Config key
 * @param {*} data - Loaded config data
 * @returns {Object} {valid, warnings} - Validation result
 */
function validateBusinessRules_(key, data) {
  const result = {
    valid: true,
    warnings: []
  };

  if (!data || typeof data !== 'object') {
    result.valid = false;
    result.warnings.push('Config is null or not an object');
    return result;
  }

  // Validate cost.feePercentages
  if (key === 'cost.feePercentages') {
    if (!('standard' in data)) {
      result.warnings.push('Missing required field: standard');
    }
    // Check numeric values
    Object.keys(data).forEach(function(clientType) {
      if (typeof data[clientType] !== 'number') {
        result.warnings.push('Field "' + clientType + '" should be number, got ' + typeof data[clientType]);
      }
    });
  }

  // Validate cost.markupRules
  if (key === 'cost.markupRules') {
    if (!('default' in data)) {
      result.warnings.push('Missing required field: default');
    }
    // Check structure
    Object.keys(data).forEach(function(category) {
      const rule = data[category];
      if (typeof rule !== 'object') {
        result.warnings.push('Category "' + category + '" should be object, got ' + typeof rule);
      } else {
        if (!('percentage' in rule)) {
          result.warnings.push('Category "' + category + '" missing percentage field');
        }
        if (!('minAmount' in rule)) {
          result.warnings.push('Category "' + category + '" missing minAmount field');
        }
      }
    });
  }

  // Validate cost.calculationMethods
  if (key === 'cost.calculationMethods') {
    const expectedMethods = ['FIXED', 'RATE', 'DAY_RATE', 'TIERED', 'CUSTOM'];
    expectedMethods.forEach(function(method) {
      if (!(method in data)) {
        result.warnings.push('Missing calculation method: ' + method);
      }
    });
  }

  return result;
}

/**
 * Get or initialize sheet loader
 * @private
 * @returns {Object} SheetConfigLoader instance
 */
function getSheetLoader_() {
  if (!loaders_.sheet) {
    if (typeof SheetConfigLoader === 'undefined') {
      throw createError(
        'CONFIG_LOADER_MISSING',
        'SheetConfigLoader not available',
        {
          loader: 'SheetConfigLoader',
          cause: 'SheetConfigLoader.js not loaded or not loaded before ConfigurationManager.js',
          fix: 'Ensure SheetConfigLoader.js exists and loads first (alphabetical order)'
        }
      );
    }

    // Validate loader has required methods
    if (typeof SheetConfigLoader.load !== 'function') {
      throw createError(
        'CONFIG_LOADER_INVALID',
        'SheetConfigLoader.load() method not found',
        {
          loader: 'SheetConfigLoader',
          missingMethod: 'load'
        }
      );
    }

    loaders_.sheet = SheetConfigLoader;
    try {
      UnifiedLogger.info('ConfigurationManager', 'SheetConfigLoader initialized', {
        hasLoad: typeof SheetConfigLoader.load === 'function',
        hasInvalidate: typeof SheetConfigLoader.invalidate === 'function'
      });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }
  }
  return loaders_.sheet;
}

/**
 * Get or initialize SheetKeyValueLoader
 * @private
 * @returns {Object} SheetKeyValueLoader instance
 */
function getSheetKeyValueLoader_() {
  if (!loaders_.sheetKeyValue) {
    if (typeof SheetKeyValueLoader === 'undefined') {
      throw createError(
        'CONFIG_LOADER_MISSING',
        'SheetKeyValueLoader not available',
        {
          loader: 'SheetKeyValueLoader',
          cause: 'SheetKeyValueLoader.js not loaded or not loaded before ConfigurationManager.js',
          fix: 'Ensure SheetKeyValueLoader.js exists and loads first (alphabetical order)'
        }
      );
    }

    // Validate loader has required methods
    if (typeof SheetKeyValueLoader.load !== 'function') {
      throw createError(
        'CONFIG_LOADER_INVALID',
        'SheetKeyValueLoader.load() method not found',
        {
          loader: 'SheetKeyValueLoader',
          missingMethod: 'load'
        }
      );
    }

    loaders_.sheetKeyValue = SheetKeyValueLoader;
    try {
      UnifiedLogger.info('ConfigurationManager', 'SheetKeyValueLoader initialized', {
        hasLoad: typeof SheetKeyValueLoader.load === 'function',
        hasInvalidate: typeof SheetKeyValueLoader.invalidate === 'function'
      });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }
  }
  return loaders_.sheetKeyValue;
}

/**
 * Get or initialize properties loader
 * @private
 * @returns {Object} PropertiesLoader instance
 */
function getPropertiesLoader_() {
  if (!loaders_.properties) {
    if (typeof PropertiesLoader === 'undefined') {
      throw createError(
        'CONFIG_LOADER_MISSING',
        'PropertiesLoader not available',
        {
          loader: 'PropertiesLoader',
          cause: 'PropertiesLoader.js not loaded or not loaded before ConfigurationManager.js',
          fix: 'Ensure PropertiesLoader.js exists and loads first (alphabetical order)'
        }
      );
    }

    // Validate loader has required methods
    if (typeof PropertiesLoader.load !== 'function') {
      throw createError(
        'CONFIG_LOADER_INVALID',
        'PropertiesLoader.load() method not found',
        {
          loader: 'PropertiesLoader',
          missingMethod: 'load'
        }
      );
    }

    loaders_.properties = PropertiesLoader;
    try {
      UnifiedLogger.info('ConfigurationManager', 'PropertiesLoader initialized', {
        hasLoad: typeof PropertiesLoader.load === 'function',
        hasSave: typeof PropertiesLoader.save === 'function'
      });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }
  }
  return loaders_.properties;
}

/**
 * Get or initialize business rules loader
 * @private
 * @returns {Object} BusinessRulesLoader instance
 */
function getBusinessRulesLoader_() {
  if (!loaders_.businessRules) {
    if (typeof BusinessRulesLoader === 'undefined') {
      throw createError(
        'CONFIG_LOADER_MISSING',
        'BusinessRulesLoader not available',
        {
          loader: 'BusinessRulesLoader',
          cause: 'BusinessRulesLoader.js not loaded or not loaded before ConfigurationManager.js',
          fix: 'Ensure BusinessRulesLoader.js exists and loads first (alphabetical order)'
        }
      );
    }

    // Validate loader has required methods
    if (typeof BusinessRulesLoader.load !== 'function') {
      throw createError(
        'CONFIG_LOADER_INVALID',
        'BusinessRulesLoader.load() method not found',
        {
          loader: 'BusinessRulesLoader',
          missingMethod: 'load'
        }
      );
    }

    loaders_.businessRules = BusinessRulesLoader;
    try {
      UnifiedLogger.info('ConfigurationManager', 'BusinessRulesLoader initialized', {
        hasLoad: typeof BusinessRulesLoader.load === 'function',
        hasInvalidate: typeof BusinessRulesLoader.invalidate === 'function'
      });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }
  }
  return loaders_.businessRules;
}

// ===== Public API =====

/**
 * Get configuration value by dotted key notation
 *
 * Loads configuration from appropriate source (sheets, properties, or business rules),
 * validates business rules configs, and caches result for future requests.
 *
 * **Caching:** First call loads and caches. Subsequent calls return cached value.
 * Use invalidate(key) to force reload.
 *
 * **Validation:** Business rules configs (cost.*, scope.categories, scope.phaseMapping)
 * are validated during load. Warnings logged but config still returned (degraded mode).
 *
 * **Loaders:**
 * - brief.*, scope.phases, taxonomy.*, catalog.*, column.* → SheetConfigLoader
 * - properties.* → PropertiesLoader (Script Properties)
 * - cost.*, scope.{categories,phaseMapping} → BusinessRulesLoader
 *
 * @param {string} key - Dotted key notation (e.g., 'brief.profiles', 'cost.feePercentages')
 * @returns {*} Configuration value (type depends on config key)
 * @throws {Error} If key format invalid, key unknown, or loader fails
 *
 * @example
 * // Load sheet-driven config
 * const profiles = ConfigurationManager.get('brief.profiles');
 * // Returns: [{label: 'Standard', description: '...', ...}, ...]
 *
 * @example
 * // Load Script Properties (secrets)
 * const apiKey = ConfigurationManager.get('properties.openai.apiKey');
 * // Returns: 'sk-...' (string)
 *
 * @example
 * // Load business rules
 * const feePercentages = ConfigurationManager.get('cost.feePercentages');
 * // Returns: {standard: 0.15, premium: 0.12, enterprise: 0.10, nonprofit: 0.08}
 *
 * @example
 * // Handle errors
 * try {
 *   const config = ConfigurationManager.get('unknown.key');
 * } catch (error) {
 *   console.error('Config load failed:', error);
 * }
 */
function get(key) {
  try {
    try {
      UnifiedLogger.verbose('ConfigurationManager', 'Getting config', {
        key: key,
        cached: configCache_.has(key)
      });
    } catch (logError) {
      // Fallback if logger fails (logging-the-logger pattern)
      console.error('ConfigurationManager logging failed:', String(logError));
    }

    // Check cache first
    if (configCache_.has(key)) {
      try {
        UnifiedLogger.verbose('ConfigurationManager', 'Cache hit', { key: key });
      } catch (logError) {
        console.error('ConfigurationManager logging failed:', String(logError));
      }
      return configCache_.get(key);
    }

    // Validate key parameter
    if (!key || typeof key !== 'string') {
      throw createError(
        'CONFIG_INVALID_KEY',
        'Invalid key parameter: must be non-empty string, got: ' + typeof key,
        {
          receivedType: typeof key,
          expectedType: 'string',
          examples: ['brief.profiles', 'cost.feePercentages']
        }
      );
    }

    // Parse key to determine loader and config type
    const keyParts = key.split('.');
    if (keyParts.length < 2) {
      throw createError(
        'CONFIG_INVALID_KEY_FORMAT',
        'Invalid config key format: "' + key + '"',
        {
          key: key,
          expectedFormat: 'category.type',
          gotParts: keyParts.length,
          examples: ['brief.profiles', 'cost.feePercentages', 'properties.openai.apiKey']
        }
      );
    }

    const category = keyParts[0];
    const type = keyParts[1];
    let data;

    // Delegate to appropriate loader based on category
    if (category === 'brief' && type === 'profiles') {
      // brief.profiles → sheetLoader_.load('briefProfiles')
      const sheetLoader = getSheetLoader_();
      data = sheetLoader.load('briefProfiles');

    } else if (category === 'scope' && type === 'phases') {
      // scope.phases → sheetLoader_.load('scopePhases')
      const sheetLoader = getSheetLoader_();
      data = sheetLoader.load('scopePhases');

    } else if (category === 'taxonomy' && type === 'overrides') {
      // taxonomy.overrides → sheetLoader_.load('taxonomyOverrides')
      const sheetLoader = getSheetLoader_();
      data = sheetLoader.load('taxonomyOverrides');

    } else if (category === 'catalog' && type === 'prefixes') {
      // catalog.prefixes → sheetLoader_.load('catalogPrefixes')
      const sheetLoader = getSheetLoader_();
      data = sheetLoader.load('catalogPrefixes');

    } else if (category === 'catalog' && type === 'resource') {
      // catalog.resource → sheetLoader_.load('resourceCatalog')
      const sheetLoader = getSheetLoader_();
      data = sheetLoader.load('resourceCatalog');

    } else if (category === 'catalog' && type === 'scope') {
      // catalog.scope → sheetLoader_.load('scopeCatalog')
      const sheetLoader = getSheetLoader_();
      data = sheetLoader.load('scopeCatalog');

    } else if (category === 'column' && type === 'map') {
      // column.map → sheetLoader_.load('columnMap')
      const sheetLoader = getSheetLoader_();
      data = sheetLoader.load('columnMap');

    } else if (category === 'sheet') {
      // sheet.* → SheetKeyValueLoader (arbitrary Config Sheet entries)
      // e.g., 'sheet.DEFAULT_CURRENCY' → load('DEFAULT_CURRENCY')
      const loader = getSheetKeyValueLoader_();
      const sheetKey = keyParts.slice(1).join('_').toUpperCase(); // Reconstruct UPPER_SNAKE_CASE
      data = loader.load(sheetKey);

      if (data === undefined) {
        throw createError(
          'CONFIG_NOT_FOUND',
          'Config Sheet key not found: ' + sheetKey,
          {
            key: key,
            sheetKey: sheetKey,
            fix: 'Add key to Config Sheet (Column A=Key, Column B=Value) or check key spelling'
          }
        );
      }

      // Cache and return
      configCache_.set(key, data);
      return data;

    } else if (category === 'properties') {
      // properties.* → PropertiesLoader (e.g., 'properties.openai.apiKey')
      const propertiesLoader = getPropertiesLoader_();
      // Extract sub-key after 'properties.' prefix
      const subKey = keyParts.slice(1).join('.');
      data = propertiesLoader.load(subKey);

    } else if (category === 'cost') {
      // cost.* → BusinessRulesLoader (e.g., 'cost.feePercentages', 'cost.markupRules')
      const businessRulesLoader = getBusinessRulesLoader_();
      data = businessRulesLoader.load(key);

      // Validate business rules structure
      const validation = validateBusinessRules_(key, data);
      if (validation.warnings.length > 0) {
        try {
          UnifiedLogger.warn('ConfigurationManager', 'Business rules validation warning', {
            key: key,
            warnings: validation.warnings,
            warningCount: validation.warnings.length
          });
        } catch (logError) {
          console.error('ConfigurationManager validation logging failed:', String(logError));
        }
      }

    } else if (category === 'scope' && (type === 'categories' || type === 'phaseMapping')) {
      // scope.categories / scope.phaseMapping → BusinessRulesLoader (business rules)
      // Note: scope.phases stays with SheetConfigLoader (sheet-driven)
      const businessRulesLoader = getBusinessRulesLoader_();
      data = businessRulesLoader.load(key);

      // Validate business rules structure
      const validation = validateBusinessRules_(key, data);
      if (validation.warnings.length > 0) {
        try {
          UnifiedLogger.warn('ConfigurationManager', 'Business rules validation warning', {
            key: key,
            warnings: validation.warnings,
            warningCount: validation.warnings.length
          });
        } catch (logError) {
          console.error('ConfigurationManager validation logging failed:', String(logError));
        }
      }

    } else {
      // Build helpful error message listing all available keys
      const availableKeys = [
        'brief.profiles',
        'scope.phases',
        'scope.categories',
        'scope.phaseMapping',
        'taxonomy.overrides',
        'catalog.prefixes',
        'catalog.resource',
        'catalog.scope',
        'column.map',
        'properties.* (e.g., properties.openai.apiKey)',
        'cost.feePercentages',
        'cost.markupRules',
        'cost.calculationMethods',
        'cost.categoryPricingMap'
      ];

      throw createError(
        'CONFIG_UNKNOWN_KEY',
        'Unknown configuration key: "' + key + '"',
        {
          key: key,
          availableKeys: availableKeys,
          expectedFormat: 'category.type'
        }
      );
    }

    // Cache the loaded data
    configCache_.set(key, data);

    try {
      UnifiedLogger.info('ConfigurationManager', 'Config loaded and cached', {
        key: key,
        category: category,
        type: type,
        dataType: typeof data,
        cacheSize: configCache_.size
      });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }

    return data;

  } catch (error) {
    try {
      UnifiedLogger.error('ConfigurationManager', 'Get config failed', {
        key: key,
        error: String(error),
        errorType: error.name || 'Error',
        message: error.message || String(error),
        cacheSize: configCache_.size,
        cached: configCache_.has(key)
      });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }
    // Re-throw with enhanced context
    throw error;
  }
}

/**
 * Check if configuration key exists and is available
 *
 * Checks if a config key is:
 * 1. Already cached (loaded previously)
 * 2. OR available from loaders (Sheet, Properties, BusinessRules)
 *
 * **Performance:** Faster than get() since it doesn't load the config,
 * only checks availability. Use to guard optional configs.
 *
 * **Cache Check:** Returns true immediately if already cached.
 *
 * **Loader Check:** For uncached keys, delegates to appropriate loader's has() method.
 *
 * **Error Handling:** Returns false on errors (safe default). Never throws.
 *
 * @param {string} key - Dotted key to check (e.g., 'brief.profiles')
 * @returns {boolean} True if config exists (cached or available), false otherwise
 *
 * @example
 * // Check before loading (guard pattern)
 * if (ConfigurationManager.has('brief.profiles')) {
 *   const profiles = ConfigurationManager.get('brief.profiles');
 * } else {
 *   console.log('Brief profiles not configured');
 * }
 *
 * @example
 * // Check optional config
 * const hasCustomRules = ConfigurationManager.has('cost.customRules');
 * if (hasCustomRules) {
 *   applyCustomRules(ConfigurationManager.get('cost.customRules'));
 * }
 *
 * @example
 * // Returns false for unknown keys (doesn't throw)
 * const exists = ConfigurationManager.has('unknown.key'); // false
 */
function has(key) {
  try {
    try {
      UnifiedLogger.verbose('ConfigurationManager', 'Checking config existence', { key: key });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }

    // Check cache
    if (configCache_.has(key)) {
      return true;
    }

    // Parse key to check if supported
    const keyParts = key.split('.');
    if (keyParts.length < 2) {
      return false; // Invalid key format
    }

    const category = keyParts[0];
    const type = keyParts[1];

    // Check if this is a sheet-based config
    if (category === 'brief' && type === 'profiles') {
      return true;
    } else if (category === 'scope' && type === 'phases') {
      return true;
    } else if (category === 'taxonomy' && type === 'overrides') {
      return true;
    } else if (category === 'catalog' && (type === 'prefixes' || type === 'resource' || type === 'scope')) {
      return true;
    } else if (category === 'column' && type === 'map') {
      return true;
    } else if (category === 'sheet') {
      // SheetKeyValueLoader - check if key exists in Config Sheet
      try {
        const loader = getSheetKeyValueLoader_();
        const sheetKey = keyParts.slice(1).join('_').toUpperCase();
        return loader.has(sheetKey);
      } catch (error) {
        return false;
      }
    } else if (category === 'properties') {
      // Properties loader - check if property exists
      try {
        const propertiesLoader = getPropertiesLoader_();
        const subKey = keyParts.slice(1).join('.');
        return propertiesLoader.has(subKey);
      } catch (error) {
        return false;
      }
    } else if (category === 'cost') {
      // Business rules loader - check if rule type supported
      try {
        const businessRulesLoader = getBusinessRulesLoader_();
        return businessRulesLoader.has(key);
      } catch (error) {
        return false;
      }
    } else if (category === 'scope' && (type === 'categories' || type === 'phaseMapping')) {
      // scope.categories / scope.phaseMapping → BusinessRulesLoader
      try {
        const businessRulesLoader = getBusinessRulesLoader_();
        return businessRulesLoader.has(key);
      } catch (error) {
        return false;
      }
    } else {
      return false; // Unknown key
    }

  } catch (error) {
    try {
      UnifiedLogger.warn('ConfigurationManager', 'Has check failed', {
        key: key,
        error: String(error)
      });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }
    // Return false on error (safe default)
    return false;
  }
}

/**
 * Invalidate cached configuration to force reload on next get()
 *
 * **Purpose:** Clear cached configs to force fresh load from source.
 * Use when configuration data changes (sheet edits, Script Properties updates).
 *
 * **Specific Key:** Pass key to invalidate single config (e.g., 'brief.profiles').
 * Clears ConfigurationManager cache AND underlying loader cache.
 *
 * **All Keys:** Omit key parameter to clear all caches (ConfigurationManager + all loaders).
 * Use after bulk configuration changes.
 *
 * **Error Handling:** Never throws. Logs warnings if invalidation fails but continues.
 * Graceful degradation ensures invalidation failures don't break operations.
 *
 * **Cache Cascade:** Invalidation cascades to loader caches:
 * - brief.profiles → SheetConfigLoader.invalidate('briefProfiles')
 * - cost.feePercentages → BusinessRulesLoader.invalidate('cost.feePercentages')
 * - properties.openai.apiKey → PropertiesLoader.invalidate('openai.apiKey')
 *
 * @param {string} [key] - Specific dotted key to invalidate. If omitted, invalidates all configs.
 *
 * @example
 * // Invalidate specific config after sheet update
 * // (Next get('brief.profiles') will reload from sheet)
 * ConfigurationManager.invalidate('brief.profiles');
 *
 * @example
 * // Invalidate all configs after bulk changes
 * ConfigurationManager.invalidate();
 *
 * @example
 * // Common pattern: Invalidate after Script Properties update
 * PropertiesService.getScriptProperties().setProperty('OPENAI_API_KEY', newKey);
 * ConfigurationManager.invalidate('properties.openai.apiKey');
 *
 * @example
 * // Invalidate cost rules after business logic changes
 * ConfigurationManager.invalidate('cost.feePercentages');
 * ConfigurationManager.invalidate('cost.markupRules');
 */
function invalidate(key) {
  try {
    if (key) {
      // Invalidate specific key
      try {
        UnifiedLogger.info('ConfigurationManager', 'Invalidating specific key', { key: key });
      } catch (logError) {
        console.error('ConfigurationManager logging failed:', String(logError));
      }

      if (configCache_.has(key)) {
        configCache_.delete(key);
        try {
          UnifiedLogger.info('ConfigurationManager', 'Cache entry deleted', { key: key });
        } catch (logError) {
          console.error('ConfigurationManager logging failed:', String(logError));
        }
      } else {
        try {
          UnifiedLogger.warn('ConfigurationManager', 'Key not in cache', { key: key });
        } catch (logError) {
          console.error('ConfigurationManager logging failed:', String(logError));
        }
      }

      // Also invalidate in appropriate loader if it's a loader-based key
      const keyParts = key.split('.');
      if (keyParts.length >= 2) {
        const category = keyParts[0];
        const type = keyParts[1];

        // SheetConfigLoader invalidation
        if (['brief', 'scope', 'taxonomy', 'catalog', 'column'].indexOf(category) !== -1) {
          try {
            const sheetLoader = getSheetLoader_();
            // Map dotted key to loader config type
            if (key === 'brief.profiles') {
              sheetLoader.invalidate('briefProfiles');
            } else if (key === 'scope.phases') {
              sheetLoader.invalidate('scopePhases');
            } else if (key === 'taxonomy.overrides') {
              sheetLoader.invalidate('taxonomyOverrides');
            } else if (key === 'catalog.prefixes') {
              sheetLoader.invalidate('catalogPrefixes');
            } else if (key === 'catalog.resource') {
              sheetLoader.invalidate('resourceCatalog');
            } else if (key === 'catalog.scope') {
              sheetLoader.invalidate('scopeCatalog');
            } else if (key === 'column.map') {
              sheetLoader.invalidate('columnMap');
            }
          } catch (loaderError) {
            try {
              UnifiedLogger.warn('ConfigurationManager', 'SheetConfigLoader invalidation failed', {
                key: key,
                error: String(loaderError)
              });
            } catch (logError) {
              console.error('ConfigurationManager logging failed:', String(logError));
            }
          }
        }

        // SheetKeyValueLoader invalidation
        if (category === 'sheet') {
          try {
            const sheetKeyValueLoader = getSheetKeyValueLoader_();
            const sheetKey = keyParts.slice(1).join('_').toUpperCase();
            sheetKeyValueLoader.invalidate(sheetKey);
          } catch (loaderError) {
            try {
              UnifiedLogger.warn('ConfigurationManager', 'SheetKeyValueLoader invalidation failed', {
                key: key,
                error: String(loaderError)
              });
            } catch (logError) {
              console.error('ConfigurationManager logging failed:', String(logError));
            }
          }
        }

        // PropertiesLoader invalidation
        if (category === 'properties') {
          try {
            const propertiesLoader = getPropertiesLoader_();
            const subKey = keyParts.slice(1).join('.');
            propertiesLoader.invalidate(subKey);
          } catch (loaderError) {
            try {
              UnifiedLogger.warn('ConfigurationManager', 'PropertiesLoader invalidation failed', {
                key: key,
                error: String(loaderError)
              });
            } catch (logError) {
              console.error('ConfigurationManager logging failed:', String(logError));
            }
          }
        }

        // BusinessRulesLoader invalidation
        if (category === 'cost' || (category === 'scope' && (type === 'categories' || type === 'phaseMapping'))) {
          try {
            const businessRulesLoader = getBusinessRulesLoader_();
            businessRulesLoader.invalidate(key);
          } catch (loaderError) {
            try {
              UnifiedLogger.warn('ConfigurationManager', 'BusinessRulesLoader invalidation failed', {
                key: key,
                error: String(loaderError)
              });
            } catch (logError) {
              console.error('ConfigurationManager logging failed:', String(logError));
            }
          }
        }
      }
    } else {
      // Invalidate all keys
      try {
        UnifiedLogger.info('ConfigurationManager', 'Invalidating all cache', {
          entriesCount: configCache_.size
        });
      } catch (logError) {
        console.error('ConfigurationManager logging failed:', String(logError));
      }

      configCache_.clear();

      try {
        UnifiedLogger.info('ConfigurationManager', 'All cache cleared', {});
      } catch (logError) {
        console.error('ConfigurationManager logging failed:', String(logError));
      }

      // Also invalidate all loader caches
      try {
        const sheetLoader = getSheetLoader_();
        sheetLoader.invalidate(); // Clear all sheet config cache
      } catch (loaderError) {
        try {
          UnifiedLogger.warn('ConfigurationManager', 'SheetConfigLoader invalidate all failed', {
            error: String(loaderError)
          });
        } catch (logError) {
          console.error('ConfigurationManager logging failed:', String(logError));
        }
      }

      try {
        const sheetKeyValueLoader = getSheetKeyValueLoader_();
        sheetKeyValueLoader.invalidate(); // Clear all sheet key-value cache
      } catch (loaderError) {
        try {
          UnifiedLogger.warn('ConfigurationManager', 'SheetKeyValueLoader invalidate all failed', {
            error: String(loaderError)
          });
        } catch (logError) {
          console.error('ConfigurationManager logging failed:', String(logError));
        }
      }

      try {
        const propertiesLoader = getPropertiesLoader_();
        propertiesLoader.invalidate(); // Clear properties cache
      } catch (loaderError) {
        try {
          UnifiedLogger.warn('ConfigurationManager', 'PropertiesLoader invalidate all failed', {
            error: String(loaderError)
          });
        } catch (logError) {
          console.error('ConfigurationManager logging failed:', String(logError));
        }
      }

      try {
        const businessRulesLoader = getBusinessRulesLoader_();
        businessRulesLoader.invalidate(); // Clear business rules cache (no-op for static rules)
      } catch (loaderError) {
        try {
          UnifiedLogger.warn('ConfigurationManager', 'BusinessRulesLoader invalidate all failed', {
            error: String(loaderError)
          });
        } catch (logError) {
          console.error('ConfigurationManager logging failed:', String(logError));
        }
      }
    }
  } catch (error) {
    try {
      UnifiedLogger.error('ConfigurationManager', 'Invalidate failed', {
        key: key || 'all',
        error: String(error)
      });
    } catch (logError) {
      console.error('ConfigurationManager logging failed:', String(logError));
    }
    // Don't throw - invalidation failure shouldn't block operations
  }
}

/**
 * Validate all business rules configurations
 *
 * Loads and validates all known business rules configurations:
 * - cost.feePercentages
 * - cost.markupRules
 * - cost.calculationMethods
 * - scope.categories
 * - scope.phaseMapping
 *
 * Note: Validation happens during get() calls. This method collects
 * validation results for all business rules configs.
 *
 * @returns {Object} Validation report with structure:
 *   {
 *     valid: boolean,           // True if no errors found
 *     results: Object,          // Per-key validation results
 *     totalWarnings: number     // Total warning count
 *   }
 *
 * @example
 * const report = ConfigurationManager.validateAll();
 * if (!report.valid) {
 *   console.log('Validation warnings:', report.totalWarnings);
 *   console.log('Details:', report.results);
 * }
 */
function validateAll() {
  const report = {
    valid: true,
    results: {},
    totalWarnings: 0
  };

  // List of all business rules configs to validate
  const businessRulesKeys = [
    'cost.feePercentages',
    'cost.markupRules',
    'cost.calculationMethods',
    'scope.categories',
    'scope.phaseMapping'
  ];

  businessRulesKeys.forEach(function(key) {
    try {
      // Load config (will be validated during get() call)
      const data = get(key);

      // Re-validate to collect results
      const validation = validateBusinessRules_(key, data);

      report.results[key] = {
        valid: validation.valid,
        warnings: validation.warnings,
        warningCount: validation.warnings.length
      };

      if (validation.warnings.length > 0) {
        report.valid = false;
        report.totalWarnings += validation.warnings.length;
      }
    } catch (error) {
      report.results[key] = {
        valid: false,
        warnings: ['Failed to load config: ' + String(error)],
        warningCount: 1
      };
      report.valid = false;
      report.totalWarnings += 1;
    }
  });

  try {
    UnifiedLogger.info('ConfigurationManager', 'Validation complete', {
      valid: report.valid,
      totalWarnings: report.totalWarnings,
      keysChecked: businessRulesKeys.length
    });
  } catch (logError) {
    console.error('ConfigurationManager logging failed:', String(logError));
  }

  return report;
}

/**
 * Get validation errors for all configurations
 *
 * Convenience method to quickly check if there are validation issues.
 * Returns array of all warnings found across all business rules configs.
 *
 * @returns {Array<Object>} Array of warning objects with structure:
 *   {
 *     key: string,           // Config key with warning
 *     warnings: string[]     // List of warning messages
 *   }
 *
 * @example
 * const errors = ConfigurationManager.getValidationErrors();
 * if (errors.length > 0) {
 *   console.error('Found validation errors:', errors);
 *   errors.forEach(e => {
 *     console.error(e.key + ':', e.warnings);
 *   });
 * }
 */
function getValidationErrors() {
  const report = validateAll();
  const errors = [];

  Object.keys(report.results).forEach(function(key) {
    const result = report.results[key];
    if (result.warnings.length > 0) {
      errors.push({
        key: key,
        warnings: result.warnings
      });
    }
  });

  return errors;
}

// ===== Module Exports (Apps Script pattern) =====

/**
 * Export ConfigurationManager API
 * Apps Script doesn't have standard exports, so we expose functions directly
 */
const ConfigurationManager = {
  get: get,
  has: has,
  invalidate: invalidate,
  validateAll: validateAll,
  getValidationErrors: getValidationErrors
};

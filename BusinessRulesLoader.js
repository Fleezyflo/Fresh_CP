/**
 * BusinessRulesLoader - Business rules and calculation logic for ConfigurationManager
 *
 * Purpose:
 * - Consolidate cost calculation rules (from CostCalculationConfig.js)
 * - Consolidate scope category definitions (from ScopeCategoryConfig.js)
 * - Provide unified business rules access via ConfigurationManager
 * - Keep business logic separate from data loading (sheets) and secrets (properties)
 *
 * Architecture:
 * - Consolidated from CostCalculationConfig.js + ScopeCategoryConfig.js
 * - Pure JavaScript objects (no external dependencies)
 * - Returns deep copies to prevent mutation
 * - Future: Rules might come from Config sheets (enhancement)
 *
 * Usage (via ConfigurationManager):
 * @example
 * // ConfigurationManager delegates to this loader
 * const feePercentages = ConfigurationManager.get('cost.feePercentages');
 * const markupRules = ConfigurationManager.get('cost.markupRules');
 * const scopeCategories = ConfigurationManager.get('scope.categories');
 *
 * @module BusinessRulesLoader
 * @version 1.0.0
 *  */

// ===== Constants =====

const BUSINESS_RULES_LOG_CATEGORY = 'BusinessRulesLoader';

// ===== Cost Calculation Rules =====

/**
 * Supported cost calculation methods
 * @const
 */
const COST_CALCULATION_METHODS = {
  FIXED: 'fixed',           // Fixed price per unit (default for scopes, packages)
  RATE: 'rate',             // Hourly/daily rate (default for crew, resources)
  DAY_RATE: 'day-rate',     // Day rate with hour conversion
  TIERED: 'tiered',         // Tiered pricing based on quantity
  CUSTOM: 'custom'          // Custom calculation (formula-based)
};

/**
 * Fee percentages by client type
 * @const
 */
const FEE_PERCENTAGES = {
  standard: 0.15,      // 15% for standard clients
  premium: 0.10,       // 10% for premium clients
  enterprise: 0.05,    // 5% for enterprise clients
  nonprofit: 0.20      // 20% for nonprofit clients
};

/**
 * Markup rules by resource category
 * @const
 */
const MARKUP_RULES = {
  crew: {
    percentage: 0.25,  // 25% markup on crew rates
    minAmount: 50      // Minimum $50 markup
  },
  equipment: {
    percentage: 0.30,  // 30% markup on equipment rentals
    minAmount: 25
  },
  location: {
    percentage: 0.20,  // 20% markup on location fees
    minAmount: 100
  },
  services: {
    percentage: 0.15,  // 15% markup on services
    minAmount: 50
  },
  default: {
    percentage: 0.20,  // 20% default markup
    minAmount: 0
  }
};

/**
 * Category-to-pricing-mode mapping
 * Derives default pricing mode from resource category
 * @const
 */
const CATEGORY_PRICING_MAP = {
  'crew': 'rate',
  'equipment': 'day-rate',
  'location': 'fixed',
  'services': 'rate',
  'materials': 'fixed',
  'post-production': 'rate',
  'creative': 'rate',
  'travel': 'fixed',
  'default': 'fixed'
};

// ===== Scope Category Rules =====

/**
 * Scope category definitions
 * Currently minimal - scope categories primarily managed in sheets
 * @const
 */
const SCOPE_CATEGORIES = {
  // Legacy: Most scope category config moved to sheets
  // (Config: Scope Phases, Config: Phase Taxonomy Overrides)
  // This remains as fallback/default
};

/**
 * Phase-to-category mapping
 * Currently minimal - managed primarily in sheets
 * @const
 */
const PHASE_CATEGORY_MAPPING = {
  // Legacy: Mapping now in sheets
  // This remains as fallback
};

// ===== Private Helpers =====

/**
 * Log event with fallback (logging-the-logger pattern)
 * @private
 */
function logBusinessRulesEvent_(level, message, details) {
  try {
    if (typeof UnifiedLogger !== 'undefined' && UnifiedLogger && typeof UnifiedLogger[level.toLowerCase()] === 'function') {
      UnifiedLogger[level.toLowerCase()](BUSINESS_RULES_LOG_CATEGORY, message, details);
    } else {
      console.error('BusinessRulesLoader: UnifiedLogger not available, using console fallback');
    }
  } catch (logError) {
    // Fallback if logger fails
    console.error('BusinessRulesLoader logging failed:', String(logError));
  }
}

/**
 * Deep copy object to prevent mutation
 * @private
 */
function deepCopy_(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(function(item) {
      return deepCopy_(item);
    });
  }

  const copy = {};
  Object.keys(obj).forEach(function(key) {
    copy[key] = deepCopy_(obj[key]);
  });

  return copy;
}

// ===== Public API =====

/**
 * Load business rule by type
 *
 * @param {string} ruleType - Rule type to load
 * @returns {Object|Array} Business rule data (deep copy to prevent mutation)
 * @throws {Error} If rule type unknown
 *
 * Supported rule types:
 * - 'cost.feePercentages' - Fee percentages by client type
 * - 'cost.markupRules' - Markup rules by resource category
 * - 'cost.calculationMethods' - Supported cost calculation methods
 * - 'cost.categoryPricingMap' - Category-to-pricing-mode mapping
 * - 'scope.categories' - Scope category definitions
 * - 'scope.phaseMapping' - Phase-to-category mapping
 *
 * @example
 * const feePercentages = BusinessRulesLoader.load('cost.feePercentages');
 * const markupRules = BusinessRulesLoader.load('cost.markupRules');
 * const scopeCategories = BusinessRulesLoader.load('scope.categories');
 */
function load(ruleType) {
  try {
    logBusinessRulesEvent_('verbose', 'Load business rule', { ruleType: ruleType });

    let data;

    // Parse rule type and return appropriate data
    if (ruleType === 'cost.feePercentages') {
      data = deepCopy_(FEE_PERCENTAGES);

    } else if (ruleType === 'cost.markupRules') {
      data = deepCopy_(MARKUP_RULES);

    } else if (ruleType === 'cost.calculationMethods') {
      data = deepCopy_(COST_CALCULATION_METHODS);

    } else if (ruleType === 'cost.categoryPricingMap') {
      data = deepCopy_(CATEGORY_PRICING_MAP);

    } else if (ruleType === 'scope.categories') {
      data = deepCopy_(SCOPE_CATEGORIES);

    } else if (ruleType === 'scope.phaseMapping') {
      data = deepCopy_(PHASE_CATEGORY_MAPPING);

    } else {
      throw new Error('Unknown business rule type: ' + ruleType + '. ' +
                      'Valid types: cost.feePercentages, cost.markupRules, cost.calculationMethods, ' +
                      'cost.categoryPricingMap, scope.categories, scope.phaseMapping');
    }

    logBusinessRulesEvent_('verbose', 'Business rule loaded', { ruleType: ruleType });
    return data;

  } catch (error) {
    logBusinessRulesEvent_('error', 'Load business rule failed', {
      ruleType: ruleType,
      error: String(error)
    });
    throw error;
  }
}

/**
 * Check if rule type is supported
 *
 * @param {string} ruleType - Rule type to check
 * @returns {boolean} True if supported
 *
 * @example
 * if (BusinessRulesLoader.has('cost.feePercentages')) {
 *   const rules = BusinessRulesLoader.load('cost.feePercentages');
 * }
 */
function has(ruleType) {
  const supportedTypes = [
    'cost.feePercentages',
    'cost.markupRules',
    'cost.calculationMethods',
    'cost.categoryPricingMap',
    'scope.categories',
    'scope.phaseMapping'
  ];

  return supportedTypes.indexOf(ruleType) !== -1;
}

/**
 * Get fee percentage for client type
 *
 * @param {string} clientType - Client type (standard, premium, enterprise, nonprofit)
 * @returns {number} Fee percentage (e.g., 0.15 for 15%)
 *
 * @example
 * const fee = BusinessRulesLoader.getFeePercentage('premium'); // 0.10 (10%)
 */
function getFeePercentage(clientType) {
  try {
    const feePercentages = load('cost.feePercentages');
    const normalizedType = (clientType || 'standard').toLowerCase().trim();

    return feePercentages[normalizedType] || feePercentages.standard;

  } catch (error) {
    logBusinessRulesEvent_('warn', 'Get fee percentage failed', {
      clientType: clientType,
      error: String(error)
    });
    // Return default
    return FEE_PERCENTAGES.standard;
  }
}

/**
 * Get markup rules for resource category
 *
 * @param {string} category - Resource category (crew, equipment, location, etc.)
 * @returns {Object} Markup rules {percentage, minAmount}
 *
 * @example
 * const markup = BusinessRulesLoader.getMarkupRules('crew');
 * // Returns: {percentage: 0.25, minAmount: 50}
 */
function getMarkupRules(category) {
  try {
    const markupRules = load('cost.markupRules');
    const normalizedCategory = (category || 'default').toLowerCase().trim();

    return markupRules[normalizedCategory] || markupRules.default;

  } catch (error) {
    logBusinessRulesEvent_('warn', 'Get markup rules failed', {
      category: category,
      error: String(error)
    });
    // Return default
    return MARKUP_RULES.default;
  }
}

/**
 * Derive pricing mode from category
 *
 * @param {string} category - Resource category
 * @returns {string} Pricing mode (fixed, rate, day-rate, etc.)
 *
 * @example
 * const mode = BusinessRulesLoader.derivePricingMode('crew'); // 'rate'
 * const mode = BusinessRulesLoader.derivePricingMode('equipment'); // 'day-rate'
 */
function derivePricingMode(category) {
  try {
    const categoryPricingMap = load('cost.categoryPricingMap');
    const normalizedCategory = (category || 'default').toLowerCase().trim();

    return categoryPricingMap[normalizedCategory] || categoryPricingMap.default;

  } catch (error) {
    logBusinessRulesEvent_('warn', 'Derive pricing mode failed', {
      category: category,
      error: String(error)
    });
    // Return default
    return CATEGORY_PRICING_MAP.default;
  }
}

/**
 * Invalidate business rules (no-op for now - rules are static)
 *
 * @param {string} [ruleType] - Specific rule type to invalidate (not used)
 *
 * @example
 * BusinessRulesLoader.invalidate(); // No-op for static rules
 */
function invalidate(ruleType) {
  // No-op: Business rules are static constants
  // Future: If rules move to sheets, implement cache invalidation
  logBusinessRulesEvent_('verbose', 'Invalidate called (no-op for static rules)', {
    ruleType: ruleType || 'all'
  });
}

// ===== Module Exports (Apps Script pattern) =====

/**
 * Export BusinessRulesLoader API
 * Apps Script doesn't have standard exports, so we expose functions directly
 */
const BusinessRulesLoader = {
  load: load,
  has: has,
  invalidate: invalidate,
  // Convenience helpers
  getFeePercentage: getFeePercentage,
  getMarkupRules: getMarkupRules,
  derivePricingMode: derivePricingMode
};

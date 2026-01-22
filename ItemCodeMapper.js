/**
 * ItemCodeMapper.gs
 *
 * Complete ItemCode lookup and generation system for Xero quote building.
 * Handles fuzzy matching against master catalog and generates custom ItemCodes for new items.
 *
 * CRITICAL INFRASTRUCTURE - Do not modify without testing all edge cases.
 */

/**
 * Load master catalog from CSV file
 *
 * @returns {Array<Object>} Array of catalog items with structure:
 *   - ItemCode: string (max 30 chars for Xero)
 *   - ItemName: string
 *   - Description: string
 *   - Unit: string
 *   - DefaultUnitAmountAED: number
 *   - Category: string
 *   - Source: string
 * @throws {Error} If CSV file cannot be loaded or parsed
 */
function loadMasterCatalog() {
  try { UnifiedLogger.info('ItemCodeMapper', 'loadMasterCatalog: Starting catalog load'); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

  // OPTIMIZATION: Try to use cached items from ItemLookup first
  if (typeof getAllItems === 'function') {
    try {
      const items = getAllItems();
      if (items && items.length > 0) {
        try { UnifiedLogger.info('ItemCodeMapper', 'loadMasterCatalog: Retrieved items from ItemLookup cache', { count: items.length }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
        // Map to ItemCodeMapper's expected dual-case structure for compatibility
        return items.map(item => ({
          itemCode: item.itemCode,
          ItemCode: item.itemCode,
          itemName: item.name,
          ItemName: item.name,
          description: item.description,
          Description: item.description,
          unit: item.unit,
          Unit: item.unit,
          defaultPrice: item.sellPrice,
          DefaultUnitAmountAED: item.sellPrice,
          category: item.category,
          Category: item.category,
          source: 'Xero',
          pricingMode: item.pricingMode,
          PricingMode: item.pricingMode,
          active: item.active,
          sellPrice: item.sellPrice
        }));
      }
    } catch (e) {
      try { UnifiedLogger.warn('ItemCodeMapper', 'loadMasterCatalog: Cached lookup failed, falling back to sheet read', String(e)); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    }
  }

  // ConfigLoader resource catalog
  try {
    if (typeof loadResourceCatalog === 'function') {
      const catalog = loadResourceCatalog();
      const list = catalog && Array.isArray(catalog.list) ? catalog.list : [];
      if (list.length) {
        const mapped = list.map(convertResourceToCatalogItem_).filter(Boolean);
        if (mapped.length) {
          try { UnifiedLogger.info('ItemCodeMapper', 'loadMasterCatalog: Loaded items from Config: Resource Catalog', { count: mapped.length }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
          return mapped;
        }
      }
    }
  } catch (dynamicError) {
    try { UnifiedLogger.warn('ItemCodeMapper', 'loadMasterCatalog: Config resource catalog load failed', String(dynamicError)); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
  }

  try { UnifiedLogger.warn('ItemCodeMapper', 'loadMasterCatalog: No catalog sources available'); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
  return [];
}

function convertResourceToCatalogItem_(entry) {
  if (!entry || !entry.code) {
    return null;
  }
  const code = String(entry.code).trim();
  if (!code) {
    return null;
  }
  const name = entry.name || code;
  const description = entry.description || '';
  const unit = entry.unit || 'Unit';
  const sellPrice = typeof entry.rate === 'number' ? entry.rate : parseFloat(entry.rate) || 0;
  const category = entry.category || '';
  const pricingMode = entry.pricingMode || 'fixed';
  const active = (entry.status || '').toString().toLowerCase() !== 'inactive';
  return {
    itemCode: code.substring(0, 30),
    ItemCode: code.substring(0, 30),
    itemName: name,
    ItemName: name,
    description: description,
    Description: description,
    unit: unit,
    Unit: unit,
    defaultPrice: sellPrice,
    DefaultUnitAmountAED: sellPrice,
    category: category,
    Category: category,
    source: entry.source || 'Config',
    pricingMode: pricingMode,
    PricingMode: pricingMode,
    active: active,
    sellPrice: sellPrice
  };
}

/**
 * Find ItemCode by fuzzy matching description, section name, and client line name
 *
 * Uses multi-stage matching strategy:
 * 1. Exact ItemCode match
 * 2. Exact ItemName match
 * 3. Fuzzy description match (normalized, lowercased, keyword overlap)
 * 4. Category-filtered fuzzy match
 *
 * @param {string} description - Item description from proposal
 * @param {string} sectionName - Section name (for category mapping)
 * @param {string} clientLineName - Original client line item name
 * @returns {Object|null} Matched catalog item or null if no match found
 */
function findItemCode(description, sectionName, clientLineName) {
  try {
    UnifiedLogger.info('ItemCodeMapper', 'findItemCode: Starting search', {
      descriptionPreview: (description || '').substring(0, 100),
      section: sectionName,
      clientLinePreview: (clientLineName || '').substring(0, 100)
    });
  } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

  try {
    // Load master catalog
    const catalog = loadMasterCatalog();

    if (!catalog || catalog.length === 0) {
      try { UnifiedLogger.info('ItemCodeMapper', 'findItemCode: Catalog is empty'); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
      return null;
    }

    // Normalize search terms
    const descNorm = normalizeText(description || '');
    const nameNorm = normalizeText(clientLineName || '');
    const sectionNorm = normalizeText(sectionName || '');

    if (!descNorm && !nameNorm) {
      try { UnifiedLogger.warn('ItemCodeMapper', 'findItemCode: No valid search terms provided'); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
      return null;
    }

    try { UnifiedLogger.info('ItemCodeMapper', 'findItemCode: Normalized search terms', { descNorm: descNorm.substring(0, 100), nameNorm: nameNorm.substring(0, 100) }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

    // Stage 1: Exact ItemCode match (case insensitive)
    for (const item of catalog) {
      const candidateCode = (item.ItemCode || item.itemCode || '').toLowerCase();
      if (!candidateCode) {
        continue;
      }
      if (candidateCode === descNorm || candidateCode === nameNorm) {
        try { UnifiedLogger.info('ItemCodeMapper', 'findItemCode: EXACT ITEMCODE MATCH found', { itemCode: item.ItemCode || item.itemCode }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
        return item;
      }
    }

    // Stage 2: Exact ItemName match (case insensitive, trimmed)
    for (const item of catalog) {
      const itemNameNorm = normalizeText(item.ItemName || item.itemName || '');
      if (itemNameNorm === descNorm || itemNameNorm === nameNorm) {
        try { UnifiedLogger.info('ItemCodeMapper', 'findItemCode: EXACT ITEMNAME MATCH found', { itemCode: item.ItemCode || item.itemCode }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
        return item;
      }
    }

    // Stage 3: Fuzzy keyword matching
    const searchText = descNorm + ' ' + nameNorm;
    const keywords = extractKeywords(searchText);

    try { UnifiedLogger.info('ItemCodeMapper', 'findItemCode: Extracted keywords', { count: keywords.length, sample: keywords.slice(0, 10) }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

    if (keywords.length === 0) {
      try { UnifiedLogger.warn('ItemCodeMapper', 'findItemCode: No keywords extracted from search terms'); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
      return null;
    }

    // Get category from section for filtering
    const expectedCategory = getCategoryFromSection(sectionName);
    try { UnifiedLogger.info('ItemCodeMapper', 'findItemCode: Expected category from section', { category: expectedCategory }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

    // Score all items
    let bestMatch = null;
    let bestScore = 0;
    const MATCH_THRESHOLD = 0.3; // 30% keyword overlap minimum

    for (const item of catalog) {
      const itemText = normalizeText(
        (item.ItemName || item.itemName || '') + ' ' + (item.Description || item.description || '')
      );
      const itemKeywords = extractKeywords(itemText);

      // Calculate keyword overlap score
      const score = calculateKeywordOverlap(keywords, itemKeywords);

      // Boost score if category matches
      let adjustedScore = score;
      const itemCategory = item.Category || item.category || '';
      if (expectedCategory && itemCategory === expectedCategory) {
        adjustedScore *= 1.5; // 50% boost for category match
      }

      if (adjustedScore > bestScore && adjustedScore >= MATCH_THRESHOLD) {
        bestScore = adjustedScore;
        bestMatch = item;
      }
    }

    if (bestMatch) {
      try { UnifiedLogger.info('ItemCodeMapper', 'findItemCode: FUZZY MATCH found', { itemCode: bestMatch.ItemCode || bestMatch.itemCode, score: bestScore }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
      return bestMatch;
    }

    try { UnifiedLogger.info('ItemCodeMapper', 'findItemCode: NO MATCH found', { bestScore: bestScore, threshold: MATCH_THRESHOLD }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    return null;

  } catch (error) {
    try { UnifiedLogger.error('ItemCodeMapper', 'findItemCode: ERROR', error); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    return null; // Fail gracefully
  }
}

/**
 * Generate custom ItemCode for items not in catalog
 *
 * Format: {Category}{###} where ### is a zero-padded counter
 * Example: FilmCrew042, Branding015, Custom123
 *
 * Uses Script Properties to persist counters across executions.
 *
 * @param {Object} item - Item object with description/name
 * @param {string} category - Category for the item
 * @returns {string} Generated ItemCode (max 30 chars)
 */
function generateCustomItemCode(item, category) {
  try { UnifiedLogger.info('ItemCodeMapper', 'generateCustomItemCode: Starting generation', { category: category, itemPreview: JSON.stringify(item).substring(0, 200) }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

  try {
    // Normalize category
    const normalizedCategory = (category || 'Custom').trim();
    try { UnifiedLogger.info('ItemCodeMapper', 'generateCustomItemCode: Normalized category', { normalizedCategory: normalizedCategory }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

    // Get or initialize counter from Config sheet
    const counterKey = 'CUSTOM_ITEMCODE_COUNTER_' + normalizedCategory;
    let counter = 0;
    try {
      const rawCounter = getConfigValue(counterKey);
      counter = parseInt(rawCounter, 10) || 0;
    } catch (configError) {
      try { UnifiedLogger.info('ItemCodeMapper', 'generateCustomItemCode: Counter not found, starting at 0', { counterKey: counterKey }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
      counter = 0;
    }
    counter++; // Increment for new item

    try { UnifiedLogger.info('ItemCodeMapper', 'generateCustomItemCode: Counter value', { counterKey: counterKey, counter: counter }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

    // Format: {Category}{###}
    const paddedCounter = counter.toString().padStart(3, '0');
    let itemCode = normalizedCategory + paddedCounter;

    // Enforce Xero's 30-char limit
    if (itemCode.length > 30) {
      // Truncate category name if needed
      const maxCategoryLength = 30 - 3; // Reserve 3 chars for counter
      const truncatedCategory = normalizedCategory.substring(0, maxCategoryLength);
      itemCode = truncatedCategory + paddedCounter;
      try { UnifiedLogger.info('ItemCodeMapper', 'generateCustomItemCode: Truncated to 30 chars', { itemCode: itemCode }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    }

    // Save updated counter
    const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CONFIG);
    writeConfigValue(configSheet, counterKey, counter.toString());
    if (typeof invalidateConfigCache === 'function') {
      invalidateConfigCache();
    }
    try { UnifiedLogger.info('ItemCodeMapper', 'generateCustomItemCode: Saved counter', { counterKey: counterKey, counter: counter }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

    try { UnifiedLogger.info('ItemCodeMapper', 'generateCustomItemCode: Generated ItemCode', { itemCode: itemCode }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    return itemCode;

  } catch (error) {
    try { UnifiedLogger.error('ItemCodeMapper', 'generateCustomItemCode: ERROR', error); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

    // Fallback to simple timestamp-based code
    const fallbackCode = 'CUSTOM' + Date.now().toString().slice(-6);
    try { UnifiedLogger.warn('ItemCodeMapper', 'generateCustomItemCode: Using fallback code', { fallbackCode: fallbackCode }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    return fallbackCode;
  }
}

/**
 * Map section name to category code
 *
 * @param {string} sectionName - Section name from proposal
 * @returns {string} Category code for ItemCode generation
 */
function getCategoryFromSection(sectionName) {
  try { UnifiedLogger.info('ItemCodeMapper', 'getCategoryFromSection: Input', { sectionName: sectionName }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

  if (!sectionName) {
    try { UnifiedLogger.info('ItemCodeMapper', 'getCategoryFromSection: Empty section name, using default'); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    return 'Custom';
  }

  const normalized = normalizeText(sectionName);
  try { UnifiedLogger.info('ItemCodeMapper', 'getCategoryFromSection: Normalized', { normalized: normalized }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }

  // Category mapping
  const categoryMap = {
    'production': 'FilmCrew',
    'film production': 'FilmCrew',
    'video production': 'FilmCrew',
    'filming': 'FilmCrew',
    'shoot': 'FilmCrew',
    'crew': 'FilmCrew',

    'post-production': 'PostProd',
    'postproduction': 'PostProd',
    'post production': 'PostProd',
    'editing': 'PostProd',
    'edit': 'PostProd',
    'color': 'PostProd',
    'sound': 'PostProd',
    'vfx': 'PostProd',
    'visual effects': 'PostProd',

    'creative': 'Creative',
    'design': 'Creative',
    'concept': 'Creative',
    'art direction': 'Creative',

    'strategy': 'Strategy',
    'planning': 'Strategy',
    'consultation': 'Strategy',

    'branding': 'Branding',
    'brand': 'Branding',
    'identity': 'Branding',
    'logo': 'Branding',

    'digital': 'Digital',
    'website': 'Digital',
    'web': 'Digital',
    'social media': 'Digital',
    'social': 'Digital',
    'online': 'Digital',

    'pr': 'PR',
    'public relations': 'PR',
    'media relations': 'PR',
    'press': 'PR',

    'marketing': 'Marketing',
    'campaign': 'Marketing',
    'advertising': 'Marketing',
    'media buying': 'Marketing'
  };

  // Check for exact match first
  if (categoryMap[normalized]) {
    try { UnifiedLogger.info('ItemCodeMapper', 'getCategoryFromSection: Exact match found', { category: categoryMap[normalized] }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    return categoryMap[normalized];
  }

  // Check for partial match (keywords)
  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      try { UnifiedLogger.info('ItemCodeMapper', 'getCategoryFromSection: Partial match found', { category: category, keyword: keyword }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
      return category;
    }
  }

  try { UnifiedLogger.info('ItemCodeMapper', 'getCategoryFromSection: No match found, returning default'); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
  return 'Custom';
}

/**
 * Format currency amount with thousands separators
 *
 * @param {number} amount - Numeric amount
 * @returns {string} Formatted string (e.g., "78,000" or "1,234,567.89")
 */
function formatCurrency(amount) {
  try {
    if (amount === null || amount === undefined) {
      return '0';
    }

    const num = parseFloat(amount);

    if (isNaN(num)) {
      try { UnifiedLogger.warn('ItemCodeMapper', 'formatCurrency: Invalid number', { amount: amount }); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
      return '0';
    }

    // Format with thousands separators
    // Use toLocaleString for proper formatting
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });

    return formatted;

  } catch (error) {
    try { UnifiedLogger.warn('ItemCodeMapper', 'formatCurrency: ERROR', String(error)); } catch (ignore) {
      console.error('[ItemCodeMapper] Error:', ignore.message, ignore.stack);
    }
    return amount.toString();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize text for comparison: lowercase, trim, remove extra whitespace
 *
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  if (!text) return '';

  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .trim();
}

/**
 * Extract meaningful keywords from text (filter stopwords)
 *
 * @param {string} text - Text to extract keywords from
 * @returns {Array<string>} Array of keywords
 */
function extractKeywords(text) {
  if (!text) return [];

  const stopwords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'we', 'our', 'your', 'this', 'these',
    'those', 'or', 'but', 'not', 'have', 'do', 'does', 'can', 'could',
    'should', 'would', 'may', 'might', 'must', 'shall'
  ]);

  const words = text.split(/\s+/);
  const keywords = words.filter(word => {
    return word.length > 2 && !stopwords.has(word);
  });

  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Calculate keyword overlap score between two keyword arrays
 *
 * @param {Array<string>} keywords1 - First keyword array
 * @param {Array<string>} keywords2 - Second keyword array
 * @returns {number} Overlap score (0.0 to 1.0)
 */
function calculateKeywordOverlap(keywords1, keywords2) {
  if (!keywords1 || !keywords2 || keywords1.length === 0 || keywords2.length === 0) {
    return 0;
  }

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  let matches = 0;
  for (const keyword of set1) {
    if (set2.has(keyword)) {
      matches++;
    }
  }

  // Jaccard similarity: intersection / union
  const union = new Set([...set1, ...set2]);
  const score = matches / union.size;

  return score;
}


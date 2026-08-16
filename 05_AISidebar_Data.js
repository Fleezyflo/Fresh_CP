/**
 * AISidebar Data Module
 *
 * Responsibilities:
 * - Data normalization (scope entries, sidebar state, resources)
 * - Validation utilities (scope drafts, plans, payloads)
 * - Formatting functions (entry logging, tooltips, text)
 * - Parsing utilities (JSON, numeric values, text extraction)
 * - Compatibility shims (coercion, sanitization)
 *
 * Dependencies:
 * - 05_AISidebar_Config.js (constants, schemas)
 * - 00_NormalizationUtils.js (canonical normalization)
 * - Utilities.js (truncate, ensureArray)
 * - UnifiedLogger.js (logging)
 *
 * Used by: Workflow module, Processing module, UI module
 *
 * Load Order: 05_ prefix ensures loading after Config and Phase modules
 *
 * Extracted from monolithic AISidebar.js
 */

// ===================================================================================
// SECTION 1: Core Data Normalization
// ===================================================================================

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map(value => {
      if (value === undefined || value === null) {
        return '';
      }
      if (typeof value === 'string') {
        return value.trim();
      }
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return normalizeStringArray(value).join(', ');
        }
        const safeValue = Object.assign({}, value);
        if (safeValue.name) return String(safeValue.name);
        if (safeValue.label) return String(safeValue.label);
        if (safeValue.title) return String(safeValue.title);
        if (safeValue.description) return String(safeValue.description);
        if (safeValue.type || safeValue.durationMonths || safeValue.notes) {
          const parts = [];
          if (safeValue.type) parts.push(String(safeValue.type));
          if (safeValue.durationMonths) {
            parts.push(`${safeValue.durationMonths} month${safeValue.durationMonths === 1 ? '' : 's'}`);
          }
          if (safeValue.notes) parts.push(String(safeValue.notes));
          const combined = parts.join(' | ');
          return combined || JSON.stringify(safeValue);
        }
        const objectValues = Object.values(safeValue)
          .filter(entry => entry !== undefined && entry !== null)
          .map(entry => String(entry).trim())
          .filter(entry => entry.length > 0);
        if (objectValues.length > 0) {
          return objectValues.join(' | ');
        }
        return JSON.stringify(safeValue);
      }
      return String(value).trim();
    })
    .filter(value => value.length > 0);
}

function normalizeScopeEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map(function(entry) {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }
    return JSON.parse(JSON.stringify(entry));
  });
}

function selectNonEmptyStrings(value, limit) {
  const max = typeof limit === 'number' && limit > 0 ? limit : 10;
  const collectValues = Array.isArray(value)
    ? value.slice()
    : (value === undefined || value === null)
      ? []
      : String(value).split(/\r?\n|[,;|]/);

  return collectValues
    .map(item => {
      if (item === undefined || item === null) {
        return '';
      }
      if (typeof item === 'string') {
        return item.replace(/\s+/g, ' ').trim();
      }
      if (typeof item === 'number' || typeof item === 'boolean') {
        return String(item).trim();
      }
      if (Array.isArray(item)) {
        return item.map(child => (typeof child === 'string' ? child : JSON.stringify(child))).join(', ');
      }
      if (typeof item === 'object') {
        if (item.name) return String(item.name).trim();
        if (item.label) return String(item.label).trim();
        if (item.title) return String(item.title).trim();
        if (item.description) return String(item.description).trim();
        if (item.summary) return String(item.summary).trim();
        try {
          return JSON.stringify(item);
        } catch (error) {
          return '';
        }
      }
      return String(item).trim();
    })
    .map(entry => entry.replace(/\s+/g, ' ').trim())
    .filter(entry => entry.length > 0)
    .map(entry => truncate(entry, 160))
    .slice(0, max);
}

// DELETED OLD SCHEMA FUNCTION: normalizeSectionItem (was lines 125-136)
// Only used by deleted buildScopeEntriesFromSections function
// Part of OLD nested schema (section.items) processing - no longer needed

function normalizeResources(resources) {
  if (!resources) return [];

  let resourceArray = [];
  if (typeof resources === 'string') {
    resourceArray = resources.split(',').map(function(r) {
      return { role: r.trim(), hours: null, rate: null, internal: null };
    });
  } else if (Array.isArray(resources)) {
    resourceArray = resources.map(function(r) {
      if (typeof r === 'string') {
        return { role: r.trim(), hours: null, rate: null, internal: null };
      } else if (r && typeof r === 'object') {
        return {
          role: String(r.role || ''),
          hours: r.hours || null,
          rate: r.rate || null,
          internal: r.internal !== undefined ? Boolean(r.internal) : null
        };
      }
      return { role: '', hours: null, rate: null, internal: null };
    });
  }

  return resourceArray.slice(0, 3);
}

function normalizeQuantityContext(rawContext, qty, unit, source) {
  const context = rawContext && typeof rawContext === 'object'
    ? Object.assign({}, rawContext)
    : {};
  if (qty !== undefined && qty !== null) {
    context.quantity = Number(qty) || 0;
  }
  if (unit) {
    context.unit = String(unit).trim();
  }
  if (source) {
    context.source = String(source).trim();
  }
  return context;
}

function normalizeUnitRateContext(rawContext, value) {
  const context = rawContext && typeof rawContext === 'object'
    ? Object.assign({}, rawContext)
    : {};
  if (value !== undefined && value !== null) {
    context.unitRate = Number(value) || 0;
  }
  return context;
}

function normalizeSku(value) {
  if (!value) {
    return '';
  }
  const normalized = String(value)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/gi, '')
    .toLowerCase();
  return normalized;
}

function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return plan;
  }
  const normalized = Object.assign({}, plan);
  if (Array.isArray(normalized.sections)) {
    normalized.sections = normalized.sections.map(function(section) {
      if (!section || typeof section !== 'object') {
        return section;
      }
      const normalizedSection = Object.assign({}, section);
      if (Array.isArray(normalizedSection.items)) {
        normalizedSection.items = normalizedSection.items.filter(function(item) {
          return item && typeof item === 'object';
        });
      }
      return normalizedSection;
    });
  }
  return normalized;
}

function normalizeJsonCharacters(text) {
  if (typeof text !== 'string') {
    return text;
  }
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0]/g, ' ');
}

// ===================================================================================
// SECTION 2: Parsing and Coercion
// ===================================================================================

function parseNumericValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).toLowerCase().trim();
  const cleaned = text.replace(/[^0-9.+-]/g, '');
  if (cleaned) {
    const parsedDigits = parseFloat(cleaned);
    if (isNumeric(parsedDigits)) {
      return parsedDigits;
    }
  }

  const WORD_MAP = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };

  const FRACTION_MAP = {
    half: 0.5,
    quarter: 0.25
  };

  const tokenised = text.split(/[^a-z]+/).filter(Boolean);
  if (tokenised.length > 0) {
    let total = 0;
    let current = 0;
    tokenised.forEach(token => {
      if (WORD_MAP[token] !== undefined) {
        current += WORD_MAP[token];
      } else if (FRACTION_MAP[token] !== undefined) {
        current += FRACTION_MAP[token];
      } else if (token === 'hundred') {
        current = current === 0 ? 100 : current * 100;
      } else if (token === 'thousand') {
        current = current === 0 ? 1000 : current * 1000;
        total += current;
        current = 0;
      } else if (token === 'million') {
        current = current === 0 ? 1000000 : current * 1000000;
        total += current;
        current = 0;
      }
    });
    total += current;
    if (total > 0) {
      return total;
    }
  }

  if (text.includes('quarter')) {
    return 3;
  }

  return null;
}

function parseJsonSafe(text, fallback) {
  try {
    const normalized = normalizeJsonCharacters(text);
    return JSON.parse(normalized);
  } catch (error) {
    return fallback !== undefined ? fallback : null;
  }
}

function coerceCatalogNumber(value) {
  if (!value) {
    return '';
  }
  return String(value).trim().toUpperCase();
}

function coerceNumericValue(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return !isNumeric(num) ? 0 : num;
}

// DELETED DEAD CODE: coercePlanItems (was lines 317-338)
// Coerced plan item structure - never called anywhere in codebase
// Only called by coercePlanSections which itself is never called

// DELETED DEAD CODE: coercePlanSections (was lines 340-357)
// Coerced plan sections structure - never called anywhere in codebase
// Dead code - no callers found

// ===================================================================================
// SECTION 3: Validation
// ===================================================================================

function validateScopeDraftPayload(draft) {
  if (!draft || typeof draft !== 'object') {
    throw new AppError('SCOPE_SCHEMA', 'Draft payload must be an object');
  }
  if (!Array.isArray(draft.scopeEntries) || draft.scopeEntries.length === 0) {
    throw new AppError('SCOPE_SCHEMA', 'Draft must contain scopeEntries array with at least one entry');
  }
  return true;
}

function validatePlanPayload(plan, scopeMap) {
  if (!plan || typeof plan !== 'object') {
    throw new AppError('PLAN_SCHEMA', 'Plan payload must be an object');
  }
  if (!Array.isArray(plan.sections) || plan.sections.length === 0) {
    throw new AppError('PLAN_SCHEMA', 'Plan must contain sections array with at least one section');
  }
  if (scopeMap) {
    plan.sections.forEach(function(section) {
      if (!section.scopeEntryId) {
        throw new AppError('PLAN_SCHEMA', 'Each section must have a scopeEntryId');
      }
    });
  }
  return true;
}

function validateQuoteFromSidebar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const quoteSheet = ss.getSheetByName('Quote Builder');
  if (!quoteSheet) {
    throw new AIUserError('QUOTE_VALIDATION', 'Quote Builder sheet not found', 'Create a Quote Builder sheet first');
  }
  const data = quoteSheet.getDataRange().getValues();
  if (data.length < 2) {
    throw new AIUserError('QUOTE_VALIDATION', 'Quote Builder has no data rows', 'Generate a quote first');
  }
  return true;
}

function validateSheetHeaders_(sheet, headerMap, indices) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const missing = [];
  Object.keys(headerMap).forEach(function(key) {
    const expectedHeader = headerMap[key];
    const actualIndex = headerRow.indexOf(expectedHeader);
    if (actualIndex === -1) {
      missing.push(expectedHeader);
    } else {
      indices[key] = actualIndex;
    }
  });
  if (missing.length > 0) {
    throw new AppError('SHEET_SCHEMA', 'Missing required headers: ' + missing.join(', '));
  }
  return true;
}

// ===================================================================================
// SECTION 4: Sanitization
// ===================================================================================

function sanitizeSelectedSkuPayload_(selections) {
  if (!Array.isArray(selections)) {
    return [];
  }
  return selections
    .filter(function(sel) {
      return sel && typeof sel === 'object' && sel.catalogNumber;
    })
    .map(function(sel) {
      return {
        catalogNumber: coerceCatalogNumber(sel.catalogNumber),
        quantity: coerceNumericValue(sel.quantity) || 1,
        rate: coerceNumericValue(sel.rate) || 0,
        label: String(sel.label || '').trim(),
        notes: String(sel.notes || '').trim()
      };
    });
}

function parseSelectedSkuList_(value, scopeEntryId) {
  if (!value) {
    return [];
  }
  let parsed;
  if (typeof value === 'string') {
    parsed = parseJsonSafe(value, []);
  } else if (Array.isArray(value)) {
    parsed = value;
  } else {
    return [];
  }
  return sanitizeSelectedSkuPayload_(parsed).map(function(item) {
    item.scopeEntryId = scopeEntryId;
    return item;
  });
}

function sanitizeSheetText(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    .trim();
}

function sanitizeCostConfigServer(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const sanitized = {};
  Object.keys(raw).forEach(function(key) {
    const value = raw[key];
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'number') {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      const num = parseFloat(value);
      if (isNumeric(num)) {
        sanitized[key] = num;
      }
    }
  });
  return sanitized;
}

function sanitizeJsonPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const sanitized = {};
  Object.keys(raw).forEach(function(key) {
    const value = raw[key];
    if (value === undefined || value === null) {
      sanitized[key] = null;
    } else if (typeof value === 'string') {
      sanitized[key] = normalizeJsonCharacters(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(function(item) {
        if (typeof item === 'string') {
          return normalizeJsonCharacters(item);
        }
        return item;
      });
    } else {
      sanitized[key] = value;
    }
  });
  return sanitized;
}

// ===================================================================================
// SECTION 5: Formatting
// ===================================================================================

function truncateForLog(text) {
  if (text === undefined || text === null) {
    return '';
  }
  const cast = String(text);
  return cast.length > 320 ? cast.substring(0, 319) + '…' : cast;
}

function formatEntryForLog(entry) {
  if (!entry || typeof entry !== 'object') {
    return '(invalid entry)';
  }
  const identifiers = [];
  if (entry.id) {
    identifiers.push(entry.id);
  }
  if (!identifiers.length && entry.scopeEntryId) {
    identifiers.push(entry.scopeEntryId);
  }
  if (!identifiers.length && entry.scopeLabel) {
    identifiers.push(entry.scopeLabel);
  }
  const parent = entry.parentId || entry.sectionParentId || entry.sectionId || '';
  if (parent) {
    identifiers.push('p=' + parent);
  }
  const canonical = entry.canonical ? entry.canonical : '';
  if (canonical && identifiers.indexOf(canonical) === -1) {
    identifiers.push('c=' + canonical);
  }
  const label = entry.scopeLabel || entry.label || '';
  if (label) {
    identifiers.push('l=' + label);
  }
  const status = entry.approvalStatus ? entry.approvalStatus : '';
  if (status) {
    identifiers.push('s=' + status);
  }
  return identifiers.filter(Boolean).join('|') || '(unnamed entry)';
}

function formatFitTooltip(fitEntry) {
  if (!fitEntry || typeof fitEntry !== 'object') {
    return '';
  }
  const parts = [];
  if (fitEntry.label) {
    parts.push(truncate(fitEntry.label, 60));
  }
  if (fitEntry.catalogNumber) {
    parts.push('SKU: ' + fitEntry.catalogNumber);
  }
  if (fitEntry.quantity) {
    parts.push('Qty: ' + fitEntry.quantity);
  }
  if (fitEntry.rate) {
    parts.push('Rate: $' + fitEntry.rate);
  }
  return parts.join(' | ');
}

function formatQuantityForSummary(quantity, unit) {
  if (!quantity) {
    return '';
  }
  const qty = parseFloat(quantity);
  if (!isNumeric(qty)) {
    return String(quantity);
  }
  const unitLabel = unit ? ' ' + String(unit).trim() : '';
  return qty.toFixed(2).replace(/\.00$/, '') + unitLabel;
}

function formatCurrencyWithCode(amount, currency) {
  if (amount === undefined || amount === null) {
    return '';
  }
  const num = parseFloat(amount);
  if (!isNumeric(num)) {
    return String(amount);
  }
  const code = currency ? String(currency).toUpperCase() : 'USD';
  return code + ' $' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLineItemQuantityPrefix(item) {
  if (!item || !item.quantity) {
    return '';
  }
  const qty = parseFloat(item.quantity);
  if (!isNumeric(qty) || qty <= 0) {
    return '';
  }
  return '(' + qty + 'x) ';
}

function formatLineItemUnitDisplay(item) {
  if (!item || !item.unit) {
    return '';
  }
  return ' per ' + String(item.unit).trim();
}

function formatQuantityNumber(quantity) {
  if (quantity === undefined || quantity === null) {
    return '';
  }
  const num = parseFloat(quantity);
  if (!isNumeric(num)) {
    return String(quantity);
  }
  return num.toFixed(2).replace(/\.00$/, '');
}

// ===================================================================================
// SECTION 6: Utility Helpers
// ===================================================================================

function isZeroQuantityAnswer(value) {
  if (value === undefined || value === null) {
    return false;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return false;
  }
  if (text === '0' || text === '0.0' || text === '0.00') {
    return true;
  }
  if (text === 'none' || text === 'no' || text === 'zero' || text === 'not required' || text === 'not needed') {
    return true;
  }
  if (text.startsWith('no ') || text.startsWith('none ')) {
    return true;
  }
  if (/no\s+(talent|crew|shoot|filming|production)/.test(text)) {
    return true;
  }
  return false;
}

function pickFirstText(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const candidate = values[i];
    if (candidate === undefined || candidate === null) {
      continue;
    }
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const text = String(candidate).trim();
      if (text.length) {
        return text;
      }
      continue;
    }
    if (Array.isArray(candidate)) {
      for (let j = 0; j < candidate.length; j += 1) {
        const nested = pickFirstText(candidate[j]);
        if (nested) {
          return nested;
        }
      }
      continue;
    }
    if (typeof candidate === 'object') {
      const nested = pickFirstText(
        candidate.sectionName,
        candidate.sectionLabel,
        candidate.label,
        candidate.name,
        candidate.title,
        candidate.description,
        candidate.summary,
        candidate.id
      );
      if (nested) {
        return nested;
      }
    }
  }
  return '';
}

function splitDetailSegments(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return String(value)
    .split(/\r?\n|•|·|[-–—]\s+|,|;/)
    .map(function(segment) {
      return segment.replace(/^[\s·•\-–—]+/, '').trim();
    })
    .filter(function(segment) {
      return segment !== '';
    });
}

function mergeUniqueMessages(baseList, additions) {
  const merged = Array.isArray(baseList) ? baseList.slice() : [];
  const seen = new Set(merged.map(function(msg) {
    return String(msg).toLowerCase().trim();
  }));

  (Array.isArray(additions) ? additions : []).forEach(function(msg) {
    const normalized = String(msg).toLowerCase().trim();
    if (!seen.has(normalized)) {
      merged.push(msg);
      seen.add(normalized);
    }
  });

  return merged;
}

// ===================================================================================
// Global exports for backward compatibility
// ===================================================================================

if (typeof globalThis !== 'undefined') {





}

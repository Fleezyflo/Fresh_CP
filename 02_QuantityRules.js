/**
 * Deterministic SKU quantity resolver.
 * Translates scope signals into SKU-ready qty/unit pairs.
 * LLM determines quantities from brief context - no hardcoded archetype fallbacks needed.
 */

/**
 * Resolve quantity & unit for the provided SKU.
 * @param {Object} context
 * @return {{qty:number, unit:string, source:string, warnings:Array<string>}}
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function resolveSkuQuantity(context) {
  const trace = UnifiedLogger.startTrace('QuantityRules', 'resolveSkuQuantity', {
    hasContext: !!context,
    archetype: context && context.skuMeta ? context.skuMeta.archetype : null
  });

  try {
    const warnings = [];
  const skuMeta = context && context.skuMeta ? context.skuMeta : {};
  const catalogItem = context && context.catalogItem ? context.catalogItem : {};
  const rawSignalLookup = context && context.signalLookup ? context.signalLookup : {};
  // archetype and phaseKey variables removed - no longer needed after SKU_QUANTITY_FALLBACKS deletion
  // Signal filtering removed - all signals from scope entry are now used
  const signalLookup = rawSignalLookup || {};

  let unit = catalogItem.unit || 'Unit';
  let qty = null;
  let source = '';

  const unitSpan = skuMeta.unitSpan || {};
  if (unitSpan && unitSpan.mode) {
    const resolved = resolveFromUnitSpan(unitSpan, signalLookup);
    if (resolved.qty !== null) {
      qty = resolved.qty;
      source = resolved.source;
      if (resolved.warning) {
        warnings.push(resolved.warning);
      }
    }
  }

  // SKU_QUANTITY_FALLBACKS removed - all SKUs must have complete unitSpan metadata
  // If unitSpan resolution fails, will fall through to minimum fallback below

  if (qty === null || qty <= 0) {
    qty = skuMeta.unitSpan && skuMeta.unitSpan.minimum ? skuMeta.unitSpan.minimum : 1;
    source = source || 'minimum-fallback';
    warnings.push('Quantity defaulted to minimum - SKU missing unitSpan metadata or signals not found.');
  }

  qty = Math.max(1, Math.ceil(qty));
  if (!unit) {
    unit = 'Unit';
  }

  const result = {
    qty: qty,
    unit: unit,
    source: source || 'unspecified',
    warnings: warnings
  };

  trace.complete('SKU quantity resolved', {
    qty: result.qty,
    unit: result.unit,
    source: result.source,
    warningCount: warnings.length
  });

  return result;

  } catch (error) {
    trace.fail('SKU quantity resolution failed', error);

    const friendly = createUserFriendlyError(error, {
      operation: 'resolving SKU quantity',
      correlationId: trace.correlationId
    });

    showErrorToast(friendly.title, friendly.message, null, {
      technicalDetails: friendly.technicalDetails,
      correlationId: friendly.correlationId,
      error: error
    });

    // Return safe fallback
    return {
      qty: 1,
      unit: 'Unit',
      source: 'error-fallback',
      warnings: ['Quantity resolution failed: ' + error.toString()]
    };
  }
}

/**
 * Apply unit span configuration to produce quantity.
 * @param {{signal:string,mode:string,value:number,minimum:number}} unitSpan
 * @param {Object<string,Object>} signalLookup
 * @return {{qty:(number|null),source:string,warning:(string|undefined)}}
 */
function resolveFromUnitSpan(unitSpan, signalLookup) {
  const trace = UnifiedLogger.startTrace('QuantityRules', 'resolveFromUnitSpan');
  try {
    const minimum = unitSpan.minimum !== undefined ? unitSpan.minimum : 1;
    const signalKey = unitSpan.signal || '';
    const signalValue = signalKey ? getSignalValue(signalLookup, signalKey) : null;
    const mode = unitSpan.mode || 'fixed';

    let result;
    switch (mode) {
      case 'copy':
        if (signalValue && signalValue > 0) {
          result = { qty: signalValue, source: signalKey || 'copy' };
        } else {
          result = { qty: minimum, source: 'copy-fallback', warning: signalKey ? 'Missing signal ' + signalKey + ', defaulted to minimum.' : 'Defaulted to minimum.' };
        }
        break;
      case 'divide-ceil': {
        const divisor = unitSpan.value || 1;
        if (signalValue && signalValue > 0) {
          const qty = Math.ceil(signalValue / divisor);
          result = { qty: Math.max(qty, minimum), source: signalKey || 'divide' };
        } else {
          result = { qty: minimum, source: 'divide-fallback', warning: signalKey ? 'Missing signal ' + signalKey + ', defaulted to minimum.' : 'Defaulted to minimum.' };
        }
        break;
      }
      case 'fixed':
      default: {
        const fixed = unitSpan.value || 1;
        result = { qty: Math.max(fixed, minimum), source: 'fixed' };
        break;
      }
    }

    trace.complete('resolveFromUnitSpan completed', { mode: mode, qty: result.qty, source: result.source });
    return result;
  } catch (error) {
    trace.fail('resolveFromUnitSpan failed', error);
    throw error;
  }
}

/**
 * Safely extract numeric value from signal lookup map.
 * @param {Object<string,Object>} signalLookup
 * @param {string} key
 * @return {number}
 */
function getSignalValue(signalLookup, key) {
  const trace = UnifiedLogger.startTrace('QuantityRules', 'getSignalValue');
  try {
    if (!signalLookup || !key) {
      trace.complete('getSignalValue completed - no signal/key', { key: key });
      return 0;
    }
    const entry = signalLookup[key];
    if (!entry) {
      trace.complete('getSignalValue completed - entry not found', { key: key });
      return 0;
    }
    const value = entry.value !== undefined ? entry.value : entry;
    const parsed = Number(value);
    const result = isNaN(parsed) ? 0 : parsed;
    trace.complete('getSignalValue completed', { key: key, value: result });
    return result;
  } catch (error) {
    trace.fail('getSignalValue failed', error);
    throw error;
  }
}

if (typeof globalThis !== 'undefined') {
}

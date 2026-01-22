/**
 * Check Script Properties Status
 * Run this via: clasp run checkPropertiesStatus
 */

function checkPropertiesStatus() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const keys = Object.keys(all);

  const required = [
    'SOURCE_DATA_FOLDER_ID',
    'XERO_CLIENT_ID',
    'XERO_CLIENT_SECRET',
    'XERO_TENANT_ID',
    'OPENAI_API_KEY',
    'OPENAI_VECTOR_STORE_ID'
  ];

  const optional = [
    'OPENAI_ASSISTANT_ID',
    'OPENAI_ASSISTANT_MODEL',
    'OPENAI_PROMPT_ID',
    'GOOGLE_PICKER_KEY',
    'LLM_API_KEY'
  ];

  console.log('=== SCRIPT PROPERTIES STATUS ===');
  console.log('Total properties: ' + keys.length);
  console.log('');

  console.log('REQUIRED PROPERTIES:');
  required.forEach(function(key) {
    const value = all[key];
    if (value) {
      console.log('✅ ' + key + ': SET (length: ' + value.length + ')');
    } else {
      console.log('❌ ' + key + ': MISSING');
    }
  });

  console.log('');
  console.log('OPTIONAL PROPERTIES:');
  optional.forEach(function(key) {
    const value = all[key];
    if (value) {
      console.log('✅ ' + key + ': SET (length: ' + value.length + ')');
    } else {
      console.log('⚪ ' + key + ': NOT SET (optional)');
    }
  });

  console.log('');
  console.log('ALL PROPERTIES:');
  keys.sort().forEach(function(key) {
    const isSensitive = key.includes('SECRET') || key.includes('KEY');
    const value = all[key];
    if (isSensitive) {
      console.log(key + ': [REDACTED - length: ' + value.length + ']');
    } else {
      // Show first 50 chars only for non-sensitive
      const display = value.length > 50 ? value.substring(0, 50) + '...' : value;
      console.log(key + ': ' + display);
    }
  });

  // Return structured data
  const missingRequired = required.filter(function(key) { return !all[key]; });

  return {
    total: keys.length,
    required: {
      total: required.length,
      present: required.filter(function(k) { return all[k]; }).length,
      missing: missingRequired
    },
    optional: {
      total: optional.length,
      present: optional.filter(function(k) { return all[k]; }).length
    },
    allKeys: keys,
    status: missingRequired.length === 0 ? 'READY' : 'INCOMPLETE'
  };
}

/**
 * List all property keys (no values)
 */
function listPropertyKeys() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const keys = Object.keys(all).sort();

  console.log('Script Property Keys (' + keys.length + '):');
  keys.forEach(function(key) {
    console.log('  - ' + key);
  });

  return keys;
}

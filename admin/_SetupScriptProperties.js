/**
 * Script Properties Setup Helper
 *
 * This function creates a script property setup interface.
 * Run this function manually and provide your actual API keys.
 *
 * SECURITY WARNING: Do not hardcode actual keys in this file!
 * This is a template - you must run it interactively.
 */

function setupScriptPropertiesInteractive() {
  const props = PropertiesService.getScriptProperties();

  // Check what properties are already set
  const existing = props.getProperties();
  const existingKeys = Object.keys(existing);

  Logger.log('=== Current Script Properties ===');
  Logger.log('Total properties: ' + existingKeys.length);
  Logger.log('Keys: ' + existingKeys.join(', '));

  // List required properties
  const required = [
    'OPENAI_API_KEY',
    'OPENAI_VECTOR_STORE_ID',
    'XERO_CLIENT_ID',
    'XERO_CLIENT_SECRET',
    'XERO_TENANT_ID'
  ];

  const optional = [
    'OPENAI_ASSISTANT_ID',
    'OPENAI_ASSISTANT_MODEL',
    'OPENAI_PROMPT_ID',
    'GOOGLE_PICKER_KEY'
  ];

  Logger.log('\n=== Required Properties ===');
  required.forEach(function(key) {
    const value = existing[key];
    if (value) {
      Logger.log('✅ ' + key + ': SET (length: ' + value.length + ')');
    } else {
      Logger.log('❌ ' + key + ': NOT SET');
    }
  });

  Logger.log('\n=== Optional Properties ===');
  optional.forEach(function(key) {
    const value = existing[key];
    if (value) {
      Logger.log('✅ ' + key + ': SET (length: ' + value.length + ')');
    } else {
      Logger.log('⚪ ' + key + ': NOT SET (optional)');
    }
  });

  return {
    status: 'INFO',
    existing: existingKeys.length,
    required: required,
    optional: optional,
    message: 'Check execution logs for details. Set properties via: Extensions → Apps Script → Project Settings → Script Properties'
  };
}

/**
 * Test if all required Script Properties are set
 */
function testScriptPropertiesSetup() {
  const props = PropertiesService.getScriptProperties();

  const required = [
    'OPENAI_API_KEY',
    'OPENAI_VECTOR_STORE_ID',
    'XERO_CLIENT_ID',
    'XERO_CLIENT_SECRET',
    'XERO_TENANT_ID'
  ];

  const missing = [];
  const present = [];

  required.forEach(function(key) {
    const value = props.getProperty(key);
    if (value && value.trim()) {
      present.push(key);
      Logger.log('✅ ' + key + ' is set');
    } else {
      missing.push(key);
      Logger.log('❌ ' + key + ' is MISSING');
    }
  });

  if (missing.length === 0) {
    Logger.log('\n✅ All required properties are set!');
    return { status: 'OK', message: 'All required properties configured' };
  } else {
    Logger.log('\n❌ Missing ' + missing.length + ' required properties');
    Logger.log('Missing: ' + missing.join(', '));
    return {
      status: 'ERROR',
      message: 'Missing properties: ' + missing.join(', '),
      missing: missing
    };
  }
}

/**
 * Set a single Script Property (for testing)
 *
 * Example usage in Apps Script editor:
 * setScriptProperty('OPENAI_API_KEY', 'sk-proj-...');
 */
function setScriptProperty(key, value) {
  if (!key || !value) {
    throw new Error('Both key and value are required');
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty(key, value);

  Logger.log('✅ Set property: ' + key + ' (length: ' + value.length + ')');

  return {
    status: 'OK',
    message: 'Property ' + key + ' has been set'
  };
}

/**
 * Delete all Script Properties (USE WITH CAUTION!)
 */
function deleteAllScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  Logger.log('⚠️ All Script Properties deleted');
  return { status: 'OK', message: 'All properties deleted' };
}

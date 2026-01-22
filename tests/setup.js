/**
 * Jest Setup File - Global Mocks for Google Apps Script APIs
 *
 * This file runs before each test file and sets up mocks for GAS globals.
 *
 * Mocked GAS APIs:
 * - Logger (logging)
 * - SpreadsheetApp (spreadsheet operations)
 * - PropertiesService (property storage)
 * - Utilities (utility functions)
 * - UnifiedLogger (custom logging)
 *
 * These mocks allow unit tests to run without GAS runtime.
 */

// Mock Logger API
global.Logger = {
  log: jest.fn(),
  clear: jest.fn()
};

// Mock SpreadsheetApp API
global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(),
  openById: jest.fn(),
  openByUrl: jest.fn()
};

// Mock PropertiesService API
global.PropertiesService = {
  getScriptProperties: jest.fn(() => ({
    getProperty: jest.fn(),
    setProperty: jest.fn(),
    getProperties: jest.fn(() => ({}))
  })),
  getUserProperties: jest.fn(() => ({
    getProperty: jest.fn(),
    setProperty: jest.fn(),
    getProperties: jest.fn(() => ({}))
  }))
};

// Mock Utilities API
global.Utilities = {
  newBlob: jest.fn(),
  formatDate: jest.fn(),
  formatString: jest.fn(),
  base64Encode: jest.fn(),
  base64Decode: jest.fn()
};

// Mock UnifiedLogger (custom logging system)
global.UnifiedLogger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  startTrace: jest.fn(() => ({ end: jest.fn() }))
};

// Mock console for consistency
console.error = jest.fn();
console.warn = jest.fn();
console.log = jest.fn();

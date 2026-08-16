/**
 * Sidebar State Storage - Hybrid Architecture
 *
 * DESIGN PRINCIPLES:
 * - Fast reads: Properties for current state (O(1))
 * - Complete history: Sheet for audit trail
 * - Auto-lifecycle: Archive old data automatically
 * - Modularity: Swap backends without changing callers
 * - Intelligence: Routes to optimal storage based on access pattern
 *
 * STORAGE TIERS:
 * Tier 1 (Hot):  PropertiesService - Current state only (instant access)
 * Tier 2 (Warm): Sheet - Recent history (last 90 days)
 * Tier 3 (Cold): Archive Sheet - Historical data (>90 days)
 *
 * MIGRATION STRATEGY:
 * Add abstraction layer, use existing sheet (backward compatible)
 * Migrate current state to Properties
 * Enable auto-archival
 * (Future) Swap to external DB if needed
 */

// ===== Configuration =====

const SIDEBAR_STATE_CONFIG = {
  // Tier 1: Properties keys (per user, per state type)
  PROPERTY_PREFIX: 'SIDEBAR_STATE_',

  // Migration tracking
  MIGRATION_FLAG_PREFIX: 'SIDEBAR_MIGRATION_V1_',  // Global flag per user

  // Lifecycle health (script properties — records last scheduled run, not invented metrics)
  LIFECYCLE_HEALTH_KEYS: {
    ARCHIVAL: 'SIDEBAR_LIFECYCLE_LAST_ARCHIVAL',
    PRUNING: 'SIDEBAR_LIFECYCLE_LAST_PRUNE'
  },

  // Tier 2: Active sheet (recent data)
  ACTIVE_SHEET_NAME: '_AI_SIDEBAR_STATE',
  ACTIVE_RETENTION_DAYS: 90,

  // Tier 3: Archive sheet (old data)
  ARCHIVE_SHEET_NAME: '_AI_SIDEBAR_STATE_ARCHIVE',

  // Performance limits
  MAX_RECENT_ROWS_PER_USER: 50,   // Load limit for warm storage (50 is plenty!)
  MAX_SNAPSHOTS_PER_USER: 25,     // Keep only N latest snapshots
  MAX_QUOTE_RUNS_PER_USER: 50,    // Keep only N latest quote runs

  // State types
  TYPES: {
    SNAPSHOT: 'snapshot',
    DRAFT: 'draft',
    QUOTE_RUN: 'quote_run',
    COST_CONFIG: 'cost_config'
  }
};

// ===== Migration Helpers =====

// Session-level migration tracking (prevents race conditions)
var sessionMigrationCache_ = {};

/**
 * Legacy sheet row types mapped to canonical SidebarStateStorage types.
 * @private
 */
var SIDEBAR_STATE_LEGACY_TYPE_ALIASES_ = {
  draft: ['draftState'],
  cost_config: ['costConfig'],
  quote_run: ['quoteRun']
};

/**
 * Check whether a sheet row type matches a canonical state type (includes legacy aliases).
 * @param {string} rowType - Type stored on the sheet row
 * @param {string} canonicalType - Canonical SidebarStateStorage type
 * @returns {boolean}
 * @private
 */
function matchesSidebarStateType_(rowType, canonicalType) {
  if (rowType === canonicalType) {
    return true;
  }
  const aliases = SIDEBAR_STATE_LEGACY_TYPE_ALIASES_[canonicalType];
  return !!(aliases && aliases.indexOf(rowType) >= 0);
}

/**
 * Unwrap persisted state data from Properties envelope ({ data: ... }) when present.
 * @param {Object|null} state - Raw state from getSidebarCurrentState
 * @returns {Object|null}
 */
function unwrapSidebarStateData_(state) {
  if (!state || typeof state !== 'object') {
    return state;
  }
  if (state.data && typeof state.data === 'object') {
    return state.data;
  }
  return state;
}

/**
 * Check if user has already been migrated (global flag + session cache)
 * @param {string} userId - User email
 * @returns {boolean} True if already migrated
 * @private
 */
function checkGlobalMigrationFlag_(userId) {
  // Check session cache FIRST (prevents race conditions)
  if (sessionMigrationCache_[userId]) {
    return true;
  }

  try {
    const flagKey = SIDEBAR_STATE_CONFIG.MIGRATION_FLAG_PREFIX + userId;
    const flag = PropertiesLoader.load(flagKey);
    const migrated = flag === 'completed';

    // Cache in session to prevent re-checking
    if (migrated) {
      sessionMigrationCache_[userId] = true;
    }

    return migrated;
  } catch (e) {
    return false;
  }
}

/**
 * Set global migration flag for user
 * @param {string} userId - User email
 * @private
 */
function setGlobalMigrationFlag_(userId) {
  // Set session cache IMMEDIATELY (atomic-like behavior)
  sessionMigrationCache_[userId] = true;

  try {
    const flagKey = SIDEBAR_STATE_CONFIG.MIGRATION_FLAG_PREFIX + userId;
    PropertiesLoader.save(flagKey, 'completed');
  } catch (e) {
    UnifiedLogger.warn('SidebarStateStorage', 'Failed to set migration flag', {
      userId: userId,
      error: String(e)
    });
  }
}

// ===== Storage Abstraction Layer =====

/**
 * Get current state for user (fast path - Properties first, Sheet fallback)
 *
 * @param {string} userId - User email
 * @param {string} stateType - Type of state (snapshot, draft, etc)
 * @returns {Object|null} Current state or null
 */
function getSidebarCurrentState(userId, stateType) {
  const trace = UnifiedLogger.startTrace('SidebarStateStorage', 'getSidebarCurrentState');

  try {
    // Check global migration flag ONCE per user (not per state type)
    const alreadyMigrated = checkGlobalMigrationFlag_(userId);

    // FAST PATH: Check Properties first (Tier 1 - Hot)
    const propKey = SIDEBAR_STATE_CONFIG.PROPERTY_PREFIX + stateType;

    try {
      const cached = PropertiesLoader.load(propKey);

      if (cached) {
        const parsed = safeJsonParse(cached, null);
        if (parsed && parsed.userId === userId) {
          // MIGRATION: Strip catalogItem from old states (only if not already migrated)
          let needsMigration = false;
          if (!alreadyMigrated && parsed && parsed.data && !parsed.data.__migrated) {
            parsed.data = migrateSidebarState_(parsed.data);
            parsed.data.__migrated = true;
            needsMigration = true;

            // Set global flag on first migration to prevent re-running
            setGlobalMigrationFlag_(userId);
          }

          // Save migrated state back to avoid re-migration on next load
          if (needsMigration) {
            try {
              PropertiesLoader.save(propKey, JSON.stringify(parsed));
            } catch (saveError) {
              UnifiedLogger.warn('SidebarStateStorage', 'Failed to save migrated state', {
                stateType: stateType,
                error: String(saveError)
              });
            }
          }

          trace.complete('Current state loaded from Properties', {
            userId: userId,
            stateType: stateType,
            source: 'properties',
            migrated: needsMigration,
            globalMigrationFlag: alreadyMigrated
          });
          return parsed;
        }
      }
    } catch (propError) {
      // Properties corrupted/truncated - fallback to Sheet
      try {
        UnifiedLogger.warn('SidebarStateStorage', 'Properties load failed, using Sheet fallback', {
          stateType: stateType,
          error: String(propError)
        });

        // Clean up corrupt data
        PropertiesLoader.remove(propKey);

      } catch (logError) {
        console.warn('Properties load failed:', stateType, propError);
      }
    }

    // FALLBACK: Load from Sheet (Tier 2 - Warm)
    const rows = loadUserSidebarStateRows(userId, 50); // Limit to recent
    const match = rows.find(function(row) {
      return matchesSidebarStateType_(row.type, stateType);
    });

    if (match && match.payload) {
      const parsed = parseSidebarStatePayload(match.payload);

      // MIGRATION: Strip catalogItem from old states
      let needsMigration = false;
      if (parsed && parsed.data && !parsed.data.__migrated) {
        parsed.data = migrateSidebarState_(parsed.data);
        parsed.data.__migrated = true;
        needsMigration = true;
      }

      // Save migrated state back to Properties for faster next load
      if (needsMigration) {
        try {
          PropertiesLoader.save(propKey, JSON.stringify(parsed));
        } catch (saveError) {
          UnifiedLogger.warn('SidebarStateStorage', 'Failed to save migrated state from Sheet', {
            stateType: stateType,
            error: String(saveError)
          });
        }
      }

      trace.complete('Current state loaded from Sheet', {
        userId: userId,
        stateType: stateType,
        source: 'sheet',
        migrated: needsMigration
      });
      return parsed;
    }

    trace.complete('No current state found', { userId: userId, stateType: stateType });
    return null;

  } catch (error) {
    trace.fail('getSidebarCurrentState failed', error);
    throw error;
  }
}

/**
 * Save state for user (writes to both Properties and Sheet)
 *
 * @param {string} userId - User email
 * @param {string} stateType - Type of state
 * @param {Object} data - State data to save
 * @param {Object} options - Save options (id, label, etc)
 */
function saveSidebarState(userId, stateType, data, options) {
  const trace = UnifiedLogger.startTrace('SidebarStateStorage', 'saveSidebarState');

  try {
    options = options || {};
    const timestamp = new Date().toISOString();
    const stateId = options.id || generateStateId_();

    // Prepare state object
    const state = {
      id: stateId,
      userId: userId,
      type: stateType,
      data: data,
      label: options.label || stateId,
      timestamp: timestamp
    };

    // TIER 1 (Hot): Save to Properties for instant access
    // Only save if this is "current" state (snapshot, draft, cost config)
    // AND if size is within Properties limit (9KB)
    if (shouldCacheInProperties_(stateType)) {
      const propKey = SIDEBAR_STATE_CONFIG.PROPERTY_PREFIX + stateType;
      const stateJson = JSON.stringify(state);
      // Calculate ACTUAL byte size (not character count) to prevent truncation
      // PropertiesService limit: 9,216 bytes per property
      const sizeBytes = Utilities.newBlob(stateJson, 'text/plain', 'UTF-8').getBytes().length;
      const maxSize = 9000; // Properties limit is 9KB per value

      if (sizeBytes <= maxSize) {
        PropertiesLoader.save(propKey, stateJson);
      } else {
        // Too large for Properties - skip caching, Sheet is source of truth
        try {
          UnifiedLogger.warn('SidebarStateStorage', 'State too large for Properties cache', {
            stateType: stateType,
            sizeBytes: sizeBytes,
            maxSize: maxSize
          });
        } catch (logError) {
          console.warn('State too large for Properties:', stateType, sizeBytes);
        }
      }
    }

    // TIER 2 (Warm): Append to Sheet for audit trail
    const entry = {
      id: stateId,
      user: userId,
      type: stateType,
      label: state.label,
      payload: JSON.stringify(data),
      timestamp: timestamp
    };
    upsertUserSidebarStateRow(entry);

    // Auto-prune historical types (keep latest N per user)
    if (stateType === SIDEBAR_STATE_CONFIG.TYPES.SNAPSHOT ||
        stateType === SIDEBAR_STATE_CONFIG.TYPES.QUOTE_RUN) {
      try {
        pruneSidebarStateByType(userId, stateType);
      } catch (pruneError) {
        UnifiedLogger.warn('SidebarStateStorage', 'Auto-prune after save failed', {
          userId: userId,
          stateType: stateType,
          error: String(pruneError)
        });
      }
    }

    trace.complete('State saved', {
      userId: userId,
      stateType: stateType,
      stateId: stateId
    });

  } catch (error) {
    trace.fail('saveSidebarState failed', error);
    throw error;
  }
}

/**
 * Get history for user (from Sheet, with intelligent limits)
 *
 * @param {string} userId - User email
 * @param {string} stateType - Type of state (optional, null = all types)
 * @param {number} limit - Max rows to return
 * @returns {Array} Array of historical state objects
 */
function getSidebarHistory(userId, stateType, limit) {
  const trace = UnifiedLogger.startTrace('SidebarStateStorage', 'getSidebarHistory');

  try {
    const maxRows = limit || SIDEBAR_STATE_CONFIG.MAX_RECENT_ROWS_PER_USER;
    const rows = loadUserSidebarStateRows(userId, maxRows);

    // Filter by type if specified
    let filtered = rows;
    if (stateType) {
      filtered = rows.filter(function(row) {
        return matchesSidebarStateType_(row.type, stateType);
      });
    }

    // Parse payloads
    const history = [];
    filtered.forEach(function(row) {
      const parsed = parseSidebarStatePayload(row.payload);
      if (parsed) {
        // MIGRATION: Strip catalogItem from historical states
        const migrated = migrateSidebarState_(parsed);

        history.push({
          id: row.id,
          type: row.type,
          label: row.label,
          data: migrated,
          timestamp: row.timestamp
        });
      }
    });

    trace.complete('History loaded', {
      userId: userId,
      stateType: stateType,
      count: history.length
    });

    return history;

  } catch (error) {
    trace.fail('getSidebarHistory failed', error);
    throw error;
  }
}

/**
 * Archive old data (move to archive sheet, delete from active)
 * Run this periodically (monthly trigger recommended)
 *
 * @param {number} daysOld - Archive data older than N days (default: 90)
 * @returns {Object} Archive summary
 */
function archiveSidebarStateData(daysOld) {
  const trace = UnifiedLogger.startTrace('SidebarStateStorage', 'archiveSidebarStateData');

  try {
    const retentionDays = daysOld || SIDEBAR_STATE_CONFIG.ACTIVE_RETENTION_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const activeSheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SIDEBAR_STATE_CONFIG.ACTIVE_SHEET_NAME);

    if (!activeSheet || activeSheet.getLastRow() <= 1) {
      trace.complete('No data to archive');
      return { archived: 0, deleted: 0 };
    }

    // Get archive sheet (create if needed)
    let archiveSheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SIDEBAR_STATE_CONFIG.ARCHIVE_SHEET_NAME);

    if (!archiveSheet) {
      archiveSheet = SpreadsheetApp.getActiveSpreadsheet()
        .insertSheet(SIDEBAR_STATE_CONFIG.ARCHIVE_SHEET_NAME);
      archiveSheet.hideSheet();

      // Copy headers from active sheet
      const headers = activeSheet.getRange(1, 1, 1, activeSheet.getLastColumn()).getValues();
      archiveSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    }

    // Find rows to archive
    const lastRow = activeSheet.getLastRow();
    const timestampCol = activeSheet.getLastColumn(); // Timestamp is last column
    const data = activeSheet.getRange(2, 1, lastRow - 1, timestampCol).getValues();

    const rowsToArchive = [];
    const rowsToDelete = [];

    data.forEach(function(row, idx) {
      const timestamp = row[timestampCol - 1];
      if (timestamp && new Date(timestamp) < cutoffDate) {
        rowsToArchive.push(row);
        rowsToDelete.push(idx + 2); // +2 because: 0-indexed + header row
      }
    });

    // Move to archive
    if (rowsToArchive.length > 0) {
      const archiveLastRow = archiveSheet.getLastRow();
      archiveSheet.getRange(archiveLastRow + 1, 1, rowsToArchive.length, timestampCol)
        .setValues(rowsToArchive);
    }

    // Delete from active (in reverse order to preserve indices)
    rowsToDelete.reverse().forEach(function(rowNum) {
      activeSheet.deleteRow(rowNum);
    });

    const summary = {
      archived: rowsToArchive.length,
      deleted: rowsToDelete.length,
      cutoffDate: cutoffDate.toISOString()
    };

    trace.complete('Archive complete', summary);
    return summary;

  } catch (error) {
    trace.fail('archiveSidebarStateData failed', error);
    throw error;
  }
}

/**
 * Prune old snapshots/quote runs per user (keep only latest N)
 * Run this when saving new snapshots
 *
 * @param {string} userId - User email
 * @param {string} stateType - Type to prune (snapshot, quote_run)
 */
function pruneSidebarStateByType(userId, stateType) {
  const trace = UnifiedLogger.startTrace('SidebarStateStorage', 'pruneSidebarStateByType');

  try {
    const maxCount = getMaxCountForType_(stateType);
    if (!maxCount) {
      trace.complete('No limit for type', { stateType: stateType });
      return { deleted: 0, kept: 0 };
    }

    // Get all rows for this user/type
    const history = getSidebarHistory(userId, stateType, maxCount + 100); // Load extra to prune

    if (history.length <= maxCount) {
      trace.complete('No pruning needed', {
        userId: userId,
        stateType: stateType,
        count: history.length
      });
      return { deleted: 0, kept: history.length };
    }

    // Sort by timestamp DESC, keep only latest N
    history.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    const toDelete = history.slice(maxCount); // Everything after maxCount

    // Delete old rows from sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SIDEBAR_STATE_CONFIG.ACTIVE_SHEET_NAME);

    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    const rowsToDelete = [];
    toDelete.forEach(function(old) {
      data.forEach(function(row, idx) {
        if (row[0] === old.id) {
          rowsToDelete.push(idx + 2);
        }
      });
    });

    // Delete in reverse order
    rowsToDelete.reverse().forEach(function(rowNum) {
      sheet.deleteRow(rowNum);
    });

    const deleted = rowsToDelete.length;
    trace.complete('Pruned old entries', {
      userId: userId,
      stateType: stateType,
      deleted: deleted
    });
    return { deleted: deleted, kept: maxCount };

  } catch (error) {
    trace.fail('pruneSidebarStateByType failed', error);
    throw error;
  }
}

// ===== Private Helpers =====

/**
 * Generate unique state ID
 * @private
 */
function generateStateId_() {
  return 'state_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Check if state type should be cached in Properties
 * @private
 */
function shouldCacheInProperties_(stateType) {
  // Cache "current" states only (not historical quote runs)
  return stateType === SIDEBAR_STATE_CONFIG.TYPES.SNAPSHOT ||
         stateType === SIDEBAR_STATE_CONFIG.TYPES.DRAFT ||
         stateType === SIDEBAR_STATE_CONFIG.TYPES.COST_CONFIG;
}

/**
 * Get max count for state type
 * @private
 */
function getMaxCountForType_(stateType) {
  const limits = {
    'snapshot': SIDEBAR_STATE_CONFIG.MAX_SNAPSHOTS_PER_USER,
    'quote_run': SIDEBAR_STATE_CONFIG.MAX_QUOTE_RUNS_PER_USER
  };
  return limits[stateType] || null;
}

// ===== Lifecycle Health & Scheduled Maintenance =====

/**
 * Record that a lifecycle operation ran (archival or pruning).
 * Stores timestamp + caller-supplied summary only — no invented metrics.
 *
 * @param {string} operation - 'archival' or 'pruning'
 * @param {Object} result - Summary returned by archive/prune helpers
 * @private
 */
function recordSidebarLifecycleRun_(operation, result) {
  try {
    const props = PropertiesService.getScriptProperties();
    const keys = SIDEBAR_STATE_CONFIG.LIFECYCLE_HEALTH_KEYS;
    const key = operation === 'archival' ? keys.ARCHIVAL : keys.PRUNING;
    const record = {
      timestamp: new Date().toISOString(),
      operation: operation,
      result: result || {}
    };
    props.setProperty(key, JSON.stringify(record));
  } catch (error) {
    UnifiedLogger.warn('SidebarStateStorage', 'Failed to record lifecycle run', {
      operation: operation,
      error: String(error)
    });
  }
}

/**
 * Read lifecycle health — whether archival/pruning have run and their last summaries.
 *
 * @param {Object} [options] - { source: string for logging }
 * @returns {Object} Health payload with lastArchival, lastPruning, healthy flag
 */
function checkSidebarStateLifecycleHealth(options) {
  const opts = options || {};
  const props = PropertiesService.getScriptProperties();
  const keys = SIDEBAR_STATE_CONFIG.LIFECYCLE_HEALTH_KEYS;
  let lastArchival = null;
  let lastPruning = null;

  try {
    const archivalRaw = props.getProperty(keys.ARCHIVAL);
    if (archivalRaw) {
      lastArchival = safeJsonParse(archivalRaw, null);
    }
    const pruningRaw = props.getProperty(keys.PRUNING);
    if (pruningRaw) {
      lastPruning = safeJsonParse(pruningRaw, null);
    }
  } catch (error) {
    UnifiedLogger.warn('SidebarStateStorage', 'checkSidebarStateLifecycleHealth read failed', {
      error: String(error)
    });
  }

  const healthy = !!(lastArchival && lastPruning);
  const payload = {
    source: opts.source || 'manual',
    healthy: healthy,
    lastArchival: lastArchival,
    lastPruning: lastPruning
  };

  try {
    UnifiedLogger.info('SidebarStateStorage', 'Sidebar lifecycle health', payload);
  } catch (ignore) {
    console.log('Sidebar lifecycle health:', JSON.stringify(payload));
  }

  return payload;
}

/**
 * Distinct user emails present on the active sidebar state sheet.
 * @returns {string[]}
 * @private
 */
function getDistinctSidebarStateUserIds_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SIDEBAR_STATE_CONFIG.ACTIVE_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) {
    return [];
  }
  const lastRow = sheet.getLastRow();
  const userCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  const seen = {};
  const users = [];
  userCol.forEach(function(row) {
    const email = row[0];
    if (!email) {
      return;
    }
    const normalized = String(email).trim();
    if (!normalized || seen[normalized]) {
      return;
    }
    seen[normalized] = true;
    users.push(normalized);
  });
  return users;
}

/**
 * Prune snapshot and quote_run rows for every user on the active sheet.
 * Idempotent — safe to run repeatedly.
 *
 * @returns {Object} Summary with usersProcessed and per-type delete counts
 */
function pruneSidebarStateForAllUsers_() {
  const users = getDistinctSidebarStateUserIds_();
  let snapshotDeleted = 0;
  let quoteRunDeleted = 0;

  users.forEach(function(userId) {
    const snapResult = pruneSidebarStateByType(userId, SIDEBAR_STATE_CONFIG.TYPES.SNAPSHOT);
    const runResult = pruneSidebarStateByType(userId, SIDEBAR_STATE_CONFIG.TYPES.QUOTE_RUN);
    snapshotDeleted += (snapResult && snapResult.deleted) || 0;
    quoteRunDeleted += (runResult && runResult.deleted) || 0;
  });

  return {
    usersProcessed: users.length,
    snapshotDeleted: snapshotDeleted,
    quoteRunDeleted: quoteRunDeleted
  };
}

/**
 * Load the latest current-state envelope from the sheet (bypasses Properties).
 * Does not delete or modify sheet data.
 *
 * @param {string} userId - User email
 * @param {string} stateType - Canonical state type
 * @returns {Object|null} State envelope or null
 * @private
 */
function loadCurrentSidebarStateFromSheet_(userId, stateType) {
  const rows = loadUserSidebarStateRows(userId, SIDEBAR_STATE_CONFIG.MAX_RECENT_ROWS_PER_USER);
  const matches = rows.filter(function(row) {
    return matchesSidebarStateType_(row.type, stateType);
  });
  if (!matches.length) {
    return null;
  }

  matches.sort(function(a, b) {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  const match = matches[0];
  const parsed = parseSidebarStatePayload(match.payload);
  if (!parsed) {
    return null;
  }

  const migrated = migrateSidebarState_(parsed);
  return {
    id: match.id,
    userId: userId,
    type: stateType,
    data: migrated,
    label: match.label || match.id,
    timestamp: match.timestamp || new Date().toISOString()
  };
}

/**
 * Write a state envelope to Properties cache (Tier 1). Sheet is untouched.
 *
 * @param {string} stateType - Canonical state type
 * @param {Object} envelope - { userId, type, data, id, label, timestamp }
 * @returns {boolean} True if cached
 * @private
 */
function writeSidebarStateToPropertiesCache_(stateType, envelope) {
  if (!shouldCacheInProperties_(stateType) || !envelope) {
    return false;
  }

  const propKey = SIDEBAR_STATE_CONFIG.PROPERTY_PREFIX + stateType;
  const stateJson = JSON.stringify(envelope);
  const sizeBytes = Utilities.newBlob(stateJson, 'text/plain', 'UTF-8').getBytes().length;
  const maxSize = 9000;

  if (sizeBytes > maxSize) {
    UnifiedLogger.warn('SidebarStateStorage', 'State too large for Properties populate', {
      stateType: stateType,
      sizeBytes: sizeBytes
    });
    return false;
  }

  PropertiesLoader.save(propKey, stateJson);
  return true;
}

/**
 * ONE-SHOT RUNNER: Populate Properties cache from sheet for a user.
 * Reads sheet only — never deletes sheet rows or wipes Properties silently.
 *
 * Run explicitly from Apps Script editor or admin menu:
 *   populateSidebarStatePropertiesCache({ userId: 'user@example.com' })
 *   populateSidebarStatePropertiesCache({ dryRun: true })
 *
 * Multi-user note: Properties hot cache uses one key per state type (Phase 2 design).
 * Run per user session, or pass userId for a single targeted warm-up.
 *
 * @param {Object} [options] - { userId, dryRun, force }
 * @returns {Object} Summary { userId, populated, skipped, tooLarge, errors }
 */
function populateSidebarStatePropertiesCache(options) {
  const trace = UnifiedLogger.startTrace('SidebarStateStorage', 'populateSidebarStatePropertiesCache');
  const opts = options || {};
  const dryRun = opts.dryRun === true;
  const force = opts.force === true;
  const userId = opts.userId || (typeof getActiveUserEmailSafe === 'function'
    ? getActiveUserEmailSafe()
    : Session.getActiveUser().getEmail());

  const summary = {
    userId: userId,
    dryRun: dryRun,
    populated: [],
    skipped: [],
    tooLarge: [],
    errors: []
  };

  const typesToPopulate = [
    SIDEBAR_STATE_CONFIG.TYPES.DRAFT,
    SIDEBAR_STATE_CONFIG.TYPES.SNAPSHOT,
    SIDEBAR_STATE_CONFIG.TYPES.COST_CONFIG
  ];

  try {
    typesToPopulate.forEach(function(stateType) {
      try {
        if (!force) {
          const cached = getSidebarCurrentState(userId, stateType);
          if (cached && cached.userId === userId) {
            summary.skipped.push(stateType);
            return;
          }
        }

        const envelope = loadCurrentSidebarStateFromSheet_(userId, stateType);
        if (!envelope) {
          summary.skipped.push(stateType + ':no_sheet_row');
          return;
        }

        if (dryRun) {
          summary.populated.push(stateType + ':dry_run');
          return;
        }

        const wrote = writeSidebarStateToPropertiesCache_(stateType, envelope);
        if (wrote) {
          summary.populated.push(stateType);
          setGlobalMigrationFlag_(userId);
        } else {
          summary.tooLarge.push(stateType);
        }
      } catch (typeError) {
        summary.errors.push(stateType + ':' + String(typeError));
      }
    });

    trace.complete('Properties cache populate complete', summary);
    return summary;
  } catch (error) {
    trace.fail('populateSidebarStatePropertiesCache failed', error);
    summary.errors.push(String(error));
    return summary;
  }
}

/**
 * Run monthly archival + pruning (install trigger via ensureCoreTriggersHealthy_).
 * Idempotent — safe if trigger fires twice or repair runs overlap.
 * Run on 1st of each month at 2am (trigger installs in Menu.ensureCoreTriggersHealthy_).
 */
function scheduledSidebarStateArchival() {
  const trace = UnifiedLogger.startTrace('SidebarStateStorage', 'scheduledSidebarStateArchival');

  try {
    const archivalResult = archiveSidebarStateData(SIDEBAR_STATE_CONFIG.ACTIVE_RETENTION_DAYS);
    recordSidebarLifecycleRun_('archival', archivalResult);

    const pruneResult = pruneSidebarStateForAllUsers_();
    recordSidebarLifecycleRun_('pruning', pruneResult);

    checkSidebarStateLifecycleHealth({ source: 'scheduled-monthly' });

    trace.complete('Scheduled lifecycle maintenance complete', {
      archival: archivalResult,
      pruning: pruneResult
    });
  } catch (error) {
    trace.fail('Scheduled lifecycle maintenance failed', error);
    // Don't throw — scheduled trigger should not retry-loop
  }
}

/**
 * Clean up corrupt Properties data (run once to fix existing issues)
 * Removes Properties that are too large or corrupt
 *
 * @returns {Object} Cleanup summary
 */
function cleanupCorruptPropertiesCache() {
  const trace = UnifiedLogger.startTrace('SidebarStateStorage', 'cleanupCorruptPropertiesCache');

  try {
    const stateTypes = ['draft', 'snapshot', 'cost_config'];
    let removed = 0;
    let checked = 0;

    stateTypes.forEach(function(stateType) {
      checked++;
      const propKey = SIDEBAR_STATE_CONFIG.PROPERTY_PREFIX + stateType;

      try {
        const cached = PropertiesLoader.load(propKey);

        if (cached) {
          // Try to parse - if it fails, it's corrupt
          const parsed = safeJsonParse(cached, null);
          if (!parsed) {
            // Corrupt - remove it
            PropertiesLoader.remove(propKey);
            removed++;
            try {
              UnifiedLogger.info('SidebarStateStorage', 'Removed corrupt Properties cache', {
                stateType: stateType,
                size: cached.length
              });
            } catch (logError) {
              console.log('Removed corrupt cache:', stateType);
            }
          }
        }
      } catch (error) {
        // Corrupt or too large - remove it
        PropertiesLoader.remove(propKey);
        removed++;
      }
    });

    const summary = {
      checked: checked,
      removed: removed
    };

    trace.complete('Cleanup complete', summary);
    return summary;

  } catch (error) {
    trace.fail('Cleanup failed', error);
    return { checked: 0, removed: 0, error: String(error) };
  }
}

/**
 * Migrate sidebar state from old format (with catalogItem) to new format (without)
 *
 * Strips catalogItem from vectorCandidates and candidatePool arrays
 * This reduces state size from 90KB to <5KB
 *
 * @param {Object} stateData - State data to migrate
 * @returns {Object} Migrated state data
 * @private
 */
function migrateSidebarState_(stateData) {
  if (!stateData || typeof stateData !== 'object') {
    return stateData;
  }

  try {
    // Migrate draft state
    if (stateData.draft && stateData.draft.scopeEntries && Array.isArray(stateData.draft.scopeEntries)) {
      stateData.draft.scopeEntries.forEach(function(entry) {
        if (!entry) return;

        // Strip catalogItem from vectorCandidates
        if (Array.isArray(entry.vectorCandidates)) {
          entry.vectorCandidates = stripCatalogItemArray(entry.vectorCandidates);
        }

        // Strip catalogItem from candidatePool
        if (Array.isArray(entry.candidatePool)) {
          entry.candidatePool = stripCatalogItemArray(entry.candidatePool);
        }

        // Strip catalogItem from fitEntry catalogItem field
        if (entry.catalogItem) {
          // Remove it to force fresh hydration
          delete entry.catalogItem;
        }
      });
    }

    // Migrate commercial fit state (if present)
    if (stateData.commercialFit && Array.isArray(stateData.commercialFit.entries)) {
      stateData.commercialFit.entries.forEach(function(entry) {
        if (!entry) return;

        if (Array.isArray(entry.vectorCandidates)) {
          entry.vectorCandidates = stripCatalogItemArray(entry.vectorCandidates);
        }

        if (Array.isArray(entry.candidatePool)) {
          entry.candidatePool = stripCatalogItemArray(entry.candidatePool);
        }

        if (entry.catalogItem) {
          delete entry.catalogItem;
        }
      });
    }

    UnifiedLogger.verbose('SidebarStateStorage', 'Migrated state to remove catalogItem bloat', {
      hasDraft: !!(stateData.draft),
      hasCommercialFit: !!(stateData.commercialFit)
    });

  } catch (error) {
    // Migration failure shouldn't break state loading
    UnifiedLogger.warn('SidebarStateStorage', 'State migration failed, returning original', {
      error: String(error)
    });
  }

  return stateData;
}

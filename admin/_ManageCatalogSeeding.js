/**
 * Admin Functions: Catalog Seeding Management
 *
 * Manages the CSV_CATALOGS_SEEDED flag that controls whether static seeding
 * overwrites CSV catalog data during bootstrap.
 *
 * PROBLEM SOLVED: CSV seeding was being overwritten by static config seeding
 * SOLUTION: Flag-based priority system (CSV takes precedence when flag is set)
 *
 * Usage:
 * - viewCatalogSeedingStatus() - Check current seeding authority
 * - resetCatalogAuthority() - Allow static seeding to run again
 * - forceCsvCatalogReseed() - Re-seed from CSV (even if already seeded)
 * - seedCatalogsFromStaticForce() - Force static seeding (ignores flag)
 *
 * @see SEEDING_ARCHITECTURE_ANALYSIS.md for complete documentation
 */

/**
 * View current catalog seeding status and authority.
 * Shows which seeding system is authoritative and when CSV was last seeded.
 *
 * @return {{csvAuthoritative:boolean, lastCsvSeed:string, nextBootstrapWillSeed:string}}
 */
function viewCatalogSeedingStatus() {
  const trace = UnifiedLogger.startTrace('CatalogAdmin', 'viewCatalogSeedingStatus');
  try {
    const props = PropertiesService.getScriptProperties();
    const csvSeeded = props.getProperty('CSV_CATALOGS_SEEDED');
    const timestamp = props.getProperty('CSV_CATALOGS_TIMESTAMP');

    const status = {
      csvAuthoritative: csvSeeded === 'true',
      lastCsvSeed: timestamp || 'Never',
      nextBootstrapWillSeed: csvSeeded === 'true'
        ? 'Structural config only (catalogs protected)'
        : 'Structural config + static catalogs'
    };

    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('Catalog Seeding Status');
    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('CSV Authoritative: ' + status.csvAuthoritative);
    Logger.log('Last CSV Seed: ' + status.lastCsvSeed);
    Logger.log('Next Bootstrap: ' + status.nextBootstrapWillSeed);
    Logger.log('═══════════════════════════════════════════════════');

    UnifiedLogger.info('CatalogAdmin', 'Catalog seeding status', status);
    trace.complete('viewCatalogSeedingStatus completed', status);

    return status;
  } catch (error) {
    trace.fail('viewCatalogSeedingStatus failed', error);
    throw error;
  }
}

/**
 * Reset CSV catalog authority flag.
 * After resetting, next bootstrap will seed catalogs from static data.
 *
 * Use this when:
 * - You want to switch back to static catalog seeding
 * - You need to clear the CSV authority for testing
 *
 * @return {{status:string, message:string}}
 */
function resetCatalogAuthority() {
  const trace = UnifiedLogger.startTrace('CatalogAdmin', 'resetCatalogAuthority');
  try {
    const props = PropertiesService.getScriptProperties();
    const previousTimestamp = props.getProperty('CSV_CATALOGS_TIMESTAMP');

    props.deleteProperty('CSV_CATALOGS_SEEDED');
    props.deleteProperty('CSV_CATALOGS_TIMESTAMP');

    const message = 'CSV catalog authority reset. Next bootstrap will seed catalogs from static.';
    Logger.log('═══════════════════════════════════════════════════');
    Logger.log(message);
    Logger.log('Previous CSV Seed: ' + (previousTimestamp || 'Never'));
    Logger.log('═══════════════════════════════════════════════════');

    UnifiedLogger.info('CatalogAdmin', 'Reset catalog authority', { previousTimestamp: previousTimestamp });
    trace.complete('resetCatalogAuthority completed', { previousTimestamp: previousTimestamp });

    return {
      status: 'OK',
      message: message,
      previousTimestamp: previousTimestamp
    };
  } catch (error) {
    trace.fail('resetCatalogAuthority failed', error);
    throw error;
  }
}

/**
 * Force re-seed catalogs from CSV (even if already seeded).
 * Clears the authority flag first, then runs CSV seeding, then sets flag again.
 *
 * Use this when:
 * - CSV files have been updated and you want to reload them
 * - You want to ensure CSV data is current
 *
 * @return {{status:string, message:string, result:Object}}
 */
function forceCsvCatalogReseed() {
  const trace = UnifiedLogger.startTrace('CatalogAdmin', 'forceCsvCatalogReseed');
  try {
    const props = PropertiesService.getScriptProperties();
    const previousTimestamp = props.getProperty('CSV_CATALOGS_TIMESTAMP');

    // Clear flag to allow re-seeding
    props.deleteProperty('CSV_CATALOGS_SEEDED');
    props.deleteProperty('CSV_CATALOGS_TIMESTAMP');

    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('Force CSV Re-Seed Started');
    Logger.log('Previous Seed: ' + (previousTimestamp || 'Never'));
    Logger.log('═══════════════════════════════════════════════════');

    // Run CSV seeding (will set flag again if successful)
    const result = importScopesV2FromDrive();

    const message = result.status === 'SUCCESS'
      ? 'Force CSV re-seed complete. Resources: ' + result.resources + ', Scopes: ' + result.scopeCatalogRows + ', Scope Buildups: ' + result.scopeRows
      : 'Force CSV re-seed partial. Errors: ' + result.errors.join(', ');

    Logger.log('═══════════════════════════════════════════════════');
    Logger.log(message);
    Logger.log('CSV Authority: ' + (result.csvAuthority ? 'SET' : 'NOT SET'));
    Logger.log('═══════════════════════════════════════════════════');

    UnifiedLogger.info('CatalogAdmin', 'Force CSV re-seed complete', {
      previousTimestamp: previousTimestamp,
      newTimestamp: props.getProperty('CSV_CATALOGS_TIMESTAMP'),
      result: result
    });

    trace.complete('forceCsvCatalogReseed completed', {
      status: result.status,
      csvAuthority: result.csvAuthority
    });

    return {
      status: result.status,
      message: message,
      result: result,
      previousTimestamp: previousTimestamp,
      newTimestamp: props.getProperty('CSV_CATALOGS_TIMESTAMP')
    };
  } catch (error) {
    trace.fail('forceCsvCatalogReseed failed', error);
    throw error;
  }
}

/**
 * Force seed catalogs from static data (ignores CSV authority flag).
 * This directly calls the static catalog seeding functions, bypassing the flag check.
 *
 * Use this when:
 * - You want to test static seeding
 * - You need to restore static catalog data
 * - You're debugging seeding issues
 *
 * WARNING: This will OVERWRITE any CSV data in the catalog sheets!
 *
 * @return {{status:string, message:string, resources:number, scopes:number, scopeBuildups:number}}
 */
function seedCatalogsFromStaticForce() {
  const trace = UnifiedLogger.startTrace('CatalogAdmin', 'seedCatalogsFromStaticForce');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new AppError('CONFIG_SCHEMA', 'Active spreadsheet is unavailable.');
    }

    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('Force Static Catalog Seeding (IGNORING CSV FLAG)');
    Logger.log('WARNING: This will overwrite CSV data!');
    Logger.log('═══════════════════════════════════════════════════');

    const results = { resources: 0, scopes: 0, scopeBuildups: 0, errors: [] };

    try {
      results.resources = seedResourceCatalog_(ss) || 0;
    } catch (error) {
      results.errors.push('Resource Catalog: ' + error);
    }

    try {
      results.scopes = seedScopeCatalog_(ss) || 0;
    } catch (error) {
      results.errors.push('Scope Catalog: ' + error);
    }

    try {
      results.scopeBuildups = seedScopeBuildupsFromDrive_(ss) || 0;
    } catch (error) {
      results.errors.push('Scope Buildups: ' + error);
    }

    SpreadsheetApp.flush();

    const message = results.errors.length
      ? 'Force static catalog seeding partial. Errors: ' + results.errors.join(' | ')
      : 'Force static catalog seeding complete. Resources: ' + results.resources + ', Scopes: ' + results.scopes + ', Scope Buildups: ' + results.scopeBuildups;

    Logger.log('═══════════════════════════════════════════════════');
    Logger.log(message);
    Logger.log('CSV Authority: NOT CHANGED');
    Logger.log('═══════════════════════════════════════════════════');

    UnifiedLogger.info('CatalogAdmin', 'Force static catalog seeding', results);
    trace.complete('seedCatalogsFromStaticForce completed', results);

    return {
      status: results.errors.length ? 'PARTIAL' : 'OK',
      message: message,
      resources: results.resources,
      scopes: results.scopes,
      scopeBuildups: results.scopeBuildups,
      errors: results.errors
    };
  } catch (error) {
    trace.fail('seedCatalogsFromStaticForce failed', error);
    throw error;
  }
}

/**
 * Get detailed catalog seeding diagnostics.
 * Shows current state of all catalog sheets and seeding flags.
 *
 * @return {{status:string, sheets:Object, flags:Object, recommendations:Array}}
 */
function getCatalogSeedingDiagnostics() {
  const trace = UnifiedLogger.startTrace('CatalogAdmin', 'getCatalogSeedingDiagnostics');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getScriptProperties();

    const sheets = {
      resourceCatalog: null,
      scopeCatalog: null,
      scopeBuildups: null
    };

    const resourceSheet = ss ? ss.getSheetByName('Config: Resource Catalog') : null;
    const scopeCatalogSheet = ss ? ss.getSheetByName('Config: Scope Catalog') : null;
    const scopeBuildupsSheet = ss ? ss.getSheetByName('Scope Buildups') : null;

    if (resourceSheet) {
      sheets.resourceCatalog = {
        exists: true,
        rows: Math.max(0, resourceSheet.getLastRow() - 1),
        columns: resourceSheet.getLastColumn()
      };
    }

    if (scopeCatalogSheet) {
      sheets.scopeCatalog = {
        exists: true,
        rows: Math.max(0, scopeCatalogSheet.getLastRow() - 1),
        columns: scopeCatalogSheet.getLastColumn()
      };
    }

    if (scopeBuildupsSheet) {
      sheets.scopeBuildups = {
        exists: true,
        rows: Math.max(0, scopeBuildupsSheet.getLastRow() - 1),
        columns: scopeBuildupsSheet.getLastColumn()
      };
    }

    const flags = {
      csvSeeded: props.getProperty('CSV_CATALOGS_SEEDED'),
      csvTimestamp: props.getProperty('CSV_CATALOGS_TIMESTAMP'),
      csvAuthoritative: props.getProperty('CSV_CATALOGS_SEEDED') === 'true'
    };

    const recommendations = [];

    if (!flags.csvAuthoritative && sheets.resourceCatalog && sheets.resourceCatalog.rows > 0) {
      recommendations.push('Catalogs have data but CSV not marked as authoritative. Next bootstrap will overwrite. Consider running forceCsvCatalogReseed().');
    }

    if (flags.csvAuthoritative && (!sheets.resourceCatalog || sheets.resourceCatalog.rows === 0)) {
      recommendations.push('CSV marked as authoritative but Resource Catalog is empty. Consider running forceCsvCatalogReseed().');
    }

    if (flags.csvAuthoritative && (!sheets.scopeCatalog || sheets.scopeCatalog.rows === 0)) {
      recommendations.push('CSV marked as authoritative but Scope Catalog is empty. Consider running forceCsvCatalogReseed().');
    }

    if (recommendations.length === 0) {
      recommendations.push('All checks passed. Catalog seeding configuration is healthy.');
    }

    const diagnostics = {
      status: recommendations.length === 1 && recommendations[0].includes('healthy') ? 'HEALTHY' : 'WARNINGS',
      sheets: sheets,
      flags: flags,
      recommendations: recommendations
    };

    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('Catalog Seeding Diagnostics');
    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('Resource Catalog Rows: ' + (sheets.resourceCatalog ? sheets.resourceCatalog.rows : 'N/A'));
    Logger.log('Scope Catalog Rows: ' + (sheets.scopeCatalog ? sheets.scopeCatalog.rows : 'N/A'));
    Logger.log('Scope Buildups Rows: ' + (sheets.scopeBuildups ? sheets.scopeBuildups.rows : 'N/A'));
    Logger.log('CSV Authoritative: ' + flags.csvAuthoritative);
    Logger.log('CSV Timestamp: ' + (flags.csvTimestamp || 'Never'));
    Logger.log('───────────────────────────────────────────────────');
    Logger.log('Recommendations:');
    recommendations.forEach(function(rec) {
      Logger.log('- ' + rec);
    });
    Logger.log('═══════════════════════════════════════════════════');

    UnifiedLogger.info('CatalogAdmin', 'Catalog seeding diagnostics', diagnostics);
    trace.complete('getCatalogSeedingDiagnostics completed', diagnostics);

    return diagnostics;
  } catch (error) {
    trace.fail('getCatalogSeedingDiagnostics failed', error);
    throw error;
  }
}

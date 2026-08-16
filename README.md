# Fresh CP - Quote & Proposal Builder

**Professional quote generation and scope management system built on Google Apps Script**

Fresh CP is a Quote & Proposal Builder that combines the power of Google Sheets with AI-driven workflow automation. The system generates professional quotes based on brief profiles, manages scope contracts through structured phases, integrates with Xero for financial data, and leverages OpenAI for intelligent scope building and resource recommendations.

---

## Table of Contents

- [Quick Start](#quick-start)
  - [Accessing the System](#accessing-the-system)
  - [First Steps](#first-steps)
- [System Overview](#system-overview)
  - [What Fresh CP Does](#what-fresh-cp-does)
  - [Core Capabilities](#core-capabilities)
- [Key Concepts](#key-concepts)
  - [Brief Profiles](#brief-profiles)
  - [Scope Phases](#scope-phases)
  - [Workflow Signals](#workflow-signals)
  - [Catalog Bundles](#catalog-bundles)
  - [Configuration System](#configuration-system)
  - [Shared Utilities](#shared-utilities)
- [Architecture at a Glance](#architecture-at-a-glance)
  - [File Naming Conventions](#file-naming-conventions)
  - [Module Boundaries](#module-boundaries)
  - [Data Flow Summary](#data-flow-summary)
  - [Design Patterns](#design-patterns)
- [Common Tasks](#common-tasks)
  - [Understanding the Architecture](#understanding-the-architecture)
  - [Using Public APIs](#using-public-apis)
  - [Configuring System Values](#configuring-system-values)
  - [Viewing Historical Changes](#viewing-historical-changes)
- [Development Workflow](#development-workflow)
  - [Testing](#testing)
  - [Debugging](#debugging)
  - [Local Development with clasp](#local-development-with-clasp)
  - [Making Changes](#making-changes)
- [Getting Help](#getting-help)
  - [Documentation](#documentation)
  - [Code Comments](#code-comments)
  - [Admin Tools](#admin-tools)
  - [External Resources](#external-resources)
- [Project Status](#project-status)
- [Contributing](#contributing)
  - [Code Style](#code-style)
  - [Best Practices](#best-practices)

---

## Quick Start

### Accessing the System

1. **Open the Google Sheet** containing the Fresh CP project
2. **Access Apps Script Editor**:
   - From the Google Sheet: `Extensions` → `Apps Script`
   - Or use clasp for local development: `clasp open`
3. **Key Entry Points**:
   - **Menu.js** - Custom menu in Google Sheets (`Fresh CP` menu)
   - **AISidebar** - AI-powered scope builder (opens from menu)
   - **Admin Tools** - Verification and health checks in `admin/` directory

### First Steps

1. **Configure API Credentials** (if not already done):
   - `File` → `Project Properties` → `Script Properties`
   - Add: `OPENAI_API_KEY`, `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`
2. **Verify System Health**:
   - Use **Fresh CP** menu → **System Health** (`viewSystemHealth()` in Menu.js)
   - Check integration status for Xero and OpenAI
3. **Explore the Codebase**:
   - Start with `Menu.js` to understand user entry points
   - Review `ConfigurationManager.js` to see how configuration works
   - Browse `05_AISidebar_*.js` modules to understand AI workflow

---

## System Overview

### What Fresh CP Does

**Quote Generation:**
- Creates professional quotes from brief profiles (template-driven)
- Calculates costs with configurable fee percentages and multipliers
- Exports quotes to PDF and syncs with Xero

**Scope Building:**
- Structures projects into phases (Discovery, Planning, Build, Deploy, etc.)
- Uses AI to suggest resources and estimate quantities
- Validates scope contracts against business rules
- Tracks workflow signals (client context) throughout process

**Integration:**
- **Xero** - Syncs inventory, exports quotes, manages contacts
- **OpenAI** - AI-powered scope generation, semantic search, catalog mapping
- **Google Sheets** - Data storage, configuration, and UI

**Workflow Automation:**
- AI Sidebar guides quote building with context-aware suggestions
- Catalog bundles provide pre-configured component groups
- Vector search finds similar scopes for estimation

### Core Capabilities

- **Brief Profiles** → Template-driven quote generation
- **Scope Phases** → Structured project breakdown (Discovery → Planning → Build → Deploy)
- **Workflow Signals** → Client context propagation across quote building process
- **Catalog Bundles** → Pre-built resource groups for common needs
- **Configuration Management** → Single entry point for all system settings
- **Performance Monitoring** → Built-in profiling and health checks

---

## Key Concepts

### Brief Profiles

**What:** Template-driven quote configurations that define project parameters.

**Purpose:** Standardize quote generation for common project types (e.g., "Standard Web App", "E-commerce Site", "Mobile App").

**How it works:**
- Stored in "Brief Profiles" Google Sheet
- Contains default scope phases, categories, and resources
- Loaded via `ConfigurationManager.get("brief.profiles")`
- Used by AISidebar to pre-populate quote structure

**Example:**
```javascript
{
  "name": "Standard Web App",
  "description": "Basic web application with auth and database",
  "defaultPhases": ["Discovery", "Planning", "Build", "Deploy"],
  "estimatedHours": 160,
  "categories": ["Frontend", "Backend", "DevOps"]
}
```

### Scope Phases

**What:** Structured project lifecycle stages (Discovery, Planning, Build, Deploy, Support, etc.).

**Purpose:** Break complex projects into manageable phases with defined boundaries.

**How it works:**
- Configured in "Scope Phases" Google Sheet
- Each phase has: name, description, typical duration, resource categories
- Loaded via `ConfigurationManager.get("scope.phases")`
- AI Sidebar uses phases to structure scope contracts
- Quantity rules validate resource allocations per phase

**Common Phases:**
- **Discovery** - Requirements gathering, research, planning
- **Planning** - Architecture design, technical specifications
- **Build** - Development, implementation, testing
- **Deploy** - Launch preparation, deployment, handoff
- **Support** - Post-launch support, maintenance, monitoring

### Workflow Signals

**What:** Client context data that flows through the quote building process.

**Purpose:** Maintain consistency across quote sections, enable AI to make context-aware suggestions.

**How it works:**
- Captured from user inputs (client details, project requirements)
- Merged with brief profile defaults
- Passed to AI Sidebar for scope generation
- Used to filter catalog bundles and resource recommendations

**Processed by:** `05_AISidebar_Workflow.js` - signal processing and context building

### Catalog Bundles

**What:** Pre-configured groups of resources for common project needs.

**Purpose:** Speed up scope building with standardized resource packages.

**How it works:**
- Defined in "Catalog Bundles" Google Sheet
- Each bundle contains: name, category, included resources, quantities
- Loaded via `ConfigurationManager.get("catalog.bundles")`
- AI Sidebar suggests relevant bundles based on project context
- Resources automatically added to scope when bundle selected

**Example:**
```javascript
{
  "name": "User Authentication Bundle",
  "category": "Backend",
  "resources": [
    {"sku": "BE-AUTH-001", "name": "OAuth Integration", "quantity": 1},
    {"sku": "BE-AUTH-002", "name": "Session Management", "quantity": 1},
    {"sku": "BE-AUTH-003", "name": "Password Reset Flow", "quantity": 1}
  ]
}
```

### Configuration System

**What:** Unified configuration management using `ConfigurationManager`.

**Purpose:** Single source of truth for all system settings, with clear ownership by source.

**How it works:**
- **Script Properties** - Secrets and credentials (API keys)
- **Google Sheets** - Business data (brief profiles, scope phases, catalog bundles)
- **Business Rules** - Constants in code (fee percentages, cost multipliers, scope categories)

**Usage:**
```javascript
// Get configuration value
const profiles = ConfigurationManager.get("brief.profiles");
const feePercent = ConfigurationManager.get("cost.feePercentage");

// Check if configuration exists
if (ConfigurationManager.has("openai.apiKey")) {
  // API is configured
}

// Invalidate cache (force reload)
ConfigurationManager.invalidate("brief.profiles");
```

**Established in:** Phase 5 - Configuration Consolidation

### Shared Utilities

**What:** Common utility functions in `00_*Utils.js` modules.

**Purpose:** Eliminate duplicate code patterns, provide consistent implementations.

**Modules:**
- **00_NormalizationUtils.js** - Data normalization (8 functions)
- **00_JsonUtils.js** - JSON parsing and manipulation (9 functions)
- **00_ArrayUtils.js** - Array operations (8 functions)
- **00_ValidationUtils.js** - Input validation (10 functions)
- **00_StringUtils.js** - String manipulation (8 functions)
- **00_ErrorUtils.js** - Error handling (13 functions)

**Usage:**
```javascript
// JSON parsing with safety
const data = parseJsonSafe(jsonString, {});

// Array grouping
const byCategory = groupBy(items, "category");

// Email validation
if (isValidEmail(email)) {
  // Valid email
}

// Error handling
catchAndLog(function() {
  UnifiedLogger.info("Category", "Message", context);
}, "Category");
```

**Established in:** Phase 6 - Shared Utilities

[↑ Back to Top](#fresh-cp---quote--proposal-builder)

---

## Architecture at a Glance

### File Naming Conventions

Fresh CP uses numeric prefixes to control load order and group related functionality:

- **00_*** - Shared utilities (load first)
  - Normalization, JSON, Array, Validation, String, Error utilities
  - Performance monitoring, property caching, feature flags

- **01-02_*** - Core infrastructure
  - `01_UnifiedLogger.js` - Centralized logging
  - `02_TraceLogger.js` - Trace logging
  - `01_CatalogBundles.js` - Resource bundling
  - `02_QuantityRules.js` - Quantity validation

- **05_*** - AISidebar modules (load after utilities and core)
  - `05_AISidebar_Config.js` - Configuration, schemas, taxonomy
  - `05_AISidebar_Phase.js` - Phase guidance, evidence scanning
  - `05_AISidebar_Workflow.js` - Workflow signal processing
  - `05_AISidebar_Data.js` - Data normalization, validation
  - `05_AISidebar_Processing.js` - AI/OpenAI integration, catalog mapping
  - `05_AISidebar_UI.js` - Sidebar UI, HTML, state management

- **No prefix** - Business logic and integrations
  - Configuration system (ConfigurationManager, loaders)
  - Domain services (ScopeMap, DocGenerator, TemplateManager)
  - Xero integration (XeroAuth, XeroSync, XeroQuotes)
  - Vector search (VectorSearch, ScopeVectorStoreSync)
  - Entry points (Menu, Utilities)

### Module Boundaries

**Utilities → Business Logic → UI**

```
00_*Utils.js (Shared Utilities)
    ↓
ConfigurationManager + Loaders (Configuration)
    ↓
01_CatalogBundles.js, 02_QuantityRules.js (Core Business Logic)
    ↓
ScopeMap.js, TemplateManager.js (Domain Services)
    ↓
05_AISidebar_*.js (AI Processing & UI)
    ↓
Menu.js (User Entry Points)
```

**Key Separation:**
- Utilities don't depend on business logic
- Configuration system loads early, provides settings to all layers
- AISidebar modules are split by responsibility (Config, Phase, Workflow, Data, Processing, UI)
- Integration points are isolated (Xero*, VectorSearch)

### Data Flow Summary

**Quote Generation Flow:**

```
User selects "Create Quote" in Menu
    ↓
ConfigurationManager loads brief profile from Google Sheets
    ↓
AISidebar opens with pre-populated structure
    ↓
User provides client context (workflow signals)
    ↓
AI processes signals → suggests scope phases and resources
    ↓
Catalog bundles and vector search refine recommendations
    ↓
Scope contract validated against quantity rules
    ↓
Quote generated with cost calculations
    ↓
Export to PDF and/or sync to Xero
```

**Configuration Loading Flow:**

```
ConfigurationManager.get("brief.profiles")
    ↓
Check cache (in-memory)
    ↓ (if expired or missing)
SheetConfigLoader.load() reads Google Sheets
    ↓
Parse and validate data
    ↓
Store in cache (60min TTL)
    ↓
Return configuration to caller
```

### Design Patterns

**Single Source of Truth:**
- ConfigurationManager for all configuration (Phase 5)
- 00_*Utils.js for common utilities (Phase 6)
- UnifiedLogger for all logging (Phase 2)

**Separation of Concerns:**
- AISidebar split into 6 modules by responsibility (Phase 3)
- Configuration loaders separated by source (Sheet, Properties, Business Rules)
- Integration logic isolated in dedicated modules (Xero*, VectorSearch)

**Error Handling:**
- Structured errors via `createError()` (00_ErrorUtils.js)
- Automatic catch-and-log via `catchAndLog()` wrapper
- Fallback to console.error when logger fails

[↑ Back to Top](#fresh-cp---quote--proposal-builder)

---

## Common Tasks

### Understanding the Architecture

→ See **ARCHITECTURE.md** for:
- Component layer diagram
- Data flow visualization
- Module dependency graph
- Service integration points
- State management strategy

### Using Public APIs

→ See **API.md** for:
- Complete function reference (48+ functions)
- Parameters, return values, and examples
- Alphabetical index for quick lookup
- Common use case patterns

### Configuring System Values

→ See **CONFIGURATION.md** for:
- How to configure Script Properties, Google Sheets, and Business Rules
- Configuration reference table (all configurable values)
- Step-by-step instructions for common configuration tasks
- Validation and troubleshooting

### Viewing Historical Changes

→ See **CHANGELOG.md** for:
- Phase-by-phase refactoring history
- Key changes and improvements
- Files affected by each phase

---

## Development Workflow

### Testing

**Manual Testing:**
- **System Health:** Use **Fresh CP** menu → **System Health** (`viewSystemHealth()` in Menu.js)
- **Integration Tests:** Run `admin/_RunAllTests.js`
- **Phase Verification:** Run `admin/_Phase*Verification.js` for specific checks

**Regression Tests:**
- Located in `App-script/Regression.gs`
- Custom test framework (no external dependencies)
- Run from Apps Script editor or via menu

### Debugging

**Apps Script Editor:**
- Use `Logger.log()` or `UnifiedLogger.verbose()` for debugging
- View logs: `View` → `Logs` or `View` → `Executions`
- Use `Stackdriver` (now Cloud Logging) for exception tracking

**Correlation IDs:**
- UnifiedLogger automatically generates correlation IDs
- Track request flow across functions
- Filter logs by correlation ID for debugging

**Performance Profiling:**
- Use `00_Profiler.js` to measure execution time
- `00_PerformanceMonitor.js` tracks metrics automatically
- `admin/_Phase3Verification.js` runs performance tests

### Local Development with clasp

**Setup:**
```bash
# Install clasp
npm install -g @google/clasp

# Login to Google
clasp login

# Clone the project
clasp clone <SCRIPT_ID>

# Or create new project
clasp create --title "Fresh CP" --type sheets
```

**Workflow:**
```bash
# Pull changes from Apps Script
clasp pull

# Make local edits to .js files

# Push changes to Apps Script
clasp push

# Watch for changes and auto-push
clasp push --watch
```

**Configuration:**
- `.clasp.json` - Clasp configuration (script ID, root directory)
- `.claspignore` - Files to ignore during push
- `appsscript.json` - Apps Script manifest (runtime, OAuth scopes)

### Making Changes

1. **Understand the layer** - Identify if change affects utilities, business logic, or UI
2. **Check configuration** - Use ConfigurationManager for configurable values
3. **Follow conventions** - Use 00_ prefix for utilities, maintain load order
4. **Add logging** - Use UnifiedLogger.info/warn/error for important operations
5. **Handle errors** - Use createError() and catchAndLog() from 00_ErrorUtils.js
6. **Test locally** - Use clasp to push and test changes
7. **Run verifications** - Use admin scripts to verify system health

[↑ Back to Top](#fresh-cp---quote--proposal-builder)

---

## Getting Help

### Documentation

- **ARCHITECTURE.md** - Technical architecture and design patterns
- **API.md** - Complete function reference
- **CONFIGURATION.md** - Configuration guide
- **CHANGELOG.md** - Historical changes and refactoring phases

### Code Comments

- Functions have JSDoc comments with parameters and return values
- Critical sections have inline explanations
- Configuration files include examples and validation rules

### Admin Tools

- **Menu.js** - `viewSystemHealth()`, `refreshAllConfig()`, and other menu handlers
- **admin/_RunAllTests.js** - Run all test suites
- **admin/_Phase*Verification.js** - Verify specific phase implementations

### External Resources

- **Google Apps Script Documentation** - https://developers.google.com/apps-script
- **Xero API Documentation** - https://developer.xero.com
- **OpenAI API Documentation** - https://platform.openai.com/docs

---

## Project Status

**Current State:** Production-ready codebase (Phases 1-7 complete)

**Completed Refactoring Phases:**
- ✅ Phase 1: Normalization Consolidation (8 canonical utilities)
- ✅ Phase 2: UnifiedLogger Migration (18 files, 200+ calls)
- ✅ Phase 3: AISidebar Split (15k lines → 6 modules)
- ✅ Phase 4: Empty Catch Blocks (18 fixes)
- ✅ Phase 5: Configuration Consolidation (ConfigurationManager + 3 loaders)
- ✅ Phase 6: Shared Utilities (5 modules, 48 functions)
- ✅ Phase 7: Documentation (README, ARCHITECTURE, API, CONFIGURATION, CHANGELOG; menu v2.0)

**Upcoming Phases:**
- Phase 8: Repository Hygiene (clean up git state)
- Phase 9: Performance Baseline (establish metrics)
- Phase 10: Final Validation (production readiness check)

---

## Contributing

### Code Style

- **ES5 compatible** - Apps Script runtime requirements
- **Naming conventions** - camelCase for functions, PascalCase for classes
- **File prefixes** - Follow numeric prefix system for load order
- **Comments** - JSDoc for public functions, inline for complex logic
- **Logging** - Use UnifiedLogger for all operations
- **Error handling** - Use createError() and catchAndLog()

### Best Practices

1. **Configuration** - Use ConfigurationManager for all config values
2. **Utilities** - Use shared utilities from 00_*Utils.js modules
3. **Logging** - Use UnifiedLogger with appropriate levels (verbose, info, warn, error)
4. **Error Handling** - Use structured errors (createError) and consistent catch patterns (catchAndLog)
5. **Testing** - Add regression tests for new features
6. **Documentation** - Update README/ARCHITECTURE/API docs when adding features

---

**Version:** 1.0.0
**Last Updated:** 2026-08-16
**License:** Proprietary


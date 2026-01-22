#!/bin/bash
# Fresh_CP App-script - CPG Reinstall Script
# Automatically finds and installs latest CPG bundle from dev repo

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

clear

echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                        ║${NC}"
echo -e "${CYAN}║           ${BOLD}Fresh_CP CPG Reinstaller${NC}${CYAN}             ║${NC}"
echo -e "${CYAN}║                                                        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Target repo is current directory
REPO_ROOT="$(pwd)"
echo -e "${GREEN}✓ Target directory: ${CYAN}$REPO_ROOT${NC}"

# CPG dev repo location
CPG_DEV_REPO="/Users/molhamhomsi/work/CPG"

if [ ! -d "$CPG_DEV_REPO" ]; then
  echo -e "${RED}✗ Error: CPG dev repo not found at: $CPG_DEV_REPO${NC}" >&2
  exit 1
fi

echo -e "${GREEN}✓ CPG dev repo: ${CYAN}$CPG_DEV_REPO${NC}"
echo ""

# Find latest bundle
echo -e "${CYAN}Searching for latest bundle...${NC}"

BUNDLE_PATH=$(find "$CPG_DEV_REPO/ops/release" -maxdepth 1 -name "CPG_v*.tar.gz" -type f 2>/dev/null | sort -r | head -1)

if [ -z "$BUNDLE_PATH" ]; then
  echo -e "${RED}✗ Error: No bundle found in $CPG_DEV_REPO/ops/release/${NC}" >&2
  echo -e "${YELLOW}Build bundle first: cd $CPG_DEV_REPO && python3 ops/release/build_bundle.py${NC}" >&2
  exit 1
fi

BUNDLE_NAME=$(basename "$BUNDLE_PATH")
BUNDLE_SIZE=$(du -h "$BUNDLE_PATH" | cut -f1)

echo -e "${GREEN}✓ Found: ${CYAN}$BUNDLE_NAME${NC} (${BUNDLE_SIZE})"
echo ""

# Verify bundle checksum
CHECKSUM_FILE="${BUNDLE_PATH}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  echo -e "${CYAN}⚙ Verifying bundle integrity...${NC}"

  EXPECTED_CHECKSUM=$(cut -d' ' -f1 "$CHECKSUM_FILE")
  ACTUAL_CHECKSUM=$(shasum -a 256 "$BUNDLE_PATH" | cut -d' ' -f1)

  if [ "$EXPECTED_CHECKSUM" = "$ACTUAL_CHECKSUM" ]; then
    echo -e "${GREEN}✓ Bundle integrity verified${NC}"
  else
    echo -e "${RED}✗ Error: Bundle checksum verification failed${NC}" >&2
    exit 1
  fi
  echo ""
fi

# Confirmation
echo -e "${YELLOW}⚠ This will:${NC}"
echo -e "  1. Remove existing CPG installation"
echo -e "  2. Install fresh CPG from latest bundle"
echo -e "  3. Install to: ${CYAN}$REPO_ROOT${NC}"
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled"
  exit 0
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Reinstalling CPG...${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Clean existing installation
echo -e "${CYAN}⚙ Step 1: Cleaning existing installation...${NC}"

rm -rf "$REPO_ROOT/.cpg" 2>/dev/null || true
rm -rf "$REPO_ROOT/.claude/hooks" 2>/dev/null || true
rm -rf "$REPO_ROOT/.claude/commands" 2>/dev/null || true
rm -rf "$REPO_ROOT/ops" 2>/dev/null || true
rm -f "$REPO_ROOT/.claude/settings.json" 2>/dev/null || true
rm -f "$REPO_ROOT/install.sh" 2>/dev/null || true
rm -f "$REPO_ROOT/reinstall.sh" 2>/dev/null || true

echo -e "${GREEN}✓ Existing installation removed${NC}"

# Step 2: Extract bundle to temp
echo ""
echo -e "${CYAN}⚙ Step 2: Extracting bundle...${NC}"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

tar -xzf "$BUNDLE_PATH" -C "$TEMP_DIR"
echo -e "${GREEN}✓ Bundle extracted to temporary location${NC}"

# Step 3: Verify bundle contents
echo ""
echo -e "${CYAN}⚙ Step 3: Verifying bundle contents...${NC}"

if [ ! -f "$TEMP_DIR/install.sh" ]; then
  echo -e "${RED}✗ Error: install.sh not found in bundle${NC}" >&2
  exit 1
fi

CPG_VERSION="unknown"
if [ -f "$TEMP_DIR/ops/suite/VERSION" ]; then
  CPG_VERSION=$(cat "$TEMP_DIR/ops/suite/VERSION" | tr -d '[:space:]')
fi

echo -e "${GREEN}  ✓ install.sh present${NC}"
echo -e "${GREEN}  ✓ CPG version: ${CPG_VERSION}${NC}"

# Verify file checksums
if [ -f "$TEMP_DIR/manifests/sha256.txt" ]; then
  echo -e "${CYAN}  Verifying file integrity...${NC}"
  cd "$TEMP_DIR"

  if shasum -a 256 -c manifests/sha256.txt >/dev/null 2>&1; then
    FILE_COUNT=$(wc -l < manifests/sha256.txt | tr -d ' ')
    echo -e "${GREEN}  ✓ All ${FILE_COUNT} files verified${NC}"
  else
    echo -e "${RED}✗ Error: File integrity check failed${NC}" >&2
    exit 1
  fi

  cd "$REPO_ROOT"
fi

# Verify critical files
echo -e "${CYAN}  Checking critical files...${NC}"
CRITICAL_FILES=(
  "install.sh"
  "ops/hooks/pre_tool_use.py"
  "ops/hooks/post_tool_use.py"
  "ops/hooks/session_start.py"
  "ops/hooks/hook_lib.py"
  "ops/policy/baselines/default_permissions_v2.json"
)

for file in "${CRITICAL_FILES[@]}"; do
  if [ ! -f "$TEMP_DIR/$file" ]; then
    echo -e "${RED}✗ Error: Missing critical file: $file${NC}" >&2
    exit 1
  fi
done

echo -e "${GREEN}  ✓ All critical files present${NC}"

# Step 4: Copy bundle contents to target
echo ""
echo -e "${CYAN}⚙ Step 4: Copying bundle contents...${NC}"

TOTAL_FILES=$(find "$TEMP_DIR" -type f | wc -l | tr -d ' ')
echo -e "${CYAN}  Copying ${TOTAL_FILES} files...${NC}"

# Copy regular files
cp -r "$TEMP_DIR"/* "$REPO_ROOT/" 2>/dev/null || true

# Copy hidden files (.claude directory)
if [ -d "$TEMP_DIR/.claude" ]; then
  cp -r "$TEMP_DIR"/.claude "$REPO_ROOT/" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Bundle contents copied${NC}"

# Step 5: Verify files copied
echo ""
echo -e "${CYAN}⚙ Step 5: Verifying copied files...${NC}"

for file in "${CRITICAL_FILES[@]}"; do
  if [ ! -f "$REPO_ROOT/$file" ]; then
    echo -e "${RED}✗ Error: File missing after copy: $file${NC}" >&2
    exit 1
  fi
done

echo -e "${GREEN}  ✓ All critical files present in target${NC}"

# Verify integrity of copied files
if [ -f "$REPO_ROOT/manifests/sha256.txt" ]; then
  echo -e "${CYAN}  Verifying copied file integrity...${NC}"
  cd "$REPO_ROOT"

  if shasum -a 256 -c manifests/sha256.txt >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ All copied files verified${NC}"
  else
    echo -e "${RED}✗ Error: Copied files integrity check failed${NC}" >&2
    exit 1
  fi
fi

# Step 6: Run install.sh
echo ""
echo -e "${CYAN}⚙ Step 6: Running installation...${NC}"
echo ""

cd "$REPO_ROOT"
if ! bash install.sh; then
  echo ""
  echo -e "${RED}✗ Error: Installation failed${NC}" >&2
  exit 1
fi

# Step 7: Post-installation validation
echo ""
echo -e "${CYAN}⚙ Step 7: Post-installation validation...${NC}"

# Verify directories
echo -e "${CYAN}  Checking directories...${NC}"
REQUIRED_DIRS=(
  ".cpg"
  ".claude/hooks"
  "ops/hooks"
  "ops/policy"
)

for dir in "${REQUIRED_DIRS[@]}"; do
  if [ ! -d "$REPO_ROOT/$dir" ]; then
    echo -e "${RED}✗ Error: Missing directory: $dir${NC}" >&2
    exit 1
  fi
done

echo -e "${GREEN}  ✓ All required directories present${NC}"

# Verify hooks
echo -e "${CYAN}  Checking hooks...${NC}"
HOOK_FILES=(
  ".claude/hooks/pre_tool_use.py"
  ".claude/hooks/post_tool_use.py"
  ".claude/hooks/session_start.py"
)

for hook in "${HOOK_FILES[@]}"; do
  if [ -f "$REPO_ROOT/$hook" ]; then
    if ! python3 -m py_compile "$REPO_ROOT/$hook" 2>/dev/null; then
      echo -e "${RED}✗ Error: Hook has syntax errors: $hook${NC}" >&2
      exit 1
    fi
  fi
done

echo -e "${GREEN}  ✓ All hooks valid${NC}"

# Verify mode file
if [ ! -f "$REPO_ROOT/.cpg/mode" ]; then
  echo -e "${RED}✗ Error: Mode file not created${NC}" >&2
  exit 1
fi

MODE=$(cat "$REPO_ROOT/.cpg/mode" | tr -d '[:space:]')
echo -e "${GREEN}  ✓ Mode: ${MODE}${NC}"

# Verify settings.json
if [ ! -f "$REPO_ROOT/.claude/settings.json" ]; then
  echo -e "${RED}✗ Error: settings.json not created${NC}" >&2
  exit 1
fi

# Check that settings.json uses $CLAUDE_PROJECT_DIR
if grep -q '\$CLAUDE_PROJECT_DIR' "$REPO_ROOT/.claude/settings.json"; then
  echo -e "${GREEN}  ✓ settings.json uses \$CLAUDE_PROJECT_DIR${NC}"
else
  echo -e "${YELLOW}  ⚠ settings.json may not use \$CLAUDE_PROJECT_DIR${NC}"
fi

echo -e "${GREEN}✓ Post-installation validation passed${NC}"

# Final success
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Reinstallation Complete & Validated${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}CPG ${CPG_VERSION} installed successfully!${NC}"
echo ""
echo -e "${CYAN}Bundle:${NC} $BUNDLE_NAME"
echo -e "${CYAN}Location:${NC} $REPO_ROOT"
echo -e "${CYAN}Mode:${NC} ${MODE}"
echo -e "${CYAN}Files:${NC} ${TOTAL_FILES}"
echo ""
echo -e "${GREEN}✓ All integrity checks passed${NC}"
echo -e "${GREEN}✓ All critical files present${NC}"
echo -e "${GREEN}✓ Hooks validated${NC}"
echo -e "${GREEN}✓ Settings.json configured${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. ${BOLD}Restart Claude Code${NC}"
echo -e "  2. Hooks will activate automatically"
echo -e "  3. Test: ${CYAN}Read README.md${NC}"
echo ""
echo -e "${CYAN}Check mode:${NC} cat .cpg/mode"
echo -e "${CYAN}Switch to DEV:${NC} echo 'dev' > .cpg/mode"
echo -e "${CYAN}Switch to PROD:${NC} echo 'prod' > .cpg/mode"
echo ""

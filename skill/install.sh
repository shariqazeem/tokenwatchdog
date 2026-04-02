#!/usr/bin/env bash
set -euo pipefail

# ── Token Watchdog Installer ──
# Installs Node.js dependencies and builds the CLI.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Token Watchdog: installing dependencies..."

# Check prerequisites
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required but not found. Install Node.js 18+ first."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js 18+ is required (found v${NODE_VERSION})."
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "ERROR: npm is required but not found."
  exit 1
fi

# Install npm dependencies
cd "$PROJECT_DIR"
npm install --no-audit --no-fund

# Build TypeScript
echo "==> Token Watchdog: building..."
npm run build

# Verify the CLI entry point exists
if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
  echo "ERROR: Build failed — dist/index.js not found."
  exit 1
fi

echo "==> Token Watchdog: installed successfully."
echo ""
echo "    Usage:  npx token-watchdog scan <address> --chain xlayer"
echo "    Or:     npx tsx src/index.ts scan <address> --chain xlayer"
echo ""

# Check for onchainos binary (warn, don't fail)
if ! command -v onchainos &>/dev/null; then
  echo "WARNING: onchainos CLI binary not found."
  echo "  Token Watchdog requires onchainos to run scans."
  echo "  Install it from: https://github.com/okx/onchainos-skills"
  echo ""
fi

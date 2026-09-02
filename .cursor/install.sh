#!/usr/bin/env bash
# Cloud Agent install script for the Beau Essence appointment platform.
#
# Idempotent: safe to re-run against a warm or partially prepared VM. It pins the
# repository's required Node major (24), then refreshes workspace dependencies and
# builds every package plus the static web app so the terminals can serve `dist`.
#
# The base image ships nvm and JDK 21 (the Firestore rules gate needs the JDK).
# The repository's package.json requires Node >=24.14.0 <25 with engine-strict on,
# so the default Node 22 on PATH cannot run pnpm here.
set -euo pipefail

NODE_VERSION="24.18.0"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm not found at $NVM_DIR; cannot provision Node ${NODE_VERSION}." >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"
corepack enable

echo "Using Node $(node -v) / pnpm $(corepack pnpm -v)"

corepack pnpm install --frozen-lockfile
corepack pnpm run build

# Machine-local Playwright Chromium for the e2e and screenshot capture gates.
corepack pnpm exec playwright install chromium

#!/usr/bin/env bash
# Cloud Agent install script for the Beau Essence appointment platform.
#
# Idempotent: safe to re-run against a warm or partially prepared VM. It pins the
# repository's required Node major (24), then refreshes workspace dependencies and
# builds every package plus the static web app so the terminals can serve `dist`.
#
# The base image ships nvm and JDK 21 (the Firestore rules gate needs the JDK).
# The repository's package.json requires Node >=24.20.0 <25 with engine-strict on,
# so the default Node 22 on PATH cannot run pnpm here.
set -euo pipefail

NODE_VERSION="24.20.0"

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

# Auxiliary developer CLIs. These are convenience tools for local inspection and
# are NOT required by any repository gate (the gates use the pinned, workspace
# `firebase-tools` via `corepack pnpm exec firebase` and never touch a cloud
# project). They are best-effort: a network or permission hiccup here must not
# fail dependency setup, so each is guarded and non-fatal.

# Global Firebase CLI, pinned to the same major the workspace already vendors.
if ! command -v firebase >/dev/null 2>&1; then
  npm install -g firebase-tools@15.25.0 \
    || echo "WARN: global firebase-tools install failed; workspace copy still available via 'corepack pnpm exec firebase'." >&2
fi

# Google Cloud SDK (gcloud). Added via the official apt repository when absent.
if ! command -v gcloud >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then
    (
      set -e
      sudo apt-get update -y
      sudo apt-get install -y apt-transport-https ca-certificates gnupg curl
      curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
        | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/cloud.google.gpg
      echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
        | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list >/dev/null
      sudo apt-get update -y
      sudo apt-get install -y google-cloud-cli
    ) || echo "WARN: google-cloud-cli install failed; gcloud is optional and not used by any repository gate." >&2
  else
    echo "WARN: sudo unavailable; skipping optional google-cloud-cli install." >&2
  fi
fi

echo "Developer CLIs: git $(git --version 2>/dev/null | awk '{print $3}'), firebase $(firebase --version 2>/dev/null | tail -1), gcloud $(gcloud --version 2>/dev/null | head -1)"

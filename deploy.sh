#!/usr/bin/env bash
# Build and deploy Tek Map with automatic version injection.
# Usage: ./deploy.sh [--no-cache]
set -e

export GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
export GIT_COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "0")
export BUILD_DATE=$(date +%Y%m%d%H%M)

echo "Building Tek Map v0.3.0.${GIT_COMMIT_COUNT} · ${GIT_SHA} (${BUILD_DATE})"
docker compose build "$@" server client
docker compose up -d
echo "Done."

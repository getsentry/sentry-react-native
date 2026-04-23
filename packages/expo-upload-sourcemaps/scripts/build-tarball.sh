#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$SCRIPT_DIR/.."

cd "$PKG_DIR"

rm -f sentry-expo-upload-sourcemaps-*.tgz

# Use `yarn pack` instead of `npm pack` for consistency with packages/core.
VERSION=$(node -p "require('./package.json').version")
yarn pack --out "sentry-expo-upload-sourcemaps-${VERSION}.tgz"

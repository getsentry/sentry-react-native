#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$SCRIPT_DIR/.."

cd "$PKG_DIR"

rm -f sentry-react-native-*.tgz

cp ../../README.md README.md

# Use `yarn pack` instead of `npm pack` so `workspace:*` dependency specs are
# rewritten to concrete versions in the published tarball. npm pack leaves
# the spec as `workspace:*`, which consumers cannot resolve.
VERSION=$(node -p "require('./package.json').version")
TARBALL="sentry-react-native-${VERSION}.tgz"
yarn pack --out "$TARBALL"

# yarn pack stores non-bin files with mode 0644, which breaks the Xcode build
# phase that invokes scripts/sentry-xcode.sh directly (Permission denied).
# Re-pack with +x on shell scripts and bin entrypoints.
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
tar -xzf "$TARBALL" -C "$TMP_DIR"
chmod 0755 "$TMP_DIR"/package/scripts/*.sh \
           "$TMP_DIR"/package/scripts/eas-build-hook.js \
           "$TMP_DIR"/package/scripts/expo-upload-sourcemaps.js
tar -czf "$TARBALL" -C "$TMP_DIR" package

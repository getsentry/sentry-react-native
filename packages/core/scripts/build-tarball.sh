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
yarn pack --out "sentry-react-native-${VERSION}.tgz"

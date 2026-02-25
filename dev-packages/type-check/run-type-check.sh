#!/bin/bash

set -ex

__dirpath=$(dirname $(realpath "$0"))

cd "${__dirpath}/../../packages/core"

echo "DEBUG: Checking ts3.8 folder before yalc publish..."
if [ -d "ts3.8" ]; then
  ls -la ts3.8/
  ls -la ts3.8/dist/js/ 2>/dev/null | head -5 || true
else
  echo "ERROR: ts3.8 folder does not exist!"
  echo "DEBUG: Current directory contents:"
  ls -la
fi

yalc publish --sig

echo "DEBUG: Checking what yalc published (looking for ts3.8)..."
ls ~/.yalc/packages/@sentry/react-native/8.1.0/ | grep -E "ts3.8|dist" || echo "DEBUG: yalc store contents:"
ls ~/.yalc/packages/@sentry/react-native/8.1.0/ || true

cd "${__dirpath}/ts3.8-test"

# Add yalc package (creates .yalc/ directory and updates package.json)
yalc add @sentry/react-native

# Run yarn install to process dependencies
yarn install

# Re-add yalc package to ensure it's in node_modules (yarn might have removed it)
yalc add @sentry/react-native

echo "DEBUG: Checking ts3.8 in node_modules after yalc add..."
if [ -d "./node_modules/@sentry/react-native/ts3.8" ]; then
  ls -la ./node_modules/@sentry/react-native/ts3.8/
else
  echo "ERROR: ts3.8 not in node_modules!"
  echo "DEBUG: Contents of @sentry/react-native:"
  ls -la ./node_modules/@sentry/react-native/
fi

echo "Removing duplicate React types..."
rm -rf ./node_modules/@types/react-native/node_modules/@types/react

yarn type-check

rm yarn.lock
touch yarn.lock

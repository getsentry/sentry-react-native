#!/bin/bash

set -ex

__dirpath=$(dirname $(realpath "$0"))

cd "${__dirpath}/../../packages/expo-upload-sourcemaps"

yalc publish

cd "${__dirpath}/../../packages/core"

yalc publish

cd "${__dirpath}/ts3.8-test"

# Add yalc packages (creates .yalc/ directory and updates package.json)
yalc add @sentry/expo-upload-sourcemaps
yalc add @sentry/react-native

# Disable yarn 4's release-age gate for this fresh install. The yalc-linked
# @sentry/react-native pulls transitive @sentry/* deps that get resolved fresh, so a
# just-published SDK version (e.g. right after a JS SDK bump) would be quarantined
# (default npmMinimalAgeGate is 1 day, and hardened mode auto-enables on public-PR CI)
# and fail the install. This workspace always runs on the repo's yarn 4, so the
# setting is always valid here.
YARN_NPM_MINIMAL_AGE_GATE=0 yarn install

# Re-add yalc packages to ensure they are in node_modules (yarn might have removed them)
yalc add @sentry/expo-upload-sourcemaps
yalc add @sentry/react-native

echo "Removing duplicate React types..."
rm -rf ./node_modules/@types/react-native/node_modules/@types/react

yarn type-check

rm yarn.lock
touch yarn.lock

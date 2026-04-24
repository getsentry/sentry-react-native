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

yarn install

# Re-add yalc packages to ensure they are in node_modules (yarn might have removed them)
yalc add @sentry/expo-upload-sourcemaps
yalc add @sentry/react-native

echo "Removing duplicate React types..."
rm -rf ./node_modules/@types/react-native/node_modules/@types/react

yarn type-check

rm yarn.lock
touch yarn.lock

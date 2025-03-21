#!/bin/bash

set -ex

__dirpath=$(dirname $(realpath "$0"))

cd "${__dirpath}/../../packages/core"

yalc publish

cd "${__dirpath}/ts3.8-test"

yalc add @sentry/react-native

yarn install

echo "Removing duplicate React types..."
rm -rf ./node_modules/@types/react-native/node_modules/@types/react

yarn type-check

rm yarn.lock
touch yarn.lock

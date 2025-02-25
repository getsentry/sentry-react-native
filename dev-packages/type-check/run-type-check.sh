#!/bin/bash

set -ex

__dirpath=$(dirname $(realpath "$0"))

cd "${__dirpath}/ts3.8-test"

# OK on  TS 3.8
yarn add @sentry/react@8.0.0

# Broken on TS 3.8
#yarn add @sentry/react

yarn install

yarn type-check

rm yarn.lock
touch yarn.lock

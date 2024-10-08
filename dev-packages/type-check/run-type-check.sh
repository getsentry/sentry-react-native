#!/bin/bash

set -ex

__dirpath=$(dirname $(realpath "$0"))

cd "${__dirpath}/../../packages/core"

yalc publish

cd "${__dirpath}/ts3.8-test"

yalc add @sentry/react-native

yarn install

yarn type-check

rm yarn.lock
touch yarn.lock

#!/bin/sh
set -e
npm pack
mkdir -p build
mv react-native-sentry-*.tgz build/

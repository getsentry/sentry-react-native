#!/bin/bash

set -eo pipefail

echo "ktlint running..."

npx ktlint \
    "samples/react-native/android/app/src/**/*.kt" \
    "packages/core/android/**/*.kt" \
    "packages/core/RNSentryAndroidTester/app/src/**/*.kt" \
    "performance-tests/TestAppPlain/android/app/src/**/*.kt" \
    "performance-tests/TestAppSentry/android/app/src/**/*.kt" \
    "$@"

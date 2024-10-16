#!/bin/bash

echo "Running PMD for Java files"

npx pmd check \
  -d samples/react-native/android/app/src \
  -d packages/core/android \
  -d performance-tests/TestAppPlain/android/app/src \
  -d performance-tests/TestAppSentry/android/app/src \
  -R rulesets/java/quickstart.xml \
  -f text

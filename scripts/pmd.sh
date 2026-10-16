#!/bin/bash

echo "Running PMD for Java files"

npx pmd check \
  -d samples/react-native/android/app/src \
  -d packages/core/android \
  -R rulesets/java/quickstart.xml \
  -f text

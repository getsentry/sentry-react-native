#!/bin/bash

pmd check \
  -d packages/core/android \
  -d performance-tests/TestAppPlain/android/app/src \
  -R rulesets/java/quickstart.xml \
  -f text

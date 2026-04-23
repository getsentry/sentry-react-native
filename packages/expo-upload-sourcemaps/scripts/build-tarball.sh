#!/bin/bash

rm -f $(dirname "$0")/../sentry-expo-upload-sourcemaps-*.tgz

npm pack

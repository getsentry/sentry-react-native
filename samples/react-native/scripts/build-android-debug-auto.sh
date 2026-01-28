#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export RN_ARCHITECTURE="new"
export CONFIG="debug"
export SENTRY_DISABLE_NATIVE_START="true"

echo "Building Android with SENTRY_DISABLE_NATIVE_START=${SENTRY_DISABLE_NATIVE_START}"
echo "This build will initialize Sentry from JavaScript (auto init)"

"${thisFilePath}/build-android.sh"

# Rename the output APK to distinguish it from manual build
cd "${thisFilePath}/.."
if [ -f "app.apk" ]; then
  mv app.apk app-auto.apk
  echo "Build complete: app-auto.apk"
fi

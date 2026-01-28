#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export RN_ARCHITECTURE="new"
export CONFIG="debug"
export SENTRY_DISABLE_NATIVE_START="false"

echo "Building Android with SENTRY_DISABLE_NATIVE_START=${SENTRY_DISABLE_NATIVE_START}"
echo "This build will initialize Sentry natively before JS (manual init)"

"${thisFilePath}/build-android.sh"

# Rename the output APK to distinguish it from auto build
cd "${thisFilePath}/.."
if [ -f "app.apk" ]; then
  mv app.apk app-manual.apk
  echo "Build complete: app-manual.apk"
fi

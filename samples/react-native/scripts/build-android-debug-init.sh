#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

# Validate SENTRY_DISABLE_NATIVE_START is set
if [ -z "${SENTRY_DISABLE_NATIVE_START}" ]; then
  echo "Error: SENTRY_DISABLE_NATIVE_START environment variable is not set."
  echo "Usage: SENTRY_DISABLE_NATIVE_START=true|false $0"
  echo ""
  echo "  true  - Build for auto init from JS (native SDK disabled)"
  echo "  false - Build for manual native init (native SDK enabled)"
  exit 1
fi

# Map SENTRY_DISABLE_NATIVE_START to build mode
if [ "${SENTRY_DISABLE_NATIVE_START}" = "true" ]; then
  BUILD_MODE="auto"
  INIT_DESCRIPTION="initialize Sentry from JavaScript (auto init)"
elif [ "${SENTRY_DISABLE_NATIVE_START}" = "false" ]; then
  BUILD_MODE="manual"
  INIT_DESCRIPTION="initialize Sentry natively before JS (manual init)"
else
  echo "Error: Invalid value for SENTRY_DISABLE_NATIVE_START: '${SENTRY_DISABLE_NATIVE_START}'"
  echo "Expected 'true' or 'false'"
  exit 1
fi

export RN_ARCHITECTURE="new"
export CONFIG="debug"

echo "Building Android with SENTRY_DISABLE_NATIVE_START=${SENTRY_DISABLE_NATIVE_START}"
echo "This build will ${INIT_DESCRIPTION}"

"${thisFilePath}/build-android.sh"

# Rename the output APK based on build mode
cd "${thisFilePath}/.."
if [ -f "app.apk" ]; then
  mv app.apk "app-${BUILD_MODE}.apk"
  echo "Build complete: app-${BUILD_MODE}.apk"
else
  echo "Error: Expected output file 'app.apk' not found"
  exit 1
fi

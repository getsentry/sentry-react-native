#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export RN_ARCHITECTURE="new"
export CONFIG="debug"
export SENTRY_DISABLE_NATIVE_START="false"

"${thisFilePath}/build-android.sh"

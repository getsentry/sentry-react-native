#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export RN_ARCHITECTURE="legacy"
export CONFIG="debug"
export SENTRY_DISABLE_NATIVE_START="true"

"${thisFilePath}/build-android.sh"

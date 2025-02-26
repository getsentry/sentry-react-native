#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export RN_ARCHITECTURE="new"
export CONFIG="release"
export SENTRY_DISABLE_NATIVE_START="false"

"${thisFilePath}/build-android.sh"

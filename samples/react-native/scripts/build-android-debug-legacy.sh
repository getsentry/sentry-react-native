#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export RN_ARCHITECTURE="legacy"
export CONFIG="debug"

"${thisFilePath}/build-android.sh"

#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export RN_ARCHITECTURE="new"
export CONFIG="release"

"${thisFilePath}/build-android.sh"

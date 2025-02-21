#!/bin/bash

# Exit on error
set -e

export ENABLE_PROD=1
export ENABLE_NEW_ARCH=0
export USE_FRAMEWORKS=dynamic

thisFilePath=$(dirname "$0")

"${thisFilePath}/pod-install.sh"

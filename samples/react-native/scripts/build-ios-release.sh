#!/bin/bash

# Exit on error and print commands
set -xe

thisFilePath=$(dirname "$0")

cd "${thisFilePath}/../ios"

export CONFIG='Release'

"${thisFilePath}/build-ios.sh"

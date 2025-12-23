#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export CONFIG='Release'

"${thisFilePath}/build-ios.sh"

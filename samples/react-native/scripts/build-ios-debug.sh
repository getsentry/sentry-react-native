#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

export CONFIG='Debug'

"${thisFilePath}/build-ios.sh"

#!/bin/bash

# Exit on error and print commands
set -xe

thisFilePath=$(dirname "$0")

export CONFIG='Debug'

"${thisFilePath}/build-ios.sh"

#!/bin/bash

# Exit on error and print commands
set -xe

thisFilePath=$(dirname "$0")

cd "${thisFilePath}/.."

source "${thisFilePath}/detect-aos-emu.sh"

# Run the tests
detox test --configuration ci.android.auto

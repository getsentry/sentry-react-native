#!/bin/bash

# Exit on error and print commands
set -xe

thisFilePath=$(dirname "$0")

cd "${thisFilePath}/../.."

"${thisFilePath}/detect-ios-sim.sh"

detox test --configuration ci.sim.auto --app-launch-args="--sentry-disable-native-start"

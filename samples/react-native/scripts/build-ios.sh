#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

cd "${thisFilePath}/../ios"

rm -rf ../sentryreactnativesample.app

echo "Building $CONFIG"

rm -rf xcodebuild.log

mkdir -p "DerivedData"
derivedData="$(cd "DerivedData" ; pwd -P)"
set -o pipefail && xcodebuild \
  -workspace sentryreactnativesample.xcworkspace \
  -configuration "$CONFIG" \
  -scheme sentryreactnativesample \
  -sdk 'iphonesimulator' \
  -destination 'generic/platform=iOS Simulator' \
  ONLY_ACTIVE_ARCH=yes \
  -derivedDataPath "$derivedData" \
  build \
  | tee xcodebuild.log \
  | if [ "$CI" = "true" ]; then xcbeautify --quieter --is-ci --disable-colored-output; else xcbeautify; fi

cp -r "DerivedData/Build/Products/${CONFIG}-iphonesimulator/sentryreactnativesample.app" ../sentryreactnativesample.app

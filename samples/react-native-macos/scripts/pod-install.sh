#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

echo "USE_FRAMEWORKS=$USE_FRAMEWORKS"
echo "ENABLE_PROD=$ENABLE_PROD"
echo "ENABLE_NEW_ARCH=$ENABLE_NEW_ARCH"

cd "${thisFilePath}/.."
bundle install

cd macos
PRODUCTION=$ENABLE_PROD RCT_NEW_ARCH_ENABLED=$ENABLE_NEW_ARCH bundle exec pod update

cat Podfile.lock | grep $RN_SENTRY_POD_NAME

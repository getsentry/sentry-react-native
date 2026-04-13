#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

echo "USE_FRAMEWORKS=$USE_FRAMEWORKS"
echo "ENABLE_PROD=$ENABLE_PROD"
echo "ENABLE_NEW_ARCH=$ENABLE_NEW_ARCH"

cd "${thisFilePath}/.."
bundle install

# In the monorepo, the SDK's packages/core resolves react-native to its own devDependency version.
# We need to point the podspec to the sample app's react-native so it detects the correct version.
export REACT_NATIVE_NODE_MODULES_DIR="${PWD}/node_modules/react-native"

cd ios
PRODUCTION=$ENABLE_PROD RCT_NEW_ARCH_ENABLED=$ENABLE_NEW_ARCH bundle exec pod update

cat Podfile.lock | grep $RN_SENTRY_POD_NAME

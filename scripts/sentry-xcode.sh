#!/bin/bash
# Sentry Bundle React Native code and images
# PWD=ios

# print commands before executing them and stop on first error
set -x -e

# WITH_ENVIRONMENT is executed by React Native

LOCAL_NODE_BINARY=${NODE_BINARY:-node}

[ -z "$SENTRY_PROPERTIES" ] && export SENTRY_PROPERTIES=sentry.properties
[ -z "$SOURCEMAP_FILE" ] && export SOURCEMAP_FILE="$DERIVED_FILE_DIR/main.jsbundle.map"

[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_PACKAGE_PATH=$("$LOCAL_NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/cli/package.json'))")
[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_EXECUTABLE="${SENTRY_CLI_PACKAGE_PATH}/bin/sentry-cli"

REACT_NATIVE_XCODE=$1

[[ "$AUTO_RELEASE" == false ]] && [[ -z "$BUNDLE_COMMAND" || "$BUNDLE_COMMAND" != "ram-bundle" ]] && NO_AUTO_RELEASE="--no-auto-release"
ARGS="$NO_AUTO_RELEASE $SENTRY_CLI_EXTRA_ARGS $SENTRY_CLI_RN_XCODE_EXTRA_ARGS"

REACT_NATIVE_XCODE_WITH_SENTRY="\"$SENTRY_CLI_EXECUTABLE\" react-native xcode $ARGS \"$REACT_NATIVE_XCODE\""

if [ "$SENTRY_DISABLE_AUTO_UPLOAD" != true ]; then
  /bin/sh -c "\"$LOCAL_NODE_BINARY\" $REACT_NATIVE_XCODE_WITH_SENTRY"
else
  echo "SENTRY_DISABLE_AUTO_UPLOAD=true, skipping sourcemaps upload"
  /bin/sh -c "$REACT_NATIVE_XCODE"
fi

[ -z "$SENTRY_COLLECT_MODULES" ] && SENTRY_RN_PACKAGE_PATH=$("$LOCAL_NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json'))")
[ -z "$SENTRY_COLLECT_MODULES" ] && SENTRY_COLLECT_MODULES="${SENTRY_RN_PACKAGE_PATH}/scripts/collect-modules.sh"

if [ -f "$SENTRY_COLLECT_MODULES" ]; then
  /bin/sh "$SENTRY_COLLECT_MODULES"
fi

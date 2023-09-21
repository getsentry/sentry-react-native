# Sentry Bundle React Native code and images
# PWD=ios

# print commands before executing them and stop on first error
set -x -e

# WITH_ENVIRONMENT is executed by React Native

[ -z "$SENTRY_PROPERTIES" ] && export SENTRY_PROPERTIES=sentry.properties
[ -z "$EXTRA_PACKAGER_ARGS" ] && export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"
[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_EXECUTABLE="../node_modules/@sentry/cli/bin/sentry-cli"

REACT_NATIVE_XCODE=$1

BUNDLE_REACT_NATIVE="\"$SENTRY_CLI_EXECUTABLE\" react-native xcode $SENTRY_CLI_EXTRA_ARGS $SENTRY_CLI_RN_XCODE_EXTRA_ARGS \"$REACT_NATIVE_XCODE\""

/bin/sh -c "$BUNDLE_REACT_NATIVE"

[ -z "$SENTRY_COLLECT_MODULES" ] && SENTRY_COLLECT_MODULES="../../scripts/collect-modules.sh"

if [ -f "$SENTRY_COLLECT_MODULES" ]; then
  /bin/sh "$SENTRY_COLLECT_MODULES"
fi

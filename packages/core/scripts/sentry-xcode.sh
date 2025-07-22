#!/bin/bash
# Sentry Bundle React Native code and images
# PWD=ios

# print commands before executing them and stop on first error
set -x -e

# WITH_ENVIRONMENT is executed by React Native

LOCAL_NODE_BINARY=${NODE_BINARY:-node}

# The project root by default is one level up from the ios directory
RN_PROJECT_ROOT="${PROJECT_DIR}/.."

[ -z "$SENTRY_PROPERTIES" ] && export SENTRY_PROPERTIES=sentry.properties
[ -z "$SENTRY_DOTENV_PATH" ] && export SENTRY_DOTENV_PATH="$RN_PROJECT_ROOT/.env.sentry-build-plugin"
[ -z "$SOURCEMAP_FILE" ] && export SOURCEMAP_FILE="$DERIVED_FILE_DIR/main.jsbundle.map"

[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_PACKAGE_PATH=$("$LOCAL_NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/cli/package.json'))")
[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_EXECUTABLE="${SENTRY_CLI_PACKAGE_PATH}/bin/sentry-cli"

REACT_NATIVE_XCODE=$1

[[ "$AUTO_RELEASE" == false ]] && [[ -z "$BUNDLE_COMMAND" || "$BUNDLE_COMMAND" != "ram-bundle" ]] && NO_AUTO_RELEASE="--no-auto-release"
ARGS="$NO_AUTO_RELEASE $SENTRY_CLI_EXTRA_ARGS $SENTRY_CLI_RN_XCODE_EXTRA_ARGS"

REACT_NATIVE_XCODE_WITH_SENTRY="\"$SENTRY_CLI_EXECUTABLE\" react-native xcode $ARGS \"$REACT_NATIVE_XCODE\""

exitCode=0

if [ "$SENTRY_DISABLE_AUTO_UPLOAD" != true ]; then
  # 'warning:' triggers a warning in Xcode, 'error:' triggers an error
  set +x +e # disable printing commands otherwise we might print `error:` by accident and allow continuing on error
  SENTRY_XCODE_COMMAND_OUTPUT=$(/bin/sh -c "\"$LOCAL_NODE_BINARY\" $REACT_NATIVE_XCODE_WITH_SENTRY" 2>&1)
  if [ $? -eq 0 ]; then
    echo "$SENTRY_XCODE_COMMAND_OUTPUT" | awk '{print "output: sentry-cli - " $0}'
  else
    echo "error: sentry-cli - To disable source maps auto upload, set SENTRY_DISABLE_AUTO_UPLOAD=true in your environment variables. Or to allow failing upload, set SENTRY_ALLOW_FAILURE=true"
    echo "error: sentry-cli - $SENTRY_XCODE_COMMAND_OUTPUT"
    exitCode=1
  fi
  set -x -e # re-enable
else
  echo "SENTRY_DISABLE_AUTO_UPLOAD=true, skipping sourcemaps upload"
  /bin/sh -c "$REACT_NATIVE_XCODE"
fi

[ -z "$SENTRY_COLLECT_MODULES" ] && SENTRY_RN_PACKAGE_PATH=$("$LOCAL_NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/react-native/package.json'))")
[ -z "$SENTRY_COLLECT_MODULES" ] && SENTRY_COLLECT_MODULES="${SENTRY_RN_PACKAGE_PATH}/scripts/collect-modules.sh"

if [ -f "$SENTRY_COLLECT_MODULES" ]; then
  /bin/sh "$SENTRY_COLLECT_MODULES"
fi

exit $exitCode

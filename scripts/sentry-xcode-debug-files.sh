#!/bin/bash
# Upload Debug Symbols to Sentry Xcode Build Phase
# PWD=ios

# print commands before executing them
set -x

[ -z "$WITH_ENVIRONMENT" ] && WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"

if [ -f "$WITH_ENVIRONMENT" ]; then
  # load envs if loader file exists (since rn 0.68)
  . "$WITH_ENVIRONMENT"
fi

# stop on first error (we can't use -e before as any failed command in WITH_ENVIRONMENT would stop the debug files upload)
set -e

LOCAL_NODE_BINARY=${NODE_BINARY:-node}

[ -z "$SENTRY_PROPERTIES" ] && export SENTRY_PROPERTIES=sentry.properties

[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_PACKAGE_PATH=$("$LOCAL_NODE_BINARY" --print "require('path').dirname(require.resolve('@sentry/cli/package.json'))")
[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_EXECUTABLE="${SENTRY_CLI_PACKAGE_PATH}/bin/sentry-cli"

[[ $SENTRY_INCLUDE_NATIVE_SOURCES == "true" ]] && INCLUDE_SOURCES_FLAG="--include-sources" || INCLUDE_SOURCES_FLAG=""

EXTRA_ARGS="$SENTRY_CLI_EXTRA_ARGS $SENTRY_CLI_DEBUG_FILES_UPLOAD_EXTRA_ARGS $INCLUDE_SOURCES_FLAG"

UPLOAD_DEBUG_FILES="\"$SENTRY_CLI_EXECUTABLE\" debug-files upload $EXTRA_ARGS \"$DWARF_DSYM_FOLDER_PATH\""

XCODE_BUILD_CONFIGURATION="${CONFIGURATION}"

if [ "$SENTRY_DISABLE_AUTO_UPLOAD" == true ]; then
  echo "SENTRY_DISABLE_AUTO_UPLOAD=true, skipping debug files upload"
elif echo "$XCODE_BUILD_CONFIGURATION" | grep -iq "debug"; then # case insensitive check for "debug"
  echo "Skipping debug files upload for *Debug* configuration"
else
  # 'warning:' triggers a warning in Xcode, 'error:' triggers an error
  set +x +e # disable printing commands otherwise we might print `error:` by accident and allow continuing on error
  SENTRY_UPLOAD_COMMAND_OUTPUT=$(/bin/sh -c "\"$LOCAL_NODE_BINARY\" $UPLOAD_DEBUG_FILES" 2>&1)
  if [ $? -eq 0 ]; then
    echo "$SENTRY_UPLOAD_COMMAND_OUTPUT" | awk '{print "output: sentry-cli - " $0}'
  else
    echo "error: sentry-cli - To disable native debug files auto upload, set SENTRY_DISABLE_AUTO_UPLOAD=true in your environment variables. Or to allow failing upload, set SENTRY_ALLOW_FAILURE=true"
    echo "error: sentry-cli - $SENTRY_UPLOAD_COMMAND_OUTPUT"
  fi
  set -x -e # re-enable
fi

#!/bin/bash
# Upload Debug Symbols to Sentry Xcode Build Phase
# PWD=ios

# print commands before executing them and stop on first error
set -x -e

# load envs if loader file exists (since rn 0.68)
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
if [ -f "$WITH_ENVIRONMENT" ]; then
    . "$WITH_ENVIRONMENT"
fi

[ -z "$SENTRY_PROPERTIES" ] && export SENTRY_PROPERTIES=sentry.properties
[ -z "$SENTRY_CLI_EXECUTABLE" ] && SENTRY_CLI_EXECUTABLE="../node_modules/@sentry/cli/bin/sentry-cli"

[[ $SENTRY_INCLUDE_NATIVE_SOURCES == "true" ]] && INCLUDE_SOURCES_FLAG="--include-sources" || INCLUDE_SOURCES_FLAG=""

EXTRA_ARGS="$SENTRY_CLI_EXTRA_ARGS $SENTRY_CLI_DEBUG_FILES_UPLOAD_EXTRA_ARGS $INCLUDE_SOURCES_FLAG"

UPLOAD_DEBUG_FILES="\"$SENTRY_CLI_EXECUTABLE\" debug-files upload $EXTRA_ARGS \"$DWARF_DSYM_FOLDER_PATH\""

if [ "$SENTRY_DISABLE_AUTO_UPLOAD" != true ]; then
  /bin/sh -c "$UPLOAD_DEBUG_FILES"
else
  echo "SENTRY_DISABLE_AUTO_UPLOAD=true, skipping debug files upload"
fi

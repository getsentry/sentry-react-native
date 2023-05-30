#!/bin/bash

# Print commands before executing them (useful for troubleshooting)
set -x

if [[ "$CONFIGURATION" = *Debug* ]]; then
  echo "Debug build. Modules are not collected."
  exit 0
fi

if [[ -z "$CONFIGURATION_BUILD_DIR" ]]; then
  echo "Missing env CONFIGURATION_BUILD_DIR" 1>&2
  exit 1
fi

if [[ -z "$UNLOCALIZED_RESOURCES_FOLDER_PATH" ]]; then
  echo "Missing env UNLOCALIZED_RESOURCES_FOLDER_PATH" 1>&2
  exit 1
fi

if [[ -z "$DERIVED_FILE_DIR" ]]; then
  echo "Missing env DERIVED_FILE_DIR" 1>&2
  exit 1
fi

nodePath="node"
if [[ -n "$NODE_BINARY" ]]; then
  nodePath="$NODE_BINARY"
fi

thisFilePath=$(dirname $0)
collectModulesScript="$thisFilePath/../dist/js/tools/collectModules.js"

destination="$CONFIGURATION_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
modulesOutput="$destination/modules.json"
if [[ -z "$SOURCE_MAP_PATH" ]]; then
  sourceMap="$DERIVED_FILE_DIR/main.jsbundle.map"
else
  sourceMap="$SOURCE_MAP_PATH"
fi
if [[ -z "$MODULES_PATHS" ]]; then
  modulesPaths="$PWD/../node_modules"
else
  modulesPaths="$MODULES_PATHS"
fi

type $nodePath >/dev/null 2>&1 || {
  echo >&2 "error: $nodePath not found! Modules won't be collected." \
    "Please export NODE_BINARY in 'Build Phase' - 'Bundle React Native code and images'" \
    "to an absolute path of your node binary. Check your node path by 'which node'."
  exit 0 # Don't fail the build but inform about the problem
}

$nodePath "$collectModulesScript" "$sourceMap" "$modulesOutput" "$modulesPaths"

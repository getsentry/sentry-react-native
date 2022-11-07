#!/bin/bash

# Print commands before executing them (useful for troubleshooting)
set -x

nodePath='node'
collectModulesScript='./../dist/js/tools/collectModules.js'

destination=$CONFIGURATION_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH
modulesOutput=$destination/modules.json
sourceMap=$DERIVED_FILE_DIR/main.jsbundle.map

$nodePath $collectModulesScript $sourceMap $modulesOutput

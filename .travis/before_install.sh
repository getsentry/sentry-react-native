#!/bin/sh
set -e
if [ "$LANE" = "ios" ]; then
    brew update
    brew install yarn
    brew outdated node || brew upgrade node
    brew outdated yarn || brew upgrade yarn
elif [ "$LANE" = "android" ]; then
    node --version
    npm install -g yarn
fi

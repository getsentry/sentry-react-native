#!/usr/bin/env bash
set -euo pipefail

# Matches the version number from the output of xcodebuild -version
# Example: 13.4.1
xcodeBin=/usr/bin/xcodebuild

xcodeVersionOutput=$($xcodeBin -version)
xcodeVersion=$(echo "$xcodeVersionOutput" | perl -pe '($_)=/([0-9]+([.][0-9]+)+)/')

echo "$xcodeVersion"

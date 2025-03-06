#!/bin/bash

set -e -x # exit on error, print commands

# Get current directory
thisFileDirPath=$(dirname "$0")
reactProjectRootPath="$(cd "$thisFileDirPath/.." && pwd)"

maybeApkPath=$(find "${reactProjectRootPath}" -maxdepth 1 -name "*.apk")

# Check if any APK files exist
apk_count=$(echo "$maybeApkPath" | wc -l)

if [ -n "$maybeApkPath" ] && [ $apk_count -eq 1 ]; then
  # Force install single APK using adb
  apk_file="${maybeApkPath}"
  echo "Installing $apk_file..."
  adb install -r "$apk_file"
elif [ $apk_count -gt 1 ]; then
  echo "Error: Multiple APK files found. Expected only one APK file."
  exit 1
else
  echo "No APK files found, continuing without install"
fi

# Run the tests
npx jest --config e2e/jest.config.android.js

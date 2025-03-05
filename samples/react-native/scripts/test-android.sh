#!/bin/bash

# Get current directory
thisFileDirPath=$(dirname "$0")
reactProjectRootPath="$(cd "$thisFileDirPath/.." && pwd)"

maybeApkPath="${reactProjectRootPath}/*.apk"

# Check if any APK files exist
apk_count=$(ls -1 "${maybeApkPath}" 2>/dev/null | wc -l)

if [ $apk_count -eq 1 ]; then
  # Force install single APK using adb
  apk_file=$(ls "${maybeApkPath}")
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

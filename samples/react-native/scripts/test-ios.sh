#!/bin/bash

set -e -x # exit on error, print commands

# Get current directory
thisFileDirPath=$(dirname "$0")
reactProjectRootPath="$(cd "$thisFileDirPath/.." && pwd)"

maybeAppPath=$(find "${reactProjectRootPath}" -maxdepth 1 -name "*.app")

# Check if any APP files exist
app_count=$(echo "$maybeAppPath" | wc -l)

if [ -n "$maybeAppPath" ] && [ $app_count -eq 1 ]; then
  app_file="${maybeAppPath}"
  echo "Installing $app_file..."
  xcrun simctl install booted "$app_file"
elif [ $app_count -gt 1 ]; then
  echo "Error: Multiple APP files found. Expected only one APP file."
  exit 1
else
  echo "No APP files found, continuing without install"
fi

# Run the tests
npx jest --config e2e/jest.config.ios.js

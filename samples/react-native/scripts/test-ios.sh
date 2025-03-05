#!/bin/bash

# Get current directory
thisFileDirPath=$(dirname "$0")
reactProjectRootPath="$(cd "$thisFileDirPath/.." && pwd)"

maybeAppPath="${reactProjectRootPath}/*.app"

# Check if any APP files exist
app_count=$(ls -1 "${maybeAppPath}" 2>/dev/null | wc -l)

if [ $app_count -eq 1 ]; then
  app_file=$(ls "${maybeAppPath}")
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

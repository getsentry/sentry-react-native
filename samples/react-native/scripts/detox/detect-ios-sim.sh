#!/bin/bash

# Exit on error
set -e

if [ -z "$IOS_DEVICE" ]; then
  # Get the first booted simulator device type and version
  BOOTED_DEVICE=$(xcrun simctl list devices | grep "Booted" | head -n 1)

  if [ -z "$BOOTED_DEVICE" ]; then
    echo "No booted iOS simulator found"
    exit 1
  fi

  # Extract device type from booted device
  export IOS_DEVICE=$(echo "$BOOTED_DEVICE" | cut -d "(" -f1 | xargs)
  echo "Using booted iOS simulator: $IOS_DEVICE"
fi

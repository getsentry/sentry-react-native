#!/bin/bash

# Exit on error and print commands
set -xe

thisFilePath=$(dirname "$0")

cd "${thisFilePath}/../.."

if [ -z "$ANDROID_AVD_NAME" ]; then
  # Get the name of the first booted or connected Android device
  DEVICE_NAME=$(adb devices | grep -w "device" | head -n 1 | cut -f 1)

  if [ -z "$DEVICE_NAME" ]; then
    echo "No Android device or emulator found"
    exit 1
  fi

  if [[ "$DEVICE_NAME" == *"emulator"* ]]; then
    # Get the name of the first booted or connected Android emulator/device
    EMULATOR_NAME=$(adb -s "${DEVICE_NAME}" emu avd name | head -n 1 | cut -f 1 )

    if [ -z "$EMULATOR_NAME" ]; then
      echo "No Android emulator found"
      exit 1
    fi

    export ANDROID_TYPE="android.emulator"
    export ANDROID_AVD_NAME="$EMULATOR_NAME"
    echo "Using Android emulator: $EMULATOR_NAME"
  else
    export ANDROID_TYPE="android.attached"
    export ANDROID_ADB_NAME="$DEVICE_NAME"

    adb reverse tcp:8081  tcp:8081
    adb reverse tcp:8961  tcp:8961

    echo "Using Android device: $DEVICE_NAME"
  fi
fi

# Run the tests
detox test --configuration ci.android

#!/usr/bin/env bash
set -euo pipefail

# fix: WARNING | /etc/localtime does not point to zoneinfo-compatible timezone name
if ! [[ -f /etc/localtime ]]; then
  sudo ln -sf /usr/share/zoneinfo/GMT /etc/localtime
fi

# Kill all child processes on exit
trap "(trap - SIGTERM && kill -- -$$) || echo ''" SIGINT SIGTERM EXIT

# Collect logs
adb logcat '*:D' >adb.log &
yarn run react-native log-android 2>&1 >rn.log &

sleep 5
adb devices -l
deviceId=$(adb devices -l | grep "device " | cut -d " " -f 1)

takeScreenshot() {
  echo "Taking screenshot from device $deviceId"
  file="/data/local/tmp/android.screen.png"
  adb -s $deviceId shell "screencap -p $file"
  adb pull $file
  adb shell "rm $file"
}

export PLATFORM=${PLATFORM:-android}
yarn test --verbose || (takeScreenshot && exit 1)

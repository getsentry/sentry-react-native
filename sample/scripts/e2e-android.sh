#!/usr/bin/env bash
set -euo pipefail

# fix: WARNING | /etc/localtime does not point to zoneinfo-compatible timezone name
[[ -f /etc/localtime ]] || sudo ln -sf /usr/share/zoneinfo/US/Pacific /etc/localtime

# Kill all child processes on exit
trap "(trap - SIGTERM && kill -- -$$) || echo ''" SIGINT SIGTERM EXIT

# Collect logs
adb logcat '*:D' >adb.log &
yarn run react-native log-android 2>&1 >rn.log &

sleep 5
adb devices -l
deviceId=$(adb devices -l | grep "device " | cut -d " " -f 1)

export PLATFORM=${PLATFORM:-android}
yarn test --verbose

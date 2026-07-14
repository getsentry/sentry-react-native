#!/bin/bash

# Regression guard for the `reactNativeArchitectures` fix in
# https://github.com/getsentry/sentry-react-native/issues/6398.
#
# `libsentry-tm-perf-logger.so` is compiled from source in the consuming app.
# `packages/core/android/build.gradle` must honour the host app's
# `reactNativeArchitectures` property (like react-native-screens / reanimated
# do) so the module builds only the ABIs the app requested. When it doesn't,
# the module builds ABIs whose React Native `reactnative` prefab isn't
# provided → link failure.
#
# This check asserts that a built APK contains `libsentry-tm-perf-logger.so`
# for EXACTLY the ABIs the app requested — no more, no less. Point it at a
# clean-build APK from a subset-ABI build (e.g. `-PreactNativeArchitectures=arm64-v8a`).
#
# Usage: scripts/check-tm-perf-logger-abi-subset.sh <path-to-apk-or-aab> <expected-abis-csv>
#   e.g. scripts/check-tm-perf-logger-abi-subset.sh app.apk 'arm64-v8a'

set -euo pipefail

apk="${1:-}"
expected_csv="${2:-}"
if [[ -z "$apk" || ! -f "$apk" || -z "$expected_csv" ]]; then
  echo "usage: $0 <path-to-apk-or-aab> <expected-abis-csv>" >&2
  exit 2
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# Extract only the native libraries. APK stores them under `lib/`, AAB under `base/lib/`.
unzip -qq -o "$apk" 'lib/*' 'base/lib/*' -d "$workdir" 2>/dev/null || true

# ABIs where our library was packaged, one per line, sorted, unique.
actual=$(
  find "$workdir" -type f -name 'libsentry-tm-perf-logger.so' 2>/dev/null \
    | sed -E 's|.*/lib/([^/]+)/.*|\1|' \
    | sort -u
)
expected=$(echo "$expected_csv" | tr ',' '\n' | sed '/^$/d' | sort -u)

echo "expected ABIs: $(echo $expected | tr '\n' ' ')"
echo "actual ABIs:   $(echo $actual   | tr '\n' ' ')"

if [[ -z "$actual" ]]; then
  echo "✖ libsentry-tm-perf-logger.so not found in $apk" >&2
  echo "  Expected it packaged for: $(echo $expected | tr '\n' ' ')" >&2
  exit 1
fi

if [[ "$actual" != "$expected" ]]; then
  echo "✖ ABI mismatch — module built ABIs the app did not request (or missed one)." >&2
  echo "  Root cause of #6398: abiFilters not honoring reactNativeArchitectures." >&2
  exit 1
fi

echo "✔ libsentry-tm-perf-logger.so packaged for exactly the requested ABI(s)"

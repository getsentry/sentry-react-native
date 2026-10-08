#!/usr/bin/env bash
#
# Regression check for the sentry-cocoa crash-handler freeze (issue getsentry/sentry-cocoa#9281).
#
# With the UIScene lifecycle + a Swift (MainActor) scene delegate + `attachScreenshot`, an unfixed
# sentry-cocoa reads the scene delegate's `window` getter off the crash thread, trips
# `dispatch_assert_queue(main)`, re-enters the signal handler, and HANGS on non-Mach crashes
# (abort/terminate). A fixed cocoa reads `UIWindowScene.windows` instead and terminates cleanly.
#
# This script drives the Expo sample (with the env-gated `withSceneCrashRepro` plugin), crashes it
# off the main thread, and ASSERTS the process terminated cleanly, wrote a crash report, and still
# captured a screenshot — with no `dispatch_assert_queue_fail` re-entry.
#
# It validates whatever sentry-cocoa the SDK currently bundles, so it goes green once the bundled
# cocoa version is bumped to a release that contains the fix. To validate a local cocoa build before
# release, stage it and pass its cache dir:
#   SENTRY_XCFRAMEWORK_CACHE_DIR=/path/to/cache (containing <version>/Sentry.xcframework) ...
#
# Usage: scripts/verify-ios-crash-screenshot-no-freeze.sh
# Exit code: 0 = fixed (clean terminate + screenshot), 1 = bug present or setup failure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPO_DIR="$REPO_ROOT/samples/expo"
IOS_DIR="$EXPO_DIR/ios"
BUNDLE_ID="io.sentry.expo.sample"
WORKDIR="${WORKDIR:-$(mktemp -d)}"
DD="$WORKDIR/DerivedData"
ABORT_DELAY_PADDING=20   # seconds to wait past the 8s in-app abort before declaring a freeze

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mFAIL: %s\033[0m\n' "$*" >&2; exit 1; }

# ---- 1. Pick an iOS 26+ simulator (Swift 6 isolation enforcement needs the iOS 26+ runtime) -------
log "Selecting an iOS 26+ simulator"
SIM_ID="${SIM_ID:-$(xcrun simctl list devices available --json 2>/dev/null | python3 -c '
import json, sys
data = json.load(sys.stdin)["devices"]
for runtime, devices in sorted(data.items()):
    # runtime looks like com.apple.CoreSimulator.SimRuntime.iOS-26-5
    key = runtime.rsplit(".", 1)[-1]
    if not key.startswith("iOS-"):
        continue
    try:
        major = int(key.split("-")[1])
    except (IndexError, ValueError):
        continue
    if major < 26:
        continue
    for d in devices:
        if d.get("isAvailable") and "iPhone" in d.get("name", ""):
            print(d["udid"]); sys.exit(0)
')}"
[ -n "$SIM_ID" ] || fail "No iOS 26+ iPhone simulator available (required for Swift 6 isolation enforcement)."
echo "Simulator: $SIM_ID"
xcrun simctl boot "$SIM_ID" 2>/dev/null || true

# ---- 2. Prebuild the sample (the withIosSceneLifecycle plugin adopts the UIScene lifecycle) -------
log "Prebuilding Expo sample"
( cd "$EXPO_DIR" && CI=1 npx expo prebuild --clean --no-install -p ios )

# Guard: fail loudly if the scene lifecycle did not get wired up (otherwise the check would pass
# trivially against a non-scene app that cannot hit the bug).
/usr/libexec/PlistBuddy -c "Print :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName" \
  "$IOS_DIR/sentryreactnativeexposample/Info.plist" 2>/dev/null | grep -q EXExpoAppSceneDelegate \
  || fail "Scene manifest not injected — withIosSceneLifecycle did not apply (Expo template drift?)."
grep -q "ExpoReactNativeFactoryProvider" "$IOS_DIR/sentryreactnativeexposample/AppDelegate.swift" \
  || fail "AppDelegate not wired for the scene lifecycle — withIosSceneLifecycle did not apply."

# ---- 3. Pod install (honors SENTRY_XCFRAMEWORK_CACHE_DIR for local pre-release validation) --------
log "Installing pods"
( cd "$IOS_DIR" && export REACT_NATIVE_NODE_MODULES_DIR="$(cd ../node_modules/react-native && pwd)" && pod install )
echo "Bundled cocoa:"; grep -m2 "Sentry (" "$IOS_DIR/Podfile.lock" || true

# ---- 4. Release build for the simulator (bundles JS; attachScreenshot is configured natively) ----
log "Building Release app for the simulator"
( cd "$IOS_DIR" && SENTRY_DISABLE_AUTO_UPLOAD=true TOOLCHAINS=com.apple.dt.toolchain.XcodeDefault xcodebuild build \
    -workspace sentryreactnativeexposample.xcworkspace \
    -scheme sentryreactnativeexposample \
    -configuration Release -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=$SIM_ID" \
    -derivedDataPath "$DD" ONLY_ACTIVE_ARCH=yes ARCHS=arm64 CODE_SIGNING_ALLOWED=NO )
APP="$(find "$DD/Build/Products/Release-iphonesimulator" -maxdepth 1 -name '*.app' | head -1)"
[ -d "$APP" ] || fail "Build did not produce an .app"

# ---- 5. Install, crash off-main, and classify ----------------------------------------------------
log "Running the crash and classifying the outcome"
xcrun simctl terminate "$SIM_ID" "$BUNDLE_ID" 2>/dev/null || true
xcrun simctl uninstall "$SIM_ID" "$BUNDLE_ID" 2>/dev/null || true
xcrun simctl install "$SIM_ID" "$APP"
PID="$(SIMCTL_CHILD_SENTRY_TEST_ABORT=1 xcrun simctl launch "$SIM_ID" "$BUNDLE_ID" | awk -F': ' '{print $2}')"
echo "Launched pid=$PID (abort scheduled ~8s after launch)"

TERMINATED=0
for _ in $(seq 1 $((8 + ABORT_DELAY_PADDING))); do
  sleep 1
  ps -p "$PID" >/dev/null 2>&1 || { TERMINATED=1; break; }
done

if [ "$TERMINATED" -eq 0 ]; then
  echo "Process $PID still alive long after the abort — capturing the hung stack:"
  sample "$PID" 2 -file "$WORKDIR/sample.txt" 2>/dev/null || true
  grep -iE "dispatch_assert_queue|isCurrentExecutor|collectWindowsOnCurrentThread|saveScreenShots|window.getter" \
    "$WORKDIR/sample.txt" | sort -u | head
  xcrun simctl terminate "$SIM_ID" "$BUNDLE_ID" 2>/dev/null || true
  fail "App FROZE during crash handling — the bundled sentry-cocoa still has issue #9281."
fi
echo "Process terminated cleanly after the crash."

# ---- 6. Assert the crash report + screenshot were produced, with no trap re-entry ----------------
log "Validating crash artifacts"
DATA="$(xcrun simctl get_app_container "$SIM_ID" "$BUNDLE_ID" data)"
REPORTS="$DATA/Library/Caches/SentryCrash/sentryreactnativeexposample/Reports"
REPORT="$(ls "$REPORTS"/*.json 2>/dev/null | head -1 || true)"
SHOT="$(find "$REPORTS" -name 'screenshot.png' 2>/dev/null | head -1 || true)"

[ -n "$REPORT" ] || fail "No crash report was written."
[ -n "$SHOT" ] && [ -s "$SHOT" ] || fail "No (non-empty) crash-time screenshot was captured."
file "$SHOT" | grep -q "PNG image data" || fail "Screenshot is not a valid PNG."
if grep -q "dispatch_assert_queue_fail" "$REPORT"; then
  fail "Crash report contains a dispatch_assert_queue_fail re-entry — the trap still fires."
fi

echo "Crash report: $(basename "$REPORT")"
echo "Screenshot:   $(file -b "$SHOT")"
log "PASS: clean terminate + screenshot captured, no crash-handler freeze."

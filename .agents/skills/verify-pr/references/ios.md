# iOS: setup, build, run

Simulator only. Real devices are out of scope for now.

## Setup

| Need | How |
|---|---|
| Simulator | `xcrun simctl list devices available`; boot one: `xcrun simctl boot <udid> && xcrun simctl bootstatus <udid> -b`. Note the UDID; Maestro needs it when an Android emulator is also running. |
| JDK 17 | Maestro needs it on iOS too: `export JAVA_HOME=<jdk17>; export PATH=$JAVA_HOME/bin:$PATH`. |
| Pods | Installed for the build you make (next section). |
| Source maps / dSYM upload | `export SENTRY_DISABLE_AUTO_UPLOAD=true`. |
| Sentry | The Sentry MCP with read access to `sentry-sdks`. |

## Pods

The installed Pods are whatever the last person built, and they must match the tracked Xcode project's linkage. A mismatch fails at link time: `ld: library 'Pods-sentryreactnativesample' not found`. Reinstall them before the first build of every run, even if a build worked last time:

```bash
cd samples/react-native
yarn pod-install-release-static   # New Architecture, release, static frameworks
```

- Other combinations: `yarn pod-install-<debug|release>-<static|dynamic>[-legacy]` (see `samples/react-native/AGENTS.md`).
- Takes ~30 s with a warm CocoaPods cache.
- **Exits with code 2 even on success**: its last line greps for `$RN_SENTRY_POD_NAME`, which is usually unset. Check the log for `Pod installation complete!` instead.
- It rewrites two tracked files, `ios/sentryreactnativesample.xcodeproj/project.pbxproj` and `ios/sentryreactnativesample/PrivacyInfo.xcprivacy`. Keep them during the run; restore them at the end (SKILL.md step 6).
- Reverting a native SDK change needs no reinstall: `RNSentry` is a local `:path` pod, so Xcode picks up the source change.

## Build

From `samples/react-native`:

```bash
SENTRY_DISABLE_AUTO_UPLOAD=true yarn build-ios-release   # → samples/react-native/sentryreactnativesample.app
```

- ~2.5 min the first time after a Pods install; ~45 s incremental after a native-only or sample JS change.
- The build log is `samples/react-native/ios/xcodebuild.log`. On failure, grep it for `error:` and `ld:`.
- Run builds in the background and wait for them; don't poll.

## Install and launch

```bash
xcrun simctl install <udid> samples/react-native/sentryreactnativesample.app
```

Launch through Maestro (`steps/launch.yml`), which passes the run tags as launch arguments. The bundle id is the same as on Android, `io.sentry.reactnative.sample`, so the shared steps work unchanged.

**Native crashes** are only captured without a debugger attached. Maestro and `simctl launch` don't attach one; running from Xcode does, and the debugger stops on the crash instead of Sentry.

## Drive the UI with Maestro

```bash
maestro --device <udid> test \
  -e VERIFY_PR=<N> -e VERIFY_COMMIT=<sha> -e VERIFY_RUN_ID=<id> \
  --test-output-dir <out-dir> \
  <out-dir>/<run-id>.yml
```

Differences from Android:

- Maestro prints `${VAR}` unexpanded in launch arguments and `runFlow` env values, as on Android; the values are still applied. Confirm in the device log (`verify.run_id`).

- **`back` does nothing on iOS.** To return to a tab's root screen, tap its tab icon: `tapOn: { id: 'errors-tab-icon' }` (also `performance-tab-icon`, `playground-tab-icon`). Tapping the active tab pops its stack (seen on iOS; the shared example flow uses it on both platforms).
- **Tab labels can't be tapped by text.** Use the tab icon ids above.
- **The Playground tab's content is invisible to Maestro by text.** Its views sit inside a `TouchableWithoutFeedback`, which iOS exposes as one accessibility element. Target views there by `testID` (`id:` in Maestro); add a `testID` to any view the scenario needs to tap or scroll to.
- Native crash events are sent on the next launch, as on Android (`steps/native-crash-and-relaunch.yml`).

## On-device evidence

```bash
xcrun simctl io <udid> screenshot <out-dir>/<name>.png
xcrun simctl spawn <udid> log show --last 5m \
  --predicate 'process == "sentryreactnativesample"' > <out-dir>/<run-id>.log
```

With `debug: true` (`sentry.options.json`), the log shows the native scope, e.g. `Setting tags in background queue: Optional(["turbo_module.name": "", "verify.run_id": ...])`, and each envelope's `Received response status code: 200`.

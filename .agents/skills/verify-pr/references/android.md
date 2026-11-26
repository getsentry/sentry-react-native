# Android: setup, build, run

## Setup

| Need | How |
|---|---|
| JDK 17 | Gradle **and** Maestro need it. `export JAVA_HOME=<jdk17>; export PATH=$JAVA_HOME/bin:$PATH` (e.g. `~/.sdkman/candidates/java/17.0.9-tem`). The default JDK may be 11. |
| Emulator | A full image (`emulator -list-avds`, e.g. `Pixel_8`). **Not** an ATD image (`*_atd`): its screenshots are all black. `adb devices` must list exactly one device, or pass `-s`. |
| Maestro | `maestro --version`. Already used by the repo's e2e tests. |
| Source maps upload | `export SENTRY_DISABLE_AUTO_UPLOAD=true` for release builds. The local token can't upload, and verification doesn't need it. |
| Sentry | The Sentry MCP with read access to `sentry-sdks`. `sentry-cli` can't read events (no `api` command, `org:ci` token). |

Start an emulator if none is running: `emulator -avd Pixel_8 -no-snapshot-save &`, then `adb wait-for-device`. If another session's emulator (e.g. an ATD image) is already running, boot `Pixel_8` next to it and pass `-s <serial>` to `adb` and `--device <serial>` to Maestro.

## Build

From `samples/react-native`:

```bash
yarn build-android-release   # → samples/react-native/app.apk (New Architecture)
yarn build-android-debug     # needs Metro: `yarn start`
```

- These scripts **drop extra arguments**: `-P…` flags never reach Gradle. For Gradle properties, call `./gradlew :app:assembleRelease -P…` in `samples/react-native/android` directly.
- Debug builds load JS from port 8081 on the host (`10.0.2.2:8081`); `adb reverse` doesn't change that on an emulator. If another Metro holds 8081, build with `-PreactNativeDevServerPort=<port>` and `yarn start --port <port>`, or use a release build.

- `*-legacy` variants build the Old Architecture. Verify on the architecture the claim is about; when it's both, run both.
- Build time depends on the Gradle cache: ~5–6 min with a cold cache, 15–40 s with a warm one, including after a native-only change.
- JS SDK changes: `cd packages/core && yarn build` first, on both sides.
- Run builds in the background and wait for them to finish; don't poll.

## Install and launch

```bash
adb install -r samples/react-native/app.apk
adb shell am start -n io.sentry.reactnative.sample/.MainActivity \
  -e verifyPr <N> -e verifyCommit <sha> -e verifyRunId <id>
```

`adb shell monkey -p <pkg> -c android.intent.category.LAUNCHER 1` doesn't start this app; use `am start`.
Use `adb uninstall io.sentry.reactnative.sample` before switching between debug and release (different signatures).

## Drive the UI with Maestro

```bash
maestro test \
  -e VERIFY_PR=<N> -e VERIFY_COMMIT=<sha> -e VERIFY_RUN_ID=<id> \
  --test-output-dir <out-dir> \
  <out-dir>/<run-id>.yml          # the run's own flow, saved next to the report
```

- `runFlow` paths resolve relative to the flow file. A flow saved outside the skill must reach the shared steps by absolute path: `runFlow: <repo>/.agents/skills/verify-pr/flows/steps/launch.yml`.
- With more than one device running (an emulator and a simulator), pass `--device <id>` (`adb devices` / `xcrun simctl list devices booted`).

- Screenshots from `takeScreenshot: <name>` land in `<out-dir>/screenshots/<name>.png`.
- Maestro matches text case-insensitively (Android upper-cases button labels) and scrolls with `scrollUntilVisible`.
- `scrollUntilVisible.direction` can't come from a variable. A pushed screen keeps the list's scroll offset when you go back, so scroll **UP** to buttons near the top after a `back`.
- After a crash, relaunch with `clearState: false` so the stored event is sent (`steps/native-crash-and-relaunch.yml`).
- Maestro's log prints `${VAR}` unexpanded in launch arguments and in `runFlow` env values (e.g. `Tap on "${BUTTON}"`); the values are still applied. Confirm in logcat (`grep '"verify.run_id"'`).
- Maestro has no plain sleep. When the evidence is batched (logs), wait in the shell after `maestro test` returns, with the app still running.

## Fallback: uiautomator

When Maestro can't run, drive the app with `adb`:

```bash
adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml   # find a node's bounds by text
adb shell input tap <x> <y>
adb shell input swipe 540 600 540 1500 200                                   # scroll up
```

Match `text` or `content-desc` case-insensitively. The dumped text is also usable evidence when screenshots fail.

## On-device evidence

```bash
adb logcat -c                                   # before the scenario
adb logcat -d > <out-dir>/<run-id>.logcat       # after it
adb exec-out screencap -p > <out-dir>/<name>.png
```

The sample runs with `debug: true` (`sentry.options.json`), so logcat shows the Sentry scope and events as JSON (`D Sentry :` lines) — useful for checking the native scope before an event is sent.

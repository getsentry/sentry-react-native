# samples/expo — Expo Sample App

The test bed for the SDK under Expo (config plugin, Metro integration, EAS). Use it to verify a change behaves in an Expo-managed app, not just a bare RN one.

## Running

```bash
yarn start          # Start the dev server (expo start)
yarn ios            # Build & run the iOS dev client (expo run:ios)
yarn android        # Build & run the Android dev client (expo run:android)
```

`yarn start` then follows the Expo CLI prompts to open on an iOS simulator, Android emulator, or a physical device. Because the SDK ships native code, plain Expo Go isn't enough — the `run:*` scripts build a dev client that includes it.

## iOS UIScene lifecycle

The `plugins/withIosSceneLifecycle.js` config plugin makes this app adopt the iOS **UIScene lifecycle** with Expo's own `EXExpoAppSceneDelegate` (a Swift `UIWindowSceneDelegate`). This is where Apple/Expo are pushing every app ("Required by iOS 27"), and — importantly — it is the exact configuration behind the crash-handler freeze in [sentry-cocoa#9281](https://github.com/getsentry/sentry-cocoa/issues/9281). Keeping it as the sample's normal config means that bug class stays exercised by regular iOS CI. Expo 57 ships `ExpoAppSceneDelegate` but does not wire it up during prebuild yet, so the plugin adds the `UIApplicationSceneManifest` and adjusts the generated `AppDelegate`.

### Crash-handler regression check

The same plugin injects a documented test hook: launching the app with the env var **`SENTRY_TEST_ABORT=1`** crashes it via `abort()` on a **background thread** ~8s after launch. That makes SentryCrash's inline signal handler run off the main thread, forcing the crash-time screenshot (`attachScreenshot: true`) to read the MainActor scene-delegate `window` getter off-main — which **hangs** on an unfixed sentry-cocoa and **terminates cleanly** on a fixed one. The hook is inert unless the env var is set.

`scripts/verify-ios-crash-screenshot-no-freeze.sh` (repo root) drives this end to end against whatever cocoa the SDK currently bundles, asserting a clean terminate + a captured `screenshot.png` with no `dispatch_assert_queue_fail` re-entry. It needs **Xcode 27 / iOS 26+** (Swift 6 isolation enforcement). To validate a local cocoa build before it is released, stage it and pass `SENTRY_XCFRAMEWORK_CACHE_DIR=<cache>` (containing `<version>/Sentry.xcframework`). The `.github/workflows/ios-crash-screenshot-no-freeze.yml` workflow runs it on a cocoa version bump (and on manual dispatch) — it stays red until the bundled cocoa carries the fix.

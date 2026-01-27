# E2E Testing Guide

This directory contains end-to-end tests for the React Native sample app, testing both **manual native init** and **auto init from JS** modes.

## Test Modes

### Manual Native Init Mode
Native SDK is initialized **before** JavaScript loads, allowing capture of app start crashes.
- **iOS**: Native init via `RNSentrySDK.start()` in AppDelegate
- **Android**: Native init via `RNSentrySDK.init(this)` in MainApplication

### Auto Init from JS Mode
SDK is initialized **from JavaScript** after app loads (traditional behavior).
- **iOS**: Native init is skipped via launch argument `sentryDisableNativeStart`
- **Android**: Native init is disabled at build time via `SENTRY_DISABLE_NATIVE_START=true`

## Running Tests

### Android

#### Manual Native Init Tests
```bash
# Build with native init enabled
yarn build-android-debug-manual

# Run manual mode tests
yarn test-android-manual
```

#### Auto Init from JS Tests
```bash
# Build with native init disabled
yarn build-android-debug-auto

# Run auto mode tests
yarn test-android-auto
```

### iOS

#### Manual Native Init Tests
```bash
# Build
yarn build-ios-debug

# Run manual mode tests
yarn test-ios-manual
```

#### Auto Init from JS Tests
```bash
# Build (same build works for both modes)
yarn build-ios-debug

# Run auto mode tests (uses launch argument to disable native init)
yarn test-ios-auto
```

## Test Structure

```
e2e/
├── jest.config.{platform}.{mode}.js  # Test configurations
├── setup.{platform}.{mode}.ts        # Test setup files
└── tests/
    ├── captureMessage/              # Basic message capture tests
    │   ├── *.test.{platform}.{mode}.ts
    │   └── *.test.yml               # Maestro flows
    ├── captureAppStartCrash/        # App start crash tests (manual mode only)
    │   ├── *.test.{platform}.manual.ts
    │   └── *.test.{platform}.manual.yml
    └── ...
```

## Platform Differences

### iOS
- Uses **launch arguments** to control native init at runtime
- Same build can test both modes
- Launch argument: `sentryDisableNativeStart: true/false`

### Android
- Uses **build configuration** to control native init at compile time
- Requires separate builds for each mode
- Build config: `SENTRY_DISABLE_NATIVE_START=true/false`
- Environment variable set by build scripts

## Adding New Tests

### Dual-Mode Tests (runs in both auto and manual)
1. Create test file: `myTest.test.{platform}.{mode}.ts`
2. Create Maestro flow: `myTest.test.yml` (Android) or `myTest.test.{platform}.{mode}.yml` (iOS)
3. Test should work regardless of init mode

### Manual-Only Tests (app start crashes)
1. Create test file: `myTest.test.{platform}.manual.ts`
2. These tests verify native-only features before JS loads
3. Cannot test in auto mode (JS not loaded yet)

## App Start Crash Testing

### Android
Uses a flag file mechanism:
1. Call `TestControlModule.enableCrashOnStart()` from JS
2. Restart app → native crash before JS loads
3. Restart again → crash event is sent
4. Call `TestControlModule.disableCrashOnStart()` to clean up

### iOS
Uses launch arguments:
1. Launch with `sentryCrashOnStart: true`
2. App crashes in `application:didFinishLaunchingWithOptions`
3. Restart → crash event is sent

## Debugging

### View test output
```bash
# Android
adb logcat | grep -i sentry

# iOS
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "sentryreactnativesample"'
```

### Manual testing
```bash
# Android - Install specific build
adb install -r app-manual.apk  # or app-auto.apk
adb shell am start -n io.sentry.reactnative.sample/.MainActivity

# iOS - Use Xcode or simulator
open -a Simulator
xcrun simctl install booted sentryreactnativesample.app
xcrun simctl launch booted io.sentry.reactnative.sample
```

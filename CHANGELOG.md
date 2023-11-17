# Changelog

## Unreleased

### Features

- Add iOS profiles to React Native Profiling ([#3349](https://github.com/getsentry/sentry-react-native/pull/3349))

## 5.13.0

### Features

- Export New JS Performance API ([#3371](https://github.com/getsentry/sentry-react-native/pull/3371))

  ```js
  // Start a span that tracks the duration of expensiveFunction
  const result = Sentry.startSpan({ name: 'important function' }, () => {
    return expensiveFunction();
  });
  ```

  Read more at https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7690

- Report current screen in `contexts.app.view_names` ([#3339](https://github.com/getsentry/sentry-react-native/pull/3339))

### Fixes

- Remove `platform: node` from Debug Builds Events ([#3377](https://github.com/getsentry/sentry-react-native/pull/3377))

### Dependencies

- Bump Android SDK from v6.32.0 to v6.33.1 ([#3374](https://github.com/getsentry/sentry-react-native/pull/3374))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6331)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.32.0...6.33.1)
- Bump Cocoa SDK from v8.14.2 to v8.15.2 ([#3376](https://github.com/getsentry/sentry-react-native/pull/3376))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#8152)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.14.2...8.15.2)
- Bump CLI from v2.21.2 to v2.21.3 ([#3381](https://github.com/getsentry/sentry-react-native/pull/3381))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2213)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.21.2...2.21.3)
- Bump JavaScript SDK from v7.76.0 to v7.80.0 ([#3372](https://github.com/getsentry/sentry-react-native/pull/3372))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7800)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.76.0...7.80.0)

## 5.12.0

### Features

- Automatically detect environment if not set ([#3362](https://github.com/getsentry/sentry-react-native/pull/3362))
- Send Source Maps Debug ID for symbolicated Profiles ([#3343](https://github.com/getsentry/sentry-react-native/pull/3343))

### Fixes

- Add actual `activeThreadId` to Profiles ([#3338](https://github.com/getsentry/sentry-react-native/pull/3338))
- Parse Hermes Profiling Bytecode Frames ([#3342](https://github.com/getsentry/sentry-react-native/pull/3342))

### Dependencies

- Bump JavaScript SDK from v7.73.0 to v7.76.0 ([#3344](https://github.com/getsentry/sentry-react-native/pull/3344), [#3365](https://github.com/getsentry/sentry-react-native/pull/3365))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7760)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.73.0...7.76.0)
- Bump Cocoa SDK from v8.13.0 to v8.14.2 ([#3340](https://github.com/getsentry/sentry-react-native/pull/3340))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#8142)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.13.0...8.14.2)
- Bump Android SDK from v6.30.0 to v6.32.0 ([#3341](https://github.com/getsentry/sentry-react-native/pull/3341))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6320)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.30.0...6.32.0)

## 5.11.1

### Fixes

- Waif for `has-sourcemap-debugid` process to exit ([#3336](https://github.com/getsentry/sentry-react-native/pull/3336))

## 5.11.0

### Features

- Add `buildFeatures.buildConfig=true` to support AGP 8 ([#3298](https://github.com/getsentry/sentry-react-native/pull/3298))
- Add Debug ID support ([#3164](https://github.com/getsentry/sentry-react-native/pull/3164))

  This is optional to use Debug IDs. Your current setup will keep working as is.

  Add Sentry Metro Serializer to `metro.config.js` to generate Debug ID for the application bundle and source map.

  ```javascript
    const {createSentryMetroSerializer} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');
    const config = {serializer: createSentryMetroSerializer()};
  ```

  On iOS update `Bundle React Native Code and Images` and `Upload Debug Symbols to Sentry` build phases.

  ```bash
    set -e
    WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
    REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

    /bin/sh -c "$WITH_ENVIRONMENT \"/bin/sh ../scripts/sentry-xcode.sh $REACT_NATIVE_XCODE\""
  ```

  ```bash
    /bin/sh ../../scripts/sentry-xcode-debug-files.sh
  ```

  More information about the new setup [can be found here](https://docs.sentry.io/platforms/react-native/manual-setup/manual-setup/).
- Add `SENTRY_DISABLE_AUTO_UPLOAD` flag ([#3323](https://github.com/getsentry/sentry-react-native/pull/3323))

  How to use in Android project? It works by default, just set `export SENTRY_DISABLE_AUTO_UPLOAD=true` in your build environment. For Sentry Android Gradle Plugin add the following to your `android/app/build.gradle`.

  ```gradle
  apply from: "../../../sentry.gradle"

  sentry {
      autoUploadProguardMapping = shouldSentryAutoUpload()
      uploadNativeSymbols = shouldSentryAutoUpload()
  }
  ```

  How to use in Xcode? Make sure you are using `scripts/sentry-xcode.sh` and `scripts/sentry-xcode-debug-files.sh` in your
  build phases. And add the following to your `ios/.xcode.env.local` file.

  ```bash
  export SENTRY_DISABLE_AUTO_UPLOAD=true
  ```

### Fixes

- App start time span no longer created if too long ([#3299](https://github.com/getsentry/sentry-react-native/pull/3299))
- Change log output to show what paths are considered when collecting modules ([#3316](https://github.com/getsentry/sentry-react-native/pull/3316))
- `Sentry.wrap` doesn't enforce any keys on the wrapped component props ([#3332](https://github.com/getsentry/sentry-react-native/pull/3332))
- Ignore defaults when warning about duplicate definition of trace propagation targets ([#3327](https://github.com/getsentry/sentry-react-native/pull/3327))
- Screenshots are not taken when the SDK is disabled ([#3333](https://github.com/getsentry/sentry-react-native/pull/3333))
- Use deprecated `ReactNativeTracingOptions.tracingOrigins` if set in the options ([#3331](https://github.com/getsentry/sentry-react-native/pull/3331))
- Cancel auto instrumentation transaction when app goes to background ([#3307](https://github.com/getsentry/sentry-react-native/pull/3307))

### Dependencies

- Bump CLI from v2.20.7 to v2.21.2 ([#3301](https://github.com/getsentry/sentry-react-native/pull/3301))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2212)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.20.7...2.21.2)
- Bump Android SDK from v6.29.0 to v6.30.0 ([#3309](https://github.com/getsentry/sentry-react-native/pull/3309))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6300)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.29.0...6.30.0)
- Bump JavaScript SDK from v7.69.0 to v7.73.0 ([#3297](https://github.com/getsentry/sentry-react-native/pull/3297))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7730)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.69.0...7.73.0)
- Bump Cocoa SDK from v8.11.0 to v8.13.0 ([#3292](https://github.com/getsentry/sentry-react-native/pull/3292))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#8130)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.11.0...8.13.0)

## 5.10.0

### Features

- Add Hermes Debug Info flag to React Native Context ([#3290](https://github.com/getsentry/sentry-react-native/pull/3290))
  - This flag equals `true` when Hermes Bundle contains Debug Info (Hermes Source Map was not emitted)
- Add `enableNdk` property to ReactNativeOptions for Android. ([#3304](https://github.com/getsentry/sentry-react-native/pull/3304))

## 5.9.2

### Fixes

- Create profiles for start up transactions ([#3281](https://github.com/getsentry/sentry-react-native/pull/3281))
- Fix Hermes Bytecode Symbolication one line off ([#3283](https://github.com/getsentry/sentry-react-native/pull/3283))

### Dependencies

- Bump CLI from v2.20.5 to v2.20.7 ([#3265](https://github.com/getsentry/sentry-react-native/pull/3265), [#3273](https://github.com/getsentry/sentry-react-native/pull/3273))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2207)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.20.5...2.20.7)
- Bump Cocoa SDK from v8.10.0 to v8.11.0 ([#3245](https://github.com/getsentry/sentry-react-native/pull/3245))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#8110)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.10.0...8.11.0)
- Bump JavaScript SDK from v7.63.0 to v7.69.0 ([#3277](https://github.com/getsentry/sentry-react-native/pull/3277), [#3247](https://github.com/getsentry/sentry-react-native/pull/3247))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7690)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.63.0...7.69.0)
- Bump Android SDK from v6.28.0 to v6.29.0 ([#3271](https://github.com/getsentry/sentry-react-native/pull/3271))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6290)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.28.0...6.29.0)

## 5.9.1

- Bump Cocoa SDK from v8.9.4 to v8.10.0 ([#3250](https://github.com/getsentry/sentry-react-native/pull/3250))
  - This fixes a compile error for projects that use CocoaPods with `use_frameworks!` option.
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#8100)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.9.4...8.10.0)

## 5.9.0

## Important Note

**Do not use this version** if you use CocoaPods with `use_frameworks!` option. It introduces a bug where the project won't compile.
This has been fixed in [version `5.9.1`](https://github.com/getsentry/sentry-react-native/releases/tag/5.9.1).

### Features

- Add support for React Native mixed stacktraces ([#3201](https://github.com/getsentry/sentry-react-native/pull/3201))

  In the current `react-native@nightly` (`0.73.0-nightly-20230809-cb60e5c67`) JS errors from native modules can
  contain native JVM or Objective-C exception stack trace. Both JS and native stack trace
  are processed by default no configuration needed.

- Add `tracePropagationTargets` option ([#3230](https://github.com/getsentry/sentry-react-native/pull/3230))

  This release adds support for [distributed tracing](https://docs.sentry.io/platforms/react-native/usage/distributed-tracing/)
  without requiring performance monitoring to be active on the React Native SDK.
  This means even if there is no sampled transaction/span, the SDK will still propagate traces to downstream services.
  Distributed Tracing can be configured with the `tracePropagationTargets` option,
  which controls what requests to attach the `sentry-trace` and `baggage` HTTP headers to (which is what propagates tracing information).

  ```javascript
    Sentry.init({
      tracePropagationTargets: ["third-party-site.com", /^https:\/\/yourserver\.io\/api/],
    });
  ```

### Fixes

- `Sentry.init` must be called before `Sentry.wrap`([#3227](https://github.com/getsentry/sentry-react-native/pull/3227))
  - The SDK now shows warning if incorrect order is detected
- Stall Time is no longer counted when App is in Background. ([#3211](https://github.com/getsentry/sentry-react-native/pull/3211))
- Use application variant instead of variant output to hook to correct package task for modules cleanup ([#3161](https://github.com/getsentry/sentry-react-native/pull/3161))
- Fix `isNativeAvailable` after SDK reinitialization ([#3200](https://github.com/getsentry/sentry-react-native/pull/3200))

### Dependencies

- Bump Android SDK from v6.27.0 to v6.28.0 ([#3192](https://github.com/getsentry/sentry-react-native/pull/3192))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6280)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.27.0...6.28.0)
- Bump Cocoa SDK from v8.9.3 to v8.9.4 ([#3225](https://github.com/getsentry/sentry-react-native/pull/3225))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#894)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.9.3...8.9.4)
- Bump JavaScript SDK from v7.61.0 to v7.63.0 ([#3226](https://github.com/getsentry/sentry-react-native/pull/3226), [#3235](https://github.com/getsentry/sentry-react-native/pull/3235))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7630)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.61.0...7.63.0)
- Bump CLI from v2.19.4 to v2.20.5 ([#3212](https://github.com/getsentry/sentry-react-native/pull/3212), [#3233](https://github.com/getsentry/sentry-react-native/pull/3233))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2205)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.19.4...2.20.5)

## 5.8.1

### Dependencies

- Bump JavaScript SDK from v7.60.1 to v7.61.0 ([#3222](https://github.com/getsentry/sentry-react-native/pull/3222))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7610)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.60.1...7.61.0)

## 5.8.0

### Features

- Alpha support for Hermes JavaScript Profiling ([#3057](https://github.com/getsentry/sentry-react-native/pull/3057))

  Profiling is disabled by default. To enable it, configure both
  `tracesSampleRate` and `profilesSampleRate` when initializing the SDK:

  ```javascript
    Sentry.init({
      dsn: '__DSN__',
      tracesSampleRate: 1.0,
      _experiments: {
        // The sampling rate for profiling is relative to TracesSampleRate.
        // In this case, we'll capture profiles for 100% of transactions.
        profilesSampleRate: 1.0,
      },
    });
  ```

  More documentation on profiling and current limitations [can be found here](https://docs.sentry.io/platforms/react-native/profiling/).

### Fixes

- Warn users about multiple versions of `promise` package which can cause unexpected behavior like undefined `Promise.allSettled` ([#3162](https://github.com/getsentry/sentry-react-native/pull/3162))
- Event is enriched with all the Android context on the JS layer and you can filter/modify all the data in the `beforeSend` callback similarly to iOS. ([#3170](https://github.com/getsentry/sentry-react-native/pull/3170))

### Dependencies

- Bump JavaScript SDK from v7.57.0 to v7.60.1 ([#3184](https://github.com/getsentry/sentry-react-native/pull/3184), [#3199](https://github.com/getsentry/sentry-react-native/pull/3199))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7601)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.57.0...7.60.1)
- Bump Cocoa SDK from v8.8.0 to v8.9.3 ([#3188](https://github.com/getsentry/sentry-react-native/pull/3188), [#3206](https://github.com/getsentry/sentry-react-native/pull/3206))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#893)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.8.0...8.9.3)
- Bump Android SDK from v6.25.1 to v6.27.0 ([#3170](https://github.com/getsentry/sentry-react-native/pull/3170))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6270)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.25.1...6.27.0)

## 5.7.1

### Dependencies

- Bump Android SDK from v6.25.0 to v6.25.1 ([#3179](https://github.com/getsentry/sentry-react-native/pull/3179))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6251)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.25.0...6.25.1)

## 5.7.0

### Fixes

- Filter beforeSendTransaction from the Native SDK ([#3140](https://github.com/getsentry/sentry-react-native/pull/3140))

### Features

- Use `android.namespace` for AGP 8 and RN 0.73 ([#3133](https://github.com/getsentry/sentry-react-native/pull/3133))

### Dependencies

- Bump JavaScript SDK from v7.54.0 to v7.57.0 ([#3119](https://github.com/getsentry/sentry-react-native/pull/3119), [#3153](https://github.com/getsentry/sentry-react-native/pull/3153))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7570)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.54.0...7.57.0)
- Bump CLI from v2.18.1 to v2.19.4 ([#3124](https://github.com/getsentry/sentry-react-native/pull/3124), [#3151](https://github.com/getsentry/sentry-react-native/pull/3151))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2194)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.18.1...2.19.4)
- Bump Android SDK from v6.22.0 to v6.25.0 ([#3127](https://github.com/getsentry/sentry-react-native/pull/3127), [#3163](https://github.com/getsentry/sentry-react-native/pull/3163))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6250)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.22.0...6.25.0)
- Bump Cocoa SDK from v8.7.3 to v8.8.0 ([#3123](https://github.com/getsentry/sentry-react-native/pull/3123))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#880)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.7.3...8.8.0)

## 5.6.0

### Features

- Overwrite Expo bundle names in stack frames ([#3115](https://github.com/getsentry/sentry-react-native/pull/3115))
  - This enables source maps to resolve correctly without using `sentry-expo` package

### Fixes

- Disable `enableNative` if Native SDK is not available ([#3099](https://github.com/getsentry/sentry-react-native/pull/3099))
- Dynamically resolve `collectModulesScript` path to support monorepos ([#3092](https://github.com/getsentry/sentry-react-native/pull/3092))
- Native wrapper methods don't throw disabled error after re-initializing ([#3093](https://github.com/getsentry/sentry-react-native/pull/3093))

### Dependencies

- Bump JavaScript SDK from v7.52.0 to v7.54.0 ([#3071](https://github.com/getsentry/sentry-react-native/pull/3071), [#3088](https://github.com/getsentry/sentry-react-native/pull/3088), [#3094](https://github.com/getsentry/sentry-react-native/pull/3094))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7540)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.52.0...7.54.0)
- Bump Android SDK from v6.18.1 to v6.22.0 ([#3086](https://github.com/getsentry/sentry-react-native/pull/3086), [#3075](https://github.com/getsentry/sentry-react-native/pull/3075))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6220)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.18.1...6.22.0)
- Bump Cocoa SDK from v8.7.1 to v8.7.3 ([#3076](https://github.com/getsentry/sentry-react-native/pull/3076))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#873)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.7.1...8.7.3)
- Bump CLI from v2.17.5 to v2.18.1 ([#3082](https://github.com/getsentry/sentry-react-native/pull/3082))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2181)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.17.5...2.18.1)

## 5.5.0

### Features

- Add `expo`, `react_native_version` and `hermes_version` to React Native Context ([#3050](https://github.com/getsentry/sentry-react-native/pull/3050))

### Dependencies

- Bump JavaScript SDK from v7.51.1 to v7.52.0 ([#3054](https://github.com/getsentry/sentry-react-native/pull/3054), [#3068](https://github.com/getsentry/sentry-react-native/pull/3068))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7520)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.51.1...7.52.0)
- Bump Cocoa SDK from v8.6.0 to v8.7.1 ([#3056](https://github.com/getsentry/sentry-react-native/pull/3056), [#3067](https://github.com/getsentry/sentry-react-native/pull/3067))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#871)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.6.0...8.7.1)

## 5.4.2

### Fixes

- Fix `event.origin` and `event.environment` on unhandled exception ([#3041](https://github.com/getsentry/sentry-react-native/pull/3041))
- Don't pass `enableTracing` from RN to `sentry-cocoa` options ([#3042](https://github.com/getsentry/sentry-react-native/pull/3042))
- Only store envelopes of fatal crashes on iOS ([#3051](https://github.com/getsentry/sentry-react-native/pull/3051))

### Dependencies

- Bump JavaScript SDK from v7.50.0 to v7.51.1 ([#3043](https://github.com/getsentry/sentry-react-native/pull/3043), [#3053](https://github.com/getsentry/sentry-react-native/pull/3053))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7511)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.50.0...7.51.1)

## 4.15.2

- Only store envelopes of fatal crashes on iOS ([#3051](https://github.com/getsentry/sentry-react-native/pull/3051))

## 5.4.1

### Fixes

- Store envelopes immediately during a fatal crash on iOS ([#3031](https://github.com/getsentry/sentry-react-native/pull/3031))
- Do not overwrite `_metadata` option by default `sdkInfo` ([#3036](https://github.com/getsentry/sentry-react-native/pull/3036))

### Dependencies

- Bump JavaScript SDK from v7.49.0 to v7.50.0 ([#3035](https://github.com/getsentry/sentry-react-native/pull/3035))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7500)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.49.0...7.50.0)
- Bump Cocoa SDK from v8.5.0 to v8.6.0 ([#3023](https://github.com/getsentry/sentry-react-native/pull/3023))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#860)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.5.0...8.6.0)
- Bump Android SDK from v6.17.0 to v6.18.1 ([#3017](https://github.com/getsentry/sentry-react-native/pull/3017))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6181)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.17.0...6.18.1)
- Bump CLI from v2.17.4 to v2.17.5 ([#3024](https://github.com/getsentry/sentry-react-native/pull/3024))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2175)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.17.4...2.17.5)

## 4.15.1

### Fixes

- Store envelopes immediately during a fatal crash on iOS ([#3030](https://github.com/getsentry/sentry-react-native/pull/3030))

## 5.4.0

### Features
- Add TS 4.1 typings ([#2995](https://github.com/getsentry/sentry-react-native/pull/2995))
  - TS 3.8 are present and work automatically with older projects
- Add CPU Info to Device Context ([#2984](https://github.com/getsentry/sentry-react-native/pull/2984))

### Fixes

- Allow disabling native on RNNA ([#2978](https://github.com/getsentry/sentry-react-native/pull/2978))
- iOS Autolinking for RN 0.68 and older ([#2980](https://github.com/getsentry/sentry-react-native/pull/2980))
- Clean up `modules.json` when building bundles ([#3008](https://github.com/getsentry/sentry-react-native/pull/3008))
- Only include Screenshots and View Hierarchy for iOS and Mac Catalyst builds ([#3007](https://github.com/getsentry/sentry-react-native/pull/3007))
- Breadcrumbs from Native SDKs are created with timestamps in seconds ([#2997](https://github.com/getsentry/sentry-react-native/pull/2997))
- `addBreadcrumb` converts converts non object data to `{ value: data }` ([#2997](https://github.com/getsentry/sentry-react-native/pull/2997))

### Dependencies

- Bump JavaScript SDK from v7.47.0 to v7.49.0 ([#2975](https://github.com/getsentry/sentry-react-native/pull/2975), [#2988](https://github.com/getsentry/sentry-react-native/pull/2988))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7490)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.47.0...7.49.0)
- Bump Cocoa SDK from v8.4.0 to v8.5.0 ([#2977](https://github.com/getsentry/sentry-react-native/pull/2977))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#850)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.4.0...8.5.0)
- Bump CLI from v2.17.1 to v2.17.4 ([#2966](https://github.com/getsentry/sentry-react-native/pull/2966), [#2982](https://github.com/getsentry/sentry-react-native/pull/2982), [#2987](https://github.com/getsentry/sentry-react-native/pull/2987))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2174)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.17.1...2.17.4)

## 5.3.1

### Fixes

- Disable `enableNativeCrashHandling` and `enableAutoPerformanceTracing` on Apple ([#2936](https://github.com/getsentry/sentry-react-native/pull/))
  - Mac Catalyst builds successfully
- `sentry.gradle` Gracefully skip modules collecting if the script doesn't exist ([#2952](https://github.com/getsentry/sentry-react-native/pull/2952))

### Dependencies

- Bump JavaScript SDK from v7.45.0 to v7.47.0 ([#2946](https://github.com/getsentry/sentry-react-native/pull/2946), [#2958](https://github.com/getsentry/sentry-react-native/pull/2958))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7470)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.45.0...7.47.0)
- Bump Android SDK from v6.16.0 to v6.17.0 ([#2948](https://github.com/getsentry/sentry-react-native/pull/2948))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6170)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.16.0...6.17.0)
- Bump Cocoa SDK from v8.3.3 to v8.4.0 ([#2954](https://github.com/getsentry/sentry-react-native/pull/2954))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#840)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.3.3...8.4.0)
- Bump CLI from v2.16.1 to v2.17.1 ([#2957](https://github.com/getsentry/sentry-react-native/pull/2957), [#2964](https://github.com/getsentry/sentry-react-native/pull/2964))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2171)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.16.1...2.17.1)

## 5.3.0

### Features

- Add `enableTracing` option ([#2933](https://github.com/getsentry/sentry-react-native/pull/2933))
- Add Tabs auto instrumentation for React Native Navigation ([#2932](https://github.com/getsentry/sentry-react-native/pull/2932))
  - This is enabled by default, if you want to disable tabs instrumentation see the example below.

```js
const routingInstrumentation = new Sentry.ReactNativeNavigationInstrumentation(Navigation, { enableTabsInstrumentation: false })
```

### Fixes

- Disable HTTP Client Errors by default on all platform ([#2931](https://github.com/getsentry/sentry-react-native/pull/2931))
  - See [HttpClient](https://docs.sentry.io/platforms/javascript/configuration/integrations/plugin/#httpclient) for configuration details.
  - Use `enableCaptureFailedRequests` to enable the feature.

```js
Sentry.init({ enableCaptureFailedRequests: true })
```

### Dependencies

- Bump JavaScript SDK from v7.44.2 to v7.45.0 ([#2927](https://github.com/getsentry/sentry-react-native/pull/2927))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7450)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.44.2...7.45.0)
- Bump CLI from v2.15.2 to v2.16.1 ([#2926](https://github.com/getsentry/sentry-react-native/pull/2926))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2161)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.15.2...2.16.1)
- Bump Cocoa SDK from v8.3.2 to v8.3.3 ([#2925](https://github.com/getsentry/sentry-react-native/pull/2925))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#833)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.3.2...8.3.3)

## 5.2.0

### Features

- Add User Interaction Tracing for Touch events ([#2835](https://github.com/getsentry/sentry-react-native/pull/2835))
- Add Gesture Tracing for React Native Gesture Handler API v2 ([#2865](https://github.com/getsentry/sentry-react-native/pull/2865))

### Fixes

- Fix use Fetch transport when option `enableNative` is `false` ([#2897](https://github.com/getsentry/sentry-react-native/pull/2897))
- Improve logs when `enableNative` is `false` ([#2897](https://github.com/getsentry/sentry-react-native/pull/2897))

### Dependencies

- Bump JavaScript SDK from v7.40.0 to v7.44.2 ([#2874](https://github.com/getsentry/sentry-react-native/pull/2874), [#2908](https://github.com/getsentry/sentry-react-native/pull/2908), [#2909](https://github.com/getsentry/sentry-react-native/pull/2909))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7442)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.40.0...7.44.2)
- Bump Android SDK from v6.15.0 to v6.16.0 ([#2903](https://github.com/getsentry/sentry-react-native/pull/2903))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6160)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.15.0...6.16.0)
- Bump Cocoa SDK from v8.3.0 to v8.3.2 ([#2895](https://github.com/getsentry/sentry-react-native/pull/2895))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#832)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.3.0...8.3.2)
- Bump CLI from v2.14.4 to v2.15.2 ([#2898](https://github.com/getsentry/sentry-react-native/pull/2898))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2152)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.14.4...2.15.2)

## 5.1.1

### Fixes

- Remove non URL `frame.abs_path` which was causing source maps to fail ([#2891](https://github.com/getsentry/sentry-react-native/pull/2891))

### Dependencies

- Bump Cocoa SDK from v8.2.0 to v8.3.0 ([#2876](https://github.com/getsentry/sentry-react-native/pull/2876))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#830)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.2.0...8.3.0)
- Bump CLI from v2.14.3 to v2.14.4 ([#2873](https://github.com/getsentry/sentry-react-native/pull/2873))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2144)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.14.3...2.14.4)

## 5.1.0

### Features

- Add App Context `in_foreground` ([#2826](https://github.com/getsentry/sentry-react-native/pull/2826))

### Fixes

- Match app start measurements naming with other SDKs ([#2855](https://github.com/getsentry/sentry-react-native/pull/2855))
  - `app.start.cold` to `app_start_cold`
  - `app.start.warm` to `app_start_warm`

### Dependencies

- Bump Cocoa SDK from v8.0.0 to v8.2.0 ([#2776](https://github.com/getsentry/sentry-react-native/pull/2776))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#820)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/8.0.0...8.2.0)
- Bump JavaScript SDK from v7.37.2 to v7.40.0 ([#2836](https://github.com/getsentry/sentry-react-native/pull/2836), [#2864](https://github.com/getsentry/sentry-react-native/pull/2864))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/develop/CHANGELOG.md#7400)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.37.2...7.40.0)
- Bump CLI from v2.10.0 to v2.14.3 ([#2848](https://github.com/getsentry/sentry-react-native/pull/2848), [#2869](https://github.com/getsentry/sentry-react-native/pull/2869))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2143)
  - [diff](https://github.com/getsentry/sentry-cli/compare/2.10.0...2.14.3)
- Bump Android SDK from v6.14.0 to v6.15.0 ([#2868](https://github.com/getsentry/sentry-react-native/pull/2868))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6150)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.14.0...6.15.0)

## 5.0.0

The React Native SDK version 5 supports both Legacy (from RN 0.65 and above) and New Architecture (from RN 0.69 and above) as well as the new React Native Gradle Plugin (introduced in RN 0.71). For detailed [migration guide visit our docs](https://docs.sentry.io/platforms/react-native/migration/#from-4x-to-5x).

### Features

- Add support for the RN New Architecture, backwards compatible RNSentry Turbo Module ([#2522](https://github.com/getsentry/sentry-react-native/pull/2522))
- Add View Hierarchy to the crashed/errored events ([#2708](https://github.com/getsentry/sentry-react-native/pull/2708))
- Send react native js engine, turbo module, fabric flags and component stack in Event contexts ([#2552](https://github.com/getsentry/sentry-react-native/pull/2552))
- Sync `tags`, `extra`, `fingerprint`, `level`, `environment` and `breadcrumbs` from `sentry-cocoa` during event processing. ([#2713](https://github.com/getsentry/sentry-react-native/pull/2713))
  - `breadcrumb.level` value `log` is transformed to `debug` when syncing with native layers.
  - Remove `breadcrumb.level` value `critical` transformation to `fatal`.
  - Default `breadcrumb.level` is `info`

### Breaking changes

- Option `enableAutoPerformanceTracking` renamed to `enableAutoPerformanceTracing`
- Option `enableOutOfMemoryTracking` renamed to `enableWatchdogTerminationTracking`
- Remove link hooks (RN 0.68 and older) ([#2332](https://github.com/getsentry/sentry-react-native/pull/2332))
- iOS min target 11, Android API min 21, min React Native version 0.65 ([#2522](https://github.com/getsentry/sentry-react-native/pull/2522), [#2687](https://github.com/getsentry/sentry-react-native/pull/2687))
- New ReactNativeTracingOptions ([#2481](https://github.com/getsentry/sentry-react-native/pull/2481))
  - `idleTimeout` renamed to `idleTimeoutMs`
  - `maxTransactionDuration` renamed to `finalTimeoutMs`
- `touchEventBoundaryProps.labelName` property instead of default `accessibilityLabel` fallback ([#2712](https://github.com/getsentry/sentry-react-native/pull/2712))
- Message event current stack trace moved from `exception` to `threads` ([#2694](https://github.com/getsentry/sentry-react-native/pull/2694))

### Fixes

- Unreachable fallback to fetch transport if native is not available ([#2695](https://github.com/getsentry/sentry-react-native/pull/2695))

### Dependencies

- Bump Cocoa SDK from v7.31.5 to v8.0.0 ([#2756](https://github.com/getsentry/sentry-react-native/pull/2756))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#800)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.31.5...8.0.0)
- Bump CLI from v1.74.4 to v2.10.0 ([#2669](https://github.com/getsentry/sentry-react-native/pull/2669))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2100)
  - [diff](https://github.com/getsentry/sentry-cli/compare/1.74.4...2.10.0)

## 4.15.0

### Features

- Collect modules script for XCode builds supports NODE_BINARY to set path to node executable ([#2805](https://github.com/getsentry/sentry-react-native/pull/2805))

### Fixes

- React Native Error Handlers Integration doesn't crash if ErrorUtils are not available ([#2808](https://github.com/getsentry/sentry-react-native/pull/2808))

### Dependencies

- Bump Android SDK from v6.12.1 to v6.14.0 ([#2790](https://github.com/getsentry/sentry-react-native/pull/2790), [#2809](https://github.com/getsentry/sentry-react-native/pull/2809), [#2828](https://github.com/getsentry/sentry-react-native/pull/2828))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6140)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.12.1...6.14.0)
- Bump Sample React Native from v0.71.0 to v0.71.1 ([#2767](https://github.com/getsentry/sentry-react-native/pull/2767))
  - [changelog](https://github.com/facebook/react-native/blob/main/CHANGELOG.md#v0711)
  - [diff](https://github.com/facebook/react-native/compare/v0.71.0...v0.71.1)
- Bump JavaScript SDK from v7.32.1 to v7.37.2 ([#2785](https://github.com/getsentry/sentry-react-native/pull/2785), [#2799](https://github.com/getsentry/sentry-react-native/pull/2799), [#2818](https://github.com/getsentry/sentry-react-native/pull/2818))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7372)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.32.1...7.37.2)

## 5.0.0-rc.1

### Fixes

- React Native Error Handlers Integration doesn't crash if ErrorUtils are not available ([#2808](https://github.com/getsentry/sentry-react-native/pull/2808))

## 5.0.0-beta.2

### Features

- Add View Hierarchy to the crashed/errored events ([#2708](https://github.com/getsentry/sentry-react-native/pull/2708))
- Collect modules script for XCode builds supports NODE_BINARY to set path to node executable ([#2805](https://github.com/getsentry/sentry-react-native/pull/2805))

### Dependencies

- Bump Android SDK from v6.12.1 to v6.14.0 ([#2790](https://github.com/getsentry/sentry-react-native/pull/2790), [#2809](https://github.com/getsentry/sentry-react-native/pull/2809), [#2828](https://github.com/getsentry/sentry-react-native/pull/2828))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6140)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.12.1...6.14.0)
- Bump Sample React Native from v0.71.0 to v0.71.1 ([#2767](https://github.com/getsentry/sentry-react-native/pull/2767))
  - [changelog](https://github.com/facebook/react-native/blob/main/CHANGELOG.md#v0711)
  - [diff](https://github.com/facebook/react-native/compare/v0.71.0...v0.71.1)
- Bump JavaScript SDK from v7.32.1 to v7.37.2 ([#2785](https://github.com/getsentry/sentry-react-native/pull/2785), [#2799](https://github.com/getsentry/sentry-react-native/pull/2799), [#2818](https://github.com/getsentry/sentry-react-native/pull/2818))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7372)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.32.1...7.37.2)

## 5.0.0-beta.1

- Latest changes from 4.14.0

### Breaking changes

- Option `enableAutoPerformanceTracking` renamed to `enableAutoPerformanceTracing`
- Option `enableOutOfMemoryTracking` renamed to `enableWatchdogTerminationTracking`

### Features

- Sync `tags`, `extra`, `fingerprint`, `level`, `environment` and `breadcrumbs` from `sentry-cocoa` during event processing. ([#2713](https://github.com/getsentry/sentry-react-native/pull/2713))
  - `breadcrumb.level` value `log` is transformed to `debug` when syncing with native layers.
  - Remove `breadcrumb.level` value `critical` transformation to `fatal`.
  - Default `breadcrumb.level` is `info`

### Dependencies

- Bump Cocoa SDK from v7.31.5 to v8.0.0 ([#2756](https://github.com/getsentry/sentry-react-native/pull/2756))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/main/CHANGELOG.md#800)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.31.5...8.0.0)
- Bump Android SDK from v6.12.1 to v6.13.0 ([#2790](https://github.com/getsentry/sentry-react-native/pull/2790))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6130)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.12.1...6.13.0)

## 4.14.0

### Features

- Add support for RNGP introduced in React Native 0.71.0 ([#2759](https://github.com/getsentry/sentry-react-native/pull/2759))

### Fixes

- Take screenshot runs on UI thread on Android ([#2743](https://github.com/getsentry/sentry-react-native/pull/2743))

### Dependencies

- Bump Android SDK from v6.11.0 to v6.12.1 ([#2755](https://github.com/getsentry/sentry-react-native/pull/2755))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6121)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.11.0...6.12.1)
- Bump JavaScript SDK from v7.29.0 to v7.32.1 ([#2738](https://github.com/getsentry/sentry-react-native/pull/2738), [#2777](https://github.com/getsentry/sentry-react-native/pull/2777))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7321)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.29.0...7.32.1)

## 5.0.0-alpha.11

- Latest changes from 4.13.0

### Breaking changes

- Message event current stack trace moved from exception to threads ([#2694](https://github.com/getsentry/sentry-react-native/pull/2694))
- `touchEventBoundaryProps.labelName` property instead of default `accessibilityLabel` fallback ([#2712](https://github.com/getsentry/sentry-react-native/pull/2712))

### Fixes

- Unreachable fallback to fetch transport if native is not available ([#2695](https://github.com/getsentry/sentry-react-native/pull/2695))

## 4.13.0

### Fixes

- Missing `originalException` in `beforeSend` for events from react native error handler ([#2706](https://github.com/getsentry/sentry-react-native/pull/2706))
- ModulesLoader integration returns original event if native is not available and event modules overwrite native modules ([#2730](https://github.com/getsentry/sentry-react-native/pull/2730))

### Dependencies

- Bump Cocoa SDK from v7.31.3 to v7.31.5 ([#2699](https://github.com/getsentry/sentry-react-native/pull/2699), [#2714](https://github.com/getsentry/sentry-react-native/pull/2714))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/8.0.0/CHANGELOG.md#7315)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.31.3...7.31.5)
- Bump JavaScript SDK from v7.26.0 to v7.29.0 ([#2705](https://github.com/getsentry/sentry-react-native/pull/2705), [#2709](https://github.com/getsentry/sentry-react-native/pull/2709), [#2715](https://github.com/getsentry/sentry-react-native/pull/2715), [#2736](https://github.com/getsentry/sentry-react-native/pull/2736))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7290)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.26.0...7.29.0)
- Bump Android SDK from v6.9.2 to v6.11.0 ([#2704](https://github.com/getsentry/sentry-react-native/pull/2704), [#2724](https://github.com/getsentry/sentry-react-native/pull/2724))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#6110)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.9.2...6.11.0)

## 4.12.0

### Features

- Add `lastEventId` method to the API ([#2675](https://github.com/getsentry/sentry-react-native/pull/2675))

### Fix

- `Sentry.startTransaction` doesn't require `op` ([#2691](https://github.com/getsentry/sentry-react-native/pull/2691))

### Dependencies

- Bump Cocoa SDK from v7.31.2 to v7.31.3 ([#2647](https://github.com/getsentry/sentry-react-native/pull/2647))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/8.0.0/CHANGELOG.md#7313)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.31.2...7.31.3)
- Bump JavaScript SDK from v7.21.1 to v7.26.0 ([#2672](https://github.com/getsentry/sentry-react-native/pull/2672), [#2648](https://github.com/getsentry/sentry-react-native/pull/2648), [#2692](https://github.com/getsentry/sentry-react-native/pull/2692))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7260)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.21.1...7.26.0)
- Bump Android SDK from v6.9.1 to v6.9.2 ([#2677](https://github.com/getsentry/sentry-react-native/pull/2677))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#692)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.9.1...6.9.2)

## 5.0.0-alpha.10

- Latest changes from 4.11.0

### Dependencies

- Bump CLI from v1.74.4 to v2.10.0 ([#2669](https://github.com/getsentry/sentry-react-native/pull/2669))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#2100)
  - [diff](https://github.com/getsentry/sentry-cli/compare/1.74.4...2.10.0)

## 4.11.0

### Features

- Screenshots ([#2610](https://github.com/getsentry/sentry-react-native/pull/2610))

## 4.10.1

### Fixes

- Bump Wizard from v1.2.17 to v1.4.0 ([#2645](https://github.com/getsentry/sentry-react-native/pull/2645))
  - [changelog](https://github.com/getsentry/sentry-wizard/blob/master/CHANGELOG.md#140)
  - [diff](https://github.com/getsentry/sentry-wizard/compare/v1.2.17...v1.4.0)
- Android builds without ext config, auto create assets dir for modules ([#2652](https://github.com/getsentry/sentry-react-native/pull/2652))
- Exit gracefully if source map file for collecting modules doesn't exist ([#2655](https://github.com/getsentry/sentry-react-native/pull/2655))
- Create only one clean-up tasks for modules collection ([#2657](https://github.com/getsentry/sentry-react-native/pull/2657))

### Dependencies

- Bump Android SDK from v6.8.0 to v6.9.1 ([#2653](https://github.com/getsentry/sentry-react-native/pull/2653))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#691)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.8.0...6.9.1)

## 5.0.0-alpha.9

- Latest changes from 4.10.0

### Fixes

- Add missing source Spec for RNSentry Codegen. ([#2639](https://github.com/getsentry/sentry-react-native/pull/2639))

## 4.10.0

### Features

- JS Runtime dependencies are sent in Events ([#2606](https://github.com/getsentry/sentry-react-native/pull/2606))
  - To collect JS dependencies on iOS add `../node_modules/@sentry/react-native/scripts/collect-modules.sh` at the end of the `Bundle React Native code and images` build phase. The collection only works on Release builds. Android builds have a new step in `sentry.gradle` plugin. More in [the migration documentation](https://docs.sentry.io/platforms/react-native/migration#from-48x-to-49x).

### Dependencies

- Bump JavaScript SDK from v7.20.1 to v7.21.1 ([#2636](https://github.com/getsentry/sentry-react-native/pull/2636))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7211)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.20.1...7.21.1)

## 5.0.0-alpha.8

- Latest changes from 4.9.0

## 4.9.0

### Features

- Add `maxQueueSize` option ([#2578](https://github.com/getsentry/sentry-react-native/pull/2578))

### Fixes

- Use `Scope` class rather than `Scope` type for top-level functions ([#2627](https://github.com/getsentry/sentry-react-native/pull/2627))

### Dependencies

- Bump JavaScript SDK from v7.16.0 to v7.20.1 ([#2582](https://github.com/getsentry/sentry-react-native/pull/2582), [#2598](https://github.com/getsentry/sentry-react-native/pull/2598), [#2632](https://github.com/getsentry/sentry-react-native/pull/2632), [#2607](https://github.com/getsentry/sentry-react-native/pull/2607))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7201)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.16.0...7.20.1)
- Bump Cocoa SDK from v7.29.0 to v7.31.2 ([#2592](https://github.com/getsentry/sentry-react-native/pull/2592), [#2601](https://github.com/getsentry/sentry-react-native/pull/2601), [#2629](https://github.com/getsentry/sentry-react-native/pull/2629))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7312)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.29.0...7.31.2)
- Bump Android SDK from v6.6.0 to v6.8.0 ([#2600](https://github.com/getsentry/sentry-react-native/pull/2600), [#2628](https://github.com/getsentry/sentry-react-native/pull/2628))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#680)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.6.0...6.8.0)

## 4.8.0

### Fixes

- Message event can have attached stacktrace ([#2577](https://github.com/getsentry/sentry-react-native/pull/2577))
- Fixed maximum call stack exceeded error resulting from large payloads ([#2579](https://github.com/getsentry/sentry-react-native/pull/2579))

### Dependencies

- Bump Android SDK from v6.5.0 to v6.6.0 ([#2572](https://github.com/getsentry/sentry-react-native/pull/2572))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#660)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.5.0...6.6.0)
- Bump Cocoa SDK from v7.28.0 to v7.29.0 ([#2571](https://github.com/getsentry/sentry-react-native/pull/2571))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7290)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.28.0...7.29.0)

## 5.0.0-alpha.7

- Latest changes from 4.7.1

### Fixes

- Remove hardcoded Folly version ([#2558](https://github.com/getsentry/sentry-react-native/pull/2558))

### Features

- Send react native js engine, turbo module, fabric flags and component stack in Event contexts ([#2552](https://github.com/getsentry/sentry-react-native/pull/2552))

### Dependencies

- Bump CLI from v1.74.4 to v2.7.0 ([#2457](https://github.com/getsentry/sentry-react-native/pull/2457))
  - [changelog](https://github.com/getsentry/sentry-cli/blob/master/CHANGELOG.md#270)
  - [diff](https://github.com/getsentry/sentry-cli/compare/1.74.4...2.7.0)
- Bump Android SDK from v6.5.0 to v6.6.0 ([#2572](https://github.com/getsentry/sentry-react-native/pull/2572))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#660)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.5.0...6.6.0)
- Bump Cocoa SDK from v7.28.0 to v7.29.0 ([#2571](https://github.com/getsentry/sentry-react-native/pull/2571))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7290)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.28.0...7.29.0)

## 4.7.1

### Fixes

- Remove duplicate sdk package record from envelope ([#2570](https://github.com/getsentry/sentry-react-native/pull/2570))
- Fix `appHangsTimeoutInterval` -> `appHangTimeoutInterval` option name ([#2574](https://github.com/getsentry/sentry-react-native/pull/2574))

## 4.7.0

### Dependencies

- Bump Android SDK from v6.4.3 to v6.5.0 ([#2535](https://github.com/getsentry/sentry-react-native/pull/2535))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#650)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.4.3...6.5.0)
- Bump JavaScript SDK from v7.14.2 to v7.16.0 ([#2536](https://github.com/getsentry/sentry-react-native/pull/2536), [#2561](https://github.com/getsentry/sentry-react-native/pull/2561))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7160)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.14.2...7.16.0)
- Bump Cocoa SDK from v7.27.1 to v7.28.0 ([#2548](https://github.com/getsentry/sentry-react-native/pull/2548))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7280)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.27.1...7.28.0)

## 5.0.0-alpha.6

- Latest changes from 4.6.1

### Features

- Add initial support for the RN New Architecture, backwards compatible RNSentry Turbo Module ([#2522](https://github.com/getsentry/sentry-react-native/pull/2522))

### Breaking changes

- New ReactNativeTracingOptions idleTimeoutMs and finalTimeoutMs replacing idleTimeout and maxTransactionDuration respectively ([#2481](https://github.com/getsentry/sentry-react-native/pull/2481))
- iOS min target 12.4, Android API min 21, min React Native version 0.70 ([#2522](https://github.com/getsentry/sentry-react-native/pull/2522))

### Dependencies

- Bump Android SDK from v6.4.3 to v6.5.0 ([#2535](https://github.com/getsentry/sentry-react-native/pull/2535))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#650)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.4.3...6.5.0)
- Bump JavaScript SDK from v7.14.2 to v7.15.0 ([#2536](https://github.com/getsentry/sentry-react-native/pull/2536))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7150)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.14.2...7.15.0)

## 4.6.1

### Fixes

- Make `configureScope` callback safe [#2510](https://github.com/getsentry/sentry-react-native/pull/2510)
- Allows collecting app start and slow/frozen frames if Native SDK is inited manually [#2517](https://github.com/getsentry/sentry-react-native/pull/2517)
- Nested breadcrumb data on android was not treated correctly [#2519](https://github.com/getsentry/sentry-react-native/pull/2519)

### Dependencies

- Bump JavaScript SDK from v7.14.0 to v7.14.2 ([#2511](https://github.com/getsentry/sentry-react-native/pull/2511), [#2526](https://github.com/getsentry/sentry-react-native/pull/2526))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7142)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.14.0...7.14.2)
- Bump Cocoa SDK from v7.27.0 to v7.27.1 ([#2521](https://github.com/getsentry/sentry-react-native/pull/2521))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7271)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.27.0...7.27.1)
- Bump Android SDK from v6.4.2 to v6.4.3 ([#2520](https://github.com/getsentry/sentry-react-native/pull/2520))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#643)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.4.2...6.4.3)

## 5.0.0-alpha.5

### Fixes

- Make `configureScope` callback safe [#2510](https://github.com/getsentry/sentry-react-native/pull/2510)

### Dependencies

- Bump JavaScript SDK from v7.14.0 to v7.14.1 ([#2511](https://github.com/getsentry/sentry-react-native/pull/2511))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7141)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.14.0...7.14.1)
- Bump Cocoa SDK from v7.27.0 to v7.27.1 ([#2521](https://github.com/getsentry/sentry-react-native/pull/2521))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7271)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.27.0...7.27.1)
- Bump Android SDK from v6.4.2 to v6.4.3 ([#2520](https://github.com/getsentry/sentry-react-native/pull/2520))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#643)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.4.2...6.4.3)

## 4.6.0

### Fixes

- SDK Gracefully downgrades when callback throws an error ([#2502](https://github.com/getsentry/sentry-react-native/pull/2502))
- React Navigation v5 ignores when current route is undefined after state changed. ([#2484](https://github.com/getsentry/sentry-react-native/pull/2484))

### Features

- Add ClientReports ([#2496](https://github.com/getsentry/sentry-react-native/pull/2496))

### Sentry Self-hosted Compatibility

- Starting with version `4.6.0` of the `@sentry/react-native` package, [Sentry's self hosted version >= v21.9.0](https://github.com/getsentry/self-hosted/releases) is required or you have to manually disable sending client reports via the `sendClientReports` option. This only applies to self-hosted Sentry. If you are using [sentry.io](https://sentry.io), no action is needed.

### Dependencies

- Bump Cocoa SDK from v7.25.1 to v7.27.0 ([#2500](https://github.com/getsentry/sentry-react-native/pull/2500), [#2506](https://github.com/getsentry/sentry-react-native/pull/2506))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7270)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.25.1...7.27.0)
- Bump JavaScript SDK from v7.13.0 to v7.14.0 ([#2504](https://github.com/getsentry/sentry-react-native/pull/2504))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7140)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.13.0...7.14.0)

## 5.0.0-alpha.4

- Latest changes from 4.5.0

### Breaking changes

- New ReactNativeTracingOptions idleTimeoutMs and finalTimeoutMs replacing idleTimeout and maxTransactionDuration respectively ([#2481](https://github.com/getsentry/sentry-react-native/pull/2481))

## 4.5.0

### Features

- Add user feedback ([#2486](https://github.com/getsentry/sentry-react-native/pull/2486))
- Add typings for app hang functionality ([#2479](https://github.com/getsentry/sentry-react-native/pull/2479))

### Fixes

- Update warm/cold start span ops ([#2487](https://github.com/getsentry/sentry-react-native/pull/2487))
- Detect hard crash the same as native sdks ([#2480](https://github.com/getsentry/sentry-react-native/pull/2480))
- Integrations factory receives default integrations ([#2494](https://github.com/getsentry/sentry-react-native/pull/2494))

### Dependencies

- Bump Android SDK from v6.4.1 to v6.4.2 ([#2485](https://github.com/getsentry/sentry-react-native/pull/2485))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#642)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.4.1...6.4.2)
- Bump JavaScript SDK from v7.12.1 to v7.13.0 ([#2478](https://github.com/getsentry/sentry-react-native/pull/2478))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7130)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.12.1...7.13.0)

## 4.4.0

### Features

- Add attachments support ([#2463](https://github.com/getsentry/sentry-react-native/pull/2463))

## 4.3.1

### Fixes

- ReactNativeTracingOptions maxTransactionDuration is in seconds ([#2469](https://github.com/getsentry/sentry-react-native/pull/2469))

### Dependencies

- Bump Cocoa SDK from v7.24.1 to v7.25.1 ([#2465](https://github.com/getsentry/sentry-react-native/pull/2465))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7251)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.24.1...7.25.1)

## 5.0.0-alpha.3

- Latest changes from 4.3.x

### Dependencies

- Bump Wizard from v2.0.0 to v2.2.0 ([#2460](https://github.com/getsentry/sentry-react-native/pull/2460))
  - [changelog](https://github.com/getsentry/sentry-wizard/blob/master/CHANGELOG.md#v220)
  - [diff](https://github.com/getsentry/sentry-wizard/compare/v2.0.0...v2.2.0)

## 4.3.0

### Features

- Add Transaction Source for Dynamic Sampling Context ([#2454](https://github.com/getsentry/sentry-react-native/pull/2454))

### Dependencies

- Bump Cocoa SDK from v7.23.0 to v7.24.1 ([#2456](https://github.com/getsentry/sentry-react-native/pull/2456))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7241)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.23.0...7.24.1)
- Bump Android SDK from v6.3.1 to v6.4.1 ([#2437](https://github.com/getsentry/sentry-react-native/pull/2437))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#641)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.3.1...6.4.1)
- Bump JavaScript SDK from v7.9.0 to v7.12.1 ([#2451](https://github.com/getsentry/sentry-react-native/pull/2451))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#7121)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.9.0...7.12.1)

## 4.2.4

### Fixes

- ReactNativeTracing wrongly marks transactions as deadline_exceeded when it reaches the idleTimeout ([#2427](https://github.com/getsentry/sentry-react-native/pull/2427))

## 5.0.0-alpha.2

- Latest changes from 4.2.x

## 5.0.0-alpha.1

### Fixes

- Auto linking for RN >= 0.69 ([#2332](https://github.com/getsentry/sentry-react-native/pull/2332))

## 4.2.3

### Fixes

- Bump Cocoa SDK to v7.23.0 ([#2401](https://github.com/getsentry/sentry-react-native/pull/2401))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7230)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.22.0...7.23.0)
- Bump Android SDK to v6.3.1 ([#2410](https://github.com/getsentry/sentry-react-native/pull/2410))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#631)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.3.0...6.3.1)
- Bump JavaScript SDK to v7.9.0 ([#2412](https://github.com/getsentry/sentry-react-native/pull/2412))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#790)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.7.0...7.9.0)

## 4.2.2

### Fixes

- Should not ignore `options.transport` function provided in `Sentry.init(...)` ([#2398](https://github.com/getsentry/sentry-react-native/pull/2398))

## 4.2.1

### Fixes

- SENTRY_DIST accepts non-number values on Android ([#2395](https://github.com/getsentry/sentry-react-native/pull/2395))

### Features

- Bump Cocoa SDK to v7.22.0 ([#2392](https://github.com/getsentry/sentry-react-native/pull/2392))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7220)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.21.0...7.22.0)

## 4.2.0

### Features

- Bump Cocoa SDK to v7.21.0 ([#2374](https://github.com/getsentry/sentry-react-native/pull/2374))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7210)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.20.0...7.21.0)
- Bump Android SDK to v6.3.0 ([#2380](https://github.com/getsentry/sentry-react-native/pull/2380))
  - [changelog](https://github.com/getsentry/sentry-java/blob/main/CHANGELOG.md#630)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.1.4...6.3.0)
- Bump JavaScript SDK to v7.7.0 ([#2375](https://github.com/getsentry/sentry-react-native/pull/2375))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#770)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.6.0...7.7.0)

## 4.1.3

### Fixes

- Solve reference to private cocoa SDK class ([#2369](https://github.com/getsentry/sentry-react-native/pull/2369))

## 4.1.2

### Fixes

- Set default unit for measurements ([#2360](https://github.com/getsentry/sentry-react-native/pull/2360))
- When using SENTRY_DIST env. var. on Android, SDK fails to convert to an Integer ([#2365](https://github.com/getsentry/sentry-react-native/pull/2365))

### Features

- Bump JavaScript SDK to v7.6.0 ([#2361](https://github.com/getsentry/sentry-react-native/pull/2361))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#760)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.5.1...7.6.0)

## 4.1.1

### Features

- Bump Cocoa SDK to v7.20.0 ([#2341](https://github.com/getsentry/sentry-react-native/pull/2341), [#2356](https://github.com/getsentry/sentry-react-native/pull/2356))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/master/CHANGELOG.md#7200)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.18.1...7.20.0)
- Bump JavaScript SDK to v7.5.1 ([#2342](https://github.com/getsentry/sentry-react-native/pull/2342), [#2350](https://github.com/getsentry/sentry-react-native/pull/2350))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/master/CHANGELOG.md#751)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.3.1...7.5.1)

## 4.1.0

- Fix: Send DidBecomeActiveNotification when OOM enabled ([#2326](https://github.com/getsentry/sentry-react-native/pull/2326))
- Fix: SDK overwrites the user defined ReactNativeTracing ([#2319](https://github.com/getsentry/sentry-react-native/pull/2319))
- Bump Sentry JavaScript 7.3.1 ([#2306](https://github.com/getsentry/sentry-react-native/pull/2306))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/7.3.1/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.1.1...7.3.1)
- Bump Sentry Cocoa 7.18.1 ([#2320](https://github.com/getsentry/sentry-react-native/pull/2320))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/7.18.1/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.18.0...7.18.1)
- Bump Sentry Android 6.1.4 ([#2320](https://github.com/getsentry/sentry-react-native/pull/2320))
  - [changelog](https://github.com/getsentry/sentry-java/blob/6.1.4/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.1.2...6.1.4)

## 4.0.2

- Fix Calculate the absolute number of Android versionCode ([#2313](https://github.com/getsentry/sentry-react-native/pull/2313))

## 4.0.1

- Filter out app start with more than 60s ([#2303](https://github.com/getsentry/sentry-react-native/pull/2303))

## 4.0.0

- Bump Sentry JavaScript 7.1.1 ([#2279](https://github.com/getsentry/sentry-react-native/pull/2279))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/7.1.1/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/6.19.2...7.1.1)
- Bump Sentry Cocoa 7.18.0 ([#2303](https://github.com/getsentry/sentry-react-native/pull/2303))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/7.18.0/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.11.0...7.18.0)
- Bump Sentry Android 6.1.2 ([#2303](https://github.com/getsentry/sentry-react-native/pull/2303))
  - [changelog](https://github.com/getsentry/sentry-java/blob/6.1.2/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-java/compare/5.7.0...6.1.2)

## Breaking changes

By bumping Sentry Javascript, new breaking changes were introduced, to know more what was changed, check the [breaking changes changelog](https://github.com/getsentry/sentry-javascript/blob/7.0.0/CHANGELOG.md#breaking-changes) from Sentry Javascript.

## 4.0.0-beta.5

- Fix warning missing DSN on BrowserClient. ([#2294](https://github.com/getsentry/sentry-react-native/pull/2294))

## 4.0.0-beta.4

- Bump Sentry Cocoa 7.17.0 ([#2300](https://github.com/getsentry/sentry-react-native/pull/2300))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/7.17.0/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.16.1...7.17.0)
- Bump Sentry Android 6.1.1 ([#2300](https://github.com/getsentry/sentry-react-native/pull/2300))
  - [changelog](https://github.com/getsentry/sentry-java/blob/6.1.1/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-java/compare/6.0.0...6.1.1)

## 4.0.0-beta.3

- Bump Sentry Cocoa 7.16.1 ([#2279](https://github.com/getsentry/sentry-react-native/pull/2283))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/7.16.1/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.11.0...7.16.1)

## 4.0.0-beta.2

- Bump Sentry JavaScript 7.1.1 ([#2279](https://github.com/getsentry/sentry-react-native/pull/2279))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/7.1.1/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/7.0.0...7.1.1)
- Bump Sentry Android 6.0.0 ([#2281](https://github.com/getsentry/sentry-react-native/pull/2281))
  - [changelog](https://github.com/getsentry/sentry-java/blob/6.0.0/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-java/compare/5.7.0...6.0.0)

## 4.0.0-beta.1

- Bump Sentry JavaScript 7.0.0 ([#2250](https://github.com/getsentry/sentry-react-native/pull/2250))
  - [changelog](https://github.com/getsentry/sentry-javascript/blob/7.0.0/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-javascript/compare/6.19.2...7.0.0)

## Breaking changes

By bumping Sentry Javascript, new breaking changes were introduced, to know more what was changed, check the [breaking changes changelog](https://github.com/getsentry/sentry-javascript/blob/7.0.0/CHANGELOG.md#breaking-changes) from Sentry Javascript.

## 3.4.3

- feat: Support macOS (#2240) by @ospfranco

## 3.4.2

- fix: Fix cold start appearing again after js bundle reload on Android. #2229

## 3.4.1

- fix: Make withTouchEventBoundary options optional #2196

## 3.4.0

### Various fixes & improvements

- Bump: @sentry/javascript dependencies to 6.19.2 (#2175) by @marandaneto

## 3.3.6

- fix: Respect given release if no dist is given during SDK init (#2163)
- Bump: @sentry/javascript dependencies to 6.19.2 (#2175)

## 3.3.5

- Bump: Sentry Cocoa to 7.11.0 and Sentry Android to 5.7.0 (#2160)

## 3.3.4

- fix(android): setContext serializes as context for Android instead of extra (#2155)
- fix(android): Duplicate Breadcrumbs when captuing messages #2153

## 3.3.3

- Bump: Sentry Cocoa to 7.10.2 and Sentry Android to 5.6.3 (#2145)
- fix(android): Upload source maps correctly regardless of version codes #2144

## 3.3.2

- fix: Do not report empty measurements #1983
- fix(iOS): Bump Sentry Cocoa to 7.10.1 and report slow and frozen measurements (#2132)
- fix(iOS): Missing userId on iOS when the user is not set in the Scope (#2133)

## 3.3.1

- feat: Support setting maxCacheItems #2102
- fix: Clear transaction on route change for React Native Navigation #2119

## 3.3.0

- feat: Support enableNativeCrashHandling for iOS #2101
- Bump: Sentry Cocoa 7.10.0 #2100
- feat: Touch events now track components with `sentry-label` prop, falls back to `accessibilityLabel` and then finally `displayName`. #2068
- fix: Respect sentryOption.debug setting instead of #DEBUG build flag for outputting logs #2039
- fix: Passing correct mutableOptions to iOS SDK (#2037)
- Bump: Bump @sentry/javascript dependencies to 6.17.9 #2082
- fix: Discard prior transactions on react navigation dispatch #2053

## 3.2.14-beta.2

- feat: Touch events now track components with `sentry-label` prop, falls back to `accessibilityLabel` and then finally `displayName`. #2068
- fix: Respect sentryOption.debug setting instead of #DEBUG build flag for outputting logs #2039
- fix: Passing correct mutableOptions to iOS SDK (#2037)
- Bump: Bump @sentry/javascript dependencies to 6.17.9 #2082

## 3.2.14-beta.1

- fix: Discard prior transactions on react navigation dispatch #2053

## 3.2.13

- fix(deps): Add `@sentry/wizard` back in as a dependency to avoid missing dependency when running react-native link. #2015
- Bump: sentry-cli to 1.72.0 #2016

## 3.2.12

- fix: fetchNativeDeviceContexts returns an empty Array if no Device Context available #2002
- Bump: Sentry Cocoa 7.9.0 #2011

## 3.2.11

- fix: Polyfill the promise library to permanently fix unhandled rejections #1984

## 3.2.10

- fix: Do not crash if androidx.core isn't available on Android #1981
- fix: App start measurement on Android #1985
- Bump: Sentry Android to 5.5.2 #1985

## 3.2.9

- Deprecate initialScope in favor of configureScope #1963
- Bump: Sentry Android to 5.5.1 and Sentry Cocoa to 7.7.0 #1965

## 3.2.8

### Various fixes & improvements

- replace usage of master to main (30b44232) by @marandaneto

## 3.2.7

- fix: ReactNavigationV4Instrumentation null when evaluating 'state.routes' #1940
- fix: ConcurrentModification exception for frameMetricsAggregator #1939

## 3.2.6

- feat(android): Support monorepo in gradle plugin #1917
- fix: Remove dependency on promiseRejectionTrackingOptions #1928

## 3.2.5

- fix: Fix dynamic require for promise options bypassing try catch block and crashing apps #1923

## 3.2.4

- fix: Warn when promise rejections won't be caught #1886
- Bump: Sentry Android to 5.4.3 and Sentry Cocoa to 7.5.4 #1920

## 3.2.3

### Various fixes & improvements

- fix(ios): tracesSampler becomes NSNull in iOS and the app cannot be started (#1872) by @marandaneto

## 3.2.2

- Bump Sentry Android SDK to 5.3.0 #1860

## 3.2.1

### Various fixes & improvements

- feat(ios): Missing config `enableOutOfMemoryTracking` on iOS/Mac (#1858) by @marandaneto

## 3.2.0

- feat: Routing instrumentation will emit breadcrumbs on route change and set route tag #1837
- Bump Sentry Android SDK to 5.2.4 ([#1844](https://github.com/getsentry/sentry-react-native/pull/1844))

  - [changelog](https://github.com/getsentry/sentry-java/blob/5.2.4/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-java/compare/5.2.0...5.2.4)

- Bump Sentry Cocoa SDK to 7.4.8 ([#1856](https://github.com/getsentry/sentry-react-native/pull/1856))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/7.4.8/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.3.0...7.4.8)

## 3.2.0-beta.2

- fix: Type React Native Navigation instrumentation constructor argument as unknown to avoid typescript errors #1817

## 3.2.0-beta.1

- feat: Routing instrumentation for React Native Navigation #1774

## 3.1.1

- Bump Sentry Android SDK to 5.2.0 ([#1785](https://github.com/getsentry/sentry-react-native/pull/1785))

  - [changelog](https://github.com/getsentry/sentry-java/blob/5.2.0/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-java/compare/5.1.2...5.2.0)

- Bump Sentry Cocoa SDK to 7.3.0 ([#1785](https://github.com/getsentry/sentry-react-native/pull/1785))
  - [changelog](https://github.com/getsentry/sentry-cocoa/blob/7.3.0/CHANGELOG.md)
  - [diff](https://github.com/getsentry/sentry-cocoa/compare/7.2.6...7.3.0)

## 3.1.0

- Feat: Allow custom release for source map upload scripts #1548
- ref: Remove v5 prefix from react navigation instrumentation to support v6 #1768

## 3.0.3

- Fix: Set Java 8 for source and target compatibility if not using AGP >= 4.2.x (#1763)

## 3.0.2

- Bump: Android tooling API 30 (#1761)

## 3.0.1

- fix: Add sentry-cli as a dependency #1755

## 3.0.0

- feat: Align `event.origin`, `event.environment` with other hybrid sdks #1749
- feat: Add native sdk package info onto events #1749
- build(js): Bump sentry-javascript dependencies to 6.12.0 #1750
- fix: Fix native frames not being added to transactions #1752
- build(android): Bump sentry-android to 5.1.2 #1753
- build(ios): Bump sentry-cocoa to 7.2.6 #1753
- fix: Move @sentry/wizard dependency to devDependencies #1751

## 3.0.0-beta.3

- feat: Add `wrap` wrapper method with profiler and touch event boundary #1728
- feat: App-start measurements, if using the `wrap` wrapper, will now finish on the root component mount #1728

## 3.0.0-beta.2

- feat: Native slow/frozen frames measurements #1711

## 3.0.0-beta.1

- build(ios): Bump sentry-cocoa to 7.2.0-beta.9 #1704
- build(android): Bump sentry-android to 5.1.0-beta.9 #1704
- feat: Add app start measurements to the first transaction #1704
- feat: Create an initial initial ui.load transaction by default #1704
- feat: Add `enableAutoPerformanceTracking` flag that enables auto performance when tracing is enabled #1704

## 2.7.0-beta.1

- feat: Track stalls in the JavaScript event loop as measurements #1542

## 2.6.2

- fix: Fix the error handler (error dialog) not called in dev #1712

## 2.6.1

- build(ios): Bump sentry-cocoa to 7.1.4 #1700

## 2.6.0

- feat: Support the `sendDefaultPii` option. #1634
- build(android): Bump sentry-android to 5.1.0-beta.2 #1645
- fix: Fix transactions on Android having clock drift and missing span data #1645

## 2.5.2

- fix: Fix `Sentry.close()` not correctly resolving the promise on iOS. #1617
- build(js): Bump sentry-javascript dependencies to 6.7.1 #1618

## 2.5.1

- fix: Fatal uncaught events should be tagged handled:false #1597
- fix: Fix duplicate breadcrumbs on Android #1598

## 2.5.0

### Dependencies

- build(js): Bump sentry-javascript dependencies to 6.5.1 #1588
- build(ios): Bump sentry-cocoa to 7.0.0 and remove setLogLevel #1459
- build(android): Bump sentry-android to 5.0.1 #1576

### Features

- feat: `Sentry.flush()` to flush events to disk and returns a promise #1547
- feat: `Sentry.close()` method to fully disable the SDK on all layers and returns a promise #1457

### Fixes

- fix: Process "log" levels in breadcrumbs before sending to native #1565

## 2.5.0-beta.1

- build(ios): Bump sentry-cocoa to 7.0.0 and remove setLogLevel #1459
- feat: Close method to fully disable the SDK on all layers #1457
- build(android): Bump Android SDK to 5.0.0-beta.1 #1476

## 2.4.3

- fix: Use the latest outbox path from hub options instead of private options #1529

## 2.4.2

- fix: enableNative: false should take precedence over autoInitializeNativeSdk: false #1462

## 2.4.1

- fix: Type navigation container ref arguments as any to avoid TypeScript errors #1453

## 2.4.0

- fix: Don't call `NATIVE.fetchRelease` if release and dist already exists on the event #1388
- feat: Add onReady callback that gets called after Native SDK init is called #1406

## 2.3.0

- feat: Re-export Profiler and useProfiler from @sentry/react #1372
- fix(performance): Handle edge cases in React Navigation routing instrumentation. #1365
- build(android): Bump sentry-android to 4.3.0 #1373
- build(devtools): Bump @sentry/wizard to 1.2.2 #1383
- build(js): Bump sentry-javascript dependencies to 6.2.1 #1384
- feat(performance): Option to set route change timeout in routing instrumentation #1370

## 2.2.2

- fix: Fix unhandled promise rejections not being tracked #1367

## 2.2.1

- build(js): Bump @sentry/\* dependencies on javascript to 6.2.0 #1354
- fix: Fix react-dom dependency issue. #1354
- build(android): Bump sentry-android to 4.1.0 #1334

## 2.2.0

- Bump: sentry-android to v4.0.0 #1309
- build(ios): Bump sentry-cocoa to 6.1.4 #1308
- fix: Handle auto session tracking start on iOS #1308
- feat: Use beforeNavigate in routing instrumentation to match behavior on JS #1313
- fix: React Navigation Instrumentation starts initial transaction before navigator mount #1315

## 2.2.0-beta.0

- build(ios): Bump sentry-cocoa to 6.1.3 #1293
- fix: pass maxBreadcrumbs to Android init
- feat: Allow disabling native SDK initialization but still use it #1259
- ref: Rename shouldInitializeNativeSdk to autoInitializeNativeSdk #1275
- fix: Fix parseErrorStack that only takes string in DebugSymbolicator event processor #1274
- fix: Only set "event" type in envelope item and not the payload #1271
- build: Bump JS dependencies to 5.30.0 #1282
- fix: Add fallback envelope item type to iOS. #1283
- feat: Auto performance tracing with XHR/fetch, and routing instrumentation #1230

## 2.1.1

- build(android): Bump `sentry-android` to 3.2.1 #1296

## 2.1.0

- feat: Include @sentry/tracing and expose startTransaction #1167
- feat: A better sample app to showcase the SDK and especially tracing #1168
- build(js): Bump @sentry/javascript dependencies to 5.28.0. #1228
- build(android): Bump `sentry-android` to 3.2.0 #1208

## 2.0.2

- build(ios): Bump `sentry-cocoa` to 6.0.9 #1200

## 2.0.1

- build(ios): Bump `sentry-cocoa` to 6.0.8. #1188
- fix(ios): Remove private imports and call `storeEnvelope` on the client. #1188
- fix(ios): Lock specific version in podspec. #1188
- build(android): Bump `sentry-android` to 3.1.3. #1177
- build(deps): Bump @sentry/javascript deps to version-locked 5.27.4 #1199

## 2.0.0

- build(android): Changes android package name from `io.sentry.RNSentryPackage` to `io.sentry.react.RNSentryPackage` (Breaking). #1131
- fix: As auto session tracking is now on by default, allow user to pass `false` to disable it. #1131
- build: Bump `sentry-android` to 3.1.0. #1131
- build: Bump `sentry-cocoa` to 6.0.3. #1131
- feat(ios): Use `captureEnvelope` on iOS/Mac. #1131
- feat: Support envelopes with type other than `event`. #1131
- feat(android): Add enableNdkScopeSync property to ReactNativeOptions. #1131
- feat(android): Pass attachStacktrace option property down to android SDK. #1131
- build(js): Bump @sentry/javascript dependencies to 5.27.1. #1156

## 1.9.0

- fix: Only show the "Native Sentry SDK is disabled" warning when `enableNative` is false and `enableNativeNagger` is true. #1084
- build: Bump @sentry/javascript dependencies to 5.25.0. #1118

## 1.8.2

- build: Bump @sentry/javascript dependencies to 5.24.2 #1091
- fix: Add a check that `performance` exists before using it. #1091

## 1.8.1

- build: Bump @sentry/javascript dependencies to 5.24.1 #1088
- fix: Fix timestamp offset issues due to issues with `performance.now()` introduced in React Native 0.63. #1088

## 1.8.0

- feat: Support MacOS #1068
- build: Bump @sentry/javascript dependencies to 5.23.0 #1079
- fix: Only call native deviceContexts on iOS #1061
- fix: Don't send over Log and Critical levels over native bridge #1063

## 1.7.2

- meta: Move from Travis CI to Github Actions #1019
- ref: Drop TSLint in favor of ESLint #1023
- test: Add basic end-to-end tests workflow #945
- Bump: sentry-android to v2.3.1

## 1.7.1

- build: Bump sentry-cocoa to 5.2 #1011
- fix: App Store submission for Mac apps getsentry/sentry-cocoa#635
- fix: Use the release and dist set in init options over native release #1009
- fix: assign default options before enableNative check #1007

## 1.7.0

- fix: Use `LogBox` instead of `YellowBox` if possible. #989
- fix: Don't add `DeviceContext` default integration if `enableNative` is set to `false`. #993
- fix: Don't log "Native Sentry SDK is disabled" if `enableNativeNagger` is set to `false`. #993
- feat: Migrate to `@sentry/react` from `@sentry/browser` and expose `ErrorBoundary` & the redux enhancer. #1005

## 1.6.3

- feat: Touch events take Regex for ignoreNames & add tests #973

## 1.6.2

- fix: Don't prefix app:/// to "native" filename as well #957
- feat: Add sdk_info to envelope header on Android. #958

## 1.6.1

- Bump `sentry-cocoa` `5.1.8`

## 1.6.0

- feat: Log component tree with all touch events #952
- fix: Fix appending app:/// prefix to [native code] #946
- Bump `@sentry/*` to `^5.19.0`
- Bump `sentry-cocoa` `5.1.6`

## 1.5.0

- feat: Track touch events as breadcrumbs #939
- fix: Serialize the default user keys in setUser #926
- Bump android 2.2.0 #942
- fix(android): Fix unmapped context keys being overwritten on Android.

## 1.4.5

- fix: Fix Native Wrapper not checking enableNative setting #919

## 1.4.4

- Bump cocoa 5.1.4
- fix(ios): We only store the event in release mode #917

## 1.4.3

- Extend Scope methods to set native scope too. #902
- Bump android 2.1.6
- Bump `@sentry/*` to `^5.16.1`
- Bump cocoa 5.1.3

## 1.4.2

- Bump android 2.1.4 #891
- Expose session timeout. #887
- Added `event.origin` and `event.environment` tags to determine where events originate from. #890

## 1.4.1

- Filtered out `options` keys passed to `init` that would crash native. #885

## 1.4.0

- Remove usages of RNSentry to a native wrapper (#857)
- Bump android 2.1.3 (#858)
- Bump cocoa 5.1.0 (#870)
- Accept enableAutoSessionTracking (#870)
- Don't attach Android Threads (#866)
- Refactored startWithDsnString to be startWithOptions. (#860)

## 1.3.9

- Bump `@sentry/wizard` to `1.1.4`

## 1.3.8

- Fixes a bug in `DebugSymbolicator`

## 1.3.7

- Bump `@sentry/wizard` to `1.1.2`

## 1.3.6

- Bump `@sentry/*` to `^5.15.4`

## 1.3.5

- Bump `@sentry/*` to `^5.15.2`

## 1.3.4

- Bump `@sentry/*` to `^5.15.1`
- Fix a bug in DebugSymbolicator to fetch the correct file
- Bump to `io.sentry:sentry-android:2.0.2`

## 1.3.3

- Fix sourcemap path for Android and `react-native` version `< 0.61`
- Expose Android SDK in Java

## 1.3.2

- Bump `io.sentry:sentry-android:2.0.0`
- Fixes a bug on Android when sending events with wrong envelope size

## 1.3.1

- Bump `@sentry/wizard` to `1.1.1` fixing iOS release identifiers
- console.warn und unhandled rejections in DEV

## 1.3.0

- Bump `io.sentry:sentry-android:2.0.0-rc04`
- Added support for Hermes runtime!!
- Fixed a lot of issues on Android
- NDK support

## 1.2.2

- fix(android): Crash if stacktrace.frames is empty (#742)

## 1.2.1

- Bump `io.sentry:sentry-android:1.7.29`

## 1.2.0

- Bump `@sentry/*` to `^5.10.0`
- Allow overriding sentry.properties location (#722)

## 1.1.0

- Bump `@sentry/*` to `^5.9.0`
- fix(android): Feedback not working (#706)
- fix(types): Fix type mismatch when copying breadcrumb `type` (#693)

## 1.0.9

- Fixed an issue where breadcrumbs failed to be copied correctly

## 1.0.8

- Fix missing `type`, miscast `status_code` entries in Android breadcrumbs

## 1.0.7

- Store `environment`, `release` & `dist` on native iOS and Android clients in case of an native crash

## 1.0.6

- Fix error message to guide towards correct docs page

## 1.0.5

- Convert `message` in Java to string if it's a map (#653)

## 1.0.4

- Also catch `ClassCastException` to support react-native versions < 0.60 (#651)

## 1.0.3

- Expose `BrowserIntegrations` to change browser integrations (#639)

## 1.0.2

- Fixes `breadcrumb.data` cast if it's not a hashmap (#651)

## 1.0.1

- Fixed typo in `RNSentry.m` (#658)

## 1.0.0

This is a new major release of the Sentry's React Native SDK rewritten in TypeScript.
This SDK is now unified with the rest of our JavaScript SDKs and published under a new name `@sentry/react-native`.
It uses `@sentry/browser` and both `sentry-cocoa` and `sentry-android` for native handling.

This release is a breaking change an code changes are necessary.

New way to import and init the SDK:

```js
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'DSN',
});
```

## 0.43.2

- Add a check for an empty stacktrace on Android (#594)

## 0.43.1

- Bump `raven-js` `3.27.1`

## 0.43.0

- Bump `sentry-wizard` `0.13.0`

## 0.42.0

- Bump `sentry-cocoa` `4.2.1`
- Fix a bug where environment was correctly set
- Only upload source maps in gradle if non debug build

## 0.41.1

- Fix bump version script

## 0.41.0

- Update android build tools and gradle scripts to be compatible with latest version
- Fix support to build on windows

## 0.40.3

- Bump `sentry-cocoa` `4.1.3`

## 0.40.2

- Fix import for ArrayList and ReadableArray on Android, Fixes #511

## 0.40.1

- Use `buildToolsVersion` in build.gradle

## 0.40.0

- Add fingerprint support for iOS/Android, Fixes #407
- Add support for tvOS

## v0.39.1

- Bump `@sentry/wizard` `0.12.1`
- Add constructor for `RNSentryPackage.java`, Fixes #490

## v0.39.0

- `react-native-sentry >= 0.39.0` requires `react-native >= 0.56.0`
- [Android] Bumping of gradle deps

```
compileSdkVersion 26
buildToolsVersion '26.0.3'
...
targetSdkVersion 26
```

- [Android] Use `sentry-android` `1.7.5`
- Bump `@sentry/wizard` `0.11.0`
- Bump `sentry-cocoa` `4.1.0`
- Use new SDK identifier `sentry.javascript.react-native`

## v0.38.3

- Bump `@sentry/wizard` `0.10.2`

## v0.38.2

- [Android] Use `sentry-android` `1.7.4`

## v0.38.1

- [Android] set empty message to prevent breadcrumb exception

## v0.38.0

- [Android] Remove requirement to pass in `MainApplication` `new RNSentryPackage(MainApplication.this)`

## v0.37.1

- [Android] Call event callbacks even on failure to trigger crashes when device is offline

## v0.37.0

- Revert change to podspec file
- Add support for transaction instead of culprit
- Add equalsIgnoreCase to gradle release name compare
- Bump sentry-java to 1.7.3

## v0.36.0

- Bump raven-js to 3.24.2
- Fixed #391

## v0.35.4

- Bump sentry-cocoa to 3.12.4

## v0.35.3

- Fix wizard command

## v0.35.2

- Fixed #374

## v0.35.1

- Bump sentry-cocoa to 3.12.0

## v0.35.0

- Fixes an issue where error will not be reported to Sentry.

## v0.34.1

- Fixed #354

## v0.34.0

- Fixed #353
- Fixed #347
- Fixed #346
- Fixed #342

## v0.33.0

- Add pro guard default rule @kazy1991
- Exposed crashedLastLaunch for iOS @monotkate
- Fixed #337
- Fixed #333
- Fixed #331
- Fixed #322

## v0.32.1

- Update sentry-wizard

## v0.32.0

### Breaking changes

### Migration guide upgrading from < 0.32.0

Since we now use `@sentry/wizard` for linking with out new `@sentry/cli` package, the old
`sentry-cli-bin` package has been deprecated.
You have to search your codebase for `sentry-cli-binary` and replace it with `@sentry/cli`.
There are few places where we put it during the link process:

- In both `sentry.properties` files in `ios`/`android` folder
- In your Xcode build scripts once in `Bundle React Native code and images` and once in `Upload Debug Symbols to Sentry`

So e.g.:

The `Upload Debug Symbols to Sentry` build script looks like this:

```
export SENTRY_PROPERTIES=sentry.properties
../node_modules/sentry-cli-binary/bin/sentry-cli upload-dsym
```

should be changed to this:

```
export SENTRY_PROPERTIES=sentry.properties
../node_modules/@sentry/cli/bin/sentry-cli upload-dsym
```

### General

- Bump `@sentry/wizard` to `0.7.3`
- Bump `sentry-cocoa` to `3.10.0`
- Fixed #169

## v0.31.0

- Use <https://github.com/getsentry/sentry-wizard> for setup process

## v0.30.3

- Fix podspec file
- Fix gradle regex to allow number in projectname

## v0.30.2

Updated npm dependencies

## v0.30.1

Deploy and release over Probot

## v0.30.0

Refactored iOS to use shared component from sentry-cocoa.
Also squashed many little bugs on iOS.

- Fixed #281
- Fixed #280

## v0.29.0

- Fixed #275
- Fixed #274
- Fixed #272
- Fixed #253

## v0.28.0

We had to rename `project.ext.sentry` to `project.ext.sentryCli` because our own proguard gradle plugin was conflicting with the name.
The docs already reflect this change.

- #257

We now use the `mainThread` to report errors to `RNSentry`. This change is necessary in order for react-native to export constants.
This change shouldn't impact anyone using `react-native-sentry` since most of the "heavy" load was handled by `sentry-cocoa` in its own background queue anyway.

- #259
- #244

Bump `sentry-cocoa` to `3.8.3`

## v0.27.0

We decided to deactivate stack trace merging by default on iOS since it seems to unstable right now.
To activate it set:

```js
Sentry.config('___DSN___', {
  deactivateStacktraceMerging: false,
});
```

We are looking into ways making this more stable and plan to re-enable it again in the future.

## v0.26.0

- Added `setShouldSendCallback` #250

## v0.25.0

- Fix a bug in gradle script that trigged the sourcemap upload twice
- Fixed #245
- Fixed #234

## v0.24.2

- Fixed <https://github.com/getsentry/react-native-sentry/issues/241>

## v0.24.1

- Bump `sentry-cli` version to `1.20.0`

## v0.24.0

- Fix frame urls when only using `raven-js`
- Upgrade `sentry-java` to `1.5.3`
- Upgrade `sentry-cocoa` to `3.8.1`
- Added support for `sampleRate` option

## v0.23.2

- Fixed #228 again ¯\\_(ツ)_/¯

## v0.23.1

- Fixed #228

## v0.23.0

- Add more event properties for `setEventSentSuccessfully` callback on Android

## v0.22.0

- Fixed #158
- Add

```groovy
project.ext.sentry = [
    logLevel: "debug",
    flavorAware: true
]
```

should be before:
`apply from: "../../node_modules/react-native-sentry/sentry.gradle"`
This enables `sentry-cli` debug output on android builds, also adds flavor aware `sentry.properties` files.

## v0.21.2

- Fixing device farm tests

## v0.21.1

- Store event on release and send on next startup.

## v0.21.0

- Fixed an issue where javascript error wasn't sent everytime

## v0.20.0

- Bump `sentry-cocoa` to `3.6.0`

## v0.19.0

- Make `userId` optional for user context
- Bump `sentry-cocoa` to `3.5.0`

## v0.18.0

- Bump `sentry-java` to `1.5.1`
- Fix linking step
- Bump `raven-js` to `3.17.0`

## v0.17.1

- Fixed #190

## v0.17.0

- Fix `disableNativeIntegration` proptery to use right transport

## v0.16.2

- Remove send callback when native integration isn't available.

## v0.16.1

- Removed strange submodule

## v0.16.0

- Bump `sentry-java` to `1.4.0`
- Bump `sentry-cocoa` to `3.4.2`
- Fixed #182
- Fixed path detection of sentry-cli

## v0.15.1

- Fixed last release

## v0.15.0

- Added compatiblity for react-native `0.47.0`
- Fixed #169
- Fixed #106
- Bumped `sentry-cocoa` to `3.3.3`

Also added integration tests running on AWS Device Farm.

## v0.14.16

- Fixed #124

## v0.14.12

- Updated to `sentry-cocoa` `3.1.2`
- Fixed #156

## v0.14.11

- Fixed #166

## v0.14.10

- Fixed #161

## v0.14.9

Fixed #163

## v0.14.8

- Fixed #159
- Fixes breadcrumb tracking on android

## v0.14.7

- Improve performance for `react-native >= 0.46`

## v0.14.6

- Bump `sentry-cocoa` and `KSCrash`

## v0.14.5

- Push Podspec to `sentry-cocoa` `3.1.2`

## v0.14.4

- Removed example project from repo
- Make sure native client is only initialized once

## v0.14.3

- Revert to `23.0.1` android build tools

## v0.14.2

- Fixes #131

## v0.14.1

- Bump `raven-js` `3.16.1`
- Fixes #136

## v0.14.0

- Allowing calls to Sentry without calling `install()`
- Add internal logging if `logLevel >= SentryLog.Debug`
- Use `sentry-cocoa` `3.1.2`

## v0.13.3

- Fixes #67

## v0.13.2

- Fixes #116
- Fixes #51

## v0.13.1

- Fixed Android version dependency

## v0.13.0

- Overhauled internal handling of exceptions
- Updated iOS and Android native dependencies

## v0.12.12

- Fixes #105
- Added option `disableNativeIntegration`

## v0.12.11

- Use sentry-cocoa `3.0.9`
- Fixes #100

## v0.12.10

- Update `raven-js` to `3.16.0`
- Update `sentry-cocoa` to `3.0.8`
- Fixes #64
- Fixes #57

## v0.12.8

- Fix typo

## v0.12.9

- Add support on iOS for stacktrace merging and `react-native 0.45`

## v0.12.7

- Fixes #92

## v0.12.6

- Fixes #95

## v0.12.5

- Fixes #91 #87 #82 #63 #54 #48

## v0.12.3

- Fixed #90

## v0.12.2

- Fixed #90

## v0.12.4

- Fixed #94

## v0.12.1

- Use `3.0.7` `sentry-cocoa` in Podspec

## v0.12.0

- Removed `RSSwizzle` use `SentrySwizzle` instead

## v0.11.8

Update Podspec to use `Sentry/KSCrash`

## v0.11.7

- Fix `duplicate symbol` `RSSwizzle` when using CocoaPods

## v0.11.6

- Use `sentry-cocoa` `3.0.1`

## v0.11.5

- Fix <https://github.com/getsentry/react-native-sentry/issues/77>

## v0.11.4

- Use android buildToolsVersion 23.0.1

## v0.11.3

- Fix Xcode archive to not build generic archive

## v0.11.2

- Fix Xcode archiving

## v0.11.1

- Using latest version of `sentry-cocoa`

## v0.11.0

This is a big release because we switched our internal iOS client from swift to objc which drastically improve the setup experience and compatibility.

We also added support for codepush, please check the docs <https://docs.sentry.io/clients/react-native/codepush/> for more information.

After updating run `react-native unlink react-native-sentry` and `react-native link react-native-sentry` again in order to setup everything correctly.

## v0.10.0

- Greatly improved the linking process. Check out our docs for more information <https://docs.sentry.io/clients/react-native/>

## v0.9.1

- Update to sentry 2.1.11 which fixes a critical bug regarding sending requests on iOS

## v0.9.0

- Improve link and unlink scripts

## v0.8.5

- Fixed: bad operand types for binary operator

## v0.8.4

- Put execution on iOS into a background thread
- Add parameter checks on android

## v0.8.3

- Bump sentry version to 2.1.10 to fix releases

## v0.8.2

- Updated podspec thx @alloy

## v0.8.1

- Added command to package json to inject MainApplication.java into RNSentryPackage

## v0.8.0

- Added native android support
- raven-js is always used we use the native clients for sending events and add more context to them

## v0.7.0

- Bump KSCrash and Sentry version

## v0.6.0

Use `raven-js` internally instead switching between native and raven-js.

Native client will be used when available.

Alot of API changes to more like `raven-js`

## v0.5.3

- Fix import for

```objc
#if __has_include(<React/RNSentry.h>)
#import <React/RNSentry.h> // This is used for versions of react >= 0.40
#else
#import "RNSentry.h" // This is used for versions of react < 0.40
#endif
```

## v0.5.2

- Prefix filepath with `app://` if RavenClient is used

## v0.5.1

- Fix `npm test`
- Added `forceRavenClient` option which forces to use RavenClient instead of the NativeClient

## v0.5.0

- Added support for installation with cocoapods see <https://docs.sentry.io/clients/react-native/#setup-with-cocoapods>
- Lowered minimum version requirement for `react-native` to `0.38.0`

## v0.4.0

- Added `ignoreModulesExclude` to exclude modules that are ignored by default for stacktrace merging
- Added `ignoreModulesInclude` to add additional modules that should be ignored for stacktrace merging

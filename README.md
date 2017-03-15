# react-native-sentry

[![npm version](https://img.shields.io/npm/v/react-native-sentry.svg)](https://img.shields.io/npm/v/react-native-sentry.svg)
[![npm dm](https://img.shields.io/npm/dm/react-native-sentry.svg)](https://img.shields.io/npm/dm/react-native-sentry.svg)
[![npm dt](https://img.shields.io/npm/dt/react-native-sentry.svg)](https://img.shields.io/npm/dt/react-native-sentry.svg)

**This is a beta release**

*Requirements:*

* `react-native >= 0.41`
* sentry-cli > 0.26 (`brew install getsentry/tools/sentry-cli`)

With this SDK, Sentry is now able to provide mixed stacktraces. This means that if a JavaScript call causes a crash in native code, you will see the last call from JavaScript before the crash. This also means that with the new SDK, native crashes are properly handled on iOS.
Full Android support coming soon but it will gracefully downgrade to use [raven-js](https://github.com/getsentry/raven-js).

![Mixed Stacktrace](https://github.com/getsentry/react-native-sentry/raw/master/assets/mixed-stacktrace.png)

## Documentation

https://docs.sentry.io/clients/react-native/

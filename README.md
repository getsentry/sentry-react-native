# react-native-sentry

[![npm version](https://img.shields.io/npm/v/react-native-sentry.svg)](https://img.shields.io/npm/v/react-native-sentry.svg)
[![npm dm](https://img.shields.io/npm/dm/react-native-sentry.svg)](https://img.shields.io/npm/dm/react-native-sentry.svg)
[![npm dt](https://img.shields.io/npm/dt/react-native-sentry.svg)](https://img.shields.io/npm/dt/react-native-sentry.svg)

**This is an early beta release that only supports iOS**

*Requirements:*

* `react-native >= 0.41`
* sentry-cli > 0.26 (`brew install getsentry/tools/sentry-cli`)

Sentry can provide mixed stacktraces, which means if your app happens to crash
on the native side you will also see the last call from javascript.

![Mixed Stacktrace](https://github.com/getsentry/react-native-sentry/raw/master/assets/mixed-stacktrace.png)

## Documentation

https://docs.sentry.io/clients/react-native/

<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <picture>
      <source srcset="https://sentry-brand.storage.googleapis.com/sentry-logo-white.png" media="(prefers-color-scheme: dark)" />
      <source srcset="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)" />
      <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" alt="Sentry" width="280">
    </picture>
  </a>
</p>

_Bad software is everywhere, and we're tired of it. Sentry is on a mission to help developers write better software faster, so we can get back to enjoying technology. If you want to join us [<kbd>**Check out our open positions**</kbd>](https://sentry.io/careers/)_

# Sentry SDK for React Native

[![Build & Test](https://github.com/getsentry/sentry-react-native/actions/workflows/buildandtest.yml/badge.svg)](https://github.com/getsentry/sentry-react-native/actions/workflows/buildandtest.yml)
[![E2E Tests](https://img.shields.io/github/actions/workflow/status/getsentry/sentry-react-native/.github/workflows/e2e.yml?branch=main)](https://github.com/getsentry/sentry-react-native/actions?query=workflow%3A"End-to-End%20Tests")
[![npm version](https://img.shields.io/npm/v/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)
[![npm dm](https://img.shields.io/npm/dm/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)
[![npm dt](https://img.shields.io/npm/dt/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)
[![Discord Chat](https://img.shields.io/discord/621778831602221064?logo=discord&logoColor=ffffff&color=7389D8)](https://discord.gg/PXa5Apfe7K)

## Requirements

- `react-native >= 0.65.0`

## Features

- Automatic JS Error Tracking (using [@sentry/browser](https://github.com/getsentry/sentry-javascript))
- Automatic Native Crash Error Tracking (using [sentry-cocoa](https://github.com/getsentry/sentry-cocoa) & [sentry-android](https://github.com/getsentry/sentry-java) under the hood)
- Offline storage of events
- On Device symbolication for JS (in Debug)
- [Autolinking](https://facebook.github.io/react-native/blog/2019/07/03/version-60#native-modules-are-now-autolinked)
- Events with enriched device data
- RAM bundle support
- Hermes support
- Expo support ([sentry-expo](https://github.com/expo/sentry-expo))
- RN New Architecture support

## Installation and Usage

To install the package and setup your project:

```sh
npx @sentry/wizard -s -i reactNative
```

How to use it:

```javascript
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: "__DSN__",

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

Sentry.setTag("myTag", "tag-value");
Sentry.setExtra("myExtra", "extra-value");
Sentry.addBreadcrumb({ message: "test" });

Sentry.captureMessage("Hello Sentry!");
```

## Upgrade

If you are coming from `react-native-sentry` which was our SDK `< 1.0` you should follow the [upgrade guide](https://docs.sentry.io/platforms/react-native/#upgrading-from-react-native-sentry) and then follow the [install steps](https://docs.sentry.io/platforms/react-native/#integrating-the-sdk).

## Blog posts

[Introducing Mobile Screenshots and Suspect Commits](https://blog.sentry.io/2022/07/07/introducing-mobile-screenshots-and-suspect-commits).

[Tips for Optimizing React Native Application Performance - Part 2: Using Sentry SDK for Performance Monitoring](https://blog.sentry.io/2022/06/28/tips-for-optimizing-react-native-application-performance-part-2-using-sentry).

[Tips for Optimizing React Native Application Performance: Part 1](https://blog.sentry.io/2022/06/01/tips-for-optimizing-react-native-application-performance-part-1).

[Tracking Stability in a Bluetooth Low Energy-Based React-Native App](https://blog.sentry.io/2022/02/22/tracking-stability-in-a-bluetooth-low-energy-based-react-native-app).

[Mobile Vitals - Four Metrics Every Mobile Developer Should Care About](https://blog.sentry.io/2021/08/23/mobile-vitals-four-metrics-every-mobile-developer-should-care-about/).

[Performance Monitoring Support for React Native](https://blog.sentry.io/2021/03/11/performance-monitoring-support-for-react-native/?utm_source=github&utm_medium=readme&utm_campaign=sentry-react-native).

## Resources

- [![Documentation](https://img.shields.io/badge/documentation-sentry.io-green.svg)](https://docs.sentry.io/platforms/react-native/)
- [![Discussions](https://img.shields.io/github/discussions/getsentry/sentry-react-native.svg)](https://github.com/getsentry/sentry-react-native/discussions)
- [![Discord Chat](https://img.shields.io/discord/621778831602221064?logo=discord&logoColor=ffffff&color=7389D8)](https://discord.gg/PXa5Apfe7K)
- [![Stack Overflow](https://img.shields.io/badge/stack%20overflow-sentry-green.svg)](http://stackoverflow.com/questions/tagged/sentry)
- [![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-sentry-green.svg)](https://github.com/getsentry/.github/blob/main/CODE_OF_CONDUCT.md)
- [![Twitter Follow](https://img.shields.io/twitter/follow/getsentry?label=getsentry&style=social)](https://twitter.com/intent/follow?screen_name=getsentry)

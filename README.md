<p align="center">
    <a href="https://sentry.io" target="_blank" align="center">
        <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
    </a>
</p>

_Bad software is everywhere, and we're tired of it. Sentry is on a mission to help developers write better software faster, so we can get back to enjoying technology. If you want to join us [<kbd>**Check out our open positions**</kbd>](https://sentry.io/careers/)_

Sentry SDK for React Native
===========================

[![Travis](https://travis-ci.com/getsentry/sentry-react-native.svg?branch=master)](https://travis-ci.com/getsentry/sentry-react-native)
[![E2E Tests](https://img.shields.io/github/workflow/status/getsentry/sentry-react-native/End-to-End%20Tests?label=E2E%20Tests)](https://github.com/getsentry/sentry-react-native/actions?query=workflow%3A"End-to-End%20Tests")
[![npm version](https://img.shields.io/npm/v/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)
[![npm dm](https://img.shields.io/npm/dm/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)
[![npm dt](https://img.shields.io/npm/dt/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)
[![Discord Chat](https://img.shields.io/discord/621778831602221064?logo=discord&logoColor=ffffff&color=7389D8)](https://discord.gg/PXa5Apfe7K)  

## Requirements

- `react-native >= 0.56.0`

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

## Installation and Usage

To install the package:

```sh
npm install --save @sentry/react-native
# OR
yarn add @sentry/react-native
```

If you are using a version of React Native <= 0.60.x link the package using `react-native`.

```sh
react-native link @sentry/react-native
# OR, if self hosting
SENTRY_WIZARD_URL=http://sentry.acme.com/ react-native link @sentry/react-native
```

How to use it:

```javascript
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: "__DSN__"
});

Sentry.setTag("myTag", "tag-value");
Sentry.setExtra("myExtra", "extra-value");
Sentry.addBreadcrumb({ message: "test" });

Sentry.captureMessage("Hello Sentry!");
```

## Upgrade

If you are coming from `react-native-sentry` which was our SDK `< 1.0` you should follow the [upgrade guide](https://docs.sentry.io/platforms/react-native/#upgrading-from-react-native-sentry) and then follow the [install steps](https://docs.sentry.io/platforms/react-native/#integrating-the-sdk).

## Blog posts

[Performance Monitoring Support for React Native](https://blog.sentry.io/2021/03/11/performance-monitoring-support-for-react-native/?utm_source=github&utm_medium=readme&utm_campaign=sentry-react-native).

## Resources

* [![Documentation](https://img.shields.io/badge/documentation-sentry.io-green.svg)](https://docs.sentry.io/platforms/react-native/)
* [![Forum](https://img.shields.io/badge/forum-sentry-green.svg)](https://forum.sentry.io/c/sdks)
* [![Discord Chat](https://img.shields.io/discord/621778831602221064?logo=discord&logoColor=ffffff&color=7389D8)](https://discord.gg/PXa5Apfe7K)  
* [![Stack Overflow](https://img.shields.io/badge/stack%20overflow-sentry-green.svg)](http://stackoverflow.com/questions/tagged/sentry)
* [![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-sentry-green.svg)](https://github.com/getsentry/.github/blob/master/CODE_OF_CONDUCT.md)
* [![Twitter Follow](https://img.shields.io/twitter/follow/getsentry?label=getsentry&style=social)](https://twitter.com/intent/follow?screen_name=getsentry)

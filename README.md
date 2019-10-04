<p align="center">
    <a href="https://sentry.io" target="_blank" align="center">
        <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
    </a>
<br/>
    <h1>Sentry SDK for React Native</h1>
</p>

[![Travis](https://travis-ci.com/getsentry/sentry-react-native.svg?branch=master)](https://travis-ci.com/getsentry/sentry-react-native)
[![npm version](https://img.shields.io/npm/v/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)
[![npm dm](https://img.shields.io/npm/dm/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)
[![npm dt](https://img.shields.io/npm/dt/@sentry/react-native.svg)](https://www.npmjs.com/package/@sentry/react-native)

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
- Hermes support (coming soon see [#649](https://github.com/getsentry/sentry-react-native/issues/649))
- Expo support ([sentry-expo](https://github.com/expo/sentry-expo))

## Installation and Usage

To install the package:

```sh
npm install --save @sentry/react-native
# OR
yarn add @sentry/react-native
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

## Documentation

https://docs.sentry.io/platforms/react-native/

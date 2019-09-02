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
[![deps](https://david-dm.org/getsentry/@sentry/react-native/status.svg)](https://david-dm.org/getsentry/@sentry/react-native?view=list)
[![deps dev](https://david-dm.org/getsentry/@sentry/react-native/dev-status.svg)](https://david-dm.org/getsentry/@sentry/react-native?type=dev&view=list)
[![deps peer](https://david-dm.org/getsentry/@sentry/react-native/peer-status.svg)](https://david-dm.org/getsentry/@sentry/react-native?type=peer&view=list)

## Requirements

- `react-native >= 0.56.0`

## Installation and Usage

To install the SDK simply do

```sh
yarn add @sentry/react-native
```

```javascript
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: "__DSN__"
});

Sentry.setTag("myTag", "tag-value");
Sentry.setExtra("myExtra", "extra-value");
Sentry.addBreadcrumb({ message: "test" });

Sentry.captureMessage("Hello, world!");
```

## Documentation

https://docs.sentry.io/platforms/react-native/

# react-native-sentry (alpha iOS only)

*Requirements:*

* `react-native >= 0.41`
* sentry-cli > 0.26 (`brew install getsentry/tools/sentry-cli`)

Sentry can provide mixed stacktraces, which means if your app happens to crash
on the native side you will also see the last call from javascript.

![Mixed Stacktrace](https://github.com/getsentry/react-native-sentry/raw/master/assets/mixed-stacktrace.png)

## Getting started

If you don't have a react native project up and running follow this guide.
https://facebook.github.io/react-native/docs/getting-started.html

Start with adding sentry and linking it:

```
$ npm install react-native-sentry --save
$ react-native link react-native-sentry
```

## Sourcemap Uploading

Open up your xcode project in the iOS folder, go to your project's target and
change the "Bundle React Native code and images" build script.  The script that
is currently there needs to be adjusted as follows:

```
export NODE_BINARY=node
sentry-cli react-native-xcode ../node_modules/react-native/packager/react-native-xcode.sh
```

## Client Configuration

Add sentry to your `index.ios.js`:

```js
...
import { Sentry } from 'react-native-sentry';

Sentry.config('Your DSN').install();
Sentry.activateStacktraceMerging(require('BatchedBridge'), require('parseErrorStack'));
...
```

Additionally you need to register the native crash handler in your `AppDelegate.m`:

```objc
#import <React/RNSentry.h>

/* ... */
[RNSentry installWithRootView:rootView];
```

## Additional Configuration

These are functions you can call in your javascript code:

```js

import {
  Sentry,
  SentrySeverity,
  SentryLog
} from 'react-native-sentry';

Sentry.setLogLevel(SentryLog.Debug);

Sentry.setExtraContext({
  "a_thing": 3,
  "some_things": {"green": "red"},
  "foobar": ["a", "b", "c"],
  "react": true,
  "float": 2.43
});

Sentry.setTagsContext({
  "environment": "production",
  "react": true
});

Sentry.setUserContext({
  email: "john@apple.com",
  userID: "12341",
  username: "username",
  extra: {
    "is_admin": false
  }
});

Sentry.captureMessage("TEST message", {
  level: SentrySeverity.Warning
}); // Default SentrySeverity.Error

// This will trigger a crash in the native sentry client
//Sentry.nativeCrash();
```

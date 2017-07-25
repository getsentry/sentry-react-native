<p align="center">
    <a href="https://sentry.io" target="_blank" align="center">
        <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
    </a>
<br/>
    <h1>react-native-sentry</h1>
</p>

[![npm version](https://img.shields.io/npm/v/react-native-sentry.svg)](https://www.npmjs.com/package/react-native-sentry)
[![npm dm](https://img.shields.io/npm/dm/react-native-sentry.svg)](https://www.npmjs.com/package/react-native-sentry)
[![npm dt](https://img.shields.io/npm/dt/react-native-sentry.svg)](https://www.npmjs.com/package/react-native-sentry)

**This is a beta release**

*Requirements:*

* `react-native >= 0.38` for iOS
* `react-native >= 0.41` for Android
* `sentry-cli   >= 1.9.0` (`brew install getsentry/tools/sentry-cli`)

With this SDK, Sentry is now able to provide mixed stacktraces. This means that if a JavaScript call causes a crash in native code, you will see the last call from JavaScript before the crash. This also means that with the new SDK, native crashes are properly handled on iOS.
Full Android support coming soon but it will gracefully downgrade to use [raven-js](https://github.com/getsentry/raven-js).

## Additional device information

When using this library you will get alot more information about the device surrounding your crashes.

**Without native integration**
![Raven js only](https://github.com/getsentry/react-native-sentry/raw/master/assets/raven.png)

**With native integration**
![Enriched](https://github.com/getsentry/react-native-sentry/raw/master/assets/enriched.png)
![Additional](https://github.com/getsentry/react-native-sentry/raw/master/assets/additional-device.png)


**Mixed Stacktraces**<sup>(1)</sup>
![Mixed Stacktrace](https://github.com/getsentry/react-native-sentry/raw/master/assets/mixed-stacktrace.png)

## Documentation

https://docs.sentry.io/clients/react-native/

<sup>(1)</sup>only supported on iOS

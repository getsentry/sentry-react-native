.. class:: platform-react-native

.. _react-native:

React Native
============

This is the documentation for our React-Native SDK.  The
React-Native SDK uses a native extension for iOS and Android but will
fall back to a pure JavaScript version if necessary.

Installation
------------

Start by adding Sentry and then linking it::

    $ npm install react-native-sentry --save
    # or
    # yarn add react-native-sentry
    # if you are using yarn
    # this is for linking
    $ react-native link react-native-sentry

The `link` step will pull in the native dependency and patch your project
accordingly.  If you are using expo you don't have to (or can't) run that
link step.  For more information about that see :doc:`expo`.

On linking the new `Sentry Wizard <https://github.com/getsentry/sentry-wizard>`_
will help you to configure your project and change files accordingly.

Upon linking the following changes will be performed:

* add the sentry-java package for native crash reporting on Android
* add the sentry-cocoa package for native crash reporting on iOS
* enable the sentry gradle build step for android
* patch `AppDelegate.m` for iOS
* patch `MainApplication.java` for Android
* configure Sentry for the supplied DSN in your `index.js/App.js` files
* store build credentials in `ios/sentry.properties` and
  `android/sentry.properties`.

To see what is happening during linking you can refer to
:doc:`manual-setup` which will give you all the details.

Note that we only support ``react-native >= 0.38`` at the moment.

Upgrading
---------

If you are upgrading from an earlier version of sentry-react-native you
should re-link the package to ensure the generated code is updated to the
latest version::

    $ react-native unlink react-native-sentry
    $ react-native link react-native-sentry

iOS Specifics
-------------

When you use Xcode you can hook directly into the build process to upload
debug symbols and sourcemaps.  If you however are using bitcode you will
need to disable the "Upload Debug Symbols to Sentry" build phase and then
separately upload debug symbols from iTunes Connect to Sentry.

Android Specifics
-----------------

For Android we hook into gradle for the sourcemap build process.  When you
run ``react-native link`` the gradle files are automatically updated.
When you run ``./gradlew assembleRelease`` sourcemaps are automatically
built and uploaded to Sentry.

Client Configuration
--------------------

Note: When you run ``react-native link`` we will automatically update your
`index.ios.js` / `index.android.js` with the following changes:

.. sourcecode:: javascript

    import { Sentry } from 'react-native-sentry';
    Sentry.config('___PUBLIC_DSN___').install();

You can pass additional configuration options to the `config()` method if
you want to do so.

Mixed Stacktraces
-----------------

Currently we only support mixed stacktraces on iOS. By default this feature is
disabled. We recommend testing your app thoroughly when activating this, to turn
it on ``deactivateStacktraceMerging: false`` see: :doc:`config`.

Deep Dive
---------

.. toctree::
   :maxdepth: 2

   config
   expo
   codepush
   sourcemaps
   cocoapods
   manual-setup

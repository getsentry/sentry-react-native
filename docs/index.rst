.. class:: platform-react-native

.. _react-native:

React Native
============

This is the documentation for our beta clients for React-Native.  The
React-Native client uses a native extension for iOS and Android but can
fall back to a pure JavaScript version if needed.

Installation
------------

Start by adding Sentry and then linking it::

    $ npm install react-native-sentry --save
    $ react-native link react-native-sentry

The `link` step will pull in the native dependency and patch your project
accordingly.  If you are using expo you don't have to (or can't) run that
link step.  For more information about that see :doc:`expo`.

On linking you will automatically be prompted for your DSN and other
information and we will configure your app automatically for react-native
and change files accordingly.  You will need to provide the following
data: your DSN, the slug of your organization in Sentry, the slug of your
project in Sentry as well as the API key.

You can find the slugs in the URL of your project
(``sentry.io/your-org-slug/your-project-slug``) If you don't have an auth
token yet you can `create an auth token here <https://sentry.io/api/>`_.

Upon linking the following changes will be performed:

* add the raven-java package for native crash reporting on Android
* add the sentry-swift package for native crash reporting on iOS
* enable the sentry gradle build step for android
* patch `AppDelegate.m` for iOS
* patch `MainApplication.java` for Android
* configure Sentry for the supplied DSN in your `index.js` files
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

Since we use our `Swift Client
<https://github.com/getsentry/sentry-swift>`_ in the background, your
project has to embed the swift standard libraries.  The link step will do
this automatically for your project.

When you use xcode you can hook directly into the build process to upload
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
    Sentry.config('___DSN___').install();

You can pass additional configuration options to the `config()` method if
you want to do so.

Deep Dive
---------

.. toctree::
   :maxdepth: 2

   config
   expo
   sourcemaps
   cocoapods
   manual-setup

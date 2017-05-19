.. class:: platform-react-native

.. _react-native:

React Native
============

This is the documentation for our beta clients for React-Native.  This is
an early release with various different levels of support.  iOS is best
supported if you are also using the native extension and if not we fall
back to pure JavaScript for basic support.

We would love to get your feedback!

Installation
------------

Start with adding sentry and linking it::

    $ npm install react-native-sentry --save
    $ react-native link react-native-sentry

The `link` step will pull in the native dependency.  If you are using
expo you don't have to (or can't) run that step.  In that case we fall
back automatically.

On linking you will usually be prompted for your DSN and we will configure
your app automatically for react-native and change files accordingly.
Upon linking the following changes will be performed:

* added the raven-java package for native crash reporting on android
* added the sentry-swift package for native crash reporting on iOS
* enabled the sentry gradle build step for android
* patch `AppDelegate.m` for iOS
* patch `MainApplication.java` for Android
* configured Sentry for the supplied DSN in your `index.js` files

Note that we only support ``react-native >= 0.38`` at the moment.

iOS Specifics
-------------

Since we use our `Swift Client
<https://github.com/getsentry/sentry-swift>`_ in the background, your
project has to embed the swift standard libraries.

Search for ``ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES`` in your Xcode project
build settings and set it to ``YES``.

You will get this error message if you forget to set it::

    dyld: Library not loaded: @rpath/libswiftCore.dylib
    Referenced from: [Redacted]/Sentry.framework/Sentry
    Reason: image not found

Also note that if you build the project without setting this, you have to
run clean in order to make the change work.

When you use xcode you can hook directly into the build process to upload
debug symbols.  Open up your xcode project in the iOS folder, go to your
project's target and change the "Bundle React Native code and images"
build script.  The script that is currently there needs to be adjusted as
follows::

    export SENTRY_ORG=___ORG_NAME___
    export SENTRY_PROJECT=___PROJECT_NAME___
    export SENTRY_AUTH_TOKEN=YOUR_AUTH_TOKEN
    export NODE_BINARY=node
    ../node_modules/react-native-sentry/bin/bundle-frameworks
    ../node_modules/sentry-cli-binary/bin/sentry-cli react-native-xcode \
      ../node_modules/react-native/packager/react-native-xcode.sh
    ../node_modules/sentry-cli-binary/bin/sentry-cli upload-dsym

You can find the slugs in the URL of your project
(sentry.io/your-org-slug/your-project-slug) If you don't have an auth
token yet you can `create an auth token here <https://sentry.io/api/>`_.

This also uploads debug symbols in the last line which however will not
work for bitcode enabled builds.  If you are using bitcode you need to
remove that line (``../node_modules/sentry-cli-binary/bin/sentry-cli
upload-dsym``) and consult the documentation on dsym handling instead (see
:ref:`dsym-with-bitcode`).

Note that uploading of debug simulator builds by default is disabled for
speed reasons.  If you do want to also generate debug symbols for debug
builds you can pass `--allow-fetch` as a parameter to ``react-native-xcode``.

Android Specifics
-----------------

For Android we hook into gradle for the sourcemap build process.  When you
run ``react-native link`` the gradle files are automatically updated but
in case you are not using linked frameworks you might have to do it
manually.  Whenever you run ``./gradlew assembleRelease`` sourcemaps are
automatically built and uploaded to Sentry.

To enable the gradle integration you need to change your
``android/app/build.gradle`` file and add the following line after the
``react.gradle`` one::

    apply from: "../../node_modules/react-native-sentry/sentry.gradle"

Additionally you need to create an ``android/sentry.properties`` file with
the access credentials:

.. sourcecode:: ini

    defaults.org=___ORG_NAME___
    defaults.project=___PROJECT_NAME___
    auth.token=YOUR_AUTH_TOKEN

Client Configuration
--------------------

Note: When you run ``react-native link`` we will attempt to automatically
patch your code so you might notice that some of these changes were
already performed.

Add Sentry to your `index.ios.js` and `index.android.js`:

.. sourcecode:: javascript

    import { Sentry } from 'react-native-sentry';

    Sentry.config('___DSN___').install();

If you are using the binary version of the package (eg: you ran
``react-native link``) then you additionally need to register the native
crash handler in your `AppDelegate.m` after the root view was created for
iOS:

.. sourcecode:: objc

    #if __has_include(<React/RNSentry.h>)
    #import <React/RNSentry.h> // This is used for versions of react >= 0.40
    #else
    #import "RNSentry.h" // This is used for versions of react < 0.40
    #endif

    /* in your didFinishLaunchingWithOptions */
    [RNSentry installWithRootView:rootView];

More
----

.. toctree::
   :maxdepth: 2

   config
   expo
   sourcemaps
   cocoapods

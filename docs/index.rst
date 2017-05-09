.. class:: platform-react-native

.. _react-native:

React Native
============

This is the documentation for our beta clients for React-Native.

.. admonition:: Note

   This is an early release with various different levels of support.  iOS
   is best supported if you are also using the native extension and if not
   we fall back to raven-js' basic react-native support.

   We would love to get your feedback!

Installation
------------

Start with adding sentry and linking it::

    $ npm install react-native-sentry --save
    $ react-native link react-native-sentry

The `link` step will pull in the native dependency.  If you are using
Android or expo you don't have to (or can't) run that step.  In that case
we fall back automatically.

Note that we only support ``react-native >= 0.38`` at the moment.

Xcode Build Settings
--------------------

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

Xcode Build Steps
-----------------

If you are using iOS (and not expo) you can hook directly into the build
process to upload debug symbols.

Open up your xcode project in the iOS folder, go to your project's target and
change the "Bundle React Native code and images" build script.  The script that
is currently there needs to be adjusted as follows::

    export SENTRY_ORG=YOUR_ORG_SLUG
    export SENTRY_PROJECT=YOUR_PROJECT_SLUG
    export SENTRY_AUTH_TOKEN=YOUR_AUTH_TOKEN
    export NODE_BINARY=node
    ../node_modules/react-native-sentry/bin/bundle-frameworks
    ../node_modules/sentry-cli-binary/bin/sentry-cli react-native-xcode ../node_modules/react-native/packager/react-native-xcode.sh
    ../node_modules/sentry-cli-binary/bin/sentry-cli upload-dsym

You can find the slugs in the URL of your project (sentry.io/your-org-slug/your-project-slug)
If you don't have an auth token yet you can `create an auth token here <https://sentry.io/api/>`_.

This also uploads debug symbols in the last line which however will not work for
bitcode enabled builds.  If you are using bitcode you need to remove that
line (``../node_modules/sentry-cli-binary/bin/sentry-cli upload-dsym``) and consult the documentation on dsym
handling instead (see :ref:`dsym-with-bitcode`).

Note that uploading of debug simulator builds by default is disabled for
speed reasons.  If you do want to also generate debug symbols for debug
builds you can pass `--allow-fetch` as a parameter to
``react-native-xcode``.

Sourcemaps for Other Platforms
------------------------------

Currently automatic sourcemap handling is only implemented for iOS with
Xcode.  If you manually invoke the `react-native packager
<https://github.com/facebook/react-native/tree/master/packager>`__ you can
however get sourcemaps anyways by passing `--sourcemap-output` to it.

If you do get sourcemaps you can upload them with ``sentry-cli``.  However
make sure to pass ``--rewrite`` to the ``upload-sourcemaps`` command which
will fix up the sourcemaps before upload (inlines sources etc.).

Example:

.. code-block:: bash

    react-native bundle \
      --dev false \
      --platform android \
      --entry-file index.android.js \
      --bundle-output android.main.bundle \
      --sourcemap-output android.main.bundle.map

Setup With Cocoapods
--------------------

In order to use Sentry with cocoapods you have to install the packages with
``npm`` or ``yarn`` and link them locally in your ``Podfile``.

.. sourcecode:: bash

    npm install --save react react-native react-native-sentry

After that change your ``Podfile`` to reference to the packages in your
``node_modules`` folder.

.. sourcecode:: ruby

    platform :ios, '8.0'
    use_frameworks!

    node_modules_path = './node_modules'
    react_path = File.join(node_modules_path, 'react-native')
    yoga_path = File.join(react_path, 'ReactCommon/yoga')
    sentry_path = File.join(node_modules_path, 'react-native-sentry')

    target 'YOUR-TARGET' do
        pod 'Yoga', :path => yoga_path
        pod 'React', :path => react_path, :subspecs => [
          'Core',
          'RCTImage',
          'RCTNetwork',
          'RCTText',
          'RCTWebSocket',
          # Add any other subspecs you want to use in your project
        ]
        pod 'SentryReactNative', :path => sentry_path
    end

    post_install do |installer|
      installer.pods_project.build_configurations.each do |config|
        config.build_settings['SWIFT_VERSION'] = '3.0'
        config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'YES'
      end
    end

After that run ``pod install`` which then should link everything correctly.
If you need more information about how to load the react view check out
`this tutorial.
<https://facebook.github.io/react-native/releases/0.23/docs/embedded-app-ios.html>`_

Client Configuration
--------------------

Add sentry to your `index.ios.js`:

.. sourcecode:: javascript

    import { Sentry } from 'react-native-sentry';

    Sentry.config('___DSN___').install();

If you are using the binary version of the package (eg: you ran
``react-native link``) then you additionally need to register the native
crash handler in your `AppDelegate.m` after the root view was created:

.. sourcecode:: objc

    #if __has_include(<React/RNSentry.h>)
    #import <React/RNSentry.h> // This is used for versions of react >= 0.40
    #else
    #import "RNSentry.h" // This is used for versions of react < 0.40
    #endif

    /* ... */
    [RNSentry installWithRootView:rootView];

For Android you have to add this in the first line of ``getPackages()`` in `MainApplication.java`:

.. sourcecode:: java

    /* ... */
    @Override
    protected List<ReactPackage> getPackages() {
        RNSentryPackage.useDeveloperSupport = this.getUseDeveloperSupport();
        /* ... */
    }


Additional Configuration
------------------------

These are functions you can call in your javascript code:

.. sourcecode:: javascript

    import {
      Sentry,
      SentrySeverity,
      SentryLog
    } from 'react-native-sentry';

    // disable stacktrace merging
    Sentry.config("___DSN___", {
      deactivateStacktraceMerging: true, // default: false | Deactivates the stacktrace merging feature
      logLevel: SentryLog.Debug, // default SentryLog.None | Possible values:  .None, .Error, .Debug, .Verbose
      // These two options will only be considered if stacktrace merging is active
      // Here you can add modules that should be ignored or exclude modules
      // that should no longer be ignored from stacktrace merging
      // ignoreModulesExclude: ["I18nManager"], // default: [] | Exclude is always stronger than include
      // ignoreModulesInclude: ["RNSentry"], // default: [] | Include modules that should be ignored too
      // ---------------------------------
    }).install();

    // set a callback after an event was successfully sentry
    // its only guaranteed that this event contains `event_id` & `level`
    Sentry.setEventSentSuccessfully((event) => {
      // can also be called outside this block but maybe null
      // Sentry.lastEventId(); -> returns the last event_id after the first successfully sent event
      // Sentry.lastException(); -> returns the last event after the first successfully sent event
    });

    // export an extra context
    Sentry.setExtraContext({
      "a_thing": 3,
      "some_things": {"green": "red"},
      "foobar": ["a", "b", "c"],
      "react": true,
      "float": 2.43
    });

    // set the tag context
    Sentry.setTagsContext({
      "environment": "production",
      "react": true
    });

    // set the user context
    Sentry.setUserContext({
      email: "john@apple.com",
      userID: "12341",
      username: "username",
      extra: {
        "is_admin": false
      }
    });

    // set a custom message
    Sentry.captureMessage("TEST message", {
      level: SentrySeverity.Warning
    }); // Default SentrySeverity.Error

    // capture an exception
    Sentry.captureException(new Error('Oops!'), {
      logger: 'my.module'
    });

    // capture an exception
    Sentry.captureBreadcrumb({
      message: 'Item added to shopping cart',
      category: 'action',
      data: {
         isbn: '978-1617290541',
         cartSize: '3'
      }
    });

    // This will trigger a crash in the native sentry client
    //Sentry.nativeCrash();

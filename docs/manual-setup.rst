Manual Setup
============

If you can't (or don't want) to run the linking step you can see here what
is happening on each platform.

iOS
---

Since we use our `Swift Client
<https://github.com/getsentry/sentry-swift>`_ in the background, your
project has to embed the swift standard libraries.

Xcode Settings
``````````````

The link step sets ``ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES`` in your Xcode
project's build settings to ``YES``.

You will get this error message if that setting is not set::

    dyld: Library not loaded: @rpath/libswiftCore.dylib
    Referenced from: [Redacted]/Sentry.framework/Sentry
    Reason: image not found

Build Steps
```````````

When you use Xcode you can hook directly into the build process to upload
debug symbols.  When linking one build phase script is changed and two more
are added.

We modify the react-native build phase ("Bundle React Native code and images")
slightly from this::

    export NODE_BINARY=node
    ../node_modules/react-native/packager/react-native-xcode.sh

To this::

    export NODE_BINARY=node
    export SENTRY_PROPERTIES=sentry.properties
    ../node_modules/sentry-cli-binary/bin/sentry-cli react-native xcode \
      ../node_modules/react-native/packager/react-native-xcode.sh

Additionally we add a build script called "Upload Debug Symbols to Sentry" which uploads debug symbols
to Sentry.

However this will not work for bitcode enabled builds.  If you are using bitcode you need to
remove that line (``../node_modules/sentry-cli-binary/bin/sentry-cli
upload-dsym``) and consult the documentation on dsym handling instead (see
:ref:`dsym-with-bitcode`).

Note that uploading of debug simulator builds by default is disabled for
speed reasons.  If you do want to also generate debug symbols for debug
builds you can pass `--allow-fetch` as a parameter to ``react-native-xcode``
in the above mentioned build phase.

Android
-------

For Android we hook into gradle for the sourcemap build process.  When you
run ``react-native link`` the gradle files are automatically updated.

We enable the gradle integration in your ``android/app/build.gradle`` file
by adding the following line after the ``react.gradle`` one::

    apply from: "../../node_modules/react-native-sentry/sentry.gradle"

Manual Setup
============

If you can't (or don't want) to run the linking step you can see here what
is happening on each platform.

iOS
---

AppDelegate
```````````

.. sourcecode:: objc

    #if __has_include(<React/RNSentry.h>)
    #import <React/RNSentry.h> // This is used for versions of react >= 0.40
    #else
    #import "RNSentry.h" // This is used for versions of react < 0.40
    #endif

    /* in your didFinishLaunchingWithOptions */
    [RNSentry installWithRootView:rootView];

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

    # If you are using RN 0.46+
    ../node_modules/sentry-cli-binary/bin/sentry-cli react-native xcode \
      ../node_modules/react-native/scripts/react-native-xcode.sh

    # For RN < 0.46
    ../node_modules/sentry-cli-binary/bin/sentry-cli react-native xcode \
      ../node_modules/react-native/packager/react-native-xcode.sh

Additionally we add a build script called "Upload Debug Symbols to Sentry" which uploads debug symbols
to Sentry.

However this will not work for bitcode enabled builds.  If you are using bitcode you need to
remove that line (``sentry-cli
upload-dsym``) and consult the documentation on dsym handling instead (see
:ref:`dsym-with-bitcode`).

Note that uploading of debug simulator builds by default is disabled for
speed reasons.  If you do want to also generate debug symbols for debug
builds you can pass ``--allow-fetch`` as a parameter to ``react-native-xcode``
in the above mentioned build phase.

Using node with nvm
```````````````````

If you are using nvm, Xcode seems to have problems locating the default node binary.
In that case you should change the scripts to this::

    # First set the path to sentry.properties
    export SENTRY_PROPERTIES=sentry.properties

    # Setup nvm and set node
    [ -z "$NVM_DIR" ] && export NVM_DIR="$HOME/.nvm"

    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    . "$HOME/.nvm/nvm.sh"
    elif [[ -x "$(command -v brew)" && -s "$(brew --prefix nvm)/nvm.sh" ]]; then
    . "$(brew --prefix nvm)/nvm.sh"
    fi

    # Set up the nodenv node version manager if present
    if [[ -x "$HOME/.nodenv/bin/nodenv" ]]; then
    eval "$("$HOME/.nodenv/bin/nodenv" init -)"
    fi

    [ -z "$NODE_BINARY" ] && export NODE_BINARY="node"

    # Run sentry cli script to upload debug symbols
    $NODE_BINARY ../node_modules/@sentry/cli/bin/sentry-cli upload-dsym

    # OR

    $NODE_BINARY ../node_modules/@sentry/cli/bin/sentry-cli react-native xcode \
      ../node_modules/react-native/scripts/react-native-xcode.sh

Android
-------

For Android we hook into gradle for the sourcemap build process.  When you
run ``react-native link`` the gradle files are automatically updated.

We enable the gradle integration in your ``android/app/build.gradle`` file
by adding the following line after the ``react.gradle`` one::

    apply from: "../../node_modules/react-native-sentry/sentry.gradle"

You can also enable logging for ``sentry-cli`` by adding this config before the above
``apply from:`` line::

    project.ext.sentryCli = [
        logLevel: "debug"
    ]

We also support fetching different ``sentry.properties`` files for different flavors.
For that you need to add::

    project.ext.sentryCli = [
        logLevel: "debug",
        flavorAware: true
    ]

We recommend leaving ``logLevel: "debug"`` since we look for specific ``sentry.properties``
files depending on your flavors name.

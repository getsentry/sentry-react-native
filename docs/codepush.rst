Using Sentry with CodePush
--------------------------

If you want to use sentry together with CodePush you have to send us the CodePush version:

.. sourcecode:: javascript

    import codePush from "react-native-code-push";

    codePush.getUpdateMetadata().then((update) => {
      if (update) {
        Sentry.setVersion(update.appVersion + '-codepush:' + update.label);
      }
    });

Put this somewhere in your code where you already use CodePush. This makes sure that we can
associate crashes with the right sourcemaps.
``Sentry.setVersion`` sets the release to ``bundle_id-version`` this works for iOS as well as Android.
Make sure that you call this function otherwise Sentry is not able to symbolicate your crashes correctly.

After updating your CodePush release you have to upload the new assets to Sentry::

    $ appcenter codepush release-react YourApp ios --outputDir build
    $ export SENTRY_PROPERTIES=./ios/sentry.properties
    $ sentry-cli react-native codepush YourApp ios ./build

.. admonition:: Note

    Exporting the ``SENTRY_PROPERTIES`` will tell sentry-cli to use the
    properties in your project. Alternatively, you can either pass it via
    parameters or a global settings file.
    To find more about this refer to :ref:`sentry-cli-working-with-projects`.

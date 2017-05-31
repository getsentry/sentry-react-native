Using Sentry with CodePush
--------------------------

If you want to use sentry together with codepush you have to send us the codepush version:

.. sourcecode:: javascript

    import CodePush from "react-native-code-push";

    CodePush.getUpdateMetadata().then((update) => {
      if (update) {
        Sentry.setVersion('codepush:' + update.label);
      }
    });

Put this somewhere in you code where you already use codepush. This makes sure that we can
associate crashes with the right sourcemaps.
``Sentry.setVersion`` sets the the release to ``bundle_id-version`` this works for iOS aswell as Android.

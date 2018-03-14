.. _cocoapods:

Setup With CocoaPods
--------------------

In order to use Sentry with CocoaPods you have to install the packages with
``npm`` or ``yarn`` and link them locally in your ``Podfile``.

.. sourcecode:: bash

    npm install --save react react-native react-native-sentry
    yarn add react react-native react-native-sentry

After that change your ``Podfile`` to reference to the packages in your
``node_modules`` folder. For the latest reference on how to use react-native with
CocoaPods see: `Integration with existing apps <https://facebook.github.io/react-native/docs/integration-with-existing-apps.html#configuring-cocoapods-dependencies>`_

.. sourcecode:: ruby

    target 'YOUR-TARGET' do
        # Your react-native and other pods

        pod 'SentryReactNative', :path => '../node_modules/react-native-sentry/SentryReactNative.podspec' # or your path to node_modules
    end

After that run ``pod install`` which then should link everything correctly.
Please keep in mind that you need the build steps that upload your source maps and debug
symbols.

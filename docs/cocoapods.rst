.. _cocoapods:

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

After that run ``pod install`` which then should link everything correctly.
If you need more information about how to load the react view check out
`this tutorial.
<https://facebook.github.io/react-native/releases/0.23/docs/embedded-app-ios.html>`_

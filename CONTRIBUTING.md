# Contributing

This repository contains a sample project. It can be used to test the SDK as you develop it.

# Requirements

You need:

- nodejs 14 or higher
- yarn 1 or higher

## Building

First install dependencies of the SDK (the root of the repository)
This is only needed if dependencies are added/removed.

```sh
yarn
```

Once deps are installed, you can build the project:

```sh
yarn build

# Or in watch mode, for development

yarn build:watch
```

## testing

```sh
yarn test

# Or the watcher when writing tests:
yarn test:watch
```

## Running the sample

Now we can go into the sample project, install and build it:

```sh
cd sample/
yarn

# Build iOS
cd ios
pod install
cd ..
```

You can optionally start the Metro bundler if you want to control where it runs:

```sh
yarn start --reset-cache
```

Run the emulators:

```sh
yarn react-native run-ios
yarn react-native run-android
```

## Develop with sentry-cocoa

Here are step on how to test your changes in `sentry-cocoa` with `sentry-react-native`. We assume you have both repositories cloned in siblings folders.

1. Build `sentry-cocoa`.

```sh
cd sentry-cocoa
make init
make build-xcframework
```

2. Link local `sentry-cocoa` build in `sentry-react-native`

```sh
cd sentry-react-native
```

Comment out sentry dependency in `RNSentry.podspec`.

```diff
-   s.dependency 'Sentry', '7.31.0'
-   s.dependency 'Sentry/HybridSDK', '7.31.0'
+   # s.dependency 'Sentry', '7.31.0'
+   # s.dependency 'Sentry/HybridSDK', '7.31.0'
```

Add local pods to `sample/ios/Podfile`.

```diff
target 'sample' do

  # ... react native config

+  pod 'Sentry', :path => '../../../sentry-cocoa'
+  pod 'Sentry/HybridSDK', :path => '../../../sentry-cocoa'

  # ... rest of the configuration

end
```

## Develop with sentry-java

Here are step on how to test your changes in `sentry-java` with `sentry-react-native`.


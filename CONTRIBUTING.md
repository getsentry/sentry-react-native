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
cd sample-new-architecture/
yarn
```

### Run the emulators (legacy-architecture):

For android switch `newArchEnabled` to `false` in [android/gradle.properties](https://github.com/getsentry/sentry-react-native/blob/c95aa21497ca93aaaaf0b44d170dc39dc7bcf660/sample-new-architecture/android/gradle.properties#L40). For iOS explicitly disable fabric in `sample-new-architecture/ios/Podfile` by setting `:fabric_enabled => false` before `pod install`.

```sh
yarn pod-install-legacy
yarn run-ios

yarn run-android

# Release builds
yarn pod-install-legacy-production
yarn run-ios --configuration Release

yarn run-android --variant=release
```

### Run the emulators (new-architecture):
```sh
yarn pod-install
yarn run-ios

yarn run-android

# Release builds
yarn pod-install-production
yarn run-ios --configuration Release

yarn run-android --variant=release
```

### Optional
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
-   s.dependency 'Sentry/HybridSDK', '7.31.0'
+   # s.dependency 'Sentry/HybridSDK', '7.31.0'
```

Add local pods to `sample/ios/Podfile`.

```diff
target 'sample' do

  # ... react native config

+  pod 'Sentry/HybridSDK', :path => '../../../sentry-cocoa'
+  pod 'SentryPrivate', :path => '../../../sentry-cocoa/SentryPrivate.podspec'

  # ... rest of the configuration

end
```

## Develop with sentry-java

Here are step on how to test your changes in `sentry-java` with `sentry-react-native`. We assume that you have `sentry-java` setup, Android SDK installed, correct JAVA version etc.

1. Build and publish `sentry-java` locally.

```sh
cd sentry-java
make dryRelease
ls ~/.m2/repository/io/sentry/sentry-android # check that `sentry-java` was published
```

2. Add local maven to the sample project.

```sh
cd sentry-react-native/sample
```

Add local maven to `sample/android/build.gradle`.

```diff
+ allprojects {
+     repositories {
+         mavenLocal()
+     }
+ }
```

Update `sentry-android` version, to the one locally published, in `android/build.gradle`.

```diff
dependencies {
    implementation 'com.facebook.react:react-native:+'
-    api 'io.sentry:sentry-android:5.4.0'
+    api 'io.sentry:sentry-android:6.7.7-my-local-version'
}
```

# Contributing

This repository contains mono repository structure with multiple React Native and Expo project for development and testing.

# Overview

- / -> monorepo root private package
- /samples -> sample application, expo, rn...
- /packages -> RN SDK packages
- /dev-packages -> dev packages, ts-3.8 test runner, e2e tests components and runner
- /performance-tests -> applications used for measuring performance in CI

# Requirements

- nodejs 18 (with corepack globally installed)
- yarn version specified in `package.json` (at the moment version 3.6)

## Building

Install dependencies using:

```sh
yarn
```

Once deps are installed, you can build the project:

```sh
yarn build

# Or in watch mode, for development of the SDK core

cd packages/core
yarn build:sdk:watch
```

## Testing

```sh
yarn test

# Or the watcher when writing tests:
cd packages/core
yarn test:watch
```

## Running the sample

Now we can go into the sample project, install and build it:

```sh
cd samples/react-native/

yarn start # Metro development server

npx pod-install
yarn ios # iOS Development build
yarn android # Android Development build
```

Recommended is to open the native project in `samples/react-native/android` and `samples/react-native/ios` on Android Studio and Xcode respectively.

### Run the emulators (legacy-architecture):

For android switch `newArchEnabled` to `false` in [android/gradle.properties](https://github.com/getsentry/sentry-react-native/blob/c95aa21497ca93aaaaf0b44d170dc39dc7bcf660/sample-new-architecture/android/gradle.properties#L40). For iOS explicitly disable fabric in `samples/react-native/ios/Podfile` by setting `:fabric_enabled => false` before `pod install`.

```sh
yarn pod-install-legacy
yarn react-native run-ios

yarn react-native run-android

# Release builds
yarn pod-install-legacy-production
yarn react-native run-ios --mode=Release

yarn react-native run-android --mode=release
```

### Run the emulators (new-architecture):
```sh
yarn pod-install
yarn react-native run-ios

yarn react-native run-android

# Release builds
yarn pod-install-production
yarn react-native run-ios --mode=Release

yarn react-native run-android --mode=Release
```

## Running the macOS sample

Head to the macOS sample root directory:

```sh
cd samples/react-native-macos/
yarn
bundle install
yarn pod-install-legacy
yarn start
```

You can now build and run the project from command line:
```sh
yarn react-native run-macos
```

or by openning the `samples/react-native-macos/macos/sentry-react-native-sample.xcworkspace`.

_Note that the new architecture is not supported for the macOS sample at this point._

## Develop with sentry-cocoa

Here are step on how to test your changes in `sentry-cocoa` with `sentry-react-native`. We assume you have both repositories cloned in siblings folders.

1. Build `sentry-cocoa`.

```sh
cd sentry-cocoa
make init
```

2. Link local `sentry-cocoa` build in `sentry-react-native`

```sh
cd sentry-react-native
```

Comment out sentry dependency in `RNSentry.podspec`.

```diff
-   s.dependency 'Sentry/HybridSDK', '7.31.0'
+   s.dependency 'Sentry/HybridSDK'
```

Add local pods to `sample/ios/Podfile`.

```diff
target 'sample' do

  # ... react native config

 pod 'Sentry/HybridSDK', :path => '../../../../sentry-cocoa'
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

```gradle
allprojects {
    repositories {
        mavenLocal()
    }
}
```

Update `sentry-android` version, to the one locally published, in `android/build.gradle`.

```diff
dependencies {
    implementation 'com.facebook.react:react-native:+'
-    api 'io.sentry:sentry-android:5.4.0'
+    api 'io.sentry:sentry-android:6.7.7-my-local-version'
}
```

## Develop with sentry-android-gradle-plugin

Here are steps on how to debug the gradle builds process with `sentry-android-gradle-plugin`. We assume that you have `sentry-android-gradle-plugin` setup, Android SDK installed, correct JAVA version etc.

1. Add the following code to `samples/react-native/android/settings.gradle`, this ensure the plugin builds at the beginning of the application build:

```groovy
includeBuild('../../../../sentry-android-gradle-plugin/plugin-build') {
  dependencySubstitution {
    substitute(module 'io.sentry:sentry-android-gradle-plugin') using project(':')
  }
}
```

`../../../../sentry-android-gradle-plugin/plugin-build` this example works if `sentry-react-native` and `sentry-android-gradle-plugin` are sibling directories.

2. Open `samples/react-native/android` in Android Studio.
3. Add `Remote JVM Debug` configuration (keep all defaults).
4. Run build command with `-Dorg.gradle.debug=true` and `--no-daemon`, example:

```groovy
./gradlew assembleRelease -Dorg.gradle.debug=true --no-daemon
```

5. The build command will wait for the debugger connection, go to the Android Studio and select the newly created `Remote JVM Debug` configuration and click `Debug`.
6. The build process will stop on active breakpoint.

This module provides stubs for `expo-modules-core` interfaces (`Package` and `ReactNativeHostHandler`) needed to compile the Expo-specific source set (`android/src/expo/`).

The Expo source set registers a `ReactNativeHostHandler` that captures native exceptions swallowed by Expo's bridgeless error handling (`ExpoReactHostDelegate.handleInstanceException`). These stubs are added as a `compileOnly` dependency to `android/build.gradle` (meaning, they are not present at runtime). In Expo projects, the real `expo-modules-core` classes are available at runtime via Expo's autolinking.

## Updating the stubs

To update the stubs, just run `yarn build` from the root of the repo and it will recompile the classes and put them under `packages/core/android/libs/expo-stubs.jar`. Check this newly generated `.jar` in and push.

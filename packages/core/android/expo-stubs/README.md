This module provides stubs for `expo-modules-core` interfaces (`Package` and `ReactNativeHostHandler`) needed to compile the Expo handler tests in `RNSentryAndroidTester`.

The Expo handler (`android/expo-handler/`) registers a `ReactNativeHostHandler` that captures native exceptions swallowed by Expo's bridgeless error handling (`ExpoReactHostDelegate.handleInstanceException`). In Expo projects, the handler is compiled against the real `expo-modules-core` project. For unit testing in `RNSentryAndroidTester` (which doesn't have Expo), these stubs provide the interfaces at compile time.

## Updating the stubs

To update the stubs, just run `yarn build` from the root of the repo and it will recompile the classes and put them under `packages/core/android/libs/expo-stubs.jar`. Check this newly generated `.jar` in and push.

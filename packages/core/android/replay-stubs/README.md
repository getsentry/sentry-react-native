This module is needed to successfully compile the Android target for the cases when `sentry-android-replay` is excluded from the host app classpath (for example, to reduce the resulting bundle/apk size), e.g. via the following snippet:

```gradle
subprojects {
    configurations.all {
        exclude group: 'io.sentry', module: 'sentry-android-replay'
    }
}
```

It provides stubs for the Replay classes that are used by the React Native SDK and is being added as a `compileOnly` dependency to `android/build.gradle` (meaning, it is not present at runtime and does not affect our customers' code).

In addition, we also check for the `sentry-android-replay` classes presence at runtime and only then instantiate the replay-related classes (currently only `RNSentryReplayBreadcrumbConverter`) to not cause a `NoClassDefFoundError`.

## Updating the stubs

To update the stubs, just run `yarn build` from the root of the repo and it will recompile the classes and put them under `packages/core/android/libs/replay-stubs.jar`. Check this newly generated `.jar` in and push.

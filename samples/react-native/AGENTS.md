# samples/react-native — React Native Sample App

The end-to-end test bed for the SDK on a bare RN app. Use it to reproduce and verify a change on real devices/simulators, on **both** architectures.

## Running

```bash
yarn start    # Start Metro bundler
yarn ios      # Run iOS app (separate terminal)
yarn android  # Run Android app (separate terminal)
```

## New vs Old Architecture

The sample runs on either architecture — toggle, then reinstall pods / rebuild:

- **iOS:** `RCT_NEW_ARCH_ENABLED=1 npx pod-install` (unset for Old Arch).
- **Android:** `newArchEnabled` in `android/gradle.properties`.

A native change is only verified once it runs on both.

## Troubleshooting

**General build failures:**
- Clear node_modules and reinstall: `rm -rf node_modules && yarn install`

**iOS:**
- Clean build folder in Xcode: Cmd+Shift+K
- Reinstall pods: `npx pod-install`
- Full pod refresh: `cd ios && pod install --repo-update`

**Android:**
- Clean Gradle: `cd android && ./gradlew clean`

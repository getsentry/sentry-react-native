# samples/react-native — React Native Sample App

The end-to-end test bed for the SDK on a bare RN app. Use it to reproduce and verify a change on real devices/simulators, on **both** architectures.

## Running

```bash
yarn start    # Start Metro bundler
yarn ios      # Run iOS app (separate terminal)
yarn android  # Run Android app (separate terminal)
```

## iOS: pod install build matrix

The iOS build varies on three axes, and there's a `yarn` script per combination. Install pods through one of these rather than a bare `pod install` — each exports the env the Podfile and `pod update` read (`USE_FRAMEWORKS`, `ENABLE_PROD`, `ENABLE_NEW_ARCH`):

```
yarn pod-install-<debug|release>-<static|dynamic>[-legacy]
```

- **debug / release** → `ENABLE_PROD` (0/1)
- **static / dynamic** → `USE_FRAMEWORKS` framework linkage
- **New Arch (default) / `-legacy`** → `ENABLE_NEW_ARCH` (1/0)

e.g. `yarn pod-install-debug-static` (New Arch, static frameworks) or `yarn pod-install-release-dynamic-legacy` (Old Arch, dynamic frameworks). A native change is only verified once it runs across the arch and linkage combinations it can affect.

## Android: architecture toggle

Set `newArchEnabled` (`true`/`false`) in `android/gradle.properties`, then rebuild.

## Troubleshooting

**General build failures:**
- Clear node_modules and reinstall: `rm -rf node_modules && yarn install`

**iOS:**
- Clean build folder in Xcode: Cmd+Shift+K
- Reinstall pods: `npx pod-install`
- Full pod refresh: `cd ios && pod install --repo-update`

**Android:**
- Clean Gradle: `cd android && ./gradlew clean`

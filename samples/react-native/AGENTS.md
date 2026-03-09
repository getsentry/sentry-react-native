# samples/react-native — React Native Sample App

## Running

```bash
yarn start    # Start Metro bundler
yarn ios      # Run iOS app (separate terminal)
yarn android  # Run Android app (separate terminal)
```

## Troubleshooting

**General build failures:**
- Clear node_modules and reinstall: `rm -rf node_modules && yarn install`

**iOS:**
- Clean build folder in Xcode: Cmd+Shift+K
- Reinstall pods: `npx pod-install`
- Full pod refresh: `cd ios && pod install --repo-update`

**Android:**
- Clean Gradle: `cd android && ./gradlew clean`

# samples/expo — Expo Sample App

The test bed for the SDK under Expo (config plugin, Metro integration, EAS). Use it to verify a change behaves in an Expo-managed app, not just a bare RN one.

## Running

```bash
yarn start          # Start the dev server (expo start)
yarn ios            # Build & run the iOS dev client (expo run:ios)
yarn android        # Build & run the Android dev client (expo run:android)
```

`yarn start` then follows the Expo CLI prompts to open on an iOS simulator, Android emulator, or a physical device. Because the SDK ships native code, plain Expo Go isn't enough — the `run:*` scripts build a dev client that includes it.

<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <picture>
      <source srcset="https://sentry-brand.storage.googleapis.com/sentry-logo-white.png" media="(prefers-color-scheme: dark)" />
      <source srcset="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)" />
      <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" alt="Sentry" width="280" />
    </picture>
  </a>
</p>

# @sentry/expo-upload-sourcemaps

Command-line tool for uploading JavaScript bundles and source maps from Expo builds to Sentry, so that production error stack traces are symbolicated back to original source.

## Usage

```bash
SENTRY_AUTH_TOKEN=<your-auth-token> \
npx @sentry/expo-upload-sourcemaps dist
```

`dist` is the output directory produced by `npx expo export` or `eas update`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SENTRY_AUTH_TOKEN` | yes | Sentry auth token with `project:write` scope. |
| `SENTRY_ORG` | when no Expo plugin config is present | Sentry organization slug. Falls back to the `@sentry/react-native/expo` plugin config in `app.json` / `app.config.ts`, or the `defaults.org` entry in `android/sentry.properties` / `ios/sentry.properties`. |
| `SENTRY_PROJECT` | when no Expo plugin config is present | Sentry project slug. Same fallback order as above. |
| `SENTRY_URL` | optional | Sentry instance URL. Defaults to `https://sentry.io/`. |
| `SENTRY_CLI_EXECUTABLE` | optional | Path override for the `sentry-cli` binary. |

Environment variables are also read from `.env.sentry-build-plugin` at the project root.

## Relation to `@sentry/react-native`

The same CLI is re-exposed inside `@sentry/react-native` under the bin name `sentry-expo-upload-sourcemaps`. Projects that already have `@sentry/react-native` installed can invoke either form:

```bash
npx @sentry/expo-upload-sourcemaps dist
# or
npx sentry-expo-upload-sourcemaps dist
```

The new scoped form is preferred for new setups.

## Documentation

See the [Expo source maps guide](https://docs.sentry.io/platforms/react-native/sourcemaps/uploading/expo/) for end-to-end setup.

## License

Licensed under the MIT license. See [`LICENSE.md`](./LICENSE.md).

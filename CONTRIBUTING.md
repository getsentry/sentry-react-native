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

For android switch `newArchEnabled` to `false` in [android/gradle.properties](https://github.com/getsentry/sentry-react-native/blob/c95aa21497ca93aaaaf0b44d170dc39dc7bcf660/sample-new-architecture/android/gradle.properties#L40)

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

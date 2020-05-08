# Contributing

This repository contains a sample project. It can be used to test the SDK as you develop it.

# Requirements

You need:

- nodejs 8 or higher
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
cd sample/
yarn

# Build iOS
cd ios
pod install
cd ..
```

You can optionally start the Metro bundler if you want to control where it runs:

```sh
yarn start --reset-cache
```

Run the emulators:

```sh
yarn react-native run-ios
yarn react-native run-android
```

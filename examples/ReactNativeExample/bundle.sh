#!/bin/bash
mkdir tmp
react-native bundle --platform ios --entry-file index.ios.js --dev false --bundle-output ./tmp/main.jsbundle --sourcemap-output ./tmp/sourcemap.js
sentry-cli releases files "1.0" upload-sourcemaps ./tmp --url-prefix="/" --rewrite --strip-common-prefix
#rm -rf ./tmp
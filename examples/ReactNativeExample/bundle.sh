#!/bin/bash
mkdir tmp
react-native bundle --platform ios --entry-file index.ios.js --dev false --bundle-output ./tmp/main.jsbundle --sourcemap-output ./tmp/sourcemap.js
sentry-cli releases files "1.0" upload-sourcemaps ./tmp --ext "jsbundle" --ext "js" 
#--url-prefix="file:///var/containers/Bundle/Application/7B3E3E54-32D8-4840-83B3-02AE191AC72A/ReactNativeExample.app/"
#rm -rf ./tmp
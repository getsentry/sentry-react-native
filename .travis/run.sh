#!/bin/sh
cd appium
bundle install
pip wheel --wheel-dir wheelhouse -r requirements.txt
npm install -g react-native-cli
react-native -v
if [ "$LANE" = "ios" ];
then
    make test
else
    make test-android
fi

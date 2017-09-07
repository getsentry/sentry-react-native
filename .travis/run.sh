#!/bin/sh

if [ "$LANE" = "node" ];
then
npm run test-typescript
cd appium
make install
cd example
npm run test
else

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

fi

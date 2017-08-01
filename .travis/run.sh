#!/bin/sh
cd appium
bundle install
pip wheel --wheel-dir wheelhouse -r requirements.txt

if [ "$LANE" = "ios" ];
then
    make test
else
    make test-android
fi
fastlane $LANE

#!/bin/sh
set -e
if [ "$LANE" = "node" ]; then
    yarn install
    npm run test:typescript

    cd appium
    npm install -g react-native-cli
    make install

    cd example
    npm run test
else
    if [ "$TRAVIS_SECURE_ENV_VARS" != "true" ] ; then
        echo "SKIPPING device tests since not secure env"
        exit 0
    fi

    cd appium
    bundle install
    pip wheel --wheel-dir wheelhouse -r requirements.txt
    npm install -g react-native-cli
    react-native -v

    if [ "$LANE" = "ios" ]; then
        make test
    else
        make test-android
    fi
fi

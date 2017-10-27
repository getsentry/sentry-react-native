#!/bin/sh

if [ "$LANE" = "ios" ]; then
    brew update
    brew install yarn
    brew outdated yarn || brew upgrade yarn
elif [ "$LANE" = "android" ]; then
    nvm install 8
    node --version
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
    sudo apt-get update -qq
    sudo apt-get install -y -qq yarn
fi

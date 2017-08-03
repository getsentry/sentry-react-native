if [ "$LANE" = "ios" ];
brew update
brew install yarn
brew outdated yarn || brew upgrade yarn
else
nvm install 7
node --version
travis_retry curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
travis_retry sudo apt-get update -qq
travis_retry sudo apt-get install -y -qq yarn
fi

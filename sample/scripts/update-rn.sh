#!/usr/bin/env bash
set -euo pipefail

tagPrefix='v' # react-native has a prefix in the repo, but the package.json doesn't have that - we must align
repo="https://github.com/facebook/react-native.git"
packages=('react-native')

. $(dirname "$0")/../../scripts/update-package-json.sh

if [[ "$1" == "set-version" ]]; then
  # Also update package.json with all other dependencies
  (
    cd "$(dirname "$0")/.."
    yarn upgrade
    npx -y syncyarnlock --save --keepPrefix
    yarn install
  )
fi

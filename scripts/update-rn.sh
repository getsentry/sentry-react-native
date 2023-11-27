#!/usr/bin/env bash
set -euo pipefail

tagPrefix='v' # wizard has a prefix in the repo, but the package.json doesn't have that - we must align
repo="https://github.com/facebook/react-native.git"
packages=('react-native')

. $(dirname "$0")/update-package-json.sh

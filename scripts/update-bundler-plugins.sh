#!/usr/bin/env bash
set -euo pipefail

tagPrefix=''
repo="https://github.com/getsentry/sentry-javascript-bundler-plugins.git"
packages=('@sentry/babel-plugin-component-annotate')

. $(dirname "$0")/update-package-json.sh

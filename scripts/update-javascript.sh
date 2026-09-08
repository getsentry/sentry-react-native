#!/usr/bin/env bash
set -euo pipefail

tagPrefix=''
repo="https://github.com/getsentry/sentry-javascript.git"
packages=('@sentry/browser' '@sentry/core' '@sentry/react' '@sentry/typescript')
packages+=('@sentry/eslint-plugin-sdk')
packages+=('@sentry/bundler-plugins')

. $(dirname "$0")/update-package-json.sh

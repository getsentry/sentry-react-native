#!/usr/bin/env bash
set -euo pipefail

tagPrefix=''
repo="https://github.com/getsentry/sentry-javascript.git"
packages=('@sentry/browser' '@sentry/core' '@sentry/react' '@sentry/typescript')
packages+=('@sentry/eslint-plugin-sdk')

# Packages renamed in sentry-javascript 10.58.0 (https://github.com/getsentry/sentry-javascript/pull/21371)
renames=(
  '@sentry-internal/typescript:@sentry/typescript'
  '@sentry-internal/eslint-plugin-sdk:@sentry/eslint-plugin-sdk'
)

. $(dirname "$0")/update-package-json.sh

#!/usr/bin/env bash
set -euo pipefail

corepack enable # This repository uses Yarn v3 which requires corepack to be enabled

tagPrefix=''
repo="https://github.com/getsentry/sentry-javascript.git"
packages=('@sentry/browser' '@sentry/core' '@sentry/react' '@sentry/types' '@sentry/utils' '@sentry-internal/typescript')
packages+=('@sentry-internal/eslint-config-sdk' '@sentry-internal/eslint-plugin-sdk')

. $(dirname "$0")/update-package-json.sh

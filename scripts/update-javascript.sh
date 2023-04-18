#!/usr/bin/env bash
set -euo pipefail

tagPrefix=''
repo="https://github.com/getsentry/sentry-javascript.git"
packages=('@sentry/browser' '@sentry/core' '@sentry/hub' '@sentry/integrations' '@sentry/react' '@sentry/types' '@sentry/utils')
packages+=('@sentry-internal/eslint-config-sdk' '@sentry-internal/eslint-plugin-sdk')

. $(dirname "$0")/update-package-json.sh

#!/usr/bin/env bash
set -euo pipefail

tagPrefix=''
repo="https://github.com/getsentry/sentry-cli.git"
packages=('@sentry/cli')

. $(dirname "$0")/update-package-json.sh

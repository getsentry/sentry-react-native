#!/usr/bin/env bash
set -euo pipefail

tagPrefix='v' # wizard has a prefix in the repo, but the package.json doesn't have that - we must align
repo="https://github.com/getsentry/sentry-wizard.git"
packages=('@sentry/wizard')

. $(dirname "$0")/update-package-json.sh

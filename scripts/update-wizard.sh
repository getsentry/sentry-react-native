#!/usr/bin/env bash
set -euo pipefail

repo="https://github.com/getsentry/sentry-wizard.git"
packages=('@sentry/wizard')

. $(dirname "$0")/update-package-json.sh

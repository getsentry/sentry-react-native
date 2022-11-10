#!/usr/bin/env bash
set -euo pipefail

file="$(dirname "$0")/../RNSentry.podspec"
content=$(cat $file)
regex="('Sentry/HybridSDK', *)'([0-9\.]+)'"
if ! [[ $content =~ $regex ]]; then
    echo "Failed to find the plugin version in $file"
    exit 1
fi

case $1 in
get-version)
    echo ${BASH_REMATCH[2]}
    ;;
get-repo)
    echo "https://github.com/getsentry/sentry-cocoa.git"
    ;;
set-version)
    newValue="${BASH_REMATCH[1]}'$2'"
    echo "${content/${BASH_REMATCH[0]}/$newValue}" >$file
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac

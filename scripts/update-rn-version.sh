#!/usr/bin/env bash
set -euo pipefail

file="$(dirname "$0")/../packages/core/package.json"
content=$(cat $file)
regex='"version": *"([0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?)"'
if ! [[ $content =~ $regex ]]; then
    echo "Failed to find the version in $file"
    exit 1
fi

case $1 in
get-version)
    echo ${BASH_REMATCH[1]}
    ;;
get-repo)
    echo "https://github.com/getsentry/sentry-react-native.git"
    ;;
set-version)
    newValue="\"version\": \"$2\""
    echo "${content/${BASH_REMATCH[0]}/$newValue}" >$file
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac

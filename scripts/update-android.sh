#!/usr/bin/env bash
set -euo pipefail

cd $(dirname "$0")/../packages/core/android
file='build.gradle'
content=$(cat $file)
regex='(io\.sentry:sentry-android:)([0-9\.]+)'
if ! [[ $content =~ $regex ]]; then
    echo "Failed to find the android plugin version in $file"
    exit 1
fi

case $1 in
get-version)
    echo ${BASH_REMATCH[2]}
    ;;
get-repo)
    echo "https://github.com/getsentry/sentry-java.git"
    ;;
set-version)
    # Update all io.sentry dependencies to the same version
    newContent="$content"
    # Update sentry-android
    newContent=$(echo "$newContent" | sed -E "s/(io\.sentry:sentry-android:)([0-9\.]+)/\1$2/g")
    # Update sentry-spotlight
    newContent=$(echo "$newContent" | sed -E "s/(io\.sentry:sentry-spotlight:)([0-9\.]+)/\1$2/g")
    echo "$newContent" >$file
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac

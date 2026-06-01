#!/usr/bin/env bash
set -euo pipefail

ORIGINAL_DIR=$(cd "$(dirname "$0")" && pwd)
cd $(dirname "$0")/../packages/core/android
file='build.gradle'
content=$(cat $file)
regex="sentryAndroidVersion = '([0-9\.]+)'"
if ! [[ $content =~ $regex ]]; then
    echo "Failed to find the sentryAndroidVersion in $file"
    exit 1
fi

case $1 in
get-version)
    echo ${BASH_REMATCH[1]}
    ;;
get-repo)
    echo "https://github.com/getsentry/sentry-java.git"
    ;;
set-version)
    newContent=$(echo "$content" | sed -E "s/(sentryAndroidVersion = ')([0-9\.]+)(')/\1$2\3/g")
    echo "$newContent" >$file

    # Update sentry.gradle.kts version check to match
    sentryGradleFile='../sentry.gradle.kts'
    sentryGradleContent=$(cat $sentryGradleFile)
    sentryGradleContent=$(echo "$sentryGradleContent" | sed -E "s/(expectedSentryAndroidVersion = \")([0-9\.]+)(\")/\1$2\3/g")
    echo "$sentryGradleContent" >$sentryGradleFile

    # Update expo-handler to match
    expoHandlerFile='expo-handler/build.gradle'
    expoHandlerContent=$(cat $expoHandlerFile)
    expoHandlerContent=$(echo "$expoHandlerContent" | sed -E "s/(io\.sentry:sentry-android:)([0-9\.]+)/\1$2/g")
    echo "$expoHandlerContent" >$expoHandlerFile

    # Update replay-stubs to match
    cd $ORIGINAL_DIR
    ./update-android-stubs.sh set-version $2
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac

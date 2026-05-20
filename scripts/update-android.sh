#!/usr/bin/env bash
set -euo pipefail

ORIGINAL_DIR=$(cd "$(dirname "$0")" && pwd)
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

    # Update expo-handler to match
    expoHandlerFile='expo-handler/build.gradle'
    expoHandlerContent=$(cat $expoHandlerFile)
    expoHandlerContent=$(echo "$expoHandlerContent" | sed -E "s/(io\.sentry:sentry-android:)([0-9\.]+)/\1$2/g")
    echo "$expoHandlerContent" >$expoHandlerFile

    # Update expected version constant in RNSentryVersion.java
    versionFile='src/main/java/io/sentry/react/RNSentryVersion.java'
    versionContent=$(cat $versionFile)
    versionContent=$(echo "$versionContent" | sed -E "s/(EXPECTED_ANDROID_SDK_VERSION = \")([0-9\.]+)/\1$2/")
    echo "$versionContent" >$versionFile

    # Update replay-stubs to match
    cd $ORIGINAL_DIR
    ./update-android-stubs.sh set-version $2
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac

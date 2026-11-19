#!/bin/bash

# Exit on error
set -e

thisFilePath=$(dirname "$0")

cd "${thisFilePath}/../android"

rm -rf ../app.apk

if [[ "${RN_ARCHITECTURE}" == 'new' ]]; then
  perl -i -pe's/newArchEnabled=false/newArchEnabled=true/g' gradle.properties
  echo 'New Architecture enabled'
elif [[ "${RN_ARCHITECTURE}" == 'legacy' ]]; then
  perl -i -pe's/newArchEnabled=true/newArchEnabled=false/g' gradle.properties
  echo 'Legacy Architecture enabled'
else
  echo "No changes for architecture: ${RN_ARCHITECTURE}"
fi

echo "Building $CONFIG"

assembleConfig=$(python3 -c "print(\"${CONFIG}\".capitalize())")

./gradlew ":app:assemble${assembleConfig}" "$@"

cp "app/build/outputs/apk/${CONFIG}/app-${CONFIG}.apk" ../app.apk

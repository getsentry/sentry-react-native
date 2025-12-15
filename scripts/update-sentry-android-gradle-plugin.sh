#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 {get-version|get-repo|set-version <new_version>}"
  exit 1
fi

# Files to search and update Sentry Android Gradle Plugin version
files=(
  "$(dirname "$0")/../packages/core/plugin/src/withSentryAndroidGradlePlugin.ts"
  "$(dirname "$0")/../samples/react-native/android/build.gradle"
)

# Regex patterns to match version declarations
ts_regex="export const sentryAndroidGradlePluginVersion = ['\"]([0-9]+\.[0-9]+\.[0-9]+)['\"]"
gradle_regex="classpath\(['\"]io\.sentry:sentry-android-gradle-plugin:([0-9]+\.[0-9]+\.[0-9]+)['\"]"

# Sentry uses a prefix in the repo tags, but we want to remove it for the version in the files
tagPrefix='v'

first_match=""

for file in "${files[@]}"; do
  if [[ ! -f "$file" ]]; then
    continue
  fi
  while IFS= read -r line; do
    # Check both TypeScript and Gradle patterns
    if [[ $line =~ $ts_regex ]] || [[ $line =~ $gradle_regex ]]; then
      first_match="${BASH_REMATCH[1]}"
      break 2
    fi
  done < "$file"
done

if [[ -z "$first_match" && "$1" != "get-repo" ]]; then
  echo "Failed to find the Sentry Android Gradle Plugin version in any of the following files:"
  for file in "${files[@]}"; do
    echo "  - $file"
  done
  exit 1
fi

case $1 in
get-version)
  echo "$first_match"
  ;;

get-repo)
  echo "https://github.com/getsentry/sentry-android-gradle-plugin"
  ;;

set-version)
  if [ $# -ne 2 ]; then
    echo "Usage: $0 set-version <new_version>"
    exit 1
  fi
  new_version=$2
  # remove $tagPrefix from the $version by skipping the first `strlen($tagPrefix)` characters
  if [[ "$new_version" == "$tagPrefix"* ]]; then
      new_version="${new_version:${#tagPrefix}}"
  fi
  for file in "${files[@]}"; do
    if [[ ! -f "$file" ]]; then
      echo "⚠️ File not found: $file"
      continue
    fi
    updated=false
    tmpfile=$(mktemp)
    while IFS= read -r line; do
      if [[ $line =~ $ts_regex ]]; then
        new_line="export const sentryAndroidGradlePluginVersion = '${new_version}';"
        echo "$new_line" >> "$tmpfile"
        updated=true
      elif [[ $line =~ $gradle_regex ]]; then
        # Preserve the original quote style and indentation
        quote_char="'"
        if [[ $line == *\"* ]]; then
          quote_char="\""
        fi
        # Extract indentation from the original line
        indentation=$(echo "$line" | sed 's/[^ \t].*//')
        new_line="${indentation}classpath(${quote_char}io.sentry:sentry-android-gradle-plugin:${new_version}${quote_char})"
        echo "$new_line" >> "$tmpfile"
        updated=true
      else
        echo "$line" >> "$tmpfile"
      fi
    done < "$file"
    if $updated; then
      mv "$tmpfile" "$file"
      echo "✅ Updated $file to Sentry Android Gradle Plugin version: '$new_version'"
    else
      rm "$tmpfile"
      echo "⚠️ No Sentry Android Gradle Plugin version found in $file"
    fi
  done
  ;;

*)
  echo "Unknown argument $1"
  echo "Usage: $0 {get-version|get-repo|set-version <new_version>}"
  exit 1
  ;;
esac

#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 {get-version|get-repo|set-version <new_version>}"
  exit 1
fi

# yml files to search and update MAESTRO_VERSION
files=(
  "$(dirname "$0")/../.github/workflows/e2e.yml"
  "$(dirname "$0")/../.github/workflows/sample-application.yml"
)

# Regex to match lines like: MAESTRO_VERSION: '1.40.0'
regex="MAESTRO_VERSION: ['\"]([0-9]+\.[0-9]+\.[0-9]+)['\"]"

# maestro has a prefix in the repo, but we want to remove it for the version in the yml files
tagPrefix='v'

first_match=""

for file in "${files[@]}"; do
  while IFS= read -r line; do
    if [[ $line =~ $regex ]]; then
      first_match="${BASH_REMATCH[1]}"
      break 2
    fi
  done < "$file"
done

if [[ -z "$first_match" && "$1" != "get-repo" ]]; then
  echo "Failed to find the MAESTRO_VERSION in any of the following files:"
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
  echo "https://github.com/mobile-dev-inc/Maestro.git"
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
    updated=false
    tmpfile=$(mktemp)
    while IFS= read -r line; do
      if [[ $line =~ $regex ]]; then
        new_line="  MAESTRO_VERSION: '${new_version}'"
        echo "$new_line" >> "$tmpfile"
        updated=true
      else
        echo "$line" >> "$tmpfile"
      fi
    done < "$file"
    if $updated; then
      mv "$tmpfile" "$file"
      echo "✅ Updated $file to MAESTRO_VERSION: '$new_version'"
    else
      rm "$tmpfile"
      echo "⚠️ No MAESTRO_VERSION found in $file"
    fi
  done
  ;;

*)
  echo "Unknown argument $1"
  echo "Usage: $0 {get-version|get-repo|set-version <new_version>}"
  exit 1
  ;;
esac

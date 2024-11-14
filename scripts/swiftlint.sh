#!/bin/bash

set -eo pipefail

# Check if an argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <fix|lint>"
    exit 1
fi

# Set the mode based on the first argument
mode=$1

DARWIN_PATH="$(dirname "$0")/../node_modules/@expo/swiftlint/bin/darwin-arm64/swiftlint"
LINUX_PATH="$(dirname "$0")/../node_modules/@expo/swiftlint/bin/linux-x64/swiftlint"

if [[ "$OSTYPE" == "darwin"* ]]; then
    CMD="$DARWIN_PATH"
else
    CMD="$LINUX_PATH"
fi

if [ "$mode" = "fix" ]; then
    $CMD --fix
elif [ "$mode" = "lint" ]; then
    $CMD --strict
else
    echo "Invalid mode. Use 'fix' or 'lint'."
    exit 1
fi

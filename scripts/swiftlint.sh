#!/bin/bash

set -eo pipefail

# Check if an argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <fix|lint>"
    exit 1
fi

# Set the mode based on the first argument
mode=$1

SWIFT_PATH=$(which swift 2>/dev/null || true)

if [ -z "$SWIFT_PATH" ]; then
    echo "SwiftLint requires swift, which is not installed or not found in PATH"
    echo "To install Swift:"
    echo "  * ubuntu: follow steps here: https://www.swift.org/install/"
    echo "  * arch: yay -S swift-bin"
    exit 1
fi

LINUX_BIN="https://github.com/realm/SwiftLint/releases/download/0.61.0/swiftlint_linux_amd64.zip"
LINUX_SHA="sha256:02f4f580bbb27fb618dbfa24ce2f14c926461c85c26941289f58340151b63ae4"
DARWIN_BIN="https://github.com/realm/SwiftLint/releases/download/0.61.0/portable_swiftlint.zip"
DARWIN_SHA="sha256:2342f3784307a02117e18f745fcd350c6acc6cab0e521c0c0e01c32a53a3b274"

if [[ "$OSTYPE" == "darwin"* ]]; then
    EXPECTED_SHA="$DARWIN_SHA"
    EXPECTED_BIN="$DARWIN_BIN"
else
    EXPECTED_SHA="$LINUX_SHA"
    EXPECTED_BIN="$LINUX_BIN"
fi

# Make ../swiftlint folder if it doesn't exist
SWIFTLINT_DIR="$(dirname "$0")/../swiftlint"
mkdir -p "$SWIFTLINT_DIR"

# Skip download if sha256sum swiftlint.sha matches EXPECTED_SHA
SHA_FILE="$SWIFTLINT_DIR/swiftlint.sha"
if [ -f "$SHA_FILE" ] && [ "$(cat "$SHA_FILE")" = "$EXPECTED_SHA" ]; then
    echo "SwiftLint already downloaded and verified."
else
    echo "Clearing swiftlint folder..."
    rm -rf "$SWIFTLINT_DIR"/*

    echo "Downloading SwiftLint..."
    curl -L "$EXPECTED_BIN" -o "$SWIFTLINT_DIR/swiftlint.zip"
    unzip "$SWIFTLINT_DIR/swiftlint.zip" -d "$SWIFTLINT_DIR"
    # Save sha256sum of swiftlint.zip to ../swiftlint/swiftlint.sha
    echo "$EXPECTED_SHA" > "$SHA_FILE"
    # Remove swiftlint.zip
    rm "$SWIFTLINT_DIR/swiftlint.zip"
fi


DARWIN_PATH="$(dirname "$0")/../node_modules/@expo/swiftlint/bin/darwin-arm64/swiftlint"
LINUX_PATH="$(dirname "$0")/../node_modules/@expo/swiftlint/bin/linux-x64/swiftlint"

CMD="$(dirname "$0")/../swiftlint/swiftlint"

if [ "$mode" = "fix" ]; then
    $CMD --fix
elif [ "$mode" = "lint" ]; then
    $CMD --strict --no-cache
else
    echo "Invalid mode. Use 'fix' or 'lint'."
    exit 1
fi

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

LINUX_BIN="https://github.com/realm/SwiftLint/releases/download/0.63.2/swiftlint_linux_amd64.zip"
LINUX_SHA="sha256:dd1017cfd20a1457f264590bcb5875a6ee06cd75b9a9d4f77cd43a552499143b"
DARWIN_BIN="https://github.com/realm/SwiftLint/releases/download/0.63.2/portable_swiftlint.zip"
DARWIN_SHA="sha256:c59a405c85f95b92ced677a500804e081596a4cae4a6a485af76065557d6ed29"

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

if [ ! -f "$SHA_FILE" ] || [ "$(cat "$SHA_FILE")" != "$EXPECTED_SHA" ]; then
    echo "Invalid SwiftLint, sha doesn't match the expected download."
    exit 1
fi

CMD="$(dirname "$0")/../swiftlint/swiftlint"

if [ "$mode" = "fix" ]; then
    $CMD --fix
elif [ "$mode" = "lint" ]; then
    $CMD --strict
else
    echo "Invalid mode. Use 'fix' or 'lint'."
    exit 1
fi

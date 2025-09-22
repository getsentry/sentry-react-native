#!/bin/bash

set -eo pipefail

echo "💡 If you get 'spawn Unknown system error -86', try running this script manually:"
echo "   ./scripts/clang-format.sh $1"
echo "💡 It is also recommended to use clang-version v20 or v21."

# Prioritize finding clang-format executable from brew since the run-s may introduce X86/ARM64 mismatch.
CLANG_FORMAT_PATH=""
if [ -f "/opt/homebrew/bin/clang-format" ]; then
    CLANG_FORMAT_PATH="/opt/homebrew/bin/clang-format"
else
    CLANG_FORMAT_PATH=$(which clang-format 2>/dev/null || true)
fi

if [ -z "$CLANG_FORMAT_PATH" ]; then
    echo "❌ clang-format is not installed or not found in PATH"
    echo ""
    echo "To install clang-format:"
    echo "  * macOS: brew install clang-format"
    echo "  * Ubuntu: install package clang-format or clang-tools-extra"
    echo "  * Arch: pacman -S clang llvm llvm-libs"
    exit 1
fi

CLANG_VERSION="$("$CLANG_FORMAT_PATH" --version 2>/dev/null)"
CLANG_MAJOR_VERSION="$(printf '%s' "$CLANG_VERSION" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1 | cut -d. -f1)"

echo "clang-format version: $CLANG_VERSION, MAJOR: $CLANG_MAJOR_VERSION"

if ! printf '%s' "$CLANG_MAJOR_VERSION" | grep -qE '^[0-9]+$'; then
    echo "❌ Could not parse clang-format version from: $CLANG_VERSION"
    exit 1
fi

REQUIRED_MAJOR=20
if [ "$CLANG_MAJOR_VERSION" -lt "$REQUIRED_MAJOR" ]; then
    echo "❌ clang-format major version $CLANG_MAJOR_VERSION is lower than required $REQUIRED_MAJOR"
    exit 1
fi

# Check if an argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <fix|lint>"
    exit 1
fi

# Set the mode based on the first argument
mode=$1

# Base command
cmd="find . -type f \( \
    -name \"*.h\" -or \
    -name \"*.hpp\" -or \
    -name \"*.c\" -or \
    -name \"*.cpp\" -or \
    -name \"*.m\" -or \
    -name \"*.mm\" \) -and \
    ! \( \
    -path \"**.build/*\" -or \
    -path \"**Build/*\" -or \
    -path \"**ios/build/**\" -or \
    -path \"**android/build/**\" -or \
    -path \"**.cxx/**\" -or \
    -path \"**build/generated/**\" -or \
    -path \"**/Carthage/Checkouts/*\" -or \
    -path \"**/libs/**\" -or \
    -path \"**/.yalc/**\" -or \
    -path \"**/node_modules/**\" -or \
    -path \"**/gems/**\" -or \
    -path \"**/Pods/**\" \) \
    | xargs \"$CLANG_FORMAT_PATH\" --Werror --verbose -i -style=file"

# Add --replace flag if mode is 'fix'
if [ "$mode" = "fix" ]; then
    echo "clang-format fixing files..."
elif [ "$mode" = "lint" ]; then
    echo "clang-format lint files..."
    cmd+=" --dry-run"
else
    echo "Invalid mode. Use 'fix' or 'lint'."
    exit 1
fi

eval $cmd

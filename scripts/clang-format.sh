#!/bin/bash

set -eo pipefail

echo "💡 If you get 'spawn Unknown system error -86', try running this script manually:"
echo "   ./scripts/clang-format.sh $1"
echo ""

# Prioritize finding clang-format executable from brew since the run-s may introduce X86/ARM64 mismatch.
CLANG_FORMAT_PATH=""
if [ -f "/opt/homebrew/bin/clang-format" ]; then
    CLANG_FORMAT_PATH="/opt/homebrew/bin/clang-format"
elif [ -f "/usr/local/bin/clang-format" ]; then
    CLANG_FORMAT_PATH="/usr/local/bin/clang-format"
else
    CLANG_FORMAT_PATH=$(which clang-format 2>/dev/null)
fi

if [ -z "$CLANG_FORMAT_PATH" ]; then
    echo "❌ clang-format is not installed or not found in PATH"
    echo ""
    echo "To install clang-format:"
    echo "  • macOS: brew install clang-format"
    echo "  • Linux: install package clang-format or clang-tools-extra"
    echo ""
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

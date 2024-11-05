#!/bin/bash

set -eo pipefail

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
    | xargs npx clang-format --Werror --verbose -i -style=file"

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

#!/bin/bash

# Array of glob patterns
glob_patterns=(
    "samples/react-native/android/app/src/**/*.java"
    "packages/core/android/**/*.java"
    "performance-tests/TestAppPlain/android/app/src/**/*.java"
    "performance-tests/TestAppSentry/android/app/src/**/*.java"
)

# Check if an argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <fix|lint>"
    exit 1
fi

# Set the mode based on the first argument
mode=$1

# Base command
base_cmd="npx google-java-format"

# Add --replace flag if mode is 'fix'
if [ "$mode" = "fix" ]; then
    base_cmd+=" --replace"
elif [ "$mode" = "lint" ]; then
    base_cmd+=" --set-exit-if-changed"
else
    echo "Invalid mode. Use 'fix' or 'lint'."
    exit 1
fi

# Variable to track if any command failed
any_failed=0

# Loop through the glob patterns and execute the command
for pattern in "${glob_patterns[@]}"; do
    cmd="$base_cmd --glob='$pattern'"
    echo "Executing: $cmd"
    eval $cmd

    # Check the exit status of the command
    if [ $? -ne 0 ]; then
        echo "Command failed: $cmd"
        any_failed=1
    fi
done

# Exit with code 1 if any command failed
if [ $any_failed -eq 1 ]; then
    echo "One or more commands failed."
    exit 1
fi

echo "All commands completed successfully."
exit 0

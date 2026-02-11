#!/bin/bash
# Manual test script for dSYM wait functionality
# This simulates the wait behavior without needing a full Xcode build

set -x

# Create a test directory
TEST_DIR="/tmp/sentry-dsym-wait-test-$$"
mkdir -p "$TEST_DIR"

echo "=== Test 1: dSYM appears immediately ==="
DSYM_DIR="$TEST_DIR/test1"
mkdir -p "$DSYM_DIR/TestApp.app.dSYM"
export DWARF_DSYM_FOLDER_PATH="$DSYM_DIR"
export DWARF_DSYM_FILE_NAME="TestApp.app.dSYM"
export SENTRY_DSYM_WAIT_MAX_ATTEMPTS=3
export SENTRY_DSYM_WAIT_INTERVAL=1

# Source the wait function
source "$(dirname "$0")/sentry-xcode-debug-files.sh" 2>/dev/null || {
    # If sourcing fails, extract just the wait function
    eval "$(sed -n '/^wait_for_dsym_files()/,/^}/p' "$(dirname "$0")/sentry-xcode-debug-files.sh")"
}

wait_for_dsym_files
echo "Test 1 result: $?"
echo ""

echo "=== Test 2: dSYM appears after delay ==="
DSYM_DIR2="$TEST_DIR/test2"
mkdir -p "$DSYM_DIR2"
export DWARF_DSYM_FOLDER_PATH="$DSYM_DIR2"
export DWARF_DSYM_FILE_NAME="DelayedApp.app.dSYM"

# Create dSYM in background after 2 seconds
(sleep 2 && mkdir -p "$DSYM_DIR2/DelayedApp.app.dSYM" && echo "Background: Created dSYM") &

wait_for_dsym_files
echo "Test 2 result: $?"
echo ""

echo "=== Test 3: dSYM never appears (timeout) ==="
DSYM_DIR3="$TEST_DIR/test3"
mkdir -p "$DSYM_DIR3"
export DWARF_DSYM_FOLDER_PATH="$DSYM_DIR3"
export DWARF_DSYM_FILE_NAME="NeverExists.app.dSYM"
export SENTRY_DSYM_WAIT_MAX_ATTEMPTS=2

wait_for_dsym_files
echo "Test 3 result: $?"
echo ""

echo "=== Test 4: Wait disabled ==="
export SENTRY_DSYM_WAIT_ENABLED=false
wait_for_dsym_files
echo "Test 4 result: $?"
echo ""

# Cleanup
rm -rf "$TEST_DIR"
echo "=== All tests complete ==="

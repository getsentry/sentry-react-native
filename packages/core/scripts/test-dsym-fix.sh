#!/bin/bash
# Test script to verify dSYM upload fix
# Usage: ./test-dsym-fix.sh [test-project-path]

set -e

PROJECT_PATH="${1:-.}"
SDK_PATH="$(cd "$(dirname "$0")/../../.." && pwd)"

echo "=== Sentry React Native dSYM Fix Testing ==="
echo ""
echo "SDK Path: $SDK_PATH"
echo "Project Path: $PROJECT_PATH"
echo ""

# Function to check Sentry debug files
check_sentry_debug_files() {
    echo "=== Checking Sentry Debug Files ==="
    echo ""
    echo "Please check Sentry Debug Files manually:"
    echo "1. Go to: https://sentry.io"
    echo "2. Navigate to: Settings > Projects > [Your Project] > Debug Files"
    echo "3. Look for recent uploads with 'debug' tag"
    echo ""
    echo "Expected to see:"
    echo "  ✓ Main app dSYM with 'debug' tag (~145MB)"
    echo "  ✓ Framework dSYMs"
    echo ""
    read -p "Press Enter to continue..."
}

# Test with current version
test_current_version() {
    echo "=== Phase 1: Testing with v7.12.1 (current stable) ==="
    echo ""

    cd "$PROJECT_PATH"

    echo "Installing @sentry/react-native@7.12.1..."
    yarn add @sentry/react-native@7.12.1 || npm install @sentry/react-native@7.12.1

    echo ""
    echo "Cleaning and regenerating native code..."
    npx expo prebuild --clean

    echo ""
    echo "Building with EAS..."
    echo "Watch for 'Upload Debug Symbols to Sentry' in logs"
    echo ""

    eas build --platform ios --profile production --local 2>&1 | tee build-v7.12.1.log

    echo ""
    check_sentry_debug_files
}

# Test with our fix
test_with_fix() {
    echo "=== Phase 2: Testing with dSYM wait fix ==="
    echo ""

    cd "$SDK_PATH"
    echo "Building SDK..."
    yarn build

    cd "$PROJECT_PATH"

    echo ""
    echo "Linking to local SDK..."
    yarn link "$SDK_PATH/packages/core" || npm link "$SDK_PATH/packages/core"

    echo ""
    echo "Cleaning and regenerating native code..."
    npx expo prebuild --clean

    echo ""
    echo "Building with debug logging enabled..."
    echo "Look for:"
    echo "  - 'DEBUG: DWARF_DSYM_FOLDER_PATH=...'"
    echo "  - 'DEBUG: DWARF_DSYM_FILE_NAME=...'"
    echo "  - 'Verified main app dSYM is complete'"
    echo ""

    SENTRY_DSYM_DEBUG=true eas build --platform ios --profile production --local 2>&1 | tee build-with-fix.log

    echo ""
    check_sentry_debug_files
}

# Main menu
echo "Choose test to run:"
echo "1) Test current v7.12.1 (reproduce issue)"
echo "2) Test with fix (verify solution)"
echo "3) Run both tests"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        test_current_version
        ;;
    2)
        test_with_fix
        ;;
    3)
        test_current_version
        echo ""
        echo "========================================"
        echo ""
        test_with_fix
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=== Testing Complete ==="
echo ""
echo "Build logs saved:"
echo "  - build-v7.12.1.log (if tested)"
echo "  - build-with-fix.log (if tested)"
echo ""
echo "Please compare the results in Sentry Debug Files"

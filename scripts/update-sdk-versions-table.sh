#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_FILE="$SCRIPT_DIR/../SDK-VERSIONS.md"

# Get current versions
RN_VERSION=$("$SCRIPT_DIR/update-rn-version.sh" get-version)
ANDROID_VERSION=$("$SCRIPT_DIR/update-android.sh" get-version)
COCOA_VERSION=$("$SCRIPT_DIR/update-cocoa.sh" get-version)
JS_VERSION=$("$SCRIPT_DIR/update-javascript.sh" get-version)

echo "Current versions:"
echo "  React Native SDK: $RN_VERSION"
echo "  Android SDK: $ANDROID_VERSION"
echo "  Cocoa SDK: $COCOA_VERSION"
echo "  JavaScript SDK: $JS_VERSION"

# Create the new row
NEW_ROW="| $RN_VERSION | $ANDROID_VERSION | $COCOA_VERSION | $JS_VERSION |"

# Check if the docs file exists
if [ ! -f "$DOCS_FILE" ]; then
    echo "Creating $DOCS_FILE..."
    cat > "$DOCS_FILE" << EOF
# SDK Versions

This page lists which versions of the [Sentry Android SDK](https://github.com/getsentry/sentry-java), [Sentry Cocoa SDK](https://github.com/getsentry/sentry-cocoa), and [Sentry JavaScript SDK](https://github.com/getsentry/sentry-javascript) are bundled with each Sentry React Native SDK release.

## Maintenance

The SDK versions table is automatically updated during each release via the \`craft-pre-release.sh\` script.

To manually update the table with the current version, run \`./scripts/update-sdk-versions-table.sh\` from the repository root directory.

## Versions

| Sentry React Native SDK | Sentry Android SDK | Sentry Cocoa SDK | Sentry JavaScript SDK |
| ----------------------- | ------------------ | ---------------- | --------------------- |
$NEW_ROW
EOF
    echo "Created $DOCS_FILE with initial version entry"
else
    # Check if this version already exists in the table
    if grep -q "^| $RN_VERSION |" "$DOCS_FILE"; then
        echo "Version $RN_VERSION already exists in the table. Updating it..."
        # Update the existing row
        awk -v new_row="$NEW_ROW" -v rn_version="$RN_VERSION" '
            /^\| [0-9]/ {
                if ($2 == rn_version) {
                    print new_row
                    next
                }
            }
            { print }
        ' "$DOCS_FILE" > "$DOCS_FILE.tmp"
        mv "$DOCS_FILE.tmp" "$DOCS_FILE"
        echo "Updated version $RN_VERSION in $DOCS_FILE"
    else
        echo "Adding new version to $DOCS_FILE..."
        # Find the header separator line and insert the new row after it
        awk -v new_row="$NEW_ROW" '
            BEGIN { added = 0 }
            /^\| Sentry React Native SDK \|/ && added == 0 {
                print
                getline
                print
                print new_row
                added = 1
                next
            }
            { print }
        ' "$DOCS_FILE" > "$DOCS_FILE.tmp"
        mv "$DOCS_FILE.tmp" "$DOCS_FILE"
        echo "Added version $RN_VERSION to $DOCS_FILE"
    fi
fi

echo "Done!"

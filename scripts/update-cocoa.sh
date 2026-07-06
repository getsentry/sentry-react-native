#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
podspec="$script_dir/../packages/core/RNSentry.podspec"
utils="$script_dir/../packages/core/scripts/sentry_utils.rb"

content=$(cat "$podspec")
regex="(sentry_cocoa_version *= *)'([0-9\.]+)'"
if ! [[ $content =~ $regex ]]; then
    echo "Failed to find the plugin version in $podspec"
    exit 1
fi

case $1 in
get-version)
    echo "${BASH_REMATCH[2]}"
    ;;
get-repo)
    echo "https://github.com/getsentry/sentry-cocoa.git"
    ;;
set-version)
    new_version="$2"

    # 1. Update `sentry_cocoa_version` in the podspec.
    newValue="${BASH_REMATCH[1]}'$new_version'"
    printf '%s\n' "${content/${BASH_REMATCH[0]}/$newValue}" >"$podspec"

    # 2. Refresh the `Sentry.xcframework.zip` SHA256 checksum in
    #    `sentry_utils.rb`. The checksum table has a single version key
    #    that we rewrite in place — download the new archive, compute
    #    its SHA256, then patch the version key and the `'Sentry'` line.
    #    `pod install` verifies against this checksum on every fresh
    #    install so a stale value here breaks every user's build with a
    #    loud mismatch error rather than a silent corruption.
    zip_url="https://github.com/getsentry/sentry-cocoa/releases/download/${new_version}/Sentry.xcframework.zip"
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' EXIT
    echo "Fetching ${zip_url}..."
    curl -fsSL --retry 3 -o "$tmp_dir/Sentry.xcframework.zip" "$zip_url"
    new_sha=$(shasum -a 256 "$tmp_dir/Sentry.xcframework.zip" | awk '{print $1}')
    echo "Sentry.xcframework.zip SHA256: ${new_sha}"

    # Update the version key (any semver-shaped key opening the hash).
    perl -i -pe "s|'\\d+\\.\\d+\\.\\d+' => \\{|'${new_version}' => {|" "$utils"
    # Update the `Sentry` checksum (a 64-char lowercase hex string).
    perl -i -pe "s|'Sentry' => '[a-f0-9]{64}'|'Sentry' => '${new_sha}'|" "$utils"

    # Sanity-check: both lines got rewritten with the new values.
    if ! grep -q "'${new_version}' =>" "$utils"; then
        echo "Failed to rewrite the checksum version key in $utils"
        exit 1
    fi
    if ! grep -q "'Sentry' => '${new_sha}'" "$utils"; then
        echo "Failed to rewrite the Sentry checksum in $utils"
        exit 1
    fi
    ;;
*)
    echo "Unknown argument $1"
    exit 1
    ;;
esac

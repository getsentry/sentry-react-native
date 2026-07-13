#!/bin/bash

# Verifies native libraries (`.so`) bundled inside an Android APK/AAB have
# their ELF LOAD segments aligned to at least 16 KB (`p_align >= 0x4000`).
#
# Android 15+ devices with a 16 KB page size (and Google Play's 16 KB
# requirement) reject apps that ship a `.so` aligned to only 4 KB. Libraries
# built from source with NDK r27 and earlier default to 4 KB, so this check
# guards against a regression like https://github.com/getsentry/sentry-react-native/issues/6394
# where `libsentry-tm-perf-logger.so` shipped misaligned.
#
# By default every `.so` is checked. Pass a name filter (a regex matched
# against each library's path) to restrict the check to the libraries this
# repo actually controls — third-party/React Native libraries are aligned by
# their own build (RN ships arm64 at 16 KB but x86 at 4 KB, so a whole-APK
# check is not meaningful on the x86 builds CI produces).
#
# Usage: scripts/check-android-16kb-alignment.sh <path-to-apk-or-aab> [name-filter-regex]
#   e.g. scripts/check-android-16kb-alignment.sh app.apk 'libsentry'
#
# `readelf` is resolved from (in order): $READELF, `llvm-readelf`, `readelf`.

set -euo pipefail

REQUIRED_ALIGN=16384 # 16 KB, expressed in bytes

apk="${1:-}"
name_filter="${2:-}"
if [[ -z "$apk" || ! -f "$apk" ]]; then
  echo "usage: $0 <path-to-apk-or-aab> [name-filter-regex]" >&2
  exit 2
fi

readelf_bin="${READELF:-}"
if [[ -z "$readelf_bin" ]]; then
  if command -v llvm-readelf >/dev/null 2>&1; then
    readelf_bin="llvm-readelf"
  elif command -v readelf >/dev/null 2>&1; then
    readelf_bin="readelf"
  else
    echo "error: neither 'llvm-readelf' nor 'readelf' found on PATH (set \$READELF to override)" >&2
    exit 2
  fi
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# Extract only the native libraries. APK and AAB both store them under a
# top-level `lib/` (APK) or `base/lib/` (AAB) directory.
unzip -qq -o "$apk" 'lib/*' 'base/lib/*' -d "$workdir" 2>/dev/null || true

libs=()
while IFS= read -r lib; do
  if [[ -n "$name_filter" && ! "$lib" =~ $name_filter ]]; then
    continue
  fi
  libs+=("$lib")
done < <(find "$workdir" -type f -name '*.so' | sort)
if [[ ${#libs[@]} -eq 0 ]]; then
  if [[ -n "$name_filter" ]]; then
    echo "error: no .so libraries matching /$name_filter/ found inside $apk" >&2
  else
    echo "error: no .so libraries found inside $apk" >&2
  fi
  exit 2
fi

misaligned=()
for lib in "${libs[@]}"; do
  rel="${lib#"$workdir"/}"
  # Smallest LOAD-segment alignment in this library, in bytes. `readelf`
  # prints the align column as a hex literal (e.g. `0x4000`); bash arithmetic
  # parses the `0x` prefix directly, so we avoid gawk-only `strtonum`.
  min_align=0
  while IFS= read -r align_hex; do
    [[ -z "$align_hex" ]] && continue
    align=$((align_hex))
    if [[ "$min_align" -eq 0 || "$align" -lt "$min_align" ]]; then
      min_align="$align"
    fi
  done < <("$readelf_bin" -lW "$lib" | awk '$1 == "LOAD" { print $NF }')

  if [[ "$min_align" -eq 0 ]]; then
    echo "warn:  $rel — no LOAD segments found, skipping" >&2
    continue
  fi

  if [[ "$min_align" -lt "$REQUIRED_ALIGN" ]]; then
    misaligned+=("$rel (align=$min_align)")
    printf 'FAIL:  %-48s align=%d (need >= %d)\n' "$rel" "$min_align" "$REQUIRED_ALIGN"
  else
    printf 'OK:    %-48s align=%d\n' "$rel" "$min_align"
  fi
done

echo
if [[ ${#misaligned[@]} -gt 0 ]]; then
  echo "✖ ${#misaligned[@]} library/libraries are not 16 KB aligned:" >&2
  for m in "${misaligned[@]}"; do echo "    - $m" >&2; done
  echo "  Pass -Wl,-z,max-page-size=16384 when linking, or build with NDK r28+." >&2
  exit 1
fi

echo "✔ all ${#libs[@]} libraries are >= 16 KB aligned"

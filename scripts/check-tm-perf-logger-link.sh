#!/bin/bash

# Regression guard for https://github.com/getsentry/sentry-react-native/issues/6398
#
# `libsentry-tm-perf-logger.so` is compiled from source in the consuming app and
# references `facebook::react::TurboModulePerfLogger::enableLogging`, which lives
# in React Native's `reactnative` prefab. On some New Architecture setups (e.g.
# Expo builds on armeabi-v7a) that reference is not satisfied at link time, and
# because the NDK/AGP toolchain links with `-Wl,-z,defs` (`--no-undefined`) the
# unresolved symbol becomes a fatal error that breaks the whole Android build.
# The fix (see src/main/jni/CMakeLists.txt) appends `-Wl,-z,undefs` so undefined
# symbols are non-fatal and resolve at load time instead.
#
# This check reproduces that exact link condition for armeabi-v7a using the real
# sources and the real link flags declared in CMakeLists.txt:
#   1. Control  — link WITHOUT the fix flags: must FAIL (proves the reproduction
#                 is still valid; if it starts passing the check is stale).
#   2. Fixed    — link WITH the flags CMakeLists.txt actually declares: must PASS
#                 (fails if `-Wl,-z,undefs` is ever removed from CMakeLists.txt).
#
# Requires an Android NDK (found via $ANDROID_NDK_* / $ANDROID_HOME/ndk) and a
# React Native install (resolved from packages/core, or $REACT_NATIVE_DIR).

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cmakelists="$repo_root/packages/core/android/src/main/jni/CMakeLists.txt"
cpp_dir="$repo_root/packages/core/cpp"
jni_dir="$repo_root/packages/core/android/src/main/jni"

# --- Resolve the React Native source tree (for ReactCommon headers) ----------
rn_dir="${REACT_NATIVE_DIR:-}"
if [[ -z "$rn_dir" ]]; then
  rn_dir="$(cd "$repo_root/packages/core" && node -p "require('path').dirname(require.resolve('react-native/package.json'))" 2>/dev/null || true)"
fi
if [[ -z "$rn_dir" || ! -d "$rn_dir/ReactCommon" ]]; then
  echo "error: could not locate react-native (set \$REACT_NATIVE_DIR to its root)" >&2
  exit 2
fi

# --- Locate the NDK clang++ --------------------------------------------------
find_clang() {
  local host
  case "$(uname -s)" in
    Darwin) host="darwin-x86_64" ;;
    *) host="linux-x86_64" ;;
  esac
  local roots=()
  [[ -n "${ANDROID_NDK_HOME:-}" ]] && roots+=("$ANDROID_NDK_HOME")
  [[ -n "${ANDROID_NDK_LATEST_HOME:-}" ]] && roots+=("$ANDROID_NDK_LATEST_HOME")
  [[ -n "${ANDROID_NDK_ROOT:-}" ]] && roots+=("$ANDROID_NDK_ROOT")
  for base in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    [[ -d "$base/ndk" ]] && while IFS= read -r d; do roots+=("$d"); done < <(find "$base/ndk" -maxdepth 1 -mindepth 1 -type d | sort -r)
  done
  for r in "${roots[@]}"; do
    local c="$r/toolchains/llvm/prebuilt/$host/bin/clang++"
    [[ -x "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}
clang="$(find_clang || true)"
if [[ -z "$clang" ]]; then
  echo "error: could not find an Android NDK clang++ (set \$ANDROID_NDK_HOME)" >&2
  exit 2
fi

# --- Extract the link flags the CMakeLists.txt actually declares --------------
# Everything the target passes via target_link_options(... "-Wl,..."), verbatim.
fix_flags=()
while IFS= read -r f; do fix_flags+=("$f"); done < <(grep -oE '"-Wl,[^"]+"' "$cmakelists" | tr -d '"')
if [[ ${#fix_flags[@]} -eq 0 ]]; then
  echo "error: no -Wl link flags found in $cmakelists (has the target changed?)" >&2
  exit 2
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

includes=(
  -I "$cpp_dir"
  -I "$rn_dir/ReactCommon/react/nativemodule/core"
  -I "$rn_dir/ReactCommon/reactperflogger"
  -I "$rn_dir/ReactCommon"
  -I "$rn_dir/ReactCommon/callinvoker"
)
sources=("$cpp_dir/SentryTurboModulePerfLogger.cpp" "$jni_dir/OnLoad.cpp")

# Reproduce the failing condition: armeabi-v7a, -shared, `--no-undefined`, and
# the `reactnative` prefab NOT linked (so `enableLogging` is unresolved).
link() {
  "$clang" --target=armv7-none-linux-androideabi21 -std=c++20 -fPIC -shared \
    -DRCT_NEW_ARCH_ENABLED=1 "${includes[@]}" "${sources[@]}" \
    -Wl,--no-undefined "$@" -o "$workdir/out.so" 2>"$workdir/err.txt"
}

echo "NDK clang: $clang"
echo "React Native: $rn_dir"
echo "CMakeLists link flags: ${fix_flags[*]}"
echo

# --- 1) Control: without the fix flags, the link MUST fail -------------------
rm -f "$workdir/out.so"
if link; then
  echo "✖ CONTROL UNEXPECTEDLY LINKED — the reproduction is stale." >&2
  echo "  '$0' no longer exercises the #6398 condition (did RN inline the symbol," >&2
  echo "  or did the toolchain stop passing --no-undefined?). Update this check." >&2
  exit 1
fi
echo "✔ control link fails as expected (undefined symbol without the fix)"

# --- 2) Fixed: with the flags CMakeLists declares, the link MUST succeed ------
rm -f "$workdir/out.so"
if ! link "${fix_flags[@]}"; then
  echo "✖ FIXED LINK FAILED — CMakeLists.txt no longer prevents the #6398 build break." >&2
  echo "  Ensure the sentry-tm-perf-logger target keeps '-Wl,-z,undefs'." >&2
  echo "  Linker output:" >&2
  sed 's/^/    /' "$workdir/err.txt" >&2
  exit 1
fi
echo "✔ fixed link succeeds with CMakeLists flags (${fix_flags[*]})"
echo
echo "✔ #6398 link regression guard passed"

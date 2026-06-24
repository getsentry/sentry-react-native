# Copyright (c) Sentry. All rights reserved.
#
# Builds `libsentry-tm-perf-logger.so`, the Sentry-owned shared library that
# installs a `facebook::react::NativeModulePerfLogger` into React Native at
# JNI load time.
#
# This CMake target is wired up only when the consuming app is built with
# React Native's New Architecture (the only mode where `TurboModulePerfLogger`
# exists). The gradle script in `build.gradle` enables `externalNativeBuild`
# and `buildFeatures { prefab true }` exclusively when `newArchEnabled` is
# set, so this file is never invoked under Old Arch. The file lives under
# `src/main/jni/` (rather than the module root) so AGP's CMakeLists
# auto-detection cannot pick it up on Old Arch builds where the gradle
# `externalNativeBuild` block is intentionally absent — a stray
# auto-detection there would attempt to link against `ReactAndroid::reactnative`,
# which only ships in the New Architecture prefab AAR.

cmake_minimum_required(VERSION 3.13)
project(sentry-tm-perf-logger CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build the shared library from the shared C++ source (also compiled into
# `RNSentry.framework` on iOS) plus the Android-specific JNI hook. Paths
# are relative to this file: `<module>/src/main/jni/`.
add_library(
    sentry-tm-perf-logger
    SHARED
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp/SentryTurboModulePerfLogger.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/OnLoad.cpp
)

target_include_directories(
    sentry-tm-perf-logger
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/../../../../cpp
        # ReactAndroid's prefab exposes <ReactCommon/TurboModulePerfLogger.h>
        # but not the <reactperflogger/NativeModulePerfLogger.h> it
        # transitively pulls in. Add the source tree's reactperflogger dir to
        # plug the gap. `REACT_NATIVE_DIR` is provided by `build.gradle`.
        ${REACT_NATIVE_DIR}/ReactCommon/reactperflogger
)

# `RCT_NEW_ARCH_ENABLED` is the same flag the iOS side checks; the
# implementation in `SentryTurboModulePerfLogger.cpp` keys off it (combined
# with `__ANDROID__`) to decide whether to compile the real install path.
target_compile_definitions(
    sentry-tm-perf-logger
    PRIVATE
        RCT_NEW_ARCH_ENABLED=1
)

# Link against React Native's prefab. `reactnative` carries the C++ TurboModule
# infrastructure including `facebook::react::TurboModulePerfLogger`'s
# `enableLogging` entry point and the `NativeModulePerfLogger` base class
# header path.
find_package(ReactAndroid REQUIRED CONFIG)
target_link_libraries(
    sentry-tm-perf-logger
    PRIVATE
        ReactAndroid::reactnative
)

# Note: we deliberately do NOT pass `-Wl,--strip-all` (or similar) here.
# Android Gradle Plugin's `StripDebugSymbolsTask` already strips the .so for
# the packaged APK while preserving the unstripped artefact under
# `intermediates/merged_native_libs/.../obj`, which the Sentry Gradle plugin
# uploads for crash symbolication. Stripping at link time would erase DWARF
# before AGP can copy it, leaving any crash inside this library
# unsymbolicated in production.

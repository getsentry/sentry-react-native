// Copyright (c) Sentry. All rights reserved.
//
// JNI entry point for the Sentry TurboModule perf-logger shared library.
//
// This shared library (`libsentry-tm-perf-logger.so`) is dedicated to wiring
// up Sentry's `facebook::react::NativeModulePerfLogger` so the SDK observes
// every TurboModule lifecycle event without forcing host apps to modify
// their own `OnLoad.cpp`.
//
// The library is loaded from `RNSentryPackage`'s static initializer via
// `System.loadLibrary("sentry-tm-perf-logger")`, which fires before any
// TurboModule is instantiated by React Native. Inside `JNI_OnLoad` we install
// the perf logger so the very first `moduleDataCreateStart` we see is the
// one for the very first TurboModule the host registers.

#include <jni.h>

#include "../../../../cpp/SentryTurboModulePerfLogger.h"

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* /*vm*/, void* /*reserved*/) {
  // Install the perf logger as soon as the library is loaded. The
  // controller is reachable from Java via the implicit-named JNI method
  // declared below; we do not register methods explicitly here.
  Sentry_InstallTurboModulePerfLogger();
  return JNI_VERSION_1_6;
}

/// Java-callable runtime toggle for the perf-logger sink. Linked into Java
/// by name (`Java_io_sentry_react_RNSentryTurboModulePerfTracker_nativeSetEnabled`)
/// so we do not need an explicit `RegisterNatives` table.
extern "C" JNIEXPORT void JNICALL
Java_io_sentry_react_RNSentryTurboModulePerfTracker_nativeSetEnabled(
    JNIEnv* /*env*/,
    jclass /*clazz*/,
    jboolean enabled) {
  Sentry_SetTurboModuleTrackingEnabled(enabled ? 1 : 0);
}

// Copyright (c) Sentry. All rights reserved.
//
// JNI bridge for the Sentry TurboModule perf-logger shared library.
//
// This shared library (`libsentry-tm-perf-logger.so`) hosts the C++ side of
// the perf-logger controller plus the JNI symbol the JVM tracker calls into.
//
// We deliberately do NOT install the perf logger from `JNI_OnLoad`: the
// install evicts any pre-existing `NativeModulePerfLogger` (Metro, another
// SDK, host-app instrumentation) and that side effect should only happen
// when the user has explicitly opted in via `enableTurboModuleTracking`.
// The lazy install path lives inside
// `SentryTurboModulePerfController::setEnabled(true)`.

#include <jni.h>

#include "../../../../cpp/SentryTurboModulePerfLogger.h"

/// Java-callable runtime toggle for the perf-logger sink. Linked into Java
/// by name (`Java_io_sentry_react_RNSentryTurboModulePerfTracker_nativeSetEnabled`)
/// so we do not need an explicit `RegisterNatives` table.
extern "C" JNIEXPORT void JNICALL
Java_io_sentry_react_RNSentryTurboModulePerfTracker_nativeSetEnabled(
    JNIEnv * /*env*/, jclass /*clazz*/, jboolean enabled)
{
    Sentry_SetTurboModuleTrackingEnabled(enabled ? 1 : 0);
}

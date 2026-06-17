// Copyright (c) Sentry. All rights reserved.
//
// Sentry's `facebook::react::NativeModulePerfLogger` implementation, plus the
// one-call installer used by the platform glue (`RNSentry.mm` on iOS, the JNI
// shared library `libsentry-tm-perf-logger.so` on Android).
//
// React Native's TurboModule infrastructure calls a single, process-wide
// `NativeModulePerfLogger` for every TurboModule lifecycle event. Only one
// logger can be installed at a time — RN's `TurboModulePerfLogger::enableLogging`
// replaces whatever was installed before. Hosts that already install their
// own logger will lose Sentry's observability after this point; that's the
// trade-off the issue acknowledges (the alternative would require a hook RN
// doesn't expose).
//
// The logger here is a thin forwarder:
//   - When the runtime `enabled` flag is `false` (default for the first
//     release), every callback fast-paths to a `return` after one atomic load.
//   - When `true`, the callback is forwarded to the currently installed sink,
//     if any.
//
// The sink is swappable at runtime (`setSink`) so the higher-level features
// (per-Turbo-Module spans, JS↔Native crash attribution, aggregated stats) can
// each ship their own sink in follow-up issues without revisiting the install
// path.

#pragma once

#include "SentryTurboModulePerfSink.h"

#include <atomic>
#include <memory>
#include <mutex>

namespace sentry::reactnative {

class SentryTurboModulePerfLogger;

/// Sentry-owned `NativeModulePerfLogger` (declared as the React Native type in
/// the .cpp to keep this header free of React headers — the .cpp brings in
/// `<ReactCommon/TurboModulePerfLogger.h>` and `<reactperflogger/NativeModulePerfLogger.h>`).
///
/// Install via `Sentry_InstallTurboModulePerfLogger()` (defined in this header
/// as a C-linkage symbol so the JNI side can call it from `JNI_OnLoad`
/// without dragging the C++ ABI through the JNI boundary).
class SentryTurboModulePerfController {
 public:
  /// Returns the process-wide controller instance. The controller owns the
  /// installed logger and the active sink.
  static SentryTurboModulePerfController& instance() noexcept;

  /// Idempotent install. The first call constructs a `SentryTurboModulePerfLogger`
  /// and hands it to RN via `facebook::react::TurboModulePerfLogger::enableLogging`.
  /// Subsequent calls are no-ops — this matters on iOS, where the SDK can be
  /// re-initialised by tests and on Android where the JNI library may be loaded
  /// more than once across the lifetime of a host process.
  void install() noexcept;

  /// Swap the sink that receives forwarded callbacks. Pass `nullptr` to detach.
  /// Thread-safe; uses an atomic shared-pointer swap.
  void setSink(std::shared_ptr<ISentryTurboModulePerfSink> sink) noexcept;

  /// Read the currently installed sink, or `nullptr` if none. The returned
  /// pointer is captured at the moment of call and remains valid for the
  /// caller's reference count even if a concurrent `setSink` swaps the sink.
  std::shared_ptr<ISentryTurboModulePerfSink> sink() const noexcept;

  /// Runtime enable / disable. Defaults to `false`. When `false`, the logger
  /// fast-paths every callback to a single atomic load — no virtual dispatch,
  /// no sink lookup. This is the gate the public `enableTurboModuleTracking`
  /// JS option toggles.
  void setEnabled(bool enabled) noexcept;
  bool isEnabled() const noexcept;

 private:
  SentryTurboModulePerfController() noexcept = default;

  std::atomic<bool> installed_{false};
  std::atomic<bool> enabled_{false};

  // Sink storage. We use a raw mutex + shared_ptr rather than
  // `std::atomic<std::shared_ptr<...>>` because the latter is C++20 and not
  // available on the older toolchains some downstream RN setups still use.
  mutable std::mutex sink_mutex_;
  std::shared_ptr<ISentryTurboModulePerfSink> sink_;
};

}  // namespace sentry::reactnative

#ifdef __cplusplus
extern "C" {
#endif

/// One-call installer. Safe to call multiple times.
///
/// - On iOS we call this from `RNSentry`'s init path so the logger is in place
///   before the bridge starts creating modules.
/// - On Android we call this from `JNI_OnLoad` inside `libsentry-tm-perf-logger.so`,
///   which is loaded by `RNSentryPackage`'s static initializer.
void Sentry_InstallTurboModulePerfLogger(void);

/// Runtime flag toggled from JS via `RNSentry.enableTurboModuleTracking`. The
/// underlying logger is always installed (so we don't miss the early lifecycle
/// events); this gate just decides whether forwarded callbacks reach the sink.
void Sentry_SetTurboModuleTrackingEnabled(int enabled);

#ifdef __cplusplus
}  // extern "C"
#endif

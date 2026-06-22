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
    static SentryTurboModulePerfController &instance() noexcept;

    /// Idempotent install. The first call constructs a `SentryTurboModulePerfLogger`
    /// and hands it to RN via `facebook::react::TurboModulePerfLogger::enableLogging`.
    /// Subsequent calls are no-ops — this matters on iOS, where the SDK can be
    /// re-initialised by tests and on Android where the JNI library may be loaded
    /// more than once across the lifetime of a host process.
    ///
    /// Note: `setEnabled(true)` calls this lazily, so most consumers do not need
    /// to invoke `install()` directly. Calling it explicitly is only useful when
    /// a host wants to claim the perf logger slot before any other component
    /// (Metro, another SDK) gets a chance to install its own.
    void install() noexcept;

    /// Swap the sink that receives forwarded callbacks. Pass `nullptr` to detach.
    /// Thread-safe — takes the sink mutex to mirror the owning `shared_ptr` and
    /// the hot-path raw pointer atomically.
    ///
    /// Lifetime contract: a sink installed via `setSink(s)` MUST remain valid
    /// until either the controller is destroyed or a subsequent `setSink` call
    /// has completed. Concretely — once the controller is enabled and a sink
    /// is installed, callers must not destroy the sink (i.e. drop the last
    /// `shared_ptr` reference to it elsewhere) while the controller may still
    /// dispatch into it. In practice the SDK installs the sink once at init
    /// and keeps it alive for the lifetime of the process, which is the case
    /// this contract is tuned for; the hot path therefore reads the sink via
    /// a lock-free atomic raw pointer for zero overhead per TurboModule call.
    void setSink(std::shared_ptr<ISentryTurboModulePerfSink> sink) noexcept;

    /// Read the currently installed sink, or `nullptr` if none. The returned
    /// `shared_ptr` is captured atomically (under the sink mutex) so the caller
    /// holds an owning reference even if a concurrent `setSink` swaps the sink.
    /// Used by tests and by external code that needs strong-ownership semantics;
    /// the perf-logger forwarder uses the lock-free `sinkRaw()` path instead.
    std::shared_ptr<ISentryTurboModulePerfSink> sink() const noexcept;

    /// Hot-path read: returns the currently installed sink as a raw pointer
    /// without acquiring any lock. The pointer is only valid for the duration
    /// of a single TurboModule callback, and only safe under the lifetime
    /// contract documented on `setSink`. Returns `nullptr` when no sink is
    /// installed.
    ISentryTurboModulePerfSink *sinkRaw() const noexcept;

    /// Runtime enable / disable. Defaults to `false`. When `false`, the logger
    /// fast-paths every callback to a single atomic load — no virtual dispatch,
    /// no sink lookup. This is the gate the public `enableTurboModuleTracking`
    /// JS option toggles.
    void setEnabled(bool enabled) noexcept;
    bool isEnabled() const noexcept;

private:
    SentryTurboModulePerfController() noexcept = default;

    std::atomic<bool> installed_ { false };
    std::atomic<bool> enabled_ { false };

    // Sink storage uses a two-level design:
    //  - `sink_owner_` holds the owning `shared_ptr` and is protected by
    //    `sink_mutex_`. Mutated by `setSink`; read by `sink()` for callers
    //    that need strong-ownership semantics (tests, introspection).
    //  - `sink_cache_` is a lock-free atomic raw pointer mirror used by the
    //    hot path (`sinkRaw()`). It lets every forwarded TurboModule callback
    //    read the sink without acquiring a mutex, which the sink interface
    //    explicitly requires of the forwarder.
    //
    // The atomic-shared_ptr variants are either C++20 (`std::atomic<std::shared_ptr<T>>`)
    // or deprecated free functions (`std::atomic_load(std::shared_ptr*)`); the
    // mutex+atomic-raw-pointer combo gives us lock-free reads on the hot path
    // without requiring C++20 across every supported RN toolchain.
    mutable std::mutex sink_mutex_;
    std::shared_ptr<ISentryTurboModulePerfSink> sink_owner_;
    std::atomic<ISentryTurboModulePerfSink *> sink_cache_ { nullptr };
};

} // namespace sentry::reactnative

#ifdef __cplusplus
extern "C" {
#endif

/// One-call installer. Safe to call multiple times. The default flow does not
/// invoke this directly — `Sentry_SetTurboModuleTrackingEnabled(1)` lazily
/// installs the logger on first enable. Provided for hosts that want to claim
/// the perf-logger slot eagerly before any other component does.
void Sentry_InstallTurboModulePerfLogger(void);

/// Runtime flag toggled from JS via `RNSentry.enableTurboModuleTracking`.
/// On first transition to `enabled = 1` this also installs the underlying
/// `NativeModulePerfLogger` into React Native; before that point the perf-logger
/// slot is left untouched so we never evict another component's logger while
/// tracking is off.
void Sentry_SetTurboModuleTrackingEnabled(int enabled);

#ifdef __cplusplus
} // extern "C"
#endif

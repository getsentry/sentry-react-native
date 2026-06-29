// Copyright (c) Sentry. All rights reserved.
//
// TurboModule-based perf logging is a New Architecture concept; on Old Arch
// there is no `facebook::react::TurboModulePerfLogger` to install into. We
// still compile the controller on Old Arch (sink/enable state lives there)
// but `install()` is a no-op so the runtime never tries to call into a header
// the toolchain didn't compile against.

#include "SentryTurboModulePerfLogger.h"

#if defined(RCT_NEW_ARCH_ENABLED) || defined(__ANDROID__)
#    define SENTRY_TM_PERF_LOGGER_AVAILABLE 1
#else
#    define SENTRY_TM_PERF_LOGGER_AVAILABLE 0
#endif

#if SENTRY_TM_PERF_LOGGER_AVAILABLE
#    include <ReactCommon/TurboModulePerfLogger.h>
#    include <reactperflogger/NativeModulePerfLogger.h>
#endif

#include <memory>
#include <mutex>
#include <utility>

namespace sentry::reactnative {

#if SENTRY_TM_PERF_LOGGER_AVAILABLE

namespace {

    /// Concrete `NativeModulePerfLogger` subclass we hand to React Native. It owns
    /// no state of its own — every callback goes through
    /// `SentryTurboModulePerfController` so the sink and the runtime flag can be
    /// swapped without re-installing the logger.
    class ForwardingLogger final : public facebook::react::NativeModulePerfLogger {
    public:
        // The macros below let us keep this file readable. Without them we'd
        // have ~30 near-identical method bodies; with them the surface fits on
        // one screen and any divergence between RN's API and ours surfaces as
        // a compile error rather than a silent drop.
        //
        // Each forwarder uses the owning `sink()` accessor: it acquires the
        // sink mutex, copies the `shared_ptr`, and releases the lock before
        // invoking the sink. That keeps the sink alive for the duration of
        // the call regardless of a concurrent `setSink`. The mutex cost is
        // only paid when `isEnabled()` returns true — when tracking is off
        // (the default), the early return runs after a single atomic load.
#    define SENTRY_FORWARD0(name)                                                                  \
        void name() override                                                                       \
        {                                                                                          \
            auto &c = SentryTurboModulePerfController::instance();                                 \
            if (!c.isEnabled()) {                                                                  \
                return;                                                                            \
            }                                                                                      \
            if (auto sink = c.sink()) {                                                            \
                sink->name();                                                                      \
            }                                                                                      \
        }

#    define SENTRY_FORWARD1(name, arg1Type, arg1Name)                                              \
        void name(arg1Type arg1Name) override                                                      \
        {                                                                                          \
            auto &c = SentryTurboModulePerfController::instance();                                 \
            if (!c.isEnabled()) {                                                                  \
                return;                                                                            \
            }                                                                                      \
            if (auto sink = c.sink()) {                                                            \
                sink->name(arg1Name);                                                              \
            }                                                                                      \
        }

#    define SENTRY_FORWARD2(name, t1, n1, t2, n2)                                                  \
        void name(t1 n1, t2 n2) override                                                           \
        {                                                                                          \
            auto &c = SentryTurboModulePerfController::instance();                                 \
            if (!c.isEnabled()) {                                                                  \
                return;                                                                            \
            }                                                                                      \
            if (auto sink = c.sink()) {                                                            \
                sink->name(n1, n2);                                                                \
            }                                                                                      \
        }

#    define SENTRY_FORWARD3(name, t1, n1, t2, n2, t3, n3)                                          \
        void name(t1 n1, t2 n2, t3 n3) override                                                    \
        {                                                                                          \
            auto &c = SentryTurboModulePerfController::instance();                                 \
            if (!c.isEnabled()) {                                                                  \
                return;                                                                            \
            }                                                                                      \
            if (auto sink = c.sink()) {                                                            \
                sink->name(n1, n2, n3);                                                            \
            }                                                                                      \
        }

        // Module data / create
        SENTRY_FORWARD2(moduleDataCreateStart, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleDataCreateEnd, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleCreateStart, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleCreateCacheHit, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleCreateConstructStart, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleCreateConstructEnd, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleCreateSetUpStart, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleCreateSetUpEnd, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleCreateEnd, const char *, moduleName, int32_t, id)
        SENTRY_FORWARD2(moduleCreateFail, const char *, moduleName, int32_t, id)

        // JS require timings
        SENTRY_FORWARD1(moduleJSRequireBeginningStart, const char *, moduleName)
        SENTRY_FORWARD1(moduleJSRequireBeginningCacheHit, const char *, moduleName)
        SENTRY_FORWARD1(moduleJSRequireBeginningEnd, const char *, moduleName)
        SENTRY_FORWARD1(moduleJSRequireBeginningFail, const char *, moduleName)
        SENTRY_FORWARD1(moduleJSRequireEndingStart, const char *, moduleName)
        SENTRY_FORWARD1(moduleJSRequireEndingEnd, const char *, moduleName)
        SENTRY_FORWARD1(moduleJSRequireEndingFail, const char *, moduleName)

        // Sync method calls
        SENTRY_FORWARD2(syncMethodCallStart, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(
            syncMethodCallArgConversionStart, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(
            syncMethodCallArgConversionEnd, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(
            syncMethodCallExecutionStart, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(
            syncMethodCallExecutionEnd, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(
            syncMethodCallReturnConversionStart, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(
            syncMethodCallReturnConversionEnd, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(syncMethodCallEnd, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(syncMethodCallFail, const char *, moduleName, const char *, methodName)

        // Async method calls (call half)
        SENTRY_FORWARD2(asyncMethodCallStart, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(
            asyncMethodCallArgConversionStart, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(
            asyncMethodCallArgConversionEnd, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(asyncMethodCallDispatch, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(asyncMethodCallEnd, const char *, moduleName, const char *, methodName)
        SENTRY_FORWARD2(asyncMethodCallFail, const char *, moduleName, const char *, methodName)

        // Async batch preprocess
        SENTRY_FORWARD0(asyncMethodCallBatchPreprocessStart)
        SENTRY_FORWARD1(asyncMethodCallBatchPreprocessEnd, int, batchSize)

        // Async method calls (execution half)
        SENTRY_FORWARD3(asyncMethodCallExecutionStart, const char *, moduleName, const char *,
            methodName, int32_t, id)
        SENTRY_FORWARD3(asyncMethodCallExecutionArgConversionStart, const char *, moduleName,
            const char *, methodName, int32_t, id)
        SENTRY_FORWARD3(asyncMethodCallExecutionArgConversionEnd, const char *, moduleName,
            const char *, methodName, int32_t, id)
        SENTRY_FORWARD3(asyncMethodCallExecutionEnd, const char *, moduleName, const char *,
            methodName, int32_t, id)
        SENTRY_FORWARD3(asyncMethodCallExecutionFail, const char *, moduleName, const char *,
            methodName, int32_t, id)

#    undef SENTRY_FORWARD0
#    undef SENTRY_FORWARD1
#    undef SENTRY_FORWARD2
#    undef SENTRY_FORWARD3
    };

} // namespace

#endif // SENTRY_TM_PERF_LOGGER_AVAILABLE

SentryTurboModulePerfController &
SentryTurboModulePerfController::instance() noexcept
{
    // Function-local static — guaranteed thread-safe initialisation since C++11,
    // and avoids the static-initialisation-order fiasco that bites global singletons
    // hand-rolled in this kind of native-bridge code.
    static SentryTurboModulePerfController controller;
    return controller;
}

void
SentryTurboModulePerfController::install() noexcept
{
#if SENTRY_TM_PERF_LOGGER_AVAILABLE
    // `compare_exchange_strong` on `installAttempted_` makes the install
    // idempotent across competing threads and ensures sticky "tried once,
    // never again" semantics. We split that flag from the actual
    // `installed_` success bit so callers can tell the difference between
    // "install ran and succeeded" and "install ran and failed".
    //
    // Sticky "attempted" semantics close a race that an earlier revision
    // had with a roll-back-on-failure pattern: a concurrent thread that
    // observed the brief "true" window would skip its own install attempt,
    // then the originating thread would roll the flag back, ending up in a
    // state where every caller thought someone else handled the install
    // but nobody actually did. A failed install during the user opt-in
    // path therefore leaves tracking off for the rest of the process
    // lifetime; the JS-side `isEnabled()` reflects that accurately.
    bool expected = false;
    if (!installAttempted_.compare_exchange_strong(expected, true, std::memory_order_acq_rel)) {
        return;
    }
    // `std::make_unique` can throw `std::bad_alloc` and the third-party
    // `enableLogging` makes no exception guarantees. We are declared
    // `noexcept`, so any escape here would call `std::terminate` and bring
    // down the host app. Catch and leave `installed_` false so subsequent
    // `setEnabled(true)` calls observe the failure and do not report
    // `isEnabled() == true` while no perf logger is actually wired up.
    try {
        facebook::react::TurboModulePerfLogger::enableLogging(std::make_unique<ForwardingLogger>());
        installed_.store(true, std::memory_order_release);
    } catch (...) {
        // intentionally empty — `installed_` stays `false`
    }
#endif
}

void
SentryTurboModulePerfController::setEnabled(bool enabled) noexcept
{
    // Publish the user's intent before installing so any callback RN fires
    // synchronously from inside `enableLogging()` already sees
    // `enabled_ == true` and reaches the sink instead of being dropped by
    // the fast-path. On disable, order does not matter — we never uninstall.
    enabled_.store(enabled, std::memory_order_release);

    // Enabling tracking lazily installs the logger. This avoids evicting any
    // pre-existing `NativeModulePerfLogger` (Metro, other SDKs, host-app
    // instrumentation) when the user has not opted in to TurboModule tracking,
    // and matches the cost model promised by the JSDoc default of `false`.
    if (enabled) {
        install();
    }
}

bool
SentryTurboModulePerfController::isEnabled() const noexcept
{
    // Tracking is operational only when the user has opted in AND the
    // underlying perf logger is actually registered with React Native. If
    // an install attempt failed (e.g. `std::bad_alloc`), `installed_`
    // stays `false` and we honestly report `isEnabled() == false` even
    // when the user requested tracking on. That keeps tests and downstream
    // consumers from believing data is flowing when no logger is wired up.
    return enabled_.load(std::memory_order_acquire) && installed_.load(std::memory_order_acquire);
}

void
SentryTurboModulePerfController::setSink(std::shared_ptr<ISentryTurboModulePerfSink> sink) noexcept
{
    std::lock_guard<std::mutex> lock(sink_mutex_);
    sink_ = std::move(sink);
}

std::shared_ptr<ISentryTurboModulePerfSink>
SentryTurboModulePerfController::sink() const noexcept
{
    std::lock_guard<std::mutex> lock(sink_mutex_);
    return sink_;
}

} // namespace sentry::reactnative

extern "C" {

void
Sentry_InstallTurboModulePerfLogger(void)
{
    sentry::reactnative::SentryTurboModulePerfController::instance().install();
}

void
Sentry_SetTurboModuleTrackingEnabled(int enabled)
{
    sentry::reactnative::SentryTurboModulePerfController::instance().setEnabled(enabled != 0);
}

} // extern "C"

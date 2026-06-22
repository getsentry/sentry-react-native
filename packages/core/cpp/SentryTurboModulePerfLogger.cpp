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
        // The macro below lets us keep this file readable. Without it we'd have
        // ~30 near-identical 5-line method bodies; with it the surface fits on one
        // screen and any divergence between RN's API and ours surfaces as a compile
        // error rather than a silent drop.
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
    // `compare_exchange_strong` makes the install idempotent across competing
    // threads: only the first caller transitions `installed_` from `false` to
    // `true`, and only that caller hands the logger off to React Native.
    bool expected = false;
    if (!installed_.compare_exchange_strong(expected, true, std::memory_order_acq_rel)) {
        return;
    }
    facebook::react::TurboModulePerfLogger::enableLogging(std::make_unique<ForwardingLogger>());
#endif
}

void
SentryTurboModulePerfController::setEnabled(bool enabled) noexcept
{
    // Publish the new flag *before* installing the logger so any callback RN
    // fires synchronously from inside `enableLogging()` already sees
    // `isEnabled() == true` and reaches the sink instead of being dropped by
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

bool
SentryTurboModulePerfController::isEnabled() const noexcept
{
    return enabled_.load(std::memory_order_acquire);
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

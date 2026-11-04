#import "RNSentryHermesSampler.h"

#import <mutex>
#import <sstream>
#import <stdexcept>

#if __has_include(<hermes/hermes.h>) && SENTRY_PROFILING_SUPPORTED
#    define RNSENTRY_HERMES_SAMPLER_AVAILABLE 1
#    import <hermes/hermes.h>
#else
#    define RNSENTRY_HERMES_SAMPLER_AVAILABLE 0
#endif

namespace sentry::react {

namespace {
    std::mutex samplerMutex;
    bool isProfiling = false;

#if RNSENTRY_HERMES_SAMPLER_AVAILABLE
    void
    enableSampler()
    {
#    ifdef NEW_HERMES_RUNTIME
        auto *hermesAPI = facebook::jsi::castInterface<facebook::hermes::IHermesRootAPI>(
            facebook::hermes::makeHermesRootAPI());
        if (hermesAPI) {
            hermesAPI->enableSamplingProfiler();
        }
#    else
        facebook::hermes::HermesRuntime::enableSamplingProfiler();
#    endif
    }

    void
    disableSampler()
    {
#    ifdef NEW_HERMES_RUNTIME
        auto *hermesAPI = facebook::jsi::castInterface<facebook::hermes::IHermesRootAPI>(
            facebook::hermes::makeHermesRootAPI());
        if (hermesAPI) {
            hermesAPI->disableSamplingProfiler();
        }
#    else
        facebook::hermes::HermesRuntime::disableSamplingProfiler();
#    endif
    }

    std::string
    disableSamplerAndDump()
    {
        disableSampler();
        std::stringstream ss;
#    ifdef NEW_HERMES_RUNTIME
        auto *hermesAPI = facebook::jsi::castInterface<facebook::hermes::IHermesRootAPI>(
            facebook::hermes::makeHermesRootAPI());
        if (hermesAPI) {
            hermesAPI->dumpSampledTraceToStream(ss);
        }
#    else
        // Before RN 0.69 Hermes used llvh::raw_ostream (profiling is supported for 0.69 and newer)
        facebook::hermes::HermesRuntime::dumpSampledTraceToStream(ss);
#    endif
        return ss.str();
    }
#endif
}

void
startHermesProfiling()
{
#if RNSENTRY_HERMES_SAMPLER_AVAILABLE
    std::lock_guard<std::mutex> lock(samplerMutex);
    enableSampler();
    isProfiling = true;
#else
    throw std::runtime_error("Hermes sampling profiler is not available.");
#endif
}

std::string
stopHermesProfiling()
{
#if RNSENTRY_HERMES_SAMPLER_AVAILABLE
    std::lock_guard<std::mutex> lock(samplerMutex);
    isProfiling = false;
    return disableSamplerAndDump();
#else
    throw std::runtime_error("Hermes sampling profiler is not available.");
#endif
}

std::optional<std::string>
sampleHermesTrace(std::chrono::milliseconds duration, dispatch_semaphore_t stopSignal)
{
#if RNSENTRY_HERMES_SAMPLER_AVAILABLE
    std::lock_guard<std::mutex> lock(samplerMutex);
    if (isProfiling) {
        return std::nullopt;
    }
    try {
        enableSampler();
        dispatch_semaphore_wait(stopSignal,
            dispatch_time(DISPATCH_TIME_NOW,
                std::chrono::duration_cast<std::chrono::nanoseconds>(duration).count()));
        return disableSamplerAndDump();
    } catch (...) {
        // The sampler is global, so it must not stay on after a failed sample.
        try {
            disableSampler();
        } catch (...) {
        }
        return std::nullopt;
    }
#else
    return std::nullopt;
#endif
}

} // namespace sentry::react

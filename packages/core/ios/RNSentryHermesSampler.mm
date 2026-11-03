#import "RNSentryHermesSampler.h"

#import <mutex>
#import <sstream>
#import <stdexcept>
#import <thread>

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

    std::string
    disableSamplerAndDump()
    {
        std::stringstream ss;
#    ifdef NEW_HERMES_RUNTIME
        auto *hermesAPI = facebook::jsi::castInterface<facebook::hermes::IHermesRootAPI>(
            facebook::hermes::makeHermesRootAPI());
        if (hermesAPI) {
            hermesAPI->disableSamplingProfiler();
            hermesAPI->dumpSampledTraceToStream(ss);
        }
#    else
        facebook::hermes::HermesRuntime::disableSamplingProfiler();
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
sampleHermesTrace(std::chrono::milliseconds duration)
{
#if RNSENTRY_HERMES_SAMPLER_AVAILABLE
    std::lock_guard<std::mutex> lock(samplerMutex);
    if (isProfiling) {
        return std::nullopt;
    }
    try {
        enableSampler();
        std::this_thread::sleep_for(duration);
        return disableSamplerAndDump();
    } catch (...) {
        return std::nullopt;
    }
#else
    return std::nullopt;
#endif
}

} // namespace sentry::react

#import "RNSentryHermesSampler.h"

#import <Foundation/Foundation.h>
#import <mutex>
#import <sstream>
#import <stdexcept>
#import <vector>

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
    // Hermes clears its samples on every dump, so the traces dumped for hangs during a profile are
    // kept here and merged into the profile when it stops.
    std::vector<std::string> profileTraces;

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
    dumpTrace()
    {
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

    std::string
    disableSamplerAndDump()
    {
        disableSampler();
        return dumpTrace();
    }

    /// Joins Hermes traces in time order. Each trace numbers its stack frames from the start, so
    /// the frame ids of every trace are moved past the ids of the traces before it.
    std::string
    mergeTraces(const std::vector<std::string> &traces)
    {
        NSMutableDictionary *merged = nil;
        NSMutableArray *samples = [NSMutableArray array];
        NSMutableDictionary *stackFrames = [NSMutableDictionary dictionary];
        long long nextFrameId = 0;
        for (const std::string &trace : traces) {
            NSDictionary *profile = [NSJSONSerialization
                JSONObjectWithData:[NSData dataWithBytes:trace.data() length:trace.size()]
                           options:0
                             error:nil];
            if (![profile isKindOfClass:[NSDictionary class]]) {
                continue;
            }
            if (merged == nil) {
                merged = [profile mutableCopy];
            }
            long long offset = nextFrameId;
            for (NSDictionary *sample in profile[@"samples"]) {
                NSMutableDictionary *movedSample = [sample mutableCopy];
                movedSample[@"sf"] = @([sample[@"sf"] longLongValue] + offset);
                [samples addObject:movedSample];
            }
            NSDictionary *frames = profile[@"stackFrames"];
            for (NSString *frameId in frames) {
                NSMutableDictionary *frame = [frames[frameId] mutableCopy];
                if (frame[@"parent"] != nil) {
                    frame[@"parent"] = @([frame[@"parent"] longLongValue] + offset);
                }
                long long movedId = [frameId longLongValue] + offset;
                stackFrames[[@(movedId) stringValue]] = frame;
                nextFrameId = MAX(nextFrameId, movedId + 1);
            }
        }
        if (merged == nil) {
            return traces.back();
        }
        merged[@"samples"] = samples;
        merged[@"stackFrames"] = stackFrames;
        NSData *data = [NSJSONSerialization dataWithJSONObject:merged options:0 error:nil];
        return std::string(static_cast<const char *>(data.bytes), data.length);
    }
#endif
}

void
startHermesProfiling()
{
#if RNSENTRY_HERMES_SAMPLER_AVAILABLE
    std::lock_guard<std::mutex> lock(samplerMutex);
    profileTraces.clear();
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
    std::vector<std::string> traces = std::move(profileTraces);
    profileTraces.clear();
    std::string trace = disableSamplerAndDump();
    if (traces.empty()) {
        return trace;
    }
    traces.push_back(std::move(trace));
    return mergeTraces(traces);
#else
    throw std::runtime_error("Hermes sampling profiler is not available.");
#endif
}

std::optional<HermesTrace>
sampleHermesTrace(std::chrono::milliseconds duration, dispatch_semaphore_t stopSignal)
{
#if RNSENTRY_HERMES_SAMPLER_AVAILABLE
    std::lock_guard<std::mutex> lock(samplerMutex);
    if (isProfiling) {
        // The profile keeps the sampler on, so its newest samples already show the hang.
        try {
            std::string trace = dumpTrace();
            profileTraces.push_back(trace);
            return HermesTrace { std::move(trace), true };
        } catch (...) {
            return std::nullopt;
        }
    }
    try {
        enableSampler();
        dispatch_semaphore_wait(stopSignal,
            dispatch_time(DISPATCH_TIME_NOW,
                std::chrono::duration_cast<std::chrono::nanoseconds>(duration).count()));
        return HermesTrace { disableSamplerAndDump(), false };
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

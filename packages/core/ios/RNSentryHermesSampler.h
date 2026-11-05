#pragma once

#ifdef __cplusplus
#    include <chrono>
#    include <optional>
#    include <string>

#    include <dispatch/dispatch.h>

namespace sentry::react {

// The Hermes sampling profiler is global to the process. These functions share one lock, so a
// profile and a JS hang sample never enable or disable the sampler under each other.

/// Starts the sampler for a profile. Throws when Hermes is not available or fails.
void startHermesProfiling();

/// Stops the sampler for a profile and returns the trace. Throws when Hermes is not available or
/// fails.
std::string stopHermesProfiling();

struct HermesTrace {
    std::string json;
    /// The trace holds the samples of a running profile, so its newest samples show the hang.
    bool fromProfile;
};

/// Samples the JS thread for `duration`, or until `stopSignal` is signaled, and returns the trace.
/// When a profile is running, returns its samples at once and adds them to the profile when it
/// stops. Returns nothing when Hermes is not available or fails.
std::optional<HermesTrace> sampleHermesTrace(
    std::chrono::milliseconds duration, dispatch_semaphore_t stopSignal);

} // namespace sentry::react
#endif

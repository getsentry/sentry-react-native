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

/// Samples the JS thread for `duration`, or until `stopSignal` is signaled, and returns the trace.
/// Returns nothing when a profile is running, when Hermes is not available, or when Hermes fails.
std::optional<std::string> sampleHermesTrace(
    std::chrono::milliseconds duration, dispatch_semaphore_t stopSignal);

} // namespace sentry::react
#endif

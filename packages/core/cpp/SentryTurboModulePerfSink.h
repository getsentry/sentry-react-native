// Copyright (c) Sentry. All rights reserved.
//
// Pluggable sink for `SentryTurboModulePerfLogger`.
//
// `SentryTurboModulePerfLogger` is the single Sentry-owned implementation of
// `facebook::react::NativeModulePerfLogger`; it receives every TurboModule
// lifecycle callback that React Native fires. The logger does not do anything
// useful on its own — it only forwards each callback to whatever sink is
// installed.
//
// Follow-up features plug into this hook to build their own behavior:
//   - JS↔Native crash attribution (sets the current module/method on the scope
//     so a native crash inside `Foo.bar()` carries `turbo_module.name = Foo` /
//     `turbo_module.method = bar`).
//   - Per-Turbo-Module spans (opens a span around each method invocation).
//   - Aggregated stats (counts / duration histograms per module/method).
//
// The sink owns all real work; the logger only adapts the C++ ABI. This keeps
// the foundation PR small and lets each follow-up feature ship its own sink
// without touching the install path.

#pragma once

#include <cstdint>

namespace sentry::reactnative {

/// Sink interface that consumes every TurboModule perf event the SDK observes.
///
/// All methods are invoked on the React Native thread that's executing the
/// matching TurboModule lifecycle step — usually the JS thread for the sync
/// surface and the native module's serial executor for the async surface.
/// Implementations MUST be thread-safe and MUST NOT block: a slow sink will
/// directly inflate every native module call in the app.
///
/// Pointers passed in (`moduleName`, `methodName`) are owned by React Native;
/// the sink may inspect them during the call but MUST NOT retain them past it.
class ISentryTurboModulePerfSink {
 public:
  virtual ~ISentryTurboModulePerfSink() = default;

  // ---- Module data / create (iOS NativeModule two-phase, Android single phase)
  virtual void moduleDataCreateStart(const char* moduleName, int32_t id) = 0;
  virtual void moduleDataCreateEnd(const char* moduleName, int32_t id) = 0;
  virtual void moduleCreateStart(const char* moduleName, int32_t id) = 0;
  virtual void moduleCreateCacheHit(const char* moduleName, int32_t id) = 0;
  virtual void moduleCreateConstructStart(const char* moduleName, int32_t id) = 0;
  virtual void moduleCreateConstructEnd(const char* moduleName, int32_t id) = 0;
  virtual void moduleCreateSetUpStart(const char* moduleName, int32_t id) = 0;
  virtual void moduleCreateSetUpEnd(const char* moduleName, int32_t id) = 0;
  virtual void moduleCreateEnd(const char* moduleName, int32_t id) = 0;
  virtual void moduleCreateFail(const char* moduleName, int32_t id) = 0;

  // ---- JS require timings (separate from create — they bracket the `require()` call itself)
  virtual void moduleJSRequireBeginningStart(const char* moduleName) = 0;
  virtual void moduleJSRequireBeginningCacheHit(const char* moduleName) = 0;
  virtual void moduleJSRequireBeginningEnd(const char* moduleName) = 0;
  virtual void moduleJSRequireBeginningFail(const char* moduleName) = 0;
  virtual void moduleJSRequireEndingStart(const char* moduleName) = 0;
  virtual void moduleJSRequireEndingEnd(const char* moduleName) = 0;
  virtual void moduleJSRequireEndingFail(const char* moduleName) = 0;

  // ---- Sync method calls (blocking from JS)
  virtual void syncMethodCallStart(const char* moduleName, const char* methodName) = 0;
  virtual void syncMethodCallArgConversionStart(const char* moduleName, const char* methodName) = 0;
  virtual void syncMethodCallArgConversionEnd(const char* moduleName, const char* methodName) = 0;
  virtual void syncMethodCallExecutionStart(const char* moduleName, const char* methodName) = 0;
  virtual void syncMethodCallExecutionEnd(const char* moduleName, const char* methodName) = 0;
  virtual void syncMethodCallReturnConversionStart(const char* moduleName, const char* methodName) = 0;
  virtual void syncMethodCallReturnConversionEnd(const char* moduleName, const char* methodName) = 0;
  virtual void syncMethodCallEnd(const char* moduleName, const char* methodName) = 0;
  virtual void syncMethodCallFail(const char* moduleName, const char* methodName) = 0;

  // ---- Async method calls (Promise-returning from JS)
  //
  // The async surface is split into two halves:
  //  - The "call" half fires on the JS thread (`asyncMethodCall{Start,Dispatch,End,Fail}`).
  //  - The "execution" half fires on the native module's executor when the
  //    queued call actually runs (`asyncMethodCallExecution{Start,End,Fail}`),
  //    carrying an `id` to correlate the two halves.
  virtual void asyncMethodCallStart(const char* moduleName, const char* methodName) = 0;
  virtual void asyncMethodCallArgConversionStart(const char* moduleName, const char* methodName) = 0;
  virtual void asyncMethodCallArgConversionEnd(const char* moduleName, const char* methodName) = 0;
  virtual void asyncMethodCallDispatch(const char* moduleName, const char* methodName) = 0;
  virtual void asyncMethodCallEnd(const char* moduleName, const char* methodName) = 0;
  virtual void asyncMethodCallFail(const char* moduleName, const char* methodName) = 0;

  virtual void asyncMethodCallBatchPreprocessStart() = 0;
  virtual void asyncMethodCallBatchPreprocessEnd(int batchSize) = 0;

  virtual void asyncMethodCallExecutionStart(const char* moduleName, const char* methodName, int32_t id) = 0;
  virtual void asyncMethodCallExecutionArgConversionStart(const char* moduleName, const char* methodName, int32_t id) = 0;
  virtual void asyncMethodCallExecutionArgConversionEnd(const char* moduleName, const char* methodName, int32_t id) = 0;
  virtual void asyncMethodCallExecutionEnd(const char* moduleName, const char* methodName, int32_t id) = 0;
  virtual void asyncMethodCallExecutionFail(const char* moduleName, const char* methodName, int32_t id) = 0;
};

}  // namespace sentry::reactnative

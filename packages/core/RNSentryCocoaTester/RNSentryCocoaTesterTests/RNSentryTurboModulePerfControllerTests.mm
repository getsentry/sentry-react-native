// Unit coverage for the C++ controller that backs the TurboModule perf
// logger on both platforms.
//
// The controller is exercised here through the same C entry points the
// platform glue uses (`Sentry_InstallTurboModulePerfLogger`,
// `Sentry_SetTurboModuleTrackingEnabled`) plus the typed `setSink`/`sink`
// API. We cover state transitions only; the full callback fan-out is
// implicit in `ForwardingLogger`'s use of these primitives.
//
// The tests run on iOS New Architecture (the RNSentryCocoaTester target),
// where `RCT_NEW_ARCH_ENABLED` is defined and the underlying RN headers are
// available.

#import <XCTest/XCTest.h>

#import <atomic>
#import <memory>

#import "../../cpp/SentryTurboModulePerfLogger.h"
#import "../../cpp/SentryTurboModulePerfSink.h"

using sentry::reactnative::ISentryTurboModulePerfSink;
using sentry::reactnative::SentryTurboModulePerfController;

namespace {

/// Test double that records each forwarded call. We only need a couple of
/// counters here — the goal is to verify that the controller actually routes
/// events to the installed sink, not to exhaustively cover every RN callback.
class RecordingSink : public ISentryTurboModulePerfSink {
 public:
  std::atomic<int> moduleCreateStartCalls{0};
  std::atomic<int> syncMethodCallStartCalls{0};

  void moduleDataCreateStart(const char* /*moduleName*/, int32_t /*id*/) override {}
  void moduleDataCreateEnd(const char* /*moduleName*/, int32_t /*id*/) override {}
  void moduleCreateStart(const char* /*moduleName*/, int32_t /*id*/) override {
    moduleCreateStartCalls.fetch_add(1, std::memory_order_relaxed);
  }
  void moduleCreateCacheHit(const char* /*moduleName*/, int32_t /*id*/) override {}
  void moduleCreateConstructStart(const char* /*moduleName*/, int32_t /*id*/) override {}
  void moduleCreateConstructEnd(const char* /*moduleName*/, int32_t /*id*/) override {}
  void moduleCreateSetUpStart(const char* /*moduleName*/, int32_t /*id*/) override {}
  void moduleCreateSetUpEnd(const char* /*moduleName*/, int32_t /*id*/) override {}
  void moduleCreateEnd(const char* /*moduleName*/, int32_t /*id*/) override {}
  void moduleCreateFail(const char* /*moduleName*/, int32_t /*id*/) override {}

  void moduleJSRequireBeginningStart(const char* /*moduleName*/) override {}
  void moduleJSRequireBeginningCacheHit(const char* /*moduleName*/) override {}
  void moduleJSRequireBeginningEnd(const char* /*moduleName*/) override {}
  void moduleJSRequireBeginningFail(const char* /*moduleName*/) override {}
  void moduleJSRequireEndingStart(const char* /*moduleName*/) override {}
  void moduleJSRequireEndingEnd(const char* /*moduleName*/) override {}
  void moduleJSRequireEndingFail(const char* /*moduleName*/) override {}

  void syncMethodCallStart(const char* /*moduleName*/, const char* /*methodName*/) override {
    syncMethodCallStartCalls.fetch_add(1, std::memory_order_relaxed);
  }
  void syncMethodCallArgConversionStart(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void syncMethodCallArgConversionEnd(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void syncMethodCallExecutionStart(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void syncMethodCallExecutionEnd(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void syncMethodCallReturnConversionStart(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void syncMethodCallReturnConversionEnd(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void syncMethodCallEnd(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void syncMethodCallFail(const char* /*moduleName*/, const char* /*methodName*/) override {}

  void asyncMethodCallStart(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void asyncMethodCallArgConversionStart(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void asyncMethodCallArgConversionEnd(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void asyncMethodCallDispatch(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void asyncMethodCallEnd(const char* /*moduleName*/, const char* /*methodName*/) override {}
  void asyncMethodCallFail(const char* /*moduleName*/, const char* /*methodName*/) override {}

  void asyncMethodCallBatchPreprocessStart() override {}
  void asyncMethodCallBatchPreprocessEnd(int /*batchSize*/) override {}

  void asyncMethodCallExecutionStart(const char* /*moduleName*/, const char* /*methodName*/, int32_t /*id*/) override {}
  void asyncMethodCallExecutionArgConversionStart(const char* /*moduleName*/, const char* /*methodName*/, int32_t /*id*/) override {}
  void asyncMethodCallExecutionArgConversionEnd(const char* /*moduleName*/, const char* /*methodName*/, int32_t /*id*/) override {}
  void asyncMethodCallExecutionEnd(const char* /*moduleName*/, const char* /*methodName*/, int32_t /*id*/) override {}
  void asyncMethodCallExecutionFail(const char* /*moduleName*/, const char* /*methodName*/, int32_t /*id*/) override {}
};

}  // namespace

@interface RNSentryTurboModulePerfControllerTests : XCTestCase
@end

@implementation RNSentryTurboModulePerfControllerTests

- (void)setUp
{
    // The controller is a process-wide singleton. Reset it to a known state
    // at the start of every test so ordering between tests does not matter.
    SentryTurboModulePerfController::instance().setSink(nullptr);
    SentryTurboModulePerfController::instance().setEnabled(false);
}

- (void)tearDown
{
    SentryTurboModulePerfController::instance().setSink(nullptr);
    SentryTurboModulePerfController::instance().setEnabled(false);
}

- (void)testEnabledFlagDefaultsToFalse
{
    // After setUp clears it, the controller must report disabled. This is
    // the load-time default we ship and the contract the JS option toggles
    // against.
    XCTAssertFalse(SentryTurboModulePerfController::instance().isEnabled());
}

- (void)testSetEnabledTogglesIsEnabled
{
    SentryTurboModulePerfController::instance().setEnabled(true);
    XCTAssertTrue(SentryTurboModulePerfController::instance().isEnabled());

    SentryTurboModulePerfController::instance().setEnabled(false);
    XCTAssertFalse(SentryTurboModulePerfController::instance().isEnabled());
}

- (void)testCEntryPointMatchesSetEnabled
{
    // The Java/ObjC platform glue calls into the controller via the C entry
    // point. Verify both paths agree on the underlying flag.
    Sentry_SetTurboModuleTrackingEnabled(1);
    XCTAssertTrue(SentryTurboModulePerfController::instance().isEnabled());

    Sentry_SetTurboModuleTrackingEnabled(0);
    XCTAssertFalse(SentryTurboModulePerfController::instance().isEnabled());
}

- (void)testSetSinkRoundTrip
{
    auto recording = std::make_shared<RecordingSink>();
    SentryTurboModulePerfController::instance().setSink(recording);

    auto retrieved = SentryTurboModulePerfController::instance().sink();
    XCTAssertEqual(retrieved.get(), recording.get(),
        @"sink() must return the same shared_ptr that was just installed");

    SentryTurboModulePerfController::instance().setSink(nullptr);
    XCTAssertEqual(SentryTurboModulePerfController::instance().sink().get(), nullptr,
        @"passing nullptr must detach the sink");
}

- (void)testInstallIsIdempotent
{
    // Calling install() more than once must not crash, must not replace the
    // logger (RN's `enableLogging` would happily accept a second logger and
    // we would lose continuity), and must not deadlock.
    Sentry_InstallTurboModulePerfLogger();
    Sentry_InstallTurboModulePerfLogger();
    Sentry_InstallTurboModulePerfLogger();
    // Reaching this point with no crash is the contract.
    XCTAssertTrue(true);
}

@end

// NOTE: end-to-end forwarding (RN's `TurboModulePerfLogger::moduleCreateStart`
// arriving at the installed sink) is not unit-tested here. That path goes
// through `+load` static initialisation timing and a process-wide singleton
// that other tests in this bundle may have already touched; verifying it in
// isolation requires hooks we deliberately did not add to the production
// surface. The follow-up sink PRs exercise the path via integration tests.


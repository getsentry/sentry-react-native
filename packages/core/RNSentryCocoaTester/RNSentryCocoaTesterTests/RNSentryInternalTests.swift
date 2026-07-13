@_spi(Private) import RNSentry
@_spi(Private) import Sentry
import XCTest

/// Smoke coverage for the `RNSentryInternal` ObjC↔Swift bridge.
///
/// These are not exhaustive tests of the underlying `SentrySDK.internal.*`
/// surface — sentry-cocoa owns that. We only assert the wrapper does not
/// crash, forwards data correctly, and honours the nil / platform guards
/// documented in `RNSentryInternal.swift`.
///
/// Follows the same lifecycle pattern as `RNSentryStartTests`: no explicit
/// `SentrySDK.close()` between tests. Calling `close` inside `tearDown` was
/// observed to hang the iOS simulator on CI (`IDETestOperationsObserver:
/// Failure collecting diagnostics ... Timed out after 600.0s`), presumably
/// because it races with sentry-cocoa's background workers.
final class RNSentryInternalTests: XCTestCase {

    private static let testDSN = "https://abcd@efgh.ingest.sentry.io/123456"

    private func startSDK() {
        RNSentrySDK.start { options in
            options.dsn = RNSentryInternalTests.testDSN
        }
    }

    // MARK: - envelope(fromData:)

    func testEnvelopeFromNilDataReturnsNil() {
        // Regression guard: the old ObjC `PrivateSentrySDKOnly.envelopeWithData:`
        // tolerated nil. `RNSentryInternal.envelope(fromData:)` must too, or
        // the ObjC bridge boundary would crash on a nil `NSData*` before the
        // Swift body runs. See RNSentry.mm captureEnvelope path.
        XCTAssertNil(RNSentryInternal.envelope(fromData: nil))
    }

    func testEnvelopeFromInvalidDataReturnsNil() {
        let junk = Data("this is not an envelope".utf8)
        XCTAssertNil(RNSentryInternal.envelope(fromData: junk))
    }

    // MARK: - SDK metadata

    func testSdkMetadataAccessorsAreNonEmpty() {
        startSDK()

        XCTAssertFalse(RNSentryInternal.sdkName.isEmpty)
        XCTAssertFalse(RNSentryInternal.sdkVersionString.isEmpty)
        XCTAssertFalse(RNSentryInternal.installationID.isEmpty)
        // `extraContext` may be empty on an unstarted SDK; here we only
        // assert the accessor does not crash and returns a dictionary.
        _ = RNSentryInternal.extraContext
    }

    // MARK: - Options

    func testOptionsAccessorReturnsLiveOptions() {
        startSDK()

        let options = RNSentryInternal.options
        XCTAssertNotNil(options.dsn)
    }

    func testOptionsFromDictionaryValidatesInput() throws {
        let dict: [String: Any] = ["dsn": RNSentryInternalTests.testDSN]
        let options = try RNSentryInternal.options(fromDictionary: dict)
        XCTAssertNotNil(options.dsn)
    }

    // MARK: - App start / performance hybrid flags

    func testAppStartHybridSDKModeIsReadWrite() {
        let previous = RNSentryInternal.appStartMeasurementHybridSDKMode
        RNSentryInternal.appStartMeasurementHybridSDKMode = !previous
        XCTAssertEqual(RNSentryInternal.appStartMeasurementHybridSDKMode, !previous)
        RNSentryInternal.appStartMeasurementHybridSDKMode = previous
    }

    #if os(iOS) || os(tvOS) || os(visionOS)
    func testFramesTrackingHybridSDKModeIsReadWrite() {
        let previous = RNSentryInternal.framesTrackingMeasurementHybridSDKMode
        RNSentryInternal.framesTrackingMeasurementHybridSDKMode = !previous
        XCTAssertEqual(RNSentryInternal.framesTrackingMeasurementHybridSDKMode, !previous)
        RNSentryInternal.framesTrackingMeasurementHybridSDKMode = previous
    }
    #endif

    // MARK: - Swizzle bridge

    func testSwizzleRNSScreenViewDidAppearNoOpWhenClassMissing() {
        // `RNSScreen` is not linked in this test target; the bridge should
        // early-return without invoking the hook and without touching the
        // ObjC runtime.
        var hookCalled = false
        RNSentryInternal.swizzleRNSScreenViewDidAppear { hookCalled = true }
        XCTAssertFalse(hookCalled, "hook must not be called at registration time")
    }
}

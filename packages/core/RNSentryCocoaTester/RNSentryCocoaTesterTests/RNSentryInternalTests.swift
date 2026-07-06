@_spi(Private) import Sentry
import XCTest

/// Smoke coverage for the `RNSentryInternal` ObjC↔Swift bridge.
///
/// These are not exhaustive tests of the underlying `SentrySDK.internal.*`
/// surface — sentry-cocoa owns that. We only assert the wrapper does not
/// crash, forwards data correctly, and honours the nil / platform guards
/// documented in `RNSentryInternal.swift`.
final class RNSentryInternalTests: XCTestCase {

    override func setUp() {
        super.setUp()
        // Start the native SDK so `SentrySDK.internal.*` returns real state
        // instead of the no-op hub. A minimal, offline-safe DSN is enough.
        RNSentrySDK.start { options in
            options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
        }
    }

    override func tearDown() {
        SentrySDK.close()
        super.tearDown()
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
        XCTAssertFalse(RNSentryInternal.sdkName.isEmpty)
        XCTAssertFalse(RNSentryInternal.sdkVersionString.isEmpty)
        XCTAssertFalse(RNSentryInternal.installationID.isEmpty)
        // `extraContext` may be empty on an unstarted SDK; here we only
        // assert the accessor does not crash and returns a dictionary.
        _ = RNSentryInternal.extraContext
    }

    func testSetSdkNameAndAddPackageRoundTrip() {
        RNSentryInternal.setSdkName("sentry.cocoa.react-native.test", version: "42.42.42")
        XCTAssertEqual(RNSentryInternal.sdkName, "sentry.cocoa.react-native.test")
        XCTAssertEqual(RNSentryInternal.sdkVersionString, "42.42.42")

        // Add-package is void; assert it does not throw. Idempotency across
        // sentry-cocoa releases is not part of the bridge's contract.
        RNSentryInternal.addSdkPackage("test-package", version: "1.0.0")
    }

    // MARK: - Options

    func testOptionsAccessorReturnsLiveOptions() {
        let options = RNSentryInternal.options
        XCTAssertNotNil(options.dsn)
    }

    func testOptionsFromDictionaryValidatesInput() throws {
        let dict: [String: Any] = ["dsn": "https://abcd@efgh.ingest.sentry.io/123456"]
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

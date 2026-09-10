@_spi(Private) import Sentry
import XCTest

/// Guards the iOS screenshot regression from 8.19.0 (#6497), which forced the revert
/// of the `SentrySDK.internal` migration (#6380) in 8.20.0.
///
/// RN reads `SentrySDK.internal` before `SentrySDK.start`: `RNSentryStart` does it
/// itself, and JS integrations call native methods (`fetchNativeAppStart`,
/// `fetchNativeSdkInfo`) while the SDK is still initializing. Constructing
/// `SentryInternalApi` eagerly reads `SentryDependencyContainer.screenshotSource`,
/// which used to be a `lazy var` that permanently cached the `nil` its builder returns
/// while `startOptions` is unset. That killed every iOS screenshot for the rest of the
/// process — Feedback Widget screenshot, `attachScreenshot` and
/// `Sentry.captureScreenshot()` all silently returned nothing.
///
/// Fixed in sentry-cocoa 9.24.0 (getsentry/sentry-cocoa#8578) by turning
/// `screenshotSource` into a computed property that rebuilds until `startOptions`
/// is available. This test fails against any earlier version.
final class RNSentryScreenshotSourceTests: XCTestCase {

    func testScreenshotCaptureSurvivesInternalApiAccessBeforeStart() throws {
        // Model a process that has not started the SDK yet.
        SentrySDK.close()
        SentryDependencyContainer.reset()
        // `reset()` deliberately carries `startOptions` over to the new container, so
        // clear it explicitly.
        SentrySDK.setStart(with: nil)

        // The pre-start access that used to poison the screenshot source.
        _ = SentrySDK.internal

        var error: NSError?
        RNSentryStart.start(
            options: [
                "dsn": "https://abcd@efgh.ingest.sentry.io/123456",
                "attachScreenshot": true
            ],
            error: &error)
        if let error = error {
            throw error
        }

        XCTAssertNotNil(
            SentrySDK.internal.screenshot.capture(),
            "screenshot capture must still work after SentrySDK.internal was read before SentrySDK.start")
    }
}

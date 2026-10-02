@_spi(Private) import Sentry
import XCTest

final class RNSentrySDKStartInvalidOptionsTests: XCTestCase {

    // When neither the options file nor the fallback can produce options,
    // the native auto-init path must not start the SDK with nil options.
    func testStartWithUnparseableOptionsFileDoesNotStartSdk() {
        // Arrange
        SentrySDK.close()

        // Act — a non-existent options path forces the nil-options fallback
        RNSentrySDK.start("/does/not/exist/sentry.options.json", configureOptions: nil)

        // Assert
        XCTAssertFalse(SentrySDK.isEnabled, "the native SDK must not start when options cannot be created")
    }
}

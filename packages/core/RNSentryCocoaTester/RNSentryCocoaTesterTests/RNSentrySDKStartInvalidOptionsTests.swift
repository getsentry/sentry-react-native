@_spi(Private) import Sentry
import XCTest

final class RNSentrySDKStartInvalidOptionsTests: XCTestCase {

    // When neither the options file nor configureOptions provides a DSN,
    // the native auto-init path must not start the SDK.
    func testStartWithUnparseableOptionsFileDoesNotStartSdk() {
        // Arrange
        SentrySDK.close()

        // Act — a non-existent options path and no configureOptions leave no DSN
        RNSentrySDK.start("/does/not/exist/sentry.options.json", configureOptions: nil)

        // Assert
        XCTAssertFalse(SentrySDK.isEnabled, "the native SDK must not start when options cannot be created")
    }
}

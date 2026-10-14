@_spi(Private) import Sentry
import XCTest

final class RNSentryStartInvalidOptionsTests: XCTestCase {

    // An invalid DSN must surface a parse error, not start the native SDK with nil
    // options (which crashes it).
    func testStartWithInvalidDsnSurfacesErrorAndDoesNotStartSdk() {
        // Arrange
        SentrySDK.close()

        var error: NSError?

        // Act — mirrors an unexpanded build variable reaching the DSN
        RNSentryStart.start(options: [
            "dsn": "$SOME_ENV_VAR"
        ], error: &error)

        // Assert
        XCTAssertNotNil(error, "an invalid DSN must surface a parse error instead of starting the SDK with nil options")
        XCTAssertFalse(SentrySDK.isEnabled, "the native SDK must not start when option parsing fails")
    }
}

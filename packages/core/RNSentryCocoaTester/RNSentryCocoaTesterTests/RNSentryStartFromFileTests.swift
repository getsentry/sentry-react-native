import XCTest

final class RNSentryStartFromFileTests: XCTestCase {

    func testNoThrowOnMissingOptionsFile() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getNonExistingOptionsPath(), configureOptions: { _ in
            wasConfigurationCalled = true
        })

        XCTAssertTrue(wasConfigurationCalled)

        let actualOptions = PrivateSentrySDKOnly.options
        XCTAssertNil(actualOptions.dsn)
        XCTAssertNil(actualOptions.parsedDsn)
    }

    func testNoThrowOnInvalidFileType() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getInvalidOptionsTypePath(), configureOptions: { _ in
            wasConfigurationCalled = true
        })

        XCTAssertTrue(wasConfigurationCalled)

        let actualOptions = PrivateSentrySDKOnly.options
        XCTAssertNil(actualOptions.dsn)
        XCTAssertNil(actualOptions.parsedDsn)
    }

    func testNoThrowOnInvalidOptions() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getInvalidOptionsPath(), configureOptions: { _ in
            wasConfigurationCalled = true
        })

        XCTAssertTrue(wasConfigurationCalled)

        let actualOptions = PrivateSentrySDKOnly.options
        XCTAssertNil(actualOptions.dsn)
        XCTAssertNotNil(actualOptions.parsedDsn)
        XCTAssertEqual(actualOptions.environment, "environment-from-invalid-file")
    }

    func testLoadValidOptions() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getValidOptionsPath(), configureOptions: { _ in
            wasConfigurationCalled = true
        })

        XCTAssertTrue(wasConfigurationCalled)

        let actualOptions = PrivateSentrySDKOnly.options
        XCTAssertNil(actualOptions.dsn)
        XCTAssertNotNil(actualOptions.parsedDsn)
        XCTAssertEqual(actualOptions.environment, "environment-from-valid-file")
    }

    func testOptionsFromFileInConfigureOptions() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getValidOptionsPath()) { options in
            wasConfigurationCalled = true
            XCTAssertEqual(options.environment, "environment-from-valid-file")
        }

        XCTAssertTrue(wasConfigurationCalled)
    }

    func testOptionsOverwrittenInConfigureOptions() {
        RNSentrySDK.start(getValidOptionsPath()) { options in
            options.environment = "new-environment"
        }

        let actualOptions = PrivateSentrySDKOnly.options
        XCTAssertEqual(actualOptions.environment, "new-environment")
    }

    func getNonExistingOptionsPath() -> String {
        return "/non-existing.options.json"
    }

    func getInvalidOptionsTypePath() -> String {
        guard let path = getTestBundle().path(forResource: "invalid.options", ofType: "txt") else {
            fatalError("Could not get invalid type options path")
        }
        return path
    }

    func getInvalidOptionsPath() -> String {
        guard let path = getTestBundle().path(forResource: "invalid.options", ofType: "json") else {
            fatalError("Could not get invalid options path")
        }
        return path
    }

    func getValidOptionsPath() -> String {
        guard let path = getTestBundle().path(forResource: "valid.options", ofType: "json") else {
            fatalError("Could not get invalid options path")
        }
        return path
    }

    func getTestBundle() -> Bundle {
        let maybeBundle = Bundle.allBundles.first(where: { $0.bundlePath.hasSuffix(".xctest") })
        guard let bundle = maybeBundle else {
            fatalError("Could not find test bundle")
        }
        return bundle
    }
}

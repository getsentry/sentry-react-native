@_spi(Private) import Sentry
import XCTest

final class RNSentryStartFromFileTests: XCTestCase {

    override func setUp() {
        super.setUp()
        SentrySDK.close()
    }

    func testNoThrowOnMissingOptionsFile() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getNonExistingOptionsPath(), configureOptions: { _ in
            wasConfigurationCalled = true
        })

        XCTAssertTrue(wasConfigurationCalled)
        XCTAssertFalse(SentrySDK.isEnabled)
    }

    func testStartsWithConfigureDsnOnMissingOptionsFile() {
        RNSentrySDK.start(getNonExistingOptionsPath(), configureOptions: { options in
            options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
        })

        XCTAssertTrue(SentrySDK.isEnabled)
        XCTAssertEqual(SentrySDK.internal.options.dsn, "https://abcd@efgh.ingest.sentry.io/123456")
    }

    func testNoThrowOnInvalidFileType() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getInvalidOptionsTypePath(), configureOptions: { _ in
            wasConfigurationCalled = true
        })

        XCTAssertTrue(wasConfigurationCalled)
        XCTAssertFalse(SentrySDK.isEnabled)
    }

    func testStartsWithConfigureDsnOnInvalidFileType() {
        RNSentrySDK.start(getInvalidOptionsTypePath(), configureOptions: { options in
            options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
        })

        XCTAssertTrue(SentrySDK.isEnabled)
        XCTAssertEqual(SentrySDK.internal.options.dsn, "https://abcd@efgh.ingest.sentry.io/123456")
    }

    func testNoThrowOnInvalidOptions() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getInvalidOptionsPath(), configureOptions: { _ in
            wasConfigurationCalled = true
        })

        XCTAssertTrue(wasConfigurationCalled)

        let actualOptions = SentrySDK.internal.options
        XCTAssertEqual(actualOptions.dsn, "https://abcd@efgh.ingest.sentry.io/123456")
        XCTAssertNotNil(actualOptions.parsedDsn)
        XCTAssertEqual(actualOptions.environment, "environment-from-invalid-file")
    }

    func testLoadValidOptions() {
        var wasConfigurationCalled = false

        RNSentrySDK.start(getValidOptionsPath(), configureOptions: { _ in
            wasConfigurationCalled = true
        })

        XCTAssertTrue(wasConfigurationCalled)

        let actualOptions = SentrySDK.internal.options
        XCTAssertEqual(actualOptions.dsn, "https://abcd@efgh.ingest.sentry.io/123456")
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

        let actualOptions = SentrySDK.internal.options
        XCTAssertEqual(actualOptions.environment, "new-environment")
    }

    func testDoesNotStartWithNullDsnInOptionsFile() throws {
        let path = try writeTemporaryOptionsFile("{ \"dsn\": null, \"environment\": \"environment-from-null-dsn-file\" }")
        defer { try? FileManager.default.removeItem(atPath: path) }

        var wasConfigurationCalled = false
        RNSentrySDK.start(path, configureOptions: { options in
            wasConfigurationCalled = true
            XCTAssertEqual(options.environment, "environment-from-null-dsn-file")
        })

        XCTAssertTrue(wasConfigurationCalled)
        XCTAssertFalse(SentrySDK.isEnabled)
    }

    func testDoesNotStartWhenConfigureOptionsSetsInvalidDsn() {
        RNSentrySDK.start(getValidOptionsPath(), configureOptions: { options in
            options.dsn = "invalid-dsn"
        })

        XCTAssertFalse(SentrySDK.isEnabled)
    }

    func testStartsFromJsAfterSkippedNativeStart() throws {
        RNSentrySDK.start(getNonExistingOptionsPath(), configureOptions: nil)
        XCTAssertFalse(SentrySDK.isEnabled)

        var error: NSError?
        RNSentryStart.start(options: ["dsn": "https://abcd@efgh.ingest.sentry.io/123456"], error: &error)

        XCTAssertNil(error)
        XCTAssertTrue(SentrySDK.isEnabled)
        XCTAssertEqual(SentrySDK.internal.options.dsn, "https://abcd@efgh.ingest.sentry.io/123456")
    }

    func writeTemporaryOptionsFile(_ content: String) throws -> String {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).options.json")
        try content.write(to: url, atomically: true, encoding: .utf8)
        return url.path
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

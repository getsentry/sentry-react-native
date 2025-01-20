import XCTest

final class RNSentryStartTests: XCTestCase {

    func testStartDoesNotThrowWithoutConfigure() {
        RNSentrySDK.start(configureOptions: nil)
    }

    func assertReactDefaults(_ actualOptions: Options?) {
        XCTAssertFalse(actualOptions!.enableCaptureFailedRequests)
        XCTAssertNil(actualOptions!.tracesSampleRate)
        XCTAssertNil(actualOptions!.tracesSampler)
        XCTAssertFalse(actualOptions!.enableTracing)
    }

    func testStartSetsReactDeafults() {
        var actualOptions: Options? = nil

        RNSentrySDK.start { options in
            actualOptions = options
        }

        XCTAssertNotNil(actualOptions, "start have not provided default options or have not executed configure callback")
        assertReactDefaults(actualOptions)
    }

    func testAutoStartSetsReactDefaults() throws {
        try startFromRN(options: [
            "dsn" : "https://abcd@efgh.ingest.sentry.io/123456"
        ])

        let actualOptions = PrivateSentrySDKOnly.options;
        assertReactDefaults(actualOptions)
    }

    func testAutoStartWithEmptyOptionsThrows() {
        XCTAssertThrowsError(try startFromRN(options: [:]))
    }

    func testStartEnablesHybridTracing() throws {
        let testCases: [() throws -> Void] = [
            {
                RNSentrySDK.start { options in
                    options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
                }
            },
            {
                try self.startFromRN(options: [
                    "dsn" : "https://abcd@efgh.ingest.sentry.io/123456",
                ])
            },
            {
                RNSentrySDK.start { options in
                    options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
                    options.enableAutoPerformanceTracing = true
                }
            },
            {
                try self.startFromRN(options: [
                    "dsn" : "https://abcd@efgh.ingest.sentry.io/123456",
                    "enableAutoPerformanceTracing": true,
                ])
            }
        ]

        // Test each implementation
        for startMethod in testCases {
            try startMethod()
        }

        let actualOptions = PrivateSentrySDKOnly.options

        XCTAssertTrue(PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode)
        XCTAssertTrue(PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode)
    }

    func testStartDisablesHybridTracing() throws {
        let testCases: [() throws -> Void] = [
            {
                RNSentrySDK.start { options in
                    options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
                    options.enableAutoPerformanceTracing = false
                }
            },
            {
                try self.startFromRN(options: [
                    "dsn" : "https://abcd@efgh.ingest.sentry.io/123456",
                    "enableAutoPerformanceTracing": false,
                ])
            }
        ]

        // Test each implementation
        for startMethod in testCases {
            try startMethod()
        }

        let actualOptions = PrivateSentrySDKOnly.options

        XCTAssertFalse(PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode)
        XCTAssertFalse(PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode)
    }

    func startFromRN(options: [AnyHashable: Any]) throws {
        var error: NSError?
        RNSentryStart.start(options: options, error: &error)

        if let error = error {
            throw error
        }
    }
}

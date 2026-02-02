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
        var actualOptions: Options?

        RNSentrySDK.start { options in
            actualOptions = options
        }

        XCTAssertNotNil(actualOptions, "start have not provided default options or have not executed configure callback")
        assertReactDefaults(actualOptions)
    }

    func testAutoStartSetsReactDefaults() throws {
        try startFromRN(options: [
            "dsn": "https://abcd@efgh.ingest.sentry.io/123456"
        ])

        let actualOptions = PrivateSentrySDKOnly.options
        assertReactDefaults(actualOptions)
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
                    "dsn": "https://abcd@efgh.ingest.sentry.io/123456"
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
                    "dsn": "https://abcd@efgh.ingest.sentry.io/123456",
                    "enableAutoPerformanceTracing": true
                ])
            }
        ]

        // Test each implementation
        for startMethod in testCases {
            try startMethod()

            let actualOptions = PrivateSentrySDKOnly.options

            XCTAssertTrue(PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode)
            XCTAssertTrue(PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode)
        }
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
                    "dsn": "https://abcd@efgh.ingest.sentry.io/123456",
                    "enableAutoPerformanceTracing": false
                ])
            }
        ]

        for startMethod in testCases {
            try startMethod()

            let actualOptions = PrivateSentrySDKOnly.options

            XCTAssertFalse(PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode)
            XCTAssertFalse(PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode)
        }
    }

    func testStartIgnoresUnhandledJsExceptions() throws {
        let testCases: [() throws -> Void] = [
            {
                RNSentrySDK.start { options in
                    options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
                }
            },
            {
                try self.startFromRN(options: [
                    "dsn": "https://abcd@efgh.ingest.sentry.io/123456"
                ])
            }
        ]

        for startMethod in testCases {
            try startMethod()

            let actualOptions = PrivateSentrySDKOnly.options

            let actualEvent = actualOptions.beforeSend!(createUnhandledJsExceptionEvent())

            XCTAssertNil(actualEvent)
        }
    }

    func testStartSetsNativeEventOrigin() throws {
        let testCases: [() throws -> Void] = [
            {
                RNSentrySDK.start { options in
                    options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
                }
            },
            {
                try self.startFromRN(options: [
                    "dsn": "https://abcd@efgh.ingest.sentry.io/123456"
                ])
            }
        ]

        for startMethod in testCases {
            try startMethod()

            let actualOptions = PrivateSentrySDKOnly.options

            let actualEvent = actualOptions.beforeSend!(createNativeEvent())

            XCTAssertNotNil(actualEvent)
            XCTAssertNotNil(actualEvent!.tags)
            XCTAssertEqual(actualEvent!.tags!["event.origin"], "ios")
            XCTAssertEqual(actualEvent!.tags!["event.environment"], "native")
        }
    }

    func testStartDoesNotOverwriteUserBeforeSend() {
        var executed = false

        RNSentrySDK.start { options in
            options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
            options.beforeSend = { event in
                executed = true
                return event
            }
        }

        PrivateSentrySDKOnly.options.beforeSend!(genericEvent())

        XCTAssertTrue(executed)
    }

    func testStartSetsHybridSdkName() throws {
        let testCases: [() throws -> Void] = [
            {
                RNSentrySDK.start { options in
                    options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
                }
            },
            {
                try self.startFromRN(options: [
                    "dsn": "https://abcd@efgh.ingest.sentry.io/123456"
                ])
            }
        ]

        for startMethod in testCases {
            try startMethod()

            let actualEvent = captuteTestEvent()

            XCTAssertNotNil(actualEvent)
            XCTAssertNotNil(actualEvent!.sdk)
            XCTAssertEqual(actualEvent!.sdk!["name"] as! String, NATIVE_SDK_NAME)

            let packages = actualEvent!.sdk!["packages"] as! [[String: String]]
            let reactPackage = packages.first { $0["name"] == REACT_NATIVE_SDK_PACKAGE_NAME }

            XCTAssertNotNil(reactPackage)
            XCTAssertEqual(reactPackage!["name"], REACT_NATIVE_SDK_PACKAGE_NAME)
            XCTAssertEqual(reactPackage!["version"], REACT_NATIVE_SDK_PACKAGE_VERSION)
        }
    }

    func startFromRN(options: [String: Any]) throws {
        var error: NSError?
        RNSentryStart.start(options: options, error: &error)

        if let error = error {
            throw error
        }
    }

    func createUnhandledJsExceptionEvent() -> Event {
        let event = Event()
        event.exceptions = []
        event.exceptions!.append(Exception(value: "Test", type: "Unhandled JS Exception: undefined is not a function"))
        return event
    }

    func createNativeEvent() -> Event {
        let event = Event()
        event.sdk = [
            "name": NATIVE_SDK_NAME,
            "version": "1.2.3"
        ]
        return event
    }

    func genericEvent() -> Event {
        return Event()
    }

    func captuteTestEvent() -> Event? {
        var actualEvent: Event?

        // This is the closest to the sent event we can get using the actual Sentry start method
        let originalBeforeSend = PrivateSentrySDKOnly.options.beforeSend
        PrivateSentrySDKOnly.options.beforeSend = { event in
            if let originalBeforeSend = originalBeforeSend {
                let processedEvent = originalBeforeSend(event)
                actualEvent = processedEvent
                return processedEvent
            }
            actualEvent = event
            return event
        }

        SentrySDK.capture(message: "Test")

        return actualEvent
    }
}

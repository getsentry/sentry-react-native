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

    func testStartIgnoresJsErrorCppExceptionWrapper() throws {
        // Reproduces getsentry/sentry-react-native#6116:
        // When the native SDK is started early via sentry.options.json ("Capture App Start
        // Errors"), New Architecture wraps unhandled JS errors in a C++ exception that the
        // native crash handler captures. Without dedup in updateWithReactFinals, both the JS
        // event and the C++ wrapper are sent. Cover both init paths to keep them aligned.
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

            let cppWrapperEvent = Event()
            cppWrapperEvent.exceptions = [
                Exception(
                    value: "N8facebook3jsi7JSErrorE: ExceptionsManager.reportException raised an exception: Unhandled JS Exception: Error: Test error",
                    type: "C++ Exception"
                )
            ]
            XCTAssertNil(actualOptions.beforeSend!(cppWrapperEvent),
                "Event with ExceptionsManager.reportException in value should be dropped")

            let legitimateCppEvent = Event()
            legitimateCppEvent.exceptions = [
                Exception(
                    value: "std::runtime_error: Some other C++ error occurred",
                    type: "C++ Exception"
                )
            ]
            XCTAssertNotNil(actualOptions.beforeSend!(legitimateCppEvent),
                "Legitimate C++ exception without ExceptionsManager.reportException should not be dropped")
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

    func testScreenshotMaskingOptions() throws {
        try startFromRN(options: [
            "dsn": "https://abcd@efgh.ingest.sentry.io/123456",
            "attachScreenshot": true,
            "screenshot": [
                "maskAllText": false,
                "maskAllImages": true
            ]
        ])

        let actualOptions = PrivateSentrySDKOnly.options
        XCTAssertTrue(actualOptions.attachScreenshot)
        XCTAssertFalse(actualOptions.screenshot.maskAllText)
        XCTAssertTrue(actualOptions.screenshot.maskAllImages)
    }

    func testScreenshotMaskingOptionsDefaults() throws {
        try startFromRN(options: [
            "dsn": "https://abcd@efgh.ingest.sentry.io/123456",
            "attachScreenshot": true
        ])

        let actualOptions = PrivateSentrySDKOnly.options
        XCTAssertTrue(actualOptions.attachScreenshot)
        XCTAssertTrue(actualOptions.screenshot.maskAllText)
        XCTAssertTrue(actualOptions.screenshot.maskAllImages)
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

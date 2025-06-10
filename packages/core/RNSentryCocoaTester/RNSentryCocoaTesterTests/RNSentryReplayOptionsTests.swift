import Sentry
import XCTest

final class RNSentryReplayOptions: XCTestCase {

    func testOptionsWithoutExperimentalAreIgnored() {
        let optionsDict = NSMutableDictionary()
        RNSentryReplay.updateOptions(optionsDict)

        XCTAssertEqual(optionsDict.count, 0)
    }

    func testReplayOptionsDictContainsAllOptionsKeysWhenSessionSampleRateUsed() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysSessionSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let sessionReplay = optionsDict["sessionReplay"] as! [String: Any]

        assertAllDefaultReplayOptionsAreNotNil(replayOptions: sessionReplay)
    }

    func testReplayOptionsDictContainsAllOptionsKeysWhenErrorSampleRateUsed() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let sessionReplay = optionsDict["sessionReplay"] as! [String: Any]

        assertAllDefaultReplayOptionsAreNotNil(replayOptions: sessionReplay)
    }

    func testReplayOptionsDictContainsAllOptionsKeysWhenErrorAndSessionSampleRatesUsed() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "replaysSessionSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let sessionReplay = optionsDict["sessionReplay"] as! [String: Any]

        assertAllDefaultReplayOptionsAreNotNil(replayOptions: sessionReplay)
    }

    func assertAllDefaultReplayOptionsAreNotNil(replayOptions: [String: Any]) {
        XCTAssertEqual(replayOptions.count, 8)
        XCTAssertNotNil(replayOptions["sessionSampleRate"])
        XCTAssertNotNil(replayOptions["errorSampleRate"])
        XCTAssertNotNil(replayOptions["maskAllImages"])
        XCTAssertNotNil(replayOptions["maskAllText"])
        XCTAssertNotNil(replayOptions["maskedViewClasses"])
        XCTAssertNotNil(replayOptions["sdkInfo"])
        XCTAssertNotNil(replayOptions["enableViewRendererV2"])
        XCTAssertNotNil(replayOptions["enableFastViewRendering"])
    }

    func testSessionSampleRate() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysSessionSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])
        XCTAssertEqual(actualOptions.sessionReplay.sessionSampleRate, 0.75)
    }

    func testOnErrorSampleRate() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])
        XCTAssertEqual(actualOptions.sessionReplay.onErrorSampleRate, 0.75)
    }

    func testMaskAllVectors() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "maskAllVectors": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        XCTAssertEqual(optionsDict.count, 4)

        let sessionReplay = optionsDict["sessionReplay"] as! [String: Any]

        let maskedViewClasses = sessionReplay["maskedViewClasses"] as! [String]
        XCTAssertTrue(maskedViewClasses.contains("RNSVGSvgView"))
    }

    func testMaskAllImages() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "maskAllImages": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.maskAllImages, true)
        assertContainsClass(classArray: actualOptions.sessionReplay.maskedViewClasses, stringClass: "RCTImageView")
    }

    func testMaskAllImagesFalse() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "maskAllImages": false ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.maskAllImages, false)
        XCTAssertEqual(actualOptions.sessionReplay.maskedViewClasses.count, 0)
    }

    func testMaskAllText() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "maskAllText": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.maskAllText, true)
        assertContainsClass(classArray: actualOptions.sessionReplay.maskedViewClasses, stringClass: "RCTTextView")
        assertContainsClass(classArray: actualOptions.sessionReplay.maskedViewClasses, stringClass: "RCTParagraphComponentView")
    }

    func assertContainsClass(classArray: [AnyClass], stringClass: String) {
        XCTAssertTrue(mapToObjectIdentifiers(classArray: classArray).contains(ObjectIdentifier(NSClassFromString(stringClass)!)))
    }

    func mapToObjectIdentifiers(classArray: [AnyClass]) -> [ObjectIdentifier] {
        return classArray.map { ObjectIdentifier($0) }
    }

    func testMaskAllTextFalse() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "maskAllText": false ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.maskAllText, false)
        XCTAssertEqual(actualOptions.sessionReplay.maskedViewClasses.count, 0)
    }

    func testEnableViewRendererV2Default() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertTrue(actualOptions.sessionReplay.enableViewRendererV2)
    }

    func testEnableViewRendererV2True() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "enableViewRendererV2": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertTrue(actualOptions.sessionReplay.enableViewRendererV2)
    }

    func testEnableViewRendererV2False() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "enableViewRendererV2": false ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertFalse(actualOptions.sessionReplay.enableViewRendererV2)
    }

    func testEnableFastViewRenderingDefault() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertFalse(actualOptions.sessionReplay.enableFastViewRendering)
    }

    func testEnableFastViewRenderingTrue() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "enableFastViewRendering": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertTrue(actualOptions.sessionReplay.enableFastViewRendering)
    }

    func testEnableFastViewRenderingFalse() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "enableFastViewRendering": false ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertFalse(actualOptions.sessionReplay.enableFastViewRendering)
    }

}

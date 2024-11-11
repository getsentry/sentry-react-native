import Sentry
import XCTest

final class RNSentryReplayOptions: XCTestCase {

    func testOptionsWithoutExperimentalAreIgnored() {
        let optionsDict = NSMutableDictionary()
        RNSentryReplay.updateOptions(optionsDict)

        XCTAssertEqual(optionsDict.count, 0)
    }

    func testExperimentalOptionsWithoutReplaySampleRatesAreRemoved() {
        let optionsDict = (["_experiments": [:]] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        XCTAssertEqual(optionsDict.count, 0)
    }

    func testReplayOptionsDictContainsAllOptionsKeysWhenSessionSampleRateUsed() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "_experiments": [
                "replaysSessionSampleRate": 0.75
            ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let experimental = optionsDict["experimental"] as! [String: Any]
        let sessionReplay = experimental["sessionReplay"] as! [String: Any]

        assertAllDefaultReplayOptionsAreNotNil(replayOptions: sessionReplay)
    }

    func testReplayOptionsDictContainsAllOptionsKeysWhenErrorSampleRateUsed() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "_experiments": [
                "replaysOnErrorSampleRate": 0.75
            ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let experimental = optionsDict["experimental"] as! [String: Any]
        let sessionReplay = experimental["sessionReplay"] as! [String: Any]

        assertAllDefaultReplayOptionsAreNotNil(replayOptions: sessionReplay)
    }

    func testReplayOptionsDictContainsAllOptionsKeysWhenErrorAndSessionSampleRatesUsed() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "_experiments": [
                "replaysOnErrorSampleRate": 0.75,
                "replaysSessionSampleRate": 0.75
            ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let experimental = optionsDict["experimental"] as! [String: Any]
        let sessionReplay = experimental["sessionReplay"] as! [String: Any]

        assertAllDefaultReplayOptionsAreNotNil(replayOptions: sessionReplay)
    }

    func assertAllDefaultReplayOptionsAreNotNil(replayOptions: [String: Any]) {
        XCTAssertEqual(replayOptions.count, 5)
        XCTAssertNotNil(replayOptions["sessionSampleRate"])
        XCTAssertNotNil(replayOptions["errorSampleRate"])
        XCTAssertNotNil(replayOptions["redactAllImages"])
        XCTAssertNotNil(replayOptions["redactAllText"])
        XCTAssertNotNil(replayOptions["maskedViewClasses"])
    }

    func testSessionSampleRate() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "_experiments": [ "replaysSessionSampleRate": 0.75 ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])
        XCTAssertEqual(actualOptions.experimental.sessionReplay.sessionSampleRate, 0.75)
    }

    func testOnErrorSampleRate() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "_experiments": [ "replaysOnErrorSampleRate": 0.75 ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])
        XCTAssertEqual(actualOptions.experimental.sessionReplay.onErrorSampleRate, 0.75)
    }

    func testMaskAllVectors() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "_experiments": [ "replaysOnErrorSampleRate": 0.75 ],
            "mobileReplayOptions": [ "maskAllVectors": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        XCTAssertEqual(optionsDict.count, 3)

        let experimental = optionsDict["experimental"] as! [String: Any]
        let sessionReplay = experimental["sessionReplay"] as! [String: Any]

        let maskedViewClasses = sessionReplay["maskedViewClasses"] as! [String]
        XCTAssertEqual(maskedViewClasses.count, 1)
        XCTAssertEqual(maskedViewClasses[0], "RNSVGSvgView")

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])
        XCTAssertEqual(actualOptions.experimental.sessionReplay.maskedViewClasses.count, 0)
    }

    func testMaskAllImages() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "_experiments": [ "replaysOnErrorSampleRate": 0.75 ],
            "mobileReplayOptions": [ "maskAllImages": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.experimental.sessionReplay.maskAllImages, true)
        XCTAssertEqual(actualOptions.experimental.sessionReplay.maskedViewClasses.count, 1)
        XCTAssertNotNil(actualOptions.experimental.sessionReplay.maskedViewClasses[0])
        XCTAssertEqual(ObjectIdentifier(actualOptions.experimental.sessionReplay.maskedViewClasses[0]), ObjectIdentifier(NSClassFromString("RCTImageView")!))
    }

    func testMaskAllText() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "_experiments": [ "replaysOnErrorSampleRate": 0.75 ],
            "mobileReplayOptions": [ "maskAllText": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! Options(dict: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.experimental.sessionReplay.maskAllText, true)
        XCTAssertEqual(actualOptions.experimental.sessionReplay.maskedViewClasses.count, 2)
        XCTAssertNotNil(actualOptions.experimental.sessionReplay.maskedViewClasses[0])
        XCTAssertNotNil(actualOptions.experimental.sessionReplay.maskedViewClasses[1])
        XCTAssertEqual(ObjectIdentifier(actualOptions.experimental.sessionReplay.maskedViewClasses[0]), ObjectIdentifier(NSClassFromString("RCTTextView")!))
        XCTAssertEqual(ObjectIdentifier(actualOptions.experimental.sessionReplay.maskedViewClasses[1]), ObjectIdentifier(NSClassFromString("RCTParagraphComponentView")!))
    }

}

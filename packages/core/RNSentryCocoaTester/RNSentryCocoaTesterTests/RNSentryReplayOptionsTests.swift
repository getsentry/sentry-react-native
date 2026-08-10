@_spi(Private) import Sentry
import XCTest

// File length grows as replay option coverage is added; lint runs with `--strict`.
// swiftlint:disable file_length

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

    func testNetworkDetailOptionsAreForwardedToReplayOptions() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [
                "networkDetailAllowUrls": ["https://api.example.com"],
                "networkDetailDenyUrls": ["https://api.example.com/auth"],
                "networkCaptureBodies": true,
                "networkRequestHeaders": ["X-My-Header"],
                "networkResponseHeaders": ["X-Response-Header"]
            ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)
        let actualOptions = try! PrivateSentrySDKOnly.options(with: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.networkDetailAllowUrls.count, 1)
        XCTAssertEqual(actualOptions.sessionReplay.networkDetailDenyUrls.count, 1)
        XCTAssertTrue(actualOptions.sessionReplay.networkCaptureBodies)
        XCTAssertTrue(actualOptions.sessionReplay.networkRequestHeaders.contains("X-My-Header"))
        XCTAssertTrue(actualOptions.sessionReplay.networkResponseHeaders.contains("X-Response-Header"))
    }

    func testNetworkCaptureBodiesCanBeDisabled() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [
                "networkDetailAllowUrls": ["https://api.example.com"],
                "networkCaptureBodies": false
            ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)
        let actualOptions = try! PrivateSentrySDKOnly.options(with: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.networkDetailAllowUrls.count, 1)
        XCTAssertFalse(actualOptions.sessionReplay.networkCaptureBodies)
    }

    func assertAllDefaultReplayOptionsAreNotNil(replayOptions: [String: Any]) {
        XCTAssertEqual(replayOptions.count, 16)
        XCTAssertNotNil(replayOptions["sessionSampleRate"])
        XCTAssertNotNil(replayOptions["errorSampleRate"])
        XCTAssertNotNil(replayOptions["maskAllImages"])
        XCTAssertNotNil(replayOptions["maskAllText"])
        XCTAssertNotNil(replayOptions["maskedViewClasses"])
        XCTAssertNotNil(replayOptions["sdkInfo"])
        XCTAssertNotNil(replayOptions["enableViewRendererV2"])
        XCTAssertNotNil(replayOptions["enableFastViewRendering"])
        XCTAssertNotNil(replayOptions["quality"])
        XCTAssertNotNil(replayOptions["includedViewClasses"])
        XCTAssertNotNil(replayOptions["excludedViewClasses"])
        XCTAssertNotNil(replayOptions["networkDetailAllowUrls"])
        XCTAssertNotNil(replayOptions["networkDetailDenyUrls"])
        XCTAssertNotNil(replayOptions["networkCaptureBodies"])
        XCTAssertNotNil(replayOptions["networkRequestHeaders"])
        XCTAssertNotNil(replayOptions["networkResponseHeaders"])
    }

    func testSessionSampleRate() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysSessionSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])
        XCTAssertEqual(actualOptions.sessionReplay.sessionSampleRate, 0.75)
    }

    func testOnErrorSampleRate() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary
        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])
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

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

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

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

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

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.maskAllText, true)
        assertContainsClass(classArray: actualOptions.sessionReplay.maskedViewClasses, stringClass: "RCTTextView")
        assertContainsClass(classArray: actualOptions.sessionReplay.maskedViewClasses, stringClass: "RCTParagraphComponentView")
    }

    func assertContainsClass(classArray: [AnyClass], stringClass: String) {
        guard let cls = NSClassFromString(stringClass) else {
            return
        }
        XCTAssertTrue(mapToObjectIdentifiers(classArray: classArray).contains(ObjectIdentifier(cls)))
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

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.maskAllText, false)
        XCTAssertEqual(actualOptions.sessionReplay.maskedViewClasses.count, 0)
    }

    func testEnableViewRendererV2Default() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertTrue(actualOptions.sessionReplay.enableViewRendererV2)
    }

    func testEnableViewRendererV2True() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "enableViewRendererV2": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertTrue(actualOptions.sessionReplay.enableViewRendererV2)
    }

    func testEnableViewRendererV2False() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "enableViewRendererV2": false ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertFalse(actualOptions.sessionReplay.enableViewRendererV2)
    }

    func testEnableFastViewRenderingDefault() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertFalse(actualOptions.sessionReplay.enableFastViewRendering)
    }

    func testEnableFastViewRenderingTrue() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "enableFastViewRendering": true ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertTrue(actualOptions.sessionReplay.enableFastViewRendering)
    }

    func testEnableFastViewRenderingFalse() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "enableFastViewRendering": false ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertFalse(actualOptions.sessionReplay.enableFastViewRendering)
    }

    func testReplayQualityDefault() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.quality, SentryReplayOptions.SentryReplayQuality.medium)
    }

    func testReplayQualityLow() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "replaysSessionQuality": "low"
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.quality, SentryReplayOptions.SentryReplayQuality.low)
    }

    func testReplayQualityMedium() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "replaysSessionQuality": "medium"
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.quality, SentryReplayOptions.SentryReplayQuality.medium)
    }

    func testReplayQualityHigh() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "replaysSessionQuality": "high"
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.quality, SentryReplayOptions.SentryReplayQuality.high)
    }

    func testReplayQualityInvalidFallsBackToMedium() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "replaysSessionQuality": "invalid"
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        XCTAssertEqual(actualOptions.sessionReplay.quality, SentryReplayOptions.SentryReplayQuality.medium)
    }

    func testIncludedViewClasses() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "includedViewClasses": ["UILabel", "UIView", "UITextView"] ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        let includedViewClasses = actualOptions.sessionReplay.includedViewClasses
        XCTAssertEqual(includedViewClasses.count, 3)
        XCTAssertTrue(includedViewClasses.contains("UILabel"))
        XCTAssertTrue(includedViewClasses.contains("UIView"))
        XCTAssertTrue(includedViewClasses.contains("UITextView"))
    }

    func testExcludedViewClasses() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [ "excludedViewClasses": ["UICollectionView", "UITableView", "UIScrollView"] ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        let excludedViewClasses = actualOptions.sessionReplay.excludedViewClasses
        XCTAssertEqual(excludedViewClasses.count, 3)
        XCTAssertTrue(excludedViewClasses.contains("UICollectionView"))
        XCTAssertTrue(excludedViewClasses.contains("UITableView"))
        XCTAssertTrue(excludedViewClasses.contains("UIScrollView"))
    }

    func testIncludedAndExcludedViewClasses() {
        let optionsDict = ([
            "dsn": "https://abc@def.ingest.sentry.io/1234567",
            "replaysOnErrorSampleRate": 0.75,
            "mobileReplayOptions": [
                "includedViewClasses": ["UILabel", "UIView"],
                "excludedViewClasses": ["UICollectionView"]
            ]
        ] as NSDictionary).mutableCopy() as! NSMutableDictionary

        RNSentryReplay.updateOptions(optionsDict)

        let actualOptions = try! SentrySDK.internal.options(fromDictionary: optionsDict as! [String: Any])

        let includedViewClasses = actualOptions.sessionReplay.includedViewClasses
        XCTAssertEqual(includedViewClasses.count, 2)
        XCTAssertTrue(includedViewClasses.contains("UILabel"))
        XCTAssertTrue(includedViewClasses.contains("UIView"))

        let excludedViewClasses = actualOptions.sessionReplay.excludedViewClasses
        XCTAssertEqual(excludedViewClasses.count, 1)
        XCTAssertTrue(excludedViewClasses.contains("UICollectionView"))
    }
}

import Sentry
import XCTest

final class RNSentryBreadcrumbTests: XCTestCase {

    func testGeneratesSentryBreadcrumbFromNSDictionary() {
        let actualCrumb = RNSentryBreadcrumb.from([
            "level": "error",
            "category": "testCategory",
            "origin": "testOrigin",
            "type": "testType",
            "message": "testMessage",
            "data": [
                "test": "data"
            ]
        ])

        XCTAssertEqual(actualCrumb!.level, SentryLevel.error)
        XCTAssertEqual(actualCrumb!.category, "testCategory")
        XCTAssertEqual(actualCrumb!.origin, "testOrigin")
        XCTAssertEqual(actualCrumb!.type, "testType")
        XCTAssertEqual(actualCrumb!.message, "testMessage")
        XCTAssertEqual((actualCrumb!.data)!["test"] as! String, "data")
    }

    func testUsesReactNativeAsDefaultOrigin() {
        let actualCrumb = RNSentryBreadcrumb.from([
            "message": "testMessage"
        ])

        XCTAssertEqual(actualCrumb!.origin, "react-native")
    }
    
    func testKeepsOriginIfSet() {
        let actualCrumb = RNSentryBreadcrumb.from([
            "message": "testMessage",
            "origin": "someOrigin"
        ])

        XCTAssertEqual(actualCrumb!.origin, "someOrigin")
    }
    
    func testUsesInfoAsDefaultSentryLevel() {
        let actualCrumb = RNSentryBreadcrumb.from([
            "message": "testMessage"
        ])

        XCTAssertEqual(actualCrumb!.level, SentryLevel.info)
    }

    func testNullForMissingCategory() {
        let map: [String: Any] = [:]
        let actual = RNSentryBreadcrumb.getCurrentScreen(from: map)
        XCTAssertNil(actual)
    }

    func testNullForNonStringCategory() {
        let map: [String: Any] = ["category": false]
        let actual = RNSentryBreadcrumb.getCurrentScreen(from: map)
        XCTAssertNil(actual)
    }

    func testNullForNonNavigationCategory() {
        let map: [String: Any] = ["category": "unknown"]
        let actual = RNSentryBreadcrumb.getCurrentScreen(from: map)
        XCTAssertNil(actual)
    }

    func testNullForMissingData() {
        let map: [String: Any] = ["category": "navigation"]
        let actual = RNSentryBreadcrumb.getCurrentScreen(from: map)
        XCTAssertNil(actual)
    }

    func testNullForNonStringDataToKey() {
        let map: [String: Any] = [
            "category": "unknown",
            "data": ["to": 123]
        ]
        let actual = RNSentryBreadcrumb.getCurrentScreen(from: map)
        XCTAssertNil(actual)
    }

    func testScreenNameForValidNavigationBreadcrumb() {
        let map: [String: Any] = [
            "category": "navigation",
            "data": ["to": "newScreen"]
        ]
        let actual = RNSentryBreadcrumb.getCurrentScreen(from: map)
        XCTAssertEqual(actual, "newScreen")
    }

}

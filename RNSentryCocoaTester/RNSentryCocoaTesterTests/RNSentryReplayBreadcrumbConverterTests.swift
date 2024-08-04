import XCTest
import Sentry

final class RNSentryReplayBreadcrumbConverterTests: XCTestCase {

    func testConvertNavigationBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.timestamp = Date()
        testBreadcrumb.level = .info
        testBreadcrumb.type = "navigation"
        testBreadcrumb.category = "navigation"
        testBreadcrumb.data = [
            "from": "HomeScreen",
            "to": "ProfileScreen",
        ]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual)
        let event = actual!.serialize()
        let data = event["data"] as! [String: Any?]
        let payload = data["payload"] as! [String: Any?]
        let payloadData = payload["data"] as! [String: Any?]
        assertRRWebBreadcrumbDefaults(actual: event)
        XCTAssertEqual("info", payload["level"] as! String)
        XCTAssertEqual("navigation", payload["category"] as! String)
        XCTAssertEqual("HomeScreen", payloadData["from"] as! String)
        XCTAssertEqual("ProfileScreen", payloadData["to"] as! String)
    }

    func testConvertNavigationBreadcrumbWithOnlyTo() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.timestamp = Date()
        testBreadcrumb.level = .info
        testBreadcrumb.type = "navigation"
        testBreadcrumb.category = "navigation"
        testBreadcrumb.data = [
            "to": "ProfileScreen",
        ]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual)
        let event = actual!.serialize()
        let data = event["data"] as! [String: Any?]
        let payload = data["payload"] as! [String: Any?]
        let payloadData = payload["data"] as! [String: Any?]
        assertRRWebBreadcrumbDefaults(actual: event)
        XCTAssertEqual("info", payload["level"] as! String)
        XCTAssertEqual("navigation", payload["category"] as! String)
        XCTAssertNil(payloadData["from"] ?? nil)
        XCTAssertEqual("ProfileScreen", payloadData["to"] as! String)
    }

    func testConvertForegroundBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "navigation"
        testBreadcrumb.category = "app.lifecycle"
        testBreadcrumb.data = ["state": "foreground"]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual)
        let event = actual!.serialize()
        let data = event["data"] as! [String: Any?]
        let payload = data["payload"] as! [String: Any?];
        assertRRWebBreadcrumbDefaults(actual: event)
        XCTAssertEqual(payload["category"] as! String, "app.foreground")
    }

    func testConvertBackgroundBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "navigation"
        testBreadcrumb.category = "app.lifecycle"
        testBreadcrumb.data = ["state": "background"]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual)
        let event = actual!.serialize()
        let data = event["data"] as! [String: Any?]
        let payload = data["payload"] as! [String: Any?];
        assertRRWebBreadcrumbDefaults(actual: event)
        XCTAssertEqual(payload["category"] as! String, "app.background")
    }

    func testNotConvertSentryEventBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.category = "sentry.event"
        let actual = converter.convert(from: testBreadcrumb)
        XCTAssertNil(actual)
    }

    func testNotConvertSentryTransactionBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.category = "sentry.transaction"
        let actual = converter.convert(from: testBreadcrumb)
        XCTAssertNil(actual)
    }

    func testConvertTouchBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.timestamp = Date()
        testBreadcrumb.level = .info
        testBreadcrumb.type = "user"
        testBreadcrumb.category = "touch"
        testBreadcrumb.message = "this won't be used for replay"
        testBreadcrumb.data = [
            "path": [
                ["element": "element4", "file": "file4"]
            ]
        ]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual)
        let event = actual!.serialize()
        let data = event["data"] as! [String: Any?]
        let payload = data["payload"] as! [String: Any?]
        let payloadData = payload["data"] as! [String: Any?]
        assertRRWebBreadcrumbDefaults(actual: event)
        XCTAssertEqual("info", payload["level"] as! String)
        XCTAssertEqual("ui.tap", payload["category"] as! String)
        XCTAssertEqual(1, payloadData.keys.count)
        XCTAssertEqual([[
            "element": "element4",
            "file": "file4"
        ]], payloadData["path"] as! [[String: String]])
    }

    func testTouchMessageReturnsNilOnEmptyArray() throws {
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: [])
        XCTAssertEqual(actual, nil);
    }

    func testTouchMessageReturnsNilOnNilArray() throws {
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: nil as [Any]?)
        XCTAssertEqual(actual, nil);
    }

    func testTouchMessageReturnsNilOnMissingNameAndLevel() throws {
        let testPath: [Any?] = [["element": "element4", "file": "file4"]]
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: testPath as [Any])
        XCTAssertEqual(actual, nil);
    }

    func testTouchMessageReturnsMessageOnValidPathExample1() throws {
        let testPath: [Any?] = [
            ["label": "label0"],
            ["name": "name1"],
            ["name": "item2", "label": "label2"],
            ["name": "item3", "label": "label3", "element": "element3"],
            ["name": "item4", "label": "label4", "file": "file4"],
            ["name": "item5", "label": "label5", "element": "element5", "file": "file5"],
        ]
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: testPath as [Any])
        XCTAssertEqual(actual, "label3(element3) > label2 > name1 > label0");
    }

    func testTouchMessageReturnsMessageOnValidPathExample2() throws {
        let testPath: [Any?] = [
            ["name": "item2", "label": "label2"],
            ["name": "item3", "label": "label3", "element": "element3"],
            ["name": "item4", "label": "label4", "file": "file4"],
            ["name": "item5", "label": "label5", "element": "element5", "file": "file5"],
            ["label": "label6"],
            ["name": "name7"],
        ]
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: testPath as [Any])
        XCTAssertEqual(actual, "label5(element5, file5) > label4(file4) > label3(element3) > label2");
    }

    private func assertRRWebBreadcrumbDefaults(actual: [String: Any?]) {
        let data = actual["data"] as! [String: Any?]
        let payload = data["payload"] as! [String: Any?]
        XCTAssertEqual("default", payload["type"] as! String)
        XCTAssertEqual((payload["timestamp"] as! Double) * 1000.0, Double(actual["timestamp"] as! Int), accuracy: 1.0)
        XCTAssertTrue(payload["timestamp"] as! Double > 0.0)
    }

}

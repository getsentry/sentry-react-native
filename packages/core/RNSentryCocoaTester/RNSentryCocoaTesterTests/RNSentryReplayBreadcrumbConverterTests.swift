import Sentry
import XCTest

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
            "to": "ProfileScreen"
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
            "to": "ProfileScreen"
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
        XCTAssertNil(payloadData["from"])
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
        let payload = data["payload"] as! [String: Any?]
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
        let payload = data["payload"] as! [String: Any?]
        assertRRWebBreadcrumbDefaults(actual: event)
        XCTAssertEqual(payload["category"] as! String, "app.background")
    }

    func testConvertDeviceOrientationBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "default"
        testBreadcrumb.category = "device.orientation"
        testBreadcrumb.data = ["orientation": "portrait"]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual, "device.orientation breadcrumbs should pass through to the default converter")
    }

    func testConvertDeviceConnectivityBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "default"
        testBreadcrumb.category = "device.connectivity"
        testBreadcrumb.data = ["connectivity": "wifi"]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual, "device.connectivity breadcrumbs should pass through to the default converter")
    }

    func testConvertDeviceEventBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "system"
        testBreadcrumb.category = "device.event"
        testBreadcrumb.data = ["action": "LOW_MEMORY"]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual, "device.event breadcrumbs should pass through to the default converter")
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

    func testConvertMultiClickBreadcrumb() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.timestamp = Date()
        testBreadcrumb.level = .warning
        testBreadcrumb.type = "default"
        testBreadcrumb.category = "ui.multiClick"
        testBreadcrumb.message = "Submit"
        testBreadcrumb.data = [
            "path": [
                ["name": "SubmitButton", "label": "Submit", "file": "form.tsx"]
            ],
            "clickCount": 3,
            "metric": true
        ]
        let actual = converter.convert(from: testBreadcrumb)

        XCTAssertNotNil(actual)
        let event = actual!.serialize()
        let data = event["data"] as! [String: Any?]
        let payload = data["payload"] as! [String: Any?]
        assertRRWebBreadcrumbDefaults(actual: event)
        XCTAssertEqual("warning", payload["level"] as! String)
        XCTAssertEqual("ui.multiClick", payload["category"] as! String)
        XCTAssertEqual("Submit(form.tsx)", payload["message"] as! String)
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
        XCTAssertEqual(actual, nil)
    }

    func testTouchMessageReturnsNilOnNilArray() throws {
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: nil as [Any]?)
        XCTAssertEqual(actual, nil)
    }

    func testTouchMessageReturnsNilOnMissingNameAndLevel() throws {
        let testPath: [Any?] = [["element": "element4", "file": "file4"]]
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: testPath as [Any])
        XCTAssertEqual(actual, nil)
    }

    func testTouchMessageReturnsMessageOnValidPathExample1() throws {
        let testPath: [Any?] = [
            ["label": "label0"],
            ["name": "name1"],
            ["name": "item2", "label": "label2"],
            ["name": "item3", "label": "label3", "element": "element3"],
            ["name": "item4", "label": "label4", "file": "file4"],
            ["name": "item5", "label": "label5", "element": "element5", "file": "file5"]
        ]
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: testPath as [Any])
        XCTAssertEqual(actual, "label3(element3) > label2 > name1 > label0")
    }

    func testTouchMessageReturnsMessageOnValidPathExample2() throws {
        let testPath: [Any?] = [
            ["name": "item2", "label": "label2"],
            ["name": "item3", "label": "label3", "element": "element3"],
            ["name": "item4", "label": "label4", "file": "file4"],
            ["name": "item5", "label": "label5", "element": "element5", "file": "file5"],
            ["label": "label6"],
            ["name": "name7"]
        ]
        let actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(from: testPath as [Any])
        XCTAssertEqual(actual, "label5(element5, file5) > label4(file4) > label3(element3) > label2")
    }

    func testConvertNetworkBreadcrumbForwardsBodyAndHeadersAndStripsMeta() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.timestamp = Date()
        testBreadcrumb.category = "xhr"
        testBreadcrumb.data = [
            "url": "https://api.example.com/users",
            "method": "POST",
            "start_timestamp": NSNumber(value: 1_000.0),
            "end_timestamp": NSNumber(value: 2_000.0),
            "request": [
                "body": "{\"hello\":\"world\"}",
                "headers": ["content-type": "application/json"],
                "_meta": ["warnings": ["MAX_BODY_SIZE_EXCEEDED"]]
            ],
            "response": [
                "body": "[UNPARSEABLE_BODY_TYPE]",
                "_meta": ["warnings": ["UNPARSEABLE_BODY_TYPE"]]
            ]
        ]

        let actual = converter.convert(from: testBreadcrumb)
        XCTAssertNotNil(actual)
        let event = actual!.serialize()
        let eventData = event["data"] as! [String: Any?]
        let payload = eventData["payload"] as! [String: Any?]
        let data = payload["data"] as! [String: Any?]

        let request = data["request"] as! [String: Any]
        XCTAssertEqual("{\"hello\":\"world\"}", request["body"] as! String)
        XCTAssertEqual(["content-type": "application/json"], request["headers"] as! [String: String])
        XCTAssertNil(request["_meta"], "_meta must be stripped before forwarding to native rrweb")

        let response = data["response"] as! [String: Any]
        XCTAssertEqual("[UNPARSEABLE_BODY_TYPE]", response["body"] as! String)
        XCTAssertNil(response["_meta"])
    }

    func testConvertNetworkBreadcrumbDropsSideThatIsEmptyAfterMetaStrip() {
        let converter = RNSentryReplayBreadcrumbConverter()
        let testBreadcrumb = Breadcrumb()
        testBreadcrumb.timestamp = Date()
        testBreadcrumb.category = "xhr"
        testBreadcrumb.data = [
            "url": "https://api.example.com/users",
            "start_timestamp": NSNumber(value: 1_000.0),
            "end_timestamp": NSNumber(value: 2_000.0),
            // Request side contains only `_meta` — once stripped, nothing remains.
            "request": [
                "_meta": ["warnings": ["UNPARSEABLE_BODY_TYPE"]]
            ],
            // Response side is not a dict — should also be dropped.
            "response": "not-a-dict"
        ]

        let actual = converter.convert(from: testBreadcrumb)
        XCTAssertNotNil(actual)
        let event = actual!.serialize()
        let eventData = event["data"] as! [String: Any?]
        let payload = eventData["payload"] as! [String: Any?]
        let data = payload["data"] as! [String: Any?]

        XCTAssertNil(data["request"] ?? nil, "empty-after-strip request side must be omitted")
        XCTAssertNil(data["response"] ?? nil, "non-dict response side must be omitted")
    }

    private func assertRRWebBreadcrumbDefaults(actual: [String: Any?]) {
        let data = actual["data"] as! [String: Any?]
        let payload = data["payload"] as! [String: Any?]
        XCTAssertEqual("default", payload["type"] as! String)
        XCTAssertEqual((payload["timestamp"] as! Double) * 1_000.0, Double(actual["timestamp"] as! Int), accuracy: 1.0)
        XCTAssertTrue(payload["timestamp"] as! Double > 0.0)
    }

}

import XCTest

final class RNSentryReplayBreadcrumbConverterTests: XCTestCase {
  
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

}

import Sentry
import XCTest

final class RNSentryTimeToDisplayTests: XCTestCase {
    private let TEST_ID = "test-id"
    private let TEST_VAL = NSNumber(value: 123.4)

    func testPutsAndPopsRecords() {
        RNSentryTimeToDisplay.put(for: TEST_ID, value: TEST_VAL)

        let firstPop = RNSentryTimeToDisplay.pop(for: TEST_ID)
        let secondPop = RNSentryTimeToDisplay.pop(for: TEST_ID)

        XCTAssert(firstPop == TEST_VAL)
        XCTAssertNil(secondPop)
    }

    func testRemovesOldestEntryWhenFull() {
        let maxSize = TIME_TO_DISPLAY_ENTRIES_MAX_SIZE + 1
        for i in 1...maxSize {
            RNSentryTimeToDisplay.put(for: "\(TEST_ID)-\(i)", value: NSNumber(value: i))
        }

        let oldestEntry = RNSentryTimeToDisplay.pop(for: "\(TEST_ID)-1")
        let secondOldestEntry = RNSentryTimeToDisplay.pop(for: "\(TEST_ID)-2")
        let newestEntry = RNSentryTimeToDisplay.pop(for: "\(TEST_ID)-\(maxSize)")

        XCTAssertNil(oldestEntry)
        XCTAssertNotNil(secondOldestEntry)
        XCTAssertNotNil(newestEntry)
    }

    func testHandlesEarlyPoppedValues() {
        let maxSize = TIME_TO_DISPLAY_ENTRIES_MAX_SIZE + 1
        for i in 1...maxSize {
            let key = "\(TEST_ID)-\(i)"
            RNSentryTimeToDisplay.put(for: key, value: NSNumber(value: i))
            RNSentryTimeToDisplay.pop(for: key)
        }

        // Age counter reached the max size, but storage is empty
        // The internal structures should handle the situation

        let nextKey1 = "\(TEST_ID)-next-1"
        let nextKey2 = "\(TEST_ID)-next-2"
        let nextVal1 = NSNumber(value: 123.4)
        let nextVal2 = NSNumber(value: 567.8)
        RNSentryTimeToDisplay.put(for: nextKey1, value: nextVal1)
        RNSentryTimeToDisplay.put(for: nextKey2, value: nextVal2)

        let nextActualVal1 = RNSentryTimeToDisplay.pop(for: nextKey1)
        let nextActualVal2 = RNSentryTimeToDisplay.pop(for: nextKey2)

        XCTAssertEqual(nextVal1, nextActualVal1)
        XCTAssertEqual(nextVal2, nextActualVal2)

        XCTAssertNil(RNSentryTimeToDisplay.pop(for: nextKey1))
        XCTAssertNil(RNSentryTimeToDisplay.pop(for: nextKey2))
    }
}

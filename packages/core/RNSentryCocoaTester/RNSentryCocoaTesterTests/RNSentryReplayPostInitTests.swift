import Sentry
import XCTest

final class RNSentryReplayPostInitTests: XCTestCase {

    func testMask() {
        XCTAssertEqual(ObjectIdentifier(RNSentryReplay.getMaskClass()), ObjectIdentifier(RNSentryReplayMask.self))
    }

    func testUnmask() {
        XCTAssertEqual(ObjectIdentifier(RNSentryReplay.getUnmaskClass()), ObjectIdentifier(RNSentryReplayUnmask.self))
    }
}

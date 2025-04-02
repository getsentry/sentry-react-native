import Sentry
import XCTest

final class RNSentryOnDrawReporterTests: XCTestCase {
    private let ttidPrefix = "ttid-"
    private let ttfdPrefix = "ttfd-"
    private let spanId = "test-span-id"
    private let newSpanId = "new-test-span-id"

    func testRNSentryOnDrawReporterViewIsAvailableWhenUIKitIs() {
        let view = RNSentryOnDrawReporterView()
        XCTAssertNotNil(view)
    }

    func testWhenParentSpanIdAndTimeToFullDisplayAreSetTheNextRenderTimestampIsSaved() {
        let reporter = RNSentryOnDrawReporterView.createWithMockedListener()
        reporter!.fullDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["fullDisplay", "parentSpanId"])

        XCTAssertNotNil(RNSentryTimeToDisplay.pop(for: ttfdPrefix + spanId))
    }

    func testWhenParentSpanIdAndTimeToInitialDisplayAreSetTheNextRenderTimestampIsSaved() {
        let reporter = RNSentryOnDrawReporterView.createWithMockedListener()
        reporter!.initialDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["initialDisplay", "parentSpanId"])

        XCTAssertNotNil(RNSentryTimeToDisplay.pop(for: ttidPrefix + spanId))
    }

    func testWhenDisplayFlagAndParentSpanIdChangesTheNextFullDisplayRenderIsSaved() {
        let reporter = RNSentryOnDrawReporterView.createWithMockedListener()
        reporter!.fullDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["fullDisplay", "parentSpanId"])
        RNSentryTimeToDisplay.pop(for: ttfdPrefix + spanId)

        reporter!.fullDisplay = false
        reporter!.didSetProps(["fullDisplay"])
        reporter!.fullDisplay = true
        reporter!.parentSpanId = newSpanId
        reporter!.didSetProps(["fullDisplay", "parentSpanId"])

        XCTAssertNotNil(RNSentryTimeToDisplay.pop(for: ttfdPrefix + newSpanId))
    }

    func testWhenDisplayFlagAndParentSpanIdChangesTheNextInitialDisplayRenderIsSaved() {
        let reporter = RNSentryOnDrawReporterView.createWithMockedListener()
        reporter!.initialDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["initialDisplay", "parentSpanId"])
        RNSentryTimeToDisplay.pop(for: ttfdPrefix + spanId)

        reporter!.initialDisplay = false
        reporter!.didSetProps(["initalDisplay"])
        reporter!.initialDisplay = true
        reporter!.parentSpanId = newSpanId
        reporter!.didSetProps(["initialDisplay", "parentSpanId"])

        XCTAssertNotNil(RNSentryTimeToDisplay.pop(for: ttidPrefix + newSpanId))
    }

    func testWhenParentSpanIdDoesntChangeTheNextFullDisplayRenderIsNotSaved() {
        let reporter = RNSentryOnDrawReporterView.createWithMockedListener()
        reporter!.fullDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["fullDisplay", "parentSpanId"])
        RNSentryTimeToDisplay.pop(for: ttfdPrefix + spanId)

        reporter!.fullDisplay = false
        reporter!.didSetProps(["fullDisplay"])
        reporter!.fullDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["fullDisplay", "parentSpanId"])

        XCTAssertNil(RNSentryTimeToDisplay.pop(for: ttfdPrefix + spanId))
    }

    func testWhenParentSpanIdDoesntChangeTheNextInitialDisplayRenderIsNotSaved() {
        let reporter = RNSentryOnDrawReporterView.createWithMockedListener()
        reporter!.initialDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["initialDisplay", "parentSpanId"])
        RNSentryTimeToDisplay.pop(for: ttidPrefix + spanId)

        reporter!.initialDisplay = false
        reporter!.didSetProps(["initalDisplay"])
        reporter!.initialDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["initialDisplay", "parentSpanId"])

        XCTAssertNil(RNSentryTimeToDisplay.pop(for: ttidPrefix + spanId))
    }

    func testWhenDisplayFlagDoesntChangeTheNextFullDisplayRenderIsNotSaved() {
        let reporter = RNSentryOnDrawReporterView.createWithMockedListener()
        reporter!.fullDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["fullDisplay", "parentSpanId"])
        RNSentryTimeToDisplay.pop(for: ttfdPrefix + spanId)

        reporter!.fullDisplay = true
        reporter!.didSetProps(["fullDisplay", "parentSpanId"])

        XCTAssertNil(RNSentryTimeToDisplay.pop(for: ttfdPrefix + spanId))
    }

    func testWhenDisplayFlagDoesntChangeTheNextInitialDisplayRenderIsNotSaved() {
        let reporter = RNSentryOnDrawReporterView.createWithMockedListener()
        reporter!.initialDisplay = true
        reporter!.parentSpanId = spanId
        reporter!.didSetProps(["initialDisplay", "parentSpanId"])
        RNSentryTimeToDisplay.pop(for: ttidPrefix + spanId)

        reporter!.initialDisplay = true
        reporter!.didSetProps(["initialDisplay", "parentSpanId"])

        XCTAssertNil(RNSentryTimeToDisplay.pop(for: ttidPrefix + spanId))
    }
}

#import <XCTest/XCTest.h>
@import RNSentry.Swift;

/**
 * Coverage for the Session Replay runtime controls bridged through
 * `RNSentryInternal` (`startReplay`, `startReplayBuffering`, `stopReplay`,
 * `pauseReplay`, `resumeReplay`, `flushReplay`).
 *
 * These forward to `SentrySDK.internal.replay.*`. Without a started SDK there is
 * no active replay, so every control must be a safe no-op that does not crash,
 * and `replayId` must stay nil. That mirrors the "call uninitialized, assert a
 * safe default" convention used by the other `RNSentryInternal` tests.
 */
@interface RNSentryReplayControlTests : XCTestCase

@end

@implementation RNSentryReplayControlTests

- (void)testStartReplayDoesNotCrashWhenNotRunning
{
    [RNSentryInternal startReplay];
    XCTAssertNil(RNSentryInternal.replayId);
}

- (void)testStartReplayBufferingDoesNotCrashWhenNotRunning
{
    [RNSentryInternal startReplayBuffering];
    XCTAssertNil(RNSentryInternal.replayId);
}

- (void)testStopReplayDoesNotCrashWhenNotRunning
{
    [RNSentryInternal stopReplay];
    XCTAssertNil(RNSentryInternal.replayId);
}

- (void)testPauseReplayDoesNotCrashWhenNotRunning
{
    [RNSentryInternal pauseReplay];
    XCTAssertNil(RNSentryInternal.replayId);
}

- (void)testResumeReplayDoesNotCrashWhenNotRunning
{
    [RNSentryInternal resumeReplay];
    XCTAssertNil(RNSentryInternal.replayId);
}

- (void)testFlushReplayDoesNotCrashWhenNotRunning
{
    [RNSentryInternal flushReplay];
    XCTAssertNil(RNSentryInternal.replayId);
}

@end

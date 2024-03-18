#import "RNSentryFramesTrackerListenerTests.h"
#import <OCMock/OCMock.h>
#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>
#import "RNSentryDependencyContainer.h"

@interface RNSentryFramesTrackerListenerTests : XCTestCase

@end

@implementation RNSentryFramesTrackerListenerTests

- (void)testRNSentryFramesTrackerCallsGivenEventEmitterOnNewFrame
{
  id sentryDependencyContainerMock = OCMClassMock([SentryDependencyContainer class]);
  OCMStub(ClassMethod([sentryDependencyContainerMock sharedInstance])).andReturn(sentryDependencyContainerMock);

  id frameTrackerMock = OCMClassMock([SentryFramesTracker class]);
  OCMStub([(SentryDependencyContainer*) sentryDependencyContainerMock framesTracker]).andReturn(frameTrackerMock);

  XCTestExpectation *blockExpectation = [self expectationWithDescription:@"Block Expectation"];

  RNSentryEmitNewFrameEvent mockEventEmitter = ^(NSNumber *newFrameTimestampInSeconds) {
    XCTAssertTrue([newFrameTimestampInSeconds isKindOfClass:[NSNumber class]], @"The variable should be of type NSNumber.");
    [blockExpectation fulfill];
  };

  RNSentryFramesTrackerListener* actualListener = [[RNSentryFramesTrackerListener alloc] initWithSentryFramesTracker:[[SentryDependencyContainer sharedInstance] framesTracker]
                                                                                                     andEventEmitter: mockEventEmitter];

  [actualListener framesTrackerHasNewFrame: [NSDate date]];
  [self waitForExpectationsWithTimeout:1.0 handler:nil];
}

- (void)testRNSentryFramesTrackerIsOneTimeListener
{
  id sentryDependencyContainerMock = OCMClassMock([SentryDependencyContainer class]);
  OCMStub(ClassMethod([sentryDependencyContainerMock sharedInstance])).andReturn(sentryDependencyContainerMock);

  id frameTrackerMock = OCMClassMock([SentryFramesTracker class]);
  OCMStub([(SentryDependencyContainer*) sentryDependencyContainerMock framesTracker]).andReturn(frameTrackerMock);

  RNSentryEmitNewFrameEvent mockEventEmitter = ^(NSNumber *newFrameTimestampInSeconds) {};

  RNSentryFramesTrackerListener* actualListener = [[RNSentryFramesTrackerListener alloc] initWithSentryFramesTracker:[[SentryDependencyContainer sharedInstance] framesTracker]
                                                                                                     andEventEmitter: mockEventEmitter];

  [actualListener framesTrackerHasNewFrame: [NSDate date]];
  OCMVerify([frameTrackerMock removeListener:actualListener]);
}

- (void)testRNSentryFramesTrackerAddsItselfAsListener
{
  id sentryDependencyContainerMock = OCMClassMock([SentryDependencyContainer class]);
  OCMStub(ClassMethod([sentryDependencyContainerMock sharedInstance])).andReturn(sentryDependencyContainerMock);

  id frameTrackerMock = OCMClassMock([SentryFramesTracker class]);
  OCMStub([(SentryDependencyContainer*) sentryDependencyContainerMock framesTracker]).andReturn(frameTrackerMock);

  RNSentryEmitNewFrameEvent mockEventEmitter = ^(NSNumber *newFrameTimestampInSeconds) {};

  RNSentryFramesTrackerListener* actualListener = [[RNSentryFramesTrackerListener alloc] initWithSentryFramesTracker:[[SentryDependencyContainer sharedInstance] framesTracker]
                                                                                                     andEventEmitter: mockEventEmitter];

  [actualListener startListening];
  OCMVerify([frameTrackerMock addListener:actualListener]);
}

@end

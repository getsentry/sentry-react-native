#import "RNSentryDependencyContainerTests.h"
#import <OCMock/OCMock.h>
#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>
#import "RNSentryDependencyContainer.h"

@interface RNSentryDependencyContainerTests : XCTestCase

@end

@implementation RNSentryDependencyContainerTests

- (void)testRNSentryDependencyContainerInitializesFrameTracker
{
  XCTAssertNil([[RNSentryDependencyContainer sharedInstance] framesTrackerListener]);

  id sentryDependencyContainerMock = OCMClassMock([SentryDependencyContainer class]);
  OCMStub(ClassMethod([sentryDependencyContainerMock sharedInstance])).andReturn(sentryDependencyContainerMock);

  id frameTrackerMock = OCMClassMock([SentryFramesTracker class]);
  OCMStub([(SentryDependencyContainer*) sentryDependencyContainerMock framesTracker]).andReturn(frameTrackerMock);

  RNSentryEmitNewFrameEvent emitNewFrameEvent = ^(NSNumber *newFrameTimestampInSeconds) {};
  [[RNSentryDependencyContainer sharedInstance] initializeFramesTrackerListenerWith: emitNewFrameEvent];
  XCTAssertNotNil([[RNSentryDependencyContainer sharedInstance] framesTrackerListener]);
}

@end

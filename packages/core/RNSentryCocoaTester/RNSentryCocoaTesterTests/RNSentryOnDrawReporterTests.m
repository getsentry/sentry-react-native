#import <XCTest/XCTest.h>
#import "RNSentryOnDrawReporter.h"

@interface RNSentryOnDrawReporterTests : XCTestCase

@end

@implementation RNSentryOnDrawReporterTests

- (void)testRNSentryOnDrawReporterViewIsAvailableWhenUIKitIs
{
  RNSentryOnDrawReporterView* view = [[RNSentryOnDrawReporterView alloc] init];
  XCTAssertNotNil(view);
}

@end

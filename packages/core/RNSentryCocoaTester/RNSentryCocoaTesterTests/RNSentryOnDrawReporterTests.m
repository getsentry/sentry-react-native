#import "RNSentryOnDrawReporter.h"
#import <XCTest/XCTest.h>

@interface RNSentryOnDrawReporterTests : XCTestCase

@end

@implementation RNSentryOnDrawReporterTests

- (void)testRNSentryOnDrawReporterViewIsAvailableWhenUIKitIs
{
    RNSentryOnDrawReporterView *view = [[RNSentryOnDrawReporterView alloc] init];
    XCTAssertNotNil(view);
}

@end

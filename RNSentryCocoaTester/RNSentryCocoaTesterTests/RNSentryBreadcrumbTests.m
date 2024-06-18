#import <XCTest/XCTest.h>
#import "RNSentryBreadcrumb.h"
@import Sentry;

@interface RNSentryBreadcrumbTests : XCTestCase

@end

@implementation RNSentryBreadcrumbTests

- (void)testGeneratesSentryBreadcrumbFromNSDictionary
{
  SentryBreadcrumb* actualCrumb = [RNSentryBreadcrumb from:@{
    @"level": @"error",
    @"category": @"testCategory",
    @"type": @"testType",
    @"message": @"testMessage",
    @"data": @{
      @"test": @"data"
    }
  }];

  XCTAssertEqual(actualCrumb.level, kSentryLevelError);
  XCTAssertEqual(actualCrumb.category, @"testCategory");
  XCTAssertEqual(actualCrumb.type, @"testType");
  XCTAssertEqual(actualCrumb.message, @"testMessage");
  XCTAssertTrue([actualCrumb.data isKindOfClass:[NSDictionary class]]);
  XCTAssertEqual(actualCrumb.data[@"test"], @"data");
}

- (void)testUsesInfoAsDefaultSentryLevel
{
  SentryBreadcrumb* actualCrumb = [RNSentryBreadcrumb from:@{
    @"message": @"testMessage",
  }];

  XCTAssertEqual(actualCrumb.level, kSentryLevelInfo);
}

@end

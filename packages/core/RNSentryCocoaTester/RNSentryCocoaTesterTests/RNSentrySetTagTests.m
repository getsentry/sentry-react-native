#import "RNSentry+Test.h"
#import <Sentry/Sentry.h>
#import <XCTest/XCTest.h>

@interface RNSentrySetTagTests : XCTestCase
@end

@implementation RNSentrySetTagTests

- (NSDictionary *)tagsOf:(SentryScope *)scope
{
    return [scope serialize][@"tags"];
}

- (void)testSetsNonEmptyTagValue
{
    SentryScope *scope = [[SentryScope alloc] init];

    [RNSentry setTagOnScope:scope key:@"turbo_module.name" value:@"RNSentry"];

    XCTAssertEqualObjects([self tagsOf:scope][@"turbo_module.name"], @"RNSentry");
}

- (void)testEmptyValueRemovesExistingTag
{
    SentryScope *scope = [[SentryScope alloc] init];
    [RNSentry setTagOnScope:scope key:@"turbo_module.name" value:@"RNSentry"];

    [RNSentry setTagOnScope:scope key:@"turbo_module.name" value:@""];

    XCTAssertNil([self tagsOf:scope][@"turbo_module.name"]);
}

- (void)testNilValueRemovesExistingTag
{
    SentryScope *scope = [[SentryScope alloc] init];
    [RNSentry setTagOnScope:scope key:@"turbo_module.method" value:@"getPlatform"];

    [RNSentry setTagOnScope:scope key:@"turbo_module.method" value:nil];

    XCTAssertNil([self tagsOf:scope][@"turbo_module.method"]);
}

- (void)testEmptyValueDoesNotAddTag
{
    SentryScope *scope = [[SentryScope alloc] init];

    [RNSentry setTagOnScope:scope key:@"turbo_module.name" value:@""];

    XCTAssertNil([self tagsOf:scope][@"turbo_module.name"]);
}

@end

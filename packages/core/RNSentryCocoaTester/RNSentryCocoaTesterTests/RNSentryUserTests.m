#import "RNSentry+Test.h"
#import "RNSentryTests.h"
#import <XCTest/XCTest.h>

@interface RNSentryUserTests : XCTestCase
@end

@implementation RNSentryUserTests

- (void)testValidUser
{
    SentryUser *expected = [[SentryUser alloc] init];
    [expected setUserId:@"123"];
    [expected setIpAddress:@"192.168.1.1"];
    [expected setEmail:@"test@example.com"];
    [expected setUsername:@"testuser"];
    [expected setSegment:@"testsegment"];
    [expected setData:@{
        @"foo" : @"bar",
        @"baz" : @123,
        @"qux" : @[ @"a", @"b", @"c" ],
    }];

    SentryUser *actual = [RNSentry userFrom:@{
        @"id" : @"123",
        @"ip_address" : @"192.168.1.1",
        @"email" : @"test@example.com",
        @"username" : @"testuser",
        @"segment" : @"testsegment",
    }
                              otherUserKeys:@{
                                  @"foo" : @"bar",
                                  @"baz" : @123,
                                  @"qux" : @[ @"a", @"b", @"c" ],
                              }];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

- (void)testNilUser
{
    SentryUser *actual = [RNSentry userFrom:nil otherUserKeys:nil];
    XCTAssertNil(actual);
}

- (void)testNullUser
{
    SentryUser *actual = [RNSentry userFrom:(NSDictionary *)[NSNull null] otherUserKeys:nil];
    XCTAssertNil(actual);
}

- (void)testEmptyUser
{
    SentryUser *expected = [[SentryUser alloc] init];
    [expected setData:@{}];

    SentryUser *actual = [RNSentry userFrom:@{} otherUserKeys:@{}];
    XCTAssertTrue([actual isEqualToUser:expected]);
}

- (void)testInvalidUser
{
    SentryUser *expected = [[SentryUser alloc] init];

    SentryUser *actual = [RNSentry userFrom:@{
        @"id" : @123,
        @"ip_address" : @ {},
        @"email" : @ {},
        @"username" : @ {},
        @"segment" : @[],
    }
                              otherUserKeys:nil];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

- (void)testPartiallyInvalidUser
{
    SentryUser *expected = [[SentryUser alloc] init];
    [expected setUserId:@"123"];

    SentryUser *actual = [RNSentry userFrom:@{
        @"id" : @"123",
        @"ip_address" : @ {},
        @"email" : @ {},
        @"username" : @ {},
        @"segment" : @[],
    }
                              otherUserKeys:nil];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

- (void)testNullValuesUser
{
    SentryUser *expected = [[SentryUser alloc] init];

    SentryUser *actual = [RNSentry userFrom:@{
        @"id" : [NSNull null],
        @"ip_address" : [NSNull null],
        @"email" : [NSNull null],
        @"username" : [NSNull null],
        @"segment" : [NSNull null],
    }
                              otherUserKeys:nil];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

@end

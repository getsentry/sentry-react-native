#import "RNSentry+Test.h"
#import "RNSentryTests.h"
#import <Sentry/SentryGeo.h>
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
    }
                              otherUserKeys:nil];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

- (void)testUserWithGeo
{
    SentryUser *expected = [SentryUser alloc];
    [expected setUserId:@"123"];
    [expected setEmail:@"test@example.com"];
    [expected setUsername:@"testuser"];

    SentryGeo *expectedGeo = [SentryGeo alloc];
    [expectedGeo setCity:@"San Francisco"];
    [expectedGeo setCountryCode:@"US"];
    [expectedGeo setRegion:@"California"];
    [expected setGeo:expectedGeo];

    SentryUser *actual = [RNSentry userFrom:@{
        @"id" : @"123",
        @"email" : @"test@example.com",
        @"username" : @"testuser",
        @"geo" :
            @ { @"city" : @"San Francisco", @"country_code" : @"US", @"region" : @"California" }
    }
                              otherUserKeys:nil];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

- (void)testUserWithPartialGeo
{
    SentryUser *expected = [SentryUser alloc];
    [expected setUserId:@"123"];

    SentryGeo *expectedGeo = [SentryGeo alloc];
    [expectedGeo setCity:@"New York"];
    [expectedGeo setCountryCode:@"US"];
    [expected setGeo:expectedGeo];

    SentryUser *actual = [RNSentry userFrom:@{
        @"id" : @"123",
        @"geo" : @ { @"city" : @"New York", @"country_code" : @"US" }
    }
                              otherUserKeys:nil];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

- (void)testUserWithEmptyGeo
{
    SentryUser *expected = [[SentryUser alloc] init];
    [expected setUserId:@"123"];

    // Empty geo dictionary creates an empty SentryGeo object
    SentryGeo *expectedGeo = [[SentryGeo alloc] init];
    [expected setGeo:expectedGeo];

    SentryUser *actual = [RNSentry userFrom:@{ @"id" : @"123", @"geo" : @ {} } otherUserKeys:nil];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

- (void)testUserWithInvalidGeo
{
    SentryUser *expected = [[SentryUser alloc] init];
    [expected setUserId:@"123"];

    SentryUser *actual = [RNSentry userFrom:@{ @"id" : @"123", @"geo" : @"invalid_geo_data" }
                              otherUserKeys:nil];

    XCTAssertTrue([actual isEqualToUser:expected]);
}

@end

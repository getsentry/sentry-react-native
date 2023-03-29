#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>
#import <Sentry/SentryOptions.h>
#import "RNSentry.h"

@interface RNSentryInitNativeSdkTests : XCTestCase

@end

@implementation RNSentryInitNativeSdkTests

- (void)testCreateOptionsWithDictionaryRemovesPerformanceProperties
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
        @"beforeSend": @"will_be_overwritten",
        @"enableNativeCrashHandling": @YES,

    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertNotNil(actualOptions.beforeSend, @"Before send is overwriten by the native RNSentry implementation");
    XCTAssertEqual(actualOptions.tracesSampleRate, nil, @"Traces sample rate should not be passed to native");
    XCTAssertEqual(actualOptions.tracesSampler, nil, @"Traces sampler should not be passed to native");
}

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingAndPerformanceTrackingDefault
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
        @"beforeSend": @"will_be_overwritten",

    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual([actualOptions.integrations containsObject:@"SentryCrashIntegration"], true, @"Did not set native crash handling");
    XCTAssertEqual(actualOptions.enableAutoPerformanceTracing, true, @"Did not set Auto Performance Tracing");
}

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingAndPerformanceTrackingEnabled
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
        @"beforeSend": @"will_be_overwritten",
        @"enableNativeCrashHandling": @YES,
        @"enableAutoPerformanceTracing": @YES,

    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual([actualOptions.integrations containsObject:@"SentryCrashIntegration"], true, @"Did not set native crash handling");
    XCTAssertEqual(actualOptions.enableAutoPerformanceTracing, true, @"Did not set Auto Performance Tracing");
}

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingAndPerformanceTrackingDisabled
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
        @"beforeSend": @"will_be_overwritten",
        @"enableNativeCrashHandling": @NO,
        @"enableAutoPerformanceTracing": @NO,

    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual([actualOptions.integrations containsObject:@"SentryCrashIntegration"], false, @"Did not disable native crash handling");
    XCTAssertEqual(actualOptions.enableAutoPerformanceTracing, false, @"Did not disable Auto Performance Tracing");
}

- (void)testPassesErrorOnWrongDsn
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"not_a_valid_dsn"
    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];

    XCTAssertNil(actualOptions, @"Created invalid sentry options");
    XCTAssertNotNil(error, @"Did not created error on invalid dsn");
}

@end

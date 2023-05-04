#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>
#import <Sentry/SentryOptions.h>
#import <Sentry/SentryEvent.h>
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

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingDefault
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual([actualOptions.integrations containsObject:@"SentryCrashIntegration"], true, @"Did not set native crash handling");
}

- (void)testCreateOptionsWithDictionaryPerformanceTrackingDefault
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual(actualOptions.enableAutoPerformanceTracing, true, @"Did not set Auto Performance Tracing");
}

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingEnabled
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableNativeCrashHandling": @YES,
    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual([actualOptions.integrations containsObject:@"SentryCrashIntegration"], true, @"Did not set native crash handling");
}

- (void)testCreateOptionsWithDictionaryPerformanceTrackingEnabled
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableAutoPerformanceTracing": @YES,

    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual(actualOptions.enableAutoPerformanceTracing, true, @"Did not set Auto Performance Tracing");
}

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingDisabled
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableNativeCrashHandling": @NO,

    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual([actualOptions.integrations containsObject:@"SentryCrashIntegration"], false, @"Did not disable native crash handling");
}

- (void)testCreateOptionsWithDictionaryPerformanceTrackingDisabled
{
    RNSentry * rnSentry = [[RNSentry alloc] init];
    NSError* error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn": @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableAutoPerformanceTracing": @NO,

    };
    SentryOptions* actualOptions = [rnSentry createOptionsWithDictionary:mockedReactNativeDictionary error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
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

- (void)testEventFromSentryCocoaReactNativeHasOriginAndEnvironmentTags
{
  RNSentry* rnSentry = [[RNSentry alloc] init];
  SentryEvent* testEvent = [[SentryEvent alloc] init];
  testEvent.sdk = @{
    @"name": @"sentry.cocoa.react-native"
  };

  [rnSentry setEventOriginTag: testEvent];
  
  XCTAssertEqual(testEvent.tags[@"event.origin"], @"ios");
  XCTAssertEqual(testEvent.tags[@"event.environment"], @"native");
}

- (void)testEventFromSentryReactNativeOriginAndEnvironmentTagsAreOverwritten
{
  RNSentry* rnSentry = [[RNSentry alloc] init];
  SentryEvent* testEvent = [[SentryEvent alloc] init];
  testEvent.sdk = @{
    @"name": @"sentry.cocoa.react-native"
  };
  testEvent.tags = @{
    @"event.origin": @"testEventOriginTag",
    @"event.environment": @"testEventEnvironmentTag"
  };
  
  [rnSentry setEventOriginTag: testEvent];
  
  XCTAssertEqual(testEvent.tags[@"event.origin"], @"ios");
  XCTAssertEqual(testEvent.tags[@"event.environment"], @"native");
}

@end

#import "RNSentryTests.h"
#import "RNSentryReplay.h"
#import "SentrySDKWrapper.h"
#import <OCMock/OCMock.h>
#import <RNSentry/RNSentry.h>
#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>
@import Sentry;

@interface RNSentryInitNativeSdkTests : XCTestCase

@end

@implementation RNSentryInitNativeSdkTests

- (void)testCreateOptionsWithDictionaryRemovesPerformanceProperties
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary =
        @{ @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
            @"beforeSend" : @"will_be_overwritten",
            @"tracesSampleRate" : @1,
            @"tracesSampler" : ^(SentrySamplingContext *_Nonnull samplingContext) { return @1;
}
, @"enableTracing" : @YES,
}
;
mockedReactNativeDictionary = [rnSentry prepareOptions:mockedReactNativeDictionary];
SentryOptions *actualOptions =
    [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                           isSessionReplayEnabled:NO
                                            error:&error];

XCTAssertNotNil(actualOptions, @"Did not create sentry options");
XCTAssertNil(error, @"Should not pass no error");
XCTAssertNotNil(
    actualOptions.beforeSend, @"Before send is overwriten by the native RNSentry implementation");
XCTAssertEqual(
    actualOptions.tracesSampleRate, nil, @"Traces sample rate should not be passed to native");
XCTAssertEqual(actualOptions.tracesSampler, nil, @"Traces sampler should not be passed to native");
}

- (void)testCaptureFailedRequestsIsDisabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertFalse(actualOptions.enableCaptureFailedRequests);
}

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingDefault
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertTrue(actualOptions.enableCrashHandler, @"Did not set native crash handling");
}

- (void)testCreateOptionsWithDictionaryAutoPerformanceTracingDefault
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual(
        actualOptions.enableAutoPerformanceTracing, true, @"Did not set Auto Performance Tracing");
}

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingEnabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableNativeCrashHandling" : @YES,
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertTrue(actualOptions.enableCrashHandler, @"Did not set native crash handling");
}

- (void)testCreateOptionsWithDictionaryAutoPerformanceTracingEnabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableAutoPerformanceTracing" : @YES,
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual(
        actualOptions.enableAutoPerformanceTracing, true, @"Did not set Auto Performance Tracing");
}

- (void)testCreateOptionsWithDictionaryNativeCrashHandlingDisabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableNativeCrashHandling" : @NO,
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertFalse(actualOptions.enableCrashHandler, @"Did not disable native crash handling");
}

- (void)testCreateOptionsWithDictionaryAutoPerformanceTracingDisabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableAutoPerformanceTracing" : @NO,
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertEqual(actualOptions.enableAutoPerformanceTracing, false,
        @"Did not disable Auto Performance Tracing");
}

- (void)testCreateOptionsWithDictionarySpotlightEnabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"spotlight" : @YES,
        @"defaultSidecarUrl" : @"http://localhost:8969/teststream",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertTrue(actualOptions.enableSpotlight, @"Did not enable spotlight");
    XCTAssertEqual(actualOptions.spotlightUrl, @"http://localhost:8969/teststream");
}

- (void)testCreateOptionsWithDictionarySpotlightOne
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"spotlight" : @1,
        @"defaultSidecarUrl" : @"http://localhost:8969/teststream",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertTrue(actualOptions.enableSpotlight, @"Did not enable spotlight");
    XCTAssertEqual(actualOptions.spotlightUrl, @"http://localhost:8969/teststream");
}

- (void)testCreateOptionsWithDictionarySpotlightUrl
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"spotlight" : @"http://localhost:8969/teststream",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertTrue(actualOptions.enableSpotlight, @"Did not enable spotlight");
    XCTAssertEqual(actualOptions.spotlightUrl, @"http://localhost:8969/teststream");
}

- (void)testCreateOptionsWithDictionarySpotlightDisabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"spotlight" : @NO,
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertFalse(actualOptions.enableSpotlight, @"Did not disable spotlight");
}

- (void)testCreateOptionsWithDictionarySpotlightZero
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"spotlight" : @0,
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");
    XCTAssertFalse(actualOptions.enableSpotlight, @"Did not disable spotlight");
}

- (void)testCreateOptionsWithDictionaryEnableUnhandledCPPExceptionsV2Enabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"_experiments" : @ {
            @"enableUnhandledCPPExceptionsV2" : @YES,
        },
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    id experimentalOptions = [actualOptions valueForKey:@"experimental"];
    XCTAssertNotNil(experimentalOptions, @"Experimental options should not be nil");

    BOOL enableUnhandledCPPExceptions =
        [[experimentalOptions valueForKey:@"enableUnhandledCPPExceptionsV2"] boolValue];
    XCTAssertTrue(
        enableUnhandledCPPExceptions, @"enableUnhandledCPPExceptionsV2 should be enabled");
}

- (void)testCreateOptionsWithDictionaryEnableUnhandledCPPExceptionsV2Disabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"_experiments" : @ {
            @"enableUnhandledCPPExceptionsV2" : @NO,
        },
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    id experimentalOptions = [actualOptions valueForKey:@"experimental"];
    XCTAssertNotNil(experimentalOptions, @"Experimental options should not be nil");

    BOOL enableUnhandledCPPExceptions =
        [[experimentalOptions valueForKey:@"enableUnhandledCPPExceptionsV2"] boolValue];
    XCTAssertFalse(
        enableUnhandledCPPExceptions, @"enableUnhandledCPPExceptionsV2 should be disabled");
}

- (void)testCreateOptionsWithDictionaryEnableUnhandledCPPExceptionsV2Default
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    // Test that when no _experiments are provided, the experimental option defaults to false
    id experimentalOptions = [actualOptions valueForKey:@"experimental"];
    XCTAssertNotNil(experimentalOptions, @"Experimental options should not be nil");

    BOOL enableUnhandledCPPExceptions =
        [[experimentalOptions valueForKey:@"enableUnhandledCPPExceptionsV2"] boolValue];
    XCTAssertFalse(
        enableUnhandledCPPExceptions, @"enableUnhandledCPPExceptionsV2 should default to disabled");
}

- (void)testCreateOptionsWithDictionaryEnableLogsEnabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableLogs" : @YES,
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    BOOL enableLogs = [[actualOptions valueForKey:@"enableLogs"] boolValue];
    XCTAssertTrue(enableLogs, @"enableLogs should be enabled");
}

- (void)testCreateOptionsWithDictionaryEnableLogsDisabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"enableLogs" : @NO,
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    BOOL enableLogs = [[actualOptions valueForKey:@"enableLogs"] boolValue];
    XCTAssertFalse(enableLogs, @"enableLogs should be disabled");
}

- (void)testPassesErrorOnWrongDsn
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"not_a_valid_dsn",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNil(actualOptions, @"Created invalid sentry options");
    XCTAssertNotNil(error, @"Did not created error on invalid dsn");
}

- (void)testBeforeBreadcrumbsCallbackFiltersOutSentryDsnRequestBreadcrumbs
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSError *error = nil;

    NSDictionary *_Nonnull mockedDictionary = @{
        @"dsn" : @"https://abc@def.ingest.sentry.io/1234567",
        @"devServerUrl" : @"http://localhost:8081"
    };
    mockedDictionary = [rnSentry prepareOptions:mockedDictionary];
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedDictionary
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    SentryBreadcrumb *breadcrumb = [[SentryBreadcrumb alloc] init];
    breadcrumb.type = @"http";
    breadcrumb.data = @{ @"url" : @"https://def.ingest.sentry.io/1234567" };

    SentryBreadcrumb *result = options.beforeBreadcrumb(breadcrumb);

    XCTAssertNil(result, @"Breadcrumb should be filtered out");
}

- (void)testBeforeBreadcrumbsCallbackFiltersOutDevServerRequestBreadcrumbs
{
    NSError *error = nil;

    NSString *mockDevServer = @"http://localhost:8081";

    NSDictionary *_Nonnull mockedDictionary =
        @{ @"dsn" : @"https://abc@def.ingest.sentry.io/1234567", @"devServerUrl" : mockDevServer };
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedDictionary
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    SentryBreadcrumb *breadcrumb = [[SentryBreadcrumb alloc] init];
    breadcrumb.type = @"http";
    breadcrumb.data = @{ @"url" : mockDevServer };

    SentryBreadcrumb *result = options.beforeBreadcrumb(breadcrumb);

    XCTAssertNil(result, @"Breadcrumb should be filtered out");
}

- (void)testBeforeBreadcrumbsCallbackDoesNotFiltersOutNonDevServerOrDsnRequestBreadcrumbs
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedDictionary = @{
        @"dsn" : @"https://abc@def.ingest.sentry.io/1234567",
        @"devServerUrl" : @"http://localhost:8081"
    };
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedDictionary
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    SentryBreadcrumb *breadcrumb = [[SentryBreadcrumb alloc] init];
    breadcrumb.type = @"http";
    breadcrumb.data = @{ @"url" : @"http://testurl.com/service" };

    SentryBreadcrumb *result = options.beforeBreadcrumb(breadcrumb);

    XCTAssertEqual(breadcrumb, result);
}

- (void)testBeforeBreadcrumbsCallbackKeepsBreadcrumbWhenDevServerUrlIsNotPassedAndDsnDoesNotMatch
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedDictionary = @{ // dsn is always validated in SentryOptions initialization
        @"dsn" : @"https://abc@def.ingest.sentry.io/1234567"
    };
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedDictionary
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    SentryBreadcrumb *breadcrumb = [[SentryBreadcrumb alloc] init];
    breadcrumb.type = @"http";
    breadcrumb.data = @{ @"url" : @"http://testurl.com/service" };

    SentryBreadcrumb *result = options.beforeBreadcrumb(breadcrumb);

    XCTAssertEqual(breadcrumb, result);
}

- (void)testEventFromSentryCocoaReactNativeHasOriginAndEnvironmentTags
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    SentryEvent *testEvent = [[SentryEvent alloc] init];
    testEvent.sdk = @{
        @"name" : @"sentry.cocoa.react-native",
    };

    [rnSentry setEventOriginTag:testEvent];

    XCTAssertEqual(testEvent.tags[@"event.origin"], @"ios");
    XCTAssertEqual(testEvent.tags[@"event.environment"], @"native");
}

- (void)testEventFromSentryReactNativeOriginAndEnvironmentTagsAreOverwritten
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    SentryEvent *testEvent = [[SentryEvent alloc] init];
    testEvent.sdk = @{
        @"name" : @"sentry.cocoa.react-native",
    };
    testEvent.tags = @{
        @"event.origin" : @"testEventOriginTag",
        @"event.environment" : @"testEventEnvironmentTag",
    };

    [rnSentry setEventOriginTag:testEvent];

    XCTAssertEqual(testEvent.tags[@"event.origin"], @"ios");
    XCTAssertEqual(testEvent.tags[@"event.environment"], @"native");
}

void (^expectRejecterNotCalled)(NSString *, NSString *, NSError *)
    = ^(NSString *code, NSString *message, NSError *error) {
          @throw [NSException exceptionWithName:@"Promise Rejector should not be called."
                                         reason:nil
                                       userInfo:nil];
      };

uint64_t MOCKED_SYMBOL_ADDRESS = 123;
char const *MOCKED_SYMBOL_NAME = "symbolicatedname";

int
sucessfulSymbolicate(const void *, Dl_info *info)
{
    info->dli_saddr = (void *)MOCKED_SYMBOL_ADDRESS;
    info->dli_sname = MOCKED_SYMBOL_NAME;
    return 1;
}

- (void)prepareNativeFrameMocksWithLocalSymbolication:(BOOL)debug
{
    SentryOptions *sentryOptions = [[SentryOptions alloc] init];
    sentryOptions.debug = debug; // no local symbolication

    id sentrySDKMock = OCMClassMock([SentrySDKInternal class]);
    OCMStub([(Class)sentrySDKMock options]).andReturn(sentryOptions);

    id sentryDependencyContainerMock = OCMClassMock([SentryDependencyContainer class]);
    OCMStub(ClassMethod([sentryDependencyContainerMock sharedInstance]))
        .andReturn(sentryDependencyContainerMock);

    id sentryBinaryImageInfoMockOne = OCMClassMock([SentryBinaryImageInfo class]);
    OCMStub([(SentryBinaryImageInfo *)sentryBinaryImageInfoMockOne address])
        .andReturn([@112233 unsignedLongLongValue]);
    OCMStub([sentryBinaryImageInfoMockOne name]).andReturn(@"testnameone");

    id sentryBinaryImageInfoMockTwo = OCMClassMock([SentryBinaryImageInfo class]);
    OCMStub([(SentryBinaryImageInfo *)sentryBinaryImageInfoMockTwo address])
        .andReturn([@112233 unsignedLongLongValue]);
    OCMStub([sentryBinaryImageInfoMockTwo name]).andReturn(@"testnametwo");

    id sentryBinaryImageCacheMock = OCMClassMock([SentryBinaryImageCache class]);
    OCMStub([(SentryDependencyContainer *)sentryDependencyContainerMock binaryImageCache])
        .andReturn(sentryBinaryImageCacheMock);
    OCMStub([sentryBinaryImageCacheMock imageByAddress:[@123 unsignedLongLongValue]])
        .andReturn(sentryBinaryImageInfoMockOne);
    OCMStub([sentryBinaryImageCacheMock imageByAddress:[@456 unsignedLongLongValue]])
        .andReturn(sentryBinaryImageInfoMockTwo);

    NSDictionary *serializedDebugImage = @{
        @"uuid" : @"mockuuid",
        @"debug_id" : @"mockdebugid",
        @"type" : @"macho",
        @"image_addr" : @"0x000000000001b669",
    };
    id sentryDebugImageMock = OCMClassMock([SentryDebugMeta class]);
    OCMStub([sentryDebugImageMock serialize]).andReturn(serializedDebugImage);

    id sentryDebugImageProviderMock = OCMClassMock([SentryDebugImageProvider class]);
    OCMStub(
        [sentryDebugImageProviderMock
            getDebugImagesForImageAddressesFromCache:[NSSet setWithObject:@"0x000000000001b669"]])
        .andReturn(@[ sentryDebugImageMock ]);

    OCMStub([sentryDependencyContainerMock debugImageProvider])
        .andReturn(sentryDebugImageProviderMock);
}

- (void)testFetchNativeStackFramesByInstructionsServerSymbolication
{
    [self prepareNativeFrameMocksWithLocalSymbolication:NO];
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSDictionary *actual = [rnSentry fetchNativeStackFramesBy:@[ @123, @456 ]
                                                  symbolicate:sucessfulSymbolicate];

    NSDictionary *expected = @{
        @"debugMetaImages" : @[
            @{
                @"uuid" : @"mockuuid",
                @"debug_id" : @"mockdebugid",
                @"type" : @"macho",
                @"image_addr" : @"0x000000000001b669",
            },
        ],
        @"frames" : @[
            @{
                @"package" : @"testnameone",
                @"in_app" : @NO,
                @"platform" : @"cocoa",
                @"instruction_addr" : @"0x000000000000007b", // 123
                @"image_addr" : @"0x000000000001b669", // 112233
            },
            @{
                @"package" : @"testnametwo",
                @"in_app" : @NO,
                @"platform" : @"cocoa",
                @"instruction_addr" : @"0x00000000000001c8", // 456
                @"image_addr" : @"0x000000000001b669", // 445566
            },
        ],
    };
    XCTAssertTrue([actual isEqualToDictionary:expected]);
}

- (void)testFetchNativeStackFramesByInstructionsOnDeviceSymbolication
{
    [self prepareNativeFrameMocksWithLocalSymbolication:YES];
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSDictionary *actual = [rnSentry fetchNativeStackFramesBy:@[ @123, @456 ]
                                                  symbolicate:sucessfulSymbolicate];

    NSDictionary *expected = @{
        @"frames" : @[
            @{
                @"function" : @"symbolicatedname",
                @"package" : @"testnameone",
                @"in_app" : @NO,
                @"platform" : @"cocoa",
                @"symbol_addr" : @"0x000000000000007b", // 123
                @"instruction_addr" : @"0x000000000000007b", // 123
                @"image_addr" : @"0x000000000001b669", // 112233
            },
            @{
                @"function" : @"symbolicatedname",
                @"package" : @"testnametwo",
                @"in_app" : @NO,
                @"platform" : @"cocoa",
                @"symbol_addr" : @"0x000000000000007b", // 123
                @"instruction_addr" : @"0x00000000000001c8", // 456
                @"image_addr" : @"0x000000000001b669", // 445566
            },
        ],
    };
    XCTAssertTrue([actual isEqualToDictionary:expected]);
}

- (void)testIgnoreErrorsDropsMatchingExceptionValue
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSError *error = nil;
    NSMutableDictionary *mockedOptions = [@{
        @"dsn" : @"https://abc@def.ingest.sentry.io/1234567",
        @"ignoreErrorsRegex" : @[ @"IgnoreMe.*" ]
    } mutableCopy];
    mockedOptions = [rnSentry prepareOptions:mockedOptions];
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedOptions
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    XCTAssertNotNil(options);
    XCTAssertNil(error);
    SentryEvent *event = [[SentryEvent alloc] init];
    SentryException *exception = [SentryException alloc];
    exception.value = @"IgnoreMe: This should be ignored";
    event.exceptions = @[ exception ];
    SentryEvent *result = options.beforeSend(event);
    XCTAssertNil(result, @"Event with matching exception.value should be dropped");
}

- (void)testIgnoreErrorsDropsMatchingEventMessage
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSError *error = nil;
    NSMutableDictionary *mockedOptions = [@{
        @"dsn" : @"https://abc@def.ingest.sentry.io/1234567",
        @"ignoreErrorsStr" : @[ @"DropThisError" ]
    } mutableCopy];
    mockedOptions = [rnSentry prepareOptions:mockedOptions];
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedOptions
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    XCTAssertNotNil(options);
    XCTAssertNotNil(options);
    XCTAssertNil(error);
    SentryEvent *event = [[SentryEvent alloc] init];
    SentryMessage *msg = [SentryMessage alloc];
    msg.message = @"DropThisError: should be dropped";
    event.message = msg;
    SentryEvent *result = options.beforeSend(event);
    XCTAssertNil(result, @"Event with matching event.message.formatted should be dropped");
}

- (void)testIgnoreErrorsDoesNotDropNonMatchingEvent
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSError *error = nil;
    NSMutableDictionary *mockedOptions = [@{
        @"dsn" : @"https://abc@def.ingest.sentry.io/1234567",
        @"ignoreErrorsRegex" : @[ @"IgnoreMe.*" ]
    } mutableCopy];
    mockedOptions = [rnSentry prepareOptions:mockedOptions];
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedOptions
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    XCTAssertNotNil(options);
    XCTAssertNotNil(options);
    XCTAssertNil(error);
    SentryEvent *event = [[SentryEvent alloc] init];
    SentryException *exception = [SentryException alloc];
    exception.value = @"SomeOtherError: should not be ignored";
    event.exceptions = @[ exception ];
    SentryMessage *msg = [SentryMessage alloc];
    msg.message = @"SomeOtherMessage";
    event.message = msg;
    SentryEvent *result = options.beforeSend(event);
    XCTAssertNotNil(result, @"Event with non-matching error should not be dropped");
}

- (void)testIgnoreErrorsDropsMatchingExactString
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSError *error = nil;
    NSMutableDictionary *mockedOptions = [@{
        @"dsn" : @"https://abc@def.ingest.sentry.io/1234567",
        @"ignoreErrorsStr" : @[ @"ExactError" ]
    } mutableCopy];
    mockedOptions = [rnSentry prepareOptions:mockedOptions];
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedOptions
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    XCTAssertNotNil(options);
    XCTAssertNotNil(options);
    XCTAssertNil(error);
    SentryEvent *event = [[SentryEvent alloc] init];
    SentryMessage *msg = [SentryMessage alloc];
    msg.message = @"ExactError";
    event.message = msg;
    SentryEvent *result = options.beforeSend(event);
    XCTAssertNil(result, @"Event with exactly matching string should be dropped");
}

- (void)testIgnoreErrorsRegexAndStringBothWork
{
    RNSentry *rnSentry = [[RNSentry alloc] init];
    NSError *error = nil;
    NSMutableDictionary *mockedOptions = [@{
        @"dsn" : @"https://abc@def.ingest.sentry.io/1234567",
        @"ignoreErrorsStr" : @[ @"ExactError" ],
        @"ignoreErrorsRegex" : @[ @"IgnoreMe.*" ],

    } mutableCopy];
    mockedOptions = [rnSentry prepareOptions:mockedOptions];
    SentryOptions *options = [SentrySDKWrapper createOptionsWithDictionary:mockedOptions
                                                    isSessionReplayEnabled:NO
                                                                     error:&error];
    XCTAssertNotNil(options);
    XCTAssertNotNil(options);
    XCTAssertNil(error);
    // Test regex match
    SentryEvent *event1 = [[SentryEvent alloc] init];
    SentryException *exception = [SentryException alloc];
    exception.value = @"IgnoreMe: This should be ignored";
    event1.exceptions = @[ exception ];
    SentryEvent *result1 = options.beforeSend(event1);
    XCTAssertNil(result1, @"Event with matching regex should be dropped");
    // Test exact string match
    SentryEvent *event2 = [[SentryEvent alloc] init];
    SentryMessage *msg = [SentryMessage alloc];
    msg.message = @"ExactError";
    event2.message = msg;
    SentryEvent *result2 = options.beforeSend(event2);
    XCTAssertNil(result2, @"Event with exactly matching string should be dropped");
    // Test non-matching
    SentryEvent *event3 = [[SentryEvent alloc] init];
    SentryMessage *msg3 = [SentryMessage alloc];
    msg3.message = @"OtherError";
    event3.message = msg3;
    SentryEvent *result3 = options.beforeSend(event3);
    XCTAssertNotNil(result3, @"Event with non-matching error should not be dropped");
}

- (void)testCreateOptionsWithDictionaryEnableSessionReplayInUnreliableEnvironmentDefault
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    id experimentalOptions = [actualOptions valueForKey:@"experimental"];
    XCTAssertNotNil(experimentalOptions, @"Experimental options should not be nil");

    BOOL enableUnhandledCPPExceptions =
        [[experimentalOptions valueForKey:@"enableSessionReplayInUnreliableEnvironment"] boolValue];
    XCTAssertFalse(enableUnhandledCPPExceptions,
        @"enableSessionReplayInUnreliableEnvironment should be disabled");
}

- (void)testCreateOptionsWithDictionaryEnableSessionReplayInUnreliableEnvironmentWithErrorSampleRate
{
    NSError *error = nil;

    NSMutableDictionary *_Nonnull mockedReactNativeDictionary = [@{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"replaysOnErrorSampleRate" : @1.0,
        @"replaysSessionSampleRate" : @0
    } mutableCopy];
    BOOL enableReplay = [RNSentryReplay updateOptions:mockedReactNativeDictionary];
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:enableReplay
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    id experimentalOptions = [actualOptions valueForKey:@"experimental"];
    XCTAssertNotNil(experimentalOptions, @"Experimental options should not be nil");

    BOOL enableUnhandledCPPExceptions =
        [[experimentalOptions valueForKey:@"enableSessionReplayInUnreliableEnvironment"] boolValue];
    XCTAssertTrue(enableUnhandledCPPExceptions,
        @"enableSessionReplayInUnreliableEnvironment should be enabled");
}

- (void)
    testCreateOptionsWithDictionaryEnableSessionReplayInUnreliableEnvironmentWithSessionSampleRate
{
    NSError *error = nil;

    NSMutableDictionary *_Nonnull mockedReactNativeDictionary = [@{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"replaysOnErrorSampleRate" : @0.0,
        @"replaysSessionSampleRate" : @0.1
    } mutableCopy];
    BOOL enableReplay = [RNSentryReplay updateOptions:mockedReactNativeDictionary];
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:enableReplay
                                                error:&error];
    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    id experimentalOptions = [actualOptions valueForKey:@"experimental"];
    XCTAssertNotNil(experimentalOptions, @"Experimental options should not be nil");

    BOOL enableUnhandledCPPExceptions =
        [[experimentalOptions valueForKey:@"enableSessionReplayInUnreliableEnvironment"] boolValue];
    XCTAssertTrue(enableUnhandledCPPExceptions,
        @"enableSessionReplayInUnreliableEnvironment should be enabled");
}

- (void)
    testCreateOptionsWithDictionaryEnableSessionReplayInUnreliableEnvironmentWithSessionSampleRates
{
    NSError *error = nil;

    NSMutableDictionary *_Nonnull mockedReactNativeDictionary = [@{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"replaysOnErrorSampleRate" : @1.0,
        @"replaysSessionSampleRate" : @0.1
    } mutableCopy];
    BOOL enableReplay = [RNSentryReplay updateOptions:mockedReactNativeDictionary];
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:enableReplay
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    id experimentalOptions = [actualOptions valueForKey:@"experimental"];
    XCTAssertNotNil(experimentalOptions, @"Experimental options should not be nil");

    BOOL enableUnhandledCPPExceptions =
        [[experimentalOptions valueForKey:@"enableSessionReplayInUnreliableEnvironment"] boolValue];
    XCTAssertTrue(enableUnhandledCPPExceptions,
        @"enableSessionReplayInUnreliableEnvironment should be enabled");
}

- (void)testCreateOptionsWithDictionaryEnableSessionReplayInUnreliableEnvironmentDisabled
{
    NSError *error = nil;

    NSDictionary *_Nonnull mockedReactNativeDictionary = @{
        @"dsn" : @"https://abcd@efgh.ingest.sentry.io/123456",
        @"replaysOnErrorSampleRate" : @0,
        @"replaysSessionSampleRate" : @0
    };
    SentryOptions *actualOptions =
        [SentrySDKWrapper createOptionsWithDictionary:mockedReactNativeDictionary
                               isSessionReplayEnabled:NO
                                                error:&error];

    XCTAssertNotNil(actualOptions, @"Did not create sentry options");
    XCTAssertNil(error, @"Should not pass no error");

    id experimentalOptions = [actualOptions valueForKey:@"experimental"];
    XCTAssertNotNil(experimentalOptions, @"Experimental options should not be nil");

    BOOL enableUnhandledCPPExceptions =
        [[experimentalOptions valueForKey:@"enableSessionReplayInUnreliableEnvironment"] boolValue];
    XCTAssertFalse(enableUnhandledCPPExceptions,
        @"enableSessionReplayInUnreliableEnvironment should be disabled");
}

- (void)testCreateUserWithGeoDataCreatesSentryGeoObject
{
    NSDictionary *userKeys = @{
        @"id" : @"123",
        @"email" : @"test@example.com",
        @"username" : @"testuser",
        @"geo" :
            @ { @"city" : @"San Francisco", @"country_code" : @"US", @"region" : @"California" }
    };

    NSDictionary *userDataKeys = @{ @"customField" : @"customValue" };

    SentryUser *user = [RNSentry userFrom:userKeys otherUserKeys:userDataKeys];

    XCTAssertNotNil(user, @"User should not be nil");
    XCTAssertEqual(user.userId, @"123", @"User ID should match");
    XCTAssertEqual(user.email, @"test@example.com", @"Email should match");
    XCTAssertEqual(user.username, @"testuser", @"Username should match");

    // Test that geo data is properly converted to SentryGeo object
    XCTAssertNotNil(user.geo, @"Geo should not be nil");
    XCTAssertTrue([user.geo isKindOfClass:[SentryGeo class]], @"Geo should be SentryGeo object");
    XCTAssertEqual(user.geo.city, @"San Francisco", @"City should match");
    XCTAssertEqual(user.geo.countryCode, @"US", @"Country code should match");
    XCTAssertEqual(user.geo.region, @"California", @"Region should match");

    // Test that custom data is preserved
    XCTAssertNotNil(user.data, @"User data should not be nil");
    XCTAssertEqual(user.data[@"customField"], @"customValue", @"Custom field should be preserved");
}

- (void)testCreateUserWithPartialGeoDataCreatesSentryGeoObject
{
    NSDictionary *userKeys =
        @{ @"id" : @"456", @"geo" : @ { @"city" : @"New York", @"country_code" : @"US" } };

    NSDictionary *userDataKeys = @{};

    SentryUser *user = [RNSentry userFrom:userKeys otherUserKeys:userDataKeys];

    XCTAssertNotNil(user, @"User should not be nil");
    XCTAssertEqual(user.userId, @"456", @"User ID should match");

    // Test that partial geo data is properly converted to SentryGeo object
    XCTAssertNotNil(user.geo, @"Geo should not be nil");
    XCTAssertTrue([user.geo isKindOfClass:[SentryGeo class]], @"Geo should be SentryGeo object");
    XCTAssertEqual(user.geo.city, @"New York", @"City should match");
    XCTAssertEqual(user.geo.countryCode, @"US", @"Country code should match");
    XCTAssertNil(user.geo.region, @"Region should be nil when not provided");
}

- (void)testCreateUserWithEmptyGeoDataCreatesSentryGeoObject
{
    NSDictionary *userKeys = @{ @"id" : @"789", @"geo" : @ {} };

    NSDictionary *userDataKeys = @{};

    SentryUser *user = [RNSentry userFrom:userKeys otherUserKeys:userDataKeys];

    XCTAssertNotNil(user, @"User should not be nil");
    XCTAssertEqual(user.userId, @"789", @"User ID should match");

    // Test that empty geo data is properly converted to SentryGeo object
    XCTAssertNotNil(user.geo, @"Geo should not be nil");
    XCTAssertTrue([user.geo isKindOfClass:[SentryGeo class]], @"Geo should be SentryGeo object");
    XCTAssertNil(user.geo.city, @"City should be nil when not provided");
    XCTAssertNil(user.geo.countryCode, @"Country code should be nil when not provided");
    XCTAssertNil(user.geo.region, @"Region should be nil when not provided");
}

- (void)testCreateUserWithoutGeoDataDoesNotCreateGeoObject
{
    NSDictionary *userKeys = @{ @"id" : @"999", @"email" : @"test@example.com" };

    NSDictionary *userDataKeys = @{};

    SentryUser *user = [RNSentry userFrom:userKeys otherUserKeys:userDataKeys];

    XCTAssertNotNil(user, @"User should not be nil");
    XCTAssertEqual(user.userId, @"999", @"User ID should match");
    XCTAssertEqual(user.email, @"test@example.com", @"Email should match");

    // Test that no geo object is created when geo data is not provided
    XCTAssertNil(user.geo, @"Geo should be nil when not provided");
}

@end

#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>
#import "SentryOptions+RNOptions.h"
#import "SentryError.h"
#import "SentryHttpStatusCodeRange.h"
#import "SentrySamplingContext.h"

@interface sampleTests : XCTestCase

@end

@implementation sampleTests


- (void)testEmptyDsn
{
    NSError *error = nil;
    SentryOptions *options = [[SentryOptions alloc] initWithRNOptions:@{} didFailWithError:&error];

    [self assertDsnNil:options andError:error];
}

- (void)testInvalidDsnBoolean
{
    NSError *error = nil;
    SentryOptions *options = [[SentryOptions alloc] initWithRNOptions:@{ @"dsn" : @YES }
                                                didFailWithError:&error];

    [self assertDsnNil:options andError:error];
}

- (void)assertDsnNil:(SentryOptions *)options andError:(NSError *)error
{
    XCTAssertNil(options.parsedDsn);
    XCTAssertEqual(NO, options.debug);
    XCTAssertEqual(kSentryErrorInvalidDsnError, error.code);
}


- (void)testInvalidDsn
{
    NSError *error = nil;
    SentryOptions *options = [[SentryOptions alloc] initWithRNOptions:@{ @"dsn" : @"https://sentry.io" }
                                                didFailWithError:&error];
    XCTAssertEqual(kSentryErrorInvalidDsnError, error.code);
    XCTAssertNil(options);
}

- (void)testRelease
{
    SentryOptions *options = [self getValidOptions:@{ @"release" : @"abc" }];
    XCTAssertEqualObjects(options.releaseName, @"abc");
}

- (void)testSetEmptyRelease
{
    SentryOptions *options = [self getValidOptions:@{ @"release" : @"" }];
    XCTAssertEqualObjects(options.releaseName, @"");
}

- (void)testSetReleaseToNonString
{
    SentryOptions *options = [self getValidOptions:@{ @"release" : @2 }];
    XCTAssertEqualObjects(options.releaseName, [self buildDefaultReleaseName]);
}

- (void)testNoReleaseSetUsesDefault
{
    SentryOptions *options = [self getValidOptions:@{}];
    XCTAssertEqualObjects(options.releaseName, [self buildDefaultReleaseName]);
}

- (NSString *)buildDefaultReleaseName
{
    NSDictionary *infoDict = [[NSBundle mainBundle] infoDictionary];
    return [NSString stringWithFormat:@"%@@%@+%@", infoDict[@"CFBundleIdentifier"],
                     infoDict[@"CFBundleShortVersionString"], infoDict[@"CFBundleVersion"]];
}

- (void)testEnvironment
{
    SentryOptions *options = [self getValidOptions:@{}];
//    XCTAssertNil(options.environment);

    options = [self getValidOptions:@{ @"environment" : @"xxx" }];
    XCTAssertEqualObjects(options.environment, @"xxx");
}

- (void)testDist
{
    SentryOptions *options = [self getValidOptions:@{}];
    XCTAssertNil(options.dist);

    options = [self getValidOptions:@{ @"dist" : @"hhh" }];
    XCTAssertEqualObjects(options.dist, @"hhh");
}

- (void)testValidDebug
{
    [self testDebugWith:@YES expected:YES];
    [self testDebugWith:@"YES" expected:YES];
    [self testDebugWith:@(YES) expected:YES];
}

- (void)testInvalidDebug
{
    [self testDebugWith:@"Invalid" expected:NO];
    [self testDebugWith:@NO expected:NO];
    [self testDebugWith:@(NO) expected:NO];
}

- (void)testDebugWith:(NSObject *)debugValue expected:(BOOL)expectedDebugValue
{
    NSError *error = nil;
    SentryOptions *options = [[SentryOptions alloc] initWithRNOptions:@{
        @"dsn" : @"https://username:password@sentry.io/1",
        @"debug" : debugValue
    }
                                                didFailWithError:&error];

    XCTAssertNil(error);
    XCTAssertEqual(expectedDebugValue, options.debug);
}

//- (void)testValidDiagnosticLevel
//{
//    [self testDiagnosticlevelWith:@"none" expected:kSentryLevelNone];
//    [self testDiagnosticlevelWith:@"debug" expected:kSentryLevelDebug];
//    [self testDiagnosticlevelWith:@"info" expected:kSentryLevelInfo];
//    [self testDiagnosticlevelWith:@"warning" expected:kSentryLevelWarning];
//    [self testDiagnosticlevelWith:@"error" expected:kSentryLevelError];
//    [self testDiagnosticlevelWith:@"fatal" expected:kSentryLevelFatal];
//}

- (void)testInvalidDiagnosticLevel
{
    [self testDiagnosticlevelWith:@"fatala" expected:kSentryLevelDebug];
    [self testDiagnosticlevelWith:@(YES) expected:kSentryLevelDebug];
}

- (void)testDiagnosticlevelWith:(NSObject *)level expected:(SentryLevel)expected
{
    SentryOptions *options = [self getValidOptions:@{ @"diagnosticLevel" : level }];

    XCTAssertEqual(expected, options.diagnosticLevel);
}

- (void)testValidEnabled
{
    [self testEnabledWith:@YES expected:YES];
    [self testEnabledWith:@"YES" expected:YES];
    [self testEnabledWith:@(YES) expected:YES];
}

- (void)testInvalidEnabled
{
    [self testEnabledWith:@"Invalid" expected:NO];
    [self testEnabledWith:@NO expected:NO];
    [self testEnabledWith:@(NO) expected:NO];
}

- (void)testEnabledWith:(NSObject *)enabledValue expected:(BOOL)expectedValue
{
    SentryOptions *options = [self getValidOptions:@{ @"enabled" : enabledValue }];

    XCTAssertEqual(expectedValue, options.enabled);
}

- (void)testMaxBreadcrumbs
{
    NSNumber *maxBreadcrumbs = @20;

    SentryOptions *options = [self getValidOptions:@{ @"maxBreadcrumbs" : maxBreadcrumbs }];

    XCTAssertEqual([maxBreadcrumbs unsignedIntValue], options.maxBreadcrumbs);
}

- (void)testEnableNetworkBreadcrumbs
{
    [self testBooleanField:@"enableNetworkBreadcrumbs"];
}

- (void)testEnableAutoBreadcrumbTracking
{
    [self testBooleanField:@"enableAutoBreadcrumbTracking"];
}

- (void)testSendClientReports
{
    [self testBooleanField:@"sendClientReports" defaultValue:YES];
}

- (void)testDefaultMaxBreadcrumbs
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertEqual([@100 unsignedIntValue], options.maxBreadcrumbs);
}

- (void)testMaxBreadcrumbsGarbage
{
    SentryOptions *options = [self getValidOptions:@{ @"maxBreadcrumbs" : self }];

    XCTAssertEqual(100, options.maxBreadcrumbs);
}

- (void)testMaxCacheItems
{
    NSNumber *maxCacheItems = @20;

    SentryOptions *options = [self getValidOptions:@{ @"maxCacheItems" : maxCacheItems }];

    XCTAssertEqual([maxCacheItems unsignedIntValue], options.maxCacheItems);
}

- (void)testMaxCacheItemsGarbage
{
    SentryOptions *options = [self getValidOptions:@{ @"maxCacheItems" : self }];

    XCTAssertEqual(30, options.maxCacheItems);
}

- (void)testDefaultMaxCacheItems
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertEqual([@30 unsignedIntValue], options.maxCacheItems);
}

- (void)testDefaultBeforeSend
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertNil(options.beforeSend);
}

- (void)testGarbageBeforeSend_ReturnsNil
{
    SentryOptions *options = [self getValidOptions:@{ @"beforeSend" : @"fault" }];

    XCTAssertNil(options.beforeSend);
}

- (void)testNSNullBeforeSend_ReturnsNil
{
    SentryOptions *options = [self getValidOptions:@{ @"beforeSend" : [NSNull null] }];

    XCTAssertFalse([options.beforeSend isEqual:[NSNull null]]);
}

- (void)testDefaultBeforeBreadcrumb
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertNil(options.beforeBreadcrumb);
}

- (void)testTracePropagationTargets
{
    SentryOptions *options =
        [self getValidOptions:@{ @"tracePropagationTargets" : @[ @"localhost" ] }];

    XCTAssertEqual(options.tracePropagationTargets.count, 1);
    XCTAssertEqual(options.tracePropagationTargets[0], @"localhost");
}

- (void)testTracePropagationTargetsInvalidInstanceDoesntCrash
{
    SentryOptions *options = [self getValidOptions:@{ @"tracePropagationTargets" : @[ @YES ] }];

    XCTAssertEqual(options.tracePropagationTargets.count, 1);
    XCTAssertEqual(options.tracePropagationTargets[0], @YES);
}

- (void)testFailedRequestTargets
{
    SentryOptions *options =
        [self getValidOptions:@{ @"failedRequestTargets" : @[ @"localhost" ] }];

    XCTAssertEqual(options.failedRequestTargets.count, 1);
    XCTAssertEqual(options.failedRequestTargets[0], @"localhost");
}

- (void)testFailedRequestTargetsInvalidInstanceDoesntCrash
{
    SentryOptions *options = [self getValidOptions:@{ @"failedRequestTargets" : @[ @YES ] }];

    XCTAssertEqual(options.failedRequestTargets.count, 1);
    XCTAssertEqual(options.failedRequestTargets[0], @YES);
}

- (void)testGarbageBeforeBreadcrumb_ReturnsNil
{
    SentryOptions *options = [self getValidOptions:@{ @"beforeBreadcrumb" : @"fault" }];

    XCTAssertEqual(nil, options.beforeBreadcrumb);
}

- (void)testDefaultOnCrashedLastRun
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertNil(options.onCrashedLastRun);
}

- (void)testGarbageOnCrashedLastRun_ReturnsNil
{
    SentryOptions *options = [self getValidOptions:@{ @"onCrashedLastRun" : @"fault" }];

    XCTAssertNil(options.onCrashedLastRun);
}

- (void)testDefaultIntegrations
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertTrue([[SentryOptions defaultIntegrations] isEqualToArray:options.integrations],
        @"Default integrations are not set correctly");
}

- (void)testSampleRateWithDict
{
    NSNumber *sampleRate = @0.1;
    SentryOptions *options = [self getValidOptions:@{ @"sampleRate" : sampleRate }];
    XCTAssertEqual(sampleRate, options.sampleRate);
}

- (void)testSampleRateNotSet
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertEqual(@1, options.sampleRate);
}

- (void)testEnableAutoSessionTracking
{
    [self testBooleanField:@"enableAutoSessionTracking"];
}

- (void)testEnableOutOfMemoryTracking
{
    [self testBooleanField:@"enableOutOfMemoryTracking"];
}

- (void)testSessionTrackingIntervalMillis
{
    NSNumber *sessionTracing = @2000;
    SentryOptions *options =
        [self getValidOptions:@{ @"sessionTrackingIntervalMillis" : sessionTracing }];

  XCTAssertEqual([sessionTracing unsignedIntValue], options.sessionTrackingIntervalMillis);
}

- (void)testDefaultSessionTracingIntervalMillis
{
    SentryOptions *options = [self getValidOptions:@{}];

  XCTAssertEqual([@30000 unsignedIntValue], options.sessionTrackingIntervalMillis);
}

- (void)testAttachStackTrace
{
    [self testBooleanField:@"attachStacktrace"];
}

- (void)testStitchAsyncCodeDisabledPerDefault
{
    [self testBooleanField:@"stitchAsyncCode" defaultValue:NO];
}

- (void)testEnableIOTracing
{
    [self testBooleanField:@"enableFileIOTracing" defaultValue:NO];
}

- (void)testNSNull_SetsDefaultValue
{
    SentryOptions *options = [[SentryOptions alloc] initWithRNOptions:@{
        @"dsn" : [NSNull null],
        @"enabled" : [NSNull null],
        @"debug" : [NSNull null],
        @"diagnosticLevel" : [NSNull null],
        @"release" : [NSNull null],
        @"environment" : [NSNull null],
        @"dist" : [NSNull null],
        @"maxBreadcrumbs" : [NSNull null],
        @"enableNetworkBreadcrumbs" : [NSNull null],
        @"maxCacheItems" : [NSNull null],
        @"beforeSend" : [NSNull null],
        @"beforeBreadcrumb" : [NSNull null],
        @"onCrashedLastRun" : [NSNull null],
        @"integrations" : [NSNull null],
        @"sampleRate" : [NSNull null],
        @"enableAutoSessionTracing" : [NSNull null],
        @"enableOutOfMemoryTracing" : [NSNull null],
        @"sessionTracingIntervalMillis" : [NSNull null],
        @"attachStacktrace" : [NSNull null],
        @"stitchAsyncCode" : [NSNull null],
        @"maxAttachmentSize" : [NSNull null],
        @"sendDefaultPii" : [NSNull null],
        @"enableAutoPerformanceTracing" : [NSNull null],
#if SENTRY_HAS_UIKIT
        @"enableUIViewControllerTracing" : [NSNull null],
        @"attachScreenshot" : [NSNull null],
#endif
        @"enableAppHangTracing" : [NSNull null],
        @"appHangTimeoutInterval" : [NSNull null],
        @"enableNetworkTracing" : [NSNull null],
        @"enableAutoBreadcrumbTracing" : [NSNull null],
        @"tracesSampleRate" : [NSNull null],
        @"tracesSampler" : [NSNull null],
        @"inAppIncludes" : [NSNull null],
        @"inAppExcludes" : [NSNull null],
        @"urlSessionDelegate" : [NSNull null],
        @"enableSwizzling" : [NSNull null],
        @"enableIOTracing" : [NSNull null],
        @"sdk" : [NSNull null],
        @"enableCaptureFailedRequests" : [NSNull null],
        @"failedRequestStatusCodes" : [NSNull null],
    }
                                                didFailWithError:nil];

    XCTAssertNotNil(options.parsedDsn);
    [self assertDefaultValues:options];
}

- (void)assertDefaultValues:(SentryOptions *)options
{
    XCTAssertEqual(YES, options.enabled);
    XCTAssertEqual(NO, options.debug);
    XCTAssertEqual(kSentryLevelDebug, options.diagnosticLevel);
//    XCTAssertNil(options.environment);
    XCTAssertNil(options.dist);
    XCTAssertEqual(defaultMaxBreadcrumbs, options.maxBreadcrumbs);
    XCTAssertTrue(options.enableNetworkBreadcrumbs);
    XCTAssertEqual(30, options.maxCacheItems);
    XCTAssertNil(options.beforeSend);
    XCTAssertNil(options.beforeBreadcrumb);
    XCTAssertNil(options.onCrashedLastRun);
    XCTAssertTrue([[SentryOptions defaultIntegrations] isEqualToArray:options.integrations],
        @"Default integrations are not set correctly");
    XCTAssertEqual(@1, options.sampleRate);
    XCTAssertEqual(YES, options.enableAutoSessionTracking);
    XCTAssertEqual(YES, options.enableOutOfMemoryTracking);
  XCTAssertEqual([@30000 unsignedIntValue], options.sessionTrackingIntervalMillis);
    XCTAssertEqual(YES, options.attachStacktrace);
    XCTAssertEqual(NO, options.stitchAsyncCode);
    XCTAssertEqual(20 * 1024 * 1024, options.maxAttachmentSize);
    XCTAssertEqual(NO, options.sendDefaultPii);
    XCTAssertTrue(options.enableAutoPerformanceTracing);
#if SENTRY_HAS_UIKIT
    XCTAssertTrue(options.enableUIViewControllerTracing);
    XCTAssertFalse(options.attachScreenshot);
    XCTAssertEqual(3.0, options.idleTimeout);
#endif
  XCTAssertFalse(options.enableAppHangTracking);
    XCTAssertEqual(options.appHangTimeoutInterval, 2);
    XCTAssertEqual(YES, options.enableNetworkTracking);
    XCTAssertNil(options.tracesSampleRate);
    XCTAssertNil(options.tracesSampler);
    XCTAssertEqual(@[], options.inAppExcludes);
    XCTAssertNil(options.urlSessionDelegate);
    XCTAssertEqual(YES, options.enableSwizzling);
    XCTAssertEqual(NO, options.enableFileIOTracing);
    XCTAssertEqual(YES, options.enableAutoBreadcrumbTracking);

    NSRegularExpression *regexTrace = options.tracePropagationTargets[0];
    XCTAssertTrue([regexTrace.pattern isEqualToString:@".*"]);

    NSRegularExpression *regexRequests = options.failedRequestTargets[0];
    XCTAssertTrue([regexRequests.pattern isEqualToString:@".*"]);

    XCTAssertEqual(NO, options.enableCaptureFailedRequests);

    SentryHttpStatusCodeRange *range = options.failedRequestStatusCodes[0];
    XCTAssertEqual(500, range.min);
    XCTAssertEqual(599, range.max);

#if SENTRY_TARGET_PROFILING_SUPPORTED
#    pragma clang diagnostic push
#    pragma clang diagnostic ignored "-Wdeprecated-declarations"
    XCTAssertEqual(NO, options.enableProfiling);
#    pragma clang diagnostic pop
    XCTAssertNil(options.profilesSampleRate);
    XCTAssertNil(options.profilesSampler);
#endif
}


- (void)testMaxAttachmentSize
{
    NSNumber *maxAttachmentSize = @21;
    SentryOptions *options = [self getValidOptions:@{ @"maxAttachmentSize" : maxAttachmentSize }];

    XCTAssertEqual([maxAttachmentSize unsignedIntValue], options.maxAttachmentSize);
}

- (void)testDefaultMaxAttachmentSize
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertEqual(20 * 1024 * 1024, options.maxAttachmentSize);
}

- (void)testSendDefaultPii
{
    [self testBooleanField:@"sendDefaultPii" defaultValue:NO];
}

//- (void)testEnableAutoPerformanceTracing
//{
//    [self testBooleanField:@"enableAutoPerformanceTracing"];
//}

#if SENTRY_HAS_UIKIT
//- (void)testEnableUIViewControllerTracking
//{
//    [self testBooleanField:@"enableUIViewControllerTracking"];
//}

- (void)testAttachScreenshot
{
    [self testBooleanField:@"attachScreenshot" defaultValue:NO];
}

//- (void)testEnableUserInteractionTracking
//{
//    [self testBooleanField:@"enableUserInteractionTracking" defaultValue:NO];
//}

- (void)testIdleTimeout
{
    NSNumber *idleTimeout = @2.1;
    SentryOptions *options = [self getValidOptions:@{ @"idleTimeout" : idleTimeout }];

    XCTAssertEqual([idleTimeout doubleValue], options.idleTimeout);
}

//- (void)testEnablePreWarmedAppStartTracking
//{
//    [self testBooleanField:@"enablePreWarmedAppStartTracking" defaultValue:NO];
//}

#endif

- (void)testEnableAppHangTracking
{
    [self testBooleanField:@"enableAppHangTracking" defaultValue:NO];
}

- (void)testDefaultAppHangsTimeout
{
    SentryOptions *options = [self getValidOptions:@{}];
    XCTAssertEqual(2, options.appHangTimeoutInterval);
}

- (void)testEnableNetworkTracking
{
    [self testBooleanField:@"enableNetworkTracking"];
}

- (void)testEnableSwizzling
{
    [self testBooleanField:@"enableSwizzling"];
}

- (void)testTracesSampleRate
{
    SentryOptions *options = [self getValidOptions:@{ @"tracesSampleRate" : @0.1 }];

    XCTAssertEqual(options.tracesSampleRate.doubleValue, 0.1);
}

- (void)testDefaultTracesSampleRate
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertNil(options.tracesSampleRate);
}

- (double)tracesSamplerCallback:(NSDictionary *)context
{
    return 0.1;
}

- (void)testDefaultTracesSampler
{
    SentryOptions *options = [self getValidOptions:@{}];
    XCTAssertNil(options.tracesSampler);
}

- (void)testGarbageTracesSampler_ReturnsNil
{
    SentryOptions *options = [self getValidOptions:@{ @"tracesSampler" : @"fault" }];
    XCTAssertNil(options.tracesSampler);
}

#if SENTRY_TARGET_PROFILING_SUPPORTED
//- (void)testEnableProfiling
//{
//    [self testBooleanField:@"enableProfiling" defaultValue:NO];
//}

- (void)testProfilesSampleRate
{
    SentryOptions *options = [self getValidOptions:@{ @"profilesSampleRate" : @0.1 }];

    XCTAssertEqual(options.profilesSampleRate.doubleValue, 0.1);
}

- (void)testDefaultProfilesSampleRate
{
    SentryOptions *options = [self getValidOptions:@{}];

    XCTAssertNil(options.profilesSampleRate);
}

- (double)profilesSamplerCallback:(NSDictionary *)context
{
    return 0.1;
}

- (void)testDefaultProfilesSampler
{
    SentryOptions *options = [self getValidOptions:@{}];
    XCTAssertNil(options.profilesSampler);
}

- (void)testGarbageProfilesSampler_ReturnsNil
{
    SentryOptions *options = [self getValidOptions:@{ @"profilesSampler" : @"fault" }];
    XCTAssertNil(options.profilesSampler);
}
#endif

- (SentryOptions *)getValidOptions:(NSDictionary<NSString *, id> *)dict
{
    NSError *error = nil;

    NSMutableDictionary<NSString *, id> *options = [[NSMutableDictionary alloc] init];
    options[@"dsn"] = @"https://username:password@sentry.io/1";

    [options addEntriesFromDictionary:dict];

    SentryOptions *sentryOptions = [[SentryOptions alloc] initWithRNOptions:options
                                                      didFailWithError:&error];
    XCTAssertNil(error);
    return sentryOptions;
}

- (void)testBooleanField:(NSString *)property
{
    [self testBooleanField:property defaultValue:YES];
}

- (void)testBooleanField:(NSString *)property defaultValue:(BOOL)defaultValue
{
    // Opposite of default
    SentryOptions *options = [self getValidOptions:@{ property : @(!defaultValue) }];
    XCTAssertEqual(!defaultValue, [self getProperty:property of:options]);

    // Default
    options = [self getValidOptions:@{}];
    XCTAssertEqual(defaultValue, [self getProperty:property of:options]);

    // Garbage
    options = [self getValidOptions:@{ property : @"" }];
    XCTAssertEqual(NO, [self getProperty:property of:options]);
}

- (BOOL)getProperty:(NSString *)property of:(SentryOptions *)options
{
    SEL selector = NSSelectorFromString(property);
    NSAssert(
        [options respondsToSelector:selector], @"Options doesn't have a property '%@'", property);

    NSInvocation *invocation = [NSInvocation
        invocationWithMethodSignature:[[options class]
                                          instanceMethodSignatureForSelector:selector]];
    [invocation setSelector:selector];
    [invocation setTarget:options];
    [invocation invoke];
    BOOL result;
    [invocation getReturnValue:&result];

    return result;
}

@end

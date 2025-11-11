#import "SentrySDKWrapper.h"
#import "RNSentryExperimentalOptions.h"
#import "RNSentryVersion.h"
@import Sentry;

@implementation SentrySDKWrapper

+ (void)startWithOptions:(SentryOptions *)options
{
    [SentrySDK startWithOptions:options];
}

+ (void)crash
{
    [SentrySDK crash];
}

+ (void)close
{
    [SentrySDK close];
}

+ (BOOL)crashedLastRun
{
    return [SentrySDK crashedLastRun];
}

+ (void)configureScope:(void (^)(SentryScope *scope))callback
{
    [SentrySDK configureScope:callback];
}

+ (SentryOptions *)createOptionsWithDictionary:(NSDictionary *)options
                        isSessionReplayEnabled:(BOOL)isSessionReplayEnabled
                                         error:(NSError *__autoreleasing *)errorPointer
{
    NSString *dsn = [self getURLFromDSN:[options valueForKey:@"dsn"]];
    SentryOptions *sentryOptions = [SentryOptionsInternal initWithDict:options
                                                      didFailWithError:errorPointer];
    if (*errorPointer != nil) {
        return nil;
    }

    // Exclude Dev Server and Sentry Dsn request from Breadcrumbs
    NSString *devServerUrl = [options valueForKey:@"devServerUrl"];
    sentryOptions.beforeBreadcrumb
        = ^SentryBreadcrumb *_Nullable(SentryBreadcrumb *_Nonnull breadcrumb)
    {
        NSString *url = breadcrumb.data[@"url"] ?: @"";

        if ([@"http" isEqualToString:breadcrumb.type]
            && ((dsn != nil && [url hasPrefix:dsn])
                || (devServerUrl != nil && [url hasPrefix:devServerUrl]))) {
            return nil;
        }
        return breadcrumb;
    };

    if ([options valueForKey:@"enableNativeCrashHandling"] != nil) {
        BOOL enableNativeCrashHandling = [options[@"enableNativeCrashHandling"] boolValue];

        if (!enableNativeCrashHandling) {
            sentryOptions.enableCrashHandler = NO;
        }
    }

    // Set spotlight option
    if ([options valueForKey:@"spotlight"] != nil) {
        id spotlightValue = [options valueForKey:@"spotlight"];
        if ([spotlightValue isKindOfClass:[NSString class]]) {
            NSLog(@"Using Spotlight on address: %@", spotlightValue);
            sentryOptions.enableSpotlight = true;
            sentryOptions.spotlightUrl = spotlightValue;
        } else if ([spotlightValue isKindOfClass:[NSNumber class]]) {
            sentryOptions.enableSpotlight = [spotlightValue boolValue];
            id defaultSpotlightUrl = [options valueForKey:@"defaultSidecarUrl"];
            if (defaultSpotlightUrl != nil) {
                sentryOptions.spotlightUrl = defaultSpotlightUrl;
            }
        }
    }

    if ([options valueForKey:@"enableLogs"] != nil) {
        id enableLogsValue = [options valueForKey:@"enableLogs"];
        if ([enableLogsValue isKindOfClass:[NSNumber class]]) {
            [RNSentryExperimentalOptions setEnableLogs:[enableLogsValue boolValue]
                                         sentryOptions:sentryOptions];
        }
    }

    // Enable the App start and Frames tracking measurements
    if ([options valueForKey:@"enableAutoPerformanceTracing"] != nil) {
        BOOL enableAutoPerformanceTracing = [options[@"enableAutoPerformanceTracing"] boolValue];
        PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = enableAutoPerformanceTracing;
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
        PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = enableAutoPerformanceTracing;
#endif
    }

    // Failed requests can only be enabled in one SDK to avoid duplicates
    sentryOptions.enableCaptureFailedRequests = NO;

    NSDictionary *experiments = options[@"_experiments"];
    if (experiments != nil && [experiments isKindOfClass:[NSDictionary class]]) {
        BOOL enableUnhandledCPPExceptions =
            [experiments[@"enableUnhandledCPPExceptionsV2"] boolValue];
        [RNSentryExperimentalOptions setEnableUnhandledCPPExceptionsV2:enableUnhandledCPPExceptions
                                                         sentryOptions:sentryOptions];
    }

    if (isSessionReplayEnabled) {
        [RNSentryExperimentalOptions setEnableSessionReplayInUnreliableEnvironment:YES
                                                                     sentryOptions:sentryOptions];
    }
    return sentryOptions;
}

+ (NSString *_Nullable)getURLFromDSN:(NSString *)dsn
{
    NSURL *url = [NSURL URLWithString:dsn];
    if (!url) {
        return nil;
    }
    return [NSString stringWithFormat:@"%@://%@", url.scheme, url.host];
}

+ (void)setupWithDictionary:(NSDictionary *_Nonnull)options
     isSessionReplayEnabled:(BOOL)isSessionReplayEnabled
                      error:(NSError *_Nonnull *_Nonnull)errorPointer
{
    SentryOptions *sentryOptions = [self createOptionsWithDictionary:options
                                              isSessionReplayEnabled:isSessionReplayEnabled
                                                               error:errorPointer];
    if (!options) {
        return;
    }

    NSString *sdkVersion = [PrivateSentrySDKOnly getSdkVersionString];
    [PrivateSentrySDKOnly setSdkName:NATIVE_SDK_NAME andVersionString:sdkVersion];
    [PrivateSentrySDKOnly addSdkPackage:REACT_NATIVE_SDK_PACKAGE_NAME
                                version:REACT_NATIVE_SDK_PACKAGE_VERSION];

    [SentrySDKWrapper startWithOptions:sentryOptions];
}

+ (BOOL)debug
{
    return PrivateSentrySDKOnly.options.debug;
}

+ (NSString *)releaseName
{
    return PrivateSentrySDKOnly.options.releaseName;
}

+ (BOOL)enableAutoSessionTracking
{
    return PrivateSentrySDKOnly.options.enableAutoSessionTracking;
}

+ (BOOL)enableWatchdogTerminationTracking
{
    return PrivateSentrySDKOnly.options.enableWatchdogTerminationTracking;
}

@end

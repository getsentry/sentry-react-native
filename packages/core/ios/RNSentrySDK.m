#import "RNSentrySDK.h"
#import "RNSentryReplay.h"
#import "RNSentryVersion.h"

#import <Sentry/PrivateSentrySDKOnly.h>
#import <Sentry/SentryOptions+HybridSDKs.h>

@implementation RNSentrySDK

+ (void)startWithOptions:(SentryOptions *)options NS_SWIFT_NAME(start(options:))
{
    NSString *sdkVersion = [PrivateSentrySDKOnly getSdkVersionString];
    [PrivateSentrySDKOnly setSdkName:nativeSdkName andVersionString:sdkVersion];

    [SentrySDK startWithOptions:options];

#if SENTRY_TARGET_REPLAY_SUPPORTED
    [RNSentryReplay postInit];
#endif
}

+ (SentryOptions *_Nullable)createOptionsWithDictionary:(NSDictionary *_Nonnull)options
                                                  error:(NSError *_Nonnull *_Nonnull)errorPointer
{
    SentryBeforeSendEventCallback beforeSend = ^SentryEvent *(SentryEvent *event)
    {
        // We don't want to send an event after startup that came from a Unhandled JS Exception of
        // react native Because we sent it already before the app crashed.
        if (nil != event.exceptions.firstObject.type &&
            [event.exceptions.firstObject.type rangeOfString:@"Unhandled JS Exception"].location
                != NSNotFound) {
            return nil;
        }

        [self setEventOriginTag:event];

        return event;
    };

    NSMutableDictionary *mutableOptions = [options mutableCopy];
    [mutableOptions setValue:beforeSend forKey:@"beforeSend"];

    // remove performance traces sample rate and traces sampler since we don't want to synchronize
    // these configurations to the Native SDKs. The user could tho initialize the SDK manually and
    // set themselves.
    [mutableOptions removeObjectForKey:@"tracesSampleRate"];
    [mutableOptions removeObjectForKey:@"tracesSampler"];
    [mutableOptions removeObjectForKey:@"enableTracing"];

#if SENTRY_TARGET_REPLAY_SUPPORTED
    [RNSentryReplay updateOptions:mutableOptions];
#endif

    SentryOptions *sentryOptions = [[SentryOptions alloc] initWithDict:mutableOptions
                                                      didFailWithError:errorPointer];
    if (*errorPointer != nil) {
        return nil;
    }

    // Exclude Dev Server and Sentry Dsn request from Breadcrumbs
    NSString *dsn = [self getURLFromDSN:[mutableOptions valueForKey:@"dsn"]];
    NSString *devServerUrl = [mutableOptions valueForKey:@"devServerUrl"];
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

    if ([mutableOptions valueForKey:@"enableNativeCrashHandling"] != nil) {
        BOOL enableNativeCrashHandling = [mutableOptions[@"enableNativeCrashHandling"] boolValue];

        if (!enableNativeCrashHandling) {
            NSMutableArray *integrations = sentryOptions.integrations.mutableCopy;
            [integrations removeObject:@"SentryCrashIntegration"];
            sentryOptions.integrations = integrations;
        }
    }

    // Set spotlight option
    if ([mutableOptions valueForKey:@"spotlight"] != nil) {
        id spotlightValue = [mutableOptions valueForKey:@"spotlight"];
        if ([spotlightValue isKindOfClass:[NSString class]]) {
            NSLog(@"Using Spotlight on address: %@", spotlightValue);
            sentryOptions.enableSpotlight = true;
            sentryOptions.spotlightUrl = spotlightValue;
        } else if ([spotlightValue isKindOfClass:[NSNumber class]]) {
            sentryOptions.enableSpotlight = [spotlightValue boolValue];
            id defaultSpotlightUrl = [mutableOptions valueForKey:@"defaultSidecarUrl"];
            if (defaultSpotlightUrl != nil) {
                sentryOptions.spotlightUrl = defaultSpotlightUrl;
            }
        }
    }

    // Enable the App start and Frames tracking measurements
    if ([mutableOptions valueForKey:@"enableAutoPerformanceTracing"] != nil) {
        BOOL enableAutoPerformanceTracing =
            [mutableOptions[@"enableAutoPerformanceTracing"] boolValue];
        PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = enableAutoPerformanceTracing;
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
        PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = enableAutoPerformanceTracing;
#endif
    }

    // Failed requests can only be enabled in one SDK to avoid duplicates
    sentryOptions.enableCaptureFailedRequests = NO;

    return sentryOptions;
}

+ (void)setEventOriginTag:(SentryEvent *)event
{
    if (event.sdk != nil) {
        NSString *sdkName = event.sdk[@"name"];

        // If the event is from react native, it gets set
        // there and we do not handle it here.
        if ([sdkName isEqual:nativeSdkName]) {
            [self setEventEnvironmentTag:event origin:@"ios" environment:@"native"];
        }
    }
}

+ (void)setEventEnvironmentTag:(SentryEvent *)event
                        origin:(NSString *)origin
                   environment:(NSString *)environment
{
    NSMutableDictionary *newTags = [NSMutableDictionary new];

    if (nil != event.tags && [event.tags count] > 0) {
        [newTags addEntriesFromDictionary:event.tags];
    }
    if (nil != origin) {
        [newTags setValue:origin forKey:@"event.origin"];
    }
    if (nil != environment) {
        [newTags setValue:environment forKey:@"event.environment"];
    }

    event.tags = newTags;
}

+ (NSString *_Nullable)getURLFromDSN:(NSString *)dsn
{
    NSURL *url = [NSURL URLWithString:dsn];
    if (!url) {
        return nil;
    }
    return [NSString stringWithFormat:@"%@://%@", url.scheme, url.host];
}

@end

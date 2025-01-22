#import "RNSentryStart.h"
#import "RNSentryReplay.h"
#import "RNSentryVersion.h"

#import <Sentry/PrivateSentrySDKOnly.h>
#import <Sentry/Sentry.h>
#import <Sentry/SentryOptions+HybridSDKs.h>

@implementation RNSentryStart

+ (void)startWithOptions:(NSDictionary *_Nonnull)javascriptOptions
                   error:(NSError *_Nullable *_Nullable)errorPointer
{
    SentryOptions *options = [self createOptionsWithDictionary:javascriptOptions
                                                         error:errorPointer];
    [self updateWithReactDefaults:options];
    [self updateWithReactFinals:options];
    [self startWithOptions:options];
}

+ (void)startWithOptions:(SentryOptions *)options NS_SWIFT_NAME(start(options:))
{
    NSString *sdkVersion = [PrivateSentrySDKOnly getSdkVersionString];
    [PrivateSentrySDKOnly setSdkName:NATIVE_SDK_NAME andVersionString:sdkVersion];
    [PrivateSentrySDKOnly addSdkPackage:REACT_NATIVE_SDK_PACKAGE_NAME
                                version:REACT_NATIVE_SDK_PACKAGE_VERSION];

    [SentrySDK startWithOptions:options];

#if SENTRY_TARGET_REPLAY_SUPPORTED
    [RNSentryReplay postInit];
#endif

    [self postDidBecomeActiveNotification];
}

+ (SentryOptions *_Nullable)createOptionsWithDictionary:(NSDictionary *_Nonnull)options
                                                  error:(NSError *_Nonnull *_Nonnull)errorPointer
{
    NSMutableDictionary *mutableOptions = [options mutableCopy];

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
    // TODO: For Auto Init from JS dev server is resolved automatically, for init from options file
    // dev server has to be specified manually
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

    // JS options.enableNativeCrashHandling equals to native options.enableCrashHandler
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
            // TODO: For Auto init from JS set automatically for init from options file have to be
            // set manually
            id defaultSpotlightUrl = [mutableOptions valueForKey:@"defaultSidecarUrl"];
            if (defaultSpotlightUrl != nil) {
                sentryOptions.spotlightUrl = defaultSpotlightUrl;
            }
        }
    }

    return sentryOptions;
}

/**
 * This function updates the options with RNSentry defaults. These default can be
 * overwritten by users during manual native initialization.
 */
+ (void)updateWithReactDefaults:(SentryOptions *)options
{
    // Failed requests are captured only in JS to avoid duplicates
    options.enableCaptureFailedRequests = NO;

    // Tracing is only enabled in JS to avoid duplicate navigation spans
    options.tracesSampleRate = nil;
    options.tracesSampler = nil;
    options.enableTracing = NO;
}

/**
 * This function updates options with changes RNSentry users should not change
 * and so this is applied after the configureOptions callback during manual native initialization.
 */
+ (void)updateWithReactFinals:(SentryOptions *)options
{
    SentryBeforeSendEventCallback userBeforeSend = options.beforeSend;
    options.beforeSend = ^SentryEvent *(SentryEvent *event)
    {
        // Unhandled JS Exception are processed by the SDK on JS layer
        // To avoid duplicates we drop them in the native SDKs
        if (nil != event.exceptions.firstObject.type &&
            [event.exceptions.firstObject.type rangeOfString:@"Unhandled JS Exception"].location
                != NSNotFound) {
            return nil;
        }

        [self setEventOriginTag:event];
        if (userBeforeSend == nil) {
            return event;
        } else {
            return userBeforeSend(event);
        }
    };

    // App Start Hybrid mode doesn't wait for didFinishLaunchNotification and the
    // didBecomeVisibleNotification as they will be missed when auto initializing from JS
    // App Start measurements are created right after the tracking starts
    PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = options.enableAutoPerformanceTracing;
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    // Frames Tracking Hybrid Mode ensures tracking
    // is enabled without tracing enabled in the native SDK
    PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode
        = options.enableAutoPerformanceTracing;
#endif
}

+ (void)setEventOriginTag:(SentryEvent *)event
{
    if (event.sdk != nil) {
        NSString *sdkName = event.sdk[@"name"];

        // If the event is from react native, it gets set
        // there and we do not handle it here.
        if ([sdkName isEqual:NATIVE_SDK_NAME]) {
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

static bool sentHybridSdkDidBecomeActive = NO;

+ (void)postDidBecomeActiveNotification
{
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    BOOL appIsActive =
        [[UIApplication sharedApplication] applicationState] == UIApplicationStateActive;
#else
    BOOL appIsActive = [[NSApplication sharedApplication] isActive];
#endif

    // If the app is active/in foreground, and we have not sent the SentryHybridSdkDidBecomeActive
    // notification, send it.
    if (appIsActive && !sentHybridSdkDidBecomeActive
        && (PrivateSentrySDKOnly.options.enableAutoSessionTracking
            || PrivateSentrySDKOnly.options.enableWatchdogTerminationTracking)) {
        // Updates Native App State Manager
        // https://github.com/getsentry/sentry-cocoa/blob/888a145b144b8077e03151a886520f332e47e297/Sources/Sentry/SentryAppStateManager.m#L136
        // Triggers Session Tracker
        // https://github.com/getsentry/sentry-cocoa/blob/888a145b144b8077e03151a886520f332e47e297/Sources/Sentry/SentrySessionTracker.m#L144
        [[NSNotificationCenter defaultCenter] postNotificationName:@"SentryHybridSdkDidBecomeActive"
                                                            object:nil];

        sentHybridSdkDidBecomeActive = true;
    }
}

@end

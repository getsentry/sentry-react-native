#import "RNSentry.h"

#if __has_include(<React/RCTConvert.h>)
#import <React/RCTConvert.h>
#else
#import "RCTConvert.h"
#endif

#import <Sentry/Sentry.h>
#import <Sentry/PrivateSentrySDKOnly.h>
#import <Sentry/SentryScreenFrames.h>

@interface SentryTraceContext : NSObject
- (nullable instancetype)initWithDict:(NSDictionary<NSString *, id> *)dictionary;
@end

@interface SentrySDK (RNSentry)

+ (void)captureEnvelope:(SentryEnvelope *)envelope;

+ (void)storeEnvelope:(SentryEnvelope *)envelope;

@end

static bool didFetchAppStart;

@implementation RNSentry {
    bool sentHybridSdkDidBecomeActive;
}

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

RCT_EXPORT_MODULE()


RCT_EXPORT_METHOD(initNativeSdk:(NSDictionary *_Nonnull)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSError *error = nil;

    SentryBeforeSendEventCallback beforeSend = ^SentryEvent*(SentryEvent *event) {
        // We don't want to send an event after startup that came from a Unhandled JS Exception of react native
        // Because we sent it already before the app crashed.
        if (nil != event.exceptions.firstObject.type &&
            [event.exceptions.firstObject.type rangeOfString:@"Unhandled JS Exception"].location != NSNotFound) {
            NSLog(@"Unhandled JS Exception");
            return nil;
        }

        [self setEventOriginTag:event];

        return event;
    };

    NSMutableDictionary * mutableOptions =[options mutableCopy];
    [mutableOptions setValue:beforeSend forKey:@"beforeSend"];

    // remove performance traces sample rate and traces sampler since we don't want to synchronize these configurations
    // to the Native SDKs.
    // The user could tho initialize the SDK manually and set themselves.
    [mutableOptions removeObjectForKey:@"tracesSampleRate"];
    [mutableOptions removeObjectForKey:@"tracesSampler"];

    SentryOptions *sentryOptions = [[SentryOptions alloc] initWithDict:mutableOptions didFailWithError:&error];
    if (error) {
        reject(@"SentryReactNative", error.localizedDescription, error);
        return;
    }

    if ([mutableOptions valueForKey:@"enableNativeCrashHandling"] != nil) {
        BOOL enableNativeCrashHandling = (BOOL)[mutableOptions valueForKey:@"enableNativeCrashHandling"];

        if (!enableNativeCrashHandling) {
            NSMutableArray *integrations = sentryOptions.integrations.mutableCopy;
            [integrations removeObject:@"SentryCrashIntegration"];
            sentryOptions.integrations = integrations;
        }
    }

    // Enable the App start and Frames tracking measurements
    if ([mutableOptions valueForKey:@"enableAutoPerformanceTracking"] != nil) {
        BOOL enableAutoPerformanceTracking = (BOOL)[mutableOptions valueForKey:@"enableAutoPerformanceTracking"];

        PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = enableAutoPerformanceTracking;
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
        PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = enableAutoPerformanceTracking;
#endif
    }

    [SentrySDK startWithOptionsObject:sentryOptions];

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    BOOL appIsActive = [[UIApplication sharedApplication] applicationState] == UIApplicationStateActive;
#else
    BOOL appIsActive = [[NSApplication sharedApplication] isActive];
#endif

    // If the app is active/in foreground, and we have not sent the SentryHybridSdkDidBecomeActive notification, send it.
    if (appIsActive && !sentHybridSdkDidBecomeActive && (PrivateSentrySDKOnly.options.enableAutoSessionTracking || PrivateSentrySDKOnly.options.enableOutOfMemoryTracking)) {
        [[NSNotificationCenter defaultCenter]
            postNotificationName:@"SentryHybridSdkDidBecomeActive"
            object:nil];

        sentHybridSdkDidBecomeActive = true;
    }




    resolve(@YES);
}

- (void)setEventOriginTag:(SentryEvent *)event {
  if (event.sdk != nil) {
    NSString *sdkName = event.sdk[@"name"];

    // If the event is from react native, it gets set there and we do not handle
    // it here.
    if ([sdkName isEqualToString:@"sentry.cocoa"]) {
      [self setEventEnvironmentTag:event origin:@"ios" environment:@"native"];
    }
  }
}

- (void)setEventEnvironmentTag:(SentryEvent *)event
                        origin:(NSString *)origin
                   environment:(NSString *)environment {
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

RCT_EXPORT_METHOD(fetchNativeSdkInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    resolve(@{
        @"name": PrivateSentrySDKOnly.getSdkName,
        @"version": PrivateSentrySDKOnly.getSdkVersionString
            });
}

RCT_EXPORT_METHOD(fetchNativeDeviceContexts:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"Bridge call to: deviceContexts");
    NSMutableDictionary<NSString *, id> *contexts = [NSMutableDictionary new];
    // Temp work around until sorted out this API in sentry-cocoa.
    // TODO: If the callback isnt' executed the promise wouldn't be resolved.
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        NSDictionary<NSString *, id> *serializedScope = [scope serialize];
        // Scope serializes as 'context' instead of 'contexts' as it does for the event.
        NSDictionary<NSString *, id> *tempContexts = [serializedScope valueForKey:@"context"];

        NSMutableDictionary<NSString *, id> *user = [NSMutableDictionary new];

        NSDictionary<NSString *, id> *tempUser = [serializedScope valueForKey:@"user"];
        if (tempUser != nil) {
            [user addEntriesFromDictionary:[tempUser valueForKey:@"user"]];
        } else {
            [user setValue:PrivateSentrySDKOnly.installationID forKey:@"id"];
        }
        [contexts setValue:user forKey:@"user"];

        if (tempContexts != nil) {
            [contexts setValue:tempContexts forKey:@"context"];
        }
        if (PrivateSentrySDKOnly.options.debug) {
            NSData *data = [NSJSONSerialization dataWithJSONObject:contexts options:0 error:nil];
            NSString *debugContext = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            NSLog(@"Contexts: %@", debugContext);
        }
    }];
    resolve(contexts);
}

RCT_EXPORT_METHOD(fetchNativeAppStart:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{

    SentryAppStartMeasurement *appStartMeasurement = PrivateSentrySDKOnly.appStartMeasurement;

    if (appStartMeasurement == nil) {
        resolve(nil);
    } else {
        BOOL isColdStart = appStartMeasurement.type == SentryAppStartTypeCold;

        resolve(@{
            @"isColdStart": [NSNumber numberWithBool:isColdStart],
            @"appStartTime": [NSNumber numberWithDouble:(appStartMeasurement.appStartTimestamp.timeIntervalSince1970 * 1000)],
            @"didFetchAppStart": [NSNumber numberWithBool:didFetchAppStart],
                });

    }

    // This is always set to true, as we would only allow an app start fetch to only happen once
    // in the case of a JS bundle reload, we do not want it to be instrumented again.
    didFetchAppStart = true;
}

RCT_EXPORT_METHOD(fetchNativeFrames:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    if (PrivateSentrySDKOnly.isFramesTrackingRunning) {
        SentryScreenFrames *frames = PrivateSentrySDKOnly.currentScreenFrames;

        if (frames == nil) {
            resolve(nil);
            return;
        }

        NSNumber *total = [NSNumber numberWithLong:frames.total];
        NSNumber *frozen = [NSNumber numberWithLong:frames.frozen];
        NSNumber *slow = [NSNumber numberWithLong:frames.slow];
        NSNumber *zero = [NSNumber numberWithLong:0L];

        if ([total isEqualToNumber:zero] && [frozen isEqualToNumber:zero] && [slow isEqualToNumber:zero]) {
            resolve(nil);
            return;
        }

        resolve(@{
            @"totalFrames": total,
            @"frozenFrames": frozen,
            @"slowFrames": slow,
        });
    } else {
      resolve(nil);
    }
#else
    resolve(nil);
#endif
}

RCT_EXPORT_METHOD(fetchNativeRelease:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSDictionary *infoDict = [[NSBundle mainBundle] infoDictionary];
    resolve(@{
              @"id": infoDict[@"CFBundleIdentifier"],
              @"version": infoDict[@"CFBundleShortVersionString"],
              @"build": infoDict[@"CFBundleVersion"],
              });
}

RCT_EXPORT_METHOD(captureEnvelope:(NSArray * _Nonnull)bytes
                  options: (NSDictionary * _Nonnull)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSMutableData *data = [[NSMutableData alloc] initWithCapacity: [bytes count]];
    for(NSNumber *number in bytes) {
        char byte = [number charValue];
        [data appendBytes: &byte length: 1];
    }

    SentryEnvelope *envelope = [PrivateSentrySDKOnly envelopeWithData:data];
    if (envelope == nil) {
        reject(@"SentryReactNative",@"Failed to parse envelope from byte array.", nil);
        return;
    }

    #if DEBUG
        [PrivateSentrySDKOnly captureEnvelope:envelope];
    #else
        if (options[@'store']) {
            // Storing to disk happens asynchronously with captureEnvelope
            [PrivateSentrySDKOnly storeEnvelope:envelope];
        } else {
            [PrivateSentrySDKOnly captureEnvelope:envelope];
        }
    #endif
    resolve(@YES);
}

RCT_EXPORT_METHOD(setUser:(NSDictionary *)userKeys
                  otherUserKeys:(NSDictionary *)userDataKeys
)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        if (nil == userKeys && nil == userDataKeys) {
            [scope setUser:nil];
        } else {
            SentryUser* userInstance = [[SentryUser alloc] init];

            if (nil != userKeys) {
                [userInstance setUserId:userKeys[@"id"]];
                [userInstance setIpAddress:userKeys[@"ip_address"]];
                [userInstance setEmail:userKeys[@"email"]];
                [userInstance setUsername:userKeys[@"username"]];
                [userInstance setSegment:userKeys[@"segment"]];
            }

            if (nil != userDataKeys) {
                [userInstance setData:userDataKeys];
            }

            [scope setUser:userInstance];
        }
    }];
}

RCT_EXPORT_METHOD(addBreadcrumb:(NSDictionary *)breadcrumb)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        SentryBreadcrumb* breadcrumbInstance = [[SentryBreadcrumb alloc] init];

        NSString * levelString = breadcrumb[@"level"];
        SentryLevel sentryLevel;
        if ([levelString isEqualToString:@"fatal"]) {
            sentryLevel = kSentryLevelFatal;
        } else if ([levelString isEqualToString:@"warning"]) {
            sentryLevel = kSentryLevelWarning;
        } else if ([levelString isEqualToString:@"info"]) {
            sentryLevel = kSentryLevelInfo;
        } else if ([levelString isEqualToString:@"debug"]) {
            sentryLevel = kSentryLevelDebug;
        } else {
            sentryLevel = kSentryLevelError;
        }
        [breadcrumbInstance setLevel:sentryLevel];

        [breadcrumbInstance setCategory:breadcrumb[@"category"]];

        [breadcrumbInstance setType:breadcrumb[@"type"]];

        [breadcrumbInstance setMessage:breadcrumb[@"message"]];

        [breadcrumbInstance setData:breadcrumb[@"data"]];

        [scope addBreadcrumb:breadcrumbInstance];
    }];
}

RCT_EXPORT_METHOD(clearBreadcrumbs) {
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        [scope clearBreadcrumbs];
    }];
}

RCT_EXPORT_METHOD(setExtra:(NSString *)key
                  extra:(NSString *)extra
)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        [scope setExtraValue:extra forKey:key];
    }];
}

RCT_EXPORT_METHOD(setContext:(NSString *)key
                  context:(NSDictionary *)context
)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        [scope setContextValue:context forKey:key];
    }];
}

RCT_EXPORT_METHOD(setTag:(NSString *)key
                  value:(NSString *)value
)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        [scope setTagValue:value forKey:key];
    }];
}

RCT_EXPORT_METHOD(crash)
{
    [SentrySDK crash];
}

RCT_EXPORT_METHOD(closeNativeSdk:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [SentrySDK close];
  resolve(@YES);
}

RCT_EXPORT_METHOD(disableNativeFramesTracking)
{
    // Do nothing on iOS, this bridge method only has an effect on android.
}

RCT_EXPORT_METHOD(enableNativeFramesTracking)
{
    // Do nothing on iOS, this bridge method only has an effect on android.
    // If you're starting the Cocoa SDK manually,
    // you can set the 'enableAutoPerformanceTracking: true' option and
    // the 'tracesSampleRate' or 'tracesSampler' option.
}

@end

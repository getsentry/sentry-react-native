#import "RNSentry.h"

#if __has_include(<React/RCTConvert.h>)
#import <React/RCTConvert.h>
#else
#import "RCTConvert.h"
#endif

#import <Sentry/Sentry.h>

@interface RNSentry()

@end


@implementation RNSentry

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

RCT_EXPORT_MODULE()

- (NSDictionary<NSString *, id> *)constantsToExport
{
    return @{@"nativeClientAvailable": @YES, @"nativeTransport": @YES};
}

RCT_EXPORT_METHOD(crashedLastLaunch:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSNumber *crashedLastLaunch = @NO;
    if (SentryClient.sharedClient && [SentryClient.sharedClient crashedLastLaunch]) {
        crashedLastLaunch = @YES;
    }
    resolve(crashedLastLaunch);
}

RCT_EXPORT_METHOD(startWithDsnString:(NSString * _Nonnull)dsnString
                  options:(NSDictionary *_Nonnull)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSError *error = nil;
    SentryClient *client = [[SentryClient alloc] initWithDsn:dsnString didFailWithError:&error];
    client.shouldSendEvent = ^BOOL(SentryEvent * _Nonnull event) {
        // We don't want to send an event after startup that came from a Unhandled JS Exception of react native
        // Because we sent it already before the app crashed.
        if (nil != event.exceptions.firstObject.type &&
            [event.exceptions.firstObject.type rangeOfString:@"Unhandled JS Exception"].location != NSNotFound) {
            NSLog(@"Unhandled JS Exception");
            return NO;
        }
        return YES;
    };
    [SentryClient setSharedClient:client];
    if ([[options objectForKey:@"enableNativeCrashHandling"] boolValue]) {
        [SentryClient.sharedClient startCrashHandlerWithError:&error];
    }
    if (nil != [options objectForKey:@"environment"]) {
        SentryClient.sharedClient.environment = [NSString stringWithFormat:@"%@", [options objectForKey:@"environment"]];
    }
    if (nil != [options objectForKey:@"release"]) {
        SentryClient.sharedClient.releaseName = [NSString stringWithFormat:@"%@", [options objectForKey:@"release"]];
    }
    if (nil != [options objectForKey:@"dist"]) {
        SentryClient.sharedClient.dist = [NSString stringWithFormat:@"%@", [options objectForKey:@"dist"]];
    }
    if (error) {
        reject(@"SentryReactNative", error.localizedDescription, error);
        return;
    }
    resolve(@YES);
}

RCT_EXPORT_METHOD(deviceContexts:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    resolve([[[SentryContext alloc] init] serialize]);
}

RCT_EXPORT_METHOD(fetchRelease:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSDictionary *infoDict = [[NSBundle mainBundle] infoDictionary];
    resolve(@{
              @"id": infoDict[@"CFBundleIdentifier"],
              @"version": infoDict[@"CFBundleShortVersionString"],
              @"build": infoDict[@"CFBundleVersion"],
              });
}


RCT_EXPORT_METHOD(setLogLevel:(int)level)
{
    [SentryClient setLogLevel:[SentryJavaScriptBridgeHelper sentryLogLevelFromJavaScriptLevel:level]];
}

RCT_EXPORT_METHOD(sendEvent:(NSDictionary * _Nonnull)event
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0ul), ^{
        if ([NSJSONSerialization isValidJSONObject:event]) {
            NSData *jsonData = [NSJSONSerialization dataWithJSONObject:event
                                                               options:0
                                                                 error:nil];

            SentryEvent *sentryEvent = [[SentryEvent alloc] initWithJSON:jsonData];
            [SentryClient.sharedClient sendEvent:sentryEvent withCompletionHandler:^(NSError * _Nullable error) {
                if (nil != error) {
                    reject(@"SentryReactNative", error.localizedDescription, error);
                } else {
                    resolve(@YES);
                }
            }];
        } else {
            reject(@"SentryReactNative", @"Cannot serialize event", nil);
        }
    });
}

RCT_EXPORT_METHOD(crash)
{
    [SentryClient.sharedClient crash];
}

RCT_EXPORT_METHOD(extraUpdated:(NSDictionary * _Nonnull)extra)
{
    if (nil != [extra objectForKey:@"__sentry_release"]) {
        SentryClient.sharedClient.releaseName = [extra objectForKey:@"__sentry_release"];
    }
    if (nil != [extra objectForKey:@"__sentry_dist"]) {
        SentryClient.sharedClient.dist = [extra objectForKey:@"__sentry_dist"];
    }
}

@end

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

RCT_EXPORT_METHOD(startWithOptions:(NSDictionary *_Nonnull)options
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

        // set the event.origin tag to be ios if the event originated from the sentry-cocoa sdk.
        if (event.sdk && [event.sdk[@"name"] isEqualToString:@"sentry.cocoa"]) {
            NSMutableDictionary *newTags = [NSMutableDictionary new];
            [newTags addEntriesFromDictionary:event.tags];
            [newTags setValue:@"ios" forKey:@"event.origin"];
            event.tags = newTags;
        }

        return event;
    };

    [options setValue:beforeSend forKey:@"beforeSend"];

    SentryOptions *sentryOptions = [[SentryOptions alloc] initWithDict:options didFailWithError:&error];
    if (error) {
        reject(@"SentryReactNative", error.localizedDescription, error);
        return;
    }
    [SentrySDK startWithOptionsObject:sentryOptions];

    resolve(@YES);
}

RCT_EXPORT_METHOD(deviceContexts:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"Bridge call to: deviceContexts");
    // Temp work around until sorted out this API in sentry-cocoa.
    // TODO: If the callback isnt' executed the promise wouldn't be resolved.
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        NSDictionary<NSString *, id> *serializedScope = [scope serialize];
        // Scope serializes as 'context' instead of 'contexts' as it does for the event.
        NSDictionary<NSString *, id> *contexts = [serializedScope valueForKey:@"context"];
#if DEBUG
        NSData *data = [NSJSONSerialization dataWithJSONObject:contexts options:0 error:nil];
        NSString *debugContext = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        NSLog(@"Contexts: %@", debugContext);
#endif
        resolve(contexts);
    }];
}

RCT_EXPORT_METHOD(setLogLevel:(int)level)
{
    SentryLogLevel cocoaLevel;
    switch (level) {
        case 1:
            cocoaLevel = kSentryLogLevelError;
        case 2:
            cocoaLevel = kSentryLogLevelDebug;
        case 3:
            cocoaLevel = kSentryLogLevelVerbose;
        default:
            cocoaLevel = kSentryLogLevelNone;
    }
    [SentrySDK setLogLevel:cocoaLevel];
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

RCT_EXPORT_METHOD(sendEvent:(NSDictionary * _Nonnull)event
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0ul), ^{
        if ([NSJSONSerialization isValidJSONObject:event]) {
            NSData *jsonData = [NSJSONSerialization dataWithJSONObject:event
                                                               options:0
                                                                 error:nil];
            [SentrySDK captureEvent:[[SentryEvent alloc] initWithJSON:jsonData]];
            resolve(@YES);
        } else {
            reject(@"SentryReactNative", @"Cannot serialize event", nil);
        }
    });
}

RCT_EXPORT_METHOD(crash)
{
    [SentrySDK crash];
}

@end

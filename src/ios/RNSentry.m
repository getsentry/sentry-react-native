#import "RNSentry.h"
#import "RNSentryEventEmitter.h"
#if __has_include(<React/RCTConvert.h>)
#import <React/RCTConvert.h>
#else
#import "RCTConvert.h"
#endif

#import <Sentry/Sentry.h>

NSString *const RNSentryVersionString = @"0.42.0";
NSString *const RNSentrySdkName = @"sentry.javascript.react-native";

@interface RNSentry()

@property (nonatomic, strong) NSMutableDictionary *moduleMapping;

@end


@implementation RNSentry

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

+ (void)installWithBridge:(RCTBridge *)bridge {
    // For now we don't need this anymore
}

+ (void)installWithRootView:(RCTRootView *)rootView {
    // For now we don't need this anymore
}

- (NSInteger)indexOfReactNativeCallFrame:(NSArray<SentryFrame *> *)frames nativeCallAddress:(NSUInteger)nativeCallAddress {
    NSInteger smallestDiff = NSIntegerMax;
    NSInteger index = -1;
    NSUInteger counter = 0;
    for (SentryFrame *frame in frames) {
        NSUInteger instructionAddress;
        // We skip js frames because they don't have an instructionAddress
        if (frame.instructionAddress == nil) {
            continue;
        }
        [[NSScanner scannerWithString:frame.instructionAddress] scanHexLongLong:&instructionAddress];
        if (instructionAddress < nativeCallAddress) {
            continue;
        }
        NSInteger diff = instructionAddress - nativeCallAddress;
        if (diff < smallestDiff) {
            smallestDiff = diff;
            index = counter;
        }
        counter++;
    }
    if (index > -1) {
        return index + 1;
    }
    return index;
}

- (void)injectReactNativeFrames:(SentryEvent *)event {
    NSString *address = [[NSUserDefaults standardUserDefaults] objectForKey:@"RNSentry.__sentry_address"];
    if (nil == address) {
        // We bail out here since __sentry_address is not set
        return;
    }
    SentryThread *crashedThread = [event.exceptions objectAtIndex:0].thread;
    NSArray<SentryFrame *> *frames = crashedThread.stacktrace.frames;
    NSInteger indexOfReactFrames = [self indexOfReactNativeCallFrame:frames
                                                   nativeCallAddress:[address integerValue]];
    if (indexOfReactFrames == -1) {
        return;
    }

    NSMutableArray<SentryFrame *> *finalFrames = [NSMutableArray new];

    NSString *stacktrace = [[NSUserDefaults standardUserDefaults] objectForKey:@"RNSentry.__sentry_stack"];
    NSArray<SentryFrame *> *reactFrames = [SentryJavaScriptBridgeHelper convertReactNativeStacktrace:[SentryJavaScriptBridgeHelper parseJavaScriptStacktrace:stacktrace]];
    for (NSInteger i = 0; i < frames.count; i++) {
        [finalFrames addObject:[frames objectAtIndex:i]];
        if (i == indexOfReactFrames) {
            [finalFrames addObjectsFromArray:reactFrames];
        }
    }

    crashedThread.stacktrace.frames = finalFrames;
}

- (void)setReleaseVersionDist:(SentryEvent *)event {
    if (event.extra[@"__sentry_version"]) {
        NSDictionary *infoDict = [[NSBundle mainBundle] infoDictionary];
        event.releaseName = [NSString stringWithFormat:@"%@-%@", infoDict[@"CFBundleIdentifier"], event.extra[@"__sentry_version"]];
    }
    if (event.extra[@"__sentry_release"]) {
        event.releaseName = [NSString stringWithFormat:@"%@", event.extra[@"__sentry_release"]];
    }
    if (event.extra[@"__sentry_dist"]) {
        event.dist = [NSString stringWithFormat:@"%@", event.extra[@"__sentry_dist"]];
    }
    event.sdk = @{@"name": RNSentrySdkName,
                  @"version": RNSentryVersionString,
                  @"integrations": @[@"sentry-cocoa"]};
}

RCT_EXPORT_MODULE()

- (NSDictionary<NSString *, id> *)constantsToExport
{
    return @{@"nativeClientAvailable": @YES};
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
    self.moduleMapping = [[NSMutableDictionary alloc] init];
    SentryClient *client = [[SentryClient alloc] initWithDsn:dsnString didFailWithError:&error];
    client.beforeSerializeEvent = ^(SentryEvent * _Nonnull event) {
        [self injectReactNativeFrames:event];
        [self setReleaseVersionDist:event];
    };
    client.shouldSendEvent = ^BOOL(SentryEvent * _Nonnull event) {
        // We don't want to send an event after startup that came from a Unhandled JS Exception of react native
        // Because we sent it already before the app crashed.
        if (nil != event.exceptions.firstObject.type &&
            [event.exceptions.firstObject.type rangeOfString:@"Unhandled JS Exception"].location != NSNotFound) {
            NSLog(@"Unhandled JS Exception");
            return NO;
        }
        // Since we set shouldSendEvent for react-native we need to duplicate the code for sampling here
        if (nil != options[@"sampleRate"]) {
            return ([options[@"sampleRate"] floatValue] >= ((double)arc4random() / 0x100000000));
        }
        return YES;
    };
    [SentryClient setSharedClient:client];
    [SentryClient.sharedClient startCrashHandlerWithError:&error];
    if (error) {
        reject(@"SentryReactNative", error.localizedDescription, error);
        return;
    }
    resolve(@YES);
}

RCT_EXPORT_METHOD(activateStacktraceMerging:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    // React Native < 0.45
    if (NSClassFromString(@"RCTBatchedBridge")) {
        [self swizzleCallNativeModule:NSClassFromString(@"RCTBatchedBridge")];
    } else {
        [self swizzleInvokeWithBridge:NSClassFromString(@"RCTModuleMethod")];
    }
    resolve(@YES);
}

- (void)swizzleInvokeWithBridge:(Class)class {
    static const void *key = &key;
    SEL selector = @selector(invokeWithBridge:module:arguments:);
    uintptr_t callNativeModuleAddress = [class instanceMethodForSelector:selector];
    __block RNSentry *_self = self;
    SentrySwizzleInstanceMethod(class,
                                selector,
                                SentrySWReturnType(id),
                                SentrySWArguments(RCTBridge *bridge, id module, NSArray *arguments),
                                SentrySWReplacement({
        // TODO: refactor this block, its used twice
        NSMutableArray *newParams = [NSMutableArray array];
        if (arguments != nil && arguments.count > 0) {
            for (id param in arguments) {
                if ([param isKindOfClass:NSDictionary.class] && param[@"__sentry_stack"]) {
                    [_self.moduleMapping setValue:[NSString stringWithFormat:@"%@", [module class]] forKey:[NSString stringWithFormat:@"%@", param[@"__sentry_moduleID"]]];
                    [RNSentryEventEmitter emitModuleTableUpdate:_self.moduleMapping.mutableCopy];
                    [[NSUserDefaults standardUserDefaults] setObject:[NSString stringWithFormat:@"%lu", callNativeModuleAddress] forKey:@"RNSentry.__sentry_address"];
                    [[NSUserDefaults standardUserDefaults] setObject:[RCTConvert NSString:param[@"__sentry_stack"]] forKey:@"RNSentry.__sentry_stack"];
                    [[NSUserDefaults standardUserDefaults] synchronize];
                } else {
                    if (param != nil) {
                        [newParams addObject:param];
                    }
                }
            }
        }
        return SentrySWCallOriginal(bridge, module, newParams);
    }), SentrySwizzleModeOncePerClassAndSuperclasses, key);
}

- (void)swizzleCallNativeModule:(Class)class {
    static const void *key = &key;
    SEL selctor = @selector(callNativeModule:method:params:);
    uintptr_t callNativeModuleAddress = [class instanceMethodForSelector:selctor];

    SentrySwizzleInstanceMethod(class,
                                selctor,
                                SentrySWReturnType(id),
                                SentrySWArguments(NSUInteger moduleID, NSUInteger methodID, NSArray *params),
                                SentrySWReplacement({
        // TODO: refactor this block, its used twice
        NSMutableArray *newParams = [NSMutableArray array];
        if (params != nil && params.count > 0) {
            for (id param in params) {
                if ([param isKindOfClass:NSDictionary.class] && param[@"__sentry_stack"]) {
                    [[NSUserDefaults standardUserDefaults] setObject:[NSNumber numberWithUnsignedInteger:callNativeModuleAddress] forKey:@"RNSentry.__sentry_address"];
                    [[NSUserDefaults standardUserDefaults] setObject:[RCTConvert NSString:param[@"__sentry_stack"]] forKey:@"RNSentry.__sentry_stack"];
                    [[NSUserDefaults standardUserDefaults] synchronize];
                } else {
                    if (param != nil) {
                        [newParams addObject:param];
                    }
                }
            }
        }
        return SentrySWCallOriginal(moduleID, methodID, newParams);
    }), SentrySwizzleModeOncePerClassAndSuperclasses, key);
}

RCT_EXPORT_METHOD(clearContext)
{
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0ul), ^{
        [SentryClient.sharedClient clearContext];
    });
}

RCT_EXPORT_METHOD(setLogLevel:(int)level)
{
    [SentryClient setLogLevel:[SentryJavaScriptBridgeHelper sentryLogLevelFromJavaScriptLevel:level]];
}

RCT_EXPORT_METHOD(setTags:(NSDictionary *_Nonnull)tags)
{
    SentryClient.sharedClient.tags = [SentryJavaScriptBridgeHelper sanitizeDictionary:tags];
}

RCT_EXPORT_METHOD(setExtra:(NSDictionary *_Nonnull)extra)
{
    SentryClient.sharedClient.extra = extra;
}

RCT_EXPORT_METHOD(addExtra:(NSString *_Nonnull)key value:(id)value)
{
    NSMutableDictionary *prevExtra = SentryClient.sharedClient.extra.mutableCopy;
    [prevExtra setValue:value forKey:key];
    SentryClient.sharedClient.extra = prevExtra;
}

RCT_EXPORT_METHOD(setUser:(NSDictionary *_Nonnull)user)
{
    SentryUser *sentryUser = [SentryJavaScriptBridgeHelper createSentryUserFromJavaScriptUser:user];
    if (sentryUser) {
        SentryClient.sharedClient.user = sentryUser;
    }
}

RCT_EXPORT_METHOD(captureBreadcrumb:(NSDictionary * _Nonnull)breadcrumb)
{
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0ul), ^{
        [SentryClient.sharedClient.breadcrumbs addBreadcrumb:[SentryJavaScriptBridgeHelper createSentryBreadcrumbFromJavaScriptBreadcrumb:breadcrumb]];
    });
}

RCT_EXPORT_METHOD(captureEvent:(NSDictionary * _Nonnull)event)
{
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0ul), ^{
        SentryEvent *sentryEvent = [SentryJavaScriptBridgeHelper createSentryEventFromJavaScriptEvent:event];
        if (sentryEvent.exceptions) {
#if DEBUG
            // We want to send the exception instead of storing it because in debug
            // the app does not crash it will restart
            [SentryClient.sharedClient sendEvent:sentryEvent withCompletionHandler:NULL];
#else
            [SentryClient.sharedClient storeEvent:sentryEvent];
#endif
        } else {
            [SentryClient.sharedClient sendEvent:sentryEvent withCompletionHandler:NULL];
        }
        [RNSentryEventEmitter emitStoredEvent];
    });
}


RCT_EXPORT_METHOD(crash)
{
    [SentryClient.sharedClient crash];
}

@end

#import "RNSentry.h"
#import "RNSentryEventEmitter.h"
#if __has_include(<React/RCTConvert.h>)
#import <React/RCTConvert.h>
#else
#import "RCTConvert.h"
#endif

#import <KSCrash/KSCrash.h>
#import <Sentry/Sentry.h>

@interface RNSentry()

@property (nonatomic, strong) NSDictionary *lastReceivedException;

@end

@implementation RNSentry

- (dispatch_queue_t)methodQueue
{
    return dispatch_queue_create("io.sentry.RNSentry", DISPATCH_QUEUE_SERIAL);
}

+ (void)installWithBridge:(RCTBridge *)bridge {
    // For now we don't need this anymore
}

+ (void)installWithRootView:(RCTRootView *)rootView {
    // For now we don't need this anymore
}

+ (NSNumberFormatter *)numberFormatter {
    static dispatch_once_t onceToken;
    static NSNumberFormatter *formatter = nil;
    dispatch_once(&onceToken, ^{
        formatter = [NSNumberFormatter new];
        formatter.numberStyle = NSNumberFormatterNoStyle;
    });
    return formatter;
}

+ (NSRegularExpression *)frameRegex {
    static dispatch_once_t onceTokenRegex;
    static NSRegularExpression *regex = nil;
    dispatch_once(&onceTokenRegex, ^{
        //        NSString *pattern = @"at (.+?) \\((?:(.+?):([0-9]+?):([0-9]+?))\\)"; // Regex with debugger
        NSString *pattern = @"(?:([^@]+)@(.+?):([0-9]+?):([0-9]+))"; // Regex without debugger
        regex = [NSRegularExpression regularExpressionWithPattern:pattern options:0 error:nil];
    });
    return regex;
}

NSArray *SentryParseJavaScriptStacktrace(NSString *stacktrace) {
    NSNumberFormatter *formatter = [RNSentry numberFormatter];
    NSArray *lines = [stacktrace componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
    NSMutableArray *frames = [NSMutableArray array];
    for (NSString *line in lines) {
        NSRange searchedRange = NSMakeRange(0, [line length]);
        NSArray *matches = [[RNSentry frameRegex] matchesInString:line options:0 range:searchedRange];
        for (NSTextCheckingResult *match in matches) {
            [frames addObject:@{
                                @"methodName": [line substringWithRange:[match rangeAtIndex:1]],
                                @"column": [formatter numberFromString:[line substringWithRange:[match rangeAtIndex:4]]],
                                @"lineNumber": [formatter numberFromString:[line substringWithRange:[match rangeAtIndex:3]]],
                                @"file": [line substringWithRange:[match rangeAtIndex:2]]
                                }];
        }
    }
    return frames;
}

NSArray *SentryParseRavenFrames(NSArray *ravenFrames) {
    NSNumberFormatter *formatter = [RNSentry numberFormatter];
    NSMutableArray *frames = [NSMutableArray array];
    for (NSDictionary *ravenFrame in ravenFrames) {
        if (ravenFrame[@"lineno"] != NSNull.null) {
            [frames addObject:@{
                                @"methodName": ravenFrame[@"function"],
                                @"column": [formatter numberFromString:[NSString stringWithFormat:@"%@", ravenFrame[@"colno"]]],
                                @"lineNumber": [formatter numberFromString:[NSString stringWithFormat:@"%@", ravenFrame[@"lineno"]]],
                                @"file": ravenFrame[@"filename"]
                                }];
        }
    }
    return frames;
}

- (NSInteger)indexOfReactNativeCallFrame:(NSArray<SentryFrame *> *)frames nativeCallAddress:(NSUInteger)nativeCallAddress {
    NSInteger smallestDiff = NSIntegerMax;
    NSInteger index = -1;
    NSUInteger counter = 0;
    for (SentryFrame *frame in frames) {
        NSUInteger instructionAddress;
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

- (NSArray<SentryFrame *> *)convertReactNativeStacktrace:(NSArray *)stacktrace {
    NSMutableArray<SentryFrame *> *frames = [NSMutableArray new];
    for (NSDictionary *frame in stacktrace) {
        if (nil == frame[@"methodName"]) {
            continue;
        }
        NSString *simpleFilename = [[[frame[@"file"] lastPathComponent] componentsSeparatedByString:@"?"] firstObject];
        SentryFrame *sentryFrame = [[SentryFrame alloc] init];
        sentryFrame.fileName = [NSString stringWithFormat:@"app:///%@", simpleFilename];
        sentryFrame.function = frame[@"methodName"];
        if (nil != frame[@"lineNumber"]) {
            sentryFrame.lineNumber = frame[@"lineNumber"];
        }
        if (nil != frame[@"column"]) {
            sentryFrame.columnNumber = frame[@"column"];
        }
        sentryFrame.platform = @"javascript";
        [frames addObject:sentryFrame];
    }
    return [frames reverseObjectEnumerator].allObjects;
}

- (void)injectReactNativeFrames:(SentryEvent *)event {
    NSString *address = [event.extra valueForKey:@"__sentry_address"];
    if (nil == address) {
        // We bail out here since __sentry_address is not set
        return;
    }
    SentryThread *crashedThread = nil;
    for (SentryThread *thread in event.threads) {
        if ([thread.crashed boolValue]) {
            crashedThread = thread;
            break;
        }
    }
    NSArray<SentryFrame *> *frames = crashedThread.stacktrace.frames;
    NSInteger indexOfReactFrames = [self indexOfReactNativeCallFrame:frames
                                                   nativeCallAddress:[address integerValue]];
    if (indexOfReactFrames == -1) {
        return;
    }

    NSMutableArray<SentryFrame *> *finalFrames = [NSMutableArray new];

    NSArray<SentryFrame *> *reactFrames = [self convertReactNativeStacktrace:SentryParseJavaScriptStacktrace(event.extra[@"__sentry_stack"])];
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
    NSMutableDictionary *prevExtra = SentryClient.sharedClient.extra.mutableCopy;
    [prevExtra setValue:@[@"react-native"] forKey:@"__sentry_sdk_integrations"];
    SentryClient.sharedClient.extra = prevExtra;
}

RCT_EXPORT_MODULE()

- (NSDictionary<NSString *, id> *)constantsToExport
{
    return @{@"nativeClientAvailable": @YES};
}

RCT_EXPORT_METHOD(startWithDsnString:(NSString * _Nonnull)dsnString)
{
    static dispatch_once_t onceStartToken;
    dispatch_once(&onceStartToken, ^{
        NSError *error = nil;
        SentryClient *client = [[SentryClient alloc] initWithDsn:dsnString didFailWithError:&error];
        [SentryClient setSharedClient:client];
        [SentryClient.sharedClient startCrashHandlerWithError:&error];
        if (error) {
            [NSException raise:@"SentryReactNative" format:@"%@", error.localizedDescription];
        }
        SentryClient.sharedClient.shouldSendEvent = ^BOOL(SentryEvent * _Nonnull event) {
            // We don't want to send an event after startup that came from a NSException of react native
            // Because we sent it already before the app crashed.
            if (nil != event.exceptions.firstObject.type &&
                [event.exceptions.firstObject.type rangeOfString:@"RCTFatalException"].location != NSNotFound) {
                NSLog(@"RCTFatalException");
                return NO;
            }
            return YES;
        };
        SentryClient.sharedClient.beforeSerializeEvent = ^(SentryEvent * _Nonnull event) {
            [self injectReactNativeFrames:event];
            [self setReleaseVersionDist:event];
        };
    });
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
                    @synchronized (SentryClient.sharedClient) {
                        NSMutableDictionary *prevExtra = SentryClient.sharedClient.extra.mutableCopy;
                        [prevExtra setValue:[NSNumber numberWithUnsignedInteger:callNativeModuleAddress] forKey:@"__sentry_address"];
                        [prevExtra setValue:[RCTConvert NSString:param[@"__sentry_stack"]] forKey:@"__sentry_stack"];
                        SentryClient.sharedClient.extra = prevExtra;
                    }
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
                    @synchronized (SentryClient.sharedClient) {
                        NSMutableDictionary *prevExtra = SentryClient.sharedClient.extra.mutableCopy;
                        [prevExtra setValue:[NSNumber numberWithUnsignedInteger:callNativeModuleAddress] forKey:@"__sentry_address"];
                        [prevExtra setValue:[RCTConvert NSString:param[@"__sentry_stack"]] forKey:@"__sentry_stack"];
                        SentryClient.sharedClient.extra = prevExtra;
                    }
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
    [SentryClient.sharedClient clearContext];
}

RCT_EXPORT_METHOD(setLogLevel:(int)level)
{
    [SentryClient setLogLevel:[self sentryLogLevelFromLevel:level]];
}

RCT_EXPORT_METHOD(setTags:(NSDictionary *_Nonnull)tags)
{
    SentryClient.sharedClient.tags = [self sanitizeDictionary:tags];
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
    SentryClient.sharedClient.user = [self createUser:user];
}

RCT_EXPORT_METHOD(captureBreadcrumb:(NSDictionary * _Nonnull)breadcrumb)
{
    SentryBreadcrumb *crumb = [[SentryBreadcrumb alloc] initWithLevel:[self sentrySeverityFromLevel:breadcrumb[@"level"]]
                                                             category:breadcrumb[@"category"]];
    crumb.message = breadcrumb[@"message"];
    crumb.timestamp = [NSDate dateWithTimeIntervalSince1970:[breadcrumb[@"timestamp"] integerValue]];
    crumb.type = breadcrumb[@"type"];
    crumb.data = [RCTConvert NSDictionary:breadcrumb[@"data"]];
    [SentryClient.sharedClient.breadcrumbs addBreadcrumb:crumb];
}

RCT_EXPORT_METHOD(captureEvent:(NSDictionary * _Nonnull)event)
{
    SentrySeverity level = [self sentrySeverityFromLevel:event[@"level"]];

    SentryEvent *sentryEvent = [[SentryEvent alloc] initWithLevel:level];
    sentryEvent.eventId = event[@"event_id"];
    sentryEvent.message = event[@"message"];
    sentryEvent.logger = event[@"logger"];
    sentryEvent.tags = [self sanitizeDictionary:event[@"tags"]];
    sentryEvent.extra = event[@"extra"];
    sentryEvent.user = [self createUser:event[@"user"]];
    if (event[@"exception"]) {
        NSDictionary *exception = event[@"exception"][@"values"][0];
        NSMutableArray *frames = [NSMutableArray array];
        NSArray<SentryFrame *> *stacktrace = [self convertReactNativeStacktrace:SentryParseRavenFrames(exception[@"stacktrace"][@"frames"])];
        for (NSInteger i = (stacktrace.count-1); i >= 0; i--) {
            [frames addObject:[stacktrace objectAtIndex:i]];
        }
        [self addExceptionToEvent:sentryEvent type:exception[@"type"] value:exception[@"value"] frames:frames];
    }
    [SentryClient.sharedClient sendEvent:sentryEvent withCompletionHandler:NULL];
}

- (void)addExceptionToEvent:(SentryEvent *)event type:(NSString *)type value:(NSString *)value frames:(NSArray *)frames {
    SentryException *sentryException = [[SentryException alloc] initWithValue:value type:type];
    SentryThread *thread = [[SentryThread alloc] initWithThreadId:@(99)];
    thread.crashed = @(YES);
    thread.stacktrace = [[SentryStacktrace alloc] initWithFrames:frames registers:@{}];
    sentryException.thread = thread;
    event.exceptions = @[sentryException];
}

- (SentryUser *_Nullable)createUser:(NSDictionary *_Nonnull)user {
    NSString *userId = nil;
    if (nil != user[@"userID"]) {
        userId = [NSString stringWithFormat:@"%@", user[@"userID"]];
    } else if (nil != user[@"userId"]) {
        userId = [NSString stringWithFormat:@"%@", user[@"userId"]];
    } else if (nil != user[@"id"]) {
        userId = [NSString stringWithFormat:@"%@", user[@"id"]];
    }
    SentryUser *sentryUser = nil;
    if (nil != userId) {
        sentryUser = [[SentryUser alloc] initWithUserId:userId];
        sentryUser.email = [NSString stringWithFormat:@"%@", user[@"email"]];
        sentryUser.username = [NSString stringWithFormat:@"%@", user[@"username"]];
        sentryUser.extra = [RCTConvert NSDictionary:user[@"extra"]];
    }
    return sentryUser;
}

RCT_EXPORT_METHOD(crash)
{
    [SentryClient.sharedClient crash];
}

- (SentrySeverity)sentrySeverityFromLevel:(NSString *)level {
    if ([level isEqualToString:@"fatal"]) {
        return kSentrySeverityFatal;
    } else if ([level isEqualToString:@"warning"]) {
        return kSentrySeverityWarning;
    } else if ([level isEqualToString:@"info"]) {
        return kSentrySeverityInfo;
    } else if ([level isEqualToString:@"debug"]) {
        return kSentrySeverityDebug;
    } else if ([level isEqualToString:@"error"]) {
        return kSentrySeverityError;
    }
    return kSentrySeverityFatal;
}

- (SentryLogLevel)sentryLogLevelFromLevel:(int)level {
    switch (level) {
        case 1:
            return kSentryLogLevelError;
        case 2:
            return kSentryLogLevelDebug;
        case 3:
            return kSentryLogLevelVerbose;
        default:
            return kSentryLogLevelNone;
    }
}

- (NSDictionary *)sanitizeDictionary:(NSDictionary *)dictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    for (NSString *key in dictionary.allKeys) {
        [dict setObject:[NSString stringWithFormat:@"%@", [dictionary objectForKey:key]] forKey:key];
    }
    return [NSDictionary dictionaryWithDictionary:dict];
}

@end

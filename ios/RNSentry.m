#import "RNSentry.h"
#import "RNSentryEventEmitter.h"
#import "RSSwizzle.h"
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
    RNSentry *sentry = [bridge moduleForName:@"RNSentry"];
    [[bridge moduleForName:@"ExceptionsManager"] initWithDelegate:sentry];
}

+ (void)installWithRootView:(RCTRootView *)rootView {
    [RNSentry installWithBridge: rootView.bridge];
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

- (NSArray<SentryFrame *> *)convertReactNativeStacktrace:(NSDictionary *)stacktrace {
    NSMutableArray<SentryFrame *> *frames = [NSMutableArray new];
    for (NSDictionary *frame in stacktrace) {
        if (nil == frame[@"methodName"]) {
            continue;
        }
        NSString *simpleFilename = [[[frame[@"file"] lastPathComponent] componentsSeparatedByString:@"?"] firstObject];
        SentryFrame *sentryFrame = [[SentryFrame alloc] init];
        sentryFrame.fileName = [NSString stringWithFormat:@"app:///%@", simpleFilename];
        sentryFrame.function = frame[@"methodName"];
        sentryFrame.lineNumber = frame[@"lineNumber"];
        sentryFrame.columnNumber = frame[@"column"];
        sentryFrame.platform = @"javascript";
        [frames addObject:sentryFrame];
    }
    return [frames reverseObjectEnumerator].allObjects;
}

- (void)injectReactNativeFrames:(SentryEvent *)event {
    NSString *address = event.extra[@"__sentry_address"];
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

    NSArray<SentryFrame *> *reactFrames = [self convertReactNativeStacktrace:event.extra[@"__sentry_stack"]];
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
}

RCT_EXPORT_MODULE()

- (NSDictionary<NSString *, id> *)constantsToExport
{
    return @{@"nativeClientAvailable": @YES};
}

RCT_EXPORT_METHOD(startWithDsnString:(NSString * _Nonnull)dsnString)
{
    NSError *error = nil;
    SentryClient *client = [[SentryClient alloc] initWithDsn:dsnString didFailWithError:&error];
    [SentryClient setSharedClient:client];
    [SentryClient.sharedClient startCrashHandlerWithError:&error];
    if (error) {
        [NSException raise:@"SentryReactNative" format:@"%@", error.localizedDescription];
    }
    SentryClient.sharedClient.beforeSerializeEvent = ^(SentryEvent * _Nonnull event) {
        [self injectReactNativeFrames:event];
        [self setReleaseVersionDist:event];
    };
}

RCT_EXPORT_METHOD(activateStacktraceMerging:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    static const void *key = &key;
    Class RCTBatchedBridge = NSClassFromString(@"RCTBatchedBridge");
    uintptr_t callNativeModuleAddress = [RCTBatchedBridge instanceMethodForSelector:@selector(callNativeModule:method:params:)];

    RSSwizzleInstanceMethod(RCTBatchedBridge,
                            @selector(callNativeModule:method:params:),
                            RSSWReturnType(id),
                            RSSWArguments(NSUInteger moduleID, NSUInteger methodID, NSArray *params),
                            RSSWReplacement({
        NSMutableArray *newParams = [NSMutableArray array];
        if (params != nil && params.count > 0) {
            for (id param in params) {
                if ([param isKindOfClass:NSDictionary.class] && param[@"__sentry_stack"]) {
                    @synchronized (SentryClient.sharedClient) {
                        NSMutableDictionary *prevExtra = SentryClient.sharedClient.extra.mutableCopy;
                        [prevExtra setValue:[NSNumber numberWithUnsignedInteger:callNativeModuleAddress] forKey:@"__sentry_address"];
                        [prevExtra setValue:SentryParseJavaScriptStacktrace([RCTConvert NSString:param[@"__sentry_stack"]]) forKey:@"__sentry_stack"];
                        SentryClient.sharedClient.extra = prevExtra;
                    }
                } else {
                    if (param != nil) {
                        [newParams addObject:param];
                    }
                }
            }
        }
        return RSSWCallOriginal(moduleID, methodID, newParams);
    }), RSSwizzleModeOncePerClassAndSuperclasses, key);

    resolve(@YES);
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
    SentryUser *sentryUser = [[SentryUser alloc] initWithUserId:[RCTConvert NSString:user[@"userID"]]];
    sentryUser.email = [RCTConvert NSString:user[@"email"]];
    sentryUser.username = [RCTConvert NSString:user[@"username"]];
    sentryUser.extra = [RCTConvert NSDictionary:user[@"extra"]];
    SentryClient.sharedClient.user = sentryUser;
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

    SentryUser *user = nil;
    if (event[@"user"] != nil) {
        user = [[SentryUser alloc] initWithUserId:[NSString stringWithFormat:@"%@", event[@"user"][@"userID"]]];
        user.email = [NSString stringWithFormat:@"%@", event[@"user"][@"email"]];
        user.username = [NSString stringWithFormat:@"%@", event[@"user"][@"username"]];
        user.extra = [RCTConvert NSDictionary:event[@"user"][@"extra"]];
    }

    if (event[@"message"]) {
        SentryEvent *sentryEvent = [[SentryEvent alloc] initWithLevel:level];
        sentryEvent.eventId = event[@"event_id"];
        sentryEvent.message = event[@"message"];
        sentryEvent.logger = event[@"logger"];
        sentryEvent.tags = [self sanitizeDictionary:event[@"tags"]];
        sentryEvent.extra = event[@"extra"];
        sentryEvent.user = user;
        [SentryClient.sharedClient sendEvent:sentryEvent withCompletionHandler:NULL];
    } else if (event[@"exception"]) {
        self.lastReceivedException = event;
    }

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

- (void)reportReactNativeCrashWithMessage:(NSString *)message stacktrace:(NSArray *)stack terminateProgram:(BOOL)terminateProgram {
    NSString *newMessage = message;
    if (nil != self.lastReceivedException) {
        newMessage = [NSString stringWithFormat:@"%@:%@", self.lastReceivedException[@"exception"][@"values"][0][@"type"], self.lastReceivedException[@"exception"][@"values"][0][@"value"]];
    }
    [SentryClient.sharedClient reportUserException:@"ReactNativeException" reason:newMessage language:@"cocoa" lineOfCode:@"" stackTrace:stack logAllThreads:YES terminateProgram:terminateProgram];
}

#pragma mark RCTExceptionsManagerDelegate

- (void)handleSoftJSExceptionWithMessage:(NSString *)message stack:(NSArray *)stack exceptionId:(NSNumber *)exceptionId {
    [self reportReactNativeCrashWithMessage:message stacktrace:stack terminateProgram:NO];
}

- (void)handleFatalJSExceptionWithMessage:(NSString *)message stack:(NSArray *)stack exceptionId:(NSNumber *)exceptionId {
#ifndef DEBUG
    RCTSetFatalHandler(^(NSError *error) {
        [self reportReactNativeCrashWithMessage:message stacktrace:stack terminateProgram:YES];
    });
#else
    RCTSetFatalHandler(^(NSError *error) {
        [self reportReactNativeCrashWithMessage:message stacktrace:stack terminateProgram:NO];
    });
#endif
}

@end

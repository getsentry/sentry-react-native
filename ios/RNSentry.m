
#import "RNSentry.h"
#import "RCTConvert.h"

@import SentrySwift;

@implementation RNSentry

+ (NSNumberFormatter *)numberFormatter {
    static dispatch_once_t onceToken;
    static NSNumberFormatter *formatter = nil;
    dispatch_once(&onceToken, ^{
        formatter = [NSNumberFormatter new];
        formatter.numberStyle = NSNumberFormatterNoStyle;
    });
    return formatter;
}

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(startWithDsnString:(NSString * _Nonnull)dsnString)
{
    [SentryClient setShared:[[SentryClient alloc] initWithDsnString:[RCTConvert NSString:dsnString]]];
    [[SentryClient shared] startCrashHandler];
}

RCT_EXPORT_METHOD(captureMessage:(NSString * _Nonnull)message level:(int)level)
{
    [[SentryClient shared] captureMessage:[RCTConvert NSString:message] level:level];
}

RCT_EXPORT_METHOD(setLogLevel:(int)level)
{
    [SentryClient setLogLevel:level];
}

RCT_EXPORT_METHOD(setExtras:(NSDictionary * _Nonnull)extras)
{
    [SentryClient shared].extra = [RCTConvert NSDictionary:extras];
}

RCT_EXPORT_METHOD(setTags:(NSDictionary * _Nonnull)tags)
{
    [SentryClient shared].tags = [self sanitizeDictionary:[RCTConvert NSDictionary:tags]];
}

RCT_EXPORT_METHOD(setUser:(NSDictionary * _Nonnull)user)
{
    [SentryClient shared].user = [[SentryUser alloc] initWithId:[RCTConvert NSString:user[@"userID"]]
                                                          email:[RCTConvert NSString:user[@"email"]]
                                                       username:[RCTConvert NSString:user[@"username"]]
                                                          extra:[RCTConvert NSDictionary:user[@"extra"]]];
}

RCT_EXPORT_METHOD(crash)
{
    [[SentryClient shared] crash];
}

RCT_EXPORT_METHOD(captureEvent:(NSDictionary * _Nonnull)event)
{
    [self captureEvent:[RCTConvert NSString:event[@"errorMessage"]]
            stacktrace:SentryParseJavaScriptStacktrace([RCTConvert NSString:event[@"stacktrace"]])];
}

- (void)captureEvent:(NSString *)message stacktrace:(NSArray *)reactStacktrace {
    SentryStacktrace *stacktrace = [SentryStacktrace convertReactNativeStacktrace:reactStacktrace];
    SentryException *exception = [[SentryException alloc] initWithValue:message type:@"type" mechanism:nil module:@""];
    exception.thread = [[SentryThread alloc] initWithId:99 crashed:YES current:YES name:@"React Native" stacktrace:stacktrace reason:message];
    
    SentryEvent *eventToSend = [[SentryEvent alloc] init:message
                                               timestamp:[NSDate date]
                                                   level:SentrySeverityFatal
                                                  logger:nil
                                                 culprit:nil
                                              serverName:nil
                                                 release:nil
                                                    tags:nil
                                                 modules:nil
                                                   extra:nil
                                             fingerprint:nil
                                                    user:nil
                                              exceptions:@[exception]
                                              stacktrace:nil];
    
    [[SentryClient shared] captureEvent:eventToSend];
}

- (NSDictionary *)sanitizeDictionary:(NSDictionary *)dictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    for (NSString *key in dictionary.allKeys) {
        [dict setObject:[NSString stringWithFormat:@"%@", [dictionary objectForKey:key]] forKey:key];
    }
    return [NSDictionary dictionaryWithDictionary:dict];
}

NSArray *SentryParseJavaScriptStacktrace(NSString *stacktrace) {
    NSNumberFormatter *formatter = [RNSentry numberFormatter];
    NSCharacterSet *methodSeparator = [NSCharacterSet characterSetWithCharactersInString:@"@"];
    NSCharacterSet *locationSeparator = [NSCharacterSet characterSetWithCharactersInString:@":"];
    NSArray *lines = [stacktrace componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
    NSMutableArray *frames = [NSMutableArray arrayWithCapacity:lines.count];
    for (NSString *line in lines) {
        NSMutableDictionary *frame = [NSMutableDictionary new];
        NSString *location = line;
        NSRange methodRange = [line rangeOfCharacterFromSet:methodSeparator];
        if (methodRange.location != NSNotFound) {
            frame[@"methodName"] = [line substringToIndex:methodRange.location];
            location = [line substringFromIndex:methodRange.location + 1];
        }
        NSRange search = [location rangeOfCharacterFromSet:locationSeparator options:NSBackwardsSearch];
        if (search.location != NSNotFound) {
            NSRange matchRange = NSMakeRange(search.location + 1, location.length - search.location - 1);
            NSNumber *value = [formatter numberFromString:[location substringWithRange:matchRange]];
            if (value) {
                frame[@"column"] = value;
                location = [location substringToIndex:search.location];
            }
        }
        search = [location rangeOfCharacterFromSet:locationSeparator options:NSBackwardsSearch];
        if (search.location != NSNotFound) {
            NSRange matchRange = NSMakeRange(search.location + 1, location.length - search.location - 1);
            NSNumber *value = [formatter numberFromString:[location substringWithRange:matchRange]];
            if (value) {
                frame[@"lineNumber"] = value;
                location = [location substringToIndex:search.location];
            }
        }
        NSString *bundlePath = [[NSBundle mainBundle] bundlePath];
        if (bundlePath) {
            search = [location rangeOfString:bundlePath];
            if (search.location != NSNotFound)
            location = [location substringFromIndex:search.location + search.length + 1];
        }
        frame[@"file"] = location;
        [frames addObject:frame];
    }
    return frames;
}

#pragma mark RCTExceptionsManagerDelegate

- (void)handleSoftJSExceptionWithMessage:(NSString *)message stack:(NSArray *)stack exceptionId:(NSNumber *)exceptionId {
    [self captureEvent:message stacktrace:stack];
}

- (void)handleFatalJSExceptionWithMessage:(NSString *)message stack:(NSArray *)stack exceptionId:(NSNumber *)exceptionId {
#ifndef DEBUG
    RCTSetFatalHandler(^(NSError *error){
        [[SentryClient shared] reportReactNativeFatalCrashWithError:error stacktrace:stack];
    });
#endif
}

@end

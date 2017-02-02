
#import "RNSentry.h"
#import <React/RCTConvert.h>

@import Sentry;

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

- (NSDictionary *)sanitizeDictionary:(NSDictionary *)dictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    for (NSString *key in dictionary.allKeys) {
        [dict setObject:[NSString stringWithFormat:@"%@", [dictionary objectForKey:key]] forKey:key];
    }
    return [NSDictionary dictionaryWithDictionary:dict];
}

#pragma mark RCTExceptionsManagerDelegate

- (void)handleSoftJSExceptionWithMessage:(NSString *)message stack:(NSArray *)stack exceptionId:(NSNumber *)exceptionId {
    NSDictionary *userInfo = @{ NSLocalizedDescriptionKey: message };
    NSError *error = [[NSError alloc] initWithDomain:nil code:exceptionId.integerValue userInfo:userInfo];
    [[SentryClient shared] reportReactNativeCrashWithError:error stacktrace:stack terminateProgram:NO];
}

- (void)handleFatalJSExceptionWithMessage:(NSString *)message stack:(NSArray *)stack exceptionId:(NSNumber *)exceptionId {
#ifndef DEBUG
    RCTSetFatalHandler(^(NSError *error){
        [[SentryClient shared] reportReactNativeCrashWithError:error stacktrace:stack terminateProgram:YES];
    });
#else
    RCTSetFatalHandler(^(NSError *error){
        [[SentryClient shared] reportReactNativeCrashWithError:error stacktrace:stack terminateProgram:NO];
    });
#endif
}

@end

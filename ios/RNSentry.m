
#import "RNSentry.h"
@import SentrySwift;

@implementation RNSentry

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}
RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(startWithDsnString:(NSString * _Nonnull)dsnString)
{
    [SentryClient setShared:[[SentryClient alloc] initWithDsnString:dsnString]];
    [[SentryClient shared] startCrashHandler];
}

RCT_EXPORT_METHOD(captureMessage:(NSString * _Nonnull)message level:(int)level)
{
    [[SentryClient shared] captureMessage:message level:level];
}

RCT_EXPORT_METHOD(setLogLevel:(int)level)
{
    [SentryClient setLogLevel:level];
}

RCT_EXPORT_METHOD(setExtras:(NSDictionary *)extras)
{
    [SentryClient shared].extra = extras;
}

RCT_EXPORT_METHOD(setTags:(NSDictionary*)tags)
{
    [SentryClient shared].tags = [self sanitizeDictionary:tags];
}

- (NSDictionary *)sanitizeDictionary:(NSDictionary *)dictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    for (NSString *key in dictionary.allKeys) {
        [dict setObject:[NSString stringWithFormat:@"%@", [dictionary objectForKey:key]] forKey:key];
    }
    return [NSDictionary dictionaryWithDictionary:dict];
}

@end
  
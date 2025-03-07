#import "RNSentryBreadcrumb.h"
@import Sentry;

@implementation RNSentryBreadcrumb

+ (SentryBreadcrumb *)from:(NSDictionary *)dict
{
    SentryBreadcrumb *crumb = [[SentryBreadcrumb alloc] init];

    NSString *levelString = dict[@"level"];
    SentryLevel sentryLevel;
    if ([levelString isEqualToString:@"fatal"]) {
        sentryLevel = kSentryLevelFatal;
    } else if ([levelString isEqualToString:@"warning"]) {
        sentryLevel = kSentryLevelWarning;
    } else if ([levelString isEqualToString:@"error"]) {
        sentryLevel = kSentryLevelError;
    } else if ([levelString isEqualToString:@"debug"]) {
        sentryLevel = kSentryLevelDebug;
    } else {
        sentryLevel = kSentryLevelInfo;
    }

    [crumb setLevel:sentryLevel];
    [crumb setCategory:dict[@"category"]];
    id origin = dict[@"origin"];
    if (origin != nil) {
        [crumb setOrigin:origin];
    } else {
        [crumb setOrigin:@"react-native"];
    }
    [crumb setType:dict[@"type"]];
    [crumb setMessage:dict[@"message"]];
    [crumb setData:dict[@"data"]];

    return crumb;
}

+ (NSString *_Nullable)getCurrentScreenFrom:(NSDictionary<NSString *, id> *_Nonnull)dict
{
    NSString *_Nullable maybeCategory = [dict valueForKey:@"category"];
    if ([maybeCategory isKindOfClass:[NSString class]]
        && ![maybeCategory isEqualToString:@"navigation"]) {
        return nil;
    }

    NSDictionary<NSString *, id> *_Nullable maybeData = [dict valueForKey:@"data"];
    if (![maybeData isKindOfClass:[NSDictionary class]]) {
        return nil;
    }

    NSString *_Nullable maybeCurrentScreen = [maybeData valueForKey:@"to"];
    if (![maybeCurrentScreen isKindOfClass:[NSString class]]) {
        return nil;
    }

    return maybeCurrentScreen;
}

@end

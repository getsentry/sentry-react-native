#import "RNSentryBreadcrumb.h"
@import Sentry;
#import <Sentry/SentryBreadcrumb+Private.h>

@implementation RNSentryBreadcrumb

+ (SentryBreadcrumb *)from:(NSDictionary *)dict
{
    SentryBreadcrumb *crumb = [[SentryBreadcrumb alloc] initWithDictionary:dict];

    if (crumb.timestamp == nil) {
        [crumb setTimestamp:[NSDate date]];
    }
    if (dict[@"level"] == nil) {
        [crumb setLevel:kSentryLevelInfo];
    }
    if (dict[@"origin"] == nil) {
        [crumb setOrigin:@"react-native"];
    }

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

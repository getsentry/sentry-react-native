#import "RNSentryBreadcrumb.h"
@import Sentry;

@implementation RNSentryBreadcrumb

+(SentryBreadcrumb*) from: (NSDictionary *) dict
{
    SentryBreadcrumb* crumb = [[SentryBreadcrumb alloc] init];

    NSString * levelString = dict[@"level"];
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
    [crumb setType:dict[@"type"]];
    [crumb setMessage:dict[@"message"]];
    [crumb setData:dict[@"data"]];

    return crumb;
}

@end

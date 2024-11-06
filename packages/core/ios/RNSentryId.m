#import "RNSentryId.h"
@import Sentry;

@implementation RNSentryId

+ (SentryId *)newId
{
    return [[SentryId alloc] init];
}

@end

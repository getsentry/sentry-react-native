#import "RNSentryReplayQuality.h"
@import Sentry;

@implementation RNSentryReplayQuality

+ (SentryReplayQuality)parseReplayQuality:(NSString *_Nullable)qualityString
{
    if (qualityString == nil) {
        return SentryReplayQualityMedium;
    }

    NSString *lowercaseQuality = [qualityString lowercaseString];

    if ([lowercaseQuality isEqualToString:@"low"]) {
        return SentryReplayQualityLow;
    } else if ([lowercaseQuality isEqualToString:@"medium"]) {
        return SentryReplayQualityMedium;
    } else if ([lowercaseQuality isEqualToString:@"high"]) {
        return SentryReplayQualityHigh;
    } else {
        return SentryReplayQualityMedium;
    }
}

@end

#import "SentryScreenFramesWrapper.h"
@import Sentry;

@implementation SentryScreenFramesWrapper

+ (BOOL)canTrackFrames
{
    return PrivateSentrySDKOnly.currentScreenFrames != nil;
}

+ (NSNumber *)totalFrames
{
    if (![self canTrackFrames]) {
        return nil;
    }
    return [NSNumber numberWithLong:PrivateSentrySDKOnly.currentScreenFrames.total];
}

+ (NSNumber *)frozenFrames
{
    if (![self canTrackFrames]) {
        return nil;
    }
    return [NSNumber numberWithLong:PrivateSentrySDKOnly.currentScreenFrames.frozen];
}

+ (NSNumber *)slowFrames
{
    if (![self canTrackFrames]) {
        return nil;
    }
    return [NSNumber numberWithLong:PrivateSentrySDKOnly.currentScreenFrames.slow];
}

@end

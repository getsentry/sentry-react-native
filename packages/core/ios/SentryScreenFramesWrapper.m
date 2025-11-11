#import "SentryScreenFramesWrapper.h"
@import Sentry;

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST

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

#endif // TARGET_OS_IPHONE || TARGET_OS_MACCATALYST

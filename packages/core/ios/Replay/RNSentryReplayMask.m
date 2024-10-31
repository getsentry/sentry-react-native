#import "RNSentryReplayMask.h"

@implementation RNSentryReplayMaskManager

RCT_EXPORT_MODULE(RNSentryReplayMask)

- (UIView *)view
{
    return [RNSentryReplayMask new];
}

@end

@implementation RNSentryReplayMask

@end

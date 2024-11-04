#import "RNSentryFramesTrackerListener.h"

#if SENTRY_HAS_UIKIT

@implementation RNSentryFramesTrackerListener

- (instancetype)initWithSentryFramesTracker:(SentryFramesTracker *)framesTracker
                            andEventEmitter:(RNSentryEmitNewFrameEvent)emitNewFrameEvent;
{
    self = [super init];
    if (self) {
        _framesTracker = framesTracker;
        _emitNewFrameEvent = [emitNewFrameEvent copy];
    }
    return self;
}

- (void)framesTrackerHasNewFrame:(NSDate *)newFrameDate
{
    [_framesTracker removeListener:self];
    NSNumber *newFrameTimestampInSeconds =
        [NSNumber numberWithDouble:[newFrameDate timeIntervalSince1970]];

    if (_emitNewFrameEvent) {
        _emitNewFrameEvent(newFrameTimestampInSeconds);
    }
}

- (void)startListening
{
    [_framesTracker addListener:self];
}

@end

#endif

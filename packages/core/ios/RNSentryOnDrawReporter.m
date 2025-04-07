#import "RNSentryOnDrawReporter.h"
#import "RNSentryTimeToDisplay.h"

#if SENTRY_HAS_UIKIT

#    import <Sentry/SentryDependencyContainer.h>

@implementation RNSentryOnDrawReporter

RCT_EXPORT_MODULE(RNSentryOnDrawReporter)
RCT_EXPORT_VIEW_PROPERTY(initialDisplay, BOOL)
RCT_EXPORT_VIEW_PROPERTY(fullDisplay, BOOL)
RCT_EXPORT_VIEW_PROPERTY(parentSpanId, NSString)

- (UIView *)view
{
    RNSentryOnDrawReporterView *view = [[RNSentryOnDrawReporterView alloc] init];
    return view;
}

@end

@implementation RNSentryOnDrawReporterView {
    BOOL isListening;
}

- (instancetype)init
{
    self = [super init];
    if (self) {
        _spanIdUsed = NO;
        RNSentryEmitNewFrameEvent emitNewFrameEvent = [self createEmitNewFrameEvent];
        _framesListener = [[RNSentryFramesTrackerListener alloc]
            initWithSentryFramesTracker:[[SentryDependencyContainer sharedInstance] framesTracker]
                        andEventEmitter:emitNewFrameEvent];
    }
    return self;
}

- (RNSentryEmitNewFrameEvent)createEmitNewFrameEvent
{
    return ^(NSNumber *newFrameTimestampInSeconds) {
        self->isListening = NO;

        if (self->_fullDisplay) {
            [RNSentryTimeToDisplay
                putTimeToDisplayFor:[@"ttfd-" stringByAppendingString:self->_parentSpanId]
                              value:newFrameTimestampInSeconds];
            return;
        }

        if (self->_initialDisplay) {
            [RNSentryTimeToDisplay
                putTimeToDisplayFor:[@"ttid-" stringByAppendingString:self->_parentSpanId]
                              value:newFrameTimestampInSeconds];
            return;
        }
    };
}

- (void)didSetProps:(NSArray<NSString *> *)changedProps
{
    if (![_parentSpanId isKindOfClass:[NSString class]]) {
        _previousParentSpanId = nil;
        return;
    }

    if ([_parentSpanId isEqualToString:_previousParentSpanId] && _spanIdUsed) {
        _previousInitialDisplay = _initialDisplay;
        _previousFullDisplay = _fullDisplay;
        return;
    }

    _previousParentSpanId = _parentSpanId;
    _spanIdUsed = NO;

    if (_fullDisplay || _initialDisplay) {
        if (!isListening && !_spanIdUsed) {
            _spanIdUsed = YES;
            isListening = YES;
            [_framesListener startListening];
        }
    }
}

@end

#endif

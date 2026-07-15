#import "RNSentryOnDrawReporter.h"
#import "RNSentryEmitNewFrameEvent.h"
#import "RNSentryFramesTrackerListener.h"
#import "RNSentryTimeToDisplay.h"
@import Sentry;

#if SENTRY_HAS_UIKIT

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
    __weak __typeof__(self) weakSelf = self;
    return ^(NSNumber *newFrameTimestampInSeconds) {
        __strong __typeof__(weakSelf) strongSelf = weakSelf;
        if (strongSelf == nil) {
            return;
        }

        strongSelf->isListening = NO;

        if (![strongSelf->_parentSpanId isKindOfClass:[NSString class]]) {
            return;
        }

        if (strongSelf->_fullDisplay) {
            [RNSentryTimeToDisplay
                putTimeToDisplayFor:[@"ttfd-" stringByAppendingString:strongSelf->_parentSpanId]
                              value:newFrameTimestampInSeconds];
            return;
        }

        if (strongSelf->_initialDisplay) {
            [RNSentryTimeToDisplay
                putTimeToDisplayFor:[@"ttid-" stringByAppendingString:strongSelf->_parentSpanId]
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

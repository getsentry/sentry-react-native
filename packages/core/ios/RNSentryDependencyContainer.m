#import "RNSentryDependencyContainer.h"
#import <Sentry/SentryDependencyContainer.h>

@implementation RNSentryDependencyContainer {
    NSObject *sentryDependencyContainerLock;
}

+ (instancetype)sharedInstance
{
    static RNSentryDependencyContainer *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ instance = [[self alloc] init]; });
    return instance;
}

- (instancetype)init
{
    if (self = [super init]) {
        sentryDependencyContainerLock = [[NSObject alloc] init];
    }
    return self;
}

#if SENTRY_HAS_UIKIT

- (void)initializeFramesTrackerListenerWith:(RNSentryEmitNewFrameEvent)eventEmitter
{
    @synchronized(sentryDependencyContainerLock) {
        _framesTrackerListener = [[RNSentryFramesTrackerListener alloc]
            initWithSentryFramesTracker:[[SentryDependencyContainer sharedInstance] framesTracker]
                        andEventEmitter:eventEmitter];
    }
}

#endif

@end

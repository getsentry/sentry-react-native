#import "RNSentryDependencyContainer.h"
#import <Sentry/SentryDependencyContainer.h>

@implementation RNSentryDependencyContainer

static RNSentryDependencyContainer *instance;
static NSObject *sentryDependencyContainerLock;

+ (void)initialize
{
  if (self == [RNSentryDependencyContainer class]) {
    sentryDependencyContainerLock = [[NSObject alloc] init];
    instance = [[RNSentryDependencyContainer alloc] init];
  }
}

+ (instancetype)sharedInstance
{
  return instance;
}

- (instancetype)init
{
    return self;
}

- (void)initializeFramesTrackerListenerWith:(RNSentryEmitNewFrameEvent)eventEmitter
{
  @synchronized(sentryDependencyContainerLock) {
    _framesTrackerListener = [[RNSentryFramesTrackerListener alloc] initWithSentryFramesTracker:[[SentryDependencyContainer sharedInstance] framesTracker]
                                                                                andEventEmitter: eventEmitter];
  }
}

@end

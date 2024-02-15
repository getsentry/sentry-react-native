#import "RNSentryDependencyContainer.h"

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

@end

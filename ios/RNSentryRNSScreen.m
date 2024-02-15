// TODO: guard RNSScreen for application which don't use react-navigation
#import "RNSScreen.h"
#import <Sentry/SentryFramesTracker.h>
#import <Sentry/SentryDependencyContainer.h>
#import <Sentry/SentrySwizzle.h>

#import "RNSentryDependencyContainer.h"

@implementation RNSScreen (SwizzlingRNSScreen)

+ (void)load {
  SEL selector = NSSelectorFromString(@"viewDidAppear:");
  SentrySwizzleInstanceMethod(RNSScreen.class, selector, SentrySWReturnType(void),
      SentrySWArguments(BOOL animated), SentrySWReplacement({
          [[[RNSentryDependencyContainer sharedInstance] framesTrackerListener] startListening];
          SentrySWCallOriginal(animated);
      }),
      SentrySwizzleModeOncePerClass, (void *)selector);
}

@end

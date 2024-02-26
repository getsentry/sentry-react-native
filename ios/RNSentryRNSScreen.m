// This guard prevents importing RNScreens if not installed
#if __has_include(<RNScreens/RNSScreen.h>)
#import <RNScreens/RNSScreen.h>

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
#endif

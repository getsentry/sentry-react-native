#import "RNSentryBreadcrumbConverter.h"

@import Sentry;

// TODO update after https://github.com/getsentry/sentry-cocoa/pull/4089
#if SENTRY_HAS_UIKIT && !TARGET_OS_VISION

@implementation RNSentryBreadcrumbConverter {
  SentrySRDefaultBreadcrumbConverter *defaultConverter;
}

- (instancetype _Nonnull)init {
  if (self = [super init]) {
    self->defaultConverter =
        [SentrySessionReplayIntegration createDefaultBreadcrumbConverter];
  }
  return self;
}

- (id<SentryRRWebEvent> _Nullable)convertFrom:
    (SentryBreadcrumb *_Nonnull)breadcrumb {
  assert(breadcrumb.timestamp != nil);

  if ([breadcrumb.category isEqualToString:@"touch"]) {
    return [SentrySessionReplayIntegration
        createBreadcrumbwithTimestamp:breadcrumb.timestamp
                             category:@"ui.tap"
                              message:breadcrumb.data
                                          ? [breadcrumb.data
                                                valueForKey:@"target"]
                                          : nil
                                level:breadcrumb.level
                                 data:breadcrumb.data];
  } else if ([breadcrumb.category isEqualToString:@"navigation"]) {
    return [SentrySessionReplayIntegration
        createBreadcrumbwithTimestamp:breadcrumb.timestamp ?: 0
                             category:breadcrumb.category
                              message:nil
                                level:breadcrumb.level
                                 data:breadcrumb.data];
  } else {
    return [self->defaultConverter convertFrom:breadcrumb];
  }
}

@end
#endif

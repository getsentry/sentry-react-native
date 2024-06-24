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

- (NSArray<SentryRRWebEvent *> *_Nonnull)
    convertWithBreadcrumbs:(NSArray<SentryBreadcrumb *> *_Nonnull)breadcrumbs
                      from:(NSDate *_Nonnull)from
                     until:(NSDate *_Nonnull)until {
  NSMutableArray<SentryRRWebEvent *> *outBreadcrumbs = [NSMutableArray array];
  for (SentryBreadcrumb *breadcrumb in breadcrumbs) {
    // - (NSComparisonResult)compare:(NSDate *)other;
    // If:
    // The receiver and `other` are exactly equal to each other, NSOrderedSame
    // The receiver is later in time than `other`, NSOrderedDescending
    // The receiver is earlier in time than `other`, NSOrderedAscending.
    if (!breadcrumb.timestamp ||
        [breadcrumb.timestamp compare:from] == NSOrderedAscending ||
        [breadcrumb.timestamp compare:until] == NSOrderedDescending) {
      continue;
    }

    SentryRRWebEvent *rrwebBreadcrumb = [self convertFrom:breadcrumb];
    if (rrwebBreadcrumb) {
      [outBreadcrumbs addObject:rrwebBreadcrumb];
    }
  }
  return outBreadcrumbs;
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

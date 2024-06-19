#import "RNSentryBreadcrumbConverter.h"

// TODO update after https://github.com/getsentry/sentry-cocoa/pull/4089
#if SENTRY_HAS_UIKIT && !TARGET_OS_VISION

@implementation RNSentryBreadcrumbConverter {
  SentrySRDefaultBreadcrumbConverter *defaultConverter;
}

- (instancetype _Nonnull)init {
  if (self = [super init]) {
    self->defaultConverter = [[SentrySRDefaultBreadcrumbConverter alloc] init];
  }
  return self;
}

- (NSArray<SentryRRWebEvent *> *_Nonnull)
    convertWithBreadcrumbs:(NSArray<SentryBreadcrumb *> *_Nonnull)breadcrumbs
                      from:(NSDate *_Nonnull)from
                     until:(NSDate *_Nonnull)until {
  NSMutableArray<SentryRRWebEvent *> *outBreadcrumbs = [NSMutableArray array];
  SentryRRWebEvent *rrwebBreadcrumb;
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

    if ([breadcrumb.category isEqualToString:@"touch"]) {
      rrwebBreadcrumb = [[SentryRRWebBreadcrumbEvent alloc]
          initWithTimestamp:breadcrumb.timestamp
                   category:@"ui.tap"
                    message:breadcrumb.data
                                ? [breadcrumb.data valueForKey:@"target"]
                                : nil
                      level:breadcrumb.level
                       data:breadcrumb.data];
    } else if ([breadcrumb.category isEqualToString:@"navigation"]) {
      rrwebBreadcrumb = [[SentryRRWebBreadcrumbEvent alloc]
          initWithTimestamp:breadcrumb.timestamp
                   category:breadcrumb.category
                    message:nil
                      level:breadcrumb.level
                       data:breadcrumb.data];
    } else {
      rrwebBreadcrumb = [self->defaultConverter convertFrom:breadcrumb];
    }

    if (rrwebBreadcrumb) {
      [outBreadcrumbs addObject:rrwebBreadcrumb];
    }
  }
  return outBreadcrumbs;
}

@end
#endif

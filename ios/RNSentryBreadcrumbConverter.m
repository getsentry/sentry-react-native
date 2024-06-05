#import "RNSentryBreadcrumbConverter.h"

@implementation RNSentryBreadcrumbConverter {
}

- (NSArray<SentryRRWebEvent *> *_Nonnull)
    convertWithBreadcrumbs:(NSArray<SentryBreadcrumb *> *_Nonnull)breadcrumbs
                      from:(NSDate *_Nonnull)from
                     until:(NSDate *_Nonnull)until {
  NSMutableArray<SentryRRWebEvent *> *outBreadcrumbs = [NSMutableArray array];
  for (SentryBreadcrumb *breadcrumb in breadcrumbs) {
    if (breadcrumb.timestamp &&
        [breadcrumb.timestamp compare:from] != NSOrderedAscending &&
        [breadcrumb.timestamp compare:until] != NSOrderedDescending) {
      if ([breadcrumb.category isEqualToString:@"touch"]) {
        SentryRRWebBreadcrumbEvent *rrwebBreadcrumb =
            [[SentryRRWebBreadcrumbEvent alloc]
                initWithTimestamp:breadcrumb.timestamp
                         category:@"ui.tap"
                          message:breadcrumb.data ? [breadcrumb.data valueForKey:@"target"] : nil
                            level:breadcrumb.level
                             data:breadcrumb.data];
        [outBreadcrumbs addObject:rrwebBreadcrumb];
      } else {
        // TODO delegate to the default breadcrumb converter
      }
    }
  }
  return outBreadcrumbs;
}

@end

#import "RNSentryBreadcrumbConverter.h"

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
    if (breadcrumb.timestamp &&
        [breadcrumb.timestamp compare:from] != NSOrderedAscending &&
        [breadcrumb.timestamp compare:until] != NSOrderedDescending) {
      if ([breadcrumb.category isEqualToString:@"touch"]) {
        rrwebBreadcrumb = [[SentryRRWebBreadcrumbEvent alloc]
            initWithTimestamp:breadcrumb.timestamp
                     category:@"ui.tap"
                      message:breadcrumb.data
                                  ? [breadcrumb.data valueForKey:@"target"]
                                  : nil
                        level:breadcrumb.level
                         data:breadcrumb.data];
      } else {
        rrwebBreadcrumb = [self->defaultConverter convertFrom:breadcrumb];
      }

      if (rrwebBreadcrumb) {
        [outBreadcrumbs addObject:rrwebBreadcrumb];
      }
    }
  }
  return outBreadcrumbs;
}

@end

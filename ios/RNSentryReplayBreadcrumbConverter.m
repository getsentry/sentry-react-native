#import "RNSentryReplayBreadcrumbConverter.h"

@import Sentry;

#if SENTRY_TARGET_REPLAY_SUPPORTED

@implementation RNSentryReplayBreadcrumbConverter {
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
    NSMutableString *message;
    if (breadcrumb.data) {
      NSMutableArray *path = [breadcrumb.data valueForKey:@"path"];
      if (path != nil) {
        message = [[NSMutableString alloc] init];
        for (NSInteger i = MIN(3, [path count] - 1); i >= 0; i--) {
          NSDictionary *item = [path objectAtIndex:i];
          [message appendString:[item objectForKey:@"name"]];
          if ([item objectForKey:@"element"] || [item objectForKey:@"file"]) {
            [message appendString:@"("];
            if ([item objectForKey:@"element"]) {
              [message appendString:[item objectForKey:@"element"]];
              if ([item objectForKey:@"file"]) {
                [message appendString:@", "];
                [message appendString:[item objectForKey:@"file"]];
              }
            } else if ([item objectForKey:@"file"]) {
              [message appendString:[item objectForKey:@"file"]];
            }
            [message appendString:@")"];
          }
          if (i > 0) {
            [message appendString:@" > "];
          }
        }
      }
    }
    return [SentrySessionReplayIntegration
        createBreadcrumbwithTimestamp:breadcrumb.timestamp
                             category:@"ui.tap"
                              message:message
                                level:breadcrumb.level
                                 data:breadcrumb.data];
  } else if ([breadcrumb.category isEqualToString:@"navigation"]) {
    return [SentrySessionReplayIntegration
        createBreadcrumbwithTimestamp:breadcrumb.timestamp
                             category:breadcrumb.category
                              message:nil
                                level:breadcrumb.level
                                 data:breadcrumb.data];
  } else {
    SentryRRWebEvent* nativeBreadcrumb = [self->defaultConverter convertFrom:breadcrumb];
      if ([nativeBreadcrumb.data[@"payload"][@"category"] isEqualToString:@"navigation"]) {
          return nil;
      }
      return nativeBreadcrumb;
  }
}

@end
#endif

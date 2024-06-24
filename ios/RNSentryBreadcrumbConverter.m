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
  } else if ([breadcrumb.category isEqualToString:@"http"]) {
    // Drop native network breadcrumbs to avoid duplicates
    return nil;
  } else if ([breadcrumb.category isEqualToString:@"xhr"]) {
    NSNumber* startTimestamp = [breadcrumb.data[@"start_timestamp"] isKindOfClass:[NSNumber class]]
      ? breadcrumb.data[@"start_timestamp"] : nil;
    NSNumber* endTimestamp = [breadcrumb.data[@"end_timestamp"] isKindOfClass:[NSNumber class]]
      ? breadcrumb.data[@"end_timestamp"] : nil;
    NSString* url = [breadcrumb.data[@"url"] isKindOfClass:[NSString class]]
      ? breadcrumb.data[@"url"] : nil;

    if (startTimestamp == nil || endTimestamp == nil || url == nil) {
      return nil;
    }

    NSMutableDictionary* data = [[NSMutableDictionary alloc] init];
    if ([breadcrumb.data[@"status_code"] isKindOfClass:[NSString class]]) {
      data[@"status_code"] = breadcrumb.data[@"status_code"];
    }
    if ([breadcrumb.data[@"method"] isKindOfClass:[NSString class]]) {
      data[@"method"] = breadcrumb.data[@"method"];
    }
    if ([breadcrumb.data[@"status_code"] isKindOfClass:[NSNumber class]]) {
      data[@"status_code"] = breadcrumb.data[@"status_code"];
    }
    if ([breadcrumb.data[@"request_body_size"] isKindOfClass:[NSNumber class]]) {
      data[@"request_content_length"] = breadcrumb.data[@"request_body_size"];
    }
    if ([breadcrumb.data[@"response_body_size"] isKindOfClass:[NSNumber class]]) {
      data[@"response_content_length"] = breadcrumb.data[@"response_body_size"];
    }

    return [SentrySessionReplayIntegration
            createNetworkBreadcrumbWithTimestamp:[NSDate dateWithTimeIntervalSince1970:(startTimestamp.doubleValue / 1000)]
            endTimestamp:[NSDate dateWithTimeIntervalSince1970:(endTimestamp.doubleValue / 1000)]
            operation:@"resource.http"
            description:url
            data:data];
  } else {
    return [self->defaultConverter convertFrom:breadcrumb];
  }
}

@end
#endif

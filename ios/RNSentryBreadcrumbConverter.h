@import Sentry;

@class SentryRRWebEvent;

@interface RNSentryBreadcrumbConverter
    : NSObject <SentryReplayBreadcrumbConverter>

- (NSArray<SentryRRWebEvent *> *_Nonnull)
    convertWithBreadcrumbs:(NSArray<SentryBreadcrumb *> *_Nonnull)breadcrumbs
                      from:(NSDate *_Nonnull)from
                     until:(NSDate *_Nonnull)until;

@end

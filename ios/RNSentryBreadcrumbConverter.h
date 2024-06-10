@import Sentry;

@class SentryRRWebEvent;

@interface RNSentryBreadcrumbConverter
    : NSObject <SentryReplayBreadcrumbConverter>

- (instancetype _Nonnull)init;

- (NSArray<SentryRRWebEvent *> *_Nonnull)
    convertWithBreadcrumbs:(NSArray<SentryBreadcrumb *> *_Nonnull)breadcrumbs
                      from:(NSDate *_Nonnull)from
                     until:(NSDate *_Nonnull)until;

@end

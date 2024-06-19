@import Sentry;

// TODO update after https://github.com/getsentry/sentry-cocoa/pull/4089
#if SENTRY_HAS_UIKIT && !TARGET_OS_VISION
@class SentryRRWebEvent;

@interface RNSentryBreadcrumbConverter
    : NSObject <SentryReplayBreadcrumbConverter>

- (instancetype _Nonnull)init;

- (NSArray<SentryRRWebEvent *> *_Nonnull)
    convertWithBreadcrumbs:(NSArray<SentryBreadcrumb *> *_Nonnull)breadcrumbs
                      from:(NSDate *_Nonnull)from
                     until:(NSDate *_Nonnull)until;

@end
#endif

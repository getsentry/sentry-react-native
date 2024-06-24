@import Sentry;

// TODO update after https://github.com/getsentry/sentry-cocoa/pull/4089
#if SENTRY_HAS_UIKIT && !TARGET_OS_VISION
@class SentryRRWebEvent;

@interface RNSentryBreadcrumbConverter
    : NSObject <SentryReplayBreadcrumbConverter>

- (instancetype _Nonnull)init;

@end
#endif

@import Sentry;

#if SENTRY_TARGET_REPLAY_SUPPORTED
@class SentryRRWebEvent;

@interface RNSentryReplayBreadcrumbConverter
    : NSObject <SentryReplayBreadcrumbConverter>

- (instancetype _Nonnull)init;

@end
#endif

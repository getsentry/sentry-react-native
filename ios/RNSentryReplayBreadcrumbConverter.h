@import Sentry;

#if SENTRY_TARGET_REPLAY_SUPPORTED
@class SentryRRWebEvent;

@interface RNSentryReplayBreadcrumbConverter
    : NSObject <SentryReplayBreadcrumbConverter>

- (instancetype _Nonnull)init;

+ (NSString* _Nullable) getTouchPathMessageFrom:(NSArray* _Nullable) path;

@end
#endif

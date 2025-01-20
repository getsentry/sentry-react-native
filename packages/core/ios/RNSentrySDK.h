#import <Sentry/Sentry.h>

@interface RNSentrySDK : NSObject
SENTRY_NO_INIT

/**
 * @experimental
 * Inits and configures Sentry for React Native applications. Make sure to
 * set a valid DSN.
 *
 * @discussion Call this method on the main thread. When calling it from a background thread, the
 * SDK starts on the main thread async.
 */
+ (void)startWithConfigureOptions:(void (^_Nullable)(SentryOptions *_Nonnull options))configureOptions
    NS_SWIFT_NAME(start(configureOptions:));

@end

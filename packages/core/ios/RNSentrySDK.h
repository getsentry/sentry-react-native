#import <Sentry/Sentry.h>

@interface RNSentrySDK : NSObject
SENTRY_NO_INIT

/**
 * @experimental
 * Inits and configures Sentry for React Native applications using `sentry.options.json`
 * configuration file.
 *
 * @discussion Call this method on the main thread. When calling it from a background thread, the
 * SDK starts on the main thread async.
 */
+ (void)start;

/**
 * @experimental
 * Inits and configures Sentry for React Native applicationsusing `sentry.options.json`
 * configuration file and `configureOptions` callback.
 *
 * The `configureOptions` callback can overwrite the config file options
 * and add non-serializable items to the options object.
 *
 * @discussion Call this method on the main thread. When calling it from a background thread, the
 * SDK starts on the main thread async.
 */
+ (void)startWithConfigureOptions:
    (void (^_Nullable)(SentryOptions *_Nonnull options))configureOptions
    NS_SWIFT_NAME(start(configureOptions:));

@end

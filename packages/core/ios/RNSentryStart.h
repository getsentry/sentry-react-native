#import <Sentry/SentryDefines.h>
#import <Sentry/SentryOptions.h>

@interface RNSentryStart : NSObject
SENTRY_NO_INIT

+ (void)startWithOptions:(NSDictionary *_Nonnull)javascriptOptions
                   error:(NSError *_Nullable *_Nullable)errorPointer;

+ (SentryOptions *_Nullable)createOptionsWithDictionary:(NSDictionary *_Nonnull)options
                                                  error:(NSError *_Nonnull *_Nonnull)errorPointer;

+ (void)updateWithReactDefaults:(SentryOptions *)options;
+ (void)updateWithReactFinals:(SentryOptions *)options;

/**
 * @experimental
 * Inits and configures Sentry for React Native applications. Make sure to
 * set a valid DSN.
 *
 * @discussion Call this method on the main thread. When calling it from a background thread, the
 * SDK starts on the main thread async.
 */
+ (void)startWithOptions:(SentryOptions *)options NS_SWIFT_NAME(start(options:));

@end

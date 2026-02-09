#import <Foundation/Foundation.h>
#import <React/RCTEventEmitter.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Singleton class that forwards native Sentry SDK logs to JavaScript via React Native events.
 * This allows React Native developers to see native SDK logs in the Metro console.
 */
@interface RNSentryNativeLogsForwarder : NSObject

/**
 * Returns the shared instance of the logs forwarder.
 */
+ (instancetype)shared;

/**
 * Configures the forwarder with the event emitter to use for sending events to JS.
 * Call this when the React Native module starts observing events.
 *
 * @param emitter The RCTEventEmitter instance (typically the RNSentry module).
 */
- (void)configureWithEventEmitter:(RCTEventEmitter *)emitter;

/**
 * Clears the event emitter reference.
 * Call this when the React Native module stops observing events.
 */
- (void)stopForwarding;

@end

NS_ASSUME_NONNULL_END

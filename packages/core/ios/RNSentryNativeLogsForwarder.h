#import <Foundation/Foundation.h>
#import <React/RCTEventEmitter.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Singleton class that forwards native Sentry SDK logs to JavaScript via React Native events.
 * This allows React Native developers to see native SDK logs in the Metro console.
 */
@interface RNSentryNativeLogsForwarder : NSObject

+ (instancetype)shared;

- (void)configureWithEventEmitter:(RCTEventEmitter *)emitter;

- (void)stopForwarding;

@end

NS_ASSUME_NONNULL_END

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^RNSentryJSThreadScheduler)(dispatch_block_t block);

/**
 * Reports the JS thread when it stays blocked, because no JS code can report it while it is
 * blocked.
 *
 * A native thread schedules an empty block on the JS thread and waits for it to run. When the block
 * does not run within the timeout, the tracker samples the JS stack with Hermes and captures an
 * error event.
 */
@interface RNSentryJSHangTracker : NSObject

+ (instancetype)sharedInstance;

/// Starts tracking, or restarts it with the new values when it already runs.
- (void)startWithTimeoutIntervalMs:(uint64_t)timeoutIntervalMs
                     bundleDebugId:(nullable NSString *)bundleDebugId
                scheduleOnJSThread:(RNSentryJSThreadScheduler)scheduleOnJSThread;

- (void)stop;

@end

NS_ASSUME_NONNULL_END

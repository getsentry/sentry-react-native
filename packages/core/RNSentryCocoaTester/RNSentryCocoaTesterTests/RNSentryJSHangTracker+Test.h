#import "RNSentryJSHangTracker.h"
#import <Foundation/Foundation.h>

@class SentryFrame;

NS_ASSUME_NONNULL_BEGIN

@interface RNSentryJSHangTracker (Testing)

+ (nullable NSData *)flamegraphFromHermesProfile:(nullable NSDictionary *)profile
                                     newestFirst:(BOOL)newestFirst
                                   bundleDebugId:(nullable NSString *)bundleDebugId;

+ (nullable SentryFrame *)frameFromHermesFrame:(NSDictionary *)hermesFrame;

+ (void)captureHangWithProfile:(nullable NSDictionary *)profile
                   newestFirst:(BOOL)newestFirst
             timeoutIntervalMs:(uint64_t)timeoutIntervalMs
                 bundleDebugId:(nullable NSString *)bundleDebugId
              attachFlamegraph:(BOOL)attachFlamegraph;

@end

NS_ASSUME_NONNULL_END

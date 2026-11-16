#import "RNSentryJSHangTracker.h"
#import <Foundation/Foundation.h>

@class SentryFrame;

NS_ASSUME_NONNULL_BEGIN

@interface RNSentryJSHangTracker (Testing)

+ (nullable NSData *)flamegraphFromHermesTrace:(NSData *)trace
                                   newestFirst:(BOOL)newestFirst
                                 bundleDebugId:(nullable NSString *)bundleDebugId;

+ (nullable SentryFrame *)frameFromHermesFrame:(NSDictionary *)hermesFrame;

@end

NS_ASSUME_NONNULL_END

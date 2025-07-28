#import <Foundation/Foundation.h>
#import <RNSentry/RNSentry.h>

@class SentryOptions;

#if CROSS_PLATFORM_TEST
@interface SentrySDKInternal : NSObject
#else
@interface
SentrySDK (Private)
#endif
+ (nullable SentryOptions *)options;
@end

#import <Foundation/Foundation.h>
#import <RNSentry/RNSentry.h>

@class SentryOptions;

#if CROSS_PLATFORM_TEST
@interface
SentrySDKInternal (PrivateTests)
#else
@interface
SentrySDK (PrivateTests)
#endif
+ (nullable SentryOptions *)options;
@end

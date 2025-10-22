#import <Foundation/Foundation.h>
#import <RNSentry/RNSentry.h>

@class SentryOptions;

@interface SentrySDKInternal (PrivateTests)

+ (nullable SentryOptions *)options;
@end

#import <Foundation/Foundation.h>
#import <RNSentry/RNSentry.h>
#import <Sentry/SentryFramesTracker.h>

@interface
SentrySDK (PrivateTests)
- (nullable SentryOptions *) options;
@end

@interface SentryDependencyContainer : NSObject
+ (instancetype)sharedInstance;
@property (nonatomic, strong) SentryFramesTracker *framesTracker;
@end

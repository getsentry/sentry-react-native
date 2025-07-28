#import "SentryFramesTracker.h"
#import <Foundation/Foundation.h>
#import <RNSentry/RNSentry.h>

@interface SentryDependencyContainer : NSObject
+ (instancetype)sharedInstance;
@property (nonatomic, strong) SentryFramesTracker *framesTracker;
@end

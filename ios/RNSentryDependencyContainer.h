#import <Sentry/SentryDefines.h>

#import "RNSentryFramesTrackerListener.h"

@interface RNSentryDependencyContainer : NSObject
SENTRY_NO_INIT

+ (instancetype)sharedInstance;

@property (nonatomic, strong) RNSentryFramesTrackerListener *framesTrackerListener;

@end


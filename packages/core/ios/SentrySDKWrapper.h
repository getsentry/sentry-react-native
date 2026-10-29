#import <Foundation/Foundation.h>

@class SentryEvent;
@class SentryScope;

@interface SentrySDKWrapper : NSObject

+ (void)configureScope:(void (^)(SentryScope *scope))callback;

+ (void)captureEvent:(SentryEvent *)event;

+ (void)crash;

+ (void)close;

+ (BOOL)crashedLastRun;

+ (void)pauseAppHangTracking;

+ (void)resumeAppHangTracking;

+ (void)startProfiler;

+ (void)stopProfiler;

+ (BOOL)debug;

+ (NSString *)releaseName;

@end

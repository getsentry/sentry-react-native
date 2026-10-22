#import <Foundation/Foundation.h>

@class SentryScope;

@interface SentrySDKWrapper : NSObject

+ (void)configureScope:(void (^)(SentryScope *scope))callback;

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

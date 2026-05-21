#import <Foundation/Foundation.h>

@class SentryScope;

@interface SentrySDKWrapper : NSObject

+ (void)configureScope:(void (^)(SentryScope *scope))callback;

+ (void)crash;

+ (void)close;

+ (BOOL)crashedLastRun;

+ (void)pauseAppHangTracking;

+ (void)resumeAppHangTracking;

+ (BOOL)debug;

+ (NSString *)releaseName;

@end

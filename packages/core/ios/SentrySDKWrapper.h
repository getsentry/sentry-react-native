#import <Foundation/Foundation.h>

@class SentryAttachment;
@class SentryEvent;
@class SentryScope;

@interface SentrySDKWrapper : NSObject

+ (void)configureScope:(void (^)(SentryScope *scope))callback;

+ (void)captureEvent:(SentryEvent *)event;

+ (void)captureEvent:(SentryEvent *)event attachment:(SentryAttachment *)attachment;

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

#import <Foundation/Foundation.h>

@class SentryScope;

@interface SentrySDKWrapper : NSObject

+ (void)configureScope:(void (^)(SentryScope *scope))callback;

+ (void)crash;

+ (void)close;

+ (BOOL)crashedLastRun;

+ (BOOL)debug;

+ (NSString *)releaseName;

@end

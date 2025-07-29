#import <Foundation/Foundation.h>

@class SentryOptions;
@class SentryScope;

@interface SentrySDKWrapper : NSObject

+ (void)configureScope:(void (^)(SentryScope *scope))callback;

+ (void)crash;

+ (void)close;

+ (BOOL)crashedLastRun;

+ (void)startWithOptions:(SentryOptions *)options;

@end

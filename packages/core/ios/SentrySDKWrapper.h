#import <Foundation/Foundation.h>

@class SentryOptions;
@class SentryScope;

@interface SentrySDKWrapper : NSObject

+ (void)configureScope:(void (^)(SentryScope *scope))callback;

+ (void)crash;

+ (void)close;

+ (BOOL)crashedLastRun;

+ (void)startWithOptions:(SentryOptions *)options;

+ (SentryOptions *)createOptionsWithDictionary:(NSDictionary *)options
                        isSessionReplayEnabled:(BOOL)isSessionReplayEnabled
                                         error:(NSError **)errorPointer;

+ (void)setupWithDictionary:(NSDictionary *)options
     isSessionReplayEnabled:(BOOL)isSessionReplayEnabled
                      error:(NSError **)errorPointer;

+ (BOOL)debug;

+ (NSString *)releaseName;

+ (BOOL)enableAutoSessionTracking;

+ (BOOL)enableWatchdogTerminationTracking;

@end

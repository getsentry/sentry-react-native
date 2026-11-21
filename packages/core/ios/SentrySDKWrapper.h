#import <Foundation/Foundation.h>

@class SentryBreadcrumb;
@class SentryEvent;
@class SentryScope;
@class SentryUser;

@interface SentrySDKWrapper : NSObject

+ (void)configureScope:(void (^)(SentryScope *scope))callback;

// Scope mutations for `.mm` callers. sentry-cocoa declares `SentryScope` in Swift, so
// Objective-C++ files only see a forward declaration and cannot message it directly.

+ (void)setUser:(SentryUser *)user;

+ (void)addBreadcrumb:(SentryBreadcrumb *)breadcrumb;

+ (void)clearBreadcrumbs;

+ (void)setExtraValue:(id)value forKey:(NSString *)key;

+ (void)setContextValue:(NSDictionary<NSString *, id> *)value forKey:(NSString *)key;

+ (void)removeContextForKey:(NSString *)key;

+ (void)setTagValue:(NSString *)value forKey:(NSString *)key;

+ (void)setAttributeValue:(id)value forKey:(NSString *)key;

+ (void)setAttributes:(NSDictionary<NSString *, id> *)attributes;

+ (void)removeAttributeForKey:(NSString *)key;

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

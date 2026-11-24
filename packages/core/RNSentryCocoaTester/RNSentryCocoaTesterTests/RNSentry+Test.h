#import <RNSentry/RNSentry.h>

@interface RNSentry (RNSentryInternal)

+ (SentryUser *_Nullable)userFrom:(NSDictionary *)userKeys
                    otherUserKeys:(NSDictionary *)userDataKeys;

+ (void)setTagOnScope:(SentryScope *)scope key:(NSString *)key value:(NSString *_Nullable)value;

+ (BOOL)captureReplayWithReturnValue;

+ (BOOL)turboModuleTrackingEnabledFromOptions:(NSDictionary *)options;

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
+ (BOOL)isPathUnderAllowedRootsForTesting:(NSString *)path;
#endif

@end

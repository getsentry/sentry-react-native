#import <RNSentry/RNSentry.h>

@interface RNSentry (RNSentryInternal)

+ (SentryUser *_Nullable)userFrom:(NSDictionary *)userKeys
                    otherUserKeys:(NSDictionary *)userDataKeys;

+ (BOOL)captureReplayWithReturnValue;

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
+ (BOOL)isPathUnderAllowedRootsForTesting:(NSString *)path;
#endif

@end

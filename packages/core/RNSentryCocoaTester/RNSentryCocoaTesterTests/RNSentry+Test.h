#import <RNSentry/RNSentry.h>

@interface
RNSentry (RNSentryInternal)

+ (SentryUser *_Nullable)userFrom:(NSDictionary *)userKeys
                    otherUserKeys:(NSDictionary *)userDataKeys;

@end

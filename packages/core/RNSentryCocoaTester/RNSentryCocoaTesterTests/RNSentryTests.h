#import <Foundation/Foundation.h>
#import <RNSentry/RNSentry.h>
#import <RNSentry/RNSentryReplay.h>

@class SentryUser;

@interface RNSentry (PrivateTests)

+ (SentryUser *_Nullable)userFrom:(NSDictionary *)userKeys
                    otherUserKeys:(NSDictionary *)userDataKeys;

@end

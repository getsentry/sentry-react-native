#import <Foundation/Foundation.h>
#import <RNSentry/RNSentry.h>

@class SentryOptions;
@class SentryUser;

@interface SentrySDKInternal (PrivateTests)

+ (nullable SentryOptions *)options;
@end

@interface RNSentry (PrivateTests)

+ (SentryUser *_Nullable)userFrom:(NSDictionary *)userKeys
                    otherUserKeys:(NSDictionary *)userDataKeys;

@end

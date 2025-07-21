#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, SentryReplayQuality);

@interface RNSentryReplayQuality : NSObject

+ (SentryReplayQuality)parseReplayQuality:(NSString *_Nullable)qualityString;

@end

NS_ASSUME_NONNULL_END

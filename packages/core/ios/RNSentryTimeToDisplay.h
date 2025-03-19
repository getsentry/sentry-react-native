#import <React/RCTBridgeModule.h>

@interface RNSentryTimeToDisplay : NSObject

+ (NSNumber *)popTimeToDisplayFor:(NSString *)screenId;
+ (void)putTimeToDisplayFor:(NSString *)screenId value:(NSNumber *)value;

- (void)getTimeToDisplay:(RCTResponseSenderBlock)callback;

@end

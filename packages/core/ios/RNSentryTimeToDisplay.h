#import <React/RCTBridgeModule.h>

@interface RNSentryTimeToDisplay : NSObject

+ (NSNumber *)popTimeToDisplayFor:(NSString *)screenId;
+ (void)putTimeToDisplayFor:(NSString *)screenId value:(NSNumber *)value;
+ (void)setActiveSpanId:(NSString *)spanId;
+ (void)putTimeToInitialDisplayForActiveSpan:(NSNumber *)timestampSeconds;

- (void)getTimeToDisplay:(RCTResponseSenderBlock)callback;

@end

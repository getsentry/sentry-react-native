#import <React/RCTBridgeModule.h>

static const int TIME_TO_DISPLAY_ENTRIES_MAX_SIZE = 50;

@interface RNSentryTimeToDisplay : NSObject

+ (NSNumber *)popTimeToDisplayFor:(NSString *)screenId;
+ (void)putTimeToDisplayFor:(NSString *)screenId value:(NSNumber *)value;
+ (void)setActiveSpanId:(NSString *)spanId;
+ (void)putTimeToInitialDisplayForActiveSpan:(NSNumber *)timestampSeconds;

- (void)getTimeToDisplay:(RCTResponseSenderBlock)callback;

@end

#import <React/RCTBridgeModule.h>

// Declared `extern` (not `static`) so it gets external linkage and can be
// referenced from Swift after RNSentry became a Swift-containing pod
// (see `RNSentryInternal.swift`). With `static const` the constant has
// internal linkage per translation unit and Swift's module import fails
// to resolve it, breaking `RNSentryTimeToDisplayTests.swift` with
// `Undefined symbol: _TIME_TO_DISPLAY_ENTRIES_MAX_SIZE` at link time.
extern const int TIME_TO_DISPLAY_ENTRIES_MAX_SIZE;

@interface RNSentryTimeToDisplay : NSObject

+ (NSNumber *)popTimeToDisplayFor:(NSString *)screenId;
+ (void)putTimeToDisplayFor:(NSString *)screenId value:(NSNumber *)value;
+ (void)setActiveSpanId:(NSString *)spanId;
+ (void)putTimeToInitialDisplayForActiveSpan:(NSNumber *)timestampSeconds;

- (void)getTimeToDisplay:(RCTResponseSenderBlock)callback;

@end

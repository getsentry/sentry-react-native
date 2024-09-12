#import <React/RCTBridgeModule.h>

@interface RNSentryTimeToDisplay : NSObject <RCTBridgeModule>

- (void)requestAnimationFrame:(RCTPromiseResolveBlock)resolve
                    rejecter:(RCTPromiseRejectBlock)reject;
@end

#import <React/RCTBridgeModule.h>

@interface RNSentryTimeToDisplayModule : NSObject <RCTBridgeModule>

- (void)requestAnimationFrame:(RCTPromiseResolveBlock)resolve
                    rejecter:(RCTPromiseRejectBlock)reject;

@end

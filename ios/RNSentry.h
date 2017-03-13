#import <React/RCTBridgeModule.h>
#import <React/RCTExceptionsManager.h>
#import <React/RCTRootView.h>

@interface RNSentry : NSObject <RCTBridgeModule, RCTExceptionsManagerDelegate>

+ (void)installWithRootView:(RCTRootView *)rootView;

@end

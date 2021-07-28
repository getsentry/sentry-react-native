#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#import <React/RCTEventEmitter.h>
#else
#import "RCTBridge.h"
#import "RCTEventEmitter.h"
#endif

@interface RNSentry : RCTEventEmitter<RCTBridgeModule>

@end

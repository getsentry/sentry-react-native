#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#else
#import "RCTBridge.h"
#endif

@interface RNSentry : NSObject <RCTBridgeModule>

@end

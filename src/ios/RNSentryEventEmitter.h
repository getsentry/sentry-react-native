#if __has_include(<React/RCTEventEmitter.h>)
#import <React/RCTEventEmitter.h>
#else
#import "RCTEventEmitter.h"
#endif
#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#else
#import "RCTBridge.h"
#endif

@interface RNSentryEventEmitter : RCTEventEmitter <RCTBridgeModule>

+ (void)emitStoredEvent;
+ (void)emitModuleTableUpdate:(NSDictionary *)moduleTable;

@end

#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#else
#import "RCTBridge.h"
#endif

#import <Sentry/SentryOptions.h>

@interface RNSentry : NSObject <RCTBridgeModule>

- (SentryOptions *_Nullable)createOptionsWithDictionary:(NSDictionary *_Nonnull)options
                                                  error:(NSError *_Nullable*_Nonnull)errorPointer;

- (void)setEventOriginTag:(SentryEvent *)event;

@end

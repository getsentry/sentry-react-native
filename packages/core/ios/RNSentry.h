#if __has_include(<React/RCTBridge.h>)
#    import <React/RCTBridge.h>
#else
#    import "RCTBridge.h"
#endif

#import <React/RCTEventEmitter.h>
#import <dlfcn.h>

#import <Sentry/Sentry.h>

typedef int (*SymbolicateCallbackType)(const void *, Dl_info *);

@class SentryOptions;
@class SentryEvent;

@interface SentrySDKInternal : NSObject
@property (nonatomic, nullable, readonly, class) SentryOptions *options;
@end

@interface RNSentry : RCTEventEmitter <RCTBridgeModule>

- (NSMutableDictionary *)prepareOptions:(NSDictionary *)options;

- (void)setEventOriginTag:(SentryEvent *)event;

@end

@interface RNSentry (fetchNativeStack)

- (NSDictionary *_Nonnull)fetchNativeStackFramesBy:(NSArray<NSNumber *> *)instructionsAddr
                                       symbolicate:(SymbolicateCallbackType)symbolicate;

@end

#if __has_include(<React/RCTBridge.h>)
#    import <React/RCTBridge.h>
#else
#    import "RCTBridge.h"
#endif

#import <React/RCTEventEmitter.h>
#import <dlfcn.h>

#import <Sentry/Sentry.h>
#import <Sentry/SentryDebugImageProvider.h>

typedef int (*SymbolicateCallbackType)(const void *, Dl_info *);

@class SentryOptions;
@class SentryEvent;

#if CROSS_PLATFORM_TEST
@interface SentrySDKInternal : NSObject
#else
@interface
SentrySDK (Private)
#endif
@property (nonatomic, nullable, readonly, class) SentryOptions *options;
@end

@interface RNSentry : RCTEventEmitter <RCTBridgeModule>

- (SentryOptions *_Nullable)createOptionsWithDictionary:(NSDictionary *_Nonnull)options
                                                  error:(NSError *_Nullable *_Nonnull)errorPointer;

- (void)setEventOriginTag:(SentryEvent *)event;

@end

@interface
RNSentry (fetchNativeStack)

- (NSDictionary *_Nonnull)fetchNativeStackFramesBy:(NSArray<NSNumber *> *)instructionsAddr
                                       symbolicate:(SymbolicateCallbackType)symbolicate;

@end

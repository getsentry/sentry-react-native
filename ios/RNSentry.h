#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#else
#import "RCTBridge.h"
#endif

#import <dlfcn.h>

#import <Sentry/Sentry.h>
#import <Sentry/SentryOptions.h>
#import <Sentry/SentryDebugImageProvider.h>

typedef int (*SymbolicateCallbackType)(const void *, Dl_info *);

@interface SentryDebugImageProvider ()
- (NSArray<SentryDebugMeta *> * _Nonnull)getDebugImagesForAddresses:(NSSet<NSString *> * _Nonnull)addresses isCrash:(BOOL)isCrash;
@end

@interface
SentrySDK (Private)
@property (nonatomic, nullable, readonly, class) SentryOptions *options;
@end

@interface RNSentry : NSObject <RCTBridgeModule>

- (SentryOptions *_Nullable)createOptionsWithDictionary:(NSDictionary *_Nonnull)options
                                                  error:(NSError *_Nullable*_Nonnull)errorPointer;

- (void) setEventOriginTag: (SentryEvent*) event;

- (NSDictionary*_Nonnull) fetchNativeStackFramesBy: (NSArray<NSNumber*>*)instructionsAddr
                                       symbolicate: (SymbolicateCallbackType) symbolicate;

@end

#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#else
#import "RCTBridge.h"
#endif

#import <Sentry/Sentry.h>
#import <Sentry/SentryOptions.h>
#import <Sentry/SentryDebugImageProvider.h>

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

- (void)setEventOriginTag:(SentryEvent *)event;

@end

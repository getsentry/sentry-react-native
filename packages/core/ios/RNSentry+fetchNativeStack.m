#import "RNSentry.h"
#import "RNSentryBreadcrumb.h"
#import "RNSentryId.h"
#import <Sentry/PrivateSentrySDKOnly.h>
#import <Sentry/SentryAppStartMeasurement.h>
#import <Sentry/SentryBreadcrumb.h>
#import <Sentry/SentryDebugImageProvider+HybridSDKs.h>
#import <Sentry/SentryDebugMeta.h>
#import <Sentry/SentryDependencyContainer.h>
#import <Sentry/SentryEvent.h>
#import <Sentry/SentryException.h>
#import <Sentry/SentryFormatter.h>
#import <Sentry/SentryOptions.h>
#import <Sentry/SentryUser.h>
@import Sentry;

// This method was moved to a new category so we can use `@import Sentry` to use Sentry's Swift
// classes
@implementation RNSentry (fetchNativeStack)

- (NSDictionary *)fetchNativeStackFramesBy:(NSArray<NSNumber *> *)instructionsAddr
                               symbolicate:(SymbolicateCallbackType)symbolicate
{
    BOOL shouldSymbolicateLocally = [SentrySDKInternal.options debug];

    NSString *appPackageName = [[NSBundle mainBundle] executablePath];

    NSMutableSet<NSString *> *_Nonnull imagesAddrToRetrieveDebugMetaImages =
        [[NSMutableSet alloc] init];
    NSMutableArray<NSDictionary<NSString *, id> *> *_Nonnull serializedFrames =
        [[NSMutableArray alloc] init];

    for (NSNumber *addr in instructionsAddr) {
        SentryBinaryImageInfo *_Nullable image = [[[SentryDependencyContainer sharedInstance]
            binaryImageCache] imageByAddress:[addr unsignedLongLongValue]];
        if (image != nil) {
            NSString *imageAddr = sentry_formatHexAddressUInt64([image address]);
            [imagesAddrToRetrieveDebugMetaImages addObject:imageAddr];

            NSDictionary<NSString *, id> *_Nonnull nativeFrame = @{
                @"platform" : @"cocoa",
                @"instruction_addr" : sentry_formatHexAddress(addr),
                @"package" : [image name],
                @"image_addr" : imageAddr,
                @"in_app" : [NSNumber numberWithBool:[appPackageName isEqualToString:[image name]]],
            };

            if (shouldSymbolicateLocally) {
                Dl_info symbolsBuffer;
                bool symbols_succeed = false;
                symbols_succeed
                    = symbolicate((void *)[addr unsignedLongLongValue], &symbolsBuffer) != 0;
                if (symbols_succeed) {
                    NSMutableDictionary<NSString *, id> *_Nonnull symbolicated
                        = nativeFrame.mutableCopy;
                    symbolicated[@"symbol_addr"]
                        = sentry_formatHexAddressUInt64((uintptr_t)symbolsBuffer.dli_saddr);
                    symbolicated[@"function"] = [NSString stringWithCString:symbolsBuffer.dli_sname
                                                                   encoding:NSUTF8StringEncoding];

                    nativeFrame = symbolicated;
                }
            }

            [serializedFrames addObject:nativeFrame];
        } else {
            [serializedFrames addObject:@{
                @"platform" : @"cocoa",
                @"instruction_addr" : sentry_formatHexAddress(addr),
            }];
        }
    }

    if (shouldSymbolicateLocally) {
        return @{
            @"frames" : serializedFrames,
        };
    } else {
        NSMutableArray<NSDictionary<NSString *, id> *> *_Nonnull serializedDebugMetaImages =
            [[NSMutableArray alloc] init];

        NSArray<SentryDebugMeta *> *debugMetaImages =
            [[[SentryDependencyContainer sharedInstance] debugImageProvider]
                getDebugImagesForImageAddressesFromCache:imagesAddrToRetrieveDebugMetaImages];

        for (SentryDebugMeta *debugImage in debugMetaImages) {
            [serializedDebugMetaImages addObject:[debugImage serialize]];
        }

        return @{
            @"frames" : serializedFrames,
            @"debugMetaImages" : serializedDebugMetaImages,
        };
    }
}

@end

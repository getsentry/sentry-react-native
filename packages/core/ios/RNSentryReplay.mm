#import "RNSentryReplay.h"
#if __has_include(<RNSentry/RNSentry-Swift.h>)
#    import <RNSentry/RNSentry-Swift.h>
#else
#    import "RNSentry-Swift.h"
#endif
#import "RNSentryReplayBreadcrumbConverterHelper.h"
#import "RNSentryReplayQuality.h"
#import "RNSentryVersion.h"
#import "Replay/RNSentryReplayMask.h"
#import "Replay/RNSentryReplayUnmask.h"

#if SENTRY_TARGET_REPLAY_SUPPORTED

@implementation RNSentryReplay {
}

+ (void)updateOptions:(NSMutableDictionary *)options
{
    NSNumber *sessionSampleRate = options[@"replaysSessionSampleRate"];
    NSNumber *errorSampleRate = options[@"replaysOnErrorSampleRate"];

    if (sessionSampleRate == nil && errorSampleRate == nil) {
        NSLog(@"Session replay disabled via configuration");
        return;
    }

    NSLog(@"Setting up session replay");
    NSDictionary *replayOptions = options[@"mobileReplayOptions"] ?: @{ };

    NSString *qualityString = options[@"replaysSessionQuality"];

    NSArray *includedViewClasses = replayOptions[@"includedViewClasses"];
    NSArray *excludedViewClasses = replayOptions[@"excludedViewClasses"];

    [options setValue:@{
        @"sessionSampleRate" : sessionSampleRate ?: [NSNull null],
        @"errorSampleRate" : errorSampleRate ?: [NSNull null],
        @"quality" : @([RNSentryReplayQuality parseReplayQuality:qualityString]),
        @"maskAllImages" : replayOptions[@"maskAllImages"] ?: [NSNull null],
        @"maskAllText" : replayOptions[@"maskAllText"] ?: [NSNull null],
        @"enableViewRendererV2" : replayOptions[@"enableViewRendererV2"] ?: [NSNull null],
        @"enableFastViewRendering" : replayOptions[@"enableFastViewRendering"] ?: [NSNull null],
        @"maskedViewClasses" : [RNSentryReplay getReplayRNRedactClasses:replayOptions],
        @"unmaskedViewClasses" : replayOptions[@"unmaskedViewClasses"] ?: [NSNull null],
        @"includedViewClasses" : includedViewClasses ?: [NSNull null],
        @"excludedViewClasses" : excludedViewClasses ?: [NSNull null],
        // Forwarded so the native SDK emits the rrweb options event that tells the
        // frontend to render captured request/response details. Network detail
        // capture itself happens in the JS layer for React Native.
        @"networkDetailAllowUrls" : replayOptions[@"networkDetailAllowUrls"] ?: [NSNull null],
        @"networkDetailDenyUrls" : replayOptions[@"networkDetailDenyUrls"] ?: [NSNull null],
        @"networkCaptureBodies" : replayOptions[@"networkCaptureBodies"] ?: [NSNull null],
        @"networkRequestHeaders" : replayOptions[@"networkRequestHeaders"] ?: [NSNull null],
        @"networkResponseHeaders" : replayOptions[@"networkResponseHeaders"] ?: [NSNull null],
        @"sdkInfo" :
            @ { @"name" : REACT_NATIVE_SDK_NAME, @"version" : REACT_NATIVE_SDK_PACKAGE_VERSION }
    }
               forKey:@"sessionReplay"];
}

+ (NSArray *_Nonnull)getReplayRNRedactClasses:(NSDictionary *_Nullable)replayOptions
{
    NSMutableArray *_Nonnull classesToRedact = [[NSMutableArray alloc] init];

    if ([replayOptions[@"maskAllVectors"] boolValue] == YES) {
        [classesToRedact addObject:@"RNSVGSvgView"];
    }
    if ([replayOptions[@"maskAllImages"] boolValue] == YES) {
        [classesToRedact addObject:@"RCTImageView"];
    }
    if ([replayOptions[@"maskAllText"] boolValue] == YES) {
        [classesToRedact addObject:@"RCTTextView"];
        [classesToRedact addObject:@"RCTParagraphComponentView"];
    }

    // Append user-supplied classes so per-class masking applies on top of the
    // maskAll* defaults. Class names are resolved via NSClassFromString by the
    // native SDK's SentryReplayOptions(dictionary:) initializer.
    id userMaskedViewClasses = replayOptions[@"maskedViewClasses"];
    if ([userMaskedViewClasses isKindOfClass:[NSArray class]]) {
        for (id className in userMaskedViewClasses) {
            if ([className isKindOfClass:[NSString class]]) {
                [classesToRedact addObject:className];
            }
        }
    }

    return classesToRedact;
}

+ (void)postInit
{
    // We can't import RNSentryReplayMask.h here because it's Objective-C++
    // To avoid typos, we test the class existence in the tests
    [RNSentryInternal setReplayRedactContainerClass:[RNSentryReplay getMaskClass]];
    [RNSentryInternal setReplayIgnoreContainerClass:[RNSentryReplay getUnmaskClass]];
    [RNSentryReplayBreadcrumbConverterHelper configureSessionReplayWithConverter];
}

+ (Class)getMaskClass
{
    return RNSentryReplayMask.class;
}

+ (Class)getUnmaskClass
{
    return RNSentryReplayUnmask.class;
}

@end
#endif

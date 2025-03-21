#import "RNSentryReplay.h"
#import "RNSentryReplayBreadcrumbConverterHelper.h"
#import "RNSentryVersion.h"
#import "React/RCTTextView.h"
#import "Replay/RNSentryReplayMask.h"
#import "Replay/RNSentryReplayUnmask.h"
#import <Sentry/PrivateSentrySDKOnly.h>

#if SENTRY_TARGET_REPLAY_SUPPORTED

@implementation RNSentryReplay {
}

+ (void)updateOptions:(NSMutableDictionary *)options
{
    if (options[@"replaysSessionSampleRate"] == nil
        && options[@"replaysOnErrorSampleRate"] == nil) {
        NSLog(@"Session replay disabled via configuration");
        return;
    }

    NSLog(@"Setting up session replay");
    NSDictionary *replayOptions = options[@"mobileReplayOptions"] ?: @{};

    [options setValue:@{
        @"sessionSampleRate" : options[@"replaysSessionSampleRate"] ?: [NSNull null],
        @"errorSampleRate" : options[@"replaysOnErrorSampleRate"] ?: [NSNull null],
        @"maskAllImages" : replayOptions[@"maskAllImages"] ?: [NSNull null],
        @"maskAllText" : replayOptions[@"maskAllText"] ?: [NSNull null],
        @"enableExperimentalViewRenderer" : replayOptions[@"enableExperimentalViewRenderer"]
            ?: [NSNull null],
        @"enableFastViewRendering" : replayOptions[@"enableFastViewRendering"] ?: [NSNull null],
        @"maskedViewClasses" : [RNSentryReplay getReplayRNRedactClasses:replayOptions],
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

    return classesToRedact;
}

+ (void)postInit
{
    // We can't import RNSentryReplayMask.h here because it's Objective-C++
    // To avoid typos, we test the class existence in the tests
    [PrivateSentrySDKOnly setRedactContainerClass:[RNSentryReplay getMaskClass]];
    [PrivateSentrySDKOnly setIgnoreContainerClass:[RNSentryReplay getUnmaskClass]];
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

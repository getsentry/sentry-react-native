#import "RNSentryReplay.h"
#import "RNSentryReplayBreadcrumbConverter.h"
#import "React/RCTTextView.h"

#if SENTRY_TARGET_REPLAY_SUPPORTED

@implementation RNSentryReplay {
}

+ (void)updateOptions:(NSMutableDictionary *)options
{
    NSDictionary *experiments = options[@"_experiments"];
    [options removeObjectForKey:@"_experiments"];
    if (experiments == nil) {
        NSLog(@"Session replay disabled via configuration");
        return;
    }

    if (experiments[@"replaysSessionSampleRate"] == nil
        && experiments[@"replaysOnErrorSampleRate"] == nil) {
        NSLog(@"Session replay disabled via configuration");
        return;
    }

    NSLog(@"Setting up session replay");
    NSDictionary *replayOptions = options[@"mobileReplayOptions"] ?: @{};

    [options setValue:@{
        @"sessionReplay" : @ {
            @"sessionSampleRate" : experiments[@"replaysSessionSampleRate"] ?: [NSNull null],
            @"errorSampleRate" : experiments[@"replaysOnErrorSampleRate"] ?: [NSNull null],
            @"maskAllImages" : replayOptions[@"maskAllImages"] ?: [NSNull null],
            @"maskAllText" : replayOptions[@"maskAllText"] ?: [NSNull null],
            @"maskedViewClasses" : [RNSentryReplay getReplayRNRedactClasses:replayOptions],
        }
    }
               forKey:@"experimental"];
}

+ (NSArray *_Nonnull)getReplayRNUnmaskClasses
{
    // We can't import RNSentryReplayUnmask.h here because it's Objective-C++
    // To avoid typos, we test the class existens in the tests
    return @[ @"RNSentryReplayUnmask" ];
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
    // To avoid typos, we test the class existens in the tests
    [PrivateSentrySDKOnly setRedactContainerClass:[self getMaskClass]];
    [PrivateSentrySDKOnly setIgnoreContainerClass:[self getUnmaskClass]];
    RNSentryReplayBreadcrumbConverter *breadcrumbConverter =
        [[RNSentryReplayBreadcrumbConverter alloc] init];
    [PrivateSentrySDKOnly configureSessionReplayWith:breadcrumbConverter screenshotProvider:nil];
}

+ (Class) getMaskClass
{
    return NSClassFromString(@"RNSentryReplayMask");
}

+ (Class) getUnmaskClass
{
    return NSClassFromString(@"RNSentryReplayUnmask");
}

@end
#endif

#import "RNSentryReplay.h"
#import "RNSentryReplayBreadcrumbConverter.h"

#if SENTRY_TARGET_REPLAY_SUPPORTED

@implementation RNSentryReplay {
}

+ (void)updateOptions:(NSMutableDictionary *)options {
  NSDictionary *experiments = options[@"_experiments"];
  [options removeObjectForKey:@"_experiments"];
  if (experiments == nil) {
    NSLog(@"Session replay disabled via configuration");
    return;
  }

  if (experiments[@"replaysSessionSampleRate"] == nil &&
      experiments[@"replaysOnErrorSampleRate"] == nil) {
    NSLog(@"Session replay disabled via configuration");
    return;
  }

  NSLog(@"Setting up session replay");
  NSDictionary *replayOptions = options[@"mobileReplayOptions"] ?: @{};

  [options setValue:@{
    @"sessionReplay" : @{
      @"sessionSampleRate" : experiments[@"replaysSessionSampleRate"]
          ?: [NSNull null],
      @"errorSampleRate" : experiments[@"replaysOnErrorSampleRate"]
          ?: [NSNull null],
      @"redactAllImages" : replayOptions[@"maskAllImages"] ?: [NSNull null],
      @"redactAllText" : replayOptions[@"maskAllText"] ?: [NSNull null],
    }
  }
             forKey:@"experimental"];

  [RNSentryReplay addReplayRNRedactClasses:replayOptions];
}

+ (void)addReplayRNRedactClasses:(NSDictionary *_Nullable)replayOptions {
  NSMutableArray *_Nonnull classesToRedact = [[NSMutableArray alloc] init];
  if ([replayOptions[@"maskAllVectors"] boolValue] == YES) {
    Class _Nullable maybeRNSVGViewClass = NSClassFromString(@"RNSVGSvgView");
    if (maybeRNSVGViewClass != nil) {
      [classesToRedact addObject:maybeRNSVGViewClass];
    }
  }
  if ([replayOptions[@"maskAllImages"] boolValue] == YES) {
    Class _Nullable maybeRCTImageClass = NSClassFromString(@"RCTImageView");
    if (maybeRCTImageClass != nil) {
      [classesToRedact addObject:maybeRCTImageClass];
    }
  }
  if ([replayOptions[@"maskAllText"] boolValue] == YES) {
    Class _Nullable maybeRCTTextClass = NSClassFromString(@"RCTTextView");
    if (maybeRCTTextClass != nil) {
      [classesToRedact addObject:maybeRCTTextClass];
    }
    Class _Nullable maybeRCTParagraphComponentViewClass = NSClassFromString(@"RCTParagraphComponentView");
    if (maybeRCTParagraphComponentViewClass != nil) {
        [classesToRedact addObject:maybeRCTParagraphComponentViewClass];
    }
  }
  [PrivateSentrySDKOnly addReplayRedactClasses:classesToRedact];
}

+ (void)postInit {
  RNSentryReplayBreadcrumbConverter *breadcrumbConverter =
      [[RNSentryReplayBreadcrumbConverter alloc] init];
  [PrivateSentrySDKOnly configureSessionReplayWith:breadcrumbConverter
                                screenshotProvider:nil];
}

@end
#endif

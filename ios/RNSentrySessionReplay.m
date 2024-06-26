#import "RNSentrySessionReplay.h"
#import "RNSentryBreadcrumbConverter.h"

#if SENTRY_TARGET_REPLAY_SUPPORTED

@implementation RNSentrySessionReplay {
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

  [RNSentrySessionReplay addReplayRNRedactClasses:replayOptions];
}

+ (void)addReplayRNRedactClasses:(NSDictionary *_Nullable)replayOptions {
  NSMutableArray *_Nonnull classesToRedact = [[NSMutableArray alloc] init];
  if ([replayOptions[@"maskAllImages"] boolValue] == YES) {
    [classesToRedact addObject:NSClassFromString(@"RCTImageView")];
  }
  if ([replayOptions[@"maskAllText"] boolValue] == YES) {
    [classesToRedact addObject:NSClassFromString(@"RCTTextView")];
  }
  [PrivateSentrySDKOnly addReplayRedactClasses:classesToRedact];
}

+ (void)postInit {
  RNSentryBreadcrumbConverter *breadcrumbConverter =
      [[RNSentryBreadcrumbConverter alloc] init];
  [PrivateSentrySDKOnly configureSessionReplayWith:breadcrumbConverter
                                screenshotProvider:nil];
}

@end
#endif

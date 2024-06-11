#import "RNSentrySessionReplay.h"
#import "RNSentryBreadcrumbConverter.h"

@implementation RNSentrySessionReplay {}

+ (void)setup {
  RNSentryBreadcrumbConverter *breadcrumbConverter =
      [[RNSentryBreadcrumbConverter alloc] init];
  [PrivateSentrySDKOnly configureSessionReplayWith:breadcrumbConverter
                                screenshotProvider:nil];
}

@end

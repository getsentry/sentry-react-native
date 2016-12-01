
#import "RNSentry.h"
@import SentrySwift;

@implementation RNSentry

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}
RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(startWithDsnString:(NSString *)dsnString)
{
	[SentryClient setLogLevel:SentryLogDebug];
	[SentryClient setShared:[[SentryClient alloc] initWithDsnString:dsnString]];
	[[SentryClient shared] startCrashHandler];
	[[SentryClient shared] captureMessage:@"Some plain message from react native" level:SentrySeverityInfo];
}

@end
  
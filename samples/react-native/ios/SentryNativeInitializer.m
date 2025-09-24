#import "SentryNativeInitializer.h"
@import Sentry;

@implementation SentryNativeInitializer

+ (void)initializeSentry
{
    [SentrySDK startWithConfigureOptions:^(SentryOptions *options) {
        // Only options set here will apply to the iOS SDK
        // Options from JS are not passed to the iOS SDK when initialized manually
        options.dsn = @"https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561";
        options.debug = YES; // Enabled debug when first installing is always helpful

        options.beforeSend = ^SentryEvent *(SentryEvent *event) {
            // We don't want to send an event after startup that came from a Unhandled JS Exception
            // of react native Because we sent it already before the app crashed.
            if (nil != event.exceptions.firstObject.type &&
                [event.exceptions.firstObject.type rangeOfString:@"Unhandled JS Exception"].location
                    != NSNotFound) {
                NSLog(@"Unhandled JS Exception");
                return nil;
            }

            return event;
        };

        // Enable the App start and Frames tracking measurements
        // If this is disabled the app start and frames tracking
        // won't be passed from native to JS transactions
        PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = true;
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
        PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = true;
#endif
    }];
}

@end

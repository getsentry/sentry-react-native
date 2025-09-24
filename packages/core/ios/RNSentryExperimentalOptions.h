#import <Foundation/Foundation.h>

@class SentryOptions;

NS_ASSUME_NONNULL_BEGIN

@interface RNSentryExperimentalOptions : NSObject

/**
 * Sets the enableUnhandledCPPExceptionsV2 experimental option on SentryOptions
 * @param sentryOptions The SentryOptions instance to configure
 * @param enabled Whether to enable unhandled C++ exceptions V2
 */
+ (void)setEnableUnhandledCPPExceptionsV2:(BOOL)enabled
                            sentryOptions:(SentryOptions *)sentryOptions;

/**
 * Gets the current value of enableUnhandledCPPExceptionsV2 experimental option
 * @param sentryOptions The SentryOptions instance to read from
 * @return The current value of enableUnhandledCPPExceptionsV2
 */
+ (BOOL)getEnableUnhandledCPPExceptionsV2:(SentryOptions *)sentryOptions;

/**
 * Sets the enableLogs experimental option on SentryOptions
 * @param sentryOptions The SentryOptions instance to configure
 * @param enabled Whether logs from sentry Cocoa should be enabled
 */
+ (void)setEnableLogs:(BOOL)enabled sentryOptions:(SentryOptions *)sentryOptions;

@end

NS_ASSUME_NONNULL_END

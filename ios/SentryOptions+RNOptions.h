#import "SentryOptions.h"

@interface SentryOptions (RNOptions)

/**
 * Init SentryOptions.
 * @param options React Native Options dictionary
 * @return SentryOptions
 */
- (_Nullable instancetype)initWithRNOptions:(NSDictionary<NSString *, id> *_Nonnull)options
                           didFailWithError:(NSError *_Nullable *_Nullable)error;

@end

#import <Foundation/Foundation.h>
#import <Sentry/Sentry.h>

@interface RNSentryIgnoreErrors : NSObject <SentryEventProcessor>

- (instancetype)initWithIgnoredErrors:(NSArray<NSString *> *)ignoredErrors;

@end

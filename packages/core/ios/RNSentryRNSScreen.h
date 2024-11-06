#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import <Foundation/Foundation.h>

@interface RNSentryRNSScreen : NSObject

+ (void)swizzleViewDidAppear;

@end

#endif

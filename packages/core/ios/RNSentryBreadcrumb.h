#import <Foundation/Foundation.h>
#import <Sentry/SentryDefines.h>
#import <Sentry/SentryScope.h>

@class SentryBreadcrumb;

@interface RNSentryBreadcrumb : NSObject

+ (SentryBreadcrumb *)from:(NSDictionary *)dict;

+ (NSString *_Nullable)getCurrentScreenFrom:(NSDictionary *)dict;

@end

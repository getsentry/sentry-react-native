#import <Foundation/Foundation.h>

@class SentryBreadcrumb;

@interface RNSentryBreadcrumb : NSObject

+ (SentryBreadcrumb *)from: (NSDictionary *) dict;

@end

#import "RNSentryReplayBreadcrumbConverter.h"

@import Sentry;

#if SENTRY_TARGET_REPLAY_SUPPORTED

@implementation RNSentryReplayBreadcrumbConverter {
    SentrySRDefaultBreadcrumbConverter *defaultConverter;
}

- (instancetype _Nonnull)init
{
    if (self = [super init]) {
        self->defaultConverter = [SentrySessionReplayIntegration createDefaultBreadcrumbConverter];
    }
    return self;
}

- (id<SentryRRWebEvent> _Nullable)convertFrom:(SentryBreadcrumb *_Nonnull)breadcrumb
{
    assert(breadcrumb.timestamp != nil);

    if ([breadcrumb.category isEqualToString:@"sentry.event"] ||
        [breadcrumb.category isEqualToString:@"sentry.transaction"]) {
        // Do not add Sentry Event breadcrumbs to replay
        return nil;
    }

    if ([breadcrumb.category isEqualToString:@"http"]) {
        // Drop native network breadcrumbs to avoid duplicates
        return nil;
    }

    if ([breadcrumb.category isEqualToString:@"touch"]) {
        return [self convertTouch:breadcrumb];
    }

    if ([breadcrumb.category isEqualToString:@"navigation"]) {
        return [SentrySessionReplayIntegration createBreadcrumbwithTimestamp:breadcrumb.timestamp
                                                                    category:breadcrumb.category
                                                                     message:nil
                                                                       level:breadcrumb.level
                                                                        data:breadcrumb.data];
    }

    if ([breadcrumb.category isEqualToString:@"xhr"]) {
        return [self convertNavigation:breadcrumb];
    }

    SentryRRWebEvent *nativeBreadcrumb = [self->defaultConverter convertFrom:breadcrumb];

    // ignore native navigation breadcrumbs
    if (nativeBreadcrumb && nativeBreadcrumb.data && nativeBreadcrumb.data[@"payload"]
        && nativeBreadcrumb.data[@"payload"][@"category"] &&
        [nativeBreadcrumb.data[@"payload"][@"category"] isEqualToString:@"navigation"]) {
        return nil;
    }

    return nativeBreadcrumb;
}

- (id<SentryRRWebEvent> _Nullable)convertTouch:(SentryBreadcrumb *_Nonnull)breadcrumb
{
    if (breadcrumb.data == nil) {
        return nil;
    }

    NSMutableArray *path = [breadcrumb.data valueForKey:@"path"];
    NSString *message = [RNSentryReplayBreadcrumbConverter getTouchPathMessageFrom:path];

    return [SentrySessionReplayIntegration createBreadcrumbwithTimestamp:breadcrumb.timestamp
                                                                category:@"ui.tap"
                                                                 message:message
                                                                   level:breadcrumb.level
                                                                    data:breadcrumb.data];
}

+ (NSString *_Nullable)getTouchPathMessageFrom:(NSArray *_Nullable)path
{
    if (path == nil) {
        return nil;
    }

    NSInteger pathCount = [path count];
    if (pathCount <= 0) {
        return nil;
    }

    NSMutableString *message = [[NSMutableString alloc] init];
    for (NSInteger i = MIN(3, pathCount - 1); i >= 0; i--) {
        NSDictionary *item = [path objectAtIndex:i];
        if (item == nil) {
            return nil; // There should be no nil (undefined) from JS, but to be safe we check it
                        // here
        }

        id name = [item objectForKey:@"name"];
        id label = [item objectForKey:@"label"];
        BOOL hasName = [name isKindOfClass:[NSString class]];
        BOOL hasLabel = [label isKindOfClass:[NSString class]];
        if (!hasName && !hasLabel) {
            return nil; // This again should never be allowed in JS, but to be safe we check it here
        }
        if (hasLabel) {
            [message appendString:(NSString *)label];
        } else if (hasName) {
            [message appendString:(NSString *)name];
        }

        id element = [item objectForKey:@"element"];
        id file = [item objectForKey:@"file"];
        BOOL hasElement = [element isKindOfClass:[NSString class]];
        BOOL hasFile = [file isKindOfClass:[NSString class]];
        if (hasElement && hasFile) {
            [message appendFormat:@"(%@, %@)", (NSString *)element, (NSString *)file];
        } else if (hasElement) {
            [message appendFormat:@"(%@)", (NSString *)element];
        } else if (hasFile) {
            [message appendFormat:@"(%@)", (NSString *)file];
        }

        if (i > 0) {
            [message appendString:@" > "];
        }
    }

    return message;
}

- (id<SentryRRWebEvent> _Nullable)convertNavigation:(SentryBreadcrumb *_Nonnull)breadcrumb
{
    NSNumber *startTimestamp = [breadcrumb.data[@"start_timestamp"] isKindOfClass:[NSNumber class]]
        ? breadcrumb.data[@"start_timestamp"]
        : nil;
    NSNumber *endTimestamp = [breadcrumb.data[@"end_timestamp"] isKindOfClass:[NSNumber class]]
        ? breadcrumb.data[@"end_timestamp"]
        : nil;
    NSString *url =
        [breadcrumb.data[@"url"] isKindOfClass:[NSString class]] ? breadcrumb.data[@"url"] : nil;

    if (startTimestamp == nil || endTimestamp == nil || url == nil) {
        return nil;
    }

    NSMutableDictionary *data = [[NSMutableDictionary alloc] init];
    if ([breadcrumb.data[@"method"] isKindOfClass:[NSString class]]) {
        data[@"method"] = breadcrumb.data[@"method"];
    }
    if ([breadcrumb.data[@"status_code"] isKindOfClass:[NSNumber class]]) {
        data[@"statusCode"] = breadcrumb.data[@"status_code"];
    }
    if ([breadcrumb.data[@"request_body_size"] isKindOfClass:[NSNumber class]]) {
        data[@"requestBodySize"] = breadcrumb.data[@"request_body_size"];
    }
    if ([breadcrumb.data[@"response_body_size"] isKindOfClass:[NSNumber class]]) {
        data[@"responseBodySize"] = breadcrumb.data[@"response_body_size"];
    }

    return [SentrySessionReplayIntegration
        createNetworkBreadcrumbWithTimestamp:[NSDate
                                                 dateWithTimeIntervalSince1970:(startTimestamp
                                                                                       .doubleValue
                                                                                   / 1000)]
                                endTimestamp:[NSDate
                                                 dateWithTimeIntervalSince1970:(endTimestamp
                                                                                       .doubleValue
                                                                                   / 1000)]
                                   operation:@"resource.http"
                                 description:url
                                        data:data];
}

@end

#endif

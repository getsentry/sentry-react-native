#import "SentryOptions.h"
#import "SentryDsn.h"
#import "SentryLog.h"
#import "SentryMeta.h"
#import "SentrySdkInfo.h"
#import "SentryOptions+RNOptions.h"

@implementation SentryOptions (RNOptions)


- (_Nullable instancetype)initWithRNOptions:(NSDictionary<NSString *, id> *)options
                      didFailWithError:(NSError *_Nullable *_Nullable)error
{
    if (self = [self init]) {
        if (![self validateOptions:options didFailWithError:error]) {
            [SentryLog
                logWithMessage:[NSString stringWithFormat:@"Failed to initialize: %@", *error]
                      andLevel:kSentryLevelError];
            return nil;
        }
    }
    return self;
}

/**
 * Populates all `SentryOptions` values from `options` dict using fallbacks/defaults if needed.
 */
- (BOOL)validateOptions:(NSDictionary<NSString *, id> *)options
       didFailWithError:(NSError *_Nullable *_Nullable)error
{
    __weak __block SentryOptions* _self = self;

    NSPredicate *isNSString = [NSPredicate predicateWithBlock:^BOOL(
        id object, NSDictionary *bindings) { return [object isKindOfClass:[NSString class]]; }];

    [self setBool:options[@"debug"] block:^(BOOL value) { _self.debug = value; }];

    NSString *dsn = @"";
    if (nil != options[@"dsn"] && [options[@"dsn"] isKindOfClass:[NSString class]]) {
        dsn = options[@"dsn"];
    }

    self.parsedDsn = [[SentryDsn alloc] initWithString:dsn didFailWithError:error];

    if ([options[@"release"] isKindOfClass:[NSString class]]) {
        self.releaseName = options[@"release"];
    }

    if ([options[@"environment"] isKindOfClass:[NSString class]]) {
        self.environment = options[@"environment"];
    }

    if ([options[@"dist"] isKindOfClass:[NSString class]]) {
        self.dist = options[@"dist"];
    }

    [self setBool:options[@"enabled"] block:^(BOOL value) { _self.enabled = value; }];

    [self setBool:options[@"enableCrashHandler"]
            block:^(BOOL value) { _self.enableCrashHandler = value; }];

    if ([options[@"maxBreadcrumbs"] isKindOfClass:[NSNumber class]]) {
        self.maxBreadcrumbs = [options[@"maxBreadcrumbs"] unsignedIntValue];
    }

    [self setBool:options[@"enableNetworkBreadcrumbs"]
            block:^(BOOL value) { _self.enableNetworkBreadcrumbs = value; }];

    if ([options[@"maxCacheItems"] isKindOfClass:[NSNumber class]]) {
        self.maxCacheItems = [options[@"maxCacheItems"] unsignedIntValue];
    }

    if ([options[@"integrations"] isKindOfClass:[NSArray class]]) {
        self.integrations = [options[@"integrations"] filteredArrayUsingPredicate:isNSString];
    }

    if ([options[@"sampleRate"] isKindOfClass:[NSNumber class]]) {
        self.sampleRate = options[@"sampleRate"];
    }

    [self setBool:options[@"enableAutoSessionTracking"]
            block:^(BOOL value) { _self.enableAutoSessionTracking = value; }];

    [self setBool:options[@"enableOutOfMemoryTracking"]
            block:^(BOOL value) { _self.enableOutOfMemoryTracking = value; }];

    if ([options[@"sessionTrackingIntervalMillis"] isKindOfClass:[NSNumber class]]) {
        self.sessionTrackingIntervalMillis =
            [options[@"sessionTrackingIntervalMillis"] unsignedIntValue];
    }

    [self setBool:options[@"attachStacktrace"]
            block:^(BOOL value) { _self.attachStacktrace = value; }];

    [self setBool:options[@"stitchAsyncCode"]
            block:^(BOOL value) { _self.stitchAsyncCode = value; }];

    if ([options[@"maxAttachmentSize"] isKindOfClass:[NSNumber class]]) {
        self.maxAttachmentSize = [options[@"maxAttachmentSize"] unsignedIntValue];
    }

    [self setBool:options[@"sendDefaultPii"]
            block:^(BOOL value) { _self.sendDefaultPii = value; }];

    [self setBool:options[@"enableAutoPerformanceTracking"]
            block:^(BOOL value) { _self.enableAutoPerformanceTracing = value; }];

    [self setBool:options[@"enableCaptureFailedRequests"]
            block:^(BOOL value) { _self.enableCaptureFailedRequests = value; }];

#if SENTRY_HAS_UIKIT
    [self setBool:options[@"enableUIViewControllerTracking"]
            block:^(BOOL value) { _self.enableUIViewControllerTracing = value; }];

    [self setBool:options[@"attachScreenshot"]
            block:^(BOOL value) { _self.attachScreenshot = value; }];

    [self setBool:options[@"attachViewHierarchy"]
            block:^(BOOL value) { _self.attachViewHierarchy = value; }];

    [self setBool:options[@"enableUserInteractionTracing"]
            block:^(BOOL value) { _self.enableUserInteractionTracing = value; }];

    if ([options[@"idleTimeout"] isKindOfClass:[NSNumber class]]) {
        self.idleTimeout = [options[@"idleTimeout"] doubleValue];
    }

    [self setBool:options[@"enablePreWarmedAppStartTracking"]
            block:^(BOOL value) { _self.enablePreWarmedAppStartTracing = value; }];
#endif

    [self setBool:options[@"enableAppHangTracking"]
            block:^(BOOL value) { _self.enableAppHangTracking = value; }];

    if ([options[@"appHangTimeoutInterval"] isKindOfClass:[NSNumber class]]) {
        self.appHangTimeoutInterval = [options[@"appHangTimeoutInterval"] doubleValue];
    }

    [self setBool:options[@"enableNetworkTracking"]
            block:^(BOOL value) { _self.enableNetworkTracking = value; }];

    [self setBool:options[@"enableFileIOTracking"]
            block:^(BOOL value) { _self.enableFileIOTracing = value; }];

    if ([options[@"tracesSampleRate"] isKindOfClass:[NSNumber class]]) {
        self.tracesSampleRate = options[@"tracesSampleRate"];
    }

    if ([options[@"urlSessionDelegate"] conformsToProtocol:@protocol(NSURLSessionDelegate)]) {
        self.urlSessionDelegate = options[@"urlSessionDelegate"];
    }

    [self setBool:options[@"enableSwizzling"]
            block:^(BOOL value) { _self.enableSwizzling = value; }];

    [self setBool:options[@"enableCoreDataTracking"]
            block:^(BOOL value) { _self.enableCoreDataTracing = value; }];

#if SENTRY_TARGET_PROFILING_SUPPORTED
    if ([options[@"profilesSampleRate"] isKindOfClass:[NSNumber class]]) {
        self.profilesSampleRate = options[@"profilesSampleRate"];
    }
#endif

    [self setBool:options[@"sendClientReports"]
            block:^(BOOL value) { _self.sendClientReports = value; }];

    [self setBool:options[@"enableAutoBreadcrumbTracking"]
            block:^(BOOL value) { _self.enableAutoBreadcrumbTracking = value; }];

    if ([options[@"tracePropagationTargets"] isKindOfClass:[NSArray class]]) {
        self.tracePropagationTargets = options[@"tracePropagationTargets"];
    }

    if ([options[@"failedRequestStatusCodes"] isKindOfClass:[NSArray class]]) {
        self.failedRequestStatusCodes = options[@"failedRequestStatusCodes"];
    }

    if ([options[@"failedRequestTargets"] isKindOfClass:[NSArray class]]) {
        self.failedRequestTargets = options[@"failedRequestTargets"];
    }

    // SentrySdkInfo already expects a dictionary with {"sdk": {"name": ..., "value": ...}}
    // so we're passing the whole options object.
    // Note: we should remove this code once the hybrid SDKs move over to the new
    // PrivateSentrySDKOnly setter functions.
    if ([options[@"sdk"] isKindOfClass:[NSDictionary class]]) {
        SentrySdkInfo *defaults = [[SentrySdkInfo alloc] initWithName:SentryMeta.sdkName
                                                           andVersion:SentryMeta.versionString];
        SentrySdkInfo *sdkInfo = [[SentrySdkInfo alloc] initWithDict:options orDefaults:defaults];
        SentryMeta.versionString = sdkInfo.version;
        SentryMeta.sdkName = sdkInfo.name;
    }

    if (nil != error && nil != *error) {
        return NO;
    } else {
        return YES;
    }
}

- (void)setBool:(id)value block:(void (^)(BOOL))block
{
    // Entries in the dictionary can be NSNull. Especially, on React-Native, this can happen.
    if (value != nil && ![value isEqual:[NSNull null]]) {
        block([value boolValue]);
    }
}

@end

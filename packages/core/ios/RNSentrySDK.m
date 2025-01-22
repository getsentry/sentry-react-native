#import "RNSentrySDK.h"
#import "RNSentryStart.h"

static NSString *SENTRY_OPTIONS_RESOURCE_NAME = @"sentry.options";
static NSString *SENTRY_OPTIONS_RESOURCE_TYPE = @"json";

@implementation RNSentrySDK

+ (void)start
{
    [self startWithConfigureOptions:nil];
}

+ (void)startWithConfigureOptions:(void (^)(SentryOptions *options))configureOptions
{
    NSString *path = [[NSBundle mainBundle] pathForResource:SENTRY_OPTIONS_RESOURCE_NAME
                                                     ofType:SENTRY_OPTIONS_RESOURCE_TYPE];

    [self start:path configureOptions:configureOptions];
}

+ (void)start:(NSString *)path configureOptions:(void (^)(SentryOptions *options))configureOptions
{
    NSError *readError = nil;
    NSError *parseError = nil;
    NSError *optionsError = nil;

    NSData *_Nullable content = nil;
    if (path != nil) {
        content = [NSData dataWithContentsOfFile:path options:0 error:&readError];
    }

    NSDictionary *dict = nil;
    if (content != nil) {
        dict = [NSJSONSerialization JSONObjectWithData:content options:0 error:&parseError];
    }

    if (readError != nil) {
        NSLog(@"[RNSentry] Failed to load options from %@, with error: %@", path,
            readError.localizedDescription);
    }

    if (parseError != nil) {
        NSLog(@"[RNSentry] Failed to parse JSON from %@, with error: %@", path,
            parseError.localizedDescription);
    }

    SentryOptions *options = nil;
    if (dict != nil) {
        options = [RNSentryStart createOptionsWithDictionary:dict error:&optionsError];
    }

    if (optionsError != nil) {
        NSLog(@"[RNSentry] Failed to parse options from %@, with error: %@", path,
            optionsError.localizedDescription);
    }

    if (options == nil) {
        // Fallback in case that options file could not be parsed.
        options = [[SentryOptions alloc] init];
    }

    [RNSentryStart updateWithReactDefaults:options];
    if (configureOptions != nil) {
        configureOptions(options);
    }
    [RNSentryStart updateWithReactFinals:options];
    [RNSentryStart startWithOptions:options];
}

@end

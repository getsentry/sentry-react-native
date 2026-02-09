#import "RNSentryNativeLogsForwarder.h"

@import Sentry;

static NSString *const RNSentryNativeLogEventName = @"SentryNativeLog";

@interface RNSentryNativeLogsForwarder ()

@property (nonatomic, weak) RCTEventEmitter *eventEmitter;

@end

@implementation RNSentryNativeLogsForwarder

+ (instancetype)shared
{
    static RNSentryNativeLogsForwarder *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ instance = [[RNSentryNativeLogsForwarder alloc] init]; });
    return instance;
}

- (void)configureWithEventEmitter:(RCTEventEmitter *)emitter
{
    self.eventEmitter = emitter;

    __weak RNSentryNativeLogsForwarder *weakSelf = self;

    // Set up the Sentry SDK log output to forward logs to JS
    [SentrySDKLog setOutput:^(NSString *_Nonnull message) {
        // Always print to console (default behavior)
        NSLog(@"%@", message);

        // Forward to JS if we have an emitter
        RNSentryNativeLogsForwarder *strongSelf = weakSelf;
        if (strongSelf) {
            [strongSelf forwardLogMessage:message];
        }
    }];

    // Send a test log to verify the forwarding works
    [self forwardLogMessage:@"[Sentry] [info] [0] [RNSentryNativeLogsForwarder] Native log forwarding "
                            @"configured successfully"];
}

- (void)stopForwarding
{
    self.eventEmitter = nil;

    // Reset to default print behavior
    [SentrySDKLog setOutput:^(NSString *_Nonnull message) { NSLog(@"%@", message); }];
}

- (void)forwardLogMessage:(NSString *)message
{
    RCTEventEmitter *emitter = self.eventEmitter;
    if (emitter == nil) {
        return;
    }

    // Only forward messages that look like Sentry SDK logs
    if (![message hasPrefix:@"[Sentry]"]) {
        return;
    }

    // Parse the log message to extract level and component
    // Format: "[Sentry] [level] [timestamp] [Component:line] message"
    // or: "[Sentry] [level] [timestamp] message"
    NSString *level = [self extractLevelFromMessage:message];
    NSString *component = [self extractComponentFromMessage:message];
    NSString *cleanMessage = [self extractCleanMessageFromMessage:message];

    NSDictionary *body = @{
        @"level" : level,
        @"component" : component,
        @"message" : cleanMessage,
    };

    // Dispatch async to avoid blocking the calling thread and potential deadlocks
    dispatch_async(dispatch_get_main_queue(), ^{
        RCTEventEmitter *currentEmitter = self.eventEmitter;
        if (currentEmitter != nil) {
            [currentEmitter sendEventWithName:RNSentryNativeLogEventName body:body];
        }
    });
}

- (NSString *)extractLevelFromMessage:(NSString *)message
{
    // Look for patterns like [debug], [info], [warning], [error], [fatal]
    NSRegularExpression *regex =
        [NSRegularExpression regularExpressionWithPattern:@"\\[(debug|info|warning|error|fatal)\\]"
                                                  options:NSRegularExpressionCaseInsensitive
                                                    error:nil];

    NSTextCheckingResult *match = [regex firstMatchInString:message
                                                    options:0
                                                      range:NSMakeRange(0, message.length)];

    if (match && match.numberOfRanges > 1) {
        return [[message substringWithRange:[match rangeAtIndex:1]] lowercaseString];
    }

    return @"info";
}

- (NSString *)extractComponentFromMessage:(NSString *)message
{
    // Look for pattern like [ComponentName:123]
    NSRegularExpression *regex =
        [NSRegularExpression regularExpressionWithPattern:@"\\[([A-Za-z]+):\\d+\\]"
                                                  options:0
                                                    error:nil];

    NSTextCheckingResult *match = [regex firstMatchInString:message
                                                    options:0
                                                      range:NSMakeRange(0, message.length)];

    if (match && match.numberOfRanges > 1) {
        return [message substringWithRange:[match rangeAtIndex:1]];
    }

    return @"Sentry";
}

- (NSString *)extractCleanMessageFromMessage:(NSString *)message
{
    // Remove the prefix parts: [Sentry] [level] [timestamp] [Component:line]
    // and return just the actual message content
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:
            @"^\\[Sentry\\]\\s*\\[[^\\]]+\\]\\s*\\[[^\\]]+\\]\\s*(?:\\[[^\\]]+\\]\\s*)?"
                                                                           options:0
                                                                             error:nil];

    NSString *cleanMessage = [regex stringByReplacingMatchesInString:message
                                                             options:0
                                                               range:NSMakeRange(0, message.length)
                                                        withTemplate:@""];

    return [cleanMessage stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
}

@end

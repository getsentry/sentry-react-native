#import "RNSentryIgnoreErrors.h"

@interface
RNSentryIgnoreErrors ()
@property (nonatomic, strong) NSArray<NSRegularExpression *> *ignorePatterns;
@end

@implementation RNSentryIgnoreErrors

- (instancetype)initWithIgnoredErrors:(NSArray<NSString *> *)ignoredErrors
{
    self = [super init];
    if (self) {
        NSMutableArray *patterns = [NSMutableArray array];
        for (NSString *pattern in ignoredErrors) {
            NSError *error = nil;
            NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:pattern
                                                                                   options:0
                                                                                     error:&error];
            if (regex) {
                [patterns addObject:regex];
            }
        }
        self.ignorePatterns = patterns;
    }
    return self;
}

- (SentryEvent *_Nullable)processEvent:(SentryEvent *)event hint:(SentryHint *)hint
{
    for (SentryException *exception in event.exceptions) {
        if ([self shouldIgnore:exception.value]) {
            return nil;
        }
    }
    if ([self shouldIgnore:event.message.formatted]) {
        return nil;
    }
    return event;
}

- (BOOL)shouldIgnore:(NSString *)message
{
    if (!message)
        return NO;
    for (NSRegularExpression *regex in self.ignorePatterns) {
        NSRange range = NSMakeRange(0, message.length);
        if ([regex firstMatchInString:message options:0 range:range]) {
            return YES;
        }
    }
    return NO;
}

@end

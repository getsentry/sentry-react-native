
#import "RNSentry.h"
#import "RCTConvert.h"
#import "RCTBridge.h"

@import SentrySwift;

@implementation RNSentry

@synthesize bridge = _bridge;

+ (NSNumberFormatter *)numberFormatter {
    static dispatch_once_t onceToken;
    static NSNumberFormatter *formatter = nil;
    dispatch_once(&onceToken, ^{
        formatter = [NSNumberFormatter new];
        formatter.numberStyle = NSNumberFormatterNoStyle;
    });
    return formatter;
}

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

- (BOOL)eventDispatcherWillDispatchEvent:(id<RCTEvent>)event {
    NSLog(@"%@", event);
    return NO;
}

RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(startWithDsnString:(NSString * _Nonnull)dsnString)
{
    [SentryClient setShared:[[SentryClient alloc] initWithDsnString:dsnString]];
    [[SentryClient shared] startCrashHandler];
    [self.bridge.eventDispatcher addDispatchObserver:self];
}

RCT_EXPORT_METHOD(captureMessage:(NSString * _Nonnull)message level:(int)level)
{
    [[SentryClient shared] captureMessage:message level:level];
}

RCT_EXPORT_METHOD(setLogLevel:(int)level)
{
    [SentryClient setLogLevel:level];
}

RCT_EXPORT_METHOD(setExtras:(NSDictionary * _Nonnull)extras)
{
    [SentryClient shared].extra = extras;
}

RCT_EXPORT_METHOD(setTags:(NSDictionary * _Nonnull)tags)
{
    [SentryClient shared].tags = [self sanitizeDictionary:tags];
}

RCT_EXPORT_METHOD(crash)
{
    [[SentryClient shared] crash];
}

RCT_EXPORT_METHOD(captureEvent:(NSDictionary * _Nonnull)event)
{
    NSArray <Frame *>*frames = nil;
    Stacktrace *stacktrace = nil;
    
    if (event[@"stacktrace"]) {
        frames = SentryParseJavaScriptStacktrace([RCTConvert NSString:event[@"stacktrace"]]);
        stacktrace = [[Stacktrace alloc] initWithFrames:[self convertFramesToObject:frames]];
    }
    
    Event *eventToSend = [[Event alloc] init:[RCTConvert NSString:event[@"errorMessage"]]
                                   timestamp:[NSDate date]
                                       level:SentrySeverityFatal
                                      logger:nil
                                     culprit:nil
                                  serverName:nil
                                     release:nil
                                        tags:nil
                                     modules:nil
                                       extra:nil
                                 fingerprint:nil
                                        user:nil
                                  exceptions:nil
                                  stacktrace:stacktrace];
    
    [[SentryClient shared] captureEvent:eventToSend];
}

- (NSArray <Frame *>*)convertFramesToObject:(NSArray *)frames {
    NSMutableArray <Frame *> *frameObjects = [NSMutableArray array];
    for (NSDictionary *frame in frames) {
        if ([frame[@"file"] isEqualToString:@"[native code]"] || nil == frame[@"function"]) {
            continue;
        }
        Frame *newFrame = [[Frame alloc] initWithFile:[NSString stringWithFormat:@"%@", frame[@"file"]]
                                             function:[NSString stringWithFormat:@"%@", frame[@"function"]]
                                               module:@"module"
                                                 line:[frame[@"lineNumber"] integerValue]];
        newFrame.platform = @"javascript";
        [frameObjects addObject:newFrame];
    }
    return frameObjects;
}

- (NSDictionary *)sanitizeDictionary:(NSDictionary *)dictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    for (NSString *key in dictionary.allKeys) {
        [dict setObject:[NSString stringWithFormat:@"%@", [dictionary objectForKey:key]] forKey:key];
    }
    return [NSDictionary dictionaryWithDictionary:dict];
}

NSArray *SentryParseJavaScriptStacktrace(NSString *stacktrace) {
    NSNumberFormatter *formatter = [RNSentry numberFormatter];
    NSCharacterSet *methodSeparator = [NSCharacterSet characterSetWithCharactersInString:@"@"];
    NSCharacterSet *locationSeparator = [NSCharacterSet characterSetWithCharactersInString:@":"];
    NSArray *lines = [stacktrace componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
    NSMutableArray *frames = [NSMutableArray arrayWithCapacity:lines.count];
    for (NSString *line in lines) {
        NSMutableDictionary *frame = [NSMutableDictionary new];
        NSString *location = line;
        NSRange methodRange = [line rangeOfCharacterFromSet:methodSeparator];
        if (methodRange.location != NSNotFound) {
            frame[@"function"] = [line substringToIndex:methodRange.location];
            location = [line substringFromIndex:methodRange.location + 1];
        }
        search = [location rangeOfCharacterFromSet:locationSeparator options:NSBackwardsSearch];
        if (search.location != NSNotFound) {
            NSRange matchRange = NSMakeRange(search.location + 1, location.length - search.location - 1);
            NSNumber *value = [formatter numberFromString:[location substringWithRange:matchRange]];
            if (value) {
                frame[@"lineNumber"] = value;
                location = [location substringToIndex:search.location];
            }
        }
        NSString *bundlePath = [[NSBundle mainBundle] bundlePath];
        if (bundlePath) {
            search = [location rangeOfString:bundlePath];
            if (search.location != NSNotFound)
                location = [location substringFromIndex:search.location + search.length + 1];
        }
        frame[@"file"] = location;
        [frames addObject:frame];
    }
    return frames;
}

@end


#import "RNSentry.h"
#import "RCTConvert.h"
@import SentrySwift;

@implementation RNSentry

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
RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(startWithDsnString:(NSString * _Nonnull)dsnString)
{
    [SentryClient setShared:[[SentryClient alloc] initWithDsnString:dsnString]];
    [[SentryClient shared] startCrashHandler];
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

RCT_EXPORT_METHOD(captureEvent:(NSDictionary * _Nonnull)event)
{
    NSArray *stacktrace = nil;

    if (event[@"stacktrace"]) {
        stacktrace = SentryParseJavaScriptStacktrace([RCTConvert NSString:event[@"stacktrace"]],
                                                   [RNSentry numberFormatter]);

        NSLog(@"%@", stacktrace);
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

- (NSDictionary *)sanitizeDictionary:(NSDictionary *)dictionary {
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    for (NSString *key in dictionary.allKeys) {
        [dict setObject:[NSString stringWithFormat:@"%@", [dictionary objectForKey:key]] forKey:key];
    }
    return [NSDictionary dictionaryWithDictionary:dict];
}

NSArray *SentryParseJavaScriptStacktrace(NSString *stacktrace, NSNumberFormatter *formatter) {
    NSCharacterSet *methodSeparator = [NSCharacterSet characterSetWithCharactersInString:@"@"];
    NSCharacterSet *locationSeparator = [NSCharacterSet characterSetWithCharactersInString:@":"];
    NSArray *lines = [stacktrace componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
    NSMutableArray *frames = [NSMutableArray arrayWithCapacity:lines.count];
    for (NSString *line in lines) {
        NSMutableDictionary *frame = [NSMutableDictionary new];
        NSString *location = line;
        NSRange methodRange = [line rangeOfCharacterFromSet:methodSeparator];
        if (methodRange.location != NSNotFound) {
            frame[@"method"] = [line substringToIndex:methodRange.location];
            location = [line substringFromIndex:methodRange.location + 1];
        }
        NSRange search = [location rangeOfCharacterFromSet:locationSeparator options:NSBackwardsSearch];
        if (search.location != NSNotFound) {
            NSRange matchRange = NSMakeRange(search.location + 1, location.length - search.location - 1);
            NSNumber *value = [formatter numberFromString:[location substringWithRange:matchRange]];
            if (value) {
                frame[@"columnNumber"] = value;
                location = [location substringToIndex:search.location];
            }
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
  
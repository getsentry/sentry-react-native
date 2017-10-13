//
//  RNSentryEventEmitter.m
//  RNSentry
//
//  Created by Daniel Griesser on 25/04/2017.
//  Copyright © 2017 Facebook. All rights reserved.
//

#import "RNSentryEventEmitter.h"

NSString *const kEventSentSuccessfully = @"Sentry/eventSentSuccessfully";
NSString *const kEventStored = @"Sentry/eventStored";
NSString *const kModuleTable = @"Sentry/moduleTable";

@implementation RNSentryEventEmitter

RCT_EXPORT_MODULE();

- (NSDictionary<NSString *, NSString *> *)constantsToExport {
    return @{
             @"EVENT_SENT_SUCCESSFULLY": kEventSentSuccessfully,
             @"EVENT_STORED": kEventStored,
             @"MODULE_TABLE": kModuleTable
             };
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[kEventSentSuccessfully, kEventStored, kModuleTable];
}


- (void)startObserving {
    for (NSString *event in [self supportedEvents]) {
        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(handleNotification:)
                                                     name:event
                                                   object:nil];
    }
}

- (void)stopObserving {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

+ (void)emitStoredEvent {
    [self postNotificationName:kEventStored withPayload:@""];
}

+ (void)emitModuleTableUpdate:(NSDictionary *)moduleTable {
    if (![NSJSONSerialization isValidJSONObject:moduleTable]) {
        return;
    }
    NSError *error = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:moduleTable
                                                       options:0
                                                         error:&error];
    if (nil == error) {
        [self postNotificationName:kModuleTable withPayload:[[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding]];
    }
}

+ (void)postNotificationName:(NSString *)name withPayload:(NSObject *)object {
    NSDictionary<NSString *, id> *payload = @{@"payload": object};

    [[NSNotificationCenter defaultCenter] postNotificationName:name
                                                        object:self
                                                      userInfo:payload];
}

- (void)handleNotification:(NSNotification *)notification {
    [self sendEventWithName:notification.name body:notification.userInfo];
}

@end
